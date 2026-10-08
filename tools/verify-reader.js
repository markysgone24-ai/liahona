/**
 * Verifies the classic Gospel Library setting for the scripture reader at
 * 1713x936 on Moroni 1 (4 verses; verse 2 carries three footnote markers).
 *
 * Ground truth taken from churchofjesuschrist.org/study/scriptures/bofm/2-ne/2:
 *   .classic-scripture .body-block .verse { text-indent:0; margin-bottom:16px }
 *   .classic-scripture .verse-number       { font-size:16px; font-weight:700 }
 *   .classic-scripture sup.marker         { font-style:italic; margin-inline-start:0 }
 *   .classic-scripture sup                { font-size:13px; vertical-align:super; line-height:0 }
 *   .classic-scripture .body              { line-height:1.6 }
 *   body                                  { font-size:18px }
 */
const { chromium } = require('playwright-core');
const path = require('node:path');

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const INDEX = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const APP = INDEX + '#/read/moro/1';

const OUT = path.join(__dirname, 'shots');
const round = (n) => Math.round(n * 100) / 100;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--allow-file-access-from-files', '--force-color-profile=srgb'],
  });

  const page = await browser.newPage({
    viewport: { width: 1713, height: 936 },
    deviceScaleFactor: 2,
  });

  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForSelector('#scripture .verse');
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(600);

  const data = await page.evaluate(() => {
    const host = document.querySelector('#scripture');
    const verses = [...host.querySelectorAll('.verse')];
    const cs = getComputedStyle(host);
    const r2 = (n) => Math.round(n * 100) / 100;

    // Line pitch is measured only WITHIN a verse. A range spanning a whole
    // block also yields the gap to the next verse, and a superscript with
    // line-height:0 emits a degenerate rect that reads as a phantom line, so
    // numerals and markers are skipped and lines are counted per verse.
    const skipSel = '.verse__num, .verse__note';
    const ownText = (root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const out = [];
      let n;
      while ((n = w.nextNode())) {
        if (n.parentElement.closest(skipSel)) continue;
        out.push(n);
      }
      return out;
    };

    const intraPitches = [];
    const linesPerVerse = [];
    for (const v of verses) {
      const tops = [];
      for (const t of ownText(v)) {
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const r of range.getClientRects()) {
          if (r.height < parseFloat(cs.fontSize) * 0.8) continue;
          const top = r2(r.top);
          if (!tops.some((x) => Math.abs(x - top) < 4)) tops.push(top);
        }
      }
      tops.sort((a, b) => a - b);
      linesPerVerse.push(tops.length);
      for (let i = 1; i < tops.length; i++) intraPitches.push(r2(tops[i] - tops[i - 1]));
    }

    const rows = verses.map((v, i) => {
      const num = v.querySelector('.verse__num');
      const marks = [...v.querySelectorAll('.verse__note')];
      const vr = v.getBoundingClientRect();
      const vs = getComputedStyle(v);

      // gap between the numeral and the first word: one space of the body font.
      // The range must cover exactly one character — a range over the rest of
      // the verse unions every line box and reports the block's left edge,
      // which lands behind the numeral and reads as a negative gap.
      let numToWord = null;
      if (num) {
        const walker = document.createTreeWalker(v, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          if (n.parentElement.closest('.verse__num, .verse__note')) continue;
          const idx = n.textContent.search(/\S/);
          if (idx === -1) continue;
          const rr = document.createRange();
          rr.setStart(n, idx);
          rr.setEnd(n, idx + 1);
          numToWord = r2(rr.getBoundingClientRect().left - num.getBoundingClientRect().right);
          break;
        }
      }

      // advance width of one space at this exact font/size, for comparison
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      probe.style.fontFamily = cs.fontFamily;
      probe.style.fontSize = cs.fontSize;
      probe.textContent = ' ';
      document.body.append(probe);
      const spacePx = r2(probe.getBoundingClientRect().width);
      probe.remove();

      // vertical gap to the next verse box
      const prev = verses[i - 1];
      const gapAfter = prev
        ? r2(vr.top - prev.getBoundingClientRect().bottom)
        : null;

      return {
        verse: v.id,
        tag: v.tagName,
        display: vs.display,
        marginBottom: vs.marginBottom,
        marginTop: vs.marginTop,
        gapAfterPrev: gapAfter,
        numText: num ? num.textContent : null,
        numPx: num ? r2(parseFloat(getComputedStyle(num).fontSize)) : null,
        numWeight: num ? getComputedStyle(num).fontWeight : null,
        numVAlign: num ? getComputedStyle(num).verticalAlign : null,
        numColor: num ? getComputedStyle(num).color : null,
        verseColor: vs.color,
        numToWord,
        spacePx,
        markers: marks.map((m) => m.textContent),
        markerPx: marks.length ? r2(parseFloat(getComputedStyle(marks[0]).fontSize)) : null,
        markerStyle: marks.length ? getComputedStyle(marks[0]).fontStyle : null,
        markerVAlign: marks.length ? getComputedStyle(marks[0]).verticalAlign : null,
        markerGapBetween:
          marks.length > 1
            ? r2(marks[1].getBoundingClientRect().left - marks[0].getBoundingClientRect().right)
            : null,
        top: r2(vr.top),
        height: r2(vr.height),
      };
    });

    const head = document.querySelector('.chapter-head');
    const headBook = document.querySelector('.chapter-head__book');
    const headNum = document.querySelector('.chapter-head__num');
    const hs = head ? getComputedStyle(head) : null;
    const hns = headNum ? getComputedStyle(headNum) : null;

    return {
      hostTag: host.tagName,
      hostFontSize: cs.fontSize,
      hostLineHeight: cs.lineHeight,
      hostFontFamily: cs.fontFamily,
      verseCount: verses.length,
      verseDisplays: [...new Set(verses.map((v) => getComputedStyle(v).display))],
      separatorCount: host.querySelectorAll('.verse__sep').length,
      intraPitches,
      linesPerVerse,
      rows,
      head: {
        align: hs ? hs.textAlign : null,
        transform: hns ? hns.textTransform : null,
        letterSpacing: hns ? hns.letterSpacing : null,
        size: hns ? hns.fontSize : null,
        bookTransform: headBook ? getComputedStyle(headBook).textTransform : null,
        bookTracking: headBook ? getComputedStyle(headBook).letterSpacing : null,
      },
    };
  });

  await page.screenshot({ path: path.join(OUT, 'moroni1-gospel.png'), fullPage: false });

  console.log('=== container ===');
  console.log(
    `tag=${data.hostTag} font=${data.hostFontSize} line-height=${data.hostLineHeight}`
  );
  console.log(`family=${data.hostFontFamily.slice(0, 70)}`);
  console.log(`verses=${data.verseCount} displays=${JSON.stringify(data.verseDisplays)}`);
  console.log(`separator glyphs found=${data.separatorCount} (Gospel Library has none)`);

  console.log('\n=== chapter heading ===');
  console.log(
    `align=${data.head.align} transform=${data.head.transform} ` +
      `letter-spacing=${data.head.letterSpacing} size=${data.head.size}`
  );
  console.log(
    `book line: transform=${data.head.bookTransform} letter-spacing=${data.head.bookTracking}`
  );

  console.log('\n=== per verse ===');
  console.log('verse | tag | display | margin-bottom | gap from prev | height');
  for (const r of data.rows) {
    console.log(
      [
        r.verse.padEnd(5),
        r.tag.padEnd(4),
        r.display.padEnd(8),
        r.marginBottom.padEnd(13),
        String(r.gapAfterPrev).padEnd(14),
        String(r.height),
      ].join(' ')
    );
  }

  console.log('\n=== numeral + markers ===');
  console.log('verse | num | numPx | wt | vAlign | numToWord | markers | mkrPx | style | vAlign | gapMkrToMkr');
  for (const r of data.rows) {
    console.log(
      [
        r.verse.padEnd(5),
        String(r.numText).padEnd(3),
        String(r.numPx).padEnd(5),
        String(r.numWeight).padEnd(3),
        String(r.numVAlign).padEnd(7),
        String(r.numToWord).padEnd(10),
        (r.markers.join('') || '-').padEnd(7),
        String(r.markerPx).padEnd(6),
        String(r.markerStyle).padEnd(6),
        String(r.markerVAlign).padEnd(7),
        String(r.markerGapBetween),
      ].join(' ')
    );
  }
  console.log(`num colour=${data.rows[0].numColor}  verse colour=${data.rows[0].verseColor}`);

  console.log('\n=== line rhythm (within each verse) ===');
  console.log(`lines per verse: ${data.linesPerVerse.join(', ')}`);
  console.log(`pitches: ${data.intraPitches.join(', ')}  (want 28.8 = 18px x 1.6)`);

  // ---------------- verdict ----------------
  const allP = data.rows.every((r) => r.tag === 'P');
  const allBlock = data.verseDisplays.every((d) => d === 'block');
  const marginsOk = data.rows.every((r, i) =>
    i === data.rows.length - 1
      ? parseFloat(r.marginBottom) === 0
      : Math.abs(parseFloat(r.marginBottom) - 16) < 0.6
  );
  const gapsOk = data.rows.every(
    (r) => r.gapAfterPrev === null || Math.abs(r.gapAfterPrev - 16) < 0.6
  );
  const noSep = data.separatorCount === 0;
  const numOk = data.rows.every(
    (r) =>
      r.numPx === 16 &&
      r.numWeight === '700' &&
      r.numVAlign === 'baseline' &&
      r.numColor === r.verseColor
  );
  const mkrOk = data.rows.every(
    (r) =>
      r.markers.length === 0 ||
      (r.markerPx === 13 && r.markerStyle === 'italic' && r.markerVAlign === 'super')
  );
  const mkrMkrOk = data.rows.every(
    (r) =>
      r.markerGapBetween === null || Math.abs(r.markerGapBetween - 2) < 0.6
  );
  const pitchOk =
    data.intraPitches.length > 0 && data.intraPitches.every((p) => Math.abs(p - 28.8) < 0.6);
  const spaceOk = data.rows.every(
    (r) => r.numToWord !== null && Math.abs(r.numToWord - r.spacePx) < 0.8
  );
  const headOk =
    data.head.align === 'center' &&
    data.head.transform === 'uppercase' &&
    Math.abs(parseFloat(data.head.letterSpacing) - 1.6) < 0.6; // 0.1em of 16px

  console.log('\n=== verdict ===');
  console.log(`(a) every verse is its own <p> : ${allP ? 'PASS' : 'FAIL'}`);
  console.log(`(b) every verse display:block : ${allBlock ? 'PASS' : 'FAIL'}`);
  console.log(`(c) margin-bottom 16px, last 0 : ${marginsOk ? 'PASS' : 'FAIL'}`);
  console.log(`(d) rendered gap between verse boxes 16px : ${gapsOk ? 'PASS' : 'FAIL'}`);
  console.log(`(e) no separator glyph : ${noSep ? 'PASS' : 'FAIL'}`);
  console.log(`(f) numeral 16px/700/baseline/inherits colour : ${numOk ? 'PASS' : 'FAIL'}`);
  console.log(`(g) marker 13px/italic/superscript : ${mkrOk ? 'PASS' : 'FAIL'}`);
  console.log(`(g2) gap between adjacent markers 2px : ${mkrMkrOk ? 'PASS' : 'FAIL'}`);
  console.log(`(h) line pitch 28.8px : ${pitchOk ? 'PASS' : 'FAIL'}`);
  console.log(
    `    numeral to first word = ${data.rows
      .map((r) => r.numToWord)
      .join(', ')}px  |  one space at this font = ${data.rows[0].spacePx}px  ` +
      `: ${spaceOk ? 'PASS' : 'FAIL'}`
  );
  console.log(`(i) heading centred/uppercase/0.1em : ${headOk ? 'PASS' : 'FAIL'}`);

  // sticky header
  const sticky = await page.evaluate(async () => {
    // The chapter-notes list collapses by default now; expand it so the short
    // Moroni 1 fixture is tall enough to genuinely scroll under the header.
    const notes = document.querySelector('.chapter-notes');
    if (notes) notes.open = true;
    await new Promise((r) => setTimeout(r, 300));
    const header = document.getElementById('app-header');
    const ref = header.querySelector('span.truncate');
    const head = document.querySelector('.chapter-head');
    const before = {
      ref: ref ? ref.textContent.trim() : null,
      lifted: header.classList.contains('is-scrolled'),
    };
    window.scrollTo(0, head.getBoundingClientRect().bottom + 200);
    await new Promise((r) => setTimeout(r, 350));
    const after = { lifted: header.classList.contains('is-scrolled') };
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 350));
    const reset = { lifted: header.classList.contains('is-scrolled') };
    return { before, after, reset };
  });

  console.log('\n=== sticky chapter header ===');
  console.log(`reference text : "${sticky.before.ref}"`);
  console.log(
    `at top=${sticky.before.lifted}  scrolled=${sticky.after.lifted}  back at top=${sticky.reset.lifted}`
  );
  const stickyOk =
    sticky.before.ref === 'Moroni · Chapter 1' &&
    !sticky.before.lifted &&
    sticky.after.lifted &&
    !sticky.reset.lifted;
  console.log(`sticky engages and resets : ${stickyOk ? 'PASS' : 'FAIL'}`);

  await browser.close();
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});