'use strict';

/**
 * Adds the Gospel Library chapter heading block to the dataset.
 *
 * The canonical header inside `.classic-scripture .body header` is, in order:
 *   h1.book-title   (only on a book's first chapter)
 *   p.subtitle      (rare: 1 of 239)
 *   p.intro         (book overview, on book-opening chapters)
 *   p.title-number  "Chapter N"          <- always
 *   p.study-summary italic serif blurb  <- always (239/239)
 *
 * The existing scraper only captured `subtitle`, so every chapter rendered with
 * a bare "Chapter N" and no summary at all.
 *
 * Ground truth CSS (churchofjesuschrist.org, classic scripture setting):
 *   .title-number  { font-size:20px; margin-bottom:8px; text-align:center;
 *                    letter-spacing:.1em; text-transform:uppercase }
 *   .study-summary { font-family:var(--serif); font-style:italic;
 *                    line-height:1.6; margin-bottom:0; text-indent:0 }
 *
 * Reads the already-cached chapter HTML, so this makes no network requests:
 *   node scripts/build-chapter-headings.js
 *   node scripts/build-chapter-headings.js --dry   # report only, write nothing
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'chapters');
const DATA = path.join(ROOT, 'data', 'book-of-mormon.json');
const JS_OUT = path.join(ROOT, 'data', 'book-of-mormon.js');

const DRY = process.argv.includes('--dry');

/* ------------------------------------------------------------------ utils */

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '\u2014',
  '&ndash;': '\u2013',
  '&rsquo;': '\u2019',
  '&lsquo;': '\u2018',
  '&ldquo;': '\u201D',
  '&rdquo;': '\u201C',
  '&hellip;': '\u2026',
};

function unescapeHtml(s) {
  return s
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => (m in ENTITIES ? ENTITIES[m] : m))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

/**
 * Sanitises the inner HTML of a header block down to a strict allowlist.
 *
 * This string is injected with innerHTML, so anything not explicitly allowed
 * here would become live markup in the reader. Allowed: <small>, <em>, <i>,
 * <b>, <strong>, plus the anchors this generator creates itself.
 */
function sanitize(html, bookSlug) {
  let s = html;

  // Print-time artifacts: empty page markers and media "Associated Content"
  // buttons. Both are empty, and the buttons carry nested <svg>.
  s = s.replace(/<span\b[^>]*class="[^"]*page-break[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  s = s.replace(/<span\b[^>]*class="[^"]*iconPointer[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  s = s.replace(/<button\b[\s\S]*?<\/button>/gi, '');

  // Cross-references, resolved in ONE pass. Doing these as two sequential
  // replaces does not work: the generic fallback then matches the in-app
  // anchors the first replace just created and rewrites them as plain <cite>.
  //   bofm/<slug>/<chapter>  -> in-app route (this app ships the Book of Mormon)
  //   ot|nt/<slug>/<chapter> -> <cite> text only; there is no route to render it
  // The capture group is required: without it the second callback argument is
  // the match *offset*, which silently renders as a number instead of the text.
  s = s.replace(
    /<a\b[^>]*href="\/study\/scriptures\/([^/]+)\/([^"/]+)\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, corpus, slug, ch, text) =>
      corpus.toLowerCase() === 'bofm'
        ? `<a href="#/read/${slug}/${ch}" class="sum-ref">${text}</a>`
        : `<cite>${text}</cite>`
  );

  // Any remaining anchor (an href shape this pass did not recognise) becomes
  // plain text. Must skip the sum-ref anchors created above.
  s = s.replace(
    /<a\b(?![^>]*class="sum-ref")[^>]*>([\s\S]*?)<\/a>/gi,
    (_, text) => `<cite>${text}</cite>`
  );

  // Drop every tag that is not on the allowlist, keeping its text.
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, name) => {
    const n = name.toLowerCase();
    return ['small', 'em', 'i', 'b', 'strong', 'cite'].includes(n) || n === 'a' ? tag : '';
  });

  s = unescapeHtml(s);

  // Collapse the newlines/indent the source HTML carried inside the <p>.
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

function pick(html, cls) {
  const m = html.match(
    new RegExp(`<p class="${cls}"[^>]*>([\\s\\S]*?)<\\/p>`, 'i')
  );
  return m ? m[1] : '';
}

