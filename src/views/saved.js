/* ==========================================================================
   Saved — bookmarks, highlights, notes, and saved answers in one place
   ========================================================================== */
window.Views = window.Views || {};

Views.saved = function (ctx) {
  const tabs = [
    { id: 'bookmarks', label: 'Saved verses', icon: 'bookmarks' },
    { id: 'highlights', label: 'Highlights', icon: 'ink_highlighter' },
    { id: 'notes', label: 'Notes', icon: 'sticky_note_2' },
    { id: 'history', label: 'Answers', icon: 'forum' },
  ];

  let active = tabs.some((t) => t.id === ctx.query.tab) ? ctx.query.tab : 'bookmarks';
  const apiOn = AI.isApiEnabled();

  ctx.setHeader({
    lead: 'brand',
    trail: `<button type="button" data-act="export" class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="Export backup">${UI.icon('ios_share', 'text-[20px]')}</button>`,
    progress: null,
  });

  ctx.root.innerHTML = `
    <section class="pt-space-xs space-y-space-md">
      <div class="space-y-0.5">
        <h1 class="font-display-lg-mobile text-display-lg-mobile text-primary tracking-tight">Your library</h1>
        <p class="font-body-md text-body-md text-on-surface-variant" id="saved-counts">${countsLine()}</p>
      </div>

      <div class="sticky top-16 z-20 -mx-margin px-margin bg-surface/95 backdrop-blur-xl">
        <div class="flex gap-1 overflow-x-auto py-space-xs" role="tablist" aria-label="Saved items">
          ${tabs
            .map(
              (t) => `<button type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === active}"
                class="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full font-label-lg text-label-lg transition-colors ${
                  t.id === active
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-primary hover:bg-surface-container-high'
                }">
                ${UI.icon(t.icon, 'text-[16px]')}<span>${t.label}</span>
              </button>`
            )
            .join('')}
        </div>
      </div>

      <div id="saved-body" role="tabpanel"></div>
    </section>`;

  const body = ctx.root.querySelector('#saved-body');
  const countsEl = ctx.root.querySelector('#saved-counts');

  function countsLine() {
    const bits = [
      Store.bookmarks().length + ' saved verse' + (Store.bookmarks().length === 1 ? '' : 's'),
      Object.keys(Store.highlights()).length + ' highlight' + (Object.keys(Store.highlights()).length === 1 ? '' : 's'),
      Object.keys(Store.notes()).length + ' note' + (Object.keys(Store.notes()).length === 1 ? '' : 's'),
    ];
    return bits.join(' · ');
  }

  /* --------------------------------------------------------------- helpers */

  function keyOf(key) {
    return String(key || '').split('/');
  }

  function verseCard(key, opts) {
    const parts = keyOf(key);
    const verse = Scripture.verse(parts[0], Number(parts[1]), Number(parts[2]));
    if (!verse) return '';
    const options = opts || {};
    const color = options.color;
    const note = Store.noteFor(key);
    const mark = color ? `<mark class="hl-${UI.esc(color)}" data-hl="${UI.esc(color)}"></mark>` : '';

    return `<article class="bg-surface-container-low rounded-xl shadow-level1 overflow-hidden">
      <div class="p-space-md space-y-space-sm">
        <div class="flex items-start justify-between gap-space-sm">
          <a href="#/read/${verse.bookSlug}/${verse.chapter}/${verse.verse}" class="min-w-0 group">
            <span class="font-label-md text-label-md text-secondary font-semibold group-hover:underline">${UI.esc(verse.reference)}</span>
          </a>
          <div class="flex items-center gap-0.5 shrink-0">
            <button type="button" data-hl="${UI.esc(key)}" aria-label="Highlight ${UI.esc(verse.reference)}"
              class="w-8 h-8 rounded-full flex items-center justify-center ${color ? 'text-secondary' : 'text-outline'} hover:bg-surface-container-high transition-colors">${UI.icon('ink_highlighter', 'text-[17px]')}</button>
            <button type="button" data-note="${UI.esc(key)}" aria-label="Note on ${UI.esc(verse.reference)}"
              class="w-8 h-8 rounded-full flex items-center justify-center ${note ? 'text-secondary' : 'text-outline'} hover:bg-surface-container-high transition-colors">${UI.icon('sticky_note_2', 'text-[17px]')}</button>
            <button type="button" data-remove="${UI.esc(key)}" aria-label="Remove ${UI.esc(verse.reference)} from saved"
              class="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-error hover:bg-error-container transition-colors">${UI.icon('delete_outline', 'text-[17px]')}</button>
          </div>
        </div>
        <a href="#/read/${verse.bookSlug}/${verse.chapter}/${verse.verse}" class="block">
          <p class="font-scripture-mobile text-on-surface leading-[1.7]">${mark ? UI.esc(verse.text) : UI.esc(verse.text)}</p>
        </a>
        ${options.renamed ? `<p class="font-label-md text-label-md text-primary font-semibold">${UI.esc(options.renamed)}</p>` : ''}
        ${
          note
            ? `<div class="bg-surface-container rounded-lg px-space-sm py-2.5 border-l-2 border-secondary-container">
                 <p class="font-body-md text-body-md text-on-surface-variant whitespace-pre-line">${UI.esc(note)}</p>
               </div>`
            : ''
        }
        ${
          options.at
            ? `<p class="font-marginalia text-marginalia text-outline">Saved ${UI.esc(UI.relativeTime(options.at))}</p>`
            : ''
        }
      </div>
      <div class="flex divide-x divide-outline-variant border-t border-outline-variant">
        <a href="#/read/${verse.bookSlug}/${verse.chapter}/${verse.verse}"
           class="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-label-md text-label-md text-secondary hover:bg-surface-container-high transition-colors">
          ${UI.icon('menu_book', 'text-[15px]')}Read
        </a>
        <button type="button" data-copy-verse="${UI.esc(key)}"
          class="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-high transition-colors">
          ${UI.icon('content_copy', 'text-[15px]')}Copy
        </button>
        <a href="#/ask?prompt=${encodeURIComponent('What does ' + verse.reference + ' teach?')}"
           class="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-high transition-colors">
          ${UI.icon('explore', 'text-[15px]')}Ask
        </a>
      </div>
    </article>`;
  }

  /* ----------------------------------------------------------------- tabs */

  function renderBookmarks() {
    const list = Store.bookmarks();
    if (!list.length) {
      body.innerHTML = UI.emptyState({
        icon: 'bookmarks',
        title: 'No saved verses yet',
        message: 'Tap the bookmark on any verse in the reader and it will land here.',
        action: { href: '#/read', label: 'Open the reader', icon: 'menu_book' },
      });
      return;
    }

    const items = list
      .map((entry) => {
        const key = entry && typeof entry === 'object' ? entry.key : entry;
        const hl = Store.highlightFor(key);
        return { key, at: (entry && entry.at) || 0, color: hl ? hl.color : null };
      })
      .filter((row) => Scripture.verseByKey(row.key));

    body.innerHTML = `<div class="space-y-space-sm pt-space-xs">
        ${items.map((row) => verseCard(row.key, { at: row.at, color: row.color })).join('')}
      </div>`;
  }

  function renderHighlights() {
    const all = Store.highlights();
    const keys = Object.keys(all);
    if (!keys.length) {
      body.innerHTML = UI.emptyState({
        icon: 'ink_highlighter',
        title: 'No highlights yet',
        message: 'Open a chapter, select a verse, and choose a colour from the highlight sheet.',
        action: { href: '#/read', label: 'Open the reader', icon: 'menu_book' },
      });
      return;
    }

    const byColor = {};
    keys.forEach((key) => {
      const color = (all[key] && all[key].color) || 'gold';
      (byColor[color] = byColor[color] || []).push(key);
    });

    body.innerHTML = Object.keys(byColor)
      .map((color) => {
        const label = { gold: 'Gold', green: 'Green', blue: 'Blue', rose: 'Rose' }[color] || color;
        return `<section class="pt-space-sm space-y-space-sm">
            <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold px-1 flex items-center gap-2">
              <span class="w-3 h-3 rounded-full hl-${UI.esc(color)} inline-block"></span>${label}
              <span class="text-outline">${byColor[color].length}</span>
            </h2>
            ${byColor[color].map((key) => verseCard(key, { color, at: all[key].at })).join('')}
          </section>`;
      })
      .join('');
  }

  function renderNotes() {
    const all = Store.notes();
    const keys = Object.keys(all);
    if (!keys.length) {
      body.innerHTML = UI.emptyState({
        icon: 'sticky_note_2',
        title: 'No notes yet',
        message: 'Notes you write on a verse collect here so you can review them in one place.',
        action: { href: '#/read', label: 'Open the reader', icon: 'menu_book' },
      });
      return;
    }

    const sorted = keys
      .map((key) => {
        const record = Store.noteRecord(key);
        return { key, at: record ? record.at : 0, text: Store.noteFor(key) };
      })
      .sort((a, b) => b.at - a.at);

    body.innerHTML = `<div class="space-y-space-sm pt-space-xs">
        ${sorted.map((row) => verseCard(row.key, { at: row.at })).join('')}
      </div>`;
  }

  function renderHistory() {
    const list = Store.history();
    if (!list.length) {
      body.innerHTML = UI.emptyState({
        icon: 'forum',
        title: 'No answers yet',
        message: 'Ask a question and every answer is kept here with the verses it drew on.',
        action: { href: '#/ask', label: 'Ask a question', icon: 'explore' },
      });
      return;
    }

    body.innerHTML = `<div class="space-y-space-sm pt-space-xs">
        ${list
          .map((entry) => {
            const verse = entry.verseKey ? Scripture.verseByKey(entry.verseKey) : null;
            return `<article class="bg-surface-container-low rounded-xl shadow-level1 p-space-md space-y-space-sm">
              <div class="flex items-start justify-between gap-space-sm">
                <h2 class="font-headline-sm text-headline-sm text-primary">${UI.esc(entry.question)}</h2>
                <button type="button" data-helpful="${UI.esc(entry.id)}"
                  class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${entry.helpful ? 'text-secondary' : 'text-outline'} hover:bg-surface-container-high transition-colors"
                  aria-label="Mark helpful" aria-pressed="${entry.helpful ? 'true' : 'false'}">
                  ${UI.icon('thumb_up', 'text-[16px]', !!entry.helpful)}
                </button>
              </div>
              <p class="font-body-md text-body-md text-on-surface-variant whitespace-pre-line">${UI.esc(entry.answer || '')}</p>
              ${
                verse
                  ? `<a href="#/read/${verse.bookSlug}/${verse.chapter}/${verse.verse}" class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors">
                       ${UI.icon('menu_book', 'text-[13px] text-secondary')}
                       <span class="font-label-md text-label-md text-primary">${UI.esc(verse.reference)}</span>
                     </a>`
                  : ''
              }
              <div class="flex items-center justify-between gap-space-sm pt-space-xs border-t border-outline-variant">
                <span class="font-marginalia text-marginalia text-outline">
                  ${UI.esc(UI.relativeTime(entry.at))} · ${entry.source === 'api' ? 'Online' : 'On-device'}
                </span>
                <div class="flex items-center gap-0.5">
                  <button type="button" data-answer-copy="${UI.esc(entry.id)}" class="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-container-high transition-colors" aria-label="Copy answer">${UI.icon('content_copy', 'text-[16px]')}</button>
                  <button type="button" data-answer-share="${UI.esc(entry.id)}" class="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-container-high transition-colors" aria-label="Share answer">${UI.icon('ios_share', 'text-[16px]')}</button>
                  <button type="button" data-answer-delete="${UI.esc(entry.id)}" class="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-error hover:bg-error-container transition-colors" aria-label="Delete answer">${UI.icon('delete_outline', 'text-[16px]')}</button>
                </div>
              </div>
            </article>`;
          })
          .join('')}
        <div class="flex justify-end pt-space-xs">
          <button type="button" data-act="clear-history" class="font-label-md text-label-md text-error inline-flex items-center gap-1.5 hover:underline">
            ${UI.icon('delete_sweep', 'text-[16px]')}Clear all answers
          </button>
        </div>
      </div>`;
  }

  function renderTab() {
    countsEl.textContent = countsLine();
    if (active === 'bookmarks') renderBookmarks();
    else if (active === 'highlights') renderHighlights();
    else if (active === 'notes') renderNotes();
    else renderHistory();

    ctx.root.querySelectorAll('[data-tab]').forEach((btn) => {
      const on = btn.dataset.tab === active;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.className =
        'shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full font-label-lg text-label-lg transition-colors ' +
        (on ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary hover:bg-surface-container-high');
    });
  }

  ctx.root.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      active = btn.dataset.tab;
      ctx.setQuery({ tab: active }, true);
      renderTab();
    })
  );

  /* ------------------------------------------------------------- handlers */

  UI.on(ctx.root, 'click', '[data-remove]', (event, btn) => {
    const key = btn.dataset.remove;
    const verse = Scripture.verseByKey(key);
    UI.confirm({
      title: 'Remove from saved?',
      message: verse ? verse.reference + ' will be removed from this list.' : 'This item will be removed.',
      confirmLabel: 'Remove',
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      if (Store.isBookmarked(key)) Store.toggleBookmark(key);
      Store.setHighlight(key, null);
      UI.toast('Removed', { icon: 'delete' });
      renderTab();
    });
  });

  UI.on(ctx.root, 'click', '[data-note]', (event, btn) => {
    Sheets.notesForKey(btn.dataset.note, () => renderTab());
  });

  UI.on(ctx.root, 'click', '[data-hl]', (event, btn) => {
    const key = btn.dataset.hl;
    if (Store.highlightFor(key)) {
      Store.setHighlight(key, null);
      UI.toast('Highlight removed', { icon: 'ink_highlighter' });
      renderTab();
      return;
    }
    Sheets.highlightForKey(key, () => renderTab());
  });

  UI.on(ctx.root, 'click', '[data-copy-verse]', (event, btn) => {
    const verse = Scripture.verseByKey(btn.dataset.copyVerse);
    if (!verse) return;
    const note = Store.noteFor(verse.key);
    const text = `“${verse.text}” — ${verse.reference}` + (note ? '\n\nNote: ' + note : '');
    UI.copy(text).then((ok) =>
      UI.toast(ok ? 'Copied with reference' : 'Could not copy', { tone: ok ? 'good' : 'bad', icon: ok ? 'check' : 'error' })
    );
  });

  UI.on(ctx.root, 'click', '[data-helpful]', (event, btn) => {
    const on = Store.toggleHelpful(btn.dataset.helpful);
    btn.className =
      'shrink-0 w-8 h-8 rounded-full flex items-center justify-center ' +
      (on ? 'text-secondary' : 'text-outline') +
      ' hover:bg-surface-container-high transition-colors';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.innerHTML = UI.icon('thumb_up', 'text-[16px]', on);
    UI.toast(on ? 'Marked helpful' : 'Marked as not helpful', { duration: 1400, icon: on ? 'thumb_up' : 'undo' });
  });

  UI.on(ctx.root, 'click', '[data-answer-copy]', (event, btn) => {
    const entry = Store.history().find((h) => h.id === btn.dataset.answerCopy);
    if (!entry) return;
    UI.copy(entry.answer).then((ok) =>
      UI.toast(ok ? 'Answer copied' : 'Could not copy', { tone: ok ? 'good' : 'bad', icon: ok ? 'check' : 'error' })
    );
  });

  UI.on(ctx.root, 'click', '[data-answer-share]', (event, btn) => {
    const entry = Store.history().find((h) => h.id === btn.dataset.answerShare);
    if (!entry) return;
    const text = entry.question + '\n\n' + entry.answer + (entry.anchor ? '\n\n— ' + entry.anchor : '');
    UI.share(text, 'Liahona').then((result) => {
      if (result === 'copied') UI.toast('Answer copied', { tone: 'good', icon: 'check' });
      else if (result === 'failed') UI.toast('Could not share', { tone: 'bad', icon: 'error' });
    });
  });

  UI.on(ctx.root, 'click', '[data-answer-delete]', (event, btn) => {
    const entry = Store.history().find((h) => h.id === btn.dataset.answerDelete);
    if (!entry) return;
    UI.confirm({
      title: 'Delete this answer?',
      message: entry.question,
      confirmLabel: 'Delete',
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      Store.removeHistory(entry.id);
      UI.toast('Deleted', { icon: 'delete' });
      renderTab();
    });
  });

  UI.on(ctx.root, 'click', '[data-act="clear-history"]', () => {
    UI.confirm({
      title: 'Clear all saved answers?',
      message: 'Every question and answer in this list will be removed. Verses and notes are not affected.',
      confirmLabel: 'Clear answers',
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      Store.clearHistory();
      UI.toast('Answers cleared', { icon: 'delete_sweep' });
      renderTab();
    });
  });

  // the export button lives in the fixed header
  ctx.onHeader('[data-act="export"]', () => Sheets.exportBackup());

  renderTab();
};