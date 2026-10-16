// From the Typst document to the finished PDF: lay it out, put back any note Typst left on the
// wrong page, and add the hidden text layer. Runs in the PDF worker and in Node (tests, scripts).

import type { TypstCompiler } from '@myriaddreamin/typst-ts-web-compiler';
import { typstSource, type TypstDoc } from './build.ts';
import { COVER_PATH } from './protocol.ts';
import { PAGE_SIZES, SIZE, type PageSize } from './template.ts';
import { addTextLayer } from './textlayer.ts';
import { compile, type Compiled } from './typst.ts';

export interface RenderInput {
  doc: TypstDoc;
  size: PageSize;
  /** JPEG, shown as the first page; build the doc with cover: COVER_PATH. */
  cover?: Uint8Array;
  /** Advance widths of Amiri (metrics.ts). */
  advance: (cp: number) => number;
  onStage?: (stage: 'layout' | 'again' | 'text') => void;
}

export interface Rendered {
  pdf: Uint8Array;
  /** Where each word landed (for checks). */
  marks: Compiled['marks'];
  /** Notes Typst left on the wrong page: at first, and in the end. */
  misplaced: [first: number, last: number];
}

export function renderPdf(c: TypstCompiler, input: RenderInput): Rendered {
  const { doc } = input;
  const files: Record<string, Uint8Array> = input.cover ? { [COVER_PATH]: input.cover } : {};
  input.onStage?.('layout');
  let r = compile(c, typstSource(doc), files);
  const first = r.misplaced.length;
  const breaks = movedBlocks(doc, r);
  if (breaks.size) {
    input.onStage?.('again');
    r = compile(c, typstSource(doc, breaks), files);
  }
  input.onStage?.('text');
  const spec = PAGE_SIZES[input.size];
  const pdf = addTextLayer({
    pdf: r.pdf,
    marks: r.marks,
    words: doc.words,
    size: spec.size,
    top: (spec.top / 25.4) * 72,
    headSize: SIZE.head,
    advance: input.advance,
  });
  return { pdf, marks: r.marks, misplaced: [first, r.misplaced.length] };
}

/**
 * Typst sometimes moves a line (with a heading kept above it, or to avoid a stranded line) to the
 * next page after it has placed the line's note, and the note stays behind on the page before.
 * When the block holding the marker starts on the marker's page anyway, a page break before the
 * block changes nothing in the layout but makes Typst place the note again, on the right page.
 */
export function movedBlocks(doc: TypstDoc, r: Compiled): Set<number> {
  const pageOf = new Map<number, number>();
  for (const [v, page] of r.marks) if (typeof v === 'number' && !pageOf.has(v)) pageOf.set(v, page);
  const out = new Set<number>();
  for (const [label, marker, note] of r.misplaced) {
    const at = doc.notes[label];
    if (at && note < marker && pageOf.get(at.word) === marker) out.add(at.block);
  }
  return out;
}
