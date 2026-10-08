'use strict';

/**
 * Downloads the full English Book of Mormon from the official Gospel Library
 * (churchofjesuschrist.org) and writes it to data/book-of-mormon.json
 *
 * Usage:
 *   node scripts/fetch-book-of-mormon.js          # reuse cache, only fetch missing
 *   node scripts/fetch-book-of-mormon.js --fresh  # ignore cache
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'chapters');
const OUT = path.join(ROOT, 'data', 'book-of-mormon.json');

const ORIGIN = 'https://www.churchofjesuschrist.org';
const BOOK = 'bofm';
const LANG = 'eng';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CONCURRENCY = 6;
const RETRIES = 3;

const FRESH = process.argv.includes('--fresh');

/* ------------------------------------------------------------------ utils */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function get(url, { binary = false } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'text/html,*/*' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) await sleep(600 * attempt);
    }
  }
  throw new Error('GET failed ' + url + ' :: ' + lastErr.message);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ------------------------------------------------------------- html utils */

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  times: '\u00D7', deg: '\u00B0', copy: '\u00A9', reg: '\u00AE',
};

function decodeEntities(str) {
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, ent) ? NAMED[ent] : m;
  });
}

/** Strip inline markup, keep the human-readable text. */
function toText(html) {
  return decodeEntities(
    html
      .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/g, '')
      .replace(/<sup\b[^>]*\/?>/g, '')
      .replace(/<br\s*\/?>/g, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------- extract state from page */

/**
 * The Gospel Library is a React SPA. The server embeds the page payload as
 * base64 in window.__INITIAL_STATE__. Chapter text lives at
 * state.reader.contentStore[<lang><pathname>].content.body
 */
function extractBody(html, wantPath) {
  const key = 'window.__INITIAL_STATE__=';
  const i = html.indexOf(key);
  if (i === -1) throw new Error('no __INITIAL_STATE__ in page');
  const start = i + key.length;
  const end = html.indexOf('</script>', start);
  let state;
  try {
    state = JSON.parse(Buffer.from(html.slice(start, end).trim(), 'base64').toString('utf8'));
  } catch {
    throw new Error('could not decode __INITIAL_STATE__');
  }
  const store = state?.reader?.contentStore;
  if (!store) throw new Error('no reader.contentStore');
  // store keys are /<lang><pathname minus the /study app prefix>
  const storeKey = `/${LANG}${wantPath.replace(/^\/study/, '')}`;
  const hit =
    store[storeKey] ||
    Object.values(store).find((v) => (v?.content?.body || '').length > 500);
  if (!hit) throw new Error('empty contentStore');
  return hit.content.body;
}

/* ---------------------------------------------------------------- parsing */

const BOOK_ORDER = [
  'bofm-title', '1-ne', '2-ne', 'jacob', 'enos', 'jarom', 'omni', 'w-of-m',
  'mosiah', 'alma', 'hel', '3-ne', '4-ne', 'morm', 'ether', 'moro',
];

const BOOK_NAMES = {
  'bofm-title': 'Title Page',
  '1-ne': '1 Nephi',
  '2-ne': '2 Nephi',
  'jacob': 'Jacob',
  'enos': 'Enos',
  'jarom': 'Jarom',
  'omni': 'Omni',
  'w-of-m': 'Words of Mormon',
  'mosiah': 'Mosiah',
  'alma': 'Alma',
  'hel': 'Helaman',
  '3-ne': '3 Nephi',
  '4-ne': '4 Nephi',
  'morm': 'Mormon',
  'ether': 'Ether',
  'moro': 'Moroni',
};

function parseChapter(slug, number, body) {
  const dominant = body.match(/<h1[^>]*>[\s\S]*?<span class="dominant">([\s\S]*?)<\/span>[\s\S]*?<\/h1>/);
  const subtitle = body.match(/<p class="subtitle"[^>]*>([\s\S]*?)<\/p>/);

  const verses = [];
  const verseRe = /<p class="verse"([^>]*)>([\s\S]*?)<\/p>/g;
  for (const m of body.matchAll(verseRe)) {
    const attrs = m[1];
    // drop the leading <span class="verse-number">N </span> so the reader can
    // typeset the verse numeral itself
    const inner = m[2].replace(/<span class="verse-number">[\s\S]*?<\/span>\s*/, '');
    const numMatch = m[2].match(/<span class="verse-number">\s*([^<]+)<\/span>/);
    const n = numMatch ? parseInt(numMatch[1].replace(/\D/g, ''), 10) : NaN;
    const text = toText(inner);
    if (!Number.isFinite(n) || !text) continue;
    const verse = { number: n, text };
    const aid = attrs.match(/data-aid="([^"]+)"/);
    if (aid) verse.aid = aid[1];
    verses.push(verse);
  }

  const footnotes = [];
  const markerStart = body.indexOf('<li data-marker=');
  if (markerStart !== -1) {
    const section = body.slice(markerStart);
    const parts = section.split(/<li\b/).slice(1);
    for (const part of parts) {
      const head = part.match(/^([^>]*)>/);
      if (!head) continue;
      const attrs = head[1];
      const marker = (attrs.match(/data-marker="([^"]*)"/) || [])[1];
      if (!marker) continue;
      const text = toText(part.slice(head[0].length));
      if (!text) continue;
      const id = attrs.match(/id="note(\d+)_([^"]*)"/);
      const full = (attrs.match(/data-full-marker="([^"]*)"/) || [])[1];
      const note = { marker, text };
      if (id) note.verse = parseInt(id[1], 10);
      if (full) note.id = full;
      footnotes.push(note);
    }
  }

  return {
    number,
    slug,
    reference: `${BOOK_NAMES[slug] || slug} ${number}`,
    title: dominant ? toText(dominant[1]) : BOOK_NAMES[slug] || slug,
    subtitle: subtitle ? toText(subtitle[1]) : '',
    verses,
    footnotes,
  };
}

