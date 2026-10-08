const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.cache', 'chapters');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();

// find any anchor inside a study-summary whose text looks truncated/numeric-only
for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = t.match(/<p class="study-summary"[^>]*>([\s\S]*?)<\/p>/);
  if (!m) continue;
  for (const a of m[1].matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const txt = a[2].replace(/<[^>]+>/g, '').trim();
    if (/^\d+$/.test(txt) || txt.length < 4 || /^[.,;:]$/.test(txt)) {
      console.log('SUSPECT ' + f);
      console.log('   href : ' + a[1]);
      console.log('   text : ' + JSON.stringify(txt));
      const i = m[1].indexOf(a[0]);
      console.log('   raw  : ' + JSON.stringify(m[1].slice(Math.max(0, i - 90), i + a[0].length + 40)));
      console.log();
    }
  }
}
console.log('scan complete');
