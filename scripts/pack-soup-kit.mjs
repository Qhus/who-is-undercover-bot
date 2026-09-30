import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
const source = resolve(process.argv[2] || 'docs/soup-kits/extra-person/source.json');
const output = resolve(process.argv[3] || 'docs/soup-kits/extra-person/多出来的人-题材包.json');
const kit = JSON.parse(readFileSync(source, 'utf8'));
const folder = dirname(source);
for (const [key, filename] of Object.entries(kit.images)) {
  const path = resolve(folder, filename);
  const inside = relative(folder, path);
  if (inside.startsWith('..') || isAbsolute(inside)) throw Error('Image must stay inside the kit folder');
  const bytes = readFileSync(path);
  if (bytes.length > 5 * 1024 * 1024) throw Error('Image exceeds 5 MB: ' + filename);
  const ext = filename.split('.').pop().toLowerCase();
  const type = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif' }[ext];
  if (!type) throw Error('Unsupported image: ' + filename);
  kit.images[key] = `data:image/${type};base64,${bytes.toString('base64')}`;
}
writeFileSync(output, JSON.stringify(kit), 'utf8');
console.log('Packed:', output);
