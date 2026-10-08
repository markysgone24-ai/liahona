/**
 * Which font is ACTUALLY rendering the scripture body?
 *
 * Two traps this script exists to avoid:
 *
 *  1. Measuring the element gives the BLOCK width (clamped by max-width), not
 *     the text run. So compare probe spans instead: one with the element's full
 *     computed stack, one per candidate family. Whatever matches the stack's
 *     width is the family that actually resolved.
 *
 *  2. document.fonts.check() is NOT proof of anything here — it returns true
 *     for a family that has no @font-face at all. It can only ever be a hint.
 *
 * Ground truth: Gospel Library's classic scripture setting resolves to
 * Palatino Linotype (its own "Ensign:Serif"/"McKay" faces are not licensed for
 * reuse), which is the third entry in our --font-scripture stack.
 */
const { chromium } = require('playwright-core');
const path = require('node:path');

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const APP =
  'file://' +
  path.join(__dirname, '..', 'index.html').replace(/\\/g, '/') +
  '#/read/moro/1';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1713, height: 936 } });

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForSelector('#scripture .verse', { timeout: 15000 });

  const result = await page.evaluate(() => {
    const el = document.querySelector('#scripture .verse');
    const text = el.textContent.trim().slice(0, 60);
    const cs = getComputedStyle(el);

    const measure = (family) => {
      const s = document.createElement('span');
      s.style.cssText =
        'position:absolute;visibility:hidden;white-space:nowrap;font-size:' +
        cs.fontSize +
        ';font-family:' +
        family;
      s.textContent = text;
      document.body.append(s);
      const w = Math.round(s.getBoundingClientRect().width * 100) / 100;
      s.remove();
      return w;
    };

    const withStack = measure(cs.fontFamily);

    const candidates = {
      'Palatino Linotype': measure('"Palatino Linotype"'),
      Palatino: measure('Palatino'),
      Georgia: measure('Georgia'),
      Merriweather: measure('Merriweather'),
      'Times New Roman': measure('"Times New Roman"'),
    };

    let match = 'none (fallback chain exhausted)';
    for (const name of Object.keys(candidates)) {
      if (Math.abs(candidates[name] - withStack) < 0.5) match = name;
    }

    // Not proof either, but a cheap corroboration: an unregistered family
    // still reports "loaded" here, so treat this only as a tie-breaker.
    const fontsCheckSays = {
      'Ensign:Serif': document.fonts.check('16px "Ensign:Serif"'),
      'Palatino Linotype': document.fonts.check('16px "Palatino Linotype"'),
    };

    return {
      declaredStack: cs.fontFamily,
      fontSize: cs.fontSize,
      widthWithStack: withStack,
      candidates,
      match,
      fontsCheckSays,
    };
  });

  await browser.close();

  console.log('=== rendered font probe ===');
  console.log('  declared stack :', result.declaredStack);
  console.log('  body font-size :', result.fontSize);
  console.log('  stack width    :', result.widthWithStack, 'px');
  console.log('');
  console.log('  candidate widths (same text, family forced):');
  const entries = Object.entries(result.candidates);
  for (const [name, w] of entries) {
    const hit = Math.abs(w - result.widthWithStack) < 0.5;
    console.log(
      '    ' +
        (hit ? '=>' : '  ') +
        name.padEnd(20) +
        w +
        'px' +
        (hit ? '   <-- MATCH' : '')
    );
  }
  console.log('');
  console.log('  ACTUALLY RENDERING :', result.match);
  console.log(
    '  document.fonts.check (hint only, not proof):',
    JSON.stringify(result.fontsCheckSays)
  );
  console.log('');
  console.log('=== console errors ===');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : 'none');

  const ok = result.match === 'Palatino Linotype';
  console.log('');
  console.log(ok ? 'PASS' : 'FAIL — rendered font is not Palatino Linotype');
  process.exit(ok ? 0 : 1);
})();
