/* ==========================================================================
   Liahona — UI primitives (DOM helpers, icons, sheets, toasts, dialogs)
   Classic script on purpose: ES modules are blocked on file:// origins.
   ========================================================================== */
window.UI = (function () {
  'use strict';

  /* ------------------------------------------------------------ escaping */

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
  }

  /** Escapes a string for safe interpolation into a RegExp. */
  function reEsc(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ------------------------------------------------------------------ DOM */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const val = attrs[key];
        if (val === null || val === undefined || val === false) continue;
        if (key === 'class') node.className = val;
        else if (key === 'dataset') Object.assign(node.dataset, val);
        else if (key.startsWith('on') && typeof val === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else node.setAttribute(key, val === true ? '' : val);
      }
    }
    if (html !== undefined && html !== null) node.innerHTML = html;
    return node;
  }

  /** Event delegation: on(root, 'click', '[data-act]', handler) */
  function on(root, type, selector, handler) {
    root.addEventListener(type, function (event) {
      const match = event.target.closest(selector);
      if (match && root.contains(match)) handler(event, match);
    });
  }

  /* ---------------------------------------------------------------- icons */

  function icon(name, className, filled) {
    const cls = 'material-symbols-outlined ' + (className || '');
    const style = filled ? " style=\"font-variation-settings:'FILL' 1\"" : '';
    return `<span class="${esc(cls)}" aria-hidden="true"${style}>${esc(name)}</span>`;
  }

  /* ------------------------------------------------------------ fragments */

  /** Joins truthy class names into a single attribute-ready string. */
  function cx() {
    const out = [];
    for (let i = 0; i < arguments.length; i++) {
      const arg = arguments[i];
      if (!arg) continue;
      if (typeof arg === 'string') out.push(arg);
      else if (Array.isArray(arg)) out.push(cx.apply(null, arg));
      else if (typeof arg === 'object') {
        for (const k of Object.keys(arg)) if (arg[k]) out.push(k);
      }
    }
    return out.join(' ');
  }

  /** Wraps every occurrence of `term` in <mark>, operating on escaped text. */
  function highlightTerms(text, terms) {
    let out = esc(text);
    if (!terms || !terms.length) return out;
    const pattern = terms
      .filter(Boolean)
      .map(reEsc)
      .sort((a, b) => b.length - a.length)
      .join('|');
    if (!pattern) return out;
    return out.replace(new RegExp('(' + pattern + ')(?![^<]*>)', 'gi'), '<mark class="search-hit">$1</mark>');
  }

  /* --------------------------------------------------------------- toast */

  let toastTimer = null;

  function toast(message, options) {
    const opts = options || {};
    const root = $('#toast-root');
    if (!root) return;
    root.innerHTML = '';
    const tone = opts.tone || 'neutral';
    const toneClass = {
      neutral: 'bg-primary text-on-primary',
      good: 'bg-primary text-secondary-container',
      bad: 'bg-error-container text-on-error-container',
    }[tone];

    const node = el('div', {
      class: cx(
        'pointer-events-auto flex items-center gap-space-xs px-space-md py-space-sm rounded-full shadow-level2',
        'text-label-lg font-semibold max-w-sm animate-[fadeUp_.2s_ease-out]',
        toneClass
      ),
    });
    node.innerHTML = `${icon(opts.icon || (tone === 'bad' ? 'error' : 'check_circle'), 'text-[18px] shrink-0')}<span>${esc(message)}</span>`;
    root.appendChild(node);

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.style.transition = 'opacity .2s ease';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 220);
    }, opts.duration || 2600);
  }

  /* --------------------------------------------------------------- sheet */

  let openSheet = null;

  function closeSheet() {
    if (!openSheet) return;
    const { backdrop, panel, restoreFocus, onClose } = openSheet;
    openSheet = null;
    panel.style.transform = 'translateY(100%)';
    panel.style.opacity = '0';
    backdrop.style.opacity = '0';
    setTimeout(() => {
      backdrop.remove();
      panel.remove();
      if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus();
    }, 220);
    if (onClose) onClose();
    document.body.style.overflow = '';
  }

  /**
   * Bottom sheet (Level 3 elevation per DESIGN.md).
   * opts: { title, subtitle, body, actions:[{label,icon,tone,onClick,close}], dismissable, onClose, size }
   */
  function sheet(opts) {
    closeSheet();
    const restoreFocus = document.activeElement;

    const backdrop = el('div', {
      class: 'fixed inset-0 z-[70] bg-[rgb(var(--inverse-surface)/0.45)] backdrop-blur-[2px] transition-opacity duration-200',
      'aria-hidden': 'true',
    });
    backdrop.addEventListener('click', () => {
      if (opts.dismissable !== false) closeSheet();
    });

    const panel = el('section', {
      class: cx(
        'fixed inset-x-0 bottom-0 z-[71] bg-surface border-t border-outline-variant shadow-level3',
        'rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)] transform translate-y-full opacity-0',
        'transition-all duration-200 ease-out flex flex-col',
        opts.size === 'tall' ? 'h-[86vh]' : 'max-h-[86vh]'
      ),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': opts.title || 'Panel',
    });

    panel.innerHTML = `
      <div class="shrink-0 pt-space-xs pb-space-2xs flex justify-center" aria-hidden="true">
        <div class="w-10 h-1 rounded-full bg-outline-variant"></div>
      </div>
      ${
        opts.title
          ? `<header class="shrink-0 px-space-lg pb-space-sm flex items-start gap-space-sm">
               <div class="min-w-0 flex-1">
                 <h2 class="font-headline-sm text-headline-sm text-primary truncate">${esc(opts.title)}</h2>
                 ${
                   opts.subtitle
                     ? `<p class="font-marginalia text-marginalia text-on-surface-variant mt-0.5">${esc(opts.subtitle)}</p>`
                     : ''
                 }
               </div>
               <button type="button" data-sheet-close aria-label="Close"
                 class="shrink-0 w-9 h-9 -mr-1 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
                 ${icon('close', 'text-[20px]')}
               </button>
             </header>`
          : ''
      }
      <div class="sheet-body overflow-y-auto overscroll-contain px-space-lg pb-space-lg flex-1">${
        opts.body || ''
      }</div>
      ${
        opts.actions && opts.actions.length
          ? `<footer class="shrink-0 px-space-lg py-space-md border-t border-outline-variant bg-surface-container-low flex flex-wrap gap-space-sm justify-end">
               ${opts.actions
                 .map(
                   (a, i) => `<button type="button" data-action="${i}" class="${
                     a.tone === 'primary'
                       ? 'bg-primary text-on-primary'
                       : a.tone === 'gold'
                       ? 'bg-secondary-container text-on-secondary-container shadow-gold'
                       : a.tone === 'danger'
                       ? 'bg-error-container text-on-error-container'
                       : 'bg-surface-container text-primary hover:bg-surface-container-high'
                   } font-label-lg text-label-lg px-space-md py-2.5 rounded-full active:scale-[.98] transition-transform">${
                     a.icon ? icon(a.icon, 'text-[18px] mr-1.5') : ''
                   }${esc(a.label)}</button>`
                 )
                 .join('')}
             </footer>`
          : ''
      }`;

    const closeBtn = panel.querySelector('[data-sheet-close]');
    if (closeBtn) closeBtn.addEventListener('click', () => closeSheet());

    // any element inside the body can dismiss the sheet via data-sheet-close
    panel.addEventListener('click', (event) => {
      if (event.target.closest('[data-sheet-close]')) closeSheet();
    });

    panel.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = opts.actions[Number(btn.dataset.action)];
        if (!action) return;
        // the action may keep the sheet open (confirm dialogs close themselves)
        if (action.close !== false) closeSheet();
        if (action.onClick) action.onClick();
      });
    });

    document.getElementById('sheet-root').append(backdrop, panel);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
      panel.style.opacity = '1';
    });

    openSheet = { backdrop, panel, restoreFocus, onClose: opts.onClose };

    const focusTarget = panel.querySelector('[data-autofocus]') || closeBtn;
    if (focusTarget) setTimeout(() => focusTarget.focus(), 60);

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && opts.dismissable !== false) closeSheet();
    });

    return { panel, close: closeSheet };
  }

  /* -------------------------------------------------------------- dialog */

  /**
   * Resolves true/false. The sheet is closed explicitly rather than by the
   * action handler, because closing fires onClose — which would resolve false
   * before the confirmed action ever ran.
   */
  function confirm(opts) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const handle = sheet({
        title: opts.title,
        body: `<p class="font-body-lg text-body-lg text-on-surface-variant">${esc(opts.message || '')}</p>`,
        actions: [
          // finish() must run before close(), because closing fires onClose,
          // which would otherwise resolve false first
          { label: opts.cancelLabel || 'Cancel', close: false, onClick: () => { finish(false); handle.close(); } },
          {
            label: opts.confirmLabel || 'Confirm',
            tone: opts.danger ? 'danger' : 'primary',
            close: false,
            onClick: () => { finish(true); handle.close(); },
          },
        ],
        onClose: () => finish(false),
      });
    });
  }

  /* ------------------------------------------------------------ clipboard */

  async function copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      /* fall through to the textarea path (needed for file:// origins) */
    }
    try {
      const area = el('textarea', { class: 'fixed opacity-0 pointer-events-none', 'aria-hidden': 'true' });
      area.value = text;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  async function share(text, title) {
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Liahona', text });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
    const ok = await copy(text);
    return ok ? 'copied' : 'failed';
  }

  /* --------------------------------------------------------------- dates */

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  /** Local-time YYYY-MM-DD (never UTC — a streak must not shift at midnight). */
  function isoDate(date) {
    const d = date || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function longDate(date) {
    const d = date || new Date();
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  function relativeTime(timestamp) {
    const diff = Date.now() - Number(timestamp || 0);
    if (!Number.isFinite(diff) || diff < 0) return 'just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    const d = new Date(Number(timestamp));
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  /** Which icon + label to greet the user with. */
  function greeting(date) {
    const h = (date || new Date()).getHours();
    if (h < 5) return { text: 'Still awake', icon: 'bedtime' };
    if (h < 12) return { text: 'Good morning', icon: 'wb_twilight' };
    if (h < 17) return { text: 'Good afternoon', icon: 'wb_sunny' };
    if (h < 21) return { text: 'Good evening', icon: 'nights_stay' };
    return { text: 'Good evening', icon: 'dark_mode' };
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (!m) return `${s}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }

  /* ------------------------------------------------------------- loading */

  function skeleton() {
    return `<div class="animate-pulse space-y-4 py-8" role="status" aria-label="Loading">
      <div class="h-6 w-1/3 bg-surface-container-highest rounded"></div>
      <div class="h-40 bg-surface-container rounded-xl"></div>
      <div class="h-24 bg-surface-container rounded-xl"></div>
    </div>`;
  }

  function emptyState(opts) {
    return `<div class="text-center py-space-2xl px-space-lg">
      <div class="w-14 h-14 mx-auto rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center mb-space-md">
        ${icon(opts.icon || 'inbox', 'text-[26px]')}
      </div>
      <h3 class="font-headline-sm text-headline-sm text-primary">${esc(opts.title)}</h3>
      <p class="font-body-md text-body-md text-on-surface-variant mt-1 max-w-xs mx-auto">${esc(opts.message || '')}</p>
      ${
        opts.action
          ? `<a href="${esc(opts.action.href)}" class="inline-flex items-center gap-space-xs mt-space-lg bg-primary text-on-primary font-label-lg text-label-lg px-space-md py-3 rounded-full shadow-level1 active:scale-[.98] transition-transform">${
              opts.action.icon ? icon(opts.action.icon, 'text-[18px]') : ''
            }${esc(opts.action.label)}</a>`
          : ''
      }
    </div>`;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function readingTimeMs(text, wpm) {
    const words = String(text || '').split(/\s+/).filter(Boolean).length;
    return (words / (wpm || 200)) * 60000;
  }

  return {
    esc, reEsc, $, $$, el, on, cx, icon, highlightTerms,
    toast, sheet, closeSheet, confirm, copy, share,
    isoDate, longDate, relativeTime, greeting, formatDuration,
    skeleton, emptyState, debounce, readingTimeMs,
  };
})();