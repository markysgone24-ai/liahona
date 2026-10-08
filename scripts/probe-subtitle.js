'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.cache', 'chapters');

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
let hits = 0;
const samples = [];

for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = t.match(/<p class="subtitle"[^>]*>([\s\S]*?)<\/p>/);
  if (!m) continue;
  hits++;
  if (samples.length < 10) samples.push(f + '  ->  ' + m[1].slice(0, 120));
}

console.log('<p class="subtitle"> occurrences across', files.length, 'cached chapters:', hits);
console.log('');
samples.forEach((s) => console.log('  ' + s));

// what did the fetcher actually store as subtitle?
const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'book-of-mormon.json'), 'utf8')
);
const stored = [];
for (const b of data.books) for (const c of b.chapters) if (c.subtitle) stored.push(b.slug + '/' + c.number + ' = ' + c.subtitle);
console.log('\nstored non-empty subtitle in dataset:', stored.length);
stored.forEach((s) => console.log('  ' + s));
