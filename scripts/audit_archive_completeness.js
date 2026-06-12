const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const ANON_KEY = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const PAGE = 1000;
const LOCAL_EVENTS = process.env.VISUALIST_EVENTS_NDJSON ||
  '/Users/brendan/Documents/visualist/data/processed/events.ndjson';
const REPORT_DIR = path.resolve(__dirname, '..', 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'archive_audit.json');
const REPORT_MD = path.join(REPORT_DIR, 'archive_audit.md');

const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const liveSample = Number(args.get('live-sample') || 0);
const liveDelayMs = Number(args.get('live-delay-ms') || 900);

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || ANON_KEY);

const normalize = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const basename = value => {
  try {
    return decodeURIComponent(path.basename(new URL(String(value || '')).pathname)).toLowerCase();
  } catch {
    try {
      return decodeURIComponent(path.basename(String(value || ''))).toLowerCase();
    } catch {
      return path.basename(String(value || '')).toLowerCase();
    }
  }
};

const firstImage = event => {
  if (Array.isArray(event.images) && event.images[0]) return event.images[0].url || '';
  return String(event.image_urls || '').split('|').find(Boolean) || '';
};

const legacyIdFromDb = row => {
  const permalink = String(row.permalink || '');
  const queryMatch = permalink.match(/[?&]p=(\d+)/);
  if (queryMatch) return queryMatch[1];
  const pathMatch = String(row.path || '').match(/\/\d{4}-\d{2}-\d{2}-(\d+)-/);
  if (pathMatch) return pathMatch[1];
  return '';
};

const tupleKey = row => [
  normalize(row.title),
  row.event_date || '',
  normalize(row.venue || row.venue_name)
].join('|');

const readLocalEvents = () => fs.readFileSync(LOCAL_EVENTS, 'utf8')
  .split(/\n+/)
  .filter(Boolean)
  .map(line => JSON.parse(line));

