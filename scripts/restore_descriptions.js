// Restore full event descriptions that were truncated at ingest.
//
// Background: many events.description values in Supabase were cut mid-sentence
// when the archive was first imported (e.g. "...As the ar", "...internal lib").
// The full text survives in the public-site scrape at
// recovery/data/processed/events.ndjson (fields description_html /
// description_text), keyed by legacy_id. The legacy_id is embedded in each
// event's detail path: events/YYYY-MM-DD-<legacyId>-<slug>.html.
//
// This script is DRY-RUN by default: it reads events (public, anon key), finds
// rows whose stored description is a truncated prefix of the reference, and
// writes a human-review report plus a restore SQL file under reports/. It does
// NOT write to the database unless you run it with --apply AND provide
// SUPABASE_SERVICE_ROLE_KEY (UPDATE needs the service role past RLS).
//
//   node scripts/restore_descriptions.js                 # dry-run, all events
//   node scripts/restore_descriptions.js --since 2026-01-01   # scope by date
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore_descriptions.js --apply
//
// Events newer than the scrape (not in the ndjson) are reported separately so
// they can be backfilled from the live site (thevisualist.org) in a later pass.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const ANON_KEY = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const NDJSON = path.join(__dirname, '..', 'recovery', 'data', 'processed', 'events.ndjson');
const OUT_DIR = path.join(__dirname, '..', 'reports');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const INCLUDE_DIVERGENT = args.includes('--include-divergent');
const sinceArg = args.indexOf('--since');
const SINCE = sinceArg >= 0 ? args[sinceArg + 1] : null;

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeClient = () => createClient(SUPABASE_URL, serviceKey);
const readClient = () => createClient(SUPABASE_URL, ANON_KEY);

// --- text helpers -----------------------------------------------------------

const decodeEntities = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

// plain-text projection used only for truncation comparison
const toPlain = html => decodeEntities(String(html || '')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim();

// WordPress "Official Website"/"Official Link" tails are a scrape artifact, not
// part of the body copy — drop them from the restored text.
const stripOfficialTail = s => s
  .replace(/\s*(<a[^>]*>)?\s*Official\s+(Website|Link|Site)\s*(<\/a>)?\s*$/i, '')
  .trim();

// sanitize the scraped description_html down to the site's allowed markup
// (the submit editor produces p / strong / em / u / s / a / ul-ol-li).
const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li']);
const sanitizeHtml = raw => {
  let html = String(raw || '');
  // scraped WordPress copy carries Unicode line/paragraph separators (U+2028/
  // U+2029), NEL, and stray control chars; drop them so they never land in the
  // DB or SQL (Supabase's editor flags them, and they can break JS string
  // literals / rendering)
  html = html
    .replace(/[\u2028\u2029\u0085]/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  // unwrap the WordPress body container if present
  const m = html.match(/<div class="event-single-body">([\s\S]*?)<\/div>\s*$/i);
  if (m) html = m[1];
  html = stripOfficialTail(html);
  // strip tags not in the allowlist; for allowed tags keep only href on <a>
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return '';
    if (full[1] === '/') return `</${t}>`;
    if (t === 'a') {
      const href = (attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i));
      return href ? `<a href="${href[1]}" target="_blank" rel="noopener">` : '<a>';
    }
    return `<${t}>`;
  });
  // collapse the scrape's tabs / runs of blank lines, drop empty paragraphs
  return html
    .replace(/[\t ]+/g, ' ')
    .replace(/(\s*<p>\s*<\/p>\s*)+/gi, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim();
};

// fold case, curly quotes, dashes, nbsp and whitespace for prefix comparison
const norm = s => String(s || '').toLowerCase()
  .replace(/[‘’‚‛]/g, "'")
  .replace(/[“”„]/g, '"')
  .replace(/[–—−]/g, '-')
  .replace(/ /g, ' ')
  .replace(/\s+/g, '');

const legacyIdFromPath = p => {
  const m = String(p || '').match(/events\/\d{4}-\d{2}-\d{2}-(\d+)-/);
  return m ? m[1] : null;
};

