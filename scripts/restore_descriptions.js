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

const legacyIdFromPath = p => {
  const m = String(p || '').match(/events\/\d{4}-\d{2}-\d{2}-(\d+)-/);
  return m ? m[1] : null;
};

// --- main -------------------------------------------------------------------

async function main() {
  if (APPLY && !serviceKey) {
    console.error('--apply needs SUPABASE_SERVICE_ROLE_KEY in the environment. Aborting.');
    process.exit(1);
  }

  console.log('Loading reference scrape:', NDJSON);
  const ref = new Map();
  for (const line of fs.readFileSync(NDJSON, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (d.legacy_id) ref.set(String(d.legacy_id), d);
  }
  console.log(`Reference events: ${ref.size}`);

  const supabase = readClient();
  let all = [];
  let start = 0;
  const limit = 1000;
  while (true) {
    let q = supabase.from('events').select('id, path, title, description').range(start, start + limit - 1);
    if (SINCE) q = q.gte('event_date', SINCE);
    const { data, error } = await q;
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    all = all.concat(data);
    if (data.length < limit) break;
    start += limit;
  }
  console.log(`Fetched ${all.length} events from Supabase${SINCE ? ` (since ${SINCE})` : ''}.`);

  const updates = [];
  const missingFromScrape = [];
  let noLegacyId = 0;

  for (const ev of all) {
    const legacyId = legacyIdFromPath(ev.path);
    if (!legacyId) { noLegacyId++; continue; }
    const r = ref.get(legacyId);
    if (!r) {
      if (toPlain(ev.description).length < 400) missingFromScrape.push({ id: ev.id, legacyId, title: ev.title });
      continue;
    }
    const fullHtml = sanitizeHtml(r.description_html || r.description_text || '');
    const curPlain = toPlain(ev.description);
    const fullPlain = toPlain(fullHtml);
    // restore only when the reference is clearly longer AND the current text is
    // a leading slice of it — i.e. a genuine truncation, not a different edit
    const isTruncation = fullPlain.length > curPlain.length + 10 &&
      fullPlain.replace(/\s/g, '').startsWith(curPlain.replace(/\s/g, '').slice(0, Math.max(20, curPlain.length - 5)));
    if (isTruncation) {
      updates.push({ id: ev.id, legacyId, title: ev.title, oldLen: curPlain.length, newLen: fullPlain.length, html: fullHtml });
    }
  }

  updates.sort((a, b) => (b.newLen - b.oldLen) - (a.newLen - a.oldLen));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = [
    '# Description restore — dry run',
    `Scope: ${SINCE ? `events since ${SINCE}` : 'all events'}`,
    `Supabase events scanned: ${all.length}`,
    `Truncated (will restore): ${updates.length}`,
    `Not in scrape & short (live-site backfill candidates): ${missingFromScrape.length}`,
    `Events without a legacy id in path (skipped): ${noLegacyId}`,
    '',
    '## Restorations (largest gain first)',
    ...updates.slice(0, 60).map(u => `- ${u.legacyId} **${u.title}** — ${u.oldLen} → ${u.newLen} chars`),
    updates.length > 60 ? `… and ${updates.length - 60} more (see SQL).` : '',
    '',
    '## Sample before/after (top 3)',
    ...updates.slice(0, 3).flatMap(u => [
      `### ${u.legacyId} ${u.title}`,
      `OLD (${u.oldLen}): ${all.find(e => e.id === u.id).description?.slice(0, 280) || ''}`,
      `NEW (${u.newLen}): ${u.html.slice(0, 400)}`,
      ''
    ]),
    '',
    '## Missing from scrape (backfill from thevisualist.org)',
    ...missingFromScrape.slice(0, 40).map(m => `- ${m.legacyId} ${m.title}`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'description_restore_report.md'), md);

  let sql = '-- Restore full descriptions truncated at ingest (review before running)\n';
  for (const u of updates) sql += `UPDATE events SET description = '${u.html.replace(/'/g, "''")}' WHERE id = '${u.id}';\n`;
  fs.writeFileSync(path.join(OUT_DIR, 'restore_descriptions.sql'), sql);

  console.log(`\nTruncated: ${updates.length} | missing-from-scrape: ${missingFromScrape.length} | no-legacy-id: ${noLegacyId}`);
  console.log(`Report:  reports/description_restore_report.md`);
  console.log(`SQL:     reports/restore_descriptions.sql`);

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
