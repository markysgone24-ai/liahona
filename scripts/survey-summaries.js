'use strict';
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '..', '.cache', 'chapters');
const dir = process.argv[2] || CACHE;

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
let found = 0;
const missing = [];
const tagCount = {};
const lens = [];
const attrDump = new Set();
const samples = [];

for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = t.match(/<p class="study-summary"([^>]*)>([\s\S]*?)<\/p>/);

  if (!m) {
    missing.push(f);
    continue;
  }
  found++;
  attrDump.add(m[1].trim().slice(0, 60));
  const inner = m[2];
  lens.push(inner.length);

  for (const tag of inner.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g) || []) {
    const name = tag.replace(/<\/?/, '').toLowerCase();
    tagCount[name] = (tagCount[name] || 0) + 1;
  }
  if (samples.length < 4) samples.push({ f, inner: inner.slice(0, 200) });
}

console.log('files            :', files.length);
console.log('study-summary hit:', found);
console.log('missing          :', missing.length);
if (missing.length) console.log('  ->', missing.slice(0, 20).join(', '));
console.log('');
console.log('tags inside summaries:', JSON.stringify(tagCount, null, 0));
console.log('');
lens.sort((a, b) => a - b);
console.log('inner length  min/median/max:', lens[0], '/', lens[lens.length >> 1], '/', lens[lens.length - 1]);
console.log('suspiciously short (<40):', lens.filter((n) => n < 40).length);
console.log('');
console.log('distinct attribute strings:', [...attrDump].slice(0, 3));
console.log('');
console.log('--- samples ---');
samples.forEach((s) => console.log(s.f, '\n  ', s.inner, '\n'));
