/**
 * Accessibility + responsive audit of the scripture reader.
 * Every number here is measured in the real browser at real viewports.
 */
const { chromium } = require('playwright-core');
const path = require('node:path');

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const APP =
  'file:///' +
  path.join(__dirname, '..', 'index.html').replace(/\\/g, '/') +
  '#/read/moro/1';

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => srgb(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const parse = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--allow-file-access-from-files', '--force-color-profile=srgb'],
  });

  const errors = [];
  const results = {};

  for (const theme of ['parchment', 'sepia', 'night']) {
    for (const [label, w, h] of [
      ['320 (small phone)', 320, 720],
      ['390 (phone)', 390, 844],
      ['1713 (desktop)', 1713, 936],
    ]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`${theme}/${label}: ${m.text()}`);
      });
      await page.goto(APP, { waitUntil: 'load' });
      await page.waitForSelector('#scripture .verse');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(300);

      const probe = await page.evaluate(() => {
        const root = document.documentElement;
        const verse = document.querySelector('.verse');
        const num = document.querySelector('.verse__num');
        const mark = document.querySelector('.verse__note');
        const body = getComputedStyle(document.body);
        const vs = getComputedStyle(verse);
        const bgOf = (el) => {
          let n = el;
          while (n) {
            const c = getComputedStyle(n).backgroundColor;
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
            n = n.parentElement;
          }
          return 'rgb(255,255,255)';
        };
        const nr = num ? num.getBoundingClientRect() : null;
        const mr = mark ? mark.getBoundingClientRect() : null;
        return {
          verseColor: vs.color,
          verseBg: bgOf(verse),
          numColor: num ? getComputedStyle(num).color : null,
          numBg: num ? bgOf(num) : null,
          markColor: mark ? getComputedStyle(mark).color : null,
          markBg: mark ? bgOf(mark) : null,
          metaColor: getComputedStyle(document.querySelector('.chapter-head__meta')).color,
          metaBg: bgOf(document.querySelector('.chapter-head__meta')),
          bookColor: getComputedStyle(document.querySelector('.chapter-head__book')).color,
          bookBg: bgOf(document.querySelector('.chapter-head__book')),
          bodyColor: body.color,
          // hit areas
          numW: nr ? nr.width : null,
          numH: nr ? nr.height : null,
          markW: mr ? mr.width : null,
          markH: mr ? mr.height : null,
          // the ::after overlay is the real tap target
          markHit: mr
            ? (() => {
                const cs2 = getComputedStyle(mark, '::after');
                // getComputedStyle already resolves calc(100% + Npx) to a px width
                return {
                  h: parseFloat(cs2.height) || 0,
                  w: parseFloat(cs2.width) || 0,
                };
              })()
            : null,
          // overflow
          scrollW: root.scrollWidth,
          clientW: root.clientWidth,
          overflowX: root.scrollWidth - root.clientWidth,
          widest: (() => {
            let worst = null;
            for (const el of document.querySelectorAll('#scripture *, .chapter-head *')) {
              const r = el.getBoundingClientRect();
              if (r.width > root.clientWidth) {
                if (!worst || r.width > worst.width)
                  worst = { tag: el.tagName + '.' + el.className, width: Math.round(r.width) };
              }
            }
            return worst;
          })(),
        };
      });

      results[`${theme} @ ${label}`] = probe;
      await page.close();
    }
  }

  console.log('=== horizontal overflow ===');
  for (const [k, v] of Object.entries(results)) {
    const ok = v.overflowX <= 0;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${k.padEnd(30)} scrollW=${v.scrollW} clientW=${v.clientW} ` +
        `overflow=${v.overflowX}px${v.widest ? ' worst=' + v.widest.tag + '@' + v.widest.width : ''}`
    );
  }

  console.log('\n=== contrast (WCAG AA: 4.5:1 body, 3:1 large) ===');
  for (const [k, v] of Object.entries(results)) {
    if (!k.includes('desktop')) continue;
    const themeName = k.split(' @')[0];
    const pairs = [
      ['verse text', v.verseColor, v.verseBg, 4.5],
      ['numeral', v.numColor, v.numBg, 3],
      ['footnote marker', v.markColor, v.markBg, 3],
      ['chapter book', v.bookColor, v.bookBg, 4.5],
      ['chapter meta', v.metaColor, v.metaBg, 4.5],
    ];
    console.log(`\n  ${k}`);
    for (const [label, fg, bg, need] of pairs) {
      const r = ratio(parse(fg), parse(bg));
      console.log(
        `    ${r >= need ? 'PASS' : 'FAIL'}  ${label.padEnd(17)} ${fg} on ${bg}  ${r.toFixed(2)}:1 (need ${need})`
      );
    }
  }

  console.log('\n=== hit targets (WCAG 2.5.5 asks 44x44; inline-in-text is exempt) ===');
  const d = results['parchment @ 1713 (desktop)'];
  console.log(`  verse numeral        : ${d.numW.toFixed(1)} x ${d.numH.toFixed(1)}px`);
  console.log(
    `  footnote mark glyph  : ${d.markW.toFixed(1)} x ${d.markH.toFixed(1)}px (collapses by design)`
  );
  console.log(
    `  footnote mark tap area: ${d.markHit.w.toFixed(1)} x ${d.markHit.h}px (via ::after overlay)`
  );

  console.log('\n=== console errors ===');
  console.log(errors.length ? errors.join('\n') : 'none');

  await browser.close();
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});