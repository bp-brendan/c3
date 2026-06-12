// Configure your Supabase client here
const supabaseUrl = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const supabaseKey = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const client = supabase.createClient(supabaseUrl, supabaseKey);
window.supabaseClient = client;

const TAGLINES_CACHE_KEY = 'visualist.taglines.v1';
const SETTINGS_CACHE_KEY = 'visualist.settings.v1';
const DEFAULT_SITE_SETTINGS = { limit_to_2026: true, google_maps_api_key: '' };
const normalizeSiteSettings = row => {
  const settings = { ...DEFAULT_SITE_SETTINGS, ...(row || {}) };
  // The first settings table only had limit_to_2026 and was seeded false.
  // Until schema_settings.sql is re-run, treat that legacy row as the new
  // default (2026 only). Once google_maps_api_key exists, respect the toggle.
  if (row && !Object.prototype.hasOwnProperty.call(row, 'google_maps_api_key')) {
    settings.limit_to_2026 = true;
  }
  return settings;
};

window.Visualist = window.Visualist || {};
window.Visualist.loadData = async function(callback, options = {}) {
  const shouldLoadEvents = options.events !== false;
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
    window.SITE_SETTINGS = normalizeSiteSettings(JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY)) || {});
  } catch {
    window.SITE_SETTINGS = normalizeSiteSettings();
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
    window.SITE_SETTINGS = normalizeSiteSettings(settingsRes.data || {});

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

    // Admin edits full descriptions, so it reads the events table whole.
    // Public pages read the events_list view (500-char plain-text excerpts,
    // ~10x lighter) over a recent window that still covers long on-view
    // runs; the view not existing yet falls back to the full table.
    const isAdmin = document.body && document.body.dataset.page === 'admin';
    const windowStart = new Date(Date.now() - 120 * 86400 * 1000).toISOString().slice(0, 10);

    const buildQuery = (table, columns, windowed) => {
      let q = window.supabaseClient
        .from(table)
        .select(columns)
        .order('event_date', { ascending: false })
        .order('id', { ascending: true });
      if (windowed && !window.SITE_SETTINGS.limit_to_2026) q = q.gte('event_date', windowStart);
      if (window.SITE_SETTINGS.limit_to_2026) {
        q = q.gte('event_date', '2024-01-01').lte('event_date', '2026-12-31');
      }
      return q;
    };

    if (shouldLoadEvents) {
let events = null;
      let eventsError = null;
      
      const cacheKey = isAdmin ? 'cached_events_admin' : 'cached_events_list';
      try {
        const cachedStr = sessionStorage.getItem(cacheKey);
        if (cachedStr) events = JSON.parse(cachedStr);
      } catch (e) {}

      if (!events) {
        const fetchRows = window.Visualist.fetchPagedRows
          ? queryFactory => window.Visualist.fetchPagedRows(queryFactory)
          : async queryFactory => {
            const { data, error } = await queryFactory().limit(1000);
            return { data: data || [], error };
          };
        if (!isAdmin) {
          ({ data: events, error: eventsError } = await fetchRows(() => buildQuery('events_list', '*', true)));
        }
        if (isAdmin || eventsError || !events || !events.length) {
          ({ data: events, error: eventsError } = await fetchRows(() => buildQuery('events', '*', false)));
          if (eventsError) console.error('Error fetching events:', eventsError);
        }
        
        if (events && !eventsError) {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(events));
          } catch (e) {}
        }
      }

      // Map Supabase schema back to the short keys expected by the frontend
      window.ARCHIVE_EVENTS_2026 = (events || []).map(e => ({
        id: e.id, // Keep the id for admin CRUD
        t: e.title,
        u: e.permalink,
        p: e.path,
        v: e.venue,
        d: e.event_date,
        i: e.image_url,
        x: e.excerpt !== undefined ? e.excerpt : e.description,
        g: e.tags,
        w: e.time_window,
        vu: e.venue_url,
        a: e.address,
        m: e.map_url,
        o: e.on_view_through,
        k: e.top_pick ? 1 : 0,
        // series flags stay undefined until the columns exist; the client
        // then derives them from the loaded window (scopeSeriesRuns)
        sf: e.series_first == null ? undefined : (e.series_first ? 1 : 0),
        sl: e.series_last == null ? undefined : (e.series_last ? 1 : 0)
      }));
    } else {
      window.ARCHIVE_EVENTS_2026 = window.ARCHIVE_EVENTS_2026 || [];
    }

    if (callback) callback();
  } catch (err) {
    console.error('Failed to load data from Supabase:', err);
    if (callback) callback(); // Run anyway to show empty state
  }
};
