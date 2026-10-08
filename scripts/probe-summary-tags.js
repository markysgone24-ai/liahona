'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.cache', 'chapters');

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
const show = (re, label, max = 6) => {
  console.log('=== ' + label + ' ===');
  let n = 0;
  for (const f of files) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = t.match(/<p class="study-summary"[^>]*>([\s\S]*?)<\/p>/);
    if (!m) continue;
    const hits = m[1].match(re);
    if (!hits) continue;
    n += hits.length;
    if (n <= max) console.log('  ' + f + '  ' + JSON.stringify(hits[0]).slice(0, 180));
  }
  console.log('  total:', n, '\n');
};

show(/<a\b[^>]*>[\s\S]*?<\/a>/g, 'anchors');
show(/<span\b[^>]*>[\s\S]*?<\/span>/g, 'spans');
