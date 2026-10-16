// Prints what a first visit downloads (gzipped as a web server would), against the 500 KB budget.
//   npm run build && node scripts/size-report.ts

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = 500 * 1024;
const dist = join(import.meta.dirname, '..', 'dist');
const files = [
  'index.html',
  // The EPUB worker loads only when a download starts.
  ...readdirSync(join(dist, 'assets'))
    .filter((f) => !f.startsWith('worker-'))
    .map((f) => `assets/${f}`),
  'data/catalog.json',
  'favicon.svg',
];

let total = 0;
for (const f of files) {
  const raw = readFileSync(join(dist, f));
  // woff2 is already compressed; servers send it as is.
  const sent = f.endsWith('.woff2') ? raw.length : gzipSync(raw).length;
  total += sent;
  console.log(`${f.padEnd(48)} ${(sent / 1024).toFixed(1).padStart(7)} KB`);
}
console.log(`${'total'.padEnd(48)} ${(total / 1024).toFixed(1).padStart(7)} KB  (budget 500 KB)`);
if (total > BUDGET) process.exitCode = 1;
