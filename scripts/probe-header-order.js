const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.cache', 'chapters');

for (const f of ['1-ne-001.html', '2-ne-002.html', 'moro-010.html']) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const i = t.indexOf('<header>', t.indexOf('class="classic-scripture"'));
  const seg = t.slice(i, t.indexOf('</header>', i) + 9);
  console.log('=== ' + f + ' ===');
  console.log(
    seg
      .replace(/<p class="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g, (_, cls, txt) => '\n  <p class="' + cls + '">' + txt.slice(0, 90))
      .replace(/\n\s+/g, '\n')
  );
  console.log();
}
