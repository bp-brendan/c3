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

const EVENT = {
  title: 'Delightful Semapahores',
  permalink: 'https://thevisualist.org/?p=191080',
  path: 'events/2026-06-12-191080-delightful-semapahores.html',
  venue: 'Co-Prosperity',
  venue_url: 'https://s-hprojects.com/',
  address: '3219-21 S Morgan St, Chicago, IL 60608',
  map_url: 'http://maps.google.com/maps?q=3219-21%20S%20Morgan%20St%2C%20Chicago%2C%20IL%2060608',
  event_date: '2026-06-12',
  time_window: '6PM - 9PM',
  on_view_through: 'On view through Friday, July 24th',
  image_url: 'https://thevisualist.org/wp-content/uploads/2026/06/Delightful-Sempahores_Poster2.png',
  top_pick: true,
  tags: [
    'Bridgeport',
    'Co-prosperity',
    'Coco Klockner',
    'Delightful Semapahores',
    'Matt Morris',
    'S-H Projects',
    'Zach Hill',
    'Zante Moore'
  ],
  description: [
    '<p>Switch-Hook Projects opens Delightful Semaphores on June 12th, 6-9pm hosted by Co-Prosperity</p>',
    '<p>Zach Hill, Coco Clockner, and Zante Moore</p>',
    '<p>Programming by Matt Morris July 17th</p>',
    '<p>A semaphore is an apparatus for long distance signaling, a lamp, a flag, a smoke signal. From the Greek sema-, sign, and -phoros, bearer. The works in Delightful Semaphores are Sign-bearers. They employ, interrogate and metabolize the signs of identity formation and legibility. An acute awareness of how signs can be employed to signal or disguise, to critique or adorn is not incidental to queer life but innate to it.</p>',
    '<p>It is this literacy, built through necessity and desire in equal measure, that is deployed in the work of Zach Hill, Coco Klockner, Zante Moore. Delightful Semaphores is surrealist and pragmatic, neither hopeful nor despairing.</p>',
    '<p>Artists:</p>',
    '<p>Zante Moore is an artist from Tulsa, Oklahoma. They are currently based out of Chicago, IL. Moore received their BFA in Photography from the Kansas City Art Institute, and received an interdisciplinary MFA from the University of Illinois Chicago. They create large installations and worldbuild through airbrush, photography, collage, technology, and computer games. Their work has been exhibited at Elastic arts, Gallery400 and ingrown gallery.</p>',
    '<p>Coco Klockner is an artist and writer. She is the author of the speculative novella K-Y (Genderfail Press, 2019), and her essays have appeared in Texte zur Kunst, Spike Art Magazine, Disclaimer/Liquid Architecture, and The Whitney Review.</p>',
    "<p>Klockner's sound work has been included in Musik Installationen Nurnberg (2022) as well as MoMA PS1's Greater New York (2026), and she has had solo exhibitions at Silke Lindner, New York; Bad Water, Knoxville, TN; stop-gap projects, Columbia, MO; The Anderson Gallery, Richmond, VA; and SculptureCenter, New York.</p>",
    '<p>Zach Hill is an interdisciplinary artist, educator, and curator working between sculpture, drawing, and moving image. He has been awarded the Mary L. Nohl Fellowship, Toby Devan Lewis Fellowship, two Illuminate the Arts Grants, and a Ruth Arts Mary L. Nohl Alumni Award along with a full fellowship to Vermont Studio Center and has attended other residencies such as Bunker Projects, RAIR, Elsewhere Museum, and Stove Works.</p>',
    '<p>His work has been exhibited at The Haggerty Museum of Art, Flux Factory on Governors Island, The Luminary, Peep Projects, Fjord, Grizzly Grizzly, All Street Gallery, and VisArts among other locations. Alongside these more traditional venues, he also creates nightlife visuals for various queer parties such as Sonidero, Virtues, and LYLAS and has completed multiple sculptural commissions for Honcho Campout.</p>',
    '<p>Matt Morris is an artist, perfumer, and writer based in Chicago.</p>',
    '<p>Morris has presented artwork internationally including Andrew Kreps, Margot Samel, and Tiger Strikes Asteroid, New York; Musee de la Fraise and Ruschman, Berlin, Germany; Netwerk Aalst, Aalst, Belgium; Krabbesholm Hojskole, Skive, Denmark; / Slash, San Francisco, CA; Espace Maurice, Montreal, Quebec; DePaul Art Museum, Ruschman, and LVL3, Chicago, IL; Mary + Leigh Block Museum of Art, Evanston, IL; Elmhurst Art Museum, Elmhurst, IL; and the Contemporary Arts Center, Cincinnati, OH.</p>',
    '<p>Morris has contributed to Femme Art Review, Fragrantica, Heart Note Press, Everyone Is a Girl, VISCOSE, QED, artforum.com, Art Papers, ARTnews, Flash Art, and X-TRA--additional writing appears in numerous exhibition catalogues and artist monographs. Morris is a transplant from southern Louisiana who holds a BFA from the Art Academy of Cincinnati and earned an MFA in Art Theory + Practice from Northwestern University, as well as a Certificate in Gender + Sexuality Studies.</p>',
    '<p>Morris is an Adjunct Assistant Professor at the School of the Art Institute of Chicago.</p>'
  ].join('\n')
};

const findExisting = async () => {
  const { data, error } = await supabase
    .from('events')
    .select('id,title,permalink,path,event_date,top_pick')
    .or(`permalink.eq.${EVENT.permalink},path.eq.${EVENT.path}`)
    .limit(5);
  if (error) throw error;
  return data || [];
};

(async () => {
  const existing = await findExisting();
  if (existing.length) {
    console.log(`Found ${existing.length} existing row(s) for ${EVENT.permalink}`);
    existing.forEach(row => console.log(`${row.id} ${row.event_date} ${row.title} top_pick=${row.top_pick}`));
    if (WRITE) {
      const { error } = await supabase.from('events').update(EVENT).eq('id', existing[0].id);
      if (error) throw error;
      console.log(`Updated ${existing[0].id}`);
    } else {
      console.log('Dry run: would update the first existing row.');
    }
    return;
  }

  if (!WRITE) {
    console.log(`Dry run: would insert ${EVENT.title} (${EVENT.event_date}) from ${EVENT.permalink}`);
    return;
  }

  const { data, error } = await supabase.from('events').insert(EVENT).select('id,title,event_date').single();
  if (error) throw error;
  console.log(`Inserted ${data.id} ${data.event_date} ${data.title}`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
