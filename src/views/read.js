/* ==========================================================================
   Reader — the scripture reading view

   • one quiet column, sized like a printed page (Gospel Library idiom)
   • verse text with small superscript numerals and blue footnote markers
   • study notes collect at the foot of the chapter, paper-style
   • tap a verse to open the floating reading palette
   • highlight / bookmark / note / copy / listen / ask, all persisted
   • the listen player narrates the volume continuously — verse highlighting,
     play/pause, skip and speed, Gospel Library style
   • reading time is accumulated and flushed to the store
   ========================================================================== */
window.Views = window.Views || {};

Views.read = function (ctx) {
  const route = ctx.params;
  const settings = Store.settings();

  /* ------------------------------------------------------------ resolving */

  let bookSlug = route[0];
  let chapterNumber = route[1] ? parseInt(route[1], 10) : null;
  let verseNumber = route[2] ? parseInt(route[2], 10) : null;

  const progress = Store.progress();
  if (!bookSlug || !Scripture.book(bookSlug)) {
    bookSlug = progress.book || '1-ne';
    chapterNumber = chapterNumber || progress.chapter;
    verseNumber = verseNumber || progress.verse;
  }
  let book = Scripture.book(bookSlug);
  if (!book || !book.chapters.length) {
    ctx.root.innerHTML = UI.emptyState({
      icon: 'error',
      title: 'Scripture data missing',
      message: 'Run scripts/fetch-book-of-mormon.js to download the text.',
    });
    return;
  }
  if (!chapterNumber) {
    chapterNumber = book.chapters[0].number;
  }
  if (!Scripture.chapter(bookSlug, chapterNumber)) {
    chapterNumber = book.chapters[0].number;
  }

  const root = ctx.root;
  const headerEl = document.getElementById('app-header');

  /** Mutable chapter-scoped state, refreshed by renderChapter(). */
  let chapter = null;
  let neighbours = { previous: null, next: null };
  let bookProg = { read: 0 };
  let chapterRead = false;
  let chapterMs = 0;
  let footnotes = [];
  let scripture = null;
  let chapterHead = null;

  /** Plain text of a whole chapter, used to estimate reading time. */
  function chapterText(ch) {
    return ch.verses.map((v) => v.text).join(' ');
  }

  const headerTrail = `
    <button type="button" data-act="open-chapters" aria-label="Choose book and chapter"
      class="w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
      ${UI.icon('menu_open', 'text-[20px]')}
    </button>
    <button type="button" data-act="toggle-font" aria-label="Reading options"
      class="w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
      ${UI.icon('text_fields', 'text-[20px]')}
    </button>`;

  /** A single verse block; identical markup across every chapter rendering. */
  function verseMarkup(v) {
    const key = bookSlug + '/' + chapterNumber + '/' + v.number;
    const record = Scripture.verseByKey(key);
    const highlight = Store.highlightFor(key);
    const saved = Store.isBookmarked(key);
    const note = Store.noteFor(key);
    const notes = Scripture.footnotesFor(bookSlug, chapterNumber, v.number);

    const footnoteMarks = notes.length
      ? notes
          .map(
            (n) =>
              `<button type="button" class="verse__note" data-act="open-notes" data-verse="${key}" data-marker="${UI.esc(n.marker)}"
                aria-label="Study note ${UI.esc(n.marker)} on verse ${v.number}">${UI.esc(n.marker)}</button>`
          )
          .join('')
      : '';

    const attrs = [
      'class="verse' + (highlight ? ' hl-' + highlight.color : '') + '"',
      'id="v' + v.number + '"',
      'data-verse="' + key + '"',
      'data-bookmark="' + (saved ? 'true' : 'false') + '"',
    ];
    if (note) attrs.push('data-note="true"');

    const text = record ? record.text : v.text;

    // Gospel Library sets the numeral on the baseline at bold weight, sized
    // just under the body text, and separates verses with block margin rather
    // than with any punctuation between them.
    let body;
    if (settings.showVerseNumbers) {
      const numeral = `<button type="button" class="verse__num" data-act="open-notes" data-verse="${key}"
           aria-label="Verse ${v.number}${notes.length ? ', has study notes' : ''}">${v.number}</button> `;
      body = numeral + UI.esc(text);
    } else {
      body = `<span class="sr-only">Verse ${v.number}. </span>${UI.esc(text)}`;
    }

    return `<p ${attrs.join(' ')}>${body}${footnoteMarks}</p>`;
  }

  function studyAidsHtml() {
    return `
    <details class="study-aids no-print">
      <summary>
        ${UI.icon('expand_more', 'text-[18px] chevron')}
        <span>Study aids</span>
      </summary>
      <div class="space-y-space-lg pt-space-sm">
        <section>
          <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold">This chapter</h2>
          <dl class="mt-space-xs space-y-1.5">
            <div class="flex items-baseline justify-between gap-space-sm">
              <dt class="font-body-md text-body-md text-on-surface-variant">Verses</dt>
              <dd class="font-label-md text-label-md text-primary">${chapter.verses.length}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-space-sm">
              <dt class="font-body-md text-body-md text-on-surface-variant">Study notes</dt>
              <dd class="font-label-md text-label-md text-primary">${footnotes.length}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-space-sm">
              <dt class="font-body-md text-body-md text-on-surface-variant">Reading time</dt>
              <dd class="font-label-md text-label-md text-primary">~${Math.max(1, Math.round(chapterMs / 60000))} min</dd>
            </div>
            <div class="flex items-baseline justify-between gap-space-sm">
              <dt class="font-body-md text-body-md text-on-surface-variant">Status</dt>
              <dd class="font-label-md text-label-md ${chapterRead ? 'text-secondary' : 'text-on-surface-variant'}">${chapterRead ? 'Read' : 'In progress'}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold">Jump to</h2>
          <div class="mt-space-xs flex flex-wrap gap-1.5">
            ${chapter.verses
              .filter((_, i) => i % 5 === 0 || i === chapter.verses.length - 1)
              .map((v) => `<a href="#/read/${bookSlug}/${chapterNumber}/${v.number}" data-scroll-to="${v.number}"
                  class="min-w-[32px] h-8 px-2 rounded-full bg-surface-container text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container font-label-md text-label-md flex items-center justify-center transition-colors">${v.number}</a>`)
              .join('')}
          </div>
        </section>
      </div>
    </details>`;
  }

  function footnotesHtml() {
    return footnotes.length
      ? `<details class="chapter-notes no-print">
        <summary class="chapter-notes__toggle">
          <span class="chapter-notes__title">Notes on this chapter</span>
          <span class="chapter-notes__count">· ${footnotes.length}</span>
          <span class="chapter-notes__chevron">${UI.icon('expand_more', 'text-[20px]')}</span>
        </summary>
        <div class="chapter-notes__body">
          <div class="chapter-notes__inner">
            <ol class="footnotes">
              ${footnotes
                .map(
                  (n) => `<li class="footnotes__item" data-note-marker="${UI.esc(n.marker)}">
              <span class="footnotes__marker">${UI.esc(n.marker)}</span>
              <a href="#/read/${bookSlug}/${chapterNumber}/${n.verse || 1}" data-scroll-to="${n.verse || 1}" class="min-w-0">
                <span class="footnotes__text">${UI.esc(n.text)}</span>
              </a>
            </li>`
                )
                .join('')}
            </ol>
            <button type="button" data-act="all-notes" class="mt-space-sm font-label-md text-label-md text-secondary font-semibold hover:underline">Open notes side by side</button>
          </div>
        </div>
      </details>`
      : '';
  }

  function shellHtml() {
    return `
    <div class="reader-shell">
      <div class="reader-split">
        <div>
          <button type="button" data-act="open-books"
            class="book-pill no-print">
            ${UI.icon('auto_stories', 'text-[16px]')}<span>${UI.esc(book.title)}</span>${UI.icon('expand_more', 'text-[16px]')}
          </button>

          <header class="chapter-head">
            <!-- chapter.intro / chapter.summary are raw HTML: the build script
                 (scripts/build-chapter-headings.js) reduces them to an
                 allowlist of small/em/i/b/strong/cite/a before storing them. -->
            <p class="chapter-head__book">${UI.esc(book.fullTitle || book.title)}</p>
            ${chapter.subtitle ? `<p class="chapter-head__subtitle">${UI.esc(chapter.subtitle)}</p>` : ''}
            ${chapter.intro ? `<p class="chapter-head__intro">${chapter.intro}</p>` : ''}
            <h1 class="chapter-head__num">Chapter ${chapterNumber}</h1>
            ${chapter.summary ? `<p class="chapter-head__summary">${chapter.summary}</p>` : ''}
            <p class="chapter-head__meta">${chapter.verses.length} verses · about ${Math.max(1, Math.round(chapterMs / 60000))} min</p>
          </header>

          <div id="scripture" class="scripture-body text-on-surface" data-chapter="${bookSlug}/${chapterNumber}">
            ${chapter.verses.map(verseMarkup).join('')}
          </div>

          ${footnotesHtml()}

          <nav class="no-print mt-space-2xl pt-space-lg border-t border-outline-variant flex items-center justify-between gap-space-sm" aria-label="Chapter navigation">
            ${
              neighbours.previous
                ? `<a href="#/read/${neighbours.previous.bookSlug}/${neighbours.previous.chapter}" class="inline-flex items-center gap-space-2xs bg-surface-container text-primary font-label-lg text-label-lg px-space-md py-3 rounded-full hover:bg-surface-container-high transition-colors">
                     ${UI.icon('arrow_back', 'text-[18px]')}<span class="truncate max-w-[9rem]">${UI.esc(neighbours.previous.bookTitle)} ${neighbours.previous.chapter}</span>
                   </a>`
                : '<span></span>'
            }
            ${
              neighbours.next
                ? `<a href="#/read/${neighbours.next.bookSlug}/${neighbours.next.chapter}" class="inline-flex items-center gap-space-2xs bg-secondary-container text-on-secondary-container font-label-lg text-label-lg px-space-md py-3 rounded-full shadow-gold active:scale-[.98] transition-transform">
                     <span class="truncate max-w-[9rem]">${UI.esc(neighbours.next.bookTitle)} ${neighbours.next.chapter}</span>${UI.icon('arrow_forward', 'text-[18px]')}
                   </a>`
                : '<span></span>'
            }
          </nav>

          ${studyAidsHtml()}
        </div>
      </div>
    </div>
    <div id="listen-slot" class="no-print"></div>`;
  }

  /* ------------------------------------------------------- chapter drawing */

  function flash(node) {
    node.classList.add('is-selected');
    setTimeout(() => node.classList.remove('is-selected'), 1200);
  }

  /** Open the (collapsed) chapter notes, then scroll to and highlight the
      footnote a verse marker points at. */
  function openNotesTo(marker, verseKey) {
    const details = root.querySelector('.chapter-notes');
    if (!details) return;
    details.open = true;

    // let the 200ms open animation finish before measuring the item position
    const waitForOpen = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 220;
    setTimeout(() => {
      const item = details.querySelector('.footnotes__item[data-note-marker="' + CSS.escape(marker) + '"]');
      if (item) {
        const honorReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        item.scrollIntoView({ block: 'center', behavior: honorReduced ? 'auto' : 'smooth' });
        flash(item);
      }
    }, waitForOpen);

    if (verseKey) {
      const p = String(verseKey).split('/');
      if (p.length === 3) Store.setProgress({ book: p[0], chapter: Number(p[1]), verse: Number(p[2]) });
    }
  }

  function onPointerDown(event) {
    downAt = Date.now();
    const verseNode = event.target.closest('.verse');
    if (verseNode) verseNode.dataset.pointerStart = String(event.clientY);
  }

  function onScriptureClick(event) {
    if (window.getSelection && String(window.getSelection()).length > 3) return;

    const noteBtn = event.target.closest('[data-act="open-notes"]');
    const verseNode = event.target.closest('.verse');
    if (!verseNode) return;

    const key = verseNode.dataset.verse;
    if (!key) return;
    const same = selectedKey === key;

    // footnote marker -> open the chapter notes and jump to that note;
    // verse numeral -> the study-notes sheet, as before
    if (noteBtn) {
      closePalette();
      if (noteBtn.classList.contains('verse__note')) {
        openNotesTo(noteBtn.dataset.marker, noteBtn.dataset.verse);
      } else {
        const verse = Scripture.verseByKey(key);
        Sheets.studyNotes(verse, null, ctx);
      }
      return;
    }

    // quick double-tap to bookmark
    if (same && Date.now() - downAt < 900) {
      const now = Store.toggleBookmark(key);
      verseNode.dataset.bookmark = String(now);
      UI.toast(now ? 'Bookmarked ' + verse.reference : 'Bookmark removed', { tone: 'good', icon: now ? 'bookmark' : 'bookmark_remove' });
      flash(verseNode);
      return;
    }

    document.querySelectorAll('.verse.is-selected').forEach((n) => n.classList.remove('is-selected'));
    verseNode.classList.add('is-selected');
    openPalette(key, verseNode.getBoundingClientRect());
  }

  let downAt = 0;

  function bindScripture(el) {
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', onScriptureClick);
  }

  function syncStickyHeader() {
    const past =
      chapterHead && chapterHead.getBoundingClientRect().bottom <= (headerEl ? headerEl.offsetHeight || 64 : 64);
    if (headerEl) headerEl.classList.toggle('is-scrolled', !!past);
  }

  function renderChapter() {
    book = Scripture.book(bookSlug);
    chapter = Scripture.chapter(bookSlug, chapterNumber);
    if (!chapter) {
      chapterNumber = book.chapters[0].number;
      chapter = Scripture.chapter(bookSlug, chapterNumber);
    }
    neighbours = Scripture.neighbours(bookSlug, chapterNumber);
    bookProg = Store.bookProgress(bookSlug, book.chapters.length);
    chapterRead = Store.hasReadChapter(bookSlug, chapterNumber);
    chapterMs = UI.readingTimeMs(chapterText(chapter), settings.wpm);
    footnotes = Scripture.chapterFootnotes(bookSlug, chapterNumber);

    ctx.setHeader({
      lead: 'reader',
      reference: `${book.title} · Chapter ${chapterNumber}`,
      trail: headerTrail,
      progress: bookProg.ratio,
    });

    root.innerHTML = shellHtml();
    scripture = root.querySelector('#scripture');
    bindScripture(scripture);
    chapterHead = root.querySelector('.chapter-head');
    syncStickyHeader();
  }

  renderChapter();

  /* ------------------------------------------------------- reading palette */

  let selectedKey = null;

  function paletteNode() {
    return document.getElementById('progress-root');
  }

  function openPalette(key, anchorRect) {
    selectedKey = key;
    const verse = Scripture.verseByKey(key);
    if (!verse) return;
    clearPalette();

    const highlight = Store.highlightFor(key);
    const saved = Store.isBookmarked(key);
    const hasNote = !!Store.noteFor(key);

    const el = UI.el('div', {
      id: 'reading-palette',
      class: 'no-print fixed z-[65] bg-surface border border-outline-variant rounded-full shadow-level2 p-1 flex items-center gap-0.5',
      role: 'toolbar',
      'aria-label': 'Reading palette for ' + verse.reference,
    });

    const actions = [
      {
        act: 'palette-bookmark',
        icon: saved ? 'bookmark' : 'bookmark_border',
        filled: saved,
        label: saved ? 'Remove bookmark' : 'Bookmark',
      },
      {
        act: 'palette-highlight',
        icon: 'ink_highlighter',
        filled: !!highlight,
        label: highlight ? 'Change highlight' : 'Highlight',
      },
      { act: 'palette-note', icon: 'edit_note', filled: hasNote, label: hasNote ? 'Edit note' : 'Add note' },
      { act: 'palette-copy', icon: 'content_copy', label: 'Copy' },
      { act: 'palette-listen', icon: 'volume_up', label: 'Listen from here' },
      { act: 'palette-ask', icon: 'explore', label: 'Ask about this' },
      { act: 'palette-notes', icon: 'sticky_note_2', label: 'Study notes' },
    ];

    el.innerHTML = actions
      .map(
        (a) => `<button type="button" data-pal-act="${a.act}" aria-label="${a.label}" title="${a.label}"
          class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors">
          ${UI.icon(a.icon, 'text-[20px]', a.filled)}
        </button>`
      )
      .join('');

    paletteNode().appendChild(el);

    // position: above the verse when there is room, otherwise below
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let top = (anchorRect ? anchorRect.top : window.innerHeight / 2) - rect.height - pad;
    let left = (anchorRect ? anchorRect.left + anchorRect.width / 2 : window.innerWidth / 2) - rect.width / 2;
    if (top < 70) {
      top = (anchorRect ? anchorRect.bottom : window.innerHeight / 2) + pad;
    }
    left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
    el.style.top = Math.round(top) + 'px';
    el.style.left = Math.round(left) + 'px';

    el.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-pal-act]');
      if (!btn) return;
      handlePaletteAction(btn.dataset.palAct);
    });
  }

  function clearPalette() {
    const existing = document.getElementById('reading-palette');
    if (existing) existing.remove();
  }

  function closePalette() {
    clearPalette();
    if (selectedKey) {
      document.querySelectorAll('.verse.is-selected').forEach((n) => n.classList.remove('is-selected'));
      selectedKey = null;
    }
  }

  function handlePaletteAction(act) {
    const key = selectedKey;
    if (!key) return;
    const verse = Scripture.verseByKey(key);

    switch (act) {
      case 'palette-bookmark': {
        const now = Store.toggleBookmark(key);
        const btn = document.querySelector('[data-pal-act="palette-bookmark"]');
        if (btn) {
          btn.innerHTML = UI.icon(now ? 'bookmark' : 'bookmark_border', 'text-[20px]', now);
          btn.setAttribute('aria-label', now ? 'Remove bookmark' : 'Bookmark');
        }
        const node = document.getElementById('v' + verse.verse);
        if (node) node.dataset.bookmark = String(now);
        UI.toast(now ? 'Bookmarked ' + verse.reference : 'Bookmark removed', { tone: 'good', icon: now ? 'bookmark' : 'bookmark_remove' });
        break;
      }
      case 'palette-highlight':
        closePalette();
        Sheets.highlightPicker(verse, ctx, () => {
          const hl = Store.highlightFor(key);
          const node = document.getElementById('v' + verse.verse);
          if (node) {
            node.classList.remove('hl-gold', 'hl-green', 'hl-blue', 'hl-rose');
            if (hl) node.classList.add('hl-' + hl.color);
          }
        });
        break;
      case 'palette-note':
        closePalette();
        Sheets.noteEditor(verse, ctx, () => {
          const node = document.getElementById('v' + verse.verse);
          const text = Store.noteFor(key);
          if (node) {
            if (text) node.dataset.note = 'true';
            else delete node.dataset.note;
          }
        });
        break;
      case 'palette-copy':
        UI.copy(verse.text + ' (' + verse.reference + ')').then((ok) =>
          UI.toast(ok ? 'Verse copied' : 'Could not copy', { tone: ok ? 'good' : 'bad', icon: ok ? 'content_copy' : 'error' })
        );
        closePalette();
        break;
      case 'palette-listen':
        closePalette();
        startListening(verse.number);
        break;
      case 'palette-ask':
        closePalette();
        ctx.navigate('#/ask?verse=' + key);
        break;
      case 'palette-notes':
        closePalette();
        Sheets.studyNotes(verse, null, ctx);
        break;
      default:
        closePalette();
    }
  }

  /* ---------------------------------------------------------- listen player */

  const LISTEN_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

  const listen = {
    active: false,
  };

  function listenRateForStart() {
    const saved = Store.settings().listenRate;
    if (typeof saved === 'number' && saved >= 0.5 && saved <= 2) return saved;
    return Math.min(2, Math.max(0.5, (Store.settings().wpm || 200) / 200));
  }

  function buildSegments(startVerse) {
    return chapter.verses
      .filter((v) => v.number >= (startVerse || 1))
      .map((v) => ({ text: v.text, key: bookSlug + '/' + chapterNumber + '/' + v.number }));
  }

  function referenceForKey(key) {
    if (!key) return book.title + ' ' + chapterNumber;
    const verse = Scripture.verseByKey(key);
    return verse ? verse.reference : book.title + ' ' + chapterNumber;
  }

  function onSpeakVerse(key) {
    document.querySelectorAll('.verse.is-speaking').forEach((n) => n.classList.remove('is-speaking'));
    if (key) {
      const node = root.querySelector('.verse[data-verse="' + CSS.escape(key) + '"]');
      if (node) {
        node.classList.add('is-speaking');
        const rect = node.getBoundingClientRect();
        if (rect.top < 90 || rect.bottom > window.innerHeight - 180) {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        const p = key.split('/');
        if (p.length === 3) Store.setProgress({ book: p[0], chapter: Number(p[1]), verse: Number(p[2]) });
      }
    }
    syncPlayer();
  }

  function playQueue(startVerse, onDone) {
    return TTS.play(buildSegments(startVerse), {
      rate: listenRateForStart(),
      onVerse: onSpeakVerse,
      onDone: onDone || null,
    });
  }

  function startListening(startVerse) {
    closePalette();
    const ok = playQueue(startVerse, onChapterDone);
    if (!ok) return;
    listen.active = true;
    document.body.classList.add('listen-mode');
    mountPlayer();
    UI.toast('Reading aloud from verse ' + (startVerse || 1), { tone: 'good', icon: 'volume_up' });
  }

  function onChapterDone() {
    if (!listen.active) return;
    const next = neighbours.next;
    if (!next) {
      stopListening('Reached the end of ' + book.title);
      return;
    }
    // advance to the next chapter in place so the narration never drops
    bookSlug = next.bookSlug;
    chapterNumber = next.chapter;
    verseNumber = null;
    window.history.replaceState(null, '', '#/read/' + bookSlug + '/' + chapterNumber);
    Store.setProgress({ book: bookSlug, chapter: chapterNumber, verse: 1 });
    closePalette();
    renderChapter();
    mountPlayer();
    playQueue(1, onChapterDone);
  }

  function stopListening(finishText) {
    listen.active = false;
    document.body.classList.remove('listen-mode');
    TTS.stop();
    unmountPlayer();
    if (finishText) UI.toast(finishText, { tone: 'good', icon: 'done_all' });
  }

  function speedLabel(rate) {
    const r = rate === undefined ? Store.settings().listenRate : rate;
    return String(r).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }

  function playerProgress() {
    const cur = TTS.current();
    if (!cur.total) return 0;
    const span = cur.index + (cur.speaking ? 1 : 0);
    return Math.min(100, Math.round((span / cur.total) * 100));
  }

  function playerHtml() {
    const cur = TTS.current();
    const speaking = TTS.isSpeaking();
    return `
    <div id="listen-player" class="fixed inset-x-0 bottom-0 z-[70] bg-surface/95 backdrop-blur-xl border-t border-outline-variant pb-safe" data-listen-root>
      <div class="max-w-3xl mx-auto px-margin pt-space-sm pb-space-sm flex items-center gap-space-xs">
        <div class="flex items-center gap-0.5 shrink-0">
          <button type="button" id="lp-prev" aria-label="Previous verse"
            class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">${UI.icon('skip_previous', 'text-[20px]')}</button>
          <button type="button" id="lp-toggle" aria-label="${speaking ? 'Pause' : 'Resume'}"
            class="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center hover:brightness-95 active:scale-95 transition-transform shadow-gold">${UI.icon(speaking ? 'pause' : 'play_arrow', 'text-[26px]', true)}</button>
          <button type="button" id="lp-next" aria-label="Next verse"
            class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">${UI.icon('skip_next', 'text-[20px]')}</button>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-space-sm">
            <button type="button" id="lp-ref" class="min-w-0 font-label-md text-label-md text-primary font-semibold truncate hover:underline text-left">${UI.esc(referenceForKey(cur.key))}</button>
            <span id="lp-count" class="font-marginalia text-marginalia text-on-surface-variant tabular-nums shrink-0">${cur.total ? cur.index + 1 + ' of ' + cur.total : ''}</span>
          </div>
          <div class="mt-1 h-1 rounded-full bg-surface-container-highest overflow-hidden">
            <div id="lp-bar" class="h-full bg-secondary-container transition-all duration-300" style="width:${playerProgress()}%"></div>
          </div>
        </div>
        <div class="flex items-center gap-0.5 shrink-0">
          <button type="button" id="lp-speed" aria-label="Playback speed"
            class="h-9 min-w-[44px] px-2 rounded-full flex items-center justify-center font-label-md text-label-md text-primary hover:bg-surface-container transition-colors">${speedLabel()}\u00d7</button>
          <button type="button" id="lp-close" aria-label="Stop and close"
            class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">${UI.icon('close', 'text-[20px]')}</button>
        </div>
      </div>
    </div>`;
  }

  function cycleSpeed() {
    const list = LISTEN_SPEEDS;
    const cur = Store.settings().listenRate;
    const i = list.indexOf(cur);
    const next = list[(i + 1) % list.length];
    Store.setSettings({ listenRate: next });
    TTS.setRate(next);
    syncPlayer();
  }

  function scrollToCurrent() {
    const key = TTS.current().key;
    if (!key) return;
    const node = root.querySelector('.verse[data-verse="' + CSS.escape(key) + '"]');
    if (node) {
      flash(node);
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function syncPlayer() {
    const lp = root.querySelector('#listen-player');
    if (!lp) return;
    const cur = TTS.current();
    const speaking = TTS.isSpeaking();

    const toggle = lp.querySelector('#lp-toggle');
    if (toggle) {
      const iconEl = toggle.querySelector('.material-symbols-outlined');
      if (iconEl) iconEl.textContent = speaking ? 'pause' : 'play_arrow';
      toggle.setAttribute('aria-label', speaking ? 'Pause' : 'Resume');
    }
    const ref = lp.querySelector('#lp-ref');
    if (ref) ref.textContent = referenceForKey(cur.key);
    const count = lp.querySelector('#lp-count');
    if (count) count.textContent = cur.total ? cur.index + 1 + ' of ' + cur.total : '';
    const bar = lp.querySelector('#lp-bar');
    if (bar) bar.style.width = playerProgress() + '%';
    const speed = lp.querySelector('#lp-speed');
    if (speed) speed.textContent = speedLabel() + '\u00d7';
    lp.classList.toggle('is-paused', !!cur.paused);
    lp.classList.toggle('is-idle', !cur.speaking && !cur.paused);
  }

  function mountPlayer() {
    const slot = root.querySelector('#listen-slot');
    if (!slot) return;
    slot.innerHTML = playerHtml();
    const lp = slot.querySelector('#listen-player');
    if (!lp) return;
    const on = (sel, fn) => {
      const n = lp.querySelector(sel);
      if (n) n.addEventListener('click', fn);
    };
    on('#lp-toggle', () => TTS.toggle());
    on('#lp-prev', () => {
      const c = TTS.current();
      if (c.total) TTS.seek(c.index - 1);
    });
    on('#lp-next', () => {
      const c = TTS.current();
      if (c.total) TTS.seek(c.index + 1);
    });
    on('#lp-speed', cycleSpeed);
    on('#lp-close', () => stopListening());
    on('#lp-ref', scrollToCurrent);
    syncPlayer();
  }

  function unmountPlayer() {
    const slot = root.querySelector('#listen-slot');
    if (slot) slot.innerHTML = '';
  }

  const unsubTts = TTS.onStateChange(syncPlayer);

  /* ---------------------------------------------------------- chapter nav */

  function openBooksSheet() {
    const books = Scripture.listBooks();
    const body = `
      <div class="space-y-space-xs">
        ${books
          .map((b) => {
            const prog = Store.bookProgress(b.slug, b.chapters.length);
            const current = b.slug === bookSlug;
            return `<button type="button" data-book="${b.slug}"
              class="w-full flex items-center justify-between gap-space-sm p-space-sm rounded-xl text-left transition-colors ${current ? 'bg-secondary-container/30' : 'hover:bg-surface-container'}">
              <span class="min-w-0">
                <span class="font-headline-sm text-headline-sm ${current ? 'text-secondary' : 'text-primary'} block truncate">${UI.esc(b.title)}</span>
                <span class="font-marginalia text-marginalia text-on-surface-variant">${b.chapters.length} chapters${prog.read ? ' · ' + prog.read + ' read' : ''}</span>
              </span>
              <span class="w-10 h-1.5 rounded-full bg-surface-container-highest overflow-hidden shrink-0">
                <span class="block h-full bg-secondary-container" style="width:${Math.round(prog.ratio * 100)}%"></span>
              </span>
            </button>`;
          })
          .join('')}
      </div>`;

    const handle = UI.sheet({
      title: 'Books of the Book of Mormon',
      subtitle: `${books.length} volumes`,
      body,
      size: 'tall',
      actions: [{ label: 'Close', tone: 'primary' }],
    });

    handle.panel.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-book]');
      if (!btn) return;
      const target = Scripture.book(btn.dataset.book);
      const next = target.chapters[0].number;
      handle.close();
      ctx.navigate('#/read/' + target.slug + '/' + next);
    });
  }

  function openChaptersSheet() {
    const book = Scripture.book(bookSlug);
    const body = `
      <div class="grid grid-cols-5 gap-space-xs" role="list">
        ${book.chapters
          .map((c) => {
            const read = Store.hasReadChapter(book.slug, c.number);
            const current = c.number === chapterNumber;
            return `<a href="#/read/${book.slug}/${c.number}" data-sheet-close role="listitem"
              aria-current="${current ? 'true' : 'false'}"
              class="h-12 rounded-xl flex items-center justify-center font-headline-sm text-headline-sm transition-colors ${
              current
                ? 'bg-primary text-on-primary'
                : read
                ? 'bg-secondary-container text-on-secondary-container'
                : 'bg-surface-container text-primary hover:bg-surface-container-high'
            }">${c.number}</a>`;
          })
          .join('')}
      </div>`;

    UI.sheet({
      title: book.title,
      subtitle: `${book.chapters.length} chapters · ${Math.round(bookProg.ratio * 100)}% read`,
      body,
      actions: [{ label: 'Close', tone: 'primary' }],
    });
  }

  function openFontSheet() {
    const current = settings;
    const body = `
      <div class="space-y-space-lg">
        <section>
          <h3 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Typeface</h3>
          <div class="mt-space-xs grid grid-cols-2 gap-space-xs" role="radiogroup">
            <button type="button" data-font="serif" role="radio" aria-checked="${current.typeface === 'serif'}"
              class="p-space-md rounded-xl border-2 text-left transition-colors ${current.typeface === 'serif' ? 'border-accent bg-surface-container' : 'border-outline-variant'}">
              <span class="font-headline-lg text-headline-lg text-primary block">Merriweather</span>
              <span class="font-marginalia text-marginalia text-on-surface-variant">Serif · for sustained reading</span>
            </button>
            <button type="button" data-font="sans" role="radio" aria-checked="${current.typeface === 'sans'}"
              class="p-space-md rounded-xl border-2 text-left transition-colors ${current.typeface === 'sans' ? 'border-accent bg-surface-container' : 'border-outline-variant'}">
              <span class="font-headline-lg text-headline-lg text-primary block" style="font-family:'Plus Jakarta Sans',sans-serif">Jakarta Sans</span>
              <span class="font-marginalia text-marginalia text-on-surface-variant">Sans · lower contrast</span>
            </button>
          </div>
        </section>

        <section>
          <h3 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Text size</h3>
          <div class="mt-space-xs flex items-center gap-space-sm">
            <span class="font-marginalia text-marginalia text-on-surface-variant w-8">A</span>
            <input type="range" id="density-range" min="0" max="2" step="1" value="${['compact', 'regular', 'comfortable'].indexOf(current.density)}"
              class="flex-1 accent-[rgb(var(--accent))]" aria-label="Text size">
            <span class="font-headline-sm text-headline-sm text-primary w-8 text-right">A</span>
          </div>
          <p class="font-marginalia text-marginalia text-on-surface-variant mt-1" id="density-label">${UI.esc(current.density)}</p>
        </section>

        <section class="space-y-space-sm">
          <label class="flex items-center justify-between gap-space-sm cursor-pointer">
            <span>
              <span class="font-body-lg text-body-lg text-primary block">Show verse numbers</span>
              <span class="font-marginalia text-marginalia text-on-surface-variant">Small superscript numerals</span>
            </span>
            <input type="checkbox" id="show-numbers" ${current.showVerseNumbers ? 'checked' : ''} class="w-5 h-5 accent-[rgb(var(--accent))]">
          </label>
        </section>

        <section class="bg-surface-container rounded-xl p-space-md space-y-space-xs">
          <h3 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Preview</h3>
          <p class="scripture-body text-[15px] leading-[1.8] italic text-on-surface-variant">
            I will go and do the things which the Lord hath commanded, for I know that the Lord giveth no commandments unto the children of men, save he shall prepare a way for them.
          </p>
        </section>
      </div>`;

    const handle = UI.sheet({
      title: 'Reading options',
      body,
      actions: [{ label: 'Done', tone: 'primary', onClick: () => ctx.rerender() }],
    });

    handle.panel.addEventListener('click', (event) => {
      const fontBtn = event.target.closest('[data-font]');
      if (!fontBtn) return;
      Store.setSettings({ typeface: fontBtn.dataset.font });
      Store.applyTheme();
      handle.panel.querySelectorAll('[data-font]').forEach((b) => {
        const on = b.dataset.font === fontBtn.dataset.font;
        b.setAttribute('aria-checked', String(on));
        b.classList.toggle('border-accent', on);
        b.classList.toggle('bg-surface-container', on);
        b.classList.toggle('border-outline-variant', !on);
      });
    });

    const range = handle.panel.querySelector('#density-range');
    if (range) {
      range.addEventListener('input', () => {
        const density = ['compact', 'regular', 'comfortable'][Number(range.value)];
        Store.setSettings({ density });
        document.documentElement.setAttribute('data-density', density);
        handle.panel.querySelector('#density-label').textContent = density;
      });
    }

    const numbers = handle.panel.querySelector('#show-numbers');
    if (numbers) {
      numbers.addEventListener('change', () => {
        Store.setSettings({ showVerseNumbers: numbers.checked });
        ctx.rerender();
      });
    }
  }

  /* --------------------------------------------------------------- wiring */

  UI.on(root, 'click', '[data-act="open-books"]', () => openBooksSheet());
  UI.on(root, 'click', '[data-act="all-notes"]', () => Sheets.studyNotes({ bookSlug, chapter: chapterNumber }, chapterNumber, ctx));

  // these two live in the fixed header, not inside root
  ctx.onHeader('[data-act="open-chapters"]', () => openChaptersSheet());
  ctx.onHeader('[data-act="toggle-font"]', () => openFontSheet());

  // chapter rail links inside the marginalia need to scroll, not re-render
  UI.on(root, 'click', '[data-scroll-to]', (event, link) => {
    event.preventDefault();
    const target = link.getAttribute('data-scroll-to');
    const node = root.querySelector('#v' + target);
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      flash(node);
      Store.setProgress({ book: bookSlug, chapter: chapterNumber, verse: Number(target) });
    }
  });

  document.addEventListener('keydown', onKey);
  function onKey(event) {
    if (event.key === 'Escape') closePalette();
  }

  // dismiss the palette when tapping elsewhere
  const dismiss = (event) => {
    if (event.target.closest('#reading-palette')) return;
    if (event.target.closest('.verse')) return;
    closePalette();
  };
  document.addEventListener('pointerdown', dismiss);

  /* --------------------------------------------- autoplay from the query */

  const query = ctx.query;
  if (query.autoplay === '1') startListening(1);

  /* -------------------------------------------------------- progress/timing */

  let startedAt = Date.now();
  let flushTimer = null;

  function flushReadingTime() {
    const elapsed = Date.now() - startedAt;
    startedAt = Date.now();
    if (elapsed > 1500) {
      Store.addReadingTime(elapsed);
      if (Store.settings().autoMarkStreak) Store.markStudied(0);
    }
  }

  flushTimer = setInterval(flushReadingTime, 20000);

  /* ------------------------------------------------- sticky chapter header */

  // The fixed app header already carries the book and chapter. Once the big
  // chapter heading scrolls out of view the header is all that tells you where
  // you are, so it gains a hairline and a shadow at that point.
  syncStickyHeader();
  window.addEventListener('scroll', syncStickyHeader, { passive: true });

  ctx.onLeave(() => {
    clearInterval(flushTimer);
    flushReadingTime();
    TTS.stop();
    unsubTts();
    closePalette();
    unmountPlayer();
    document.body.classList.remove('listen-mode');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', dismiss);
    window.removeEventListener('scroll', syncStickyHeader);
    if (headerEl) headerEl.classList.remove('is-scrolled');
  });

  // record the position (this also marks the chapter read the first time)
  Store.setProgress({ book: bookSlug, chapter: chapterNumber, verse: verseNumber || 1 });

  // deep link to a specific verse
  if (verseNumber) {
    requestAnimationFrame(() => {
      const node = root.querySelector('#v' + verseNumber);
      if (node) {
        node.scrollIntoView({ block: 'center' });
        flash(node);
      }
    });
  }
};