/* ------------------------------------------------------------------- main */

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  process.stdout.write('1. fetching manifest...\n');
  const manifestUrl = `${ORIGIN}/study/scriptures/${BOOK}?lang=${LANG}`;
  const manifestHtml = await get(manifestUrl);
  const manifestBody = extractBody(manifestHtml, `/scriptures/${BOOK}`);

  const chapterRe = new RegExp(`^/study/scriptures/${BOOK}/([a-z0-9-]+)/(\\d+)\\?lang=${LANG}$`);
  const chapters = [
    ...new Set(
      [...manifestBody.matchAll(/data-content-type="chapter"[^>]*>\s*<a href="([^"]+)"/g)].map((m) => m[1])
    ),
  ]
    .map((href) => {
      const m = chapterRe.exec(href);
      if (!m) return null;
      return {
        pathname: href.slice(0, href.indexOf('?')),
        slug: m[1],
        number: parseInt(m[2], 10),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ia = BOOK_ORDER.indexOf(a.slug);
      const ib = BOOK_ORDER.indexOf(b.slug);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.number - b.number;
    });

  if (!chapters.length) throw new Error('manifest produced no chapter urls');
  process.stdout.write(`   ${chapters.length} chapters found\n`);

  process.stdout.write('2. downloading chapters...\n');
  let done = 0;
  let fetched = 0;
  const failures = [];

  const bodies = await mapLimit(chapters, CONCURRENCY, async (ch) => {
    const file = path.join(
      CACHE,
      `${ch.slug}-${String(ch.number).padStart(3, '0')}.html`
    );
    done++;
    try {
      let html;
      if (!FRESH && fs.existsSync(file)) {
        html = fs.readFileSync(file, 'utf8');
      } else {
        html = await get(ORIGIN + ch.pathname + `?lang=${LANG}`);
        fs.writeFileSync(file, html);
        fetched++;
      }
      if (done % 20 === 0) process.stdout.write(`   ${done}/${chapters.length}\n`);
      return { slug: ch.slug, number: ch.number, body: extractBody(html, ch.pathname) };
    } catch (err) {
      failures.push(ch.pathname + ' :: ' + err.message);
      return null;
    }
  });

  if (failures.length) {
    process.stdout.write(`   ${failures.length} failures:\n`);
    failures.slice(0, 10).forEach((f) => process.stdout.write('     ' + f + '\n'));
  }

  process.stdout.write(`   ${fetched} downloaded, ${chapters.length - fetched} from cache\n`);

  process.stdout.write('3. parsing...\n');
  const byBook = new Map();
  for (const item of bodies) {
    if (!item) continue;
    if (!byBook.has(item.slug)) byBook.set(item.slug, []);
    byBook.get(item.slug).push(parseChapter(item.slug, item.number, item.body));
  }

  const books = [...byBook.entries()]
    .sort((a, b) => {
      const ia = BOOK_ORDER.indexOf(a[0]);
      const ib = BOOK_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([slug, chapters]) => ({
      slug,
      title: BOOK_NAMES[slug] || slug,
      chapters: chapters.sort((a, b) => a.number - b.number),
    }));

  const data = {
    title: 'The Book of Mormon',
    slug: BOOK,
    language: LANG,
    source: ORIGIN + '/study/scriptures/' + BOOK,
    copyright: 'Copyright © 2021 by Intellectual Reserve, Inc. All rights reserved.',
    fetchedAt: new Date().toISOString(),
    books,
  };

  fs.writeFileSync(OUT, JSON.stringify(data));

  // browser-loadable bundle: fetch() is blocked on file://, a <script> tag is not
  const JS_OUT = path.join(ROOT, 'data', 'book-of-mormon.js');
  fs.writeFileSync(JS_OUT, 'window.LIAHONA_BOOK_OF_MORMON=' + JSON.stringify(data) + ';');

  const stats = {
    books: books.length,
    chapters: books.reduce((n, b) => n + b.chapters.length, 0),
    verses: books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.verses.length, 0), 0),
    footnotes: books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.footnotes.length, 0), 0),
    words: JSON.stringify(data).split(/\s+/).length,
  };

  process.stdout.write('\ndone -> ' + path.relative(ROOT, OUT) + '\n');
  process.stdout.write('done -> ' + path.relative(ROOT, JS_OUT) + '\n');
  process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write('FATAL: ' + err.stack + '\n');
  process.exit(1);
});