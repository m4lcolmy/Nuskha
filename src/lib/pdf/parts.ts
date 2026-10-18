// A big book is laid out in parts, each by a fresh Typst engine (one engine runs out of memory on a
// whole big book, and gives no memory back between runs), and the parts are joined (make.ts). Small
// on purpose: the page runs this, to hand the parts to the PDF workers one by one.

import type { TypstDoc } from './build.ts';

export interface NoteAt {
  block: number;
  word: number;
}

/** What one run of Typst lays out. Block numbers in `notes` count from the part's first block. */
export interface PartDoc {
  head: string;
  blocks: string[];
  notes: Record<string, NoteAt>;
}

/** About 700 A5 pages, 1–1.5 GB for Typst. */
export const PART_WORDS = 120_000;

/** The Typst source of a part, with a page break before each of the blocks in `breaks`. */
export function typstSource(part: PartDoc, breaks: Set<number> = new Set()): string {
  const blocks = part.blocks.map((b, i) => (breaks.has(i) ? `#pagebreak(weak: true)\n\n${b}` : b));
  return [part.head, blocks.join('\n\n'), ''].join('\n');
}

/** Blocks [from, to) of the doc as a part: the first one with the opening pages, the others numbering on from `startPage`. */
export function partDoc(doc: TypstDoc, [from, to]: [number, number], startPage: number): PartDoc {
  const notes: Record<string, NoteAt> = {};
  for (const [id, at] of Object.entries(doc.notes)) {
    if (at.block >= from && at.block < to) notes[id] = { block: at.block - from, word: at.word };
  }
  const opening = from === 0 ? `${doc.front}\n#counter(page).update(1)` : `#counter(page).update(${startPage})`;
  return { head: `${doc.preamble}\n${opening}\n`, blocks: doc.blocks.slice(from, to), notes };
}

/**
 * The parts to lay out the book in, as block ranges: each at most `max` words, cut where the book
 * starts a new page anyway if it can (a volume, then a chapter), else at a heading, else anywhere.
 */
export function planParts(doc: TypstDoc, max = PART_WORDS): [number, number][] {
  const words = doc.blocks.map((b) => (b.match(/<w>/g) ?? []).length);
  const sum = (from: number, to: number) => {
    let n = 0;
    for (let i = from; i < to; i++) n += words[i];
    return n;
  };
  const cut = (from: number, to: number, rank: number): [number, number][] => {
    if (sum(from, to) <= max || to - from < 2) return [[from, to]];
    const at =
      rank <= 2
        ? doc.starts.filter((s) => s.rank === rank && s.block > from && s.block < to).map((s) => s.block)
        : Array.from({ length: to - from - 1 }, (_, i) => from + i + 1);
    if (!at.length) return cut(from, to, rank + 1);
    // The pieces between the cuts, joined again while they fit; a piece too big is cut finer.
    const bounds = [from, ...at, to];
    const out: [number, number][] = [];
    let cur: [number, number] | undefined;
    for (let i = 0; i + 1 < bounds.length; i++) {
      const piece: [number, number] = [bounds[i], bounds[i + 1]];
      if (sum(...piece) > max) {
        if (cur) out.push(cur);
        cur = undefined;
        out.push(...cut(piece[0], piece[1], rank + 1));
      } else if (cur && sum(cur[0], piece[1]) <= max) cur[1] = piece[1];
      else {
        if (cur) out.push(cur);
        cur = piece;
      }
    }
    if (cur) out.push(cur);
    return out;
  };
  return cut(0, doc.blocks.length, 0);
}

