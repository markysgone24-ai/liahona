/* ==========================================================================
   Library — books, chapter grid, reading progress per volume
   ========================================================================== */
window.Views = window.Views || {};

Views.library = function (ctx) {
  const stats = Scripture.stats();
  const books = Scripture.listBooks();
  const progress = Store.progress();

  ctx.setHeader({
    lead: 'brand',
    trail: `<button type="button" data-act="reset-progress" class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="Continue reading">${UI.icon('play_circle', 'text-[22px]')}</button>`,
    progress: null,
  });

  const overallRead = progress.chaptersRead.length;

  const bookCards = books
    .map((book) => {
      const prog = Store.bookProgress(book.slug, book.chapters.length);
      const verseCount = book.chapters.reduce((n, c) => n + c.verses.length, 0);
      const pct = Math.round(prog.ratio * 100);
      const current = book.slug === progress.book;

      return `
        <li>
          <a href="#/library/${book.slug}"
             class="block bg-surface-container-low rounded-xl shadow-level1 overflow-hidden transition-all active:scale-[.99] hover:shadow-level2">
            <div class="h-1.5 w-full ${current ? 'bg-secondary-container' : 'bg-transparent'}"></div>
            <div class="p-space-md space-y-space-sm">
              <div class="flex items-start justify-between gap-space-sm">
                <div class="min-w-0">
                  <h2 class="font-headline-sm text-headline-sm text-primary truncate">${UI.esc(book.title)}</h2>
                  <p class="font-marginalia text-marginalia text-on-surface-variant mt-0.5">
                    ${book.chapters.length} chapters · ${verseCount.toLocaleString()} verses
                  </p>
                </div>
                <span class="font-label-md text-label-md ${prog.read ? 'text-secondary font-semibold' : 'text-outline'} shrink-0 tabular-nums">${pct}%</span>
              </div>
              <div class="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                <div class="bg-secondary-container h-full rounded-full transition-all duration-500" style="width:${pct}%"></div>
              </div>
              <p class="font-marginalia text-marginalia text-on-surface-variant">
                ${
                  current && progress.chapter
                    ? `Reading ${UI.esc(book.title)} ${progress.chapter}`
                    : prog.read
                    ? `${prog.read} of ${prog.total} chapters read`
                    : 'Not started'
                }
              </p>
            </div>
          </a>
        </li>`;
    })
    .join('');

  ctx.root.innerHTML = `
    <section class="pt-space-xs space-y-space-lg">
      <div class="space-y-0.5">
        <h1 class="font-display-lg-mobile text-display-lg-mobile text-primary tracking-tight">Library</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">
          ${stats.books} volumes · ${stats.chapters} chapters · ${stats.verses.toLocaleString()} verses
        </p>
      </div>

      <a href="#/read/${progress.book}/${progress.chapter}/${progress.verse}"
         class="flex items-center gap-space-md bg-primary-container text-on-primary rounded-xl shadow-level2 p-space-lg active:scale-[.99] transition-transform">
        <span class="w-11 h-11 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
          ${UI.icon('menu_book', 'text-[22px]')}
        </span>
        <span class="min-w-0 flex-1">
          <span class="font-label-md text-label-md uppercase tracking-wider text-secondary-container font-semibold block">Continue reading</span>
          <span class="font-headline-sm text-headline-sm block truncate">${UI.esc(Scripture.book(progress.book).title)} ${progress.chapter}:${progress.verse}</span>
          <span class="font-marginalia text-marginalia text-on-primary-container block truncate">
            ${overallRead} chapter${overallRead === 1 ? '' : 's'} read${progress.lastReadAt ? ' · ' + UI.esc(UI.relativeTime(progress.lastReadAt)) : ''}
          </span>
        </span>
        ${UI.icon('arrow_forward', 'text-[22px] text-on-primary-container shrink-0')}
      </a>

      <section class="space-y-space-xs">
        <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold px-1">Volumes</h2>
        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">${bookCards}</ul>
      </section>

      <section class="bg-surface-container-low rounded-xl p-space-md shadow-level1">
        <div class="flex items-center gap-space-xs mb-space-sm">
          ${UI.icon('info', 'text-[18px] text-secondary')}
          <h2 class="font-headline-sm text-headline-sm text-primary">About this text</h2>
        </div>
        <dl class="space-y-1.5">
          <div class="flex items-baseline justify-between gap-space-sm">
            <dt class="font-body-md text-body-md text-on-surface-variant">Study notes</dt>
            <dd class="font-label-md text-label-md text-primary tabular-nums">${stats.footnotes.toLocaleString()}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-space-sm">
            <dt class="font-body-md text-body-md text-on-surface-variant">Words</dt>
            <dd class="font-label-md text-label-md text-primary tabular-nums">${stats.words.toLocaleString()}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-space-sm">
            <dt class="font-body-md text-body-md text-on-surface-variant">Downloaded</dt>
            <dd class="font-label-md text-label-md text-primary">${stats.fetchedAt ? UI.esc(UI.relativeTime(Date.parse(stats.fetchedAt))) : 'unknown'}</dd>
          </div>
        </dl>
        <p class="font-marginalia text-marginalia text-on-surface-variant mt-space-sm pt-space-sm border-t border-outline-variant">
          ${UI.esc(stats.copyright || '')}
        </p>
        <a href="${UI.esc(stats.source || '#')}" target="_blank" rel="noopener noreferrer"
           class="inline-flex items-center gap-1 font-label-md text-label-md text-secondary font-semibold hover:underline mt-space-xs">
          ${UI.icon('open_in_new', 'text-[14px]')}View on churchofjesuschrist.org
        </a>
      </section>
    </section>`;

  // the continue button lives in the fixed header
  ctx.onHeader('[data-act="reset-progress"]', () => {
    ctx.navigate('#/read/' + progress.book + '/' + progress.chapter + '/' + progress.verse);
  });
};

