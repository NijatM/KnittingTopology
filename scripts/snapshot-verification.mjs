import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Fingerprints only. This script does not run checks or invent their results.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
async function walk(directory) {
  for (const item of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, item.name);
    if (item.isDirectory()) await walk(relative);
    else files.push(relative);
  }
}
await walk('src');
await walk('tests');
files.push(
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'playwright.config.ts',
  'index.html'
);
files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const hashes = {};
for (const name of files)
  hashes[name] = createHash('sha256')
    .update(await readFile(path.join(root, name)))
    .digest('hex');
const checks = JSON.parse(
  await readFile(path.join(root, 'docs/verification-results.json'), 'utf8')
);
await writeFile(
  path.join(root, 'docs/verification-manifest.json'),
  JSON.stringify(
    {
      generated_at_utc: new Date().toISOString(),
      node: process.version,
      checks,
      source_sha256: hashes,
    },
    null,
    2
  ) + '\n'
);
console.log(`Recorded ${files.length} source/configuration fingerprints without Git.`);
