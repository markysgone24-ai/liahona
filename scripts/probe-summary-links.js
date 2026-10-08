'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.cache', 'chapters');

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
const buckets = new Map();

for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = t.match(/<p class="study-summary"[^>]*>([\s\S]*?)<\/p>/);
  if (!m) continue;
  for (const a of m[1].matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = a[1];
    const seg = href.match(/\/study\/scriptures\/([^/]+)\//);
    const key = seg ? seg[1] : 'other:' + href.slice(0, 40);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(f + '  ' + href + '   text=' + a[2]);
  }
}

console.log('scripture-ref targets inside study summaries:\n');
for (const [k, v] of [...buckets].sort()) {
  console.log('  ' + k.padEnd(22) + v.length);
  v.slice(0, 3).forEach((s) => console.log('      ' + s));
}
