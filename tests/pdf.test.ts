// The PDF builder: the Typst it writes, the visual order of the hidden text, the PDF file writer,
// and, on excerpts of three real books (tests/fixtures, from scripts/pdf-fixtures.ts), the text a
// reader gets back: pdf.js (Firefox, web and Android viewers) and PDFium (Chrome, Edge) must read
// at least 95% of the words, and in order. scripts/pdf-check.ts does the same on whole books.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookWords, found, inOrder, pdfiumPages, pdfjsPages, words } from '../scripts/pdf-text.ts';
import type { EpubMeta } from '../src/lib/epub/build.ts';
import { buildTypst, typstSource } from '../src/lib/pdf/build.ts';
import { renderPdf } from '../src/lib/pdf/make.ts';
import { advances } from '../src/lib/pdf/metrics.ts';
import { compact, getKey, removeKey, setKey } from '../src/lib/pdf/pdffile.ts';
import { visual } from '../src/lib/pdf/textlayer.ts';
import { createCompiler } from '../src/lib/pdf/typst.ts';
import type { TurathBook } from '../src/lib/turath/book.ts';
import { volumesOf } from '../src/lib/turath/volumes.ts';

const root = join(import.meta.dirname, '..');
const font = new Uint8Array(readFileSync(join(root, 'public/fonts/Amiri-Regular.ttf')));
const wasm = () => readFileSync(join(root, 'node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'));

const meta: EpubMeta = {
  id: 1,
  title: 'كتاب - ط تجربة',
  mainTitle: 'كتاب',
  edition: 'ط تجربة',
  author: 'فلان',
  died: '',
  editor: '',
  publisher: '',
  imprint: '',
  category: '',
};

const compiler = createCompiler(wasm(), font);

function doc(pages: { text: string; vol?: string; page?: number }[], headings: TurathBook['headings'] = []) {
  const book: TurathBook = { info: '', pages: pages.map((p, i) => ({ vol: p.vol ?? '1', page: p.page ?? i + 1, text: p.text })), headings };
  const volumes = volumesOf(
    book.pages.map((p) => p.vol),
    headings,
  );
  return buildTypst({ book, meta, volumes, from: 0, to: volumes.length - 1, size: 'a5' });
}

describe('Typst source', () => {
  it('puts book text in strings, so nothing in it is markup', async () => {
    const d = doc([{ text: 'قال: "نعم" #x = $y$ \\ *z* // [ص] @w ~ _a_' }]);
    expect(d.words.slice(0, 13).map((w) => w.t)).toEqual(['[ص١]', 'قال:', '"نعم"', '#x', '=', '$y$', '\\', '*z*', '//', '[ص]', '@w', '~', '_a_']);
    // Typst lays it out as plain text: every word comes back, as written.
    const r = renderPdf(await compiler, { doc: d, size: 'a5', advance: advances(font) });
    const back = r.marks.map(([v]) => (Array.isArray(v) ? v[0] : d.words[v].t));
    for (const w of d.words) expect(back).toContain(w.t);
  });

  it('puts a note at its marker, and a note of a heading under the heading', () => {
    const d = doc(
      [{ text: '<span data-type="title" id=toc-1>باب (^١)</span>\nنص (^٢) آخر.\n_________\n(^١) حاشية العنوان.\n(^٢) حاشية النص.' }],
      [{ title: 'باب', level: 1, page: 0 }],
    );
    const src = typstSource(d);
    expect(src).toMatch(/#heading\(level: 1\)\[[^\n]*#fnref\(<fn1>\)/);
    // The heading's note opens the paragraph under it; the other stays at its marker.
    expect(src).toMatch(/#box\(width: 0pt, hide\[#footnote\[[^\n]*حاشية[^\n]*\]<fn1>\]\)[^\n]*نص[^\n]*~#footnote\[/);
    expect(Object.keys(d.notes)).toEqual(['fn1', 'fn2']);
  });

  it('joins a note carried over to the next page («=») to the note it continues', () => {
    const d = doc([{ text: 'أ (^١)\n_________\n(^١) أول' }, { text: 'ب\n_________\n= تتمة' }]);
    expect(typstSource(d)).toMatch(/#footnote\[[^\]]*أول[^\]]*#parbreak\(\)[^\]]*تتمة/);
  });
});

describe('hidden text: visual order', () => {
  const v = (s: string) => visual([...s]).join('');
  it('reverses Arabic, letter by letter, marks included', () => {
    expect(v('قَالَ')).toBe([...'قَالَ'].reverse().join(''));
  });
  it('keeps numbers left to right, and «–» between them in right-to-left order', () => {
    expect(v('٢٢٣/٤')).toBe('٢٢٣/٤');
    expect(v('٥٢–٥٣')).toBe('٥٣–٥٢');
  });
  it('puts an RLM between a final vowel mark and punctuation', () => {
    expect(v('قَالَ:')).toBe([...'قَالَ\u200f:'].reverse().join(''));
  });
});

describe('PDF file', () => {
  it('reads and writes dictionaries', () => {
    const d = '<< /Type /Page /Resources << /Font << /f0 3 0 R >> >> /Contents 4 0 R /Title (a (b) c) >>';
    expect(getKey(d, 'Contents')).toBe('4 0 R');
    expect(getKey(d, 'Resources')).toBe('<< /Font << /f0 3 0 R >> >>');
    expect(getKey(setKey(d, 'Contents', '[4 0 R 9 0 R]'), 'Contents')).toBe('[4 0 R 9 0 R]');
    expect(getKey(removeKey(d, 'Title'), 'Title')).toBeUndefined();
    expect(compact('<< /A 1 0 R\n  /B [ 1  2 ] /C (x  y) >>')).toBe('<</A 1 0 R/B[1 2]/C(x  y)>>');
  });
});

describe('the text readers get back', () => {

  for (const id of [17100, 22669, 12014]) {
    it(
      `book ${id}: pdf.js and PDFium read 95% of the words, in order`,
      async () => {
        const f = JSON.parse(readFileSync(join(root, `tests/fixtures/pdf-${id}.json`), 'utf8')) as TurathBook & { meta: EpubMeta };
        const volumes = volumesOf(
          f.pages.map((p) => p.vol),
          f.headings,
        );
        const d = buildTypst({ book: f, meta: f.meta, volumes, from: 0, to: volumes.length - 1, size: 'a5' });
        const r = renderPdf(await compiler, { doc: d, size: 'a5', advance: advances(font) });
        expect(new TextDecoder().decode(r.pdf.subarray(0, 8))).toBe('%PDF-1.7');

        const expected = bookWords(f.pages);
        const perPage: string[][] = [];
        for (const [v, page] of r.marks) (perPage[page - 1] ??= []).push(...words(Array.isArray(v) ? v[0] : (d.words[v]?.t ?? '')));
        for (const read of [pdfjsPages, pdfiumPages]) {
          const pages = await read(r.pdf);
          expect(found(expected, pages.join('\n')).score).toBeGreaterThanOrEqual(0.95);
          expect(inOrder(perPage, pages)).toBeGreaterThanOrEqual(0.95);
        }
      },
      120_000,
    );
  }
});
