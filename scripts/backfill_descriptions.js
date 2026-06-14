// Backfill short/empty event descriptions from the live site (thevisualist.org)
// for events the recovery scrape didn't cover (newer than it, or odd paths).
//
// Every events row carries a permalink like https://thevisualist.org/?p=<wpId>
// (and the wpId is also embedded in events/DATE-<wpId>-slug.html). We fetch the
// live page, pull its <div class="event-single-body"> copy, and restore it when
// it's meaningfully fuller than what's stored.
//
// DRY-RUN by default (reads + writes a report and SQL); --apply needs
// SUPABASE_SERVICE_ROLE_KEY. Polite: small concurrency, retries.
//
//   node scripts/backfill_descriptions.js                 # 2026+ short descs
//   node scripts/backfill_descriptions.js --max-len 150 --all   # whole archive
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill_descriptions.js --apply

const { createClient } = require('@supabase/supabase-js');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const ANON_KEY = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const OUT_DIR = path.join(__dirname, '..', 'reports');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ALL = args.includes('--all');
const maxLenArg = args.indexOf('--max-len');
const MAX_LEN = maxLenArg >= 0 ? Number(args[maxLenArg + 1]) : 150; // backfill descriptions shorter than this
const CONCURRENCY = 4;

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const readClient = () => createClient(SUPABASE_URL, ANON_KEY);

// --- text helpers (shared shape with restore_descriptions.js) ----------------
const decodeEntities = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
const toPlain = html => decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const norm = s => String(s || '').toLowerCase()
  .replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"')
  .replace(/[–—−]/g, '-').replace(/ /g, ' ').replace(/\s+/g, '');

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li']);
const sanitizeHtml = raw => {
  let html = String(raw || '')
    .replace(/[\u2028\u2029\u0085]/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  html = html.replace(/\s*(<a[^>]*>)?\s*Official\s+(Website|Link|Site)\s*(<\/a>)?\s*$/i, '').trim();
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return '';
    if (full[1] === '/') return `</${t}>`;
    if (t === 'a') {
      const href = attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i);
      return href ? `<a href="${href[1]}" target="_blank" rel="noopener">` : '<a>';
    }
    return `<${t}>`;
  });
  return html.replace(/[\t ]+/g, ' ').replace(/(\s*<p>\s*<\/p>\s*)+/gi, '').replace(/\n{2,}/g, '\n').replace(/\s+\n/g, '\n').trim();
};

// pull the inner HTML of <div class="event-single-body"> with brace-style div
// nesting so a nested <div> doesn't end the body early
const extractBody = html => {
  const m = html.match(/<div class="event-single-body">/i);
  if (!m) return '';
  let i = m.index + m[0].length, depth = 1;
  const start = i;
  const re = /<\/?div[^>]*>/gi;
  re.lastIndex = i;
  let t;
  while ((t = re.exec(html))) {
    depth += t[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return html.slice(start);
};

const wpId = ev => {
  const m = String(ev.permalink || '').match(/[?&]p=(\d+)/) || String(ev.path || '').match(/-(\d+)-/);
  return m ? m[1] : null;
};

// node's fetch can't negotiate TLS with thevisualist.org (undici "fetch
// failed"), but curl can — shell out to it
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const curl = url => new Promise(resolve => {
  execFile('curl', ['-sSL', '--max-time', '20', '-A', UA, url], { maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
    resolve(err || !stdout || stdout.length < 500 ? null : stdout);
  });
});
const fetchLive = async (id, tries = 3) => {
  const url = `https://thevisualist.org/?p=${id}`;
  for (let i = 0; i < tries; i++) {
    const html = await curl(url);
    if (html) return html;
    await new Promise(r => setTimeout(r, 400 * (i + 1)));
  }
  return null;
};

async function mapLimit(items, limit, fn) {
  const out = []; let idx = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  if (APPLY && !serviceKey) { console.error('--apply needs SUPABASE_SERVICE_ROLE_KEY. Aborting.'); process.exit(1); }
  const sb = readClient();
  let all = [], start = 0;
  while (true) {
    const { data, error } = await sb.from('events').select('id, path, permalink, title, description, event_date')
      .order('id', { ascending: true }).range(start, start + 999);
    if (error) { console.error('fetch error', error.message); process.exit(1); }
    all = all.concat(data);
    if (data.length < 1000) break;
    start += 1000;
  }
  const candidates = all.filter(e => toPlain(e.description).length < MAX_LEN && (ALL || (e.event_date || '') >= '2026-01-01') && wpId(e));
  console.log(`Events: ${all.length} | short (<${MAX_LEN}${ALL ? '' : ', 2026+'}) with a wpId: ${candidates.length}`);

  const safe = [], conflict = [], nopage = [], nochange = [];
  let done = 0;
  await mapLimit(candidates, CONCURRENCY, async ev => {
    const html = await fetchLive(wpId(ev));
    if (++done % 20 === 0) console.log(`  fetched ${done}/${candidates.length}`);
    if (!html) { nopage.push(ev); return; }
    const liveHtml = sanitizeHtml(extractBody(html));
    const curPlain = toPlain(ev.description), livePlain = toPlain(liveHtml);
    if (livePlain.length <= curPlain.length + 10) { nochange.push(ev); return; }
    const curN = norm(curPlain), liveN = norm(livePlain);
    const ok = !curN || liveN.startsWith(curN.slice(0, Math.max(20, curN.length - 5))) || (curN.length > 30 && liveN.includes(curN));
    (ok ? safe : conflict).push({ id: ev.id, wpId: wpId(ev), title: ev.title, oldLen: curPlain.length, newLen: livePlain.length, html: liveHtml });
  });
  safe.sort((a, b) => b.newLen - a.newLen);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sqlFor = list => list.map(u => `UPDATE events SET description = '${u.html.replace(/'/g, "''")}' WHERE id = '${u.id}';`).join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'backfill_descriptions.sql'), '-- Backfilled from thevisualist.org (safe: live is fuller, current preserved)\n' + sqlFor(safe));
  fs.writeFileSync(path.join(OUT_DIR, 'backfill_conflicts.sql'), '-- Backfill conflicts: live differs from current — review\n' + sqlFor(conflict));
  const md = [
    '# Live-site description backfill — dry run',
    `Scope: short (<${MAX_LEN}) descriptions${ALL ? ', whole archive' : ', 2026+'}`,
    `Candidates fetched: ${candidates.length}`,
    `Safe to apply (live fuller, current preserved): ${safe.length}`,
    `Conflict (live differs — review): ${conflict.length}`,
    `Live already same/shorter (no change): ${nochange.length}`,
    `No live page found: ${nopage.length}`,
    '', '## Safe backfills (largest first)',
    ...safe.slice(0, 60).map(u => `- ${u.wpId} **${u.title}** — ${u.oldLen} → ${u.newLen} chars`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'backfill_report.md'), md);

  console.log(`\nSafe: ${safe.length} | conflict: ${conflict.length} | no-change: ${nochange.length} | no-page: ${nopage.length}`);
  console.log('Report: reports/backfill_report.md | SQL: reports/backfill_descriptions.sql (+ backfill_conflicts.sql)');

  if (APPLY) {
    const db = createClient(SUPABASE_URL, serviceKey);
    let n = 0;
    for (const u of safe) {
      const { error } = await db.from('events').update({ description: u.html }).eq('id', u.id);
      if (error) console.error('  fail', u.id, error.message); else n++;
    }
    console.log(`Applied ${n}/${safe.length}.`);
  }
}

main();
