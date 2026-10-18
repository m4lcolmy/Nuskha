// From the Typst document to the finished PDF, in two steps that can run in separate workers:
//
//   layoutPart  one part of the book (build.ts planParts), by a fresh engine: one engine runs out
//               of memory on a big book, and gives no memory back between runs
//   finishPdf   «الفهرس», laid out once every heading's page is known; the parts and it joined into
//               one file, with the links of «الفهرس» and the hidden text layer (textlayer.ts)
//
// renderPdf does both in a row with one engine, for small books (tests, scripts).

import type { TypstCompiler } from '@myriaddreamin/typst-ts-web-compiler';
import type { TypstDoc, Word } from './build.ts';
import { partDoc, planParts, typstSource, type PartDoc } from './parts.ts';
import { addObject, collectGarbage, getKey, joinPdfs, pageList, refsIn, rootOf, setKey, writePdf, type Pdf } from './pdffile.ts';
import { COVER_PATH } from './protocol.ts';
import { PAGE_SIZES, SIZE, str, type PageSize } from './template.ts';
import { addTextLayer } from './textlayer.ts';
import { compile, type Compiled, type Mark } from './typst.ts';

export interface PartResult {
  /** The part as Typst made it. */
  pdf: Uint8Array;
  marks: Mark[];
  heads: Compiled['heads'];
  /** The number printed on its last page: the next part numbers on from it. */
  lastPage: number;
  /** Notes Typst left on the wrong page: at first, and in the end. */
  misplaced: [first: number, last: number];
}

/** Lays out one part; a second time if Typst left notes on the wrong page (see movedBlocks). */
export function layoutPart(c: TypstCompiler, part: PartDoc, files: Record<string, Uint8Array> = {}, onAgain?: () => void): PartResult {
  let r = compile(c, typstSource(part), files);
  const first = r.misplaced.length;
  const breaks = movedBlocks(part, r);
  if (breaks.size) {
    onAgain?.();
    r = compile(c, typstSource(part, breaks), files);
  }
  return { pdf: r.pdf, marks: r.marks, heads: r.heads, lastPage: r.lastPage, misplaced: [first, r.misplaced.length] };
}

/** The first part's files: the cover. */
export const coverFiles = (cover: Uint8Array | undefined): Record<string, Uint8Array> => (cover ? { [COVER_PATH]: cover } : {});

export interface FinishInput {
  preamble: string;
  headings: TypstDoc['headings'];
  words: Word[];
  parts: PartResult[];
  size: PageSize;
  /** Advance widths of Amiri (metrics.ts). */
  advance: (cp: number) => number;
}

/** «الفهرس» lists headings down to this level. */
const FIHRIS_DEPTH = 4;

export function finishPdf(c: TypstCompiler, input: FinishInput): { pdf: Uint8Array; marks: Mark[] } {
  const { parts } = input;
  // Where each heading landed: its part, page in the part, height, printed page number.
  const landed = new Map<string, { part: number; page: number; y: number; shown: string }>();
  parts.forEach((p, part) => {
    for (const [label, page, y, shown] of p.heads) landed.set(label, { part, page, y, shown });
  });
  const entries = input.headings.filter((h) => h.level <= FIHRIS_DEPTH && landed.has(h.label));
  const fihris = entries.length
    ? compile(
        c,
        [
          input.preamble,
          `#counter(page).update(${(parts.at(-1)?.lastPage ?? 0) + 1})`,
          '#set page(header: none)',
          '#fihris-title()',
          ...entries.map((h, i) => `#fx(${i}, ${h.level}, ${str(h.title)}, ${str(landed.get(h.label)!.shown)})`),
        ].join('\n'),
      )
    : undefined;

  const files = parts.map((p) => p.pdf);
  if (fihris) files.push(fihris.pdf);
  const { pdf, starts } = joinPdfs(files);
  const pages = pageList(pdf, refsIn(getKey(pdf.objects.get(rootOf(pdf))!.body, 'Pages') ?? '')[0]);

  const marks: Mark[] = [];
  const all = [...parts.map((p) => p.marks), ...(fihris ? [fihris.marks] : [])];
  all.forEach((ms, k) => {
    for (const [v, page, x, y] of ms) marks.push([v, page + starts[k], x, y]);
  });

  const spec = PAGE_SIZES[input.size];
  if (fihris) {
    const fs = spec.size;
    for (const [i, page, y] of fihris.entries) {
      const to = landed.get(entries[i].label)!;
      addLink(pdf, pages[starts.at(-1)! + page - 1], y, fs, pages[starts[to.part] + to.page - 1], to.y);
    }
  }

  addTextLayer(pdf, { marks, words: input.words, size: spec.size, top: (spec.top / 25.4) * 72, headSize: SIZE.head, advance: input.advance });
  collectGarbage(pdf);
  return { pdf: writePdf(pdf), marks };
}

