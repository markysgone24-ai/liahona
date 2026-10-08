/* ==========================================================================
   Liahona — persisted state
   Everything lives in localStorage under the "liahona." prefix. A single
   private API keeps the whole app off direct storage calls.
   ========================================================================== */
window.Store = (function () {
  'use strict';

  const PREFIX = 'liahona.';
  const KEYS = {
    settings: 'settings',
    progress: 'progress',
    streak: 'streak',
    bookmarks: 'bookmarks',
    highlights: 'highlights',
    notes: 'notes',
    history: 'history',
    searches: 'searches',
    sessions: 'sessions',
  };

  const DEFAULT_SETTINGS = {
    theme: 'parchment',
    density: 'regular',        // compact | regular | comfortable
    typeface: 'serif',         // serif | sans
    wpm: 200,
    listenRate: 1,             // playback speed for the listen player
    showNotes: true,
    autoMarkStreak: true,
    showVerseNumbers: true,
    dailyGoalMinutes: 20,
    avatar: 'nephi',
    profileName: 'Study Companion',
    ai: {
      // On by default: the free anonymous LLM7 cloud model (no key, no
      // sign-in). If it is unreachable or rate-limited, Ask falls back to
      // the bundled local model or the app's own offline engine.
      enabled: true,
      sdk: '',
      endpoint: 'https://api.llm7.io/v1/chat/completions',
      model: 'DeepSeek-V4-Flash-0731',
      apiKey: '',
    },
  };

  const DEFAULT_PROGRESS = {
    book: '1-ne',
    chapter: 1,
    verse: 1,
    lastReadAt: 0,
    chaptersRead: [],   // "bookSlug/chapter" strings
    sessions: 0,
    msRead: 0,
  };

  const DEFAULT_STREAK = {
    current: 0,
    longest: 0,
    days: [],            // ISO YYYY-MM-DD, ascending
    msByDay: {},         // ISO date -> milliseconds read
  };

  /* ------------------------------------------------------------ low level */

  function readKey(name, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + name);
      if (!raw) return clone(fallback);
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : clone(fallback);
    } catch (_) {
      return clone(fallback);
    }
  }

  function writeKey(name, value) {
    try {
      localStorage.setItem(PREFIX + name, JSON.stringify(value));
      return true;
    } catch (err) {
      // Quota exceeded, or storage blocked (private mode / file:// in some browsers)
      if (window.UI) UI.toast('Could not save — storage is unavailable', { tone: 'bad', icon: 'error' });
      return false;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deepMerge(base, patch) {
    const out = clone(base);
    for (const key of Object.keys(patch || {})) {
      const val = patch[key];
      if (val && typeof val === 'object' && !Array.isArray(val) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
        out[key] = deepMerge(out[key], val);
      } else if (val !== undefined) {
        out[key] = val;
      }
    }
    return out;
  }

  /* --------------------------------------------------------------- state */

  let cache = {
    settings: readKey(KEYS.settings, DEFAULT_SETTINGS),
    progress: readKey(KEYS.progress, DEFAULT_PROGRESS),
    streak: readKey(KEYS.streak, DEFAULT_STREAK),
    bookmarks: readKey(KEYS.bookmarks, []),
    highlights: readKey(KEYS.highlights, {}),
    notes: readKey(KEYS.notes, {}),
    history: readKey(KEYS.history, []),
    searches: readKey(KEYS.searches, []),
    sessions: readKey(KEYS.sessions, []),
  };

  cache.settings = deepMerge(DEFAULT_SETTINGS, cache.settings);
  cache.progress = deepMerge(DEFAULT_PROGRESS, cache.progress);
  cache.streak = deepMerge(DEFAULT_STREAK, cache.streak);

  const listeners = [];

  function emit(change) {
    listeners.forEach((fn) => {
      try {
        fn(change);
      } catch (err) {
        console.error('[store] listener failed', err);
      }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function persist(name, change) {
    writeKey(name, cache[name]);
    emit({ key: name, value: cache[name], change });
  }

  /* ------------------------------------------------------------ settings */

  function settings() {
    return cache.settings;
  }

  function setSettings(patch) {
    cache.settings = deepMerge(cache.settings, patch || {});
    persist(KEYS.settings, 'settings');
    return cache.settings;
  }

  function applyTheme() {
    const root = document.documentElement;
    root.setAttribute('data-theme', cache.settings.theme);
    root.setAttribute('data-density', cache.settings.density);
    root.setAttribute('data-typeface', cache.settings.typeface);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors = { parchment: '#fdf9f1', sepia: '#f4ecd8', night: '#0e1724' };
      meta.setAttribute('content', colors[cache.settings.theme] || '#fdf9f1');
    }
  }

  /* ------------------------------------------------------------ progress */

  function progress() {
    return cache.progress;
  }

  function chapterKey(bookSlug, chapter) {
    return bookSlug + '/' + chapter;
  }

  /**
   * Records a reading position. Marks the chapter as read the first time the
   * reader lands on it, so the progress bar means something real.
   */
  function setProgress(position, opts) {
    const options = opts || {};
    const p = cache.progress;
    const prevChapter = chapterKey(p.book, p.chapter);
    p.book = position.book;
    p.chapter = position.chapter;
    p.verse = position.verse || 1;
    p.lastReadAt = Date.now();

    const nextChapter = chapterKey(p.book, p.chapter);
    const isNewChapter = !p.chaptersRead.includes(nextChapter);
    if (isNewChapter) {
      p.chaptersRead.push(nextChapter);
      if (options.advance) p.sessions = (p.sessions || 0) + 1;
    }
    if (prevChapter !== nextChapter && options.advance) p.sessions = p.sessions || 0;

    persist(KEYS.progress, isNewChapter ? 'chapter-complete' : 'position');
    if (isNewChapter && cache.settings.autoMarkStreak) markStudied(options.msRead || 0);
    return { isNewChapter };
  }

  /** Adds elapsed reading time without moving the position. */
  function addReadingTime(ms) {
    if (!ms || ms < 1000) return;
    const p = cache.progress;
    p.msRead = (p.msRead || 0) + ms;
    const today = UI.isoDate();
    const s = cache.streak;
    s.msByDay[today] = (s.msByDay[today] || 0) + ms;
    persist(KEYS.progress, 'time');
    persist(KEYS.streak, 'time');
  }

  function hasReadChapter(bookSlug, chapter) {
    return cache.progress.chaptersRead.indexOf(chapterKey(bookSlug, chapter)) !== -1;
  }

  function bookProgress(bookSlug, totalChapters) {
    const prefix = bookSlug + '/';
    const count = cache.progress.chaptersRead.filter((k) => k.indexOf(prefix) === 0).length;
    return {
      read: count,
      total: totalChapters || 0,
      ratio: totalChapters ? Math.min(1, count / totalChapters) : 0,
    };
  }

  /* -------------------------------------------------------------- streak */

  function streak() {
    return cache.streak;
  }

  /** Recomputes current/longest streak from the stored day list. */
  function recomputeStreak() {
    const s = cache.streak;
    const days = Array.from(new Set(s.days)).sort();
    s.days = days;

    let longest = 0;
    let run = 0;
    let prev = null;
    for (const day of days) {
      if (!prev) {
        run = 1;
      } else {
        const diff = Math.round((new Date(day + 'T00:00:00') - new Date(prev + 'T00:00:00')) / 86400000);
        run = diff === 1 ? run + 1 : 1;
      }
      if (run > longest) longest = run;
      prev = day;
    }
    s.longest = longest;

    // current = consecutive days ending today or yesterday
    const today = UI.isoDate();
    const yesterday = UI.isoDate(new Date(Date.now() - 86400000));
    const last = days[days.length - 1];
    if (!last) {
      s.current = 0;
    } else if (last === today || last === yesterday) {
      let count = 0;
      let cursor = last === today ? today : yesterday;
      while (days.indexOf(cursor) !== -1) {
        count++;
        cursor = UI.isoDate(new Date(new Date(cursor + 'T00:00:00').getTime() - 86400000));
      }
      s.current = count;
    } else {
      s.current = 0;
    }
    return s;
  }

  /** Marks today as studied. Safe to call repeatedly. */
  function markStudied(ms) {
    const today = UI.isoDate();
    const s = cache.streak;
    if (s.days.indexOf(today) === -1) {
      s.days.push(today);
      recomputeStreak();
      persist(KEYS.streak, 'studied');
      return true;
    }
    if (ms) {
      s.msByDay[today] = (s.msByDay[today] || 0) + ms;
      persist(KEYS.streak, 'time');
    }
    return false;
  }

  /** Marks today by hand (e.g. from the streak card). */
  function markToday() {
    const fresh = markStudied(0);
    recomputeStreak();
    persist(KEYS.streak, 'studied');
    return fresh;
  }

  function todayMs() {
    return cache.streak.msByDay[UI.isoDate()] || 0;
  }

  function dailyAverageMs(limit) {
    const days = cache.streak.days.slice(-(limit || 7));
    if (!days.length) return 0;
    const sum = days.reduce((n, d) => n + (cache.streak.msByDay[d] || 0), 0);
    return sum / days.length;
  }

  function last14() {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const iso = UI.isoDate(d);
      out.push({ iso, date: d, done: cache.streak.days.indexOf(iso) !== -1, ms: cache.streak.msByDay[iso] || 0 });
    }
    return out;
  }

  /** Last 7 days, oldest first — for the home sparkline. */
  function weekActivity() {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const iso = UI.isoDate(d);
      out.push({ iso, date: d, done: cache.streak.days.indexOf(iso) !== -1, ms: cache.streak.msByDay[iso] || 0 });
    }
    return out;
  }

  /* ----------------------------------------------------------- bookmarks */

  function bookmarks() {
    return cache.bookmarks;
  }

  /** Normalises legacy string entries and current { key, at } records alike. */
  function bookmarkKey(entry) {
    return entry && typeof entry === 'object' ? entry.key : entry;
  }

  function isBookmarked(key) {
    return cache.bookmarks.some((b) => bookmarkKey(b) === key);
  }

  function toggleBookmark(key) {
    const i = cache.bookmarks.findIndex((b) => bookmarkKey(b) === key);
    if (i === -1) cache.bookmarks.unshift({ key, at: Date.now() });
    else cache.bookmarks.splice(i, 1);
    persist(KEYS.bookmarks, 'bookmarks');
    return isBookmarked(key);
  }

  /* ----------------------------------------------------------- highlights */

  function highlights() {
    return cache.highlights;
  }

  function highlightFor(key) {
    return cache.highlights[key] || null;
  }

  function setHighlight(key, color) {
    if (color) cache.highlights[key] = { color, at: Date.now() };
    else delete cache.highlights[key];
    persist(KEYS.highlights, 'highlights');
  }

  function cycleHighlight(key, colors) {
    const list = colors || ['gold', 'green', 'blue', 'rose'];
    const current = cache.highlights[key] ? cache.highlights[key].color : null;
    const i = list.indexOf(current);
    const next = i === -1 ? list[0] : i === list.length - 1 ? null : list[i + 1];
    setHighlight(key, next);
    return next;
  }

  /* --------------------------------------------------------------- notes */

  function notes() {
    return cache.notes;
  }

  /** The note text for a verse, or '' when there is none. */
  function noteFor(key) {
    const entry = cache.notes[key];
    if (!entry) return '';
    return typeof entry === 'object' ? entry.text || '' : String(entry);
  }

  /** The full { text, at } record, for sorting and timestamps. */
  function noteRecord(key) {
    const entry = cache.notes[key];
    if (!entry) return null;
    return typeof entry === 'object' ? entry : { text: String(entry), at: 0 };
  }

  function setNote(key, text) {
    const value = String(text || '').trim();
    if (value) cache.notes[key] = { text: value, at: Date.now() };
    else delete cache.notes[key];
    persist(KEYS.notes, 'notes');
  }

  /* ------------------------------------------------------------- history */

  function history() {
    return cache.history;
  }

  function addHistory(entry) {
    cache.history.unshift(Object.assign({ id: 'h' + Date.now() + Math.random().toString(36).slice(2, 7), at: Date.now() }, entry));
    cache.history = cache.history.slice(0, 60);
    persist(KEYS.history, 'history');
    return cache.history[0];
  }

  function removeHistory(id) {
    cache.history = cache.history.filter((h) => h.id !== id);
    persist(KEYS.history, 'history');
  }

  function toggleHelpful(id) {
    const entry = cache.history.find((h) => h.id === id);
    if (!entry) return false;
    entry.helpful = !entry.helpful;
    persist(KEYS.history, 'history');
    return entry.helpful;
  }

  function helpfulCount() {
    return cache.history.filter((h) => h.helpful).length;
  }

  function clearHistory() {
    cache.history = [];
    persist(KEYS.history, 'history');
  }

  /* ---------------------------------------------------------- search log */

  /** Accepts both plain strings and { term, at } records. */
  function searchTerm(entry) {
    return entry && typeof entry === 'object' ? entry.term : entry;
  }

  function searches() {
    return cache.searches;
  }

  function addSearch(term) {
    const value = String(term || '').trim();
    if (!value) return;
    const needle = value.toLowerCase();
    cache.searches = cache.searches.filter((s) => String(searchTerm(s)).toLowerCase() !== needle);
    cache.searches.unshift({ term: value, at: Date.now() });
    cache.searches = cache.searches.slice(0, 12);
    persist(KEYS.searches, 'searches');
  }

  function clearSearches() {
    cache.searches = [];
    persist(KEYS.searches, 'searches');
  }

  /* ------------------------------------------------------- import/export */

  function exportAll() {
    return {
      app: 'liahona',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: cache.settings,
      progress: cache.progress,
      streak: cache.streak,
      bookmarks: cache.bookmarks,
      highlights: cache.highlights,
      notes: cache.notes,
      history: cache.history,
      searches: cache.searches,
    };
  }

  function importAll(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Not a valid Liahona backup file.');
    if (payload.app !== 'liahona') throw new Error('This file is not a Liahona backup.');
    if (payload.settings) cache.settings = deepMerge(DEFAULT_SETTINGS, payload.settings);
    if (payload.progress) cache.progress = deepMerge(DEFAULT_PROGRESS, payload.progress);
    if (payload.streak) cache.streak = deepMerge(DEFAULT_STREAK, payload.streak);
    if (Array.isArray(payload.bookmarks)) cache.bookmarks = payload.bookmarks;
    if (payload.highlights) cache.highlights = payload.highlights;
    if (payload.notes) cache.notes = payload.notes;
    if (Array.isArray(payload.history)) cache.history = payload.history;
    if (Array.isArray(payload.searches)) cache.searches = payload.searches;
    Object.keys(KEYS).forEach(persist);
    recomputeStreak();
    applyTheme();
    emit({ key: '*', value: null, change: 'import' });
  }

  function clearAll() {
    cache = {
      settings: clone(DEFAULT_SETTINGS),
      progress: clone(DEFAULT_PROGRESS),
      streak: clone(DEFAULT_STREAK),
      bookmarks: [],
      highlights: {},
      notes: {},
      history: [],
      searches: [],
      sessions: [],
    };
    Object.keys(KEYS).forEach((name) => writeKey(name, cache[name]));
    applyTheme();
    emit({ key: '*', value: null, change: 'reset' });
  }

  /* ----------------------------------------------------------- seeding */

  /**
   * Fills the dashboard with plausible history so the UI can be reviewed
   * before real reading data exists. Never called automatically.
   */
  function seedSampleData() {
    const s = cache.streak;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    s.days = [];
    s.msByDay = {};
    for (let i = 13; i >= 0; i--) {
      const iso = UI.isoDate(new Date(today.getTime() - i * 86400000));
      s.days.push(iso);
      s.msByDay[iso] = (11 + ((i * 7) % 12)) * 60000;
    }
    recomputeStreak();

    const p = cache.progress;
    p.book = '1-ne';
    p.chapter = 3;
    p.verse = 7;
    p.lastReadAt = Date.now() - 2 * 3600000;
    p.sessions = 21;
    p.msRead = 21 * 18 * 60000;
    p.chaptersRead = [];
    const prefix = ['1-ne/1', '1-ne/2', '1-ne/3'];
    p.chaptersRead = prefix;

    cache.bookmarks = [
      { key: '1-ne/3/7', at: Date.now() - 86400000 },
      { key: '2-ne/2/15', at: Date.now() - 3 * 86400000 },
      { key: 'alma/37/6', at: Date.now() - 5 * 86400000 },
    ];
    cache.highlights = {
      '2-ne/2/15': { color: 'gold', at: Date.now() - 3 * 86400000 },
      'moroni/10/4': { color: 'green', at: Date.now() - 6 * 86400000 },
    };
    cache.notes = {
      '2-ne/2/15': 'The fall of Adam made the plan of salvation necessary — grace restores what was lost.',
    };
    cache.history = [
      {
        id: 'h-sample1',
        at: Date.now() - 20 * 3600000,
        question: 'Why did Nephi return to Jerusalem for the brass plates?',
        answer:
          'The brass plates held Lehi’s genealogy, the five books of Moses, the prophets down to Jeremiah, and the commandments. Without them Lehi knew his posterity would dwindle and perish in unbelief.',
        source: 'local',
        verseKey: '1-ne/3/3',
        anchor: '1 Nephi 3:3',
      },
    ];

    Object.keys(KEYS).forEach((name) => writeKey(name, cache[name]));
    emit({ key: '*', value: null, change: 'seed' });
  }

  return {
    // state
    settings, setSettings, applyTheme,
    progress, setProgress, addReadingTime, hasReadChapter, bookProgress, chapterKey,
    streak, markStudied, markToday, recomputeStreak, todayMs, dailyAverageMs, last14, weekActivity,
    bookmarks, isBookmarked, toggleBookmark,
    highlights, highlightFor, setHighlight, cycleHighlight,
    notes, noteFor, noteRecord, setNote,
    history, addHistory, removeHistory, clearHistory, toggleHelpful, helpfulCount,
    searches, addSearch, clearSearches,
    exportAll, importAll, clearAll, seedSampleData,
    subscribe, DEFAULTS: { settings: DEFAULT_SETTINGS, progress: DEFAULT_PROGRESS, streak: DEFAULT_STREAK },
  };
})();