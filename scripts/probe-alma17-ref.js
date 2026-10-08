const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.cache', 'chapters');

const t = fs.readFileSync(path.join(dir, 'alma-017.html'), 'utf8');
const m = t.match(/<p class="study-summary"[^>]*>([\s\S]*?)<\/p>/);
const inner = m[1];

console.log('--- anchors in Alma 17 study-summary ---');
for (const a of inner.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
  console.log('  href=' + JSON.stringify(a[1]));
  console.log('  text=' + JSON.stringify(a[2]));
  console.log('  full=' + JSON.stringify(a[0].slice(0, 110)));
}

const BOFM = /<a\b[^>]*href="\/study\/scriptures\/bofm\/([a-z0-9-]+)\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
console.log('\nBOFM regex matches:', [...inner.matchAll(BOFM)].length);
BOFM.lastIndex = 0;
