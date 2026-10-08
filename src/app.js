/* ==========================================================================
   Liahona — app shell and router

   Routes
     #/                       home
     #/read                   last position
     #/read/:book             first chapter of a book
     #/read/:book/:chapter    a chapter
     #/read/:book/:ch/:verse  a chapter, scrolled to a verse
     #/read/:book/:ch?autoplay=1   read aloud on open
     #/search                 search (also #/search?q=…&book=…)
     #/library                volumes
     #/library/:book          chapter grid for one volume
     #/ask                    reflection (also #/ask?prompt=… or ?verse=…)
     #/saved                  bookmarks, highlights, notes, answers
     #/settings               preferences and data
   ========================================================================== */
(function () {
  'use strict';

  const root = document.getElementById('view-root');
  const headerLead = document.getElementById('header-lead');
  const headerTrail = document.getElementById('header-trail');
  const headerProgress = document.getElementById('header-progress');
  const headerBar = document.getElementById('header-progress-bar');
  const tabbar = document.getElementById('tabbar');

  const DEFAULT_HEADER_LEAD = headerLead ? headerLead.innerHTML : '';

  const ROUTES = [
    { pattern: /^\/?$/, view: 'home', tab: 'home' },
    { pattern: /^\/search$/, view: 'search', tab: 'home' },
    { pattern: /^\/read$/, view: 'read', tab: 'read', redirect: 'lastPosition' },
    { pattern: /^\/read\/([^/]+)(?:\/(\d+)(?:\/(\d+))?)?$/, view: 'read', tab: 'read' },
    { pattern: /^\/library$/, view: 'library', tab: 'library' },
    { pattern: /^\/library\/([^/]+)$/, view: 'libraryBook', tab: 'library' },
    { pattern: /^\/ask$/, view: 'ask', tab: 'ask' },
    { pattern: /^\/saved$/, view: 'saved', tab: 'saved' },
    { pattern: /^\/settings$/, view: 'settings', tab: 'settings' },
  ];

  /* ------------------------------------------------------------ lifecycle */

  let cleanup = null;
  let current = { path: null, view: null };
  let scrollMemory = {};
  let booted = false;

  function parseHash() {
    const raw = String(window.location.hash || '').replace(/^#/, '');
    const [pathPart, queryPart] = raw.split('?');
    const path = pathPart.replace(/^\/+|\/+$/g, '');
    const query = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((value, key) => {
        query[key] = value;
      });
    }
    return { path: '/' + path, rawPath: path, params: path.split('/').filter(Boolean), query };
  }

  function matchRoute(path) {
    for (const route of ROUTES) {
      const m = path.match(route.pattern);
      if (m) return { route, match: m };
    }
    return null;
  }

  /* -------------------------------------------------------------- header */

  function setHeader(spec) {
    const options = spec || {};

    if (options.lead === 'brand' || options.lead === undefined) {
      headerLead.innerHTML = DEFAULT_HEADER_LEAD;
    } else if (options.lead === 'back') {
      headerLead.innerHTML = `
        <button type="button" data-nav-back="${UI.esc(options.backTo || '#/')}"
          class="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          aria-label="${UI.esc(options.backLabel || 'Back')}">
          ${UI.icon('arrow_back', 'text-[22px]')}
        </button>
        <span class="font-headline-sm text-headline-sm text-primary truncate">${UI.esc(options.title || options.backLabel || '')}</span>`;
    } else if (options.lead === 'reader') {
      headerLead.innerHTML = `
        <a href="#/library" class="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="Back to library">
          ${UI.icon('arrow_back', 'text-[22px]')}
        </a>
        <span class="font-headline-sm text-headline-sm text-primary truncate">${UI.esc(options.reference || '')}</span>`;
    }

    headerTrail.innerHTML = options.trail || '';

    if (typeof options.progress === 'number' && options.progress > 0) {
      headerProgress.classList.remove('bg-transparent');
      headerBar.style.width = Math.round(Math.min(1, options.progress) * 100) + '%';
    } else {
      headerProgress.classList.add('bg-transparent');
      headerBar.style.width = '0%';
    }
  }

  /* ----------------------------------------------------------- tab state */

  /**
   * Header controls live in the fixed header, outside the view's root, so
   * views register their handlers here instead of on ctx.root. The registry
   * is cleared on every render.
   */
  const headerHandlers = [];

  function dispatchHeader(event) {
    for (let i = headerHandlers.length - 1; i >= 0; i--) {
      const { selector, handler } = headerHandlers[i];
      const match = event.target.closest(selector);
      if (match && headerTrail.contains(match)) {
        handler(event, match);
        return;
      }
    }
  }

  function setActiveTab(tab) {
    if (!tabbar) return;
    tabbar.querySelectorAll('[data-tab]').forEach((link) => {
      const on = link.dataset.tab === tab;
      link.setAttribute('aria-current', on ? 'page' : 'false');
      const nameEl = link.querySelector('.material-symbols-outlined');
      if (nameEl) {
        const name = nameEl.textContent.trim();
        nameEl.style.fontVariationSettings = on ? "'FILL' 1" : '';
        if (on && name) nameEl.textContent = name;
      }
      link.classList.toggle('text-primary', on);
      link.classList.toggle('text-on-surface-variant', !on);
    });
  }

  /* -------------------------------------------------------------- render */

  function scrollToTop(instant) {
    window.scrollTo({ top: 0, behavior: instant ? 'auto' : 'smooth' });
  }

  function render(options) {
    const opts = options || {};
    const route = parseHash();
    const found = matchRoute(route.path);

    // run the previous view's teardown
    // tear down the previous view before the next one registers its own
    if (cleanup) {
      try {
        cleanup();
      } catch (err) {
        console.error('[app] cleanup failed', err);
      }
      cleanup = null;
    }
    headerHandlers.length = 0;
    UI.closeSheet();
    if (window.TTS) TTS.stop();

    if (!found) {
      root.innerHTML = `<div class="px-margin max-w-3xl mx-auto">${UI.emptyState({
        icon: 'explore_off',
        title: 'That page does not exist',
        message: 'The link you followed points somewhere Liahona cannot find.',
        action: { href: '#/', label: 'Go home', icon: 'home' },
      })}</div>`;
      setHeader({ lead: 'brand', trail: null, progress: null });
      setActiveTab(null);
      current = { path: route.path, view: 'notfound' };
      return;
    }

    if (found.route.redirect === 'lastPosition') {
      const progress = Store.progress();
      window.location.replace('#/read/' + progress.book + '/' + progress.chapter + '/' + progress.verse);
      return;
    }

    // Ask owns the bottom strip: its composer replaces the tabbar's footing
    // by stacking right above it; content clears both.
    document.body.classList.toggle('ask-mode', found.route.tab === 'ask');

    const view = window.Views && window.Views[found.route.view];
    if (typeof view !== 'function') {
      root.innerHTML = `<div class="px-margin max-w-3xl mx-auto">${UI.emptyState({
        icon: 'error',
        title: 'View unavailable',
        message: 'The ' + found.route.view + ' view did not load.',
      })}</div>`;
      current = { path: route.path, view: found.route.view };
      return;
    }

    // remember the previous scroll position so going back feels right
    if (current.path) scrollMemory[current.path] = window.scrollY;

    root.setAttribute('aria-busy', 'true');

    const leaveHandlers = [];
    const ctx = {
      root,
      // capture groups only — the leading route segment is not a parameter
      params: found.match.slice(1).filter((part) => part !== undefined),
      query: route.query,
      anchor: route.query.verse || null,
      navigate,
      setHeader,
      setQuery(patch, silent) {
        setQueryParams(patch, silent);
      },
      rerender() {
        rerenderView();
      },
      onLeave(fn) {
        if (typeof fn === 'function') leaveHandlers.push(fn);
      },
      /** Attach a handler to a control in the fixed header. */
      onHeader(selector, handler) {
        headerHandlers.push({ selector, handler });
      },
    };

    try {
      view(ctx);
    } catch (err) {
      console.error('[app] view failed', found.route.view, err);
      root.innerHTML = `<div class="px-margin max-w-3xl mx-auto">${UI.emptyState({
        icon: 'error',
        title: 'Something broke',
        message: (err && err.message) || 'This view failed to render.',
        action: { href: '#/', label: 'Go home', icon: 'home' },
      })}</div>`;
    }

    cleanup = () => leaveHandlers.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[app] onLeave failed', err);
      }
    });

    root.removeAttribute('aria-busy');
    setActiveTab(found.route.tab);

    const remembered = opts.keepScroll ? scrollMemory[route.path] : null;
    if (remembered) window.scrollTo({ top: remembered, behavior: 'auto' });
    else scrollToTop(opts.instant);
  }

  /** Re-runs the current view without touching history or scroll. */
  function rerenderView() {
    const samePath = current.path;
    render({ instant: true, keepScroll: true });
    if (samePath) current.path = samePath;
  }

  function navigate(hash) {
    const target = String(hash || '#/');
    if (window.location.hash === target) {
      render({ instant: true });
      return;
    }
    window.location.hash = target;
  }

  function setQueryParams(patch, silent) {
    const route = parseHash();
    const params = new URLSearchParams();
    for (const key of Object.keys(route.query)) params.set(key, route.query[key]);
    for (const key of Object.keys(patch || {})) {
      const value = patch[key];
      if (value === null || value === undefined || value === '' || value === false) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    const nextHash = '#' + route.path + (query ? '?' + query : '');
    if (silent) {
      window.history.replaceState(null, '', nextHash);
      const found = matchRoute(route.path);
      if (found) current.path = route.path;
    } else {
      window.location.hash = nextHash;
    }
  }

  /* --------------------------------------------------------------- boot */

  function fatal(message, detail) {
    root.innerHTML = `<div class="px-margin max-w-3xl mx-auto">${UI.emptyState({
      icon: 'cloud_off',
      title: message,
      message: detail || '',
      action: detail ? null : { href: '#/', label: 'Reload', icon: 'refresh' },
    })}</div>`;
    setHeader({ lead: 'brand', trail: null, progress: null });
  }

  function boot() {
    if (!window.LIAHONA_BOOK_OF_MORMON) {
      fatal('Scripture text missing', 'data/book-of-mormon.js did not load. Run scripts/fetch-book-of-mormon.js, then reload.');
      return;
    }
    if (!Scripture.ready()) {
      fatal('Scripture text unavailable', 'The downloaded text could not be parsed.');
      return;
    }

    Scripture.build();
    Store.recomputeStreak();
    Store.applyTheme();

    window.addEventListener('hashchange', () => render());

    document.addEventListener('click', (event) => {
      const back = event.target.closest('[data-nav-back]');
      if (back) {
        event.preventDefault();
        navigate(back.dataset.navBack);
        return;
      }
      dispatchHeader(event);
    });

    if (!window.location.hash) navigate('#/');
    else render();

    booted = true;
    window.__LIAHONA_READY__ = true;
    console.info(
      '[liahona] ready ·',
      Scripture.stats().books,
      'books ·',
      Scripture.stats().chapters,
      'chapters ·',
      Scripture.stats().verses,
      'verses'
    );
  }

  /* --------------------------------------------------------- global keys */

  document.addEventListener('keydown', (event) => {
    if (!booted) return;
    if (event.target.matches('input, textarea, [contenteditable]')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === 's' && !event.shiftKey) {
      event.preventDefault();
      navigate('#/search');
    } else if (key === 'l') {
      event.preventDefault();
      navigate('#/library');
    } else if (key === 'a') {
      event.preventDefault();
      navigate('#/ask');
    } else if (key === 'h') {
      event.preventDefault();
      navigate('#/');
    } else if (key === '?') {
      event.preventDefault();
      navigate('#/saved');
    }
  });

  window.addEventListener('error', (event) => {
    console.error('[liahona]', event.message, event.filename + ':' + event.lineno);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();