/* ==========================================================================
   Liahona — scripture access layer
   Wraps data/book-of-mormon.js: flat verse index, inverted search index,
   reference parsing, cross-reference extraction.
   ========================================================================== */
window.Scripture = (function () {
  'use strict';

  const RAW = window.LIAHONA_BOOK_OF_MORMON || null;

  /* ------------------------------------------------------------- indexes */

  let books = [];          // [{ slug, title, chapters:[chapterObj] }]
  let verses = [];         // flat, canonical order
  let byKey = Object.create(null);
  let byBookChapter = Object.create(null);
  let searchText = [];     // lowercased verse text, index-aligned
  let postings = new Map(); // term -> number[]

  const BOOK_ALIASES = {
    'bofm title page': 'bofm-title', 'title page': 'bofm-title',
    '1 nephi': '1-ne', 'first book of nephi': '1-ne',
    '2 nephi': '2-ne', 'second book of nephi': '2-ne',
    'jacob': 'jacob', 'enos': 'enos', 'jarom': 'jarom', 'omni': 'omni',
    'words of mormon': 'w-of-m', 'w of m': 'w-of-m',
    'mosiah': 'mosiah', 'alma': 'alma', 'helaman': 'hel', 'hela': 'hel',
    '3 nephi': '3-ne', 'third book of nephi': '3-ne',
    '4 nephi': '4-ne', 'fourth book of nephi': '4-ne',
    'mormon': 'morm', 'ether': 'ether', 'moroni': 'moro',
  };

  function ready() {
    return !!RAW && !!RAW.books && RAW.books.length > 0;
  }

  /* Tokenizer that keeps the light punctuation that actually appears. */
  const TOKEN_RE = /[a-z0-9’']+/g;

  function tokenize(text) {
    return String(text || '').toLowerCase().match(TOKEN_RE) || [];
  }

  function build() {
    if (!ready() || verses.length) return;

    books = RAW.books;
    books.forEach((book) => {
      byBookChapter[book.slug] = book.chapters;
      book.chapters.forEach((chapter) => {
        byBookChapter[book.slug + '/' + chapter.number] = chapter;
        chapter.verses.forEach((verse) => {
          const ref = book.title + ' ' + chapter.number + ':' + verse.number;
          const key = book.slug + '/' + chapter.number + '/' + verse.number;
          const record = {
            key,
            bookSlug: book.slug,
            bookTitle: book.title,
            chapter: chapter.number,
            verse: verse.number,
            reference: ref,
            text: verse.text,
            aid: verse.aid || '',
          };
          verses.push(record);
          byKey[key] = record;
        });
      });
    });

    searchText = verses.map((v) => v.text.toLowerCase());
    postings = new Map();
    searchText.forEach((text, i) => {
      const seen = new Set();
      for (const term of tokenize(text)) {
        if (seen.has(term)) continue;
        seen.add(term);
        const list = postings.get(term);
        if (list) list.push(i);
        else postings.set(term, [i]);
      }
    });
  }

  /* ---------------------------------------------------------------- reads */

  function listBooks() {
    build();
    return books;
  }

  function book(slug) {
    build();
    return books.find((b) => b.slug === slug) || null;
  }

  function bookByTitle(title) {
    build();
    const key = String(title || '').trim().toLowerCase();
    return books.find((b) => b.title.toLowerCase() === key) || null;
  }

  function chapter(bookSlug, number) {
    build();
    return byBookChapter[bookSlug + '/' + number] || null;
  }

  function verse(bookSlug, chapterNumber, verseNumber) {
    build();
    return byKey[bookSlug + '/' + chapterNumber + '/' + verseNumber] || null;
  }

  function verseByKey(key) {
    build();
    return byKey[key] || null;
  }

  function allVerses() {
    build();
    return verses;
  }

  function stats() {
    build();
    const words = searchText.reduce((n, t) => n + t.split(/\s+/).length, 0);
    return {
      books: books.length,
      chapters: books.reduce((n, b) => n + b.chapters.length, 0),
      verses: verses.length,
      footnotes: books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.footnotes.length, 0), 0),
      words,
      fetchedAt: RAW.fetchedAt,
      source: RAW.source,
      copyright: RAW.copyright,
    };
  }

  /** Flat ordered list of every chapter, for prev/next navigation. */
  function chapterSequence() {
    build();
    const out = [];
    books.forEach((book) => {
      book.chapters.forEach((chapter) => out.push({ bookSlug: book.slug, bookTitle: book.title, chapter: chapter.number }));
    });
    return out;
  }

  function neighbours(bookSlug, chapterNumber) {
    const seq = chapterSequence();
    const i = seq.findIndex((c) => c.bookSlug === bookSlug && c.chapter === chapterNumber);
    return {
      index: i,
      total: seq.length,
      previous: i > 0 ? seq[i - 1] : null,
      next: i >= 0 && i < seq.length - 1 ? seq[i + 1] : null,
    };
  }

  /* ---------------------------------------------------- reference parsing */

  /** "1 Nephi 3:7" | "1 Nephi 3" | "1 Nephi" | "3:7" (relative to bookSlug) */
  function resolveReference(input, bookSlug) {
    build();
    const raw = String(input || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!raw) return null;

    const chapterFirst = raw.match(/^(\d+)[:.](\d+)$/);
    if (chapterFirst && bookSlug) {
      return { bookSlug, chapter: +chapterFirst[1], verse: +chapterFirst[2] };
    }

    const m = raw.match(/^(.*?)(?:\s+(\d+))?(?::(\d+))?$/);
    if (!m) return null;

    let slug = BOOK_ALIASES[(m[1] || '').trim()];
    let chapterNumber = m[2] ? +m[2] : null;
    let verseNumber = m[3] ? +m[3] : null;

    if (!slug && m[3] && bookSlug) {
      // bare ":7" or "3:7" style relative reference
      slug = bookSlug;
      if (!chapterNumber) chapterNumber = null;
    }
    if (!slug) {
      slug = Object.keys(BOOK_ALIASES).find((alias) => raw.indexOf(alias) === 0);
      if (slug) slug = BOOK_ALIASES[slug];
    }
    if (!slug) return null;

    if (chapterNumber === null) {
      const b = book(slug);
      return b ? { bookSlug: slug, chapter: b.chapters[0].number, verse: 1, bookOnly: true } : null;
    }
    return { bookSlug: slug, chapter: chapterNumber, verse: verseNumber || 1 };
  }

  /* --------------------------------------------------------- search index */

  function parseQuery(query) {
    const raw = String(query || '').trim().toLowerCase();
    if (!raw) return { terms: [], phrases: [], raw: '' };

    const phrases = [];
    const withoutPhrases = raw.replace(/"([^"]+)"/g, (_, phrase) => {
      const p = phrase.trim();
      if (p) phrases.push(p);
      return ' ';
    });

    return { terms: tokenize(withoutPhrases), phrases, raw };
  }

  function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    let count = 0;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      count++;
      from = at + needle.length;
      if (count > 50) break;
    }
    return count;
  }

  /**
   * Full-text search. Ranked by exact phrase hits first, then by how many of the
   * query terms a verse matches and how often. Terms are ANDed, relaxing the
   * rarest away when nothing satisfies the whole query.
   */
  function search(query, options) {
    build();
    const opts = options || {};
    const { terms, phrases } = parseQuery(query);
    if (!terms.length && !phrases.length) return { results: [], total: 0, terms: [], phrases: [] };

    const limit = opts.limit || 80;
    const bookFilter = opts.bookSlug || null;

    // Terms are ANDed together; when that matches nothing, drop the rarest term
    // and retry, so a long phrase still surfaces its closest passages instead of
    // an empty screen. `relaxed` counts how many terms were given up.
    const byRarity = terms
      .map((term) => ({ term, list: postings.get(term) || [] }))
      .sort((a, b) => a.list.length - b.list.length);
    const missing = byRarity.filter((t) => !t.list.length).map((t) => t.term);

    let active = byRarity;
    let relaxed = 0;
    let candidates = null;

    while (active.length) {
      let next = new Set(active[0].list);
      for (let i = 1; i < active.length && next.size; i++) {
        const set = new Set(active[i].list);
        next = new Set([...next].filter((v) => set.has(v)));
      }
      if (next.size) {
        candidates = next;
        break;
      }
      active = active.slice(1);
      relaxed++;
    }

    if (!candidates) {
      // every term was too restrictive; only a phrase query can still match
      if (terms.length) return { results: [], total: 0, terms, phrases, missing, relaxed };
      candidates = new Set(verses.map((_, i) => i).filter((i) => searchText[i].indexOf(phrases[0]) !== -1));
    }

    const results = [];
    for (const i of candidates) {
      const record = verses[i];
      if (bookFilter && record.bookSlug !== bookFilter) continue;
      const text = searchText[i];

      let phraseHits = 0;
      for (const phrase of phrases) {
        if (text.indexOf(phrase) !== -1) phraseHits += countOccurrences(text, phrase);
      }

      let occurrences = 0;
      let matched = 0;
      for (const term of terms) {
        const n = countOccurrences(text, term);
        occurrences += n;
        if (n) matched++;
      }
      if (terms.length && !matched && !phraseHits) continue;

      // favour verses matching more of the query, then phrase hits, then density
      const score = matched * 20 + phraseHits * 12 + occurrences + (phrases.length && phraseHits ? 8 : 0);
      results.push({ verse: record, score, occurrences, phraseHits, matched });
    }

    results.sort((a, b) => b.score - a.score || a.verse.reference.localeCompare(b.verse.reference));

    return {
      results: results.slice(0, limit),
      total: results.length,
      terms,
      phrases,
      missing,
      relaxed,
    };
  }

  /** Snippet centred on the first hit, for result cards. */
  function snippet(text, terms, phrases, radius) {
    const pad = radius || 78;
    const hay = text.toLowerCase();
    let at = -1;
    for (const phrase of phrases || []) {
      at = hay.indexOf(phrase);
      if (at !== -1) break;
    }
    if (at === -1) {
      for (const term of terms || []) {
        at = hay.indexOf(term);
        if (at !== -1) break;
      }
    }
    if (at === -1) return text.slice(0, pad * 2) + (text.length > pad * 2 ? '…' : '');
    let start = Math.max(0, at - pad);
    let end = Math.min(text.length, at + pad);
    if (start > 0) {
      const space = text.indexOf(' ', start);
      if (space !== -1 && space < at) start = space + 1;
    }
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > at) end = space;
    }
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  /* -------------------------------------------- cross-references in notes */

  /** Pulls "Mosiah 1:2", "Alma 37:6" style references out of footnote text. */
  function referencesIn(text) {
    const found = new Map();
    const hay = String(text || '');
    const names = Object.keys(BOOK_ALIASES)
      .filter((alias) => !alias.includes('title page') && alias.length > 2)
      .sort((a, b) => b.length - a.length);

    const re = new RegExp('(' + names.map(UI.reEsc).join('|') + ')\\s+(\\d+):(\\d+)(?:\\s*[–-]\\s*(\\d+))?', 'gi');
    let m;
    while ((m = re.exec(hay))) {
      const slug = BOOK_ALIASES[m[1].toLowerCase().replace(/\s+/g, ' ')];
      if (!slug) continue;
      const chapterNumber = +m[2];
      const start = +m[3];
      const end = m[4] ? +m[4] : start;
      for (let v = start; v <= Math.min(end, start + 8); v++) {
        const key = slug + '/' + chapterNumber + '/' + v;
        if (byKey[key] && !found.has(key)) found.set(key, slug + '/' + chapterNumber + '/' + v);
      }
    }
    return [...found.keys()];
  }

  /** Study notes attached to a specific verse. */
  function footnotesFor(bookSlug, chapterNumber, verseNumber) {
    const ch = chapter(bookSlug, chapterNumber);
    if (!ch) return [];
    return (ch.footnotes || []).filter((n) => n.verse === verseNumber);
  }

  function chapterFootnotes(bookSlug, chapterNumber) {
    const ch = chapter(bookSlug, chapterNumber);
    return (ch && ch.footnotes) || [];
  }

  /** Cross-references cited by the notes on this verse — used by Ask. */
  function crossReferencesFor(bookSlug, chapterNumber, verseNumber) {
    const keys = new Set();
    footnotesFor(bookSlug, chapterNumber, verseNumber).forEach((note) => {
      referencesIn(note.text).forEach((key) => keys.add(key));
    });
    return [...keys].map((key) => byKey[key]).filter(Boolean).slice(0, 6);
  }

  /* --------------------------------------------------------- suggestions */

  /** Verses that most often carry the given theme. Frequency-based, no API. */
  function thematicVerses(term, limit) {
    const q = search(term, { limit: limit || 6 });
    return q.results.map((r) => r.verse);
  }

  const TOPICS = [
    'faith', 'prayer', 'repentance', 'forgiveness', 'charity',
    'resurrection', 'atonement', 'baptism', 'temptation', 'patience',
    'humility', 'courage', 'gratitude', 'wisdom', 'prophecy',
    'missionary work', 'temple', 'Scripture study', 'love',
  ];

  /* ------------------------------------------------------ verse of the day */

  /** Deterministic per-date pick so the verse is stable for the whole day. */
  function verseOfTheDay(date) {
    build();
    const d = date || new Date();
    const seedStr = UI.isoDate(d);
    let hash = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      hash ^= seedStr.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return verses[Math.abs(hash) % verses.length];
  }

  /** Stable "featured scripture" for the greeting line. */
  function encouragement() {
    const pool = [
      'Feast upon the words of Christ',
      'I will go and do the things which the Lord hath commanded',
      'Be still, and know that I am God',
      'Press forward toward the prize',
      'Always retain a remission of your sins',
      'Behold, I say unto you, the words are life',
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* --------------------------------------------------------- search index */

  /** Most distinctive terms in the corpus — powers search suggestions. */
  function suggest(limit) {
    build();
    const top = [...postings.entries()]
      .filter(([term, list]) => term.length > 3 && list.length > 3 && list.length < 900)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, limit || 40)
      .map(([term]) => term);
    return top;
  }

  function popularSearches(limit) {
    return TOPICS.slice(0, limit || 8);
  }

  return {
    ready, build, listBooks, book, bookByTitle, chapter, verse, verseByKey, allVerses,
    stats, chapterSequence, neighbours,
    resolveReference, search, snippet, parseQuery,
    footnotesFor, chapterFootnotes, crossReferencesFor, referencesIn,
    thematicVerses, verseOfTheDay, encouragement, suggest, popularSearches,
    BOOK_ALIASES, TOPICS,
  };
})();