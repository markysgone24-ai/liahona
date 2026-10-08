/* ==========================================================================
   Liahona — shared sheets
   Bottom sheets used from more than one view: context, study notes, bookmarks,
   the note editor, and the highlight colour picker.
   ========================================================================== */
window.Sheets = (function () {
  'use strict';

  const HIGHLIGHT_COLORS = [
    { id: 'gold', label: 'Gold', swatch: 'bg-[rgb(var(--accent)/.55)]' },
    { id: 'green', label: 'Green', swatch: 'bg-[rgb(90_158_111/.55)]' },
    { id: 'blue', label: 'Blue', swatch: 'bg-[rgb(96_145_199/.55)]' },
    { id: 'rose', label: 'Rose', swatch: 'bg-[rgb(201_118_118/.55)]' },
  ];

  /** Where this verse sits, plus the references its own notes cite. */
  function context(verse, ctx) {
    const ch = Scripture.chapter(verse.bookSlug, verse.chapter);
    if (!ch) return;
    const crossRefs = Scripture.crossReferencesFor(verse.bookSlug, verse.chapter, verse.verse);
    const book = Scripture.book(verse.bookSlug);

    const body = `
      <div class="space-y-space-md">
        <p class="font-scripture-mobile italic text-on-surface border-l-2 border-secondary-container pl-space-md">${UI.esc(verse.text)}</p>
        <p class="font-marginalia text-marginalia text-on-surface-variant">${UI.esc(book ? book.title : '')} · chapter ${UI.esc(ch.title)}${ch.subtitle ? ' — ' + UI.esc(ch.subtitle) : ''} · ${ch.verses.length} verses</p>
        <a href="#/read/${verse.bookSlug}/${verse.chapter}/${verse.verse}" data-sheet-close
           class="flex items-center justify-center gap-space-xs bg-primary text-on-primary font-label-lg text-label-lg py-3 rounded-full active:scale-[.98] transition-transform">
          ${UI.icon('menu_book', 'text-[18px]')}Open chapter ${ch.number}
        </a>
        ${
          crossRefs.length
            ? `<div>
                 <div class="rule-taper mb-space-sm"><span class="font-label-md text-label-md uppercase tracking-wider">Cited in the notes</span></div>
                 <ul class="space-y-1">
                   ${crossRefs
                     .map(
                       (c) => `<li><a href="#/read/${c.bookSlug}/${c.chapter}/${c.verse}" data-sheet-close
                         class="flex items-baseline gap-space-xs p-space-xs rounded-lg hover:bg-surface-container transition-colors">
                         <span class="font-label-md text-label-md text-secondary font-semibold shrink-0">${UI.esc(c.reference)}</span>
                         <span class="font-body-md text-body-md text-on-surface-variant line-clamp-2">${UI.esc(c.text)}</span>
                       </a></li>`
                     )
                     .join('')}
                 </ul>
               </div>`
            : '<p class="font-body-md text-body-md text-on-surface-variant">This verse carries no cross-references in the study notes.</p>'
        }
      </div>`;

    UI.sheet({
      title: verse.reference,
      subtitle: 'In context',
      body,
      actions: [
        { label: 'Ask about this', icon: 'explore', tone: 'gold', onClick: () => ctx.navigate('#/ask?verse=' + verse.key) },
      ],
    });
  }

  /** Official study notes for a verse (or a whole chapter when verse is null). */
  function studyNotes(verse, chapterNumber, ctx, onClose) {
    const notes = verse
      ? Scripture.footnotesFor(verse.bookSlug, chapterNumber || verse.chapter, verse.verse)
      : Scripture.chapterFootnotes(verse.bookSlug, chapterNumber);
    const ch = Scripture.chapter(verse.bookSlug, chapterNumber || verse.chapter);

    const body = notes.length
      ? `<ul class="space-y-space-sm">
           ${notes
             .map(
               (n) => `<li class="bg-surface-container rounded-lg p-space-sm space-y-1">
                 <span class="font-label-md text-label-md text-secondary font-bold">Note ${UI.esc(n.marker)}${n.verse ? ' · verse ' + n.verse : ''}</span>
                 <p class="font-body-md text-body-md text-on-surface">${UI.esc(n.text)}</p>
               </li>`
             )
             .join('')}
         </ul>`
      : UI.emptyState({
          icon: 'sticky_note_2',
          title: 'No study notes here',
          message: 'The official notes for this passage are empty.',
        });

    const goToAsk = '#/ask?verse=' + (verse && verse.key ? verse.key : verse.bookSlug + '/' + chapterNumber + '/1');

    UI.sheet({
      title: verse && verse.key ? verse.reference : 'Study notes',
      subtitle: `${ch ? ch.title : ''} · ${notes.length} note${notes.length === 1 ? '' : 's'}`,
      body,
      size: 'tall',
      onClose,
      actions: [
        { label: 'Ask about these', icon: 'explore', tone: 'gold', onClick: () => ctx.navigate(goToAsk) },
      ],
    });
  }

  /** Personal reflection journal for one verse. */
  function noteEditor(verse, ctx, onSaved) {
    const existing = Store.noteFor(verse.key);
    const inputId = 'note-input';
    const body = `
      <div class="space-y-space-sm">
        <p class="font-scripture-mobile italic text-on-surface-variant border-l-2 border-outline-variant pl-space-sm line-clamp-3">${UI.esc(verse.text)}</p>
        <label for="${inputId}" class="sr-only">Your note about ${UI.esc(verse.reference)}</label>
        <textarea id="${inputId}" data-autofocus rows="5"
          class="w-full bg-surface-container-lowest text-on-surface text-body-md font-body-md p-space-md rounded-lg border border-outline-variant focus:border-accent outline-none focus:ring-2 focus:ring-accent/40 resize-y"
          placeholder="What stands out to you in this verse?">${UI.esc(existing)}</textarea>
        <p class="font-marginalia text-marginalia text-on-surface-variant">Notes are stored on this device only.</p>
      </div>`;

    const handle = UI.sheet({
      title: existing ? 'Edit note' : 'Add note',
      subtitle: verse.reference,
      body,
      actions: [
        existing
          ? {
              label: 'Delete',
              icon: 'delete',
              tone: 'danger',
              onClick: () => {
                Store.setNote(verse.key, '');
                UI.toast('Note deleted', { tone: 'good', icon: 'delete' });
                if (onSaved) onSaved();
              },
            }
          : null,
        { label: 'Cancel' },
        {
          label: 'Save',
          icon: 'check',
          tone: 'primary',
          close: false,
          onClick: () => {
            const value = document.getElementById(inputId).value;
            Store.setNote(verse.key, value);
            handle.close();
            UI.toast(Store.noteFor(verse.key) ? 'Note saved' : 'Note removed', { tone: 'good', icon: 'edit_note' });
            if (onSaved) onSaved();
          },
        },
      ].filter(Boolean),
    });
  }

  /** Colour picker for verse highlights. */
  function highlightPicker(verse, ctx, onPicked) {
    const current = Store.highlightFor(verse.key);
    const body = `
      <div class="space-y-space-md">
        <div class="grid grid-cols-4 gap-space-sm">
          ${HIGHLIGHT_COLORS.map(
            (c) => `<button type="button" data-color="${c.id}"
              class="flex flex-col items-center gap-2 p-space-sm rounded-xl border-2 transition-colors ${
                current && current.color === c.id ? 'border-accent bg-surface-container' : 'border-transparent hover:bg-surface-container'
              }">
              <span class="w-9 h-9 rounded-full ${c.swatch}"></span>
              <span class="font-label-md text-label-md ${current && current.color === c.id ? 'text-secondary font-bold' : 'text-on-surface-variant'}">${c.label}</span>
            </button>`
          ).join('')}
        </div>
        ${
          current
            ? `<button type="button" data-color="" class="w-full flex items-center justify-center gap-space-xs bg-surface-container text-primary font-label-lg text-label-lg py-3 rounded-full active:scale-[.98] transition-transform">
                 ${UI.icon('ink_off', 'text-[18px]')}Remove highlight
               </button>`
            : ''
        }
      </div>`;

    const handle = UI.sheet({
      title: 'Highlight',
      subtitle: verse.reference,
      body,
      actions: [{ label: 'Cancel' }],
    });

    handle.panel.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-color]');
      if (!btn) return;
      const color = btn.dataset.color || null;
      Store.setHighlight(verse.key, color);
      handle.close();
      UI.toast(color ? 'Highlighted' : 'Highlight removed', { tone: 'good', icon: color ? 'ink_highlighter' : 'ink_off' });
      if (onPicked) onPicked(color);
    });
  }

  /** Saved items, grouped by kind. */
  function bookmarksList(ctx, filter, onChange) {
    const all = Store.bookmarks();
    const list = filter === 'all' ? all : all.filter((b) => (b.key || '').indexOf(filter + '/') === 0);

    if (!list.length) {
      UI.sheet({
        title: 'Bookmarks',
        body: UI.emptyState({
          icon: 'bookmark_border',
          title: 'No bookmarks yet',
          message: 'Tap a verse while reading and choose Bookmark to keep it here.',
          action: { href: '#/read', label: 'Start reading', icon: 'menu_book' },
        }),
      });
      return;
    }

    const body = `<ul class="space-y-1">
      ${list
        .map((entry) => {
          const key = entry.key || entry;
          const v = Scripture.verseByKey(key);
          if (!v) return '';
          return `<li class="group">
            <div class="flex items-start gap-space-sm p-space-sm rounded-lg hover:bg-surface-container transition-colors">
              <a href="#/read/${v.bookSlug}/${v.chapter}/${v.verse}" data-sheet-close class="min-w-0 flex-1">
                <span class="font-label-md text-label-md text-secondary font-semibold">${UI.esc(v.reference)}</span>
                <p class="font-body-md text-body-md text-on-surface-variant line-clamp-2 mt-0.5">${UI.esc(v.text)}</p>
              </a>
              <button type="button" data-remove="${key}" aria-label="Remove bookmark"
                class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error transition-colors">
                ${UI.icon('close', 'text-[16px]')}
              </button>
            </div>
          </li>`;
        })
        .join('')}
    </ul>`;

    const handle = UI.sheet({
      title: 'Bookmarks',
      subtitle: `${list.length} saved verse${list.length === 1 ? '' : 's'}`,
      body,
      size: 'tall',
      actions: [{ label: 'Close', tone: 'primary' }],
    });

    handle.panel.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove]');
      if (!btn) return;
      Store.toggleBookmark(btn.dataset.remove);
      btn.closest('li').remove();
      handle.close();
      UI.toast('Bookmark removed', { tone: 'good', icon: 'bookmark_remove' });
      if (onChange) onChange();
    });
  }

  /* --------------------------------------------------------- key helpers */

  /** Resolves "book/chapter/verse" into a verse record, or null. */
  function verseFromKey(key) {
    const parts = String(key || '').split('/');
    if (parts.length !== 3) return null;
    return Scripture.verse(parts[0], Number(parts[1]), Number(parts[2]));
  }

  /** Opens the personal note editor for a verse key. */
  function notesForKey(key, onSaved, ctx) {
    const verse = verseFromKey(key);
    if (!verse) {
      UI.toast('That verse is no longer in the text', { tone: 'bad', icon: 'error' });
      return;
    }
    noteEditor(verse, ctx || { navigate() {} }, onSaved);
  }

  /** Opens the colour picker for a verse key. */
  function highlightForKey(key, onPicked, ctx) {
    const verse = verseFromKey(key);
    if (!verse) {
      UI.toast('That verse is no longer in the text', { tone: 'bad', icon: 'error' });
      return;
    }
    highlightPicker(verse, ctx || { navigate() {} }, onPicked);
  }

  /** Opens the official study notes for a verse key. */
  function studyNotesForKey(key, ctx, onClose) {
    const verse = verseFromKey(key);
    if (!verse) {
      UI.toast('That verse is no longer in the text', { tone: 'bad', icon: 'error' });
      return;
    }
    studyNotes(verse, null, ctx, onClose);
  }

  /* -------------------------------------------------------- export sheet */

  /** Backup export/import — the only destructive operations live here. */
  function exportBackup(onDone) {
    const counts = {
      bookmarks: Store.bookmarks().length,
      highlights: Object.keys(Store.highlights()).length,
      notes: Object.keys(Store.notes()).length,
      answers: Store.history().length,
    };

    const body = `
      <div class="space-y-space-md">
        <div class="bg-surface-container-low rounded-xl p-space-md">
          <p class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold">What is in your backup</p>
          <dl class="mt-space-sm space-y-1.5">
            ${[
              ['Saved verses', counts.bookmarks],
              ['Highlights', counts.highlights],
              ['Notes', counts.notes],
              ['Answers', counts.answers],
            ]
              .map(
                ([label, n]) => `<div class="flex items-baseline justify-between gap-space-sm">
                  <dt class="font-body-md text-body-md text-on-surface-variant">${label}</dt>
                  <dd class="font-label-md text-label-md text-primary tabular-nums">${n}</dd>
                </div>`
              )
              .join('')}
          </dl>
        </div>

        <div class="space-y-space-xs">
          <button type="button" data-backup="export"
            class="w-full flex items-center gap-space-sm p-space-sm rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors active:scale-[.99]">
            ${UI.icon('download', 'text-[20px] text-secondary shrink-0')}
            <span class="text-left min-w-0">
              <span class="font-label-lg text-label-lg text-primary block">Download backup</span>
              <span class="font-marginalia text-marginalia text-on-surface-variant block">Saves a JSON file with everything above</span>
            </span>
          </button>
          <button type="button" data-backup="import"
            class="w-full flex items-center gap-space-sm p-space-sm rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors active:scale-[.99]">
            ${UI.icon('upload', 'text-[20px] text-secondary shrink-0')}
            <span class="text-left min-w-0">
              <span class="font-label-lg text-label-lg text-primary block">Restore from backup</span>
              <span class="font-marginalia text-marginalia text-on-surface-variant block">Replaces current data with a saved file</span>
            </span>
          </button>
        </div>

        <div class="border-t border-outline-variant pt-space-md">
          <button type="button" data-backup="reset"
            class="w-full flex items-center gap-space-sm p-space-sm rounded-xl bg-error-container text-on-error-container hover:brightness-95 transition-colors active:scale-[.99]">
            ${UI.icon('delete_forever', 'text-[20px] shrink-0')}
            <span class="text-left min-w-0">
              <span class="font-label-lg text-label-lg block">Erase all data</span>
              <span class="font-marginalia text-marginalia block opacity-80">Clears progress, notes, highlights, and settings</span>
            </span>
          </button>
        </div>
      </div>`;

    const handle = UI.sheet({ title: 'Your data', subtitle: 'Stored on this device only', body, actions: [{ label: 'Close' }] });

    handle.panel.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-backup]');
      if (!btn) return;
      const action = btn.dataset.backup;

      if (action === 'export') {
        downloadJson();
        UI.toast('Backup downloaded', { tone: 'good', icon: 'download' });
        if (onDone) onDone();
        return;
      }

      if (action === 'import') {
        UI.confirm({
          title: 'Restore from backup?',
          message: 'This replaces your current progress, notes, and highlights with the contents of the file.',
          confirmLabel: 'Choose file',
        }).then((ok) => {
          if (!ok) return;
          pickFile();
        });
        return;
      }

      UI.confirm({
        title: 'Erase everything?',
        message: 'All reading progress, notes, highlights, saved verses, answers, and settings on this device will be deleted. This cannot be undone.',
        confirmLabel: 'Erase everything',
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        Store.clearAll();
        handle.close();
        UI.toast('All data erased', { tone: 'bad', icon: 'delete_forever' });
        window.location.hash = '#/';
        window.location.reload();
      });
    });

    function downloadJson() {
      const payload = Store.exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'liahona-backup-' + UI.isoDate() + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function pickFile() {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'application/json,.json';
      picker.addEventListener('change', () => {
        const file = picker.files && picker.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            Store.importAll(JSON.parse(String(reader.result)));
            handle.close();
            UI.toast('Backup restored', { tone: 'good', icon: 'upload' });
            if (onDone) onDone();
            window.location.reload();
          } catch (err) {
            UI.toast(err.message || 'That file could not be read', { tone: 'bad', icon: 'error', duration: 4000 });
          }
        };
        reader.onerror = () => UI.toast('Could not open that file', { tone: 'bad', icon: 'error' });
        reader.readAsText(file);
      });
      picker.click();
    }
  }

  return {
    HIGHLIGHT_COLORS,
    context, studyNotes, noteEditor, highlightPicker, bookmarksList,
    verseFromKey, notesForKey, highlightForKey, studyNotesForKey,
    exportBackup,
  };
})();