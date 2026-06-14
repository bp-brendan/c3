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
  const divergent = [];  // reference is longer but current isn't its prefix — review
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
    (isPrefix ? clean : divergent).push(rec);
  }
  clean.sort((a, b) => (b.newLen - b.oldLen) - (a.newLen - a.oldLen));
  divergent.sort((a, b) => (b.newLen - b.oldLen) - (a.newLen - a.oldLen));
  // for a canonical DB we want every post complete; --include-divergent also
  // applies the cases where the scrape is fuller but text diverged from current
  const updates = INCLUDE_DIVERGENT ? clean.concat(divergent) : clean;
  const sqlFor = list => list.map(u => `UPDATE events SET description = '${u.html.replace(/'/g, "''")}' WHERE id = '${u.id}';`).join('\n') + '\n';

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = [
    '# Description restore — dry run',
    `Scope: ${SINCE ? `events since ${SINCE}` : 'all events'}`,
    `Supabase events scanned: ${all.length}`,
    `Clean truncations (current is a prefix of the fuller text — safe to apply): ${clean.length}`,
    `Divergent (scrape fuller but text differs — review before applying): ${divergent.length}`,
    `Not in scrape & short (live-site backfill candidates): ${missingFromScrape.length}`,
    `Unmatched to reference (skipped): ${unmatched}`,
    `Apply set this run (${INCLUDE_DIVERGENT ? 'clean + divergent' : 'clean only'}): ${updates.length}`,
    '',
    '## Clean truncations (largest gain first)',
    ...clean.slice(0, 50).map(u => `- ${u.legacyId} **${u.title}** — ${u.oldLen} → ${u.newLen} chars`),
    clean.length > 50 ? `… and ${clean.length - 50} more (see restore_descriptions.sql).` : '',
    '',
    '## Divergent — review these (current differs from scrape)',
    ...divergent.slice(0, 40).map(u => `- ${u.legacyId} **${u.title}** — ${u.oldLen} → ${u.newLen} chars`),
    divergent.length > 40 ? `… and ${divergent.length - 40} more (see restore_divergent.sql).` : '',
    '',
    '## Sample before/after (clean, top 3)',
    ...clean.slice(0, 3).flatMap(u => [
      `### ${u.legacyId} ${u.title}`,
      `OLD (${u.oldLen}): ${all.find(e => e.id === u.id).description?.slice(0, 280) || ''}`,
      `NEW (${u.newLen}): ${u.html.slice(0, 400)}`,
      ''
    ]),
    '## Missing from scrape (backfill from thevisualist.org)',
    ...missingFromScrape.slice(0, 60).map(m => `- ${m.title} (${m.path})`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'description_restore_report.md'), md);
  fs.writeFileSync(path.join(OUT_DIR, 'restore_descriptions.sql'), '-- Clean truncations (safe)\n' + sqlFor(clean));
  fs.writeFileSync(path.join(OUT_DIR, 'restore_divergent.sql'), '-- Divergent: scrape is fuller but differs from current — review\n' + sqlFor(divergent));

  console.log(`\nClean: ${clean.length} | divergent: ${divergent.length} | missing-from-scrape: ${missingFromScrape.length} | unmatched: ${unmatched}`);
  console.log(`Apply set: ${updates.length} (${INCLUDE_DIVERGENT ? 'clean + divergent' : 'clean only'})`);
  console.log(`Report:  reports/description_restore_report.md`);
  console.log(`SQL:     reports/restore_descriptions.sql  (+ restore_divergent.sql)`);

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
