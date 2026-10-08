const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.cache', 'chapters');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();

for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const cls of ['study-summary', 'intro']) {
    const m = t.match(new RegExp(`<p class="${cls}"[^>]*>([\\s\\S]*?)</p>`, 'i'));
    if (!m) continue;
    if (/Compare/.test(m[1])) {
      const i = m[1].indexOf('Compare');
      console.log('=== ' + f + '  [' + cls + '] ===');
      console.log(JSON.stringify(m[1].slice(Math.max(0, i - 60), i + 260)));
      console.log();
    }
  }
}
