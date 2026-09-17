import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workerPath = resolve(import.meta.dirname, '../public/service-worker.js');
const source = await readFile(workerPath, 'utf8');
const version = `skyline-signal-${Date.now()}`;
const updated = source.replace(
  /^const CACHE = 'skyline-signal-[^']+';/m,
  `const CACHE = '${version}';`,
);

if (updated === source) {
  throw new Error('Unable to find the Skyline Signal cache identifier.');
}

await writeFile(workerPath, updated);
console.log(`Prepared PWA cache ${version}`);
