// Configure your Supabase client here
const supabaseUrl = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const supabaseKey = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const client = supabase.createClient(supabaseUrl, supabaseKey);
window.supabaseClient = client;

const TAGLINES_CACHE_KEY = 'visualist.taglines.v1';
const SETTINGS_CACHE_KEY = 'visualist.settings.v1';

window.Visualist = window.Visualist || {};
window.Visualist.loadData = async function(callback) {
  // Paint the chrome before touching the network, seeded from the previous
  // visit's cached taglines and settings — waiting for Supabase pops the
  // header in late and shoves the whole page down on every navigation.
  try {
    if (!window.TAGLINES) {
      const cached = JSON.parse(localStorage.getItem(TAGLINES_CACHE_KEY));
      if (Array.isArray(cached) && cached.length) window.TAGLINES = cached;
    }
  } catch {}
  try {
    window.SITE_SETTINGS = JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY)) || { limit_to_2026: false };
  } catch {
    window.SITE_SETTINGS = { limit_to_2026: false };
  }
  if (window.Visualist.renderChrome) {
    window.Visualist.renderChrome();
    window.Visualist.initHeaderAccordion();
  }

  try {
    // Settings and taglines share one round trip; events follow because the
    // query shape depends on settings.limit_to_2026.
    const [settingsRes, taglinesRes] = await Promise.all([
      window.supabaseClient.from('settings').select('*').eq('id', 1).single(),
      window.supabaseClient.from('taglines').select('*').order('created_at', { ascending: true })
    ]);
    window.SITE_SETTINGS = settingsRes.data || { limit_to_2026: false };

    const taglines = taglinesRes.data;
    if (taglinesRes.error) console.error('Error fetching taglines:', taglinesRes.error);

    window.TAGLINES = (taglines || []).map(t => ({
      id: t.id,
      content: t.content,
      is_active: t.is_active
    }));

    // For the public frontend, it expects TAGLINES to be an array of strings
    window.PUBLIC_TAGLINES = (taglines || []).filter(t => t.is_active).map(t => t.content);

    try {
      localStorage.setItem(TAGLINES_CACHE_KEY, JSON.stringify(window.TAGLINES));
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(window.SITE_SETTINGS));
    } catch {}

    let query = window.supabaseClient
      .from('events')
      .select('*')
      .order('event_date', { ascending: false })
      .limit(1000);

    if (window.SITE_SETTINGS.limit_to_2026) {
      query = query.gte('event_date', '2026-01-01').lte('event_date', '2026-12-31');
    }

    const { data: events, error: eventsError } = await query;
    if (eventsError) console.error('Error fetching events:', eventsError);

    // Map Supabase schema back to the short keys expected by the frontend
    window.ARCHIVE_EVENTS_2026 = (events || []).map(e => ({
      id: e.id, // Keep the id for admin CRUD
      t: e.title,
      u: e.permalink,
      p: e.path,
      v: e.venue,
      d: e.event_date,
      i: e.image_url,
      x: e.description,
      g: e.tags,
      w: e.time_window,
      vu: e.venue_url,
      a: e.address,
      m: e.map_url,
      o: e.on_view_through,
      k: e.top_pick ? 1 : 0
    }));

    if (callback) callback();
  } catch (err) {
    console.error('Failed to load data from Supabase:', err);
    if (callback) callback(); // Run anyway to show empty state
  }
};
