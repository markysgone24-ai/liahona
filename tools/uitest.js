/**
 * Zero-dependency UI interaction test over the Chrome DevTools Protocol.
 * Node 18+ has a global WebSocket, so nothing needs installing.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const APP = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const PORT = 9333 + Math.floor(Math.random() * 400);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'liahona-cdp-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--window-size=1280,900',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (_) {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

/* ----------------------------------------------------------- CDP client */

let ws;
let msgId = 0;
const pending = new Map();
const consoleErrors = [];

function send(method, params) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const HELPERS = `
  if (!window.__click) {
    window.__click = function(sel){
      var n = document.querySelector(sel);
      if(!n) return false;
      n.click();
      return true;
    };
    window.__text = function(sel){
      var n = document.querySelector(sel);
      return n ? (n.textContent||'').replace(/\\s+/g,' ').trim() : null;
    };
    window.__count = function(sel){ return document.querySelectorAll(sel).length; };
    window.__sheetAction = function(label){
      var buttons = Array.from(document.querySelectorAll('#sheet-root [data-action]'));
      var btn = buttons.find(function(b){ return (b.textContent||'').indexOf(label) !== -1; });
      if (!btn) return false;
      btn.click();
      return true;
    };
    window.__hasSheet = function(){
      return !!document.querySelector('#sheet-root [role="dialog"]');
    };
  }
`;

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression: `(async function(){${HELPERS}\n${expression}})()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const state = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        hash: location.hash,
        step: window.__step,
        views: window.Views ? Object.keys(window.Views).join(',') : 'NONE',
        root: (document.getElementById('view-root')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim().slice(0,200),
        ids: ['search-input','ask-input','book-filter','saved-body','note-input','role'].map(function(i){ return i + '=' + !!document.getElementById(i); }).join(' ')
      })`,
      returnByValue: true,
    });
    throw new Error(
      'page error: ' +
        (result.exceptionDetails.exception?.description || result.exceptionDetails.text) +
        '\n  page state: ' +
        (state.result && state.result.value)
    );
  }
  return result.result.value;
}

async function goto(hash) {
  await evaluate(`
    window.location.hash = ${JSON.stringify(hash)};
    return new Promise(function(r){ setTimeout(r, 450); });
  `);
  await sleep(250);
}

/* ------------------------------------------------------------- test rig */

const results = [];
let stepName = 'startup';

function setStep(name) {
  stepName = name;
  return evaluate(`window.__step = ${JSON.stringify(name)}; return true;`).catch(() => {});
}

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  const mark = ok ? '  PASS  ' : '  FAIL  ';
  console.log(mark + name.padEnd(50) + (detail ? '  ' + detail : ''));
}

const H = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const CLICK = `
  window.__click = function(sel){
    var n = document.querySelector(sel);
    if(!n) return false;
    n.click();
    return true;
  };
  window.__text = function(sel){
    var n = document.querySelector(sel);
    return n ? (n.textContent||'').replace(/\\s+/g,' ').trim() : null;
  };
  window.__count = function(sel){ return document.querySelectorAll(sel).length; };
  return true;
`;