// newer events carry events/DATE-<id>-<slug>.html; the older archive stores a
// bare slug as the path. Reduce both to the trailing slug so we can match the
// reference by slug when there's no legacy id.
const slugFromPath = p => {
  const s = String(p || '').replace(/\.html$/, '').replace(/^events\//, '');
  const m = s.match(/^\d{4}-\d{2}-\d{2}-\d+-(.+)$/);
  return m ? m[1] : s;
};

// --- main -------------------------------------------------------------------

async function main() {
  if (APPLY && !serviceKey) {
    console.error('--apply needs SUPABASE_SERVICE_ROLE_KEY in the environment. Aborting.');
    process.exit(1);
  }

  console.log('Loading reference scrape:', NDJSON);
  const ref = new Map();          // legacy_id -> record
  const slugCount = new Map();     // slug -> count (to drop ambiguous slugs)
  const refBySlug = new Map();     // slug -> record (unique slugs only)
  for (const line of fs.readFileSync(NDJSON, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (d.legacy_id) ref.set(String(d.legacy_id), d);
    if (d.slug) {
      slugCount.set(d.slug, (slugCount.get(d.slug) || 0) + 1);
      refBySlug.set(d.slug, d);
    }
  }
  // a slug that maps to more than one event is ambiguous — don't risk it
  for (const [slug, n] of slugCount) if (n > 1) refBySlug.delete(slug);
  const lookup = ev => {
    const id = legacyIdFromPath(ev.path);
    if (id && ref.has(id)) return ref.get(id);
    return refBySlug.get(slugFromPath(ev.path)) || null;
  };
  console.log(`Reference: ${ref.size} by id, ${refBySlug.size} by unique slug`);

  const supabase = readClient();
  let all = [];
  let start = 0;
  const limit = 1000;
  while (true) {
    // stable order is required — without it PostgREST .range() pagination
    // returns overlapping/missing rows and the counts wobble between runs
    let q = supabase.from('events').select('id, path, title, description')
      .order('id', { ascending: true }).range(start, start + limit - 1);
    if (SINCE) q = q.gte('event_date', SINCE);
    const { data, error } = await q;
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    all = all.concat(data);
    if (data.length < limit) break;
    start += limit;
  }
  console.log(`Fetched ${all.length} events from Supabase${SINCE ? ` (since ${SINCE})` : ''}.`);

  const clean = [];      // current is a prefix of the fuller reference — safe
  const additive = [];   // current isn't a prefix but is fully contained in the
                         // scrape (header prepended / body reformatted) — safe
  const conflict = [];   // current has content the scrape lacks (e.g. CANCELED)
                         // — hold for manual review
  const missingFromScrape = [];
  let unmatched = 0;

  for (const ev of all) {
    const r = lookup(ev);
    if (!r) {
      unmatched++;
      if (toPlain(ev.description).length < 400) missingFromScrape.push({ id: ev.id, path: ev.path, title: ev.title });
      continue;
    }
    const fullHtml = sanitizeHtml(r.description_html || r.description_text || '');
    const curPlain = toPlain(ev.description);
    const fullPlain = toPlain(fullHtml);
    if (fullPlain.length <= curPlain.length + 10) continue; // current already full/longer — keep it
    const rec = { id: ev.id, legacyId: r.legacy_id, title: ev.title, oldLen: curPlain.length, newLen: fullPlain.length, html: fullHtml };
    // fold quotes/dashes/nbsp/whitespace/case so a genuine truncation with minor
    // encoding drift between DB and scrape still reads as a clean prefix
    const curN = norm(curPlain), fullN = norm(fullPlain);
    const isPrefix = !curN || fullN.startsWith(curN.slice(0, Math.max(20, curN.length - 5)));
    // additive: everything the DB says still appears verbatim in the scrape, so
    // applying it only adds (a prepended header, reflowed body); a conflict is
    // where the DB carries words the scrape dropped (an edit like CANCELED)
    const isContained = curN.length > 30 && fullN.includes(curN);
    if (isPrefix || isContained) (isPrefix ? clean : additive).push(rec);
    else conflict.push(rec);
  }
  const byGain = (a, b) => (b.newLen - b.oldLen) - (a.newLen - a.oldLen);
  clean.sort(byGain); additive.sort(byGain); conflict.sort(byGain);
  // clean + additive are both safe to apply; --include-divergent also applies
  // the conflicts (only do this if you've reviewed restore_conflicts.sql)
  const updates = INCLUDE_DIVERGENT ? clean.concat(additive, conflict) : clean.concat(additive);
  const sqlFor = list => list.map(u => `UPDATE events SET description = '${u.html.replace(/'/g, "''")}' WHERE id = '${u.id}';`).join('\n') + '\n';

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = [
    '# Description restore — dry run',
    `Scope: ${SINCE ? `events since ${SINCE}` : 'all events'}`,
    `Supabase events scanned: ${all.length}`,
    `Clean (current is a prefix of the fuller text — safe): ${clean.length}`,
    `Additive (current fully contained in the scrape — safe): ${additive.length}`,
    `Conflict (current has content the scrape lacks — HOLD, review): ${conflict.length}`,
    `Not in scrape & short (live-site backfill candidates): ${missingFromScrape.length}`,
    `Unmatched to reference (skipped): ${unmatched}`,
    `Apply set this run (${INCLUDE_DIVERGENT ? 'clean + additive + conflict' : 'clean + additive'}): ${updates.length}`,
    '',
    '## Additive (safe to apply — largest gain first)',
    ...additive.slice(0, 50).map(u => `- ${u.legacyId} **${u.title}** — ${u.oldLen} → ${u.newLen} chars`),
    additive.length > 50 ? `… and ${additive.length - 50} more (see restore_additive.sql).` : '',
    '',
    '## Conflict — review before applying (current has words the scrape dropped)',
    ...conflict.slice(0, 60).map(u => `- ${u.legacyId} **${u.title}** — ${u.oldLen} → ${u.newLen} chars`),
    conflict.length > 60 ? `… and ${conflict.length - 60} more (see restore_conflicts.sql).` : '',
    '',
    '## Missing from scrape (backfill from thevisualist.org)',
    ...missingFromScrape.slice(0, 60).map(m => `- ${m.title} (${m.path})`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'description_restore_report.md'), md);
  fs.writeFileSync(path.join(OUT_DIR, 'restore_descriptions.sql'), '-- Clean truncations (safe)\n' + sqlFor(clean));
  fs.writeFileSync(path.join(OUT_DIR, 'restore_additive.sql'), '-- Additive: scrape adds to current, nothing lost (safe)\n' + sqlFor(additive));
  fs.writeFileSync(path.join(OUT_DIR, 'restore_conflicts.sql'), '-- Conflicts: current has content the scrape lacks — REVIEW each before running\n' + sqlFor(conflict));

  console.log(`\nClean: ${clean.length} | additive: ${additive.length} | conflict: ${conflict.length} | missing: ${missingFromScrape.length} | unmatched: ${unmatched}`);
  console.log(`Apply set: ${updates.length} (${INCLUDE_DIVERGENT ? 'clean+additive+conflict' : 'clean+additive'})`);
  console.log(`Report: reports/description_restore_report.md`);
  console.log(`SQL: restore_descriptions.sql, restore_additive.sql, restore_conflicts.sql`);

  if (APPLY) {
    console.log(`\n--apply: writing ${updates.length} descriptions to Supabase...`);
    const db = writeClient();
    let done = 0;
    for (const u of updates) {
      const { error } = await db.from('events').update({ description: u.html }).eq('id', u.id);
      if (error) { console.error(`  ${u.id} failed:`, error.message); continue; }
      if (++done % 100 === 0) console.log(`  ${done}/${updates.length}`);
    }
    console.log(`Applied ${done}/${updates.length}.`);
  }
}

main();
