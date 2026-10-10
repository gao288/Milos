import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Assets stay outside Git: Mao and Cubism Core retain Live2D's own licenses.
// See docs/live2d.md and THIRD_PARTY_NOTICES.md before use/distribution.
const files = JSON.parse(await readFile(new URL('./live2d-assets.json', import.meta.url)));
const root = new URL('../public/live2d/', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
for (const file of files) {
  const destination = new URL(file.path, root);
  const existing = await readFile(destination).catch(() => null);
  if (existing && hash(existing) === file.sha256) continue;
  const response = await fetch(file.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`${file.path}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== file.sha256) throw Error(`${file.path}: checksum mismatch; review upstream changes before updating the manifest.`);
  await mkdir(new URL('.', destination), { recursive: true });
  await writeFile(destination, bytes);
  console.log(`Downloaded ${file.path}`);
}
console.log('Mao and Cubism Core ready. Select Mao · Live2D, or open /?character=mao.');