/** A link over the line of «الفهرس» at `y` (pt from the top) to the heading at `toY` on page `to`. */
function addLink(pdf: Pdf, page: number, y: number, fs: number, to: number, toY: number) {
  const o = pdf.objects.get(page)!;
  const [, , w, h] = (getKey(o.body, 'MediaBox') ?? '').match(/[-\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
  const th = (pdf.objects.get(to) && (getKey(pdf.objects.get(to)!.body, 'MediaBox') ?? '').match(/[-\d.]+/g)?.map(Number)[3]) || h;
  const r = (n: number) => Math.round(n * 10) / 10;
  const rect = [w * 0.08, h - y - fs * 0.5, w * 0.92, h - y + fs * 1.1].map(r).join(' ');
  const top = r(Math.min(th, th - toY + fs * 1.5));
  const link = addObject(pdf, { body: `<</Type/Annot/Subtype/Link/Rect[${rect}]/Border[0 0 0]/Dest[${to} 0 R/XYZ null ${top} null]>>` });
  const annots = getKey(o.body, 'Annots');
  if (annots && /^\d+\s+0\s+R$/.test(annots)) {
    const a = pdf.objects.get(refsIn(annots)[0])!;
    a.body = `${a.body.replace(/\]\s*$/, '')} ${link} 0 R]`;
  } else o.body = setKey(o.body, 'Annots', `[${(annots ?? '[]').replace(/^\[|\]$/g, '')} ${link} 0 R]`);
}

export interface RenderInput {
  doc: TypstDoc;
  size: PageSize;
  /** JPEG, shown as the first page; build the doc with cover: COVER_PATH. */
  cover?: Uint8Array;
  advance: (cp: number) => number;
  /** Words per part (build.ts PART_WORDS); smaller in tests. */
  partWords?: number;
}

export interface Rendered {
  pdf: Uint8Array;
  /** Where each word landed (for checks), pages numbered in the whole file. */
  marks: Mark[];
  /** Notes Typst left on the wrong page: at first, and in the end. */
  misplaced: [first: number, last: number];
}

/** All of it with one engine: fine for books of a part or two. */
export function renderPdf(c: TypstCompiler, input: RenderInput): Rendered {
  const { doc } = input;
  const parts: PartResult[] = [];
  for (const range of planParts(doc, input.partWords)) {
    const part = partDoc(doc, range, (parts.at(-1)?.lastPage ?? 0) + 1);
    parts.push(layoutPart(c, part, range[0] === 0 ? coverFiles(input.cover) : {}));
  }
  const out = finishPdf(c, { preamble: doc.preamble, headings: doc.headings, words: doc.words, parts, size: input.size, advance: input.advance });
  const misplaced = parts.reduce<[number, number]>((n, p) => [n[0] + p.misplaced[0], n[1] + p.misplaced[1]], [0, 0]);
  return { ...out, misplaced };
}

/**
 * Typst sometimes moves a line (with a heading kept above it, or to avoid a stranded line) to the
 * next page after it has placed the line's note, and the note stays behind on the page before.
 * When the block holding the marker starts on the marker's page anyway, a page break before the
 * block changes nothing in the layout but makes Typst place the note again, on the right page.
 */
export function movedBlocks(part: PartDoc, r: Compiled): Set<number> {
  const pageOf = new Map<number, number>();
  for (const [v, page] of r.marks) if (typeof v === 'number' && !pageOf.has(v)) pageOf.set(v, page);
  const out = new Set<number>();
  for (const [label, marker, note] of r.misplaced) {
    const at = part.notes[label];
    if (at && note < marker && pageOf.get(at.word) === marker) out.add(at.block);
  }
  return out;
}
