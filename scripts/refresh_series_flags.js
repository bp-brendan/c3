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

const monthIndex = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};

const pad = n => String(n).padStart(2, '0');
const keyFor = event => `${String(event.title || '').trim().toLowerCase()}|${String(event.venue || '').trim().toLowerCase()}`;

const isoPlusDays = (iso, days) => {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const runEndIso = event => {
  const text = event.on_view_through || '';
  const match = text.match(/through\s+(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})/i);
  if (!match || !event.event_date) return '';
  const month = monthIndex[match[1].toLowerCase()];
  if (!month) return '';
  const [baseYear, baseMonth] = event.event_date.split('-').map(Number);
  if (!baseYear || !baseMonth) return '';
  const rolled = month < baseMonth;
  if (rolled && 12 - baseMonth + month > 6) return '';
  const year = rolled ? baseYear + 1 : baseYear;
  const iso = `${year}-${pad(month)}-${pad(Number(match[2]))}`;
  return iso >= event.event_date ? iso : '';
};

const fetchEvents = async () => {
  const rows = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from('events')
      .select('id,title,venue,event_date,on_view_through,series_first,series_last')
      .order('id', { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
};

const markCluster = cluster => {
  if (new Set(cluster.map(item => item.event.event_date)).size < 2) return;
  const first = cluster.reduce((a, b) => (b.event.event_date < a.event.event_date ? b : a)).event;
  const last = cluster.reduce((a, b) => (b.event.event_date > a.event.event_date ? b : a)).event;
  first.next_series_first = true;
  last.next_series_last = true;
};

const computeFlags = events => {
  events.forEach(event => {
    event.next_series_first = false;
    event.next_series_last = false;
  });
  const groups = new Map();
  events.forEach(event => {
    const key = keyFor(event);
    const group = groups.get(key) || [];
    group.push(event);
    groups.set(key, group);
  });
  groups.forEach(group => {
    const runnable = group
      .map(event => ({ event, end: runEndIso(event) }))
      .filter(item => item.event.event_date && item.end)
      .sort((a, b) => a.event.event_date.localeCompare(b.event.event_date));
    let cluster = [];
    let clusterEnd = '';
    runnable.forEach(item => {
      if (!cluster.length || item.event.event_date <= isoPlusDays(clusterEnd, 1)) {
        cluster.push(item);
        if (!clusterEnd || item.end > clusterEnd) clusterEnd = item.end;
      } else {
        markCluster(cluster);
        cluster = [item];
        clusterEnd = item.end;
      }
    });
    markCluster(cluster);
  });
};

const updateChangedRows = async changes => {
  for (const change of changes) {
    const { error } = await supabase
      .from('events')
      .update({
        series_first: change.next_series_first,
        series_last: change.next_series_last
      })
      .eq('id', change.id);
    if (error) throw error;
  }
};

(async () => {
  const events = await fetchEvents();
  computeFlags(events);
  const changes = events.filter(event =>
    Boolean(event.series_first) !== event.next_series_first ||
    Boolean(event.series_last) !== event.next_series_last
  );
  const flagged = events.filter(event => event.next_series_first || event.next_series_last);
  console.log(`${events.length} events scanned`);
  console.log(`${flagged.length} rows should carry series flags`);
  console.log(`${changes.length} rows ${WRITE ? 'will be updated' : 'would change'}${WRITE ? '' : ' (dry run)'}`);
  changes.slice(0, 20).forEach(event => {
    console.log(`${event.id} ${event.event_date} ${event.title} :: ${event.series_first}/${event.series_last} -> ${event.next_series_first}/${event.next_series_last}`);
  });
  if (WRITE && changes.length) await updateChangedRows(changes);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