const fetchDbEvents = async () => {
  const rows = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from('events')
      .select('id,title,permalink,path,venue,venue_url,address,map_url,event_date,time_window,on_view_through,image_url,tags,description,top_pick')
      .order('event_date', { ascending: false })
      .order('id', { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
};

const compareField = (mismatches, legacyId, field, localValue, dbValue) => {
  const a = normalize(localValue);
  const b = normalize(dbValue);
  if (a !== b) mismatches.push({ legacyId, field, local: localValue || '', db: dbValue || '' });
};

const compareUrlField = (mismatches, legacyId, field, localValue, dbValue) => {
  const a = String(localValue || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  const b = String(dbValue || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  if (a !== b) mismatches.push({ legacyId, field, local: localValue || '', db: dbValue || '' });
};

const compareEvents = (localEvents, dbEvents) => {
  const dbByLegacyId = new Map();
  const dbByTuple = new Map();
  dbEvents.forEach(row => {
    const legacyId = legacyIdFromDb(row);
    if (legacyId && !dbByLegacyId.has(legacyId)) dbByLegacyId.set(legacyId, row);
    const tuple = tupleKey(row);
    if (tuple && !dbByTuple.has(tuple)) dbByTuple.set(tuple, row);
  });

  const matchedDbIds = new Set();
  const missing = [];
  const mismatches = [];
  const matched = [];

  localEvents.forEach(local => {
    const legacyId = String(local.legacy_id || '');
    const db = dbByLegacyId.get(legacyId) || dbByTuple.get(tupleKey({
      title: local.title,
      event_date: local.event_date,
      venue: local.venue_name
    }));
    if (!db) {
      missing.push({
        legacyId,
        title: local.title || '',
        eventDate: local.event_date || '',
        venue: local.venue_name || '',
        url: local.legacy_url || local.source_url || ''
      });
      return;
    }
    matchedDbIds.add(db.id);
    matched.push({ legacyId, dbId: db.id });
    compareField(mismatches, legacyId, 'title', local.title, db.title);
    compareField(mismatches, legacyId, 'event_date', local.event_date, db.event_date);
    compareField(mismatches, legacyId, 'venue', local.venue_name, db.venue);
    compareField(mismatches, legacyId, 'address', local.address, db.address);
    compareUrlField(mismatches, legacyId, 'official_url', local.official_url || local.venue_url, db.venue_url);
    if (basename(firstImage(local)) !== basename(db.image_url)) {
      mismatches.push({
        legacyId,
        field: 'image_url_basename',
        local: firstImage(local),
        db: db.image_url || ''
      });
    }
  });

  const dbOnly = dbEvents
    .filter(row => !matchedDbIds.has(row.id))
    .map(row => ({
      id: row.id,
      legacyId: legacyIdFromDb(row),
      title: row.title || '',
      eventDate: row.event_date || '',
      venue: row.venue || '',
      permalink: row.permalink || '',
      path: row.path || ''
    }));

  return { matched, missing, mismatches, dbOnly };
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const liveSpotCheck = async localEvents => {
  const sample = localEvents
    .filter(event => event.legacy_url || event.source_url)
    .slice(0, liveSample);
  const results = [];
  for (const event of sample) {
    const url = event.legacy_url || event.source_url;
    await sleep(liveDelayMs);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'The Visualist archive audit (polite low-rate spot check)' }
      });
      const html = await response.text();
      results.push({
        legacyId: event.legacy_id,
        url,
        status: response.status,
        titlePresent: html.includes(event.title || ''),
        venuePresent: html.includes(event.venue_name || '')
      });
    } catch (error) {
      results.push({ legacyId: event.legacy_id, url, error: error.message });
    }
  }
  return results;
};

const writeReports = report => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  const md = [
    '# Archive Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `- Local archive events: ${report.counts.localEvents}`,
    `- Supabase events: ${report.counts.dbEvents}`,
    `- Matched events: ${report.counts.matched}`,
    `- Missing from Supabase: ${report.counts.missing}`,
    `- Supabase-only rows: ${report.counts.dbOnly}`,
    `- Field mismatches: ${report.counts.mismatches}`,
    '',
    '## Missing From Supabase',
    '',
    ...report.missing.slice(0, 50).map(item =>
      `- ${item.legacyId} ${item.eventDate} ${item.title} @ ${item.venue} (${item.url})`
    ),
    report.missing.length > 50 ? `- ...${report.missing.length - 50} more` : '',
    '',
    '## Field Mismatches',
    '',
    ...report.mismatches.slice(0, 50).map(item =>
      `- ${item.legacyId} ${item.field}: local="${item.local}" db="${item.db}"`
    ),
    report.mismatches.length > 50 ? `- ...${report.mismatches.length - 50} more` : '',
    '',
    '## Supabase-Only Rows',
    '',
    ...report.dbOnly.slice(0, 50).map(item =>
      `- ${item.id} ${item.legacyId || '(no legacy id)'} ${item.eventDate} ${item.title} @ ${item.venue}`
    ),
    report.dbOnly.length > 50 ? `- ...${report.dbOnly.length - 50} more` : '',
    ''
  ].filter(line => line !== '').join('\n');
  fs.writeFileSync(REPORT_MD, `${md}\n`);
};

(async () => {
  const localEvents = readLocalEvents();
  const dbEvents = await fetchDbEvents();
  const comparison = compareEvents(localEvents, dbEvents);
  const live = liveSample > 0 ? await liveSpotCheck(localEvents) : [];
  const report = {
    generatedAt: new Date().toISOString(),
    localEventsPath: LOCAL_EVENTS,
    liveSample,
    counts: {
      localEvents: localEvents.length,
      dbEvents: dbEvents.length,
      matched: comparison.matched.length,
      missing: comparison.missing.length,
      dbOnly: comparison.dbOnly.length,
      mismatches: comparison.mismatches.length
    },
    missing: comparison.missing,
    dbOnly: comparison.dbOnly,
    mismatches: comparison.mismatches,
    live
  };
  writeReports(report);
  console.log(`Local archive events: ${report.counts.localEvents}`);
  console.log(`Supabase events: ${report.counts.dbEvents}`);
  console.log(`Matched events: ${report.counts.matched}`);
  console.log(`Missing from Supabase: ${report.counts.missing}`);
  console.log(`Supabase-only rows: ${report.counts.dbOnly}`);
  console.log(`Field mismatches: ${report.counts.mismatches}`);
  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
