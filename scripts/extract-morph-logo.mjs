import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const htmlPath = join(tmpdir(), 'morph.html');
const html = readFileSync(htmlPath, 'utf8');
const match = html.match(/<svg viewBox="0 0 132 32"[\s\S]*?<\/svg>/);
if (!match) {
  console.error('Logo SVG not found');
  process.exit(1);
}

let svg = match[0]
  .replace(/\sclass="[^"]*"/g, '')
  .replace(/fill="currentColor"/g, 'fill="#f0f0f0"');

const out = join(process.cwd(), 'frontend/assets/icons/morph-logo.svg');
writeFileSync(out, svg);
console.log('Wrote', out, svg.length, 'chars');