function pickH1(html) {
  const m = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return '';
  const inner = m[1].replace(/<span\b[^>]*class="[^"]*iconPointer[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  return unescapeHtml(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * The visible text of a source fragment, ignoring the empty print/media
 * artifacts. Used to prove that sanitising did not silently drop or corrupt
 * any text: the sanitised output's text must equal this, character for
 * character. A missing capture group in a replace callback once rendered a
 * match *offset* as visible text, and no markup-safety check caught it.
 */
function visibleText(html) {
  return unescapeHtml(
    html
      .replace(/<span\b[^>]*class="[^"]*(?:page-break|iconPointer)[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<button\b[\s\S]*?<\/button>/gi, '')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const textOf = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------- main */

const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));

let chapters = 0;
let summaries = 0;
let intros = 0;
const missingSummary = [];
const missingIntro = [];
const textMismatch = [];
const warnings = [];
let bofmSrc = 0;
let otherSrc = 0;

for (const book of data.books) {
  for (const ch of book.chapters) {
    chapters++;
    const file = path.join(CACHE, `${book.slug}-${String(ch.number).padStart(3, '0')}.html`);
    if (!fs.existsSync(file)) {
      warnings.push(`no cached html for ${book.slug}/${ch.number}`);
      continue;
    }
    const html = fs.readFileSync(file, 'utf8');

    // The classic-settings header is the second <header> on book-opening
    // chapters (the first is the reader chrome), so anchor on the container.
    const start = html.indexOf('class="classic-scripture"');
    const scope = start >= 0 ? html.slice(start) : html;

    const summary = sanitize(pick(scope, 'study-summary'), book.slug);
    if (summary) {
      ch.summary = summary;
      summaries++;
      const rawSummary = pick(scope, 'study-summary');
      for (const a of rawSummary.matchAll(/<a\b[^>]*href="([^"]*)"/gi)) {
        if (/\/study\/scriptures\/bofm\//.test(a[1])) bofmSrc++;
        else otherSrc++;
      }
      const want = visibleText(rawSummary);
      if (textOf(summary) !== want) {
        textMismatch.push(`${book.slug}/${ch.number}`);
        if (textMismatch.length <= 3) {
          warnings.push(
            `text mismatch ${book.slug}/${ch.number}\n      want: ${JSON.stringify(want.slice(0, 110))}\n      got : ${JSON.stringify(textOf(summary).slice(0, 110))}`
          );
        }
      }
    } else {
      delete ch.summary;
      missingSummary.push(`${book.slug}/${ch.number}`);
    }

    const intro = sanitize(pick(scope, 'intro'), book.slug);
    if (intro) {
      ch.intro = intro;
      intros++;
    } else {
      delete ch.intro;
      missingIntro.push(`${book.slug}/${ch.number}`);
    }
  }
}

// Canonical book title as the header renders it ("The First Book of Nephi")
// differs from the short form the rest of the app navigates with.
for (const book of data.books) {
  const file = path.join(CACHE, `${book.slug}-001.html`);
  if (!fs.existsSync(file)) continue;
  const full = pickH1(fs.readFileSync(file, 'utf8').slice(fs.readFileSync(file, 'utf8').indexOf('class="classic-scripture"')));
  if (full) book.fullTitle = full;
}

/* ----------------------------------------------------------------- report */

console.log('=== chapter heading coverage ===');
console.log('  chapters              :', chapters);
console.log('  study-summary present :', summaries, '/', chapters);
console.log('  intro present         :', intros, '/', chapters);
console.log('  book.fullTitle set    :', data.books.filter((b) => b.fullTitle).length, '/', data.books.length);
if (missingSummary.length) console.log('  missing summary       :', missingSummary.join(', '));
console.log('  warnings              :', warnings.length ? warnings.join('; ') : 'none');

// Guard the innerHTML path: nothing unescaped may survive sanitisation.
const all = [];
for (const b of data.books) for (const c of b.chapters) { all.push(c.summary || ''); all.push(c.intro || ''); }
const bad = all.filter((s) => /<(?!\/?(?:small|em|i|b|strong|cite|a)\b)[a-zA-Z/]/.test(s));
console.log('  unsafe markup left    :', bad.length);
if (bad.length) { bad.slice(0, 3).forEach((s) => console.log('     ', s.slice(0, 120))); }
console.log('  text fidelity mismatch:', textMismatch.length);
if (textMismatch.length) console.log('     ', textMismatch.join(', '));

// Cross-reference accounting: every source anchor must land in exactly one
// bucket, so the counts have to add back up to the number of source anchors.
const srcAnchors = bofmSrc + otherSrc;
const outRefs = all.reduce((n, s) => n + (s.match(/class="sum-ref"/g) || []).length, 0);
const outCites = all.reduce((n, s) => n + (s.match(/<cite>/g) || []).length, 0);
console.log('  anchors in source     :', srcAnchors, `(bofm ${bofmSrc} + ot/nt ${otherSrc})`);
console.log('  -> sum-ref in output  :', outRefs);
console.log('  -> cite    in output  :', outCites);
const refOk = outRefs === bofmSrc && outCites === otherSrc;
console.log('  cross-ref accounting  :', refOk ? 'PASS' : 'FAIL');

const sample = data.books[1].chapters[1];
console.log('\n  sample 2 Nephi ' + sample.number + ' summary:\n   ', sample.summary);
const withRef = all.find((s) => s.includes('sum-ref') || s.includes('<cite>'));
if (withRef) console.log('\n  sample with cross-reference:\n   ', withRef);

if (DRY) {
  console.log('\n(--dry: nothing written)');
} else {
  fs.writeFileSync(DATA, JSON.stringify(data));
  fs.writeFileSync(JS_OUT, 'window.LIAHONA_BOOK_OF_MORMON=' + JSON.stringify(data) + ';');
  console.log('\nwrote data/book-of-mormon.json and data/book-of-mormon.js');
}
