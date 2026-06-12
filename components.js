(function () {
  const footerText = `<strong>The Visualist</strong> is an all-volunteer effort to document the
working life of visual artists and amplify the independent arts scenes
throughout Chicagoland. In time, <a href="index.html#archive" style="font-weight: 700; text-decoration: underline; color: inherit;">this archive</a> will reach back to the
calendar's beginnings in 2011. Help us keep it growing.`;

  // hosted_button_id from the PayPal form on thevisualist.org/about/
  const DONATE_URL = 'https://www.paypal.com/donate?hosted_button_id=947PHJMCQD9Q4';

  const footerLinks = [
    { label: 'About', href: 'about.html', local: true },
    { label: 'Instagram', href: 'https://www.instagram.com/visualistgo/' },
    { label: 'Facebook', href: 'https://www.facebook.com/visualistchicago/' },
    { label: 'Bad at Sports', href: 'https://badatsports.com/author/visualist/' },
    { label: 'events@thevisualist.org', href: 'mailto:events@thevisualist.org', local: true }
  ];

  const navItems = [
    // Today is the always-current virtual tag page, not an index view
    { key: 'today', label: 'Today', page: 'tag.html?tag=today' },
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

  const randomLine = () => {
    if (typeof window.randomTagline === 'function') return stripPeriods(window.randomTagline());
    return 'Chicago Visual Arts Calendar';
  };

  const renderHeader = () => {
    document.querySelectorAll('[data-visualist-header]').forEach(header => {
      header.className = 'site-header';
      const logo = `
        <span class="logotype-the">the</span>
        <span class="logotype-name">VISUALIST</span>`;
      header.innerHTML = `
        <a class="header-home-hit" href="${localHref('index.html')}" aria-hidden="true" tabindex="-1"></a>
        <a class="logotype" href="${localHref('index.html')}" aria-label="The Visualist home">${logo}</a>
        <p class="tagline"><span>${randomLine()}</span></p>`;
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
    const active = document.body.dataset.activeNav || (page === 'home' ? 'this-week' : page);
    document.querySelectorAll('[data-visualist-nav]').forEach(slot => {
      slot.innerHTML = `
        <div class="tab-band">
          <p class="band-label"><span class="flag-word">${chicagoFlagLetters}</span> Visual Arts Calendar</p>
        </div>
        <div class="nav-band">
          <div class="nav-block">
            <nav class="site-nav" aria-label="Primary">
              ${navItems.map(item => item.page
                ? `<a href="${localHref(item.page)}" class="${active === item.key ? 'active' : ''}">${item.label}</a>`
                : `<a href="${navHref(item.key)}" data-view="${item.key}" class="${active === item.key ? 'active' : ''}">${item.label}</a>
              `).join('')}
              <a href="${localHref('submit.html')}" class="nav-button ${page === 'submit' ? 'active' : ''}" ${page === 'submit' ? 'aria-current="page"' : ''}>Add Event</a>
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
          <p class="footer-copyright">&copy; ${new Date().getFullYear()} <a href="https://www.culturemath.org/" target="_blank" rel="noopener">culture/Math</a> &middot; made with <a href="https://madewithbestpractice.com" target="_blank" rel="noopener">best practice</a></p>
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
        sessionStorage.setItem(CRUMB_KEY, JSON.stringify(getCrumb()));
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
    const origin = `<a href="${escapeHtml(localHref(crumb.href))}" class="breadcrumb-arrow" style="opacity: 1;">${escapeHtml(crumb.label)}</a>`;
    if (page === 'event') {
      const title = document.querySelector('.event-detail-body .event-detail-title');
      if (!title) return;
      const dayDate = breadcrumbDayDate();
      const nav = breadcrumbNav(`
      ${origin}
      ${dayDate ? `<span class="breadcrumb-arrow" style="opacity: 0.6;">${detailDate
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

  const renderChrome = () => {
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
    
    // Lightbox for event details
    if (!document.getElementById('image-lightbox')) {
      document.body.insertAdjacentHTML('beforeend', `
        <dialog id="image-lightbox" class="image-lightbox">
          <form method="dialog"><button aria-label="Close lightbox"></button></form>
          <img src="" alt="">
        </dialog>
      `);
      
      document.addEventListener('click', e => {
        const btn = e.target.closest('.event-detail-image');
        if (btn && btn.tagName === 'BUTTON') {
          const img = btn.querySelector('img');
          const dialog = document.getElementById('image-lightbox');
          if (img && dialog) {
            const dialogImg = dialog.querySelector('img');
            dialogImg.src = img.src;
            dialogImg.alt = img.alt;
            dialog.showModal();
          }
        }
        // Close on backdrop click
        const dialog = e.target.closest('#image-lightbox');
        if (dialog && e.target === dialog) {
          dialog.close();
        }
      });
    }
  };

  let headerState = { shrink: 1 };

  const initHeaderAccordion = () => {
    const header = document.querySelector('.site-header');
    const logotype = document.querySelector('.logotype');
    const tagline = document.querySelector('.tagline');
    const navBand = document.querySelector('.nav-band');
    if (!header || !logotype || !tagline || !navBand) return headerState;

    const compact = 48;
    const logoCompact = 30;
    let glide = 0;
    let taglineGlide = 0;
    let scaleTo = 1;
    let ticking = false;
    const taglineSpan = tagline.querySelector('span');
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
      tagline.style.opacity = fade.toFixed(3);
      tagline.style.transform = `translateY(${(taglineGlide * p).toFixed(2)}px)`;
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

  const eventExcerpt = (title, href) => {
    const direct = (window.EVENT_EXCERPTS_2026 || {})[href];
    if (direct) return direct;
    return eventDetails(title, href).x || '';
  };

  // scraped excerpts occasionally carry literal character references
  // (&#8216;) or stray control characters; normalize them before escaping
  const cleanExcerptText = text => String(text)
    .replace(/&#(\d+);/g, (m, n) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : m))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => (parseInt(n, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(n, 16)) : m))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  // a shortened excerpt (the data marks it with a trailing "...") dissolves
  // at the end instead of showing an ellipsis; the faded tail keeps the link
  // to the event's detail page
  const excerptMarkup = (text, href) => {
    if (!text) return '';
    text = cleanExcerptText(text);
    const trail = String(text).match(/(\.{3}|…)\s*$/);
    if (!trail) return `<p class="event-description">${escapeHtml(text)}</p>`;
    const body = String(text).slice(0, trail.index).replace(/\s+$/, '');
    const cut = Math.max(0, body.length - 16);
    const head = escapeHtml(body.slice(0, cut));
    const tail = escapeHtml(body.slice(cut));
    return `<p class="event-description clamp-lines">${head}${href
      ? `<a class="excerpt-fade" href="${escapeHtml(href)}" aria-label="Read more">${tail}</a>`
      : `<span class="excerpt-fade">${tail}</span>`}</p>`;
  };

  const eventTagMarkup = (title, href) => tagLinks(eventDetails(title, href).g);

  // "On view through Saturday, June 20th" + the opening month/year → end date;
  // the year rolls over when the closing month precedes the opening month
  const onViewEnd = (text, baseYear, baseMonth) => {
    const match = String(text || '').match(/through\s+(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})/i);
    if (!match || !baseYear) return null;
    const month = monthIndex[match[1].toLowerCase()];
    if (month === undefined) return null;
    const year = baseMonth && month + 1 < baseMonth ? baseYear + 1 : baseYear;
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
    return `${end.year}-${pad(end.month)}-${pad(end.day)}`;
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
      openingSpan.insertAdjacentHTML('beforebegin',
        `<span class="event-time-bounds"><strong>Start</strong> ${escapeHtml(openingSplit.bounds.start)}` +
        (openingSplit.bounds.end
          ? ` <span class="event-time-end"><strong>End</strong> ${escapeHtml(openingSplit.bounds.end)}</span>`
          : '') +
        '</span>');
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
      ? ' <a class="top-pick" href="tag.html?tag=top-pick">Top Pick</a>' : '';
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
            ${venue ? `<p class="event-venue"><a href="${escapeHtml(local)}">${escapeHtml(venue.textContent.trim())}</a></p>` : ''}
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
        if (venueLink && (details.p || details.u)) {
          venueLink.setAttribute('href', details.p || details.u);
          venueLink.removeAttribute('target');
          venueLink.removeAttribute('rel');
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
    document.querySelectorAll('#view-this-week .event-card, #view-next-week .event-card').forEach(card => {
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
          items.push({ date: activeDate, order: order++, node: child, ongoing: false });
          return;
        }

        if (child.matches('.view-heading') && child.textContent.trim().toLowerCase() === 'on view') {
          const list = child.nextElementSibling;
          if (!list) return;

          // scope to this view's week: only closings that fall on the days
          // already in the flow belong here (the rest live in All Events)
          const openDates = items.filter(it => !it.ongoing).map(it => it.date).sort();
          const lo = openDates[0];
          const hi = openDates[openDates.length - 1];
          if (!lo) return;

          list.querySelectorAll('.listing-item').forEach(item => {
            const meta = item.querySelector('.listing-meta');
            const date = meta ? isoFromTextDate(meta.textContent) : '';
            if (!date || date < lo || date > hi) return;
            const card = ongoingCardFromListing(item);
            if (card) items.push({ date, order: order++, node: card, ongoing: true });
          });
        }
      });

      if (!items.some(item => item.ongoing)) return;

      view.replaceChildren();
      const dates = [...new Set(items.map(item => item.date))].sort();
      dates.forEach(date => {
        view.append(dateHeading(date));
        items
          .filter(item => item.date === date)
          .sort((a, b) => Number(a.ongoing) - Number(b.ongoing) || a.order - b.order)
          .forEach(item => view.append(item.node));
      });
    });
    addEventDescriptions();
  };

  window.Visualist = {
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
    scheduleLineHtml,
    timeBounds,
    startEndWhenHtml,
    thumbSrc,
    todayIso,
    dayHeadingHtml: iso => dateHeading(iso).outerHTML,
    mergeOngoingIntoDatedFlow,
    showDatePicker,
    getHeaderShrink: () => headerState.shrink,
    tomorrowIso
  };
})();
