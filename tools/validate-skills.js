// Mimic opencode's skill loader rules and validate every SKILL.md on disk.
const fs = require('fs');
const path = require('node:path');

const roots = [
  path.join(process.env.USERPROFILE, '.config', 'opencode', 'skills'),
  path.join(process.env.USERPROFILE, '.claude', 'skills'),
  path.join(process.env.USERPROFILE, '.agents', 'skills'),
];

let checked = 0;
let bad = 0;

for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = path.join(root, dir.name, 'SKILL.md');
    if (!fs.existsSync(file)) {
      console.log(`FAIL  ${dir.name}: no SKILL.md`);
      bad++;
      continue;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) {
      console.log(`FAIL  ${dir.name}: missing frontmatter`);
      bad++;
      continue;
    }
    const fm = m[1];
    const name = (fm.match(/^name:\s*(.+)$/m) || [])[1]?.trim();
    const desc = (fm.match(/^description:\s*([\s\S]+?)(?=\n[a-z]+:|$)/m) || [])[1]?.trim();
    const problems = [];
    if (!name) problems.push('no name');
    else if (name !== dir.name) problems.push(`name "${name}" != folder "${dir.name}"`);
    else if (!/^[a-z0-9-]{1,64}$/.test(name)) problems.push('name not lowercase-hyphen, or >64');
    if (!desc) problems.push('no description (skill would be filtered out)');
    else if (desc.length > 1024) problems.push(`description ${desc.length} chars, too long`);

    const refs = fs.existsSync(path.join(root, dir.name, 'references'))
      ? fs.readdirSync(path.join(root, dir.name, 'references')).length
      : 0;
    checked++;
    console.log(
      `${problems.length ? 'FAIL' : 'ok  '}  ${dir.name.padEnd(24)} desc=${String(desc ? desc.length : 0).padStart(4)}ch refs=${refs}`
    );
    for (const p of problems) {
      console.log(`        -> ${p}`);
      bad++;
    }
  }
}

console.log(`\n${checked} skills checked, ${bad} problems`);
process.exit(bad ? 1 : 0);