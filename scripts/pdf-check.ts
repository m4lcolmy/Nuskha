// Builds PDFs from real books with the same code the site runs, and checks them: build time, notes
// left on the wrong page, and how many words pdf.js (Firefox) and PDFium (Chrome) read back.
//
//   node scripts/pdf-check.ts                     the test books (a5)
//   node scripts/pdf-check.ts 22669 --vol 12      one book; --vol picks a volume
//   … --size 17x24                                the print size
//   … --pages 1007-1101                           only these book pages (0-based, end excluded)
//
// Books are kept in .cache/books, the PDFs written to .cache/pdf (open them in your viewers).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { decodeCatalog, type CatalogFile } from '../src/lib/catalog/types.ts';
import { epubMeta } from '../src/lib/epub/meta.ts';
import { buildTypst } from '../src/lib/pdf/build.ts';
import type { Rendered } from '../src/lib/pdf/make.ts';
import type { PageSize } from '../src/lib/pdf/template.ts';
import { parseBook } from '../src/lib/turath/book.ts';
import { volumesOf } from '../src/lib/turath/volumes.ts';
import { bookWords, found, inOrder, pdfiumPages, pdfjsPages, words } from './pdf-text.ts';

// A small one, one with many notes (a chapter of Siyar), a fully vowelled one, many volumes.
const TEST_BOOKS: [id: number, pages?: [number, number]][] = [[17100], [22669, [1007, 1101]], [12014, [20, 80]], [8376, [0, 120]]];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = (...p: string[]) => join(root, '.cache', ...p);

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const vol = opt('--vol');
const size = (opt('--size') ?? 'a5') as PageSize;
const range = opt('--pages')?.split('-').map(Number) as [number, number] | undefined;
const books: [number, [number, number]?][] = args.length ? args.map((a) => [Number(a), range]) : TEST_BOOKS;

const catalog = decodeCatalog(JSON.parse(readFileSync(join(root, 'public/data/catalog.json'), 'utf8')) as CatalogFile);
let failed = 0;

/** Typst in a worker thread of its own, a fresh one per book (as the site does). */
function render(doc: unknown, size: PageSize): Promise<Rendered & { ms: number; rss: number }> {
  const w = new Worker(new URL('./pdf-worker.ts', import.meta.url));
  return new Promise((ok, bad) => {
    w.once('message', (r) => {
      ok(r);
      void w.terminate();
    });
    w.once('error', bad);
    w.postMessage({ doc, size });
  });
}

for (const [id, pages] of books) {
  const entry = catalog.byId.get(id);
  if (!entry) throw new Error(`book ${id} is not in the catalog`);
  const path = cache('books', `${id}.json`);
  if (!existsSync(path)) {
    console.log(`downloading book ${id}`);
    const res = await fetch(`https://files.turath.io/books-v3/${id}.json`);
    if (!res.ok) throw new Error(`book ${id}: HTTP ${res.status}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const book = parseBook(JSON.parse(readFileSync(path, 'utf8')));
  if (pages) {
    const [lo, hi] = pages;
    book.pages = book.pages.slice(lo, hi);
    book.headings = book.headings.filter((h) => h.page >= lo && h.page < hi).map((h) => ({ ...h, page: h.page - lo }));
  }
  const volumes = volumesOf(
    book.pages.map((p) => p.vol),
    book.headings,
  );
  const i = vol === undefined ? -1 : volumes.findIndex((v) => v.name === vol);
  const [from, to] = i >= 0 ? [i, i] : [0, volumes.length - 1];

  const t = performance.now();
  const doc = buildTypst({ book, meta: epubMeta(entry), volumes, from, to, size });
  const built = performance.now() - t;
  const r = await render(doc, size);
  const ms = r.ms;
  const name = `${id}${i >= 0 ? `-v${vol}` : ''}${pages ? `-p${pages[0]}` : ''}-${size}.pdf`;
  mkdirSync(cache('pdf'), { recursive: true });
  writeFileSync(cache('pdf', name), r.pdf);

  // The words of the book pages, and of each PDF page in reading order (from the marks).
  const shown = book.pages.filter((p) => volumes.slice(from, to + 1).some((v) => v.name === p.vol));
  const expected = bookWords(shown);
  const perPage: string[][] = [];
  for (const [v, page] of r.marks) {
    const text = Array.isArray(v) ? v[0] : (doc.words[v]?.t ?? '');
    (perPage[page - 1] ??= []).push(...words(text));
  }
  const report = [
    `${name}: ${(r.pdf.length / 1024 / 1024).toFixed(1)} MB, written in ${Math.round(built)} ms, laid out in ${(ms / 1000).toFixed(1)} s (${(r.rss / 1e9).toFixed(1)} GB)`,
  ];
  report.push(`  notes on the wrong page: ${r.misplaced[0]} → ${r.misplaced[1]}`);
  for (const [viewer, read] of [['pdf.js', pdfjsPages], ['PDFium', pdfiumPages]] as const) {
    const text = await read(r.pdf);
    const f = found(expected, text.join('\n'));
    const o = inOrder(perPage, text);
    if (f.score < 0.95 || o < 0.95) failed++;
    const miss = f.missing.slice(0, 6).map(([w, n]) => `${w}×${n}`).join(' ');
    report.push(`  ${viewer.padEnd(6)} words ${(f.score * 100).toFixed(1)}%, in order ${(o * 100).toFixed(1)}%  (missing: ${miss})`);
  }
  console.log(report.join('\n'));
}
if (failed) {
  console.log(`${failed} reading(s) under 95%.`);
  process.exitCode = 1;
}
