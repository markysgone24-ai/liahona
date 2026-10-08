/* ==========================================================================
   Home — greeting, current study, verse of the day, streak, companion, insights
   ========================================================================== */
window.Views = window.Views || {};

Views.home = function (ctx) {
  const stats = Scripture.stats();
  const progress = Store.progress();
  const settings = Store.settings();
  const streak = Store.recomputeStreak();
  const now = new Date();
  const greeting = UI.greeting(now);
  const profileName = settings.profileName || 'Study Companion';
  const avatar = settings.avatar || 'default';

  const book = Scripture.book(progress.book) || Scripture.listBooks()[0];
  const chapter = Scripture.chapter(progress.book, progress.chapter);
  const bookProg = Store.bookProgress(book.slug, book.chapters.length);
  const savedCount = Store.bookmarks().length + Object.keys(Store.notes()).length + Object.keys(Store.highlights()).length;
  const history = Store.history();
  const votd = Scripture.verseOfTheDay(now);

  /* ------------------------------------------------------- current study */

  let studyCard;
  if (!book || !chapter) {
    studyCard = `<div class="bg-surface-container-low rounded-xl p-space-lg text-center">
      <p class="font-body-md text-on-surface-variant">No scripture data loaded.</p>
    </div>`;
  } else {
    const currentVerse = Scripture.verse(progress.book, progress.chapter, progress.verse);
    const readLabel = progress.lastReadAt
      ? 'Last read ' + UI.relativeTime(progress.lastReadAt)
      : 'Not started yet';
    const next = Scripture.neighbours(progress.book, progress.chapter);
    const pct = Math.round(bookProg.ratio * 100);

    studyCard = `
      <section class="bg-surface-container-low rounded-xl shadow-level1 overflow-hidden transition-all duration-300 active:scale-[.99] relative">
        <div class="h-1.5 w-full bg-secondary-container" style="width:${pct}%"></div>
        <div class="p-space-lg space-y-space-md">
          <div class="flex items-start justify-between gap-space-sm">
            <div class="space-y-1 min-w-0">
              <div class="inline-flex items-center gap-space-2xs px-2.5 py-0.5 rounded-full bg-surface-container text-secondary font-label-md text-label-md">
                ${UI.icon('auto_stories', 'text-[14px]')}
                <span>Current Study</span>
              </div>
              <h2 class="font-headline-sm text-headline-sm text-primary pt-0.5 truncate">
                <a href="#/read/${book.slug}/${chapter.number}" class="hover:underline">${UI.esc(book.title)} ${chapter.number}${currentVerse ? ':' + currentVerse.verse : ''}</a>
              </h2>
              ${chapter.subtitle ? `<p class="font-marginalia text-marginalia text-on-surface-variant italic truncate">${UI.esc(chapter.subtitle)}</p>` : ''}
              <p class="font-label-md text-label-md text-on-surface-variant flex items-center gap-1">
                ${UI.icon('schedule', 'text-[15px] text-outline')}
                <span>${UI.esc(readLabel)}</span>
              </p>
            </div>
            <div class="text-right flex flex-col items-end shrink-0">
              <span class="font-headline-sm text-headline-sm text-secondary">${pct}%</span>
              <span class="font-marginalia text-marginalia text-on-surface-variant">Ch ${chapter.number} of ${book.chapters.length}</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
              <div class="bg-secondary-container h-full rounded-full transition-all duration-500" style="width:${pct}%"></div>
            </div>
            <p class="font-marginalia text-marginalia text-on-surface-variant">
              ${bookProg.read} of ${bookProg.total} chapters read in ${UI.esc(book.title)}
            </p>
          </div>

          <div class="pt-space-2xs flex items-center gap-space-sm">
            <a href="#/read/${book.slug}/${chapter.number}" class="flex-1 flex items-center justify-center gap-space-xs bg-secondary-container text-on-secondary-container font-label-lg text-label-lg py-3 px-space-md rounded-lg shadow-gold active:opacity-90 active:scale-[.98] transition-all">
              ${UI.icon('play_arrow', 'text-[20px]', true)}
              <span>${progress.lastReadAt ? 'Resume Reading' : 'Start Reading'}</span>
            </a>
            <button type="button" data-act="listen-chapter" aria-label="Listen to this chapter"
              class="flex items-center justify-center w-12 h-12 rounded-lg bg-surface-container text-primary hover:bg-surface-container-high transition-colors">
              ${UI.icon('headphones', 'text-[22px]')}
            </button>
            ${next.next ? `<a href="#/read/${next.next.bookSlug}/${next.next.chapter}" aria-label="Next chapter"
              class="flex items-center justify-center w-12 h-12 rounded-lg bg-surface-container text-primary hover:bg-surface-container-high transition-colors">
              ${UI.icon('arrow_forward', 'text-[22px]')}
            </a>` : ''}
          </div>
        </div>
      </section>`;
  }

  /* ------------------------------------------------------ verse of the day */

  const votdSaved = Store.isBookmarked(votd.key);
  const votdHighlight = Store.highlightFor(votd.key);
  const votdNotes = Scripture.footnotesFor(votd.bookSlug, votd.chapter, votd.verse).slice(0, 2);

  const votdCard = `
    <section class="bg-primary-container text-on-primary rounded-xl shadow-level2 p-space-lg space-y-space-md relative overflow-hidden">
      <div class="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-secondary-container/10 blur-2xl pointer-events-none"></div>
      <div class="flex items-center justify-between text-on-primary-container relative">
        <div class="flex items-center gap-space-2xs">
          ${UI.icon('format_quote', 'text-[18px] text-secondary-container')}
          <span class="font-label-md text-label-md uppercase tracking-wider text-secondary-container font-semibold">Verse of the Day</span>
        </div>
        <div class="flex items-center gap-space-xs">
          <button type="button" data-act="votd-share" aria-label="Share verse"
            class="w-8 h-8 rounded-full flex items-center justify-center text-on-primary-container hover:text-secondary-container transition-colors">
            ${UI.icon('share', 'text-[18px]')}
          </button>
          <button type="button" data-act="votd-bookmark" aria-pressed="${votdSaved}" aria-label="Bookmark verse"
            class="w-8 h-8 rounded-full flex items-center justify-center text-on-primary-container hover:text-secondary-container transition-colors">
            ${UI.icon(votdSaved ? 'bookmark' : 'bookmark_border', 'text-[18px]', votdSaved)}
          </button>
        </div>
      </div>

      <a href="#/read/${votd.bookSlug}/${votd.chapter}/${votd.verse}" class="block space-y-space-sm group">
<p class="font-scripture-mobile text-on-primary leading-relaxed italic ${votdHighlight ? 'hl-' + votdHighlight.color : ''}">
          &#8220;${UI.esc(votd.text)}&#8221;
        </p>
        <footer class="font-headline-sm text-headline-sm text-surface-container-lowest/90 font-normal group-hover:underline">
          ${UI.esc(votd.reference)}
        </footer>
      </a>

      <div class="pt-space-2xs flex flex-wrap items-center gap-space-xs relative">
        <button type="button" data-act="votd-ask" class="inline-flex items-center gap-space-xs bg-surface-container-lowest/10 hover:bg-surface-container-lowest/20 text-on-primary px-3.5 py-2 rounded-full font-label-md text-label-md backdrop-blur-md transition-all">
          ${UI.icon('arrow_back_ios_new', 'text-[16px] text-secondary-container')}
          <span>Reflect with AI</span>
        </button>
        <button type="button" data-act="votd-context" class="inline-flex items-center gap-space-2xs bg-transparent hover:bg-surface-container-lowest/10 text-on-primary-container px-3 py-2 rounded-full font-label-md text-label-md transition-all">
          ${UI.icon('menu_book', 'text-[16px]')}
          <span>Context</span>
        </button>
        ${votdNotes.length ? `<button type="button" data-act="votd-notes" class="inline-flex items-center gap-space-2xs bg-transparent hover:bg-surface-container-lowest/10 text-on-primary-container px-3 py-2 rounded-full font-label-md text-label-md transition-all">
          ${UI.icon('sticky_note_2', 'text-[16px]')}
          <span>Notes (${votdNotes.length})</span>
        </button>` : ''}
      </div>
    </section>`;

  /* ---------------------------------------------------------- streak card */

  const days = Store.last14();
  const avgMs = Store.dailyAverageMs(7);
  const todayMs = Store.todayMs();
  const goalMs = (settings.dailyGoalMinutes || 20) * 60000;
  const goalPct = Math.min(100, Math.round((todayMs / goalMs) * 100));
  const todayDone = days[13].done;

  const week = Store.weekActivity();
  const weekTotal = week.reduce((n, d) => n + d.ms, 0);
  const maxWeekMs = Math.max(goalMs, ...week.map((d) => d.ms));

  const streakCard = `
    <section class="bg-surface-container-low rounded-xl p-space-md shadow-level1 space-y-space-sm">
      <div class="flex items-center justify-between gap-space-sm">
        <div class="flex items-center gap-space-xs">
          <div class="w-8 h-8 rounded-full bg-secondary-container/40 text-secondary flex items-center justify-center">
            ${UI.icon('local_fire_department', 'text-[20px]', true)}
          </div>
          <div>
            <span class="font-headline-sm text-headline-sm text-primary">${streak.current}-Day Streak</span>
            <span class="font-marginalia text-marginalia text-on-surface-variant block">
              ${avgMs ? UI.formatDuration(avgMs) + ' daily average' : 'No reading logged yet'}
            </span>
          </div>
        </div>
        <span class="font-label-md text-label-md text-secondary font-semibold shrink-0">Goal: ${settings.dailyGoalMinutes || 20} min</span>
      </div>

      <div class="flex items-center gap-2">
        <div class="flex-1 bg-surface-container-highest h-2 rounded-full overflow-hidden">
          <div class="bg-secondary-container h-full rounded-full transition-all duration-500" style="width:${goalPct}%"></div>
        </div>
        <span class="font-marginalia text-marginalia text-on-surface-variant tabular-nums">${goalPct}%</span>
      </div>

      <div class="grid grid-cols-7 gap-1.5 pt-space-xs" role="list" aria-label="Last 14 days">
        ${days
          .map((day, i) => {
            const isToday = i === days.length - 1;
            const label = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day.date.getDay()];
            const inner = day.done
              ? UI.icon('check', 'text-[15px]')
              : isToday
              ? UI.icon('edit', 'text-[15px]')
              : '<span class="w-1 h-1 rounded-full bg-outline-variant"></span>';
            const cls = day.done
              ? 'bg-secondary-container text-on-secondary-container shadow-xs'
              : isToday
              ? 'bg-primary-container text-secondary-container ring-2 ring-secondary-container'
              : 'bg-surface-container text-outline';
            return `<div class="flex flex-col items-center gap-1" role="listitem">
              <span class="font-marginalia text-marginalia ${isToday ? 'text-secondary font-bold' : 'text-on-surface-variant'}">${isToday ? 'Today' : label}</span>
              <div class="w-8 h-8 rounded-full ${cls} flex items-center justify-center" title="${day.iso}${day.ms ? ' · ' + UI.formatDuration(day.ms) : ''}">${inner}</div>
            </div>`;
          })
          .join('')}
      </div>

      <div class="pt-space-xs flex items-center justify-between gap-space-sm border-t border-outline-variant">
        <div class="flex items-center gap-1.5" role="img" aria-label="Minutes read over the last 7 days">
          ${week
            .map(
              (d) =>
                `<div class="w-4 rounded-full bg-surface-container-highest relative overflow-hidden" style="height:28px" title="${d.iso}: ${UI.formatDuration(d.ms)}">
                   <div class="absolute bottom-0 inset-x-0 bg-secondary-container/70 rounded-full" style="height:${Math.round((d.ms / maxWeekMs) * 100)}%"></div>
                 </div>`
            )
            .join('')}
        </div>
        <button type="button" data-act="log-today"
          class="font-label-md text-label-md ${todayDone ? 'text-on-surface-variant' : 'text-secondary font-semibold hover:underline'} shrink-0">
          ${todayDone ? 'Logged today' : 'Mark today read'}
        </button>
      </div>
      <p class="font-marginalia text-marginalia text-on-surface-variant">
        This week: ${UI.formatDuration(weekTotal)} · Longest streak ${streak.longest} day${streak.longest === 1 ? '' : 's'}
      </p>
    </section>`;

  /* ------------------------------------------------------- study companion */

  const companion = [
    { href: '#/library', icon: 'auto_stories', title: 'Books', sub: `${stats.books} volumes · ${stats.chapters} chapters`, accent: false },
    { href: '#/search', icon: 'search', title: 'Search', sub: `${stats.verses.toLocaleString()} verses`, accent: false },
    { href: '#/ask', icon: 'explore', title: 'Ask AI', sub: AI.isApiEnabled() ? 'Model connected' : 'Offline reflection', accent: true },
    { href: '#/saved', icon: 'bookmark', title: 'Saved', sub: `${savedCount} note${savedCount === 1 ? '' : 's'} & tag${savedCount === 1 ? '' : 's'}`, accent: false },
  ];

  const companionSection = `
    <section class="space-y-space-xs">
      <h3 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold px-1">Study Companion</h3>
      <div class="grid grid-cols-2 gap-space-sm">
        ${companion
          .map(
            (c) => `<a href="${c.href}" class="flex flex-col items-start p-space-md bg-surface-container rounded-xl text-left hover:bg-surface-container-high transition-all active:scale-[.98] shadow-sm group">
              <div class="w-10 h-10 rounded-lg bg-surface-container-lowest ${c.accent ? 'text-secondary' : 'text-primary'} flex items-center justify-center mb-space-sm shadow-xs ${
              c.accent ? 'group-hover:bg-primary-container group-hover:text-secondary-container' : 'group-hover:bg-secondary-container group-hover:text-on-secondary-container'
            } transition-colors">
                ${UI.icon(c.icon, 'text-[22px]')}
              </div>
              <span class="font-headline-sm text-headline-sm text-primary">${UI.esc(c.title)}</span>
              <span class="font-marginalia text-marginalia text-on-surface-variant mt-0.5">${UI.esc(c.sub)}</span>
            </a>`
          )
          .join('')}
      </div>
    </section>`;

  /* ------------------------------------------------------- recent insights */

  let insightsSection;
  if (!history.length) {
    insightsSection = `
      <section class="space-y-space-xs">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-space-2xs">
            ${UI.icon('psychology', 'text-[18px] text-secondary')}
            <h3 class="font-headline-sm text-headline-sm text-primary">Recent AI Insights</h3>
          </div>
        </div>
        ${UI.emptyState({
          icon: 'lightbulb',
          title: 'No reflections yet',
          message: 'Ask a question about a verse and your reflections will collect here.',
          action: { href: '#/ask', label: 'Ask a question', icon: 'explore' },
        })}
      </section>`;
  } else {
    const latest = history.slice(0, 3);
    insightsSection = `
      <section class="space-y-space-xs">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-space-2xs">
            ${UI.icon('psychology', 'text-[18px] text-secondary')}
            <h3 class="font-headline-sm text-headline-sm text-primary">Recent AI Insights</h3>
          </div>
          <a href="#/saved?tab=history" class="font-label-md text-label-md text-secondary font-semibold hover:underline">View History</a>
        </div>
        <div class="space-y-space-sm">
          ${latest
            .map(
              (entry) => `
            <div class="bg-surface-container-low rounded-xl p-space-md shadow-level1 space-y-space-sm">
              <div class="flex items-start gap-space-sm">
                <div class="w-8 h-8 rounded-full bg-secondary-container/30 text-secondary flex items-center justify-center shrink-0 mt-0.5">
                  ${UI.icon('lightbulb', 'text-[18px]')}
                </div>
                <div class="space-y-1 min-w-0">
                  <span class="font-marginalia text-marginalia uppercase text-secondary font-bold tracking-wider">
                    ${entry.anchor ? UI.esc(entry.anchor) + ' • ' : ''}${UI.esc(entry.mode === 'api' ? 'AI response' : 'Reflection')}
                  </span>
                  <p class="font-body-lg text-body-lg text-primary font-medium">${UI.esc(entry.question)}</p>
                </div>
              </div>
              <div class="bg-surface-container p-space-sm rounded-lg space-y-2">
                <p class="font-body-md text-body-md text-on-surface-variant line-clamp-3">${UI.esc(entry.answer)}</p>
                <button type="button" data-act="expand-answer" data-id="${entry.id}"
                  class="font-label-md text-label-md text-secondary font-semibold flex items-center gap-0.5 hover:underline">
                  <span>Read complete response</span>${UI.icon('chevron_right', 'text-[16px]')}
                </button>
              </div>
              <div class="pt-space-2xs flex items-center justify-between text-on-surface-variant font-marginalia text-marginalia">
                <span>${UI.esc(UI.relativeTime(entry.at))}</span>
                <div class="flex items-center gap-space-xs">
                  <button type="button" data-act="helpful" aria-label="Mark helpful" class="hover:text-primary transition-colors flex items-center gap-0.5 ${entry.helpful ? 'text-secondary font-bold' : ''}">
                    ${UI.icon('thumb_up', 'text-[15px]', !!entry.helpful)}<span>${entry.helpful ? 'Helpful' : 'Helpful'}</span>
                  </button>
                  <button type="button" data-act="share-insight" data-id="${entry.id}" aria-label="Share" class="hover:text-primary transition-colors">
                    ${UI.icon('share', 'text-[15px]')}
                  </button>
                  <a href="${entry.verseKey ? '#/read/' + entry.verseKey : '#/ask'}" aria-label="Open source verse" class="hover:text-primary transition-colors">
                    ${UI.icon('arrow_forward', 'text-[15px]')}
                  </a>
                </div>
              </div>
            </div>`
            )
            .join('')}
        </div>
      </section>`;
  }

  /* ------------------------------------------------------------- assemble */

  // use profileName from above; keep fallback if somehow missing
  const profileNameFinal = (profileName || (settings.name || 'Study Companion')).toString().trim();

  ctx.setHeader({
    lead: 'brand',
    trail: [
      `<button type="button" data-act="open-streak" class="flex items-center gap-space-2xs bg-secondary-container/40 text-on-secondary-container px-space-xs py-1 rounded-full shadow-[0_1px_4px_rgb(var(--shadow)/0.08)]">
        ${UI.icon('local_fire_department', 'text-[18px] text-secondary', true)}
        <span class="font-label-md text-label-md font-semibold text-secondary">${streak.current} Day${streak.current === 1 ? '' : 's'}</span>
      </button>`,
      `<button type="button" data-act="open-profile" aria-label="Profile" class="relative flex items-center justify-center p-0.5 rounded-full hover:opacity-90 active:scale-95 transition-transform min-w-[44px] min-h-[44px]">
        <span class="w-8 h-8 rounded-full bg-primary-container text-secondary-container flex items-center justify-center font-headline-sm text-[13px] shadow-[0_2px_6px_rgb(var(--shadow)/0.12)] overflow-hidden">
          <img src="assets/avatars/${UI.esc(avatar)}.svg" alt="" width="32" height="32" class="w-8 h-8 rounded-full">
        </span>
      </button>`,
    ].join(''),
    progress: null,
  });

  ctx.root.innerHTML = `
    <section class="liahona-hero pt-space-2xs pb-space-sm">
      <div class="flex items-center justify-between">
        <div class="space-y-0.5 min-w-0">
          <p class="font-label-md text-label-md uppercase tracking-wider text-secondary">${UI.esc(UI.longDate(now))}</p>
          <h1 class="font-display-lg-mobile text-display-lg-mobile text-primary tracking-tight truncate">${UI.esc(greeting.text)}, ${UI.esc(profileNameFinal)}</h1>
          <p class="font-scripture-mobile italic text-on-surface-variant/90 line-clamp-1">${UI.esc(Scripture.encouragement())}</p>
        </div>
        <div class="relative flex items-center justify-center w-12 h-12 rounded-full bg-secondary-container/30 text-secondary shrink-0">
          ${UI.icon(greeting.icon, 'text-[26px]')}
          <span class="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-secondary"></span>
        </div>
      </div>
    </section>

    <div class="space-y-space-lg pt-space-lg">
      ${studyCard}
      ${votdCard}
      ${streakCard}
      ${companionSection}
      ${insightsSection}
    </div>`;

  /* -------------------------------------------------------------- wiring */

  const bind = () => {
    const root = ctx.root;

    /** Attaches a listener when the control exists; header controls live outside root. */
    const onClick = (selector, handler) => {
      if (ctx.root.querySelector(selector)) {
        ctx.root.querySelector(selector).addEventListener('click', handler);
        return;
      }
      ctx.onHeader(selector, handler);
    };

    onClick('[data-act="votd-bookmark"]', (event) => {
      const now_saved = Store.toggleBookmark(votd.key);
      const btn = event.currentTarget;
      btn.setAttribute('aria-pressed', String(now_saved));
      btn.innerHTML = UI.icon(now_saved ? 'bookmark' : 'bookmark_border', 'text-[18px]', now_saved);
      UI.toast(now_saved ? 'Bookmarked ' + votd.reference : 'Removed bookmark', { tone: 'good', icon: now_saved ? 'bookmark' : 'bookmark_remove' });
    });

    onClick('[data-act="votd-share"]', async () => {
      const text = '\u201C' + votd.text + '\u201D \u2014 ' + votd.reference + '\n\nShared from Liahona';
      const result = await UI.share(text, votd.reference);
      if (result === 'copied') UI.toast('Verse copied to clipboard', { tone: 'good', icon: 'content_copy' });
      else if (result === 'shared') UI.toast('Shared', { tone: 'good' });
      else if (result === 'failed') UI.toast('Could not share this verse', { tone: 'bad', icon: 'error' });
    });

    onClick('[data-act="votd-ask"]', () => {
      location.hash = '#/ask?verse=' + votd.key + '&prompt=' + encodeURIComponent('What is the context of ' + votd.reference + '?');
    });

    onClick('[data-act="votd-context"]', () => {
      Sheets.context(votd, ctx);
    });

    onClick('[data-act="votd-notes"]', () => Sheets.studyNotes(votd, null, ctx));

    onClick('[data-act="log-today"]', () => {
      const fresh = Store.markToday();
      UI.toast(fresh ? 'Logged today\u2019s reading' : 'Today was already logged', { tone: 'good', icon: 'check_circle' });
      ctx.rerender();
    });

    onClick('[data-act="listen-chapter"]', () => {
      location.hash = '#/read/' + progress.book + '/' + progress.chapter + '?autoplay=1';
    });

    onClick('[data-act="open-streak"]', () => openStreakSheet());

    onClick('[data-act="open-profile"]', () => ctx.navigate('#/settings'));

    UI.on(root, 'click', '[data-act="expand-answer"]', (event, btn) => {
      const entry = Store.history().find((h) => h.id === btn.dataset.id);
      if (!entry) return;
      const para = btn.previousElementSibling;
      const collapsed = para.classList.contains('line-clamp-3');
      para.classList.toggle('line-clamp-3', !collapsed);
      btn.innerHTML = collapsed
        ? `<span>Show less</span>${UI.icon('expand_less', 'text-[16px]')}`
        : `<span>Read complete response</span>${UI.icon('chevron_right', 'text-[16px]')}`;
    });

    UI.on(root, 'click', '[data-act="helpful"]', (event, btn) => {
      const card = btn.closest('.bg-surface-container-low');
      const id = card && card.querySelector('[data-id]')?.dataset.id;
      if (!id) return;
      const now = Store.toggleHelpful(id);
      btn.classList.toggle('text-secondary', now);
      btn.classList.toggle('font-bold', now);
      btn.querySelector('span').textContent = now ? 'Helpful' : 'Helpful';
      btn.querySelector('span').className = now ? 'font-semibold' : '';
      UI.toast(now ? 'Thanks for the feedback' : 'Feedback removed', { tone: 'good', icon: 'thumb_up' });
    });

    UI.on(root, 'click', '[data-act="share-insight"]', async (event, btn) => {
      const id = btn.dataset.id;
      const entry = Store.history().find((h) => h.id === id);
      if (!entry) return;
      const result = await UI.share(entry.question + '\n\n' + entry.answer + '\n\n— Liahona');
      if (result === 'copied') UI.toast('Copied to clipboard', { tone: 'good', icon: 'content_copy' });
    });
  };

  /* ------------------------------------------------------------- sheets */

  function openStreakSheet() {
    const s = Store.recomputeStreak();
    const days = Store.last14();
    const month = days.reduce((n, d) => n + d.ms, 0);
    const body = `
      <div class="space-y-space-md">
        <div class="flex items-center justify-center gap-space-sm py-space-sm">
          <div class="text-center">
            <div class="font-display-lg text-display-lg text-secondary leading-none">${s.current}</div>
            <div class="font-label-md text-label-md text-on-surface-variant">current</div>
          </div>
          <div class="w-px h-10 bg-outline-variant"></div>
          <div class="text-center">
            <div class="font-display-lg text-display-lg text-primary leading-none">${s.longest}</div>
            <div class="font-label-md text-label-md text-on-surface-variant">longest</div>
          </div>
          <div class="w-px h-10 bg-outline-variant"></div>
          <div class="text-center">
            <div class="font-display-lg text-display-lg text-primary leading-none">${UI.formatDuration(month)}</div>
            <div class="font-label-md text-label-md text-on-surface-variant">last 14 days</div>
          </div>
        </div>
        <div class="rule-taper"><span class="font-label-md text-label-md uppercase tracking-wider">Last 14 days</span></div>
        <ul class="space-y-1">
          ${days
            .slice()
            .reverse()
            .map(
              (d) => `<li class="flex items-center gap-space-sm p-space-xs rounded-lg ${d.done ? 'bg-surface-container' : ''}">
                <span class="font-label-md text-label-md ${d.done ? 'text-secondary' : 'text-outline'} w-24 shrink-0">${d.iso.slice(5)}</span>
                <span class="flex-1 text-sm ${d.done ? 'text-primary' : 'text-outline'}">${d.done ? 'Read' : 'Not read'}</span>
                <span class="font-marginalia text-marginalia text-on-surface-variant tabular-nums">${d.ms ? UI.formatDuration(d.ms) : '—'}</span>
              </li>`
            )
            .join('')}
        </ul>
      </div>`;
    UI.sheet({
      title: 'Reading streak',
      subtitle: `${s.current} consecutive day${s.current === 1 ? '' : 's'}`,
      body,
      actions: [
        { label: 'Log today', icon: 'check', close: false, onClick: () => { Store.markToday(); ctx.rerender(); UI.closeSheet(); } },
        { label: 'Done', tone: 'primary' },
      ],
    });
  }

  bind();
};
