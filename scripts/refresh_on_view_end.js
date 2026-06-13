const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const ANON_KEY = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WRITE = process.argv.includes('--write');
const PAGE = 1000;

if (WRITE && !SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required when using --write.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, WRITE ? SERVICE_KEY : (SERVICE_KEY || ANON_KEY));

// 0-based month lookup, mirroring components.js so the stored date matches
// exactly what the frontend parser (onViewEnd) would have computed.
const monthIndex = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

const pad = n => String(n).padStart(2, '0');

// Resolve "On view through Saturday, March 21st" + the opening date into an
// ISO close date. Ported verbatim from components.js `onViewEnd`/`onViewEndIso`:
// the year rolls over for a plausible span (a winter opening closing in
// spring); a close 7+ months "later" is a scrape artifact, and a run can't
// close before it opens. Returns '' when no real run is present.
const onViewEndIso = (text, eventDate) => {
  const match = String(text || '').match(/through\s+(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})/i);
  const [baseYear, baseMonth] = String(eventDate || '').split('-').map(Number);
  if (!match || !baseYear) return '';
  const month = monthIndex[match[1].toLowerCase()];
  if (month === undefined) return '';
  const rolled = baseMonth && month + 1 < baseMonth;
  if (rolled && 12 - baseMonth + month + 1 > 6) return '';
  const year = rolled ? baseYear + 1 : baseYear;
  const iso = `${year}-${pad(month + 1)}-${pad(Number(match[2]))}`;
  return iso >= (eventDate || '') ? iso : '';
};

const fetchEvents = async () => {
  // include on_view_end when it exists; before the schema migration runs the
  // column is absent, so fall back to reading without it (dry runs still work)
  let columns = 'id,event_date,on_view_through,on_view_end';
  const rows = [];
  for (let start = 0; ; start += PAGE) {
    let { data, error } = await supabase
      .from('events')
      .select(columns)
      .order('id', { ascending: true })
      .range(start, start + PAGE - 1);
    if (error && error.code === '42703' && columns.includes(',on_view_end')) {
      console.warn('on_view_end column not found yet — run schema_archive.sql first; treating as empty.');
      columns = 'id,event_date,on_view_through';
      ({ data, error } = await supabase
        .from('events')
        .select(columns)
        .order('id', { ascending: true })
        .range(start, start + PAGE - 1));
    }
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
};

const updateChangedRows = async changes => {
  for (const change of changes) {
    const { error } = await supabase
      .from('events')
      .update({ on_view_end: change.next || null })
      .eq('id', change.id);
    if (error) throw error;
  }
};

(async () => {
  const events = await fetchEvents();
  events.forEach(event => { event.next = onViewEndIso(event.on_view_through, event.event_date); });
  const changes = events.filter(event => (event.on_view_end || '') !== (event.next || ''));
  const dated = events.filter(event => event.next);
  console.log(`${events.length} events scanned`);
  console.log(`${dated.length} rows resolve to an on-view end date`);
  console.log(`${changes.length} rows ${WRITE ? 'will be updated' : 'would change'}${WRITE ? '' : ' (dry run)'}`);
  changes.slice(0, 20).forEach(event => {
    console.log(`${event.id} ${event.event_date} :: ${event.on_view_end || '∅'} -> ${event.next || '∅'}  [${event.on_view_through || ''}]`);
  });
  if (WRITE && changes.length) await updateChangedRows(changes);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
