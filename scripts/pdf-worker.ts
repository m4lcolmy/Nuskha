// scripts/pdf-check.ts runs Typst here, in a worker thread of its own, one per part, as the site
// does in web workers: an engine gives no memory back between runs, and in Node it also runs
// several times slower next to the parsed book.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort } from 'node:worker_threads';
import { coverFiles, finishPdf, layoutPart } from '../src/lib/pdf/make.ts';
import { advances } from '../src/lib/pdf/metrics.ts';
import type { ToPdf } from '../src/lib/pdf/protocol.ts';
import { createCompiler } from '../src/lib/pdf/typst.ts';

const root = join(import.meta.dirname, '..');
const font = new Uint8Array(readFileSync(join(root, 'public/fonts/Amiri-Regular.ttf')));
const wasm = readFileSync(join(root, 'node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'));
const compiler = await createCompiler(wasm, font);

parentPort!.on('message', (m: Exclude<ToPdf, { type: 'warm' }>) => {
  const t = performance.now();
  const rss = () => process.memoryUsage().rss;
  if (m.type === 'part') {
    const result = layoutPart(compiler, m.part, coverFiles(m.cover));
    parentPort!.postMessage({ result, ms: performance.now() - t, rss: rss() });
  } else {
    const out = finishPdf(compiler, { ...m, advance: advances(font) });
    parentPort!.postMessage({ ...out, ms: performance.now() - t, rss: rss() });
  }
});
