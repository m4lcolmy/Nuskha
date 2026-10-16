// scripts/pdf-check.ts runs Typst here, in a worker thread of its own, as the site does in a web
// worker: next to a parsed book, Typst runs several times slower.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort } from 'node:worker_threads';
import type { TypstDoc } from '../src/lib/pdf/build.ts';
import { renderPdf } from '../src/lib/pdf/make.ts';
import { advances } from '../src/lib/pdf/metrics.ts';
import type { PageSize } from '../src/lib/pdf/template.ts';
import { createCompiler } from '../src/lib/pdf/typst.ts';

const root = join(import.meta.dirname, '..');
const font = new Uint8Array(readFileSync(join(root, 'public/fonts/Amiri-Regular.ttf')));
const wasm = readFileSync(join(root, 'node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'));
const compiler = await createCompiler(wasm, font);

parentPort!.on('message', ({ doc, size }: { doc: TypstDoc; size: PageSize }) => {
  const t = performance.now();
  const r = renderPdf(compiler, { doc, size, advance: advances(font) });
  parentPort!.postMessage({ ...r, ms: performance.now() - t, rss: process.memoryUsage().rss });
});