/* ------------------------------------------------------- single book detail */

Views.libraryBook = function (ctx) {
  const slug = ctx.params[0];
  const book = Scripture.book(slug);

  if (!book) {
    ctx.root.innerHTML = UI.emptyState({
      icon: 'error',
      title: 'Book not found',
      message: 'That volume is not in the loaded text.',
      action: { href: '#/library', label: 'Back to library', icon: 'collections_bookmark' },
    });
    ctx.setHeader({ lead: 'brand', progress: null });
    return;
  }

  const prog = Store.bookProgress(book.slug, book.chapters.length);
  const progress = Store.progress();
  const isCurrent = progress.book === book.slug;
  const pct = Math.round(prog.ratio * 100);

  ctx.setHeader({
    lead: 'back',
    backTo: '#/library',
    backLabel: 'Library',
    trail: `<button type="button" data-act="read-this" class="inline-flex items-center gap-1 h-9 px-3 rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md shadow-gold active:scale-[.98] transition-transform">${UI.icon('play_arrow', 'text-[16px]', true)}<span>Read</span></button>`,
    progress: prog.ratio,
  });

  const startChapter = isCurrent ? progress.chapter : book.chapters.find((c) => !Store.hasReadChapter(book.slug, c.number))?.number || 1;

  ctx.root.innerHTML = `
    <section class="pt-space-xs space-y-space-lg">
      <header>
        <p class="font-label-md text-label-md uppercase tracking-wider text-secondary">${UI.esc(book.slug.replace(/-/g, ' '))}</p>
        <h1 class="font-display-lg-mobile text-display-lg-mobile text-primary tracking-tight">${UI.esc(book.title)}</h1>
        <p class="font-body-md text-body-md text-on-surface-variant mt-0.5">
          ${book.chapters.length} chapters · ${book.chapters.reduce((n, c) => n + c.verses.length, 0).toLocaleString()} verses
        </p>
      </header>

      <section class="bg-surface-container-low rounded-xl p-space-md shadow-level1 space-y-space-sm">
        <div class="flex items-center justify-between">
          <span class="font-headline-sm text-headline-sm text-primary">${prog.read} of ${prog.total} chapters</span>
          <span class="font-headline-sm text-headline-sm text-secondary tabular-nums">${pct}%</span>
        </div>
        <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
          <div class="bg-secondary-container h-full rounded-full transition-all duration-500" style="width:${pct}%"></div>
        </div>
        <a href="#/read/${book.slug}/${startChapter}" class="flex items-center justify-center gap-space-xs bg-secondary-container text-on-secondary-container font-label-lg text-label-lg py-3 rounded-lg shadow-gold active:scale-[.98] transition-transform">
          ${UI.icon('menu_book', 'text-[18px]')}${isCurrent ? 'Continue chapter ' + startChapter : 'Start reading'}
        </a>
      </section>

      <section class="space-y-space-xs">
        <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold px-1">Chapters</h2>
        <ul class="grid grid-cols-3 sm:grid-cols-4 gap-space-xs" role="list">
          ${book.chapters
            .map((c) => {
              const read = Store.hasReadChapter(book.slug, c.number);
              const current = isCurrent && progress.chapter === c.number;
              return `<li role="listitem">
                <a href="#/read/${book.slug}/${c.number}" aria-current="${current ? 'true' : 'false'}"
                   class="h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  current
                    ? 'bg-primary text-on-primary'
                    : read
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-surface-container text-primary hover:bg-surface-container-high'
                }">
                  <span class="font-headline-sm text-headline-sm leading-none">${c.number}</span>
                  <span class="font-marginalia text-marginalia opacity-70">${c.verses.length}v</span>
                  ${read ? `<span class="absolute"></span>` : ''}
                </a>
              </li>`;
            })
            .join('')}
        </ul>
      </section>

      <section class="space-y-space-xs">
        <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold px-1">Chapter titles</h2>
        <ul class="space-y-1">
          ${book.chapters
            .map((c) => {
              const read = Store.hasReadChapter(book.slug, c.number);
              return `<li>
                <a href="#/read/${book.slug}/${c.number}" class="flex items-center gap-space-sm p-space-sm rounded-xl hover:bg-surface-container transition-colors ${read ? '' : 'opacity-70'}">
                  <span class="w-8 h-8 rounded-full ${read ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'} flex items-center justify-center font-label-md text-label-md shrink-0">${c.number}</span>
                  <span class="min-w-0 flex-1">
                    <span class="font-body-md text-body-md text-primary block truncate">${UI.esc(c.title.replace(/^.*?\d+\s*/, '') || c.title)}</span>
                    ${c.subtitle ? `<span class="font-marginalia text-marginalia text-on-surface-variant block truncate">${UI.esc(c.subtitle)}</span>` : ''}
                  </span>
                  <span class="font-marginalia text-marginalia text-outline shrink-0">${c.verses.length}v</span>
                </a>
              </li>`;
            })
            .join('')}
        </ul>
      </section>
    </section>`;

  // the play button lives in the fixed header
  ctx.onHeader('[data-act="read-this"]', () => {
    ctx.navigate('#/read/' + book.slug + '/' + startChapter);
  });
};