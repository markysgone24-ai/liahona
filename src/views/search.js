/* ==========================================================================
   Search — live full-text search across every verse in the Book of Mormon
   ========================================================================== */
window.Views = window.Views || {};

Views.search = function (ctx) {
  const initial = ctx.query.q || '';

  let bookFilter = ctx.query.book || '';
  let lastResult = null;

  ctx.setHeader({
    lead: 'brand',
    trail: `<a href="#/library" aria-label="Browse the library" class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">${UI.icon('collections_bookmark', 'text-[20px]')}</a>`,
    progress: null,
  });

  ctx.root.innerHTML = `
    <section class="pt-space-xs space-y-space-md">
      <div class="space-y-0.5">
        <h1 class="font-display-lg-mobile text-display-lg-mobile text-primary tracking-tight">Search</h1>
        <p class="font-body-md text-body-md text-on-surface-variant" id="search-subtitle">
          ${Scripture.stats().verses.toLocaleString()} verses, indexed on this device
        </p>
      </div>

      <form id="search-form" role="search" class="space-y-space-sm">
        <div class="relative">
          <label for="search-input" class="sr-only">Search the Book of Mormon</label>
          <span class="absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">${UI.icon('search', 'text-[20px]')}</span>
          <input id="search-input" name="q" type="search" autocomplete="off" enterkeyhint="search" value="${UI.esc(initial)}"
            placeholder="Topics, phrases, or a reference…"
            class="w-full bg-surface-container-lowest border border-outline-variant text-on-surface text-body-lg font-body-lg pl-[2.75rem] pr-[2.75rem] py-3 rounded-xl focus:border-accent outline-none focus:ring-2 focus:ring-accent/40">
          <button type="button" id="search-clear" aria-label="Clear search"
            class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors ${initial ? '' : 'hidden'}">
            ${UI.icon('close', 'text-[18px]')}
          </button>
        </div>

        <div class="flex items-center gap-space-sm">
          <label for="book-filter" class="sr-only">Filter by book</label>
          <select id="book-filter"
            class="flex-1 bg-surface-container text-primary text-label-md font-label-md px-space-sm py-2.5 rounded-lg border border-outline-variant focus:border-accent outline-none">
            <option value="">All books</option>
            ${Scripture.listBooks()
              .map((b) => `<option value="${b.slug}" ${bookFilter === b.slug ? 'selected' : ''}>${UI.esc(b.title)}</option>`)
              .join('')}
          </select>
          <button type="button" id="search-ref"
            class="shrink-0 inline-flex items-center gap-space-2xs bg-surface-container text-primary font-label-md text-label-md px-space-sm py-2.5 rounded-lg hover:bg-surface-container-high transition-colors">
            ${UI.icon('my_location', 'text-[16px]')}<span>Go to verse</span>
          </button>
        </div>
      </form>

      <div id="search-body" class="pt-space-2xs"></div>
    </section>`;

  const input = ctx.root.querySelector('#search-input');
  const body = ctx.root.querySelector('#search-body');
  const filterSelect = ctx.root.querySelector('#book-filter');
  const clearBtn = ctx.root.querySelector('#search-clear');

  /* --------------------------------------------------------- suggestions */

  function renderSuggestions() {
    const recent = Store.searches();
    const topics = Scripture.popularSearches(10);
    const terms = Scripture.suggest(14);

    body.innerHTML = `
      <div class="space-y-space-lg">
        ${
          recent.length
            ? `<section>
                 <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold px-1">Recent</h2>
                 <div class="mt-space-xs flex flex-wrap gap-1.5">
                   ${recent
                     .map(
                       (s) => `<button type="button" data-term="${UI.esc(s.term)}"
                         class="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high transition-colors">
                         ${UI.icon('history', 'text-[14px] text-outline')}<span>${UI.esc(s.term)}</span>
                       </button>`
                     )
                     .join('')}
                 </div>
               </section>`
            : ''
        }

        <section>
          <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold px-1">Topics to explore</h2>
          <div class="mt-space-xs grid grid-cols-2 gap-space-xs sm:grid-cols-3">
            ${topics
              .map(
                (t) => `<button type="button" data-term="${UI.esc(t)}"
                  class="flex items-center gap-space-xs p-space-sm rounded-xl bg-surface-container text-primary hover:bg-surface-container-high transition-colors active:scale-[.98] text-left">
                  ${UI.icon('travel_explore', 'text-[18px] text-secondary shrink-0')}
                  <span class="font-label-lg text-label-lg truncate">${UI.esc(t)}</span>
                </button>`
              )
              .join('')}
          </div>
        </section>

        <section>
          <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold px-1">Frequent words</h2>
          <div class="mt-space-xs flex flex-wrap gap-1.5">
            ${terms
              .map(
                (t) => `<button type="button" data-term="${UI.esc(t)}"
                  class="h-8 px-3 rounded-full bg-surface-container-lowest border border-outline-variant text-primary font-label-md text-label-md hover:bg-surface-container transition-colors">${UI.esc(t)}</button>`
              )
              .join('')}
          </div>
        </section>

        <section class="bg-surface-container-low rounded-xl p-space-md space-y-space-xs">
          <h2 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold">Search by reference</h2>
          <p class="font-body-md text-body-md text-on-surface-variant">Type a reference like <span class="font-label-md text-secondary">2 Nephi 2:15</span> to jump straight to it.</p>
          <button type="button" id="jump-ref" class="inline-flex items-center gap-space-xs bg-secondary-container text-on-secondary-container font-label-lg text-label-lg px-space-md py-2.5 rounded-full shadow-gold active:scale-[.98] transition-transform">
            ${UI.icon('arrow_forward', 'text-[18px]')}Jump to reference
          </button>
        </section>
      </div>`;

    body.querySelectorAll('[data-term]').forEach((btn) =>
      btn.addEventListener('click', () => {
        input.value = btn.dataset.term;
        run();
        input.focus();
      })
    );

    const jump = body.querySelector('#jump-ref');
    if (jump) jump.addEventListener('click', jumpToReference);
  }

  /* ---------------------------------------------------------- reference */

  function jumpToReference() {
    const value = input.value.trim();
    if (!value) {
      UI.toast('Type a reference such as Alma 37:6', { tone: 'bad', icon: 'error' });
      return;
    }
    const resolved = Scripture.resolveReference(value, null);
    if (!resolved || !resolved.chapter) {
      UI.toast('Could not read that reference', { tone: 'bad', icon: 'error' });
      return;
    }
    const ch = Scripture.chapter(resolved.bookSlug, resolved.chapter);
    if (!ch) {
      UI.toast(`${value} is not a chapter in the Book of Mormon`, { tone: 'bad', icon: 'error' });
      return;
    }
    Store.addSearch(value);
    ctx.navigate('#/read/' + resolved.bookSlug + '/' + resolved.chapter + '/' + (resolved.verse || 1));
  }

  /* -------------------------------------------------------------- results */

  function renderResults(query) {
    const started = performance.now();
    const result = Scripture.search(query, { bookSlug: bookFilter || null, limit: 100 });
    const elapsed = Math.round(performance.now() - started);
    lastResult = result;

    if (!result.total) {
      body.innerHTML = `
        ${UI.emptyState({
          icon: 'search_off',
          title: 'No verses matched',
          message: 'Try fewer words, or search a topic like “faith” or “resurrection”.',
        })}
        <div class="flex justify-center">
          <button type="button" id="ask-about" class="inline-flex items-center gap-space-xs bg-primary text-on-primary font-label-lg text-label-lg px-space-md py-3 rounded-full active:scale-[.98] transition-transform">
            ${UI.icon('explore', 'text-[18px]')}Ask about “${UI.esc(query)}”
          </button>
        </div>`;
      const ask = body.querySelector('#ask-about');
      if (ask) {
        ask.addEventListener('click', () =>
          ctx.navigate('#/ask?prompt=' + encodeURIComponent('What does the Book of Mormon teach about ' + query + '?'))
        );
      }
      return;
    }

    const bookName = bookFilter ? Scripture.book(bookFilter).title : null;

    body.innerHTML = `
      <div class="flex items-baseline justify-between gap-space-sm px-1">
        <p class="font-label-md text-label-md text-on-surface-variant">
          <span class="text-primary font-semibold">${result.total.toLocaleString()}</span> verse${result.total === 1 ? '' : 's'}
          ${bookName ? 'in ' + UI.esc(bookName) : ''}
          ${result.total > result.results.length ? ' · showing first ' + result.results.length : ''}
        </p>
        <span class="font-marginalia text-marginalia text-outline">${elapsed}ms</span>
      </div>

      <ul class="space-y-space-xs pt-space-xs">
        ${result.results
          .map(
            (row) => `<li>
              <a href="#/read/${row.verse.bookSlug}/${row.verse.chapter}/${row.verse.verse}"
                 class="block p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors active:scale-[.99]">
                <span class="font-label-md text-label-md text-secondary font-semibold">${UI.esc(row.verse.reference)}</span>
                <p class="font-scripture-mobile text-on-surface mt-1 leading-[1.7]">${UI.highlightTerms(
                  Scripture.snippet(row.verse.text, result.terms, result.phrases, 90),
                  result.terms.concat(result.phrases)
                )}</p>
                <span class="font-marginalia text-marginalia text-on-surface-variant mt-1.5 inline-flex items-center gap-1">
                  ${UI.icon('arrow_forward', 'text-[13px]')}Open in reader
                </span>
              </a>
            </li>`
          )
          .join('')}
      </ul>`;

    if (result.total > result.results.length) {
      const more = document.createElement('p');
      more.className = 'font-marginalia text-marginalia text-on-surface-variant text-center pt-space-md';
      more.textContent = 'Narrow the search or filter by book to see the rest.';
      body.appendChild(more);
    }
  }

  /* ------------------------------------------------------------------ run */

  function run() {
    const query = input.value.trim();
    clearBtn.classList.toggle('hidden', !query);
    ctx.setQuery({ q: query }, true);

    if (!query) {
      renderSuggestions();
      return;
    }
    Store.addSearch(query);
    renderResults(query);
  }

  const debouncedRun = UI.debounce(run, 180);

  input.addEventListener('input', debouncedRun);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const value = input.value.trim();

    // a bare reference jumps straight to the reader instead of listing one hit
    if (value && /\d/.test(value)) {
      const resolved = Scripture.resolveReference(value, null);
      if (resolved && resolved.chapter && !/\s/.test(value.replace(/\s+\d+[:.]\d+$/, ''))) {
        jumpToReference();
        return;
      }
    }
    run();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    input.focus();
    run();
  });

  filterSelect.addEventListener('change', () => {
    bookFilter = filterSelect.value;
    ctx.setQuery({ book: bookFilter }, true);
    if (input.value.trim()) run();
  });

  ctx.root.querySelector('#search-ref').addEventListener('click', jumpToReference);
  ctx.root.querySelector('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run();
  });

  if (initial) run();
  else renderSuggestions();
};