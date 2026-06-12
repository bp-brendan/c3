const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const ANON_KEY = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WRITE = process.argv.includes('--write');

if (WRITE && !SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required when using --write.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, WRITE ? SERVICE_KEY : (SERVICE_KEY || ANON_KEY));

const SOURCE = {
  label: 'TOP V. WEEKEND PICKS (6/11-17)',
  url: 'https://badatsports.com/2026/top-v-weekend-picks-6-11-17/',
  from: '2026-06-11',
  to: '2026-06-17',
  picks: [
    {
      title: 'Delightful Semapahores',
      date: '2026-06-12',
      venue: 'Co-Prosperity',
      permalink: 'https://thevisualist.org/?p=191080',
      path: 'events/2026-06-12-191080-delightful-semapahores.html'
    },
    {
      title: 'nánwàng de yī tiān',
      date: '2026-06-12',
      venue: 'SHANGHAI SEMINARY',
      permalink: 'https://thevisualist.org/?p=190941',
      path: 'events/2026-06-12-190941-nanwang-de-yi-tian.html'
    },
    {
      title: 'Josué Esaú: The Carocal',
      date: '2026-06-13',
      venue: 'boundary',
      permalink: 'https://thevisualist.org/?p=190657',
      path: 'events/2026-06-13-190657-josue-esau-the-carocal.html'
    },
    {
      title: 'Richard Marks: Concrete Age',
      date: '2026-06-13',
      venue: 'Parlour and Ramp',
      permalink: 'https://thevisualist.org/?p=191006',
      path: 'events/2026-06-13-191006-concrete-age.html'
    },
    {
      title: 'Nicole Schonitzer and Jingqi Wang Steinheiser: Creature Reverie',
      date: '2026-06-12',
      venue: 'Heaven Gallery',
      permalink: 'https://thevisualist.org/?p=190758',
      path: 'events/2026-06-12-190758-creature-reverie.html'
    }
  ]
};

const normalize = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const rowKey = row => `${row.id} ${row.event_date} ${row.title} @ ${row.venue}`;

const titleMatches = (row, pick) => {
  const rowTitle = normalize(row.title);
  const pickTitle = normalize(pick.title);
  if (!rowTitle || !pickTitle) return false;
  return rowTitle === pickTitle || pickTitle.endsWith(rowTitle) || rowTitle.endsWith(pickTitle);
};

const findPickRow = (rows, pick) => {
  const byPermalink = rows.find(row => row.permalink === pick.permalink);
  if (byPermalink) return byPermalink;
  const byPath = rows.find(row => row.path === pick.path);
  if (byPath) return byPath;
  const pickVenue = normalize(pick.venue);
  return rows.find(row =>
    row.event_date === pick.date &&
    normalize(row.venue) === pickVenue &&
    titleMatches(row, pick)
  );
};

const updateRows = async (rows, topPick) => {
  for (const row of rows) {
    const { error } = await supabase
      .from('events')
      .update({ top_pick: topPick })
      .eq('id', row.id);
    if (error) throw error;
  }
};

(async () => {
  const { data, error } = await supabase
    .from('events')
    .select('id,title,venue,event_date,top_pick,permalink,path')
    .gte('event_date', SOURCE.from)
    .lte('event_date', SOURCE.to)
    .order('event_date', { ascending: true });
  if (error) throw error;

  const rows = data || [];
  const wanted = new Map();
  const missing = [];
  SOURCE.picks.forEach(pick => {
    const row = findPickRow(rows, pick);
    if (row) wanted.set(row.id, { row, pick });
    else missing.push(pick);
  });

  const extras = rows.filter(row => row.top_pick && !wanted.has(row.id));
  const toMark = [...wanted.values()].map(item => item.row).filter(row => !row.top_pick);

  console.log(`${SOURCE.label}`);
  console.log(SOURCE.url);
  console.log(`${rows.length} rows scanned from ${SOURCE.from} to ${SOURCE.to}`);
  console.log(`${wanted.size}/${SOURCE.picks.length} source picks found`);
  if (missing.length) {
    console.log('Missing picks:');
    missing.forEach(pick => console.log(`- ${pick.date} ${pick.title} @ ${pick.venue} (${pick.permalink})`));
  }
  if (extras.length) {
    console.log('Extra Top V flags to clear:');
    extras.forEach(row => console.log(`- ${rowKey(row)}`));
  }
  if (toMark.length) {
    console.log('Source picks to mark:');
    toMark.forEach(row => console.log(`- ${rowKey(row)}`));
  }

  if (!WRITE) {
    console.log(`Dry run: would mark ${toMark.length} rows and clear ${extras.length} rows.`);
    return;
  }

  await updateRows(toMark, true);
  await updateRows(extras, false);
  console.log(`Updated ${toMark.length + extras.length} rows.`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
