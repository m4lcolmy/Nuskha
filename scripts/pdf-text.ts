// Reads the text of a PDF the way real viewers do, and scores it. pdf.js is the reader of Firefox
// and most web and Android viewers; PDFium the reader of Chrome and Edge (both as WebAssembly, in
// Node). Used by tests/pdf.test.ts and scripts/pdf-check.ts.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { init } from '@embedpdf/pdfium';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { decodeEntities } from '../src/lib/epub/page.ts';
import type { Page } from '../src/lib/turath/book.ts';
import { spellHonorifics } from '../src/lib/turath/honorifics.ts';

const require = createRequire(import.meta.url);

/** The text of each page, as the pdf.js viewer copies it (it drops NUL characters). */
export async function pdfjsPages(pdf: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map((it) => ('str' in it ? it.str.replaceAll('\0', '') + (it.hasEOL ? '\n' : '') : '')).join(''));
  }
  await doc.cleanup();
  await doc.loadingTask.destroy();
  return pages;
}

let pdfium: ReturnType<typeof init> | undefined;

/** The text of each page, as PDFium (Chrome) reads it. */
export async function pdfiumPages(pdf: Uint8Array): Promise<string[]> {
  pdfium ??= init({ wasmBinary: readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm')).buffer as ArrayBuffer }).then((m) => {
    m.PDFiumExt_Init();
    return m;
  });
  const m = await pdfium;
  const ptr = m.pdfium.wasmExports.malloc(pdf.length);
  (m.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8.set(pdf, ptr);
  const doc = m.FPDF_LoadMemDocument(ptr, pdf.length, '');
  const pages: string[] = [];
  for (let i = 0; i < m.FPDF_GetPageCount(doc); i++) {
    const page = m.FPDF_LoadPage(doc, i);
    const tp = m.FPDFText_LoadPage(page);
    const n = m.FPDFText_CountChars(tp);
    const buf = m.pdfium.wasmExports.malloc((n + 1) * 2);
    m.FPDFText_GetText(tp, 0, n, buf);
    pages.push(m.pdfium.UTF16ToString(buf));
    m.pdfium.wasmExports.free(buf);
    m.FPDFText_ClosePage(tp);
    m.FPDF_ClosePage(page);
  }
  m.FPDF_CloseDocument(doc);
  m.pdfium.wasmExports.free(ptr);
  return pages;
}

/** Arabic words, as a search box sees them: punctuation off their ends. */
export function words(s: string): string[] {
  return s
    .normalize('NFC')
    .split(/[\s  ]+/)
    .map((w) => w.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '').replace(/[‎‏]/g, ''))
    .filter((w) => /[ء-ي]/.test(w));
}

/** The words of the book pages, as they should come back from the PDF. */
export function bookWords(pages: Page[]): string[] {
  return pages.flatMap((p) =>
    words(spellHonorifics(decodeEntities(p.text.replace(/<[^>]+>/g, ' '))).replace(/\(\^?[0-9٠-٩*]+\)/g, ' ').replace(/_{5,}/g, ' ')),
  );
}

/** Share of the expected words found (each counted once). */
export function found(expected: string[], text: string): { score: number; missing: [string, number][] } {
  const bag = new Map<string, number>();
  for (const w of words(text)) bag.set(w, (bag.get(w) ?? 0) + 1);
  const missing = new Map<string, number>();
  let hit = 0;
  for (const w of expected) {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      hit++;
      bag.set(w, n - 1);
    } else missing.set(w, (missing.get(w) ?? 0) + 1);
  }
  return { score: expected.length ? hit / expected.length : 1, missing: [...missing].sort((a, b) => b[1] - a[1]) };
}

/** Share of the expected words that come back in order (longest common subsequence), page by page. */
export function inOrder(expected: string[][], pages: string[]): number {
  let total = 0;
  let hit = 0;
  expected.forEach((exp, i) => {
    const got = words(pages[i] ?? '');
    total += exp.length;
    hit += lcs(exp, got);
  });
  return total ? hit / total : 1;
}

function lcs(a: string[], b: string[]): number {
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
