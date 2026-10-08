/* ==========================================================================
   Settings — reading preferences, appearance, data, and the AI connection
   ========================================================================== */
window.Views = window.Views || {};

const BOFAVATARS = [
  { id: 'default', label: 'Compass' },
  { id: 'nephi', label: 'Nephi' },
  { id: 'lehi', label: 'Lehi' },
  { id: 'mormon', label: 'Mormon' },
  { id: 'moroni', label: 'Moroni' },
  { id: 'alma', label: 'Alma' },
  { id: 'ammon', label: 'Ammon' },
  { id: 'sariah', label: 'Sariah' },
  { id: 'abish', label: 'Abish' },
  { id: 'helaman', label: 'Helaman' },
  { id: 'enos', label: 'Enos' },
  { id: 'jacob', label: 'Jacob' },
  { id: 'ether', label: 'Ether' },
];

Views.settings = function (ctx) {
  let settings = Store.settings();

  ctx.setHeader({ lead: 'brand', trail: null, progress: null });

  /* ------------------------------------------------------------- helpers */

  function save(patch, message) {
    settings = Store.setSettings(patch);
    Store.applyTheme();
    if (message) UI.toast(message, { tone: 'good', icon: 'check' });
  }

  function segment(name, options, current) {
    return `<div class="seg" role="radiogroup" aria-label="${UI.esc(name)}">
      ${options
        .map(
          (opt) => `<button type="button" role="radio" aria-checked="${opt.id === current}" data-seg="${UI.esc(name)}" data-value="${UI.esc(opt.id)}"
            class="seg-btn${opt.id === current ? ' is-active' : ''}"
            ${opt.font ? `style="font-family:${UI.esc(opt.font)}"` : ''}>
            ${opt.icon ? UI.icon(opt.icon) : ''}<span>${UI.esc(opt.label)}</span>
          </button>`
        )
        .join('')}
    </div>`;
  }

  function appearanceRow(title, description, control) {
    return `<div class="setting-row">
      <div class="setting-row__label">
        <p class="font-body-lg text-body-lg text-primary">${UI.esc(title)}</p>
        ${description ? `<p class="font-marginalia text-marginalia text-on-surface-variant mt-0.5">${UI.esc(description)}</p>` : ''}
      </div>
      <div class="setting-row__control">${control}</div>
    </div>`;
  }

  function toggle(checked, label) {
    return `<button type="button" role="switch" aria-checked="${checked}" aria-label="${UI.esc(label)}"
      class="w-[52px] h-8 rounded-full p-1 flex items-center transition-colors ${checked ? 'bg-primary justify-end' : 'bg-surface-container-highest justify-start'}">
      <span class="w-6 h-6 rounded-full bg-surface-container-lowest shadow-level1 block"></span>
    </button>`;
  }

  function section(title, subtitle, body, icon) {
    return `<section class="bg-surface-container-low rounded-xl shadow-level1 overflow-hidden">
      <header class="px-space-md pt-space-md pb-space-xs">
        <div class="flex items-center gap-space-xs">
          ${icon ? UI.icon(icon, 'text-[18px] text-secondary') : ''}
          <h2 class="font-headline-sm text-headline-sm text-primary">${UI.esc(title)}</h2>
        </div>
        ${subtitle ? `<p class="font-marginalia text-marginalia text-on-surface-variant mt-0.5">${UI.esc(subtitle)}</p>` : ''}
      </header>
      <div class="px-space-md pb-space-md divide-y divide-outline-variant">${body}</div>
    </section>`;
  }

  function avatarTile(avatar) {
    const active = settings.avatar === avatar.id;
    return `<button type="button" role="radio" aria-checked="${active}" data-avatar="${UI.esc(avatar.id)}"
      aria-label="${UI.esc(avatar.label)}"
      class="flex flex-col items-center gap-1 p-2 rounded-xl border ${active ? 'border-primary bg-secondary-container/30' : 'border-outline-variant bg-surface-container-lowest'}">
      <img src="assets/avatars/${UI.esc(avatar.id)}.svg" alt="" width="48" height="48"
        class="w-12 h-12 rounded-full ${active ? 'ring-2 ring-primary' : ''}">
      <span class="font-label-sm text-label-sm ${active ? 'text-primary font-semibold' : 'text-on-surface-variant'}">${UI.esc(avatar.label)}</span>
    </button>`;
  }

  /* -------------------------------------------------------------- render */

  ctx.root.innerHTML = `
    <div class="space-y-space-lg pt-space-lg">

      ${section(
        'Profile',
        'Your name and profile picture',
        `
        <div class="py-space-sm">
          <label class="font-body-lg text-body-lg text-primary" for="profile-name">Display name</label>
          <input id="profile-name" data-act="profile-name" type="text" maxlength="40" value="${UI.esc(settings.profileName || '')}"
            placeholder="Study Companion"
            class="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-space-sm py-2 text-body-lg text-primary">
        </div>
        <div class="py-space-sm">
          <p class="font-body-lg text-body-lg text-primary">Profile picture</p>
          <p class="font-marginalia text-marginalia text-on-surface-variant mt-0.5">Tap a figure from the Book of Mormon.</p>
          <div class="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Profile picture">
            ${BOFAVATARS.map(avatarTile).join('')}
          </div>
        </div>`,
        'account_circle'
      )}

      ${section(
        'Appearance',
        'How the app looks',
        appearanceRow(
          'Theme',
          'Parchment, sepia, or night',
          segment(
            'theme',
            [
              { id: 'parchment', label: 'Parchment', icon: 'light_mode' },
              { id: 'sepia', label: 'Sepia', icon: 'local_cafe' },
              { id: 'night', label: 'Night', icon: 'dark_mode' },
            ],
            settings.theme
          )
        ) +
          appearanceRow(
            'Typeface',
            'Serif for scripture, sans for the interface',
            segment(
              'typeface',
              [
                { id: 'serif', label: 'Serif', font: 'Palatino, Georgia, serif' },
                { id: 'sans', label: 'Sans', font: 'system-ui, sans-serif' },
              ],
              settings.typeface
            )
          ) +
          appearanceRow(
            'Text size',
            'How large the scripture is set',
            segment(
              'density',
              [
                { id: 'compact', label: 'Compact' },
                { id: 'regular', label: 'Regular' },
                { id: 'comfortable', label: 'Comfortable' },
              ],
              settings.density
            )
          ) +
          appearanceRow(
            'Verse numbers',
            'Show the number beside each verse',
            toggle(settings.showVerseNumbers, 'Show verse numbers')
          ),
        'palette'
      )}

      ${section(
        'Reading',
        'Speech and daily study',
        appearanceRow(
          'Speech speed',
          'Words per minute when verses are read aloud',
          `<div class="w-40">
            <input id="wpm-range" type="range" min="120" max="360" step="20" value="${Number(settings.wpm) || 200}"
              aria-label="Speech speed" class="w-full accent-[rgb(var(--primary))]">
            <p id="wpm-readout" class="font-marginalia text-marginalia text-on-surface-variant text-right mt-1">${Number(settings.wpm) || 200} words per minute</p>
          </div>`
        ) +
          appearanceRow(
            'Daily goal',
            'Minutes of scripture each day',
            `<div class="w-40">
              <input id="goal-range" type="range" min="5" max="120" step="5" value="${Number(settings.dailyGoalMinutes) || 20}"
                aria-label="Daily goal" class="w-full accent-[rgb(var(--primary))]">
              <p id="goal-readout" class="font-marginalia text-marginalia text-on-surface-variant text-right mt-1">${Number(settings.dailyGoalMinutes) || 20} minutes</p>
            </div>`
          ) +
          appearanceRow(
            'Mark streak automatically',
            'Count a chapter as studied once it is read',
            toggle(settings.autoMarkStreak, 'Mark streak automatically')
          ),
        'menu_book'
      )}

      ${section(
        'Your data',
        'Everything stays on this device',
        appearanceRow(
          'Backup',
          'Export a copy of your progress, notes, and highlights',
          `<button type="button" data-act="backup" class="px-space-sm py-2 rounded-lg border border-outline-variant text-label-md font-semibold text-primary">Export</button>`
        ) +
          appearanceRow(
            'Recent searches',
            'Clear the terms you have searched for',
            `<button type="button" data-act="clear-searches" class="px-space-sm py-2 rounded-lg border border-outline-variant text-label-md font-semibold text-primary">Clear</button>`
          ),
        'database'
      )}

      ${section(
        'About',
        'Liahona scripture study assistant',
        `<div class="py-space-sm">
          <p class="font-body-lg text-body-lg text-primary">Liahona</p>
          <p class="font-marginalia text-marginalia text-on-surface-variant mt-0.5">Scripture study, offline and on device.</p>
        </div>`,
        'info'
      )}

    </div>`;

  /* -------------------------------------------------------------- events */

  UI.on(ctx.root, 'click', '[data-seg]', (event, btn) => {
    const name = btn.getAttribute('data-seg');
    const value = btn.getAttribute('data-value');
    const keys = { theme: 'theme', typeface: 'typeface', density: 'density' };
    const key = keys[name];
    if (!key) return;
    save({ [key]: value }, 'Updated');
    ctx.rerender();
  });

  const TOGGLE_KEYS = {
    'Show verse numbers': 'showVerseNumbers',
    'Mark streak automatically': 'autoMarkStreak',
  };

  UI.on(ctx.root, 'click', '[role="switch"]', (event, btn) => {
    const label = btn.getAttribute('aria-label') || '';
    const key = TOGGLE_KEYS[label];
    if (!key) return;
    save({ [key]: !settings[key] }, 'Updated');
    ctx.rerender();
  });

  UI.on(ctx.root, 'click', '[data-avatar]', (event, btn) => {
    save({ avatar: btn.getAttribute('data-avatar') }, 'Profile picture updated');
    ctx.rerender();
  });

  const nameInput = ctx.root.querySelector('#profile-name');
  if (nameInput) {
    nameInput.addEventListener('change', () => {
      const value = nameInput.value.trim() || 'Study Companion';
      save({ profileName: value }, 'Profile updated');
    });
  }

  const wpmRange = ctx.root.querySelector('#wpm-range');
  const wpmReadout = ctx.root.querySelector('#wpm-readout');
  if (wpmRange && wpmReadout) {
    wpmRange.addEventListener('input', () => {
      wpmReadout.textContent = wpmRange.value + ' words per minute';
    });
    wpmRange.addEventListener('change', () => {
      save({ wpm: Number(wpmRange.value) }, 'Speech speed updated');
    });
  }

  const goalRange = ctx.root.querySelector('#goal-range');
  const goalReadout = ctx.root.querySelector('#goal-readout');
  if (goalRange && goalReadout) {
    goalRange.addEventListener('input', () => {
      goalReadout.textContent = goalRange.value + ' minutes';
    });
    goalRange.addEventListener('change', () => {
      save({ dailyGoalMinutes: Number(goalRange.value) }, 'Daily goal updated');
    });
  }

  UI.on(ctx.root, 'click', '[data-act="backup"]', () => Sheets.exportBackup());

  UI.on(ctx.root, 'click', '[data-act="clear-searches"]', () => {
    UI.confirm({
      title: 'Clear recent searches?',
      message: 'Your saved search terms will be removed. Bookmarks and notes are not affected.',
      confirmLabel: 'Clear',
    }).then((ok) => {
      if (!ok) return;
      Store.clearSearches();
      UI.toast('Searches cleared', { tone: 'good', icon: 'search_off' });
      ctx.rerender();
    });
  });
};