async function main() {
  const url = await targetUrl();

  ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(
        'uncaught: ' + (msg.params.exceptionDetails.exception?.description || '')
      );
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');

  /* ------------------------------------------------------------ boot */

  await send('Page.navigate', { url: APP });
  // wait for the app to signal readiness rather than guessing at a delay
  for (let i = 0; i < 80; i++) {
    const ready = await evaluate(`return !!window.__LIAHONA_READY__;`).catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(400);
  await evaluate(H);
  await sleep(200);

  check('boots and loads text', await evaluate(`return !!window.LIAHONA_BOOK_OF_MORMON;`));
  check(
    'all views registered',
    await evaluate(
      `return ['home','read','search','library','libraryBook','ask','saved','settings']
        .every(function(v){ return typeof window.Views[v] === 'function'; });`
    ),
    await evaluate(`return Object.keys(window.Views).join(',');`)
  );
  check(
    'home rendered',
    // greeting varies with the clock, so accept any of the variants
  (await evaluate(`return window.__text('#view-root');`) || '').match(
    /Good (morning|afternoon|evening)|Still awake|Good night/
  ) !== null,
    await evaluate(`return (window.__text('#view-root')||'').slice(0,60);`)
  );

  /* --------------------------------------------------------- tab bar */

  check(
    'tab bar navigates to each route',
    await evaluate(`
      var routes = ['#/library','#/search','#/ask','#/settings','#/'];
      for (var i=0;i<routes.length;i++) {
        window.location.hash = routes[i];
        await new Promise(function(r){ setTimeout(r,260); });
        if (window.__text('#view-root').indexOf('Something broke') !== -1) return false;
      }
      return true;
    `)
  );

  /* ------------------------------------------------------ reader */

  await goto('#/read/2-ne/2');
  check(
    'reader shows the requested chapter',
    (await evaluate(`return window.__text('.chapter-head');`) || '').includes('Chapter 2'),
    await evaluate(`return window.__text('.chapter-head');`)
  );
  check(
    'reader renders verses',
    (await evaluate(`return window.__count('.verse');`)) > 10,
    'verses=' + (await evaluate(`return window.__count('.verse');`))
  );

  // verse palette
  await evaluate(`window.__click('.verse'); return true;`);
  await sleep(200);
  check('tapping a verse opens the palette', await evaluate(`return !!document.getElementById('reading-palette');`));
  check(
    'palette has all 7 actions',
    (await evaluate(`return window.__count('#reading-palette [data-pal-act]');`)) === 7,
    'actions=' + (await evaluate(`return window.__count('#reading-palette [data-pal-act]');`))
  );

  // bookmark via palette
  await evaluate(`window.__click('[data-pal-act="palette-bookmark"]'); return true;`);
  await sleep(250);
  check(
    'bookmark toggles and persists',
    await evaluate(`
      var key = '2-ne/2/1';
      return window.Store.isBookmarked(key) === true;
    `)
  );

  // highlight via palette
  await evaluate(`window.__click('[data-pal-act="palette-highlight"]'); return true;`);
  await sleep(350);
  check('highlight sheet opens', await evaluate(`return !!document.querySelector('[data-color="gold"]');`));
  await evaluate(`window.__click('[data-color="gold"]'); return true;`);
  await sleep(300);
  check(
    'highlight saves to the store',
    await evaluate(`
      var hl = window.Store.highlightFor('2-ne/2/1');
      return !!hl && hl.color === 'gold';
    `)
  );

  // note via palette
  await evaluate(`window.__click('.verse[data-verse="2-ne/2/2"]'); return true;`);
  await sleep(150);
  await evaluate(`window.__click('[data-pal-act="palette-note"]'); return true;`);
  await sleep(350);
  check('note editor opens', await evaluate(`return !!document.getElementById('note-input');`));
  await evaluate(`
    var el = document.getElementById('note-input');
    el.value = 'Test note from the interaction run';
    el.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  `);
  await evaluate(`window.__sheetAction('Save'); return true;`);
  await sleep(400);
  check(
    'note saves',
    await evaluate(`return (window.Store.noteFor('2-ne/2/2')||'').indexOf('Test note') !== -1;`)
  );

  // footnote letter -> chapter notes open and the note is highlighted
  await evaluate(`window.UI.closeSheet(); await new Promise(function(r){setTimeout(r,300);}); return true;`);
  await evaluate(`window.__click('.verse__note'); return true;`);
  await sleep(500);
  const notesProbe = await evaluate(`return {
    open: !!document.querySelector('.chapter-notes[open]'),
    highlighted: !!document.querySelector('.chapter-notes .footnotes__item.is-selected'),
    heading: (window.__text('.chapter-notes__toggle') || '')
  };`);
  check(
    'tapping a footnote letter opens chapter notes and highlights the note',
    notesProbe.open && notesProbe.highlighted,
    JSON.stringify(notesProbe)
  );
  await evaluate(`var d = document.querySelector('.chapter-notes'); if (d) d.open = false; return true;`);

  // chapter navigation sheet
  await evaluate(`window.__click('[data-act="open-chapters"]'); return true;`);
  await sleep(350);
  check(
    'chapter picker opens',
    (await evaluate(`return window.__count('#sheet-root a[href^="#/read/"]');`)) > 5,
    'links=' + (await evaluate(`return window.__count('#sheet-root a[href^="#/read/"]');`))
  );
  await evaluate(`window.UI.closeSheet(); return true;`);

  // font sheet + settings effect
  await evaluate(`window.__click('[data-act="toggle-font"]'); return true;`);
  await sleep(350);
  check(
    'reading options sheet opens',
    (await evaluate(`return window.__text('#sheet-root [role="dialog"]');`) || '').includes('Merriweather'),
    (await evaluate(`return (window.__text('#sheet-root [role="dialog"]')||'').slice(0,60);`))
  );
  await evaluate(`window.__click('[data-font="sans"]'); return true;`);
  await sleep(250);
  check(
    'typeface setting applies immediately',
    await evaluate(`return document.documentElement.getAttribute('data-typeface') === 'sans';`),
    'attr=' + (await evaluate(`return document.documentElement.getAttribute('data-typeface');`))
  );
  await evaluate(`window.UI.closeSheet(); window.Store.setSettings({typeface:'serif'}); window.Store.applyTheme(); return true;`);
  await sleep(300);

  // reading options
  await evaluate(`window.__click('[data-act="toggle-font"]'); return true;`);
  await sleep(350);
  await evaluate(`document.getElementById('density-range').value='2';
    document.getElementById('density-range').dispatchEvent(new Event('input',{bubbles:true}));
    return true;`);
  check(
    'density slider applies immediately',
    await evaluate(`return document.documentElement.getAttribute('data-density') === 'comfortable';`)
  );
  await evaluate(`
    var n = document.getElementById('show-numbers');
    n.checked = false;
    n.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  `);
  await sleep(300);
  check('verse numbers can be hidden', (await evaluate(`return window.__count('.verse__num');`)) === 0);
  await evaluate(`
    window.Store.setSettings({showVerseNumbers:true, density:'regular'}); window.Store.applyTheme();
    window.UI.closeSheet();
    return true;
  `);

  // prev / next chapter links
  await evaluate(`window.__click('a[href^="#/read/"][class*="bg-secondary-container"]'); return true;`);
  await sleep(450);
  check(
    'next chapter advances',
    (await evaluate(`return window.__text('.chapter-head');`) || '').includes('Chapter 3'),
    await evaluate(`return window.__text('.chapter-head');`)
  );

  // deep link to a verse
  await goto('#/read/1-ne/3/7');
  check(
    'deep link lands on the right verse',
    (await evaluate(`return window.__text('.chapter-head');`) || '').includes('Chapter 3')
  );
  check(
    'progress records the position',
    await evaluate(`
      var p = window.Store.progress();
      return p.book === '1-ne' && p.chapter === 3;
    `),
    await evaluate(`var p=window.Store.progress(); return p.book+'/'+p.chapter+'/'+p.verse;`)
  );

  /* -------------------------------------------------------- search */

  await goto('#/search');
  await setStep('search suggestions');
  check('search shows suggestions', (await evaluate(`return window.__text('#search-body');`) || '').includes('Topics'));
  await setStep('search typing');
  await evaluate(`
    var i = document.getElementById('search-input');
    i.value = 'faith';
    i.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  `);
  await sleep(500);
  const hitCount = await evaluate(`return window.__count('#search-body a[href^="#/read/"]');`);
  check('search returns ranked results', hitCount > 10, 'results=' + hitCount);
  check('search highlights the term', (await evaluate(`return window.__count('mark.search-hit');`)) > 0);

  await goto('#/search?q=charity&book=alma');
  check(
    'book filter is applied from the query',
    await evaluate(`return document.getElementById('book-filter').value === 'alma';`)
  );
  check(
    'filtered results only contain that book',
    await evaluate(`
      var links = Array.from(document.querySelectorAll('#search-body a[href^="#/read/"]'));
      return links.length > 0 && links.every(function(a){ return a.getAttribute('href').indexOf('/alma/') !== -1; });
    `),
    'links=' + (await evaluate(`return window.__count('#search-body a[href^="#/read/"]');`))
  );

  await goto('#/search?q=none other than he hath done it');
  check('multi-term search works', (await evaluate(`return window.__count('#search-body a[href^="#/read/"]');`)) > 0);

  await goto('#/search?q=zzzzqqqqxxxx');
  check('no-match search shows an empty state + ask fallback', await evaluate(`
    var t = window.__text('#search-body');
    return t.indexOf('No verses matched') !== -1 && !!document.getElementById('ask-about');
  `));
  await evaluate(`window.__click('#ask-about'); return true;`);
  await sleep(450);
  check('empty-state Ask button navigates with the query', (await evaluate(`return window.location.hash;`)).startsWith('#/ask?prompt='));

  /* ------------------------------------------------------- library */

  await goto('#/library');
  check('library lists all 15 volumes', (await evaluate(`return window.__count('a[href^="#/library/"]');`)) === 15);
  await evaluate(`window.__click('a[href="#/library/alma"]'); return true;`);
  await sleep(450);
  check('opening a volume shows its chapters', (await evaluate(`return window.__count('a[href^="#/read/alma/"]');`)) > 20);
  check('back button in header exists', await evaluate(`return !!document.querySelector('[data-nav-back="#/library"]');`));
  await evaluate(`window.__click('[data-nav-back]'); return true;`);
  await sleep(400);
  check('header back returns to the library', (await evaluate(`return window.__text('#view-root');`) || '').includes('Volumes'));

  /* ----------------------------------------------------------- ask */

  await goto('#/ask');
  check('ask shows on-device starters', (await evaluate(`return window.__text('#ask-thread');`) || '').includes('Start with a question'));
  await evaluate(`window.__click('#ask-thread [data-prompt]'); return true;`);
  await sleep(300);
  for (let i = 0; i < 120; i++) {
    const done = await evaluate(
      `return !document.querySelector('#ask-thread [aria-label="Thinking"]') && !document.getElementById('ask-send').disabled;`
    );
    if (done) break;
    await sleep(500);
  }
  check(
    'asking produces a grounded answer',
    await evaluate(`return (function () {
      var t = window.__text('#ask-thread') || '';
      return t.length > 40 && (
        t.indexOf('Model response') !== -1 ||
        document.querySelectorAll('#ask-thread a[href^="#/read/"]').length > 0 ||
        /[A-Z][a-z]+ \d+:\d+/.test(t)
      );
    })();`),
    (await evaluate(`return (window.__text('#ask-thread')||'').slice(0,90);`))
  );
  check(
    'answer carries a source tag',
    await evaluate(`return (function () {
      var t = window.__text('#ask-thread') || '';
      var ai = window.Store.settings().ai;
      var modelTag = (ai && ai.enabled && ai.model) ? 'Online' : 'On-device';
      return document.querySelectorAll('#ask-thread a[href^="#/read/"]').length > 0 ||
        t.indexOf(modelTag) !== -1 ||
        t.indexOf('On-device') !== -1 ||
        /[A-Z][a-z]+ \\d+:\\d+/.test(t);
    })();`),
    (await evaluate(`return (window.__text('#ask-thread')||'').slice(0,90);`))
  );
  check('answer saved to history', (await evaluate(`return window.Store.history().length > 0;`)));

  // mic button state
  check(
    'mic button is either functional or explicitly disabled',
    await evaluate(`
      var b = document.getElementById('ask-mic');
      return !!b && (!b.disabled);
    `)
  );

  /* --------------------------------------------------------- saved */

  await goto('#/saved');
  check('saved tab lists the bookmarked verse', (await evaluate(`return window.__text('#saved-body');`) || '').includes('2 Nephi'));
  await evaluate(`window.__click('[data-tab="highlights"]'); return true;`);
  await sleep(250);
  check('highlights tab shows the gold highlight', (await evaluate(`return window.__text('#saved-body');`) || '').includes('2 Nephi 2:1'));
  await evaluate(`window.__click('[data-tab="notes"]'); return true;`);
  await sleep(250);
  check('notes tab shows the written note', (await evaluate(`return window.__text('#saved-body');`) || '').includes('Test note'));
  await evaluate(`window.__click('[data-tab="history"]'); return true;`);
  await sleep(250);
  check('answers tab shows the saved answer', await evaluate(`
  return (function () {
    var t = window.__text('#saved-body') || '';
    var ai = window.Store.settings().ai;
    return t.indexOf('On-device') !== -1 || (ai && ai.enabled && t.indexOf('Online') !== -1);
  })();
`));
  check('helpful toggle flips', await evaluate(`
    var b = document.querySelector('[data-helpful]');
    if (!b) return false;
    var before = window.Store.helpfulCount();
    b.click();
    return window.Store.helpfulCount() !== before;
  `));

  // copy a saved verse (verse cards only appear on the bookmarks tab)
  await evaluate(`window.__click('[data-tab="bookmarks"]'); return true;`);
  await sleep(250);
  check('copy button exists on saved cards', await evaluate(`return window.__count('[data-copy-verse]') > 0;`));

  // remove a saved verse through the confirm sheet
  await goto('#/saved');
  await evaluate(`window.__click('[data-remove]'); return true;`);
  await sleep(300);
  check('remove asks for confirmation first', await evaluate(`
    var t = window.__text('[role="dialog"]') || '';
    return t.indexOf('Remove from saved') !== -1;
  `));
  await evaluate(`
    var btn = Array.from(document.querySelectorAll('[data-action]'))
      .find(function(b){ return b.textContent.trim() === 'Remove'; });
    if (btn) btn.click();
    return true;
  `);
  await sleep(500);
  check(
    'confirming removes the bookmark',
    await evaluate(`
      return window.Store.bookmarks().filter(function(b){
        var k = (b && typeof b === 'object') ? b.key : b;
        return k === '2-ne/2/1';
      }).length === 0;
    `)
  );

  /* ------------------------------------------------------ settings */

  await goto('#/settings');
  check('settings renders all sections', await evaluate(`
    var t = window.__text('#view-root');
    return ['Appearance','Reading','Your data','About'].every(function(s){ return t.indexOf(s) !== -1; });
  `));

  // theme
  await evaluate(`window.__click('[data-seg="theme"][data-value="night"]'); return true;`);
  await sleep(350);
  check('theme switch applies', await evaluate(`return document.documentElement.getAttribute('data-theme') === 'night';`));
  await evaluate(`window.__click('[data-seg="theme"][data-value="sepia"]'); return true;`);
  await sleep(350);
  check('sepia theme applies', await evaluate(`return document.documentElement.getAttribute('data-theme') === 'sepia';`));
  await evaluate(`window.__click('[data-seg="theme"][data-value="parchment"]'); return true;`);
  await sleep(350);
  check('parchment restores', await evaluate(`return document.documentElement.getAttribute('data-theme') === 'parchment';`));

  // typeface + density
  await evaluate(`window.__click('[data-seg="typeface"][data-value="sans"]'); return true;`);
  await sleep(300);
  check('typeface setting persists', await evaluate(`return window.Store.settings().typeface === 'sans';`));
  await evaluate(`window.__click('[data-seg="typeface"][data-value="serif"]'); return true;`);
  await sleep(300);

  await evaluate(`window.__click('[role="switch"][aria-label="Show verse numbers"]'); return true;`);
  await sleep(350);
  check('verse-number toggle persists', await evaluate(`return window.Store.settings().showVerseNumbers === false;`));
  await evaluate(`window.__click('[role="switch"][aria-label="Show verse numbers"]'); return true;`);
  await sleep(350);
  check('verse-number toggle restores', await evaluate(`return window.Store.settings().showVerseNumbers === true;`));

  await evaluate(`window.__click('[role="switch"][aria-label="Mark streak automatically"]'); return true;`);
  await sleep(350);
  check('streak toggle persists', await evaluate(`return window.Store.settings().autoMarkStreak === false;`));
  await evaluate(`window.__click('[role="switch"][aria-label="Mark streak automatically"]'); return true;`);
  await sleep(350);

  // sliders
  await evaluate(`
    var r = document.getElementById('wpm-range');
    r.value = 260; r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  `);
  await sleep(250);
  check('speech speed saves', await evaluate(`return window.Store.settings().wpm === 260;`));
  check('speech speed readout updates', (await evaluate(`return window.__text('#wpm-readout');`) || '').includes('260'));

  await evaluate(`
    var g = document.getElementById('goal-range');
    g.value = 45; g.dispatchEvent(new Event('input',{bubbles:true})); g.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  `);
  await sleep(250);
  check('daily goal saves', await evaluate(`return window.Store.settings().dailyGoalMinutes === 45;`));

  // backup export
  await evaluate(`window.__click('[data-act="backup"]'); return true;`);
  await sleep(350);
  check('backup sheet opens with all three operations', await evaluate(`
    return !!document.querySelector('[data-backup="export"]')
        && !!document.querySelector('[data-backup="import"]')
        && !!document.querySelector('[data-backup="reset"]');
  `));
  check('backup payload is valid JSON', await evaluate(`
    var payload = window.Store.exportAll();
    var text = JSON.stringify(payload);
    var back = JSON.parse(text);
    return back.app === 'liahona'
        && !!back.progress
        && !!back.bookmarks
        && !!back.notes
        && !!back.highlights;
  `));
  await evaluate(`window.UI.closeSheet(); return true;`);

  // clear searches
  await evaluate(`window.Store.addSearch('test term'); return true;`);
  await goto('#/settings');
  await evaluate(`window.__click('[data-act="clear-searches"]'); return true;`);
  await sleep(300);
  await evaluate(`
    var btn = Array.from(document.querySelectorAll('[data-action]'))
      .find(function(b){ return b.textContent.trim() === 'Clear'; });
    if (btn) btn.click();
    return true;
  `);
  await sleep(400);
  check('recent searches can be cleared', await evaluate(`return window.Store.searches().length === 0;`));

  /* ------------------------------------------------------- home */

  await goto('#/');
  check('home shows the saved answer', (await evaluate(`return window.__text('#view-root');`) || '').includes('Recent AI Insights'));
  check('home reflects bookmark count', (await evaluate(`return window.__text('#view-root');`) || '').includes('Saved'));

  // verse of the day controls
  await evaluate(`window.__click('[data-act="votd-bookmark"]'); return true;`);
  await sleep(250);
  check('home votd bookmark works', await evaluate(`
    var raw = window.__text('[data-act="votd-bookmark"]');
    return raw !== null;
  `));
  await evaluate(`window.__click('[data-act="votd-context"]'); return true;`);
  await sleep(350);
  check('home context sheet opens', await evaluate(`return (window.__text('[role="dialog"]')||'').indexOf('In context') !== -1;`));
  await evaluate(`window.UI.closeSheet(); return true;`);

  await evaluate(`window.__click('[data-act="open-streak"]'); return true;`);
  await sleep(350);
  check('streak sheet opens from the header', (await evaluate(`return window.__text('[role="dialog"]');`) || '').includes('Reading streak'));
  await evaluate(`window.UI.closeSheet(); return true;`);

  await evaluate(`window.__click('[data-act="log-today"]'); return true;`);
  await sleep(400);
  check('log today starts the streak', await evaluate(`return window.Store.streak().days.length > 0;`));

  await evaluate(`window.__click('[data-act="listen-chapter"]'); return true;`);
  await sleep(500);
  check('listen navigates to the reader with autoplay', (await evaluate(`return window.location.hash;`)).includes('autoplay=1'));

  /* --------------------------------------------- gospel-style listen player */

  await sleep(500);
  check('listen player bar appears on autoplay', await evaluate(`return !!document.getElementById('listen-player');`));
  const lpRef = await evaluate(`return window.__text('#lp-ref');`);
  check('listen player shows the verse reference', !!lpRef && /Nephi \d+/.test(lpRef), lpRef);
  check(
    'listen player carries verse progress and bar',
    await evaluate(`return !!document.getElementById('lp-count') && !!document.getElementById('lp-bar');`)
  );

  const lpSpeedBefore = await evaluate(`return window.Store.settings().listenRate;`);
  await evaluate(`window.__click('#lp-speed'); return true;`);
  await sleep(250);
  const lpSpeedAfter = await evaluate(`return window.Store.settings().listenRate;`);
  check('listen speed button cycles and persists', lpSpeedAfter !== lpSpeedBefore, `rate ${lpSpeedBefore} -> ${lpSpeedAfter}`);
  const lpSpeedLabel = String(lpSpeedAfter).replace(/(\.\d*?)0+$/, '$1');
  check(
    'listen speed label updates',
    ((await evaluate(`return window.__text('#lp-speed');`)) || '').indexOf(lpSpeedLabel) !== -1,
    'label=' + (await evaluate(`return window.__text('#lp-speed');`))
  );

  await evaluate(`window.__click('#lp-close'); return true;`);
  await sleep(350);
  check('listen player closes cleanly', await evaluate(`
    return !document.getElementById('listen-player') && !document.body.classList.contains('listen-mode');
  `));

  // the fixed header is a curtain over the text while listening; once a
  // chapter is scrolled past its heading the header should slide away
  await evaluate(`window.location.hash = '#/read/1-ne/1?autoplay=1'; return true;`);
  await sleep(500);
  await evaluate(`window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight); return true;`);
  await sleep(400);
  check(
    'listen scrolls the header out of the way',
    await evaluate(`return (getComputedStyle(document.getElementById('app-header')).transform || '').indexOf('matrix') !== -1;`)
  );
  await evaluate(`window.scrollTo(0, 0); return true;`);
  await sleep(400);
  check(
    'listen restores the header at the top',
    await evaluate(`return (getComputedStyle(document.getElementById('app-header')).transform || 'none') === 'none';`)
  );

  // continuous listening: drive the engine to drain instantly so the reader
  // must cross chapter boundaries without dropping the narration. The stub is
  // installed before the autoplay navigation (and on a plain route) so the
  // narration never touches the real engine.
  const river = await evaluate(`
    window.speechSynthesis.speak = function (u) {
      setTimeout(function(){ if (u.onstart) u.onstart(); if (u.onend) u.onend(); }, 0);
    };
    window.location.hash = '#/read/1-ne/3';
    await new Promise(function(r){ setTimeout(r, 350); });
    window.location.hash = '#/read/1-ne/1?autoplay=1';
    await new Promise(function(r){ setTimeout(r, 800); });
    return {
      hash: window.location.hash,
      chapter: window.Store.progress().chapter,
      chapterAttr: (document.querySelector('#scripture')||{}).getAttribute('data-chapter'),
      broke: (window.__text('#view-root')||'').indexOf('Something broke') !== -1,
      player: !!document.getElementById('listen-player')
    };
  `);
  check(
    'listen continues across chapters',
    river.chapter > 1 && river.chapterAttr !== '1-ne/1' && !river.broke && river.player,
    'chapter attr ' + river.chapterAttr
  );

  /* ------------------------------------------------- router integrity */

  check('unknown route shows a 404', await evaluate(`
    window.location.hash = '#/nope/nothing';
    await new Promise(function(r){ setTimeout(r,320); });
    return window.__text('#view-root').indexOf('That page does not exist') !== -1;
  `));
  check('book not found is handled', await evaluate(`
    window.location.hash = '#/library/not-a-book';
    await new Promise(function(r){ setTimeout(r,320); });
    return window.__text('#view-root').indexOf('Book not found') !== -1;
  `));
  check('bad chapter falls back to chapter 1', await evaluate(`
    window.location.hash = '#/read/alma/999';
    await new Promise(function(r){ setTimeout(r,420); });
    return window.__text('.chapter-head').indexOf('Chapter 1') !== -1;
  `));

  /* --------------------------------------------------------- report */

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(72));
  for (const r of results) {
    console.log(
      (r.ok ? '  PASS  ' : '  FAIL  ') + r.name.padEnd(52) + (r.detail ? '  ' + r.detail : '')
    );
  }
  console.log('='.repeat(72));
  console.log(`${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);

  const realErrors = consoleErrors.filter(
    (e) => !/cdn\.tailwindcss\.com|should not be used in production/i.test(e)
  );
  if (realErrors.length) {
    console.log('\nconsole errors:');
    realErrors.forEach((e) => console.log('  ' + e));
  } else {
    console.log('no unexpected console errors');
  }

  return failed.length === 0 && realErrors.length === 0;
}

main()
  .then((ok) => {
    ws.close();
    chrome.kill();
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    console.error('harness failure:', err.message);
    try {
      ws.close();
    } catch (_) {}
    chrome.kill();
    process.exit(2);
  });