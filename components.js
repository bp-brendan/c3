(function () {
  const footerText = `<strong>The Visualist</strong> is a calendar and archive of the visual arts —
a living document of our communities and their shared identity as cultural producers in and around
Chicago, kept current by year-round submissions. A project of <a class="footer-inline-link"
href="https://www.culturemath.org/" target="_blank" rel="noopener">culture/Math</a>, a nonprofit
supporting the Chicago arts community.`;

  // hosted_button_id from the PayPal form on thevisualist.org/about/
  const DONATE_URL = 'https://www.paypal.com/donate?hosted_button_id=947PHJMCQD9Q4';

  const footerLinks = [
    { label: 'About', href: 'about.html', local: true },
    { label: 'Instagram', href: 'https://www.instagram.com/visualistgo/' },
    { label: 'Facebook', href: 'https://www.facebook.com/visualistchicago/' },
    { label: 'Top V on Bad at Sports', href: 'https://badatsports.com/author/visualist/' },
    { label: 'events@thevisualist.org', href: 'mailto:events@thevisualist.org', local: true }
  ];

  const navItems = [
    // Today is the always-current virtual tag page, not an index view
    { key: 'today', label: 'Today', page: 'index.html' },
    { key: 'this-week', label: 'This Week' },
    { key: 'archive', label: 'Archive' }
  ];

  const pageName = () => document.body.dataset.page || 'home';
  const basePath = () => document.body.dataset.basePath || '';
  const localHref = path => `${basePath()}${path}`;
  let externalLinkObserver = null;

  const stripPeriods = text => text.replace(/\.+$/, '');

  const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const SUBMISSIONS_KEY = 'visualist.submittedEvents.v1';
  const EVENT_EDITS_KEY = 'visualist.eventEdits.v1';
  const TAGLINES_KEY = 'visualist.taglines.v1';
  const SUBMISSION_IMAGE_LIMIT = 900 * 1024;

  const readJson = (key, fallback) => {
    try {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  };

  const submittedEvents = () => {
    return window.SUBMISSIONS || [];
  };

  const saveSubmittedEvents = events => {
    // Legacy function, no longer used directly.
    window.SUBMISSIONS = events;
  };

  const eventKey = event => event.id;

  const eventHref = event => {
    if (!event) return '#';
    if (event.p && String(event.p).trim()) return event.p;
    const match = archiveMatch(event.t || '', event.u || '');
    return match.p || event.u || '#';
  };

  const eventEdits = () => {
    const edits = readJson(EVENT_EDITS_KEY, {});
    return edits && typeof edits === 'object' && !Array.isArray(edits) ? edits : {};
  };

  const taglines = () => {
    if (!window.TAGLINES) return ['Chicago Visual Arts Calendar'];
    return window.TAGLINES.map(t => typeof t === 'string' ? t : t.content);
  };

  const saveTaglines = async lines => {
    if (!window.supabaseClient) return;
    try {
      await window.supabaseClient.from('taglines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const inserts = lines.map(l => ({ content: l, is_active: true }));
      await window.supabaseClient.from('taglines').insert(inserts);
      window.TAGLINES = inserts;
      window.PUBLIC_TAGLINES = lines;
    } catch (e) {
      console.error(e);
    }
  };

  const saveTaglineRows = async rows => {
    if (!window.supabaseClient) return [];
    const cleanRows = (rows || [])
      .map(row => ({
        id: row.id || undefined,
        content: String(row.content || '').trim(),
        is_active: row.is_active !== false
      }))
      .filter(row => row.content);
    try {
      await window.supabaseClient.from('taglines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (cleanRows.length) {
        const { data, error } = await window.supabaseClient
          .from('taglines')
          .insert(cleanRows.map(row => ({ content: row.content, is_active: row.is_active })))
          .select()
          .order('created_at', { ascending: true });
        if (error) throw error;
        window.TAGLINES = data || cleanRows;
      } else {
        window.TAGLINES = [];
      }
      window.PUBLIC_TAGLINES = (window.TAGLINES || [])
        .filter(row => row.is_active !== false)
        .map(row => row.content);
      return window.TAGLINES;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const saveEventEdit = async (key, patch) => {
    if (!window.supabaseClient) return;
    const priorIndex = window.ARCHIVE_EVENTS_2026
      ? window.ARCHIVE_EVENTS_2026.findIndex(e => e.id === key)
      : -1;
    const priorEvent = priorIndex !== -1
      ? window.ARCHIVE_EVENTS_2026[priorIndex]
      : await fetchEventById(key);
    
    // Map short keys to Supabase schema
    const updateData = { id: key };
    if ('t' in patch) updateData.title = patch.t;
    if ('u' in patch) updateData.permalink = patch.u;
    if ('v' in patch) updateData.venue = patch.v;
    if ('d' in patch) updateData.event_date = patch.d;
    if ('i' in patch) updateData.image_url = patch.i;
    if ('x' in patch) updateData.description = patch.x;
    if ('g' in patch) updateData.tags = patch.g;
    if ('w' in patch) updateData.time_window = patch.w;
    if ('vu' in patch) updateData.venue_url = patch.vu;
    if ('a' in patch) updateData.address = patch.a;
    if ('m' in patch) updateData.map_url = patch.m;
    if ('o' in patch) updateData.on_view_through = patch.o;
    if ('k' in patch) updateData.top_pick = patch.k === 1;

    try {
      await window.supabaseClient.from('events').upsert(updateData);
      
      // Update local cache
      const eventIndex = window.ARCHIVE_EVENTS_2026 ? window.ARCHIVE_EVENTS_2026.findIndex(e => e.id === key) : -1;
      if (eventIndex !== -1) {
        window.ARCHIVE_EVENTS_2026[eventIndex] = { ...window.ARCHIVE_EVENTS_2026[eventIndex], ...patch };
      }
      const nextEvent = { ...(priorEvent || {}), ...patch, id: key };
      await refreshSeriesFlagsForEvents([priorEvent, nextEvent]);
    } catch (e) {
      console.error(e);
    }
  };

  const clearEventEdit = async key => {
    // We don't really 'clear' in Supabase without a history table, but we can delete the event.
    // Assuming clear means delete here? Or maybe we just remove from local memory.
    if (!window.supabaseClient) return;
    try {
      const priorEvent = window.ARCHIVE_EVENTS_2026
        ? window.ARCHIVE_EVENTS_2026.find(e => e.id === key)
        : await fetchEventById(key);
      await window.supabaseClient.from('events').delete().eq('id', key);
      window.ARCHIVE_EVENTS_2026 = (window.ARCHIVE_EVENTS_2026 || []).filter(e => e.id !== key);
      await refreshSeriesFlagsForEvents([priorEvent]);
    } catch (e) {
      console.error(e);
    }
  };

  const applyEventEdits = events => events;

  const submissionId = () => {
    const random = Math.random().toString(36).slice(2, 8);
    return `sub-${Date.now().toString(36)}-${random}`;
  };

  const splitList = value => String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  const dateLabel = iso => {
    if (!iso) return '';
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
    return `${weekday}, ${month} ${ordinal(date.getDate())}`;
  };

  const mapUrlForAddress = address => address
    ? `http://maps.google.com/maps?q=${encodeURIComponent(address)}`
    : '';

  const readFileAsDataUrl = file => new Promise(resolve => {
    if (!file || file.size > SUBMISSION_IMAGE_LIMIT || !/^image\//.test(file.type || '')) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });

  const chicagoNeighborhoods = () => window.CHICAGO_NEIGHBORHOODS || [];

  // auto-fill the neighborhood once a venue is chosen: prefer the precomputed
  // venue→neighborhood map (mined from the whole archive), else scan the events
  // loaded this session for a neighborhood tag on that venue.
  const neighborhoodForVenue = venue => {
    const key = String(venue || '').trim().toLowerCase();
    if (!key) return '';
    const map = window.VENUE_NEIGHBORHOODS || {};
    if (map[key]) return map[key];
    const known = new Set((window.CHICAGO_NEIGHBORHOODS || []).map(n => n.toLowerCase()));
    if (!known.size) return '';
    const counts = new Map();
    (window.ARCHIVE_EVENTS_2026 || []).forEach(event => {
      if (String(event.v || '').trim().toLowerCase() !== key) return;
      (event.g || []).forEach(tag => {
        const label = String(tag || '').trim();
        if (known.has(label.toLowerCase())) counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    let best = '';
    let bestCount = 0;
    counts.forEach((count, label) => { if (count > bestCount) { best = label; bestCount = count; } });
    return best;
  };

  const demoSubmissions = [
    {
      id: 'demo-chicago-dibs-summit',
      status: 'approved',
      submittedAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
      approvedAt: '2026-06-01T12:00:00.000Z',
      sourceUrl: '',
      title: 'The Great Chicago Dibs Summit',
      artists: [],
      venue: 'Daley Plaza',
      address: '50 W Washington St, Chicago, IL 60602',
      listingType: 'event',
      eventDate: '2026-06-18',
      eventStart: '6PM',
      eventEnd: '8PM',
      exhibitionStart: '',
      exhibitionEnd: '',
      imageUrl: '',
      imageName: '',
      description: 'A nonbinding civic forum on lawn chairs, milk crates, and whether a traffic cone can hold emotional property rights after the snow melts.',
      contactEmail: 'history@example.org',
      tags: ['Chicago History', 'Dibs', 'Civic Rituals']
    },
    {
      id: 'demo-oleary-cow-hearing',
      status: 'approved',
      submittedAt: '2026-06-01T12:05:00.000Z',
      updatedAt: '2026-06-01T12:05:00.000Z',
      approvedAt: '2026-06-01T12:05:00.000Z',
      sourceUrl: '',
      title: "Mrs. O'Leary's Cow Alibi Hearing",
      artists: [],
      venue: 'Chicago History Museum',
      address: '1601 N Clark St, Chicago, IL 60614',
      listingType: 'event',
      eventDate: '2026-06-19',
      eventStart: '7PM',
      eventEnd: '9PM',
      exhibitionStart: '',
      exhibitionEnd: '',
      imageUrl: '',
      imageName: '',
      description: 'A mock civic hearing reconsidering the most famous cow in town, with expert testimony from amateur historians, neighborhood skeptics, and one person who just really likes lanterns.',
      contactEmail: 'history@example.org',
      tags: ['Chicago Fire', 'Chicago History', 'Old Town']
    },
    {
      id: 'demo-reverse-the-river-again',
      status: 'approved',
      submittedAt: '2026-06-01T12:10:00.000Z',
      updatedAt: '2026-06-01T12:10:00.000Z',
      approvedAt: '2026-06-01T12:10:00.000Z',
      sourceUrl: '',
      title: 'Reverse the River Again, Just To See',
      artists: [],
      venue: 'Chicago Riverwalk',
      address: 'Chicago Riverwalk, Chicago, IL 60601',
      listingType: 'event',
      eventDate: '2026-06-20',
      eventStart: '3PM',
      eventEnd: '5PM',
      exhibitionStart: '',
      exhibitionEnd: '',
      imageUrl: '',
      imageName: '',
      description: 'A walking tour and group thought experiment about civic engineering, stubbornness, and whether the river would appreciate a little variety.',
      contactEmail: 'history@example.org',
      tags: ['Chicago River', 'Civic Engineering', 'Chicago History']
    },
    {
      id: 'demo-lower-wacker-support-group',
      status: 'approved',
      submittedAt: '2026-06-01T12:15:00.000Z',
      updatedAt: '2026-06-01T12:15:00.000Z',
      approvedAt: '2026-06-01T12:15:00.000Z',
      sourceUrl: '',
      title: 'Lower Wacker Wayfinding Support Group',
      artists: [],
      venue: 'Lower Wacker Drive',
      address: 'Lower Wacker Dr, Chicago, IL 60601',
      listingType: 'event',
      eventDate: '2026-06-21',
      eventStart: '11AM',
      eventEnd: '12PM',
      exhibitionStart: '',
      exhibitionEnd: '',
      imageUrl: '',
      imageName: '',
      description: 'A gentle meetup for anyone who has entered Lower Wacker with confidence and emerged in a different chapter of their life.',
      contactEmail: 'history@example.org',
      tags: ['Lower Wacker', 'Chicago History', 'Getting Lost']
    }
  ];

  const randomLine = () => {
    const lines = taglines();
    if (lines.length > 0) return stripPeriods(lines[Math.floor(Math.random() * lines.length)]);
    return 'Chicago Visual Arts Calendar';
  };

  const renderHeader = () => {
    document.querySelectorAll('[data-visualist-header]').forEach(header => {
      header.className = 'site-header';
      const isAdmin = pageName() === 'admin';
      const logo = `<span class="logotype-the">the</span>
        <span class="logotype-name">${isAdmin ? 'BACKROOM' : 'VISUALIST'}</span>`;
      header.innerHTML = `
        <a class="header-home-hit" href="${localHref(isAdmin ? 'admin.html' : 'index.html')}" aria-hidden="true" tabindex="-1"></a>
        <a class="logotype" href="${localHref(isAdmin ? 'admin.html' : 'index.html')}" aria-label="${isAdmin ? 'Admin Home' : 'The Visualist home'}">${logo}</a>
        ${isAdmin ? '' : `<p class="tagline"><span>${randomLine()}</span></p>`}`;
    });
  };

  const navHref = key => pageName() === 'home' ? `#${key}` : localHref(`index.html#${key}`);

  // CHICAGO in flag colors: letters use uneven blue pulses, but only inside
  // the red-star windows so the two Chicago flag colors always travel together.
  const chicagoFlagLetters = 'Chicago'.split('').map((letter, i) => {
    if (letter === 'o') {
      return `<span class="flag-letter flag-letter-o">` +
        `<span class="flag-o">${letter}</span>` +
        `<span class="flag-star" aria-hidden="true">✶</span></span>`;
    }
    return `<span class="flag-letter flag-letter-${i}">${letter}</span>`;
  }).join('');

  const renderNav = () => {
    const page = pageName();
    const hashView = location.hash.slice(1).split('?')[0];
    const active = document.body.dataset.activeNav ||
      (page === 'home' && navItems.some(item => item.key === hashView) ? hashView : (page === 'home' ? 'today' : page));
    document.querySelectorAll('[data-visualist-nav]').forEach(slot => {
      const isAdmin = page === 'admin';
      const adminActive = isAdmin
        ? (location.hash || '#pending').replace(/^#/, '')
        : '';
      const adminItems = [
        { key: 'pending', label: 'Pending' },
        { key: 'unpublished', label: 'Unpublished' },
        { key: 'published', label: 'Published' },
        { key: 'archive', label: 'Archive' },
        { key: 'all', label: 'Events' },
        { key: 'create', label: 'Create' },
        { key: 'funlines', label: 'Taglines' },
        { key: 'settings', label: 'Settings' },
        { key: 'home', label: 'Exit Admin', href: localHref('index.html') }
      ];
      slot.innerHTML = `
        ${isAdmin ? '' : `<div class="tab-band">
          <p class="band-label"><span class="flag-word">${chicagoFlagLetters}</span> Visual Arts Calendar</p>
        </div>`}
        <div class="nav-band">
          <div class="nav-block">
            <nav class="site-nav" aria-label="Primary">
              ${isAdmin
                ? adminItems.map(item => {
                  const activeTab = adminActive === item.key;
                  return `<a href="${item.href || `#${item.key}`}" data-admin-tab="${item.key}" class="${activeTab ? 'active' : ''}">${item.label}</a>`;
                }).join('')
                : navItems.map(item => page === 'home' && item.key === 'today'
                  ? `<a href="${localHref('index.html')}" data-view="today" class="${active === item.key ? 'active' : ''}">${item.label}</a>`
                  : item.page
                  ? `<a href="${localHref(item.page)}" class="${active === item.key ? 'active' : ''}">${item.label}</a>`
                  : `<a href="${navHref(item.key)}" data-view="${item.key}" class="${active === item.key ? 'active' : ''}">${item.label}</a>
                `).join('')}
              ${isAdmin
                ? ''
                : `<a href="${localHref('submit.html')}" class="nav-button ${page === 'submit' ? 'active' : ''}" ${page === 'submit' ? 'aria-current="page"' : ''}>Add Event</a>`}
            </nav>
          </div>
        </div>`;
    });
  };

  const renderFooter = () => {
    document.querySelectorAll('[data-visualist-footer]').forEach(footer => {
      footer.className = 'site-footer';
      footer.innerHTML = `
        <div class="site-footer-inner">
          <p>${footerText}</p>
          <div class="footer-actions">
            <a class="footer-donate" href="${DONATE_URL}" target="_blank" rel="noopener">Donate</a>
            <p class="footer-links">${footerLinks.map(link => link.local
              ? `<a href="${localHref(link.href)}">${link.label}</a>`
              : `<a href="${link.href}" target="_blank" rel="noopener">${link.label}</a>`
            ).join('')}</p>
          </div>
          <p class="footer-copyright">&copy; ${new Date().getFullYear()} <a href="https://www.culturemath.org/" target="_blank" rel="noopener">culture/Math</a> &middot; made with <a href="https://madewithbestpractice.com" target="_blank" rel="noopener">Best Practice</a></p>
        </div>`;
    });
  };

  const isExternalHttpLink = href => {
    try {
      const url = new URL(href, location.href);
      return /^https?:$/.test(url.protocol) && url.origin !== location.origin;
    } catch {
      return false;
    }
  };

  const openExternalLinks = (root = document) => {
    root.querySelectorAll('a[href]').forEach(link => {
      if (!isExternalHttpLink(link.getAttribute('href'))) return;
      link.target = '_blank';
      const rel = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      link.setAttribute('rel', [...rel].join(' '));
    });
    markClampedDescriptions(root);
  };

  const initExternalLinkObserver = () => {
    if (externalLinkObserver || !window.MutationObserver) {
      openExternalLinks();
      return;
    }
    openExternalLinks();
    externalLinkObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.('a[href]')) openExternalLinks(node.parentElement || document);
          else openExternalLinks(node);
        });
      });
    });
    externalLinkObserver.observe(document.body, { childList: true, subtree: true });
  };

  const CRUMB_KEY = 'visualistCrumb';
  const defaultCrumb = { label: 'Archive', href: 'index.html#archive', nav: 'archive' };

  const readCrumb = () => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(CRUMB_KEY));
      if (stored && stored.label && stored.href) return stored;
    } catch {}
    return defaultCrumb;
  };

  // On listing pages: remember which view (and filters) the user left from,
  // so interior pages can breadcrumb back to it.
  const trackEventLinks = getCrumb => {
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href*="events/"], a[href*="tag.html"]');
      if (!link) return;
      try {
        // the clicked link lets providers derive context from the markup
        // around it (e.g. a peek river borrows its week's identity)
        sessionStorage.setItem(CRUMB_KEY, JSON.stringify(getCrumb(link)));
      } catch {}
    });
  };

  // the bare date line initEventDetailMeta strips from the meta block lives on
  // here for the breadcrumb: display text plus ISO date for the archive link
  let detailDate = null;

  // the event's own day + date, e.g. "Friday, June 12th"
  const breadcrumbDayDate = () => {
    const source = detailDate
      ? detailDate.text
      : (document.querySelector('.event-detail-meta span') || { textContent: '' }).textContent;
    const match = source.match(
      /([A-Za-z]+day),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i
    );
    if (!match) return '';
    return `${match[1]}, ${match[2]} ${ordinal(Number(match[3]))}`;
  };

  const breadcrumbNav = innerHtml => {
    const nav = document.createElement('nav');
    nav.className = 'breadcrumb';
    nav.setAttribute('aria-label', 'Breadcrumb');
    nav.innerHTML = innerHtml;
    return nav;
  };

  const renderBreadcrumb = () => {
    const page = pageName();
    if (document.querySelector('.breadcrumb')) return;
    const crumb = readCrumb();
    const origin = `<a href="${escapeHtml(localHref(crumb.href))}" class="breadcrumb-arrow" style="opacity: 0.4;">${escapeHtml(crumb.label)}</a>`;
    if (page === 'event') {
      const title = document.querySelector('.event-detail-body .event-detail-title');
      if (!title) return;
      const dayDate = breadcrumbDayDate();
      const nav = breadcrumbNav(`
      ${origin}
      ${dayDate ? `<span class="breadcrumb-arrow breadcrumb-arrow-date" style="opacity: 0.7;">${detailDate
        ? `<a href="${escapeHtml(localHref(`index.html#archive?date=${detailDate.iso}`))}" style="color:inherit;">${escapeHtml(dayDate)}</a>`
        : escapeHtml(dayDate)}${breadcrumbCalendarHtml()}</span>` : ''}`);
      title.insertAdjacentElement('beforebegin', nav);
      initBreadcrumbCalendar(nav);
    } else if (page === 'tag') {
      // the Today listing is the landing page: no crumb back to a view
      if (new URLSearchParams(location.search).get('tag') === 'today') return;
      const title = document.querySelector('.tag-title');
      if (!title) return;
      // no trailing label: the arrow points at the tag title right below
      title.insertAdjacentElement('beforebegin', breadcrumbNav(`
      ${origin}`));
    }
  };

  let chromeRendered = false;

  const renderChrome = () => {
    // loadData paints the chrome before its network fetches; the pages'
    // post-load calls must not repaint it (the tagline would visibly swap)
    if (chromeRendered) return;
    chromeRendered = true;
    const page = pageName();
    if (page === 'event') {
      const crumb = readCrumb();
      if (crumb.nav) document.body.dataset.activeNav = crumb.nav;
      initEventDetailMeta();
      // clicking a tag (or event) link from here crumbs back to this event
      const title = document.querySelector('.event-detail-title');
      if (title) {
        trackEventLinks(() => ({
          label: title.textContent.trim(),
          href: `events/${location.pathname.split('/').pop()}`,
          nav: 'archive'
        }));
      }
    }
    renderHeader();
    renderNav();
    renderFooter();
    renderBreadcrumb();
    initExternalLinkObserver();
  };

  let headerState = { shrink: 1 };

  let accordionInit = false;

  const initHeaderAccordion = () => {
    const header = document.querySelector('.site-header');
    const logotype = document.querySelector('.logotype');
    const tagline = document.querySelector('.tagline');
    const navBand = document.querySelector('.nav-band');
    if (!header || !logotype || !navBand) return headerState;
    // a second init would stack duplicate scroll/resize listeners
    if (accordionInit) return headerState;
    accordionInit = true;

    const compact = 48;
    const logoCompact = 30;
    let glide = 0;
    let taglineGlide = 0;
    let scaleTo = 1;
    let ticking = false;
    const taglineSpan = tagline ? tagline.querySelector('span') : null;
    let taglineSpent = false; // fully faded once; next reveal gets a fresh line

    // the carried-over scroll must reach the nav band's pin point, not just
    // the logotype's shrink point, or a pinned nav lands ~50px unpinned
    // after a page change and the bands visibly jump
    const carryScroll = () => {
      const tabBand = document.querySelector('.tab-band');
      const navStickyTop = parseFloat(getComputedStyle(navBand).top) || 46;
      const pinAt = tabBand
        ? tabBand.offsetTop + tabBand.offsetHeight - navStickyTop + 1
        : 0;
      return Math.max(headerState.shrink, pinAt);
    };

    const update = () => {
      ticking = false;
      const p = Math.max(0, Math.min(1, window.scrollY / headerState.shrink));
      try {
        localStorage.setItem('visualistHeaderScroll', Math.min(window.scrollY, carryScroll()));
      } catch {}
      logotype.style.transform =
        `translateY(${(glide * p).toFixed(2)}px) scale(${(1 - (1 - scaleTo) * p).toFixed(4)})`;
      const fade = Math.max(0, 1 - p * 1.8);
      if (fade <= 0) {
        taglineSpent = true;
      } else if (taglineSpent) {
        taglineSpent = false;
        if (taglineSpan) taglineSpan.textContent = randomLine();
      }
if (tagline) {
        tagline.style.opacity = fade.toFixed(3);
        const scale = 1 - (1 - scaleTo) * p;
        tagline.style.transform = `translateY(${(taglineGlide * p).toFixed(2)}px) scale(${scale.toFixed(3)})`;
        tagline.style.transformOrigin = 'top center';
      }
      navBand.classList.toggle('pinned', navBand.getBoundingClientRect().top <= compact + 0.5);
    };

    const measure = () => {
      logotype.style.transform = '';
      const headerHeight = header.offsetHeight;
      headerState.shrink = Math.max(1, headerHeight - compact);
      header.style.top = `-${headerState.shrink}px`;
      const logoHeight = logotype.offsetHeight;
      scaleTo = logoCompact / logoHeight;
      glide = (headerHeight - compact / 2) - (logotype.offsetTop + logoHeight / 2);
      taglineGlide = (glide - (logoHeight / 2) * (1 - scaleTo)) / 2;
      update();
    };

    // the saved accordion position must be read before measure(): its
    // update() pass writes the store and would clobber the carried-over
    // value with 0, re-expanding the header on every page change
    let savedScroll = null;
    try { savedScroll = localStorage.getItem('visualistHeaderScroll'); } catch {}

    measure();

    try {
      const navEntry = performance.getEntriesByType('navigation')[0];
      const isFresh = !navEntry || navEntry.type === 'navigate';
      if (isFresh && savedScroll !== null && window.scrollY === 0) {
        window.scrollTo({ top: Number(savedScroll), behavior: 'instant' });
      }
    } catch {}

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });

    return headerState;
  };

  let datePickerOpening = false;

  const showDatePicker = input => {
    if (!input || input.disabled) return;
    input.focus();
    if (datePickerOpening) return;

    datePickerOpening = true;
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    } catch {}
    window.setTimeout(() => { datePickerOpening = false; }, 0);
  };

  const initDatePickers = (scope = document) => {
    scope.querySelectorAll('input[type="date"]').forEach(input => {
      input.addEventListener('pointerdown', () => showDatePicker(input));
      input.addEventListener('click', () => showDatePicker(input));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') showDatePicker(input);
      });
    });
  };

  const monthIndex = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11
  };

  const ordinal = day => {
    const teen = day % 100;
    if (teen >= 11 && teen <= 13) return `${day}th`;
    const suffixes = ['th', 'st', 'nd', 'rd'];
    return `${day}${suffixes[day % 10] || 'th'}`;
  };

  const isoFromTextDate = text => {
    const match = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
    if (!match) return '';
    const month = monthIndex[match[1].toLowerCase()];
    const day = Number(match[2]);
    return `2026-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const isoForOffset = offset => {
    const now = new Date();
    now.setDate(now.getDate() + offset);
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  };

  const todayIso = () => isoForOffset(0);
  const tomorrowIso = () => isoForOffset(1);

  const dateHeading = iso => {
    const date = new Date(`${iso}T12:00:00`);
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
    return Object.assign(document.createElement('div'), {
      className: 'event-date',
      innerHTML: `<span class="event-date-day">${weekday}</span><em class="event-date-num">${month} ${ordinal(date.getDate())}</em>`
    });
  };

  const archiveMatch = (title, href) => {
    const events = window.ARCHIVE_EVENTS_2026 ||
      (typeof ARCHIVE_EVENTS_2026 !== 'undefined' ? ARCHIVE_EVENTS_2026 : []);
    return events.find(event => event.u === href || event.p === href) ||
      events.find(event => (event.t || '').trim().toLowerCase() === title.trim().toLowerCase()) ||
      {};
  };

  const eventDetails = (title, href) => {
    const details = window.EVENT_DETAILS_2026 || {};
    return details[href] || archiveMatch(title, href);
  };

  const plainSlug = label => String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const tagSlug = label => {
    const normalized = String(label || '').trim().toLowerCase();
    const tags = window.TAGS_2026 || (typeof TAGS_2026 !== 'undefined' ? TAGS_2026 : []);
    const match = tags.find(tag =>
      tag.n.toLowerCase() === normalized || tag.s.toLowerCase() === normalized
    );
    if (match) return match.s;
    return plainSlug(label);
  };

  const tagLinks = tags => {
    const links = (tags || [])
      .map(tag => ({ label: tag, slug: tagSlug(tag) }))
      .filter(tag => tag.slug)
      .slice(0, 4);
    if (!links.length) return '';
    return `<p class="listing-tags">${links.map(tag =>
      `<a href="${localHref(`tag.html?tag=${encodeURIComponent(tag.slug)}`)}">${escapeHtml(tag.label)}</a>`
    ).join('')}</p>`;
  };

  const cleanSubmission = submission => {
    const now = new Date().toISOString();
    const sourceUrl = String(submission.sourceUrl || submission.url || '').trim();
    const listingType = submission.listingType === 'exhibition' ? 'exhibition' : 'event';
    // keep the opening-reception date and the exhibition run distinct: an
    // exhibition can carry both (opening + on-view-through). The listed date is
    // resolved later in submissionToEvent (opening if present, else run start).
    const eventDate = String(submission.eventDate || '').trim();
    const artists = Array.isArray(submission.artists)
      ? submission.artists
      : splitList(submission.artists);
    const tags = Array.isArray(submission.tags)
      ? submission.tags
      : splitList(submission.tags);
    return {
      id: submission.id || submissionId(),
      status: submission.status || 'pending',
      submittedAt: submission.submittedAt || now,
      updatedAt: now,
      sourceUrl,
      title: String(submission.title || '').trim(),
      artists: artists.map(item => String(item || '').trim()).filter(Boolean),
      venue: String(submission.venue || '').trim(),
      venueUrl: String(submission.venueUrl || '').trim(),
      address: String(submission.address || '').trim(),
      mapUrl: String(submission.mapUrl || '').trim(),
      neighborhood: String(submission.neighborhood || '').trim(),
      listingType,
      eventDate,
      eventStart: String(submission.eventStart || '').trim(),
      eventEnd: String(submission.eventEnd || '').trim(),
      exhibitionStart: String(submission.exhibitionStart || '').trim(),
      exhibitionEnd: String(submission.exhibitionEnd || '').trim(),
      onViewText: String(submission.onViewText || '').trim(),
      imageUrl: String(submission.imageUrl || '').trim(),
      imageName: String(submission.imageName || '').trim(),
      detailUrl: String(submission.detailUrl || '').trim(),
      description: String(submission.description || '').trim(),
      contactEmail: String(submission.contactEmail || '').trim(),
      tags: tags.map(item => String(item || '').trim()).filter(Boolean),
      passedAt: submission.passedAt || '',
      approvedAt: submission.approvedAt || '',
      publishAt: submission.publishAt || ''
    };
  };

  const submissionFromForm = async form => {
    const data = new FormData(form);
    const imageFile = data.get('your-image-upload');
    const imageUrl = String(data.get('post-image-url') || '').trim() ||
      await readFileAsDataUrl(imageFile);
    return cleanSubmission({
      sourceUrl: data.get('post-website'),
      title: data.get('post-title'),
      artists: data.get('your-artists'),
      venue: data.get('post-venue'),
      venueUrl: data.get('post-venue-url'),
      address: data.get('post-address'),
      mapUrl: data.get('post-map-url'),
      neighborhood: data.get('post-neighborhood'),
      listingType: data.get('listing-type'),
      eventDate: data.get('post-event-date'),
      eventStart: data.get('post-event-start'),
      eventEnd: data.get('post-event-end'),
      exhibitionStart: data.get('post-exhibition-start'),
      exhibitionEnd: data.get('post-exhibition-end'),
      imageUrl,
      imageName: imageFile && imageFile.name ? imageFile.name : '',
      description: data.get('post-content'),
      contactEmail: data.get('ContactE-mail'),
      tags: data.get('your-tags')
    });
  };

  // the submissions table is snake_case in Postgres; the JS side stays
  // camelCase. Empty strings have to become NULL for the DATE columns or the
  // insert is rejected.
  const SUBMISSION_DATE_COLS = ['event_date', 'exhibition_start', 'exhibition_end'];
  const nullIfBlank = value => {
    const trimmed = String(value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  };

  const submissionToRow = clean => {
    const row = {
      id: clean.id,
      status: clean.status,
      source_url: clean.sourceUrl,
      title: clean.title,
      artists: (clean.artists || []).join(', '),
      venue: clean.venue,
      venue_url: clean.venueUrl,
      address: clean.address,
      map_url: clean.mapUrl,
      neighborhood: clean.neighborhood,
      listing_type: clean.listingType,
      event_date: clean.eventDate,
      event_start: clean.eventStart,
      event_end: clean.eventEnd,
      exhibition_start: clean.exhibitionStart,
      exhibition_end: clean.exhibitionEnd,
      on_view_text: clean.onViewText,
      image_url: clean.imageUrl,
      image_name: clean.imageName,
      detail_url: clean.detailUrl,
      description: clean.description,
      contact_email: clean.contactEmail,
      tags: (clean.tags || []).join(', '),
      submitted_at: clean.submittedAt,
      updated_at: clean.updatedAt,
      approved_at: nullIfBlank(clean.approvedAt),
      passed_at: nullIfBlank(clean.passedAt),
      publish_at: nullIfBlank(clean.publishAt)
    };
    SUBMISSION_DATE_COLS.forEach(col => { row[col] = nullIfBlank(row[col]); });
    return row;
  };

  // admin reads the submissions table; map the snake_case row back to the
  // camelCase shape the queue UI expects (artists/tags split into arrays).
  const submissionFromRow = row => cleanSubmission({
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    passedAt: row.passed_at,
    publishAt: row.publish_at,
    sourceUrl: row.source_url,
    title: row.title,
    artists: row.artists,
    venue: row.venue,
    venueUrl: row.venue_url,
    address: row.address,
    mapUrl: row.map_url,
    neighborhood: row.neighborhood,
    listingType: row.listing_type,
    eventDate: row.event_date,
    eventStart: row.event_start,
    eventEnd: row.event_end,
    exhibitionStart: row.exhibition_start,
    exhibitionEnd: row.exhibition_end,
    onViewText: row.on_view_text,
    imageUrl: row.image_url,
    imageName: row.image_name,
    detailUrl: row.detail_url,
    description: row.description,
    contactEmail: row.contact_email,
    tags: row.tags
  });

  // map the frontend's short event keys onto the events table columns
  const eventToRow = event => ({
    title: event.t || '',
    permalink: event.u || '',
    path: event.p || '',
    venue: event.v || '',
    venue_url: event.vu || '',
    address: event.a || '',
    map_url: event.m || '',
    event_date: nullIfBlank(event.d),
    time_window: event.w || '',
    on_view_through: event.o || '',
    image_url: event.i || '',
    description: event.x || '',
    tags: Array.isArray(event.g) ? event.g : splitList(event.g),
    top_pick: event.k === 1,
    parent_event_id: event.parent_event_id || null
  });

  const eventFromRow = row => ({
    id: row.id,
    t: row.title,
    u: row.permalink,
    p: row.path,
    v: row.venue,
    d: row.event_date,
    i: row.image_url,
    x: row.excerpt !== undefined ? row.excerpt : row.description,
    g: row.tags || [],
    w: row.time_window,
    vu: row.venue_url,
    a: row.address,
    m: row.map_url,
    o: row.on_view_through,
    k: row.top_pick ? 1 : 0,
    sf: row.series_first ? 1 : 0,
    sl: row.series_last ? 1 : 0
  });

  const seriesGroupKey = event => `${String(event?.t || '').trim().toLowerCase()}|${String(event?.v || '').trim().toLowerCase()}`;

  const fetchEventById = async id => {
    if (!window.supabaseClient || !id) return null;
    const { data, error } = await window.supabaseClient
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? eventFromRow(data) : null;
  };

  const refreshSeriesFlagsForEvents = async events => {
    if (!window.supabaseClient) return [];
    const targets = (events || []).filter(event => event && event.t);
    const seen = new Set();
    const refreshed = [];
    for (const target of targets) {
      const key = seriesGroupKey(target);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let query = window.supabaseClient
        .from('events')
        .select('*')
        .eq('title', target.t || '');
      if (target.v) query = query.eq('venue', target.v);
      else query = query.or('venue.is.null,venue.eq.');
      const { data, error } = await query.order('event_date', { ascending: true });
      if (error) throw error;
      const rows = (data || []).map(row => ({ ...eventFromRow(row), sf: 0, sl: 0 }));
      scopeSeriesRuns(rows);
      refreshed.push(...rows);
      for (const event of rows) {
        const { error: updateError } = await window.supabaseClient
          .from('events')
          .update({ series_first: event.sf === 1, series_last: event.sl === 1 })
          .eq('id', event.id);
        if (updateError) throw updateError;
      }
      if (window.ARCHIVE_EVENTS_2026) {
        rows.forEach(event => {
          const index = window.ARCHIVE_EVENTS_2026.findIndex(row => row.id === event.id);
          if (index !== -1) {
            window.ARCHIVE_EVENTS_2026[index] = {
              ...window.ARCHIVE_EVENTS_2026[index],
              sf: event.sf,
              sl: event.sl
            };
          }
        });
      }
    }
    return refreshed;
  };

  // approving a submission inserts a fresh events row (the DB assigns the uuid
  // primary key); returns the new event in short-key form, id included.
  const publishEvent = async event => {
    if (!window.supabaseClient) return event;
    const { data, error } = await window.supabaseClient
      .from('events')
      .insert([eventToRow(event)])
      .select()
      .single();
    if (error) throw error;
    const saved = { ...event, id: data && data.id };
    const refreshed = await refreshSeriesFlagsForEvents([saved]);
    return refreshed.find(row => row.id === saved.id) || saved;
  };

  // public submit page: hand the submission to /api/submit, which verifies the
  // Turnstile token, stores it server-side (the submissions table no longer
  // takes public writes), and sends the emails. Errors propagate so the form
  // can tell the visitor it did not go through, instead of a false "thank you".
  const saveSubmittedEvent = async (submission, token) => {
    const clean = cleanSubmission(submission);
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token || '', row: submissionToRow(clean) })
    });
    if (!res.ok) throw new Error(`submit failed: ${res.status}`);
    return clean;
  };

  const updateSubmittedEvent = async (id, patch) => {
    const events = submittedEvents();
    const index = events.findIndex(event => event.id === id);
    if (index < 0) return null;

    const previousStatus = events[index].status;
    const next = cleanSubmission({ ...events[index], ...patch, id });

    if (window.supabaseClient) {
      try {
        await window.supabaseClient
          .from('submissions')
          .update(submissionToRow(next))
          .eq('id', id);
        
        
        // the first time a submission flips to approved, publish it to events
        if (next.status === 'approved' && previousStatus !== 'approved') {
          const eventsToPublish = submissionToEvents(next);
          let parentEventId = null;
          for (let i = 0; i < eventsToPublish.length; i++) {
            let ev = eventsToPublish[i];
            if (parentEventId) {
                ev.parent_event_id = parentEventId;
            }
            const published = await publishEvent(ev);
            if (i === 0 && eventsToPublish.length > 1) {
                parentEventId = published.id;
            }
          }
          // let the server email the submitter that their event is live (it
          // re-reads the row and sends via Resend; needs the admin's token)
          try {
            const { data: sess } = await window.supabaseClient.auth.getSession();
            const token = sess && sess.session && sess.session.access_token;
            if (token) {
              await fetch('/api/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, token })
              });
            }
          } catch (err) {
            console.error('publish notify failed', err);
          }
        }
} catch (e) {
        console.error(e);
      }
    }

    events[index] = next;
    window.SUBMISSIONS = events;
    return next;
  };


  const submissionToEvents = submission => {
    const clean = cleanSubmission(submission);
    
    // Create a base event factory
    const createBaseEvent = (start, timeStr) => {
      const end = clean.exhibitionEnd;
      const tagValues = [
        ...clean.tags,
        ...clean.artists,
        clean.venue,
        clean.neighborhood,
        clean.title
      ].map(tagSlug).filter(Boolean);
      const event = {
        t: clean.title || 'Untitled',
        u: clean.sourceUrl || `admin.html#${clean.id}`,
        p: clean.detailUrl || '',
        v: clean.venue,
        vu: clean.venueUrl,
        d: start,
        g: [...new Set(tagValues)],
        i: clean.imageUrl,
        x: clean.description,
        w: timeStr,
        a: clean.address,
        m: clean.mapUrl || mapUrlForAddress(clean.address),
        _submitted: true,
        _submittedId: clean.id
      };
      if (clean.onViewText) event.o = clean.onViewText;
      else if (end) event.o = `On view through ${dateLabel(end)}`;
      return event;
    };

    if (clean.occurrences && clean.occurrences.length > 0) {
      return clean.occurrences.map(occ => {
        const timeStr = occ.start && occ.end ? `${occ.start} – ${occ.end}` : (occ.start || '');
        return createBaseEvent(occ.date, timeStr);
      });
    }

    // the listed date is the opening reception when there is one, otherwise the
    // first day of the run (an exhibition with no opening reads as "no opening")
    const start = clean.eventDate || clean.exhibitionStart;
    const time = clean.eventStart && clean.eventEnd
      ? `${clean.eventStart} – ${clean.eventEnd}`
      : (clean.eventStart || '');
    return [createBaseEvent(start, time)];
  };

  const submissionToEvent = submission => {
    const clean = cleanSubmission(submission);
    // the listed date is the opening reception when there is one, otherwise the
    // first day of the run (an exhibition with no opening reads as "no opening")
    const start = clean.eventDate || clean.exhibitionStart;
    const end = clean.exhibitionEnd;
    const time = clean.eventStart && clean.eventEnd
      ? `${clean.eventStart} – ${clean.eventEnd}`
      : (clean.eventStart || '');
    const tagValues = [
      ...clean.tags,
      ...clean.artists,
      clean.venue,
      clean.neighborhood,
      clean.title
    ].map(tagSlug).filter(Boolean);
    const event = {
      t: clean.title || 'Untitled',
      u: clean.sourceUrl || `admin.html#${clean.id}`,
      p: clean.detailUrl || '',
      v: clean.venue,
      vu: clean.venueUrl,
      d: start,
      g: [...new Set(tagValues)],
      i: clean.imageUrl,
      x: clean.description,
      w: time,
      a: clean.address,
      m: clean.mapUrl || mapUrlForAddress(clean.address),
      _submitted: true,
      _submittedId: clean.id
    };
    if (clean.onViewText) event.o = clean.onViewText;
    else if (end) event.o = `On view through ${dateLabel(end)}`;
    return event;
  };

  const approvedSubmittedEvents = () => submittedEvents()
    .filter(event => event.status === 'approved')
    .map(submissionToEvent)
    .filter(event => event.d);

  // a double-run migration left near-identical rows behind; until the data
  // is deduped, one (permalink, title, date) shows once, preferring the row
  // with a local detail page (distinct legacy posts keep distinct permalinks)
  const dedupeEvents = events => {
    const byKey = new Map();
    (events || []).forEach(event => {
      const key = `${String(event.u || '').toLowerCase()}|${String(event.t || '').toLowerCase()}|${event.d || ''}`;
      const held = byKey.get(key);
      const local = e => String(e.p || '').startsWith('events/');
      if (!held || (local(event) && !local(held))) byKey.set(key, event);
    });
    return [...byKey.values()];
  };

  const isoPlusDays = (iso, days) => {
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const rawOnViewEndIso = ev => {
    if (!ev) return '';
    // prefer the date resolved once by refresh_on_view_end.js; the text parse
    // below is the fallback for rows not yet backfilled (and merged entries)
    if (ev.oe) return ev.oe >= (ev.d || '') ? ev.oe : '';
    let row = ev;
    if (!row.o) {
      const match = archiveMatch(row.t || '', row.p || row.u || '');
      if (!match.o) return '';
      row = { ...row, o: match.o, d: row.d || match.d };
    }
    const [baseYear, baseMonth] = (row.d || '').split('-').map(Number);
    const end = onViewEnd(row.o, baseYear, baseMonth);
    if (!end) return '';
    const pad = n => String(n).padStart(2, '0');
    const iso = `${end.year}-${pad(end.month)}-${pad(end.day)}`;
    return iso >= (row.d || '') ? iso : '';
  };

  const seriesPillsHtml = event => {
    if (!rawOnViewEndIso(event)) return '';
    return `${event.sf ? ' <span class="series-pill">Opening</span>' : ''}${event.sl ? ' <span class="series-pill">Last in series</span>' : ''}`;
  };

  // an exhibition posted once per session (opening, artist talk, closing)
  // repeats the same on-view run on every row. Only overlapping dated rows in
  // a real exhibition run get badges; recurring programs with the same title
  // and venue but no shared run are left alone.
  const scopeSeriesRuns = events => {
    const groups = new Map();
    events.forEach(event => {
      event._serverSeriesLast = event.sl === 1;
      event._serverSeriesFirst = event.sf === 1;
      event.sf = 0;
      event.sl = 0;
      if (event._runScoped) {
        event._runScoped = false;
        delete event._end;
      }
      const key = `${String(event.t || '').toLowerCase()}|${String(event.v || '').toLowerCase()}`;
      const group = groups.get(key) || [];
      group.push(event);
      groups.set(key, group);
    });
    const applyCluster = cluster => {
      if (new Set(cluster.map(item => item.event.d)).size < 2) return;
      const first = cluster.reduce((a, b) => (b.event.d < a.event.d ? b : a)).event;
      const last = cluster.reduce((a, b) => (b.event.d > a.event.d ? b : a)).event;
      cluster.forEach(({ event }) => {
        const scoped = event !== first;
        if (event._runScoped !== scoped) {
          event._runScoped = scoped;
          delete event._end; // archive caches the run end per row
        }
      });
      first.sf = 1;
      last.sl = 1;
    };
    groups.forEach(rows => {
      if (new Set(rows.map(event => event.d)).size < 2) return;
      const runnable = rows
        .map(event => ({ event, end: rawOnViewEndIso(event) }))
        .filter(item => item.event.d && item.end)
        .sort((a, b) => a.event.d.localeCompare(b.event.d));
      let cluster = [];
      let clusterEnd = '';
      runnable.forEach(item => {
        if (!cluster.length || item.event.d <= isoPlusDays(clusterEnd, 1)) {
          cluster.push(item);
          if (!clusterEnd || item.end > clusterEnd) clusterEnd = item.end;
        } else {
          applyCluster(cluster);
          cluster = [item];
          clusterEnd = item.end;
        }
      });
      applyCluster(cluster);
    });
    events.forEach(event => {
      const end = rawOnViewEndIso(event);
      if (!event.sf && event._serverSeriesFirst && end && event.d < end) {
        event.sf = 1;
      }
      if (!event.sl && event._serverSeriesLast && end && event.d === end) {
        event.sl = 1;
      }
      delete event._serverSeriesFirst;
      delete event._serverSeriesLast;
    });
    return events;
  };

  const normalizeEvents = events => scopeSeriesRuns(applyEventEdits(dedupeEvents(events)));

  const publicEvents = events => {
    const editedEvents = normalizeEvents(events);
    const existing = new Set(editedEvents.map(event =>
      `${String(event.u || '').toLowerCase()}|${String(event.t || '').toLowerCase()}|${event.d || ''}`
    ));
    const approved = approvedSubmittedEvents().filter(event => {
      const key = `${String(event.u || '').toLowerCase()}|${String(event.t || '').toLowerCase()}|${event.d || ''}`;
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    return scopeSeriesRuns(applyEventEdits([...editedEvents, ...approved]));
  };

  const tagLabel = value => {
    const normalized = String(value || '').trim().toLowerCase();
    const tags = window.TAGS_2026 || (typeof TAGS_2026 !== 'undefined' ? TAGS_2026 : []);
    const match = tags.find(tag =>
      tag.s.toLowerCase() === normalized || tag.n.toLowerCase() === normalized
    );
    if (match) return match.n;
    return String(value || '').replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  };

  const eventExcerpt = (title, href) => {
    const direct = (window.EVENT_EXCERPTS_2026 || {})[href];
    if (direct) return direct;
    return eventDetails(title, href).x || '';
  };

  // migrated descriptions can be whole detail-page bodies; an excerpt wants
  // the prose only, not the markup or the auxiliary link headings
  const excerptProse = html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => h.remove());
    return doc.body.textContent.replace(/\s+/g, ' ').trim();
  };

  // scraped excerpts occasionally carry literal character references
  // (&#8216;) or stray control characters; normalize them before escaping
  const cleanExcerptText = text => {
    text = String(text);
    if (/<[a-z][^>]*>/i.test(text)) text = excerptProse(text);
    return text
    .replace(/&#(\d+);/g, (m, n) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : m))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => (parseInt(n, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(n, 16)) : m))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // migrated descriptions end in auxiliary link labels, not prose
    // (case-sensitive: leaves "visit the official website" sentences alone)
    .replace(/\s*(?:Official Website|Original Listing)\s*/g, ' ')
    .trim();
  };

  const excerptMarkup = (text, href) => {
    if (!text) return '';
    text = cleanExcerptText(text);
    const trail = String(text).match(/(\.{3}|…)\s*$/);
    const body = trail ? String(text).slice(0, trail.index).replace(/\s+$/, '') + '…' : String(text);
    // the clamp can cut mid-word at line 4, which reads as missing text; pair it
    // with a "Read more" link revealed only when the text is actually clamped
    // (markClampedDescriptions adds .is-clamped after measuring)
    return `<p class="event-description clamp-lines">${escapeHtml(body)}<a href="${escapeHtml(href || '')}" class="description-fade-link" aria-label="View event details" tabindex="-1"></a></p><a href="${escapeHtml(href || '')}" class="description-more-link">Read more →</a>`;
  };

  // a clamped paragraph hides its trailing text behind a fade; reveal the
  // sibling "Read more" link only on the ones that overflow their 4 lines
  const markClampedDescriptions = root => {
    if (!root || !root.querySelectorAll) return;
    const items = root.matches?.('.clamp-lines') ? [root] : root.querySelectorAll('.clamp-lines');
    items.forEach(p => {
      p.classList.toggle('is-clamped', p.scrollHeight - p.clientHeight > 1);
    });
  };

  const eventTagMarkup = (title, href) => tagLinks(eventDetails(title, href).g);

  // "On view through Saturday, June 20th" + the opening month/year → end date;
  // the year rolls over when the closing month precedes the opening month
  const onViewEnd = (text, baseYear, baseMonth) => {
    const match = String(text || '').match(/through\s+(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})/i);
    if (!match || !baseYear) return null;
    const month = monthIndex[match[1].toLowerCase()];
    if (month === undefined) return null;
    // the year rolls over for a plausible span (a winter opening closing in
    // spring); a close 7+ months "later" is a scrape artifact — an on-view
    // date from before the opening — not a real run
    const rolled = baseMonth && month + 1 < baseMonth;
    if (rolled && 12 - baseMonth + month + 1 > 6) return null;
    const year = rolled ? baseYear + 1 : baseYear;
    return { year, month: month + 1, day: Number(match[2]) };
  };

  const onViewDate = (text, baseYear, baseMonth) => {
    const end = onViewEnd(text, baseYear, baseMonth);
    if (!end) return '';
    const pad = n => String(n).padStart(2, '0');
    const date = new Date(`${end.year}-${pad(end.month)}-${pad(end.day)}T12:00:00`);
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
    return `${weekday}, ${month} ${ordinal(end.day)}`;
  };

  // ISO end of an event's run (its on-view close), '' when it has no run
  const onViewEndIso = ev => {
    if (!ev) return '';
    if (ev._runScoped) return ''; // a series row matches its own date only
    // prefer the stored end date over re-parsing the free-text on-view line
    if (ev.oe) return ev.oe >= (ev.d || '') ? ev.oe : '';
    if (!ev.o) {
      // tag data lacks o on the homepage-merged entries; the archive has them
      const match = archiveMatch(ev.t || '', ev.p || ev.u || '');
      if (!match.o) return '';
      ev = { ...ev, o: match.o, d: ev.d || match.d };
    }
    const [baseYear, baseMonth] = (ev.d || '').split('-').map(Number);
    const end = onViewEnd(ev.o, baseYear, baseMonth);
    if (!end) return '';
    const pad = n => String(n).padStart(2, '0');
    const iso = `${end.year}-${pad(end.month)}-${pad(end.day)}`;
    return iso >= (ev.d || '') ? iso : ''; // a run can't close before it opens
  };

  // among candidate tag slugs, the exhibition's own tag is the one matching the
  // event title — whole-title match wins, else the longest slug found inside it
  const pickExhibitionSlug = (titleSlug, candidates) => {
    let best = '';
    candidates.forEach(slug => {
      if (!slug || best === titleSlug) return;
      if (slug === titleSlug) { best = slug; return; }
      if (`-${titleSlug}-`.includes(`-${slug}-`) && slug.length > best.length) best = slug;
    });
    return best;
  };

  // event tags arrive as display names (archive/search data) or slugs (tag data)
  const exhibitionTagSlug = ev => {
    const tags = window.TAGS_2026 || (typeof TAGS_2026 !== 'undefined' ? TAGS_2026 : []);
    if (!tags.length) return '';
    const byName = new Map();
    const slugs = new Set();
    tags.forEach(tag => { byName.set(tag.n.toLowerCase(), tag.s); slugs.add(tag.s); });
    const venueSlug = plainSlug(ev.v);
    const candidates = (ev.g || [])
      .map(g => byName.get(String(g).trim().toLowerCase()) || (slugs.has(g) ? g : ''))
      .filter(slug => slug && slug !== venueSlug);
    return pickExhibitionSlug(plainSlug(ev.t), candidates);
  };

  const scheduleLineHtml = text => {
    const value = String(text || '');
    const match = value.match(/^(Opening|On view through|On view)\b/i);
    if (!match) return escapeHtml(value);
    return `<strong>${escapeHtml(match[1])}</strong>${escapeHtml(value.slice(match[1].length))}`;
  };

  const emphasizeScheduleLine = line => {
    if (!line || line.querySelector('strong')) return;
    const target = line.querySelector('a') || line;
    target.innerHTML = scheduleLineHtml(target.textContent.trim());
  };

  // "6PM – 9PM" → {start, end}; "7PM" → {start}; anything else → null
  
  const timeValue = w => {
    if (!w) return 2400; // no time -> end of day
    const match = String(w).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!match) return 2400;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || '0', 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 100 + minutes;
  };

  const sortAsc = (a, b) => {
    return (a.d || '').localeCompare(b.d || '') || 
           (timeValue(a.w) - timeValue(b.w)) || 
           (a.t || '').localeCompare(b.t || '');
  };

  const sortDesc = (a, b) => {
    return (b.d || '').localeCompare(a.d || '') || 
           (timeValue(a.w) - timeValue(b.w)) || 
           (a.t || '').localeCompare(b.t || '');
  };

  const timeBounds = value => {
    const text = String(value || '').trim();
    const time = /^\d{1,2}(?::\d{2})?\s*(?:AM|PM)$/i;
    const parts = text.split(/\s+to\s+|\s*[–—-]\s*/i).map(part => part.trim());
    if (parts.length === 2 && time.test(parts[0]) && time.test(parts[1])) {
      return { start: parts[0], end: parts[1] };
    }
    return time.test(text) ? { start: text } : null;
  };

  // "Opening Friday, June 12th, from 6PM – 9PM" → the bare opening line
  // plus its parsed times, so Start/End can lead the schedule block
  const detachOpeningTimes = text => {
    const match = String(text).match(/^(Opening .*?),\s*(?:from|at)\s+(.+)$/i);
    const bounds = match && timeBounds(match[2]);
    return bounds ? { line: match[1], bounds } : null;
  };

  const startEndWhenHtml = bounds => !bounds ? '' :
    `<span class="event-when event-time-bounds"><strong>Start</strong> ${escapeHtml(bounds.start)}` +
    (bounds.end ? `<strong class="event-time-end">End</strong> ${escapeHtml(bounds.end)}` : '') +
    '</span>';

  // image strips load ~10KB thumbnails (scripts/build_image_thumbs.py)
  // instead of full uploads; markup falls back to the original via onerror
  const thumbSrc = src => /^media\//.test(String(src || ''))
    ? String(src).replace(/^media\//, 'media/thumbs/').replace(/\.(png|jpe?g|gif|webp)$/i, '.jpg')
    : String(src || '');

  // compact on-view line, linked to the exhibition's tag page when one exists
  const onViewHtml = ev => {
    if (!ev) return '';
    if (!ev.o) {
      // tag data lacks o on the homepage-merged entries; the archive has them
      const match = archiveMatch(ev.t || '', ev.p || ev.u || '');
      if (!match.o) return '';
      ev = { ...ev, o: match.o, d: ev.d || match.d };
    }
    const [baseYear, baseMonth] = (ev.d || '').split('-').map(Number);
    const date = onViewDate(ev.o, baseYear, baseMonth);
    if (!date) {
      const fallback = ev.o.replace(/^On view\b/i, 'On view through');
      return `<p class="event-when">${escapeHtml(fallback)}</p>`;
    }
    const slug = exhibitionTagSlug(ev);
    const text = `On view through ${date}`;
    return `<p class="event-when">${slug
      ? `<a href="${localHref(`tag.html?tag=${encodeURIComponent(slug)}`)}">${scheduleLineHtml(text)}</a>`
      : scheduleLineHtml(text)}</p>`;
  };

  // detail pages: drop the bare date line under the title (the Opening line
  // already carries it) and compact the on-view line, linking it to the
  // exhibition's tag page via the card's own tag links (no data files here)
  // "+calendar" beside the breadcrumb date: offers this event's
  // pre-generated sibling .ics — opening lands in whatever calendar app the OS calls default
  const breadcrumbCalendarHtml = () => {
    const icsFile = location.pathname.split('/').pop().replace(/\.html$/, '.ics');
    return `
      <span class="breadcrumb-calendar">
        <a href="${escapeHtml(icsFile)}" download class="calendar-toggle" aria-label="Add to calendar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2"></rect>
            <line x1="8" y1="3" x2="8" y2="7"></line>
            <line x1="16" y1="3" x2="16" y2="7"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
            <line x1="12" y1="13.5" x2="12" y2="18.5"></line>
            <line x1="9.5" y1="16" x2="14.5" y2="16"></line>
          </svg>
        </a>
      </span>`;
  };

  const initBreadcrumbCalendar = nav => {
    // Menu dropped in favor of direct download, no JS needed
  };

  const initEventDetailMeta = () => {
    const meta = document.querySelector('.event-detail-meta');
    if (!meta) return;
    const spans = [...meta.querySelectorAll('span')];
    const dateSpan = spans.find(s => /^[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}(?:,.*)?$/.test(s.textContent.trim()));
    let baseYear = 0;
    let baseMonth = 0;
    
    const locationDiv = document.createElement('div');
    locationDiv.className = 'event-location';
    const scheduleDiv = document.createElement('div');
    scheduleDiv.className = 'event-schedule';
    
    if (dateSpan) {
      const dm = dateSpan.textContent.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
      if (dm) {
        baseMonth = (monthIndex[dm[1].toLowerCase()] ?? -1) + 1;
        baseYear = Number(dm[3]);
        if (baseMonth) {
          const pad = n => String(n).padStart(2, '0');
          detailDate = {
            text: dateSpan.textContent.trim(),
            iso: `${baseYear}-${pad(baseMonth)}-${pad(Number(dm[2]))}`
          };
        }
      }
      if (/(?:AM|PM)/i.test(dateSpan.textContent)) {
        // If it has time (non-recurring event), keep it as the date/time display
        dateSpan.classList.add('event-when');
        scheduleDiv.appendChild(dateSpan);
      } else {
        // Otherwise it's redundant with the Opening line, so remove it
        dateSpan.remove();
      }
    }
    const liveSpans = spans.filter(s => s !== dateSpan || /(?:AM|PM)/i.test(s.textContent));
    // the address line links to a Google Maps search, like the listing cards
    liveSpans.forEach(span => {
      const text = span.textContent.trim();
      if (span.classList.contains('event-when')) {
        if (span.parentElement !== scheduleDiv) scheduleDiv.appendChild(span);
        return;
      }
      if (/^(opening|on view)/i.test(text)) {
        span.classList.add('event-when');
        scheduleDiv.appendChild(span);
        return;
      }
      if (span.querySelector('.event-source-link')) return; // ignore official link

      // If it looks like an address, link it and mark as address
      if (!span.querySelector('a') && text.includes(',') && /\d/.test(text)) {
        span.innerHTML = `<a href="http://maps.google.com/maps?q=${encodeURIComponent(text)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
        span.classList.add('event-address');
        locationDiv.appendChild(span);
      } else {
        // Otherwise, it's the venue name
        span.classList.add('event-venue');
        locationDiv.appendChild(span);
      }
    });

    const whenSpans = [...scheduleDiv.querySelectorAll('.event-when')];
    let openingSpan = whenSpans.find(s => /^opening/i.test(s.textContent.trim()));
    let onViewSpan = whenSpans.find(s => /^on view/i.test(s.textContent.trim()));
    
    if (openingSpan && onViewSpan) {
      const extractDateStr = text => {
        const m = text.match(/([A-Za-z]+)\s+(\d{1,2})/);
        return m ? `${m[1].toLowerCase()} ${m[2]}` : null;
      };
      const openDate = extractDateStr(openingSpan.textContent);
      const closeDate = extractDateStr(onViewSpan.textContent);
      if (openDate && closeDate && openDate === closeDate) {
        openingSpan.remove();
        onViewSpan.remove();
      }
    }

    if (scheduleDiv.hasChildNodes()) meta.insertBefore(scheduleDiv, meta.firstChild);
    if (locationDiv.hasChildNodes()) meta.insertBefore(locationDiv, meta.firstChild);

    // when-lines lead with a bold "Opening"/"On view", like the listing cards
    [...scheduleDiv.querySelectorAll('.event-when')]
      .forEach(emphasizeScheduleLine);
    // parseable opening times become their own Start/End row
    openingSpan = [...scheduleDiv.querySelectorAll('.event-when')].find(s => /^opening/i.test(s.textContent.trim()));
    const openingSplit = openingSpan && detachOpeningTimes(openingSpan.textContent.trim());
    if (openingSplit) {
      openingSpan.innerHTML = scheduleLineHtml(openingSplit.line);
      openingSpan.insertAdjacentHTML('beforebegin', startEndWhenHtml(openingSplit.bounds));
    }
    onViewSpan = [...scheduleDiv.querySelectorAll('.event-when')].find(s => /^on view/i.test(s.textContent.trim()));
    if (!onViewSpan) return;
    const date = onViewDate(onViewSpan.textContent, baseYear, baseMonth);
    if (!date) return;
    const titleEl = document.querySelector('.event-detail-title');
    const titleSlug = plainSlug(titleEl ? titleEl.textContent : '');
    const metaTexts = new Set(spans.map(s => s.textContent.trim().toLowerCase()));
    const bySlug = new Map();
    document.querySelectorAll('.event-detail-body .listing-tags a').forEach(a => {
      if (metaTexts.has(a.textContent.trim().toLowerCase())) return; // venue tag
      const m = (a.getAttribute('href') || '').match(/[?&]tag=([^&]+)/);
      if (m) bySlug.set(decodeURIComponent(m[1]), a);
    });
    const best = pickExhibitionSlug(titleSlug, [...bySlug.keys()]);
    const text = `On view through ${date}`;
    onViewSpan.innerHTML = best
      ? `<a href="${bySlug.get(best).getAttribute('href')}" target="_blank" rel="noopener">${scheduleLineHtml(text)}</a>`
      : scheduleLineHtml(text);
  };

  // "Opening Friday, June 12th, from 6PM – 9PM" from archive date + time fields
  const openingLineFor = match => {
    if (!match.d) return '';
    const date = new Date(`${match.d}T12:00:00`);
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
    let line = `${weekday}, ${month} ${ordinal(date.getDate())}`;
    if (match.o) {
      line = `Opening ${line}`;
    }
    // parseable times become their own Start/End row instead of a tail
    if (match.w && !timeBounds(match.w)) {
      line += match.w.includes('–') ? `, from ${match.w}` : `, at ${match.w}`;
    }
    return line;
  };

  const ongoingCardFromListing = item => {
    const link = item.querySelector('.listing-title');
    const venue = item.querySelector('.listing-venue');
    const meta = item.querySelector('.listing-meta');
    if (!link || !meta) return null;

    const title = link.textContent.trim();
    const href = link.getAttribute('href') || '#';
    const match = archiveMatch(title, href);
    const local = match.p || href;
    const pick = (item.querySelector('.top-pick') || match.k)
      ? ' <a class="top-pick" href="tag.html?tag=top-v">Top V</a>' : '';
    const opening = openingLineFor(match);
    const article = document.createElement('article');
    article.className = 'event-card event-card-on-view';
    article.innerHTML = `
      <a class="event-thumb" href="${escapeHtml(local)}">
        ${match.i ? `<img src="${escapeHtml(match.i)}" alt="" loading="lazy">` : ''}
      </a>
      <div class="event-info">
        <h3 class="event-title"><a href="${escapeHtml(local)}">${escapeHtml(title)}</a>${pick}</h3>
        ${(venue || match.a || opening || match.o) ? `<div class="event-meta-grid">
          ${(venue || match.a) ? `<div class="event-location">
            ${venue ? `<p class="event-venue"><a href="${escapeHtml(match.vu || match.u || local)}" target="_blank" rel="noopener">${escapeHtml(venue.textContent.trim())}</a></p>` : ''}
            ${match.a ? `<p class="event-address">${match.m
              ? `<a href="${escapeHtml(match.m)}">${escapeHtml(match.a)}</a>`
              : escapeHtml(match.a)}</p>` : ''}
          </div>` : ''}
          <div class="event-schedule">
            ${onViewHtml({ ...match, o: match.o || meta.textContent.trim() })}
          </div>
        </div>` : ''}
        ${excerptMarkup(match.x, local)}
        ${tagLinks(match.g)}
        <div class="event-liner"></div>
      </div>`;
    return article;
  };

  const groupCardMeta = (card, details = null) => {
    const info = card.querySelector('.event-info');
    if (!info || info.querySelector(':scope > .event-meta-grid')) return;
    let venue = info.querySelector(':scope > .event-venue');
    let address = info.querySelector(':scope > .event-address');
    
    if (details) {
      if (venue) {
        const venueLink = venue.querySelector('a');
        if (venueLink && (details.vu || details.u || details.p)) {
          // the venue name reaches the venue's own site when we know it
          venueLink.setAttribute('href', details.vu || details.u || details.p);
          venueLink.setAttribute('target', '_blank');
          venueLink.setAttribute('rel', 'noopener');
        }
      }
      if (!address && details.a) {
        address = document.createElement('p');
        address.className = 'event-address';
        if (details.m) {
          const a = document.createElement('a');
          a.setAttribute('href', details.m);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
          a.textContent = details.a;
          address.append(a);
        } else {
          address.textContent = details.a;
        }
      }
    }

    const whens = [...info.querySelectorAll(':scope > .event-when')];
    if (!venue && !address && !whens.length) return;

    const meta = document.createElement('div');
    meta.className = 'event-meta-grid';
    (venue || address || whens[0]).before(meta);

    if (venue || address) {
      const location = document.createElement('div');
      location.className = 'event-location';
      if (venue) location.append(venue);
      if (venue && address) location.append(' ');
      if (address) location.append(address);
      meta.append(location);
    }

    if (whens.length) {
      const schedule = document.createElement('div');
      schedule.className = 'event-schedule';
      const hasOnView = whens.some(when => /^on view/i.test(when.textContent.trim()));
      whens.forEach(when => {
        const text = when.textContent.trim();
        // in the week flow a passed opening reads as noise once the show
        // is on view; the archive and detail pages keep both lines
        if (hasOnView && /^opening/i.test(text)) {
          const iso = isoFromTextDate(text);
          if (iso && iso < todayIso()) {
            when.remove();
            return;
          }
        }
        emphasizeScheduleLine(when);
        schedule.append(when);
        const split = detachOpeningTimes(text);
        if (split) {
          when.innerHTML = scheduleLineHtml(split.line);
          when.insertAdjacentHTML('beforebegin', startEndWhenHtml(split.bounds));
        }
      });
      meta.append(schedule);
    }
  };

  const addEventDescriptions = () => {
    document.querySelectorAll('.event-card').forEach(card => {
      const titleLink = card.querySelector('.event-title a');
      const liner = card.querySelector('.event-liner');
      if (!titleLink || !liner) return;
      const title = titleLink.textContent.trim();
      const href = titleLink.getAttribute('href') || '';
      const details = eventDetails(title, href);
      if (details.p) {
        titleLink.setAttribute('href', details.p);
        titleLink.removeAttribute('target');
        titleLink.removeAttribute('rel');
        const thumbLink = card.querySelector('.event-thumb');
        if (thumbLink) {
          thumbLink.setAttribute('href', details.p);
          thumbLink.removeAttribute('target');
          thumbLink.removeAttribute('rel');
        }
      }
      groupCardMeta(card, details);
      if (!card.querySelector('.event-description')) {
        const text = eventExcerpt(title, href);
        if (text) liner.insertAdjacentHTML('beforebegin', excerptMarkup(text, details.p || href));
      }
      if (!card.querySelector('.listing-tags')) {
        const tags = eventTagMarkup(title, href);
        if (tags) liner.insertAdjacentHTML('beforebegin', tags);
      }
      const onViewP = [...card.querySelectorAll('.event-when')]
        .find(p => /^on view/i.test(p.textContent.trim()));
      if (onViewP) {
        const match = archiveMatch(title, href);
        const html = onViewHtml({ ...match, o: match.o || onViewP.textContent.trim() });
        if (html) onViewP.outerHTML = html;
      }
      groupCardMeta(card, details);
    });
  };

  const mergeOngoingIntoDatedFlow = () => {
    document.querySelectorAll('#view-this-week, #view-next-week').forEach(view => {
      const items = [];
      let activeDate = '';
      let order = 0;

      [...view.children].forEach(child => {
        if (child.classList.contains('event-date')) {
          activeDate = isoFromTextDate(child.textContent);
          return;
        }

        if (child.classList.contains('event-card') && activeDate) {
          const tEl = child.querySelector('.event-title');
          const wEl = child.querySelector('.event-when');
          items.push({ 
            date: activeDate, 
            order: order++, 
            node: child, 
            ongoing: false,
            t: tEl ? tEl.textContent.trim() : '',
            w: wEl ? wEl.textContent.trim() : ''
          });
          return;
        }

        if (child.matches('.view-heading') && child.textContent.trim().toLowerCase() === 'on view') {
          const list = child.nextElementSibling;
          if (!list) return;

          const openDates = items.filter(it => !it.ongoing).map(it => it.date).sort();
          const lo = openDates[0];
          const hi = openDates[openDates.length - 1];
          if (!lo) return;

          list.querySelectorAll('.listing-item').forEach(item => {
            const meta = item.querySelector('.listing-meta');
            const date = meta ? isoFromTextDate(meta.textContent) : '';
            if (!date || date < lo || date > hi) return;
            const card = ongoingCardFromListing(item);
            if (card) {
              const tEl = card.querySelector('.event-title');
              const wEl = card.querySelector('.event-when');
              items.push({ 
                date, 
                order: order++, 
                node: card, 
                ongoing: true,
                t: tEl ? tEl.textContent.trim() : '',
                w: wEl ? wEl.textContent.trim() : ''
              });
            }
          });
        }
      });

      // Always sort and replace children to ensure correct chronological order
      view.replaceChildren();
      const dates = [...new Set(items.map(item => item.date))].sort();
      dates.forEach(date => {
        view.append(dateHeading(date));
        items
          .filter(item => item.date === date)
          .sort((a, b) => 
            Number(a.ongoing) - Number(b.ongoing) || 
            (timeValue(a.w) - timeValue(b.w)) || 
            a.t.localeCompare(b.t)
          )
          .forEach(item => view.append(item.node));
      });
    });
    addEventDescriptions();
  };

  // Graceful image degradation. Many archived listings have a missing or dead
  // (404 / stale remote) image. Removing the broken <img> lets the card or
  // detail page collapse to its no-image layout (the :has() rules in styles.css)
  // instead of rendering the browser's broken-image icon. Image error events do
  // not bubble but do fire in the capture phase, so one document-level listener
  // covers every image, including ones added as the archive/listings render.
  const degradeBrokenImage = img => {
    if (!img || img.tagName !== 'IMG') return;
    if (img.closest('.event-thumb') || img.closest('.event-detail-image')) img.remove();
  };

  let googlePlacesPromise = null;
  let googlePlacesKeyWarned = false;

  const googleMapsApiKey = () => String(
    window.VISUALIST_GOOGLE_MAPS_API_KEY ||
    window.SITE_SETTINGS?.google_maps_api_key ||
    document.querySelector('meta[name="visualist-google-maps-key"]')?.content ||
    ''
  ).trim();

  const loadGooglePlaces = () => {
    if (window.google?.maps?.importLibrary) {
      return window.google.maps.importLibrary('places');
    }
    if (googlePlacesPromise) return googlePlacesPromise;
    const key = googleMapsApiKey();
    if (!key) {
      if (!googlePlacesKeyWarned) {
        console.info('Google Maps address autocomplete is disabled: set window.VISUALIST_GOOGLE_MAPS_API_KEY or a visualist-google-maps-key meta tag.');
        googlePlacesKeyWarned = true;
      }
      return Promise.resolve(null);
    }
    googlePlacesPromise = new Promise((resolve, reject) => {
      const callback = `visualistGoogleMapsReady_${Date.now().toString(36)}`;
      window[callback] = () => {
        delete window[callback];
        window.google.maps.importLibrary('places').then(resolve, reject);
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places&callback=${callback}`;
      script.async = true;
      script.onerror = () => {
        delete window[callback];
        reject(new Error('Could not load Google Maps Places'));
      };
      document.head.appendChild(script);
    });
    return googlePlacesPromise;
  };

  const googleMapUrlForPlace = (place, fallbackAddress) => {
    if (place?.id) {
      const query = encodeURIComponent(place.formattedAddress || place.displayName || fallbackAddress || '');
      return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(place.id)}`;
    }
    if (place?.location) {
      const lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
      const lng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
      if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    return mapUrlForAddress(fallbackAddress);
  };

  // neighborhood inputs get the same suggest dropdown the venue and tag
  // fields use, fed from the static neighborhood list — no network involved
  const initNeighborhoodTypeahead = (root = document) => {
    const inputs = [...root.querySelectorAll('input[data-neighborhood-typeahead]')]
      .filter(input => !input.dataset.neighborhoodTypeaheadReady);
    inputs.forEach(input => {
      input.dataset.neighborhoodTypeaheadReady = '1';
      const field = input.closest('.submit-field') || input.parentElement;
      if (field) field.classList.add('has-address-autocomplete');
      const suggest = document.createElement('div');
      suggest.className = 'search-suggest neighborhood-suggest';
      suggest.setAttribute('role', 'listbox');
      suggest.setAttribute('aria-label', 'Matching neighborhoods');
      suggest.hidden = true;
      input.insertAdjacentElement('afterend', suggest);

      let options = [];
      let index = -1;
      const hide = () => {
        options = [];
        index = -1;
        suggest.hidden = true;
        suggest.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
      };
      const paint = () => {
        [...suggest.querySelectorAll('.search-suggest-item')].forEach((item, i) => {
          item.classList.toggle('active', i === index);
          item.setAttribute('aria-selected', String(i === index));
        });
      };
      const pick = i => {
        if (!options[i]) return;
        input.value = options[i];
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        hide();
      };
      const render = () => {
        const q = input.value.trim().toLowerCase();
        if (!q) return hide();
        const starts = [];
        const contains = [];
        for (const name of chicagoNeighborhoods()) {
          const lower = name.toLowerCase();
          if (lower.startsWith(q)) starts.push(name);
          else if (lower.includes(q)) contains.push(name);
        }
        options = [...starts, ...contains].slice(0, 7);
        // an exact lone match needs no dropdown
        if (!options.length || (options.length === 1 && options[0].toLowerCase() === q)) return hide();
        index = 0;
        suggest.innerHTML = options.map(name =>
          `<button type="button" class="search-suggest-item" role="option" aria-selected="false"><span>${escapeHtml(name)}</span></button>`
        ).join('');
        suggest.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        paint();
        [...suggest.querySelectorAll('.search-suggest-item')].forEach((item, i) => {
          item.addEventListener('mousedown', event => event.preventDefault());
          item.addEventListener('click', () => pick(i));
          item.addEventListener('mousemove', () => {
            if (index !== i) { index = i; paint(); }
          });
        });
      };
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-expanded', 'false');
      input.addEventListener('input', render);
      input.addEventListener('blur', () => window.setTimeout(hide, 120));
      input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (suggest.hidden || !options.length) return;
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          index = (index + step + options.length) % options.length;
          paint();
        } else if (event.key === 'Enter' && !suggest.hidden && options[index]) {
          event.preventDefault();
          pick(index);
        } else if (event.key === 'Escape') {
          hide();
        }
      });
    });
  };

  const initAddressAutocomplete = (root = document) => {
    const inputs = [...root.querySelectorAll('input[data-address-autocomplete]')]
      .filter(input => !input.dataset.addressAutocompleteReady);
    inputs.forEach(input => {
      input.dataset.addressAutocompleteReady = '1';
      const field = input.closest('.submit-field') || input.parentElement;
      if (field) field.classList.add('has-address-autocomplete');
      const suggest = document.createElement('div');
      suggest.className = 'search-suggest address-suggest';
      suggest.setAttribute('role', 'listbox');
      suggest.setAttribute('aria-label', 'Suggested addresses');
      suggest.hidden = true;
      input.insertAdjacentElement('afterend', suggest);

      let sessionToken = null;
      let suggestions = [];
      let suggestIndex = -1;
      let requestId = 0;
      let timer = null;

      const hide = () => {
        suggestions = [];
        suggestIndex = -1;
        suggest.hidden = true;
        suggest.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
      };
      const paint = () => {
        [...suggest.querySelectorAll('.search-suggest-item')].forEach((item, index) => {
          item.classList.toggle('active', index === suggestIndex);
          item.setAttribute('aria-selected', String(index === suggestIndex));
        });
      };
      const placeLabel = prediction => prediction?.text?.toString?.() || prediction?.mainText?.toString?.() || '';
      const render = () => {
        if (!suggestions.length) return hide();
        suggest.innerHTML = suggestions.map(item => {
          const label = placeLabel(item.placePrediction);
          return `<button type="button" class="search-suggest-item" role="option" aria-selected="false">${escapeHtml(label)}</button>`;
        }).join('');
        suggest.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        [...suggest.querySelectorAll('.search-suggest-item')].forEach((button, index) => {
          button.addEventListener('mousedown', event => event.preventDefault());
          button.addEventListener('click', () => selectSuggestion(index));
          button.addEventListener('mousemove', () => {
            if (suggestIndex !== index) {
              suggestIndex = index;
              paint();
            }
          });
        });
      };
      const updateMapUrl = (place, address) => {
        const form = input.form || input.closest('form');
        const mapInput = form?.querySelector('input[name="post-map-url"], input[name="mapUrl"], input[name="m"]');
        if (mapInput) mapInput.value = googleMapUrlForPlace(place, address);
      };
      const selectSuggestion = async index => {
        const prediction = suggestions[index]?.placePrediction;
        if (!prediction) return;
        const label = placeLabel(prediction);
        try {
          const place = prediction.toPlace();
          await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] });
          const address = place.formattedAddress || label;
          input.value = address;
          updateMapUrl(place, address);
          if (place.displayName) {
            const form = input.form || input.closest('form');
            const venue = form?.querySelector('input[name="post-venue"], input[name="venue"], input[name="v"]');
            if (venue && !venue.value.trim()) {
              venue.value = String(place.displayName);
              venue.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        } catch {
          input.value = label;
          updateMapUrl(null, label);
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        sessionToken = null;
        hide();
      };
      const fetchSuggestions = async () => {
        const query = input.value.trim();
        const thisRequest = ++requestId;
        if (query.length < 3) return hide();
        const places = await loadGooglePlaces().catch(() => null);
        if (!places?.AutocompleteSuggestion || !places?.AutocompleteSessionToken) return;
        sessionToken ||= new places.AutocompleteSessionToken();
        const { suggestions: next = [] } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken,
          region: 'us',
          language: 'en-US',
          includedRegionCodes: ['us'],
          locationBias: { west: -88.7, north: 42.8, east: -87.0, south: 41.0 }
        });
        if (thisRequest !== requestId) return;
        suggestions = next.filter(item => item.placePrediction).slice(0, 6);
        suggestIndex = suggestions.length ? 0 : -1;
        render();
        paint();
      };

      input.setAttribute('autocomplete', 'street-address');
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-expanded', 'false');
      input.addEventListener('input', () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(fetchSuggestions, 180);
      });
      input.addEventListener('blur', () => window.setTimeout(hide, 120));
      input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (suggest.hidden || !suggestions.length) return;
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          suggestIndex = (suggestIndex + step + suggestions.length) % suggestions.length;
          paint();
        } else if (event.key === 'Enter' && !suggest.hidden && suggestions[suggestIndex]) {
          event.preventDefault();
          selectSuggestion(suggestIndex);
        } else if (event.key === 'Escape') {
          hide();
        }
      });
    });
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('error', event => degradeBrokenImage(event.target), true);

    // Global listener for Top V tag popovers
    document.addEventListener('click', event => {
      const tag = event.target.closest('.top-pick, .top-pick-heading-link');
      if (!tag) {
        // If clicking outside, close any open popover
        const openPopover = document.querySelector('.top-pick-popover');
        if (openPopover && !event.target.closest('.top-pick-popover')) {
          openPopover.remove();
        }
        return;
      }

      // If it's a click on a Top V tag/heading link
      event.preventDefault();
      event.stopPropagation();

      const existing = document.querySelector('.top-pick-popover');
      if (existing) {
        const openedBy = existing.dataset.openedBy;
        existing.remove();
        // If clicked the same tag, we just close it and return
        if (openedBy === tag.textContent + tag.getBoundingClientRect().left) {
          return;
        }
      }

      // Create new popover
      const popover = document.createElement('div');
      popover.className = 'top-pick-popover';
      popover.dataset.openedBy = tag.textContent + tag.getBoundingClientRect().left;
      popover.innerHTML = `
        <p class="popover-text">The top 5 visual arts events happening in Chicagoland this week. <em>Published in collaboration with <a href="https://badatsports.com/author/visualist/" target="_blank" rel="noopener">Bad at Sports</a>.</em></p>
        <a href="${localHref('tag.html?tag=top-v')}" class="popover-link">View all Top V picks →</a>
      `;
      document.body.appendChild(popover);

      // Position popover
      const rect = tag.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      // Position below the tag, centered horizontally relative to it
      let top = rect.bottom + scrollY + 8;
      let left = rect.left + scrollX + (rect.width / 2) - 145; // 145 is half of 290px max-width

      // Keep within viewport boundaries
      if (left < 10) left = 10;
      if (left + 290 > window.innerWidth - 10) {
        left = window.innerWidth - 300;
      }

      // If there isn't enough space below, show it above the tag
      if (rect.bottom + 150 > window.innerHeight && rect.top > 150) {
        top = rect.top + scrollY - popover.offsetHeight - 8;
      }

      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    });
  }

  const fetchPagedRows = async (buildQuery, pageSize = 1000) => {
    const rows = [];
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await buildQuery().range(start, start + pageSize - 1);
      if (error) return { data: rows, error };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return { data: rows, error: null };
  };

  window.Visualist = Object.assign(window.Visualist || {}, {
    renderChrome,
    trackEventLinks,
    renderHeader,
    renderNav,
    renderFooter,
    initHeaderAccordion,
    initDatePickers,
    addEventDescriptions,
    excerptHtml: excerptMarkup,
    openExternalLinks,
    onViewHtml,
    onViewEndIso,
    seriesPillsHtml,
    scheduleLineHtml,
    submittedEvents,
    saveSubmittedEvent,
    saveSubmittedEvents,
    updateSubmittedEvent,
    submissionFromForm,
    submissionFromRow,
    submissionToEvent,
    publishEvent,
    approvedSubmittedEvents,
    chicagoNeighborhoods,
    neighborhoodForVenue,
    eventKey,
    eventHref,
    fetchPagedRows,
    eventEdits,
    saveEventEdit,
    clearEventEdit,
    refreshSeriesFlagsForEvents,
    taglines,
    saveTaglines,
    saveTaglineRows,
    randomLine,
    applyEventEdits,
    normalizeEvents,
    eventFromRow,
    publicEvents,
    timeValue,
    sortAsc,
    sortDesc,
    tagLabel,
    tagSlug,
    timeBounds,
    startEndWhenHtml,
    thumbSrc,
    todayIso,
    initAddressAutocomplete,
    initNeighborhoodTypeahead,
    dayHeadingHtml: iso => dateHeading(iso).outerHTML,
    mergeOngoingIntoDatedFlow,
    showDatePicker,
    getHeaderShrink: () => headerState.shrink,
    tomorrowIso
  });
})();
