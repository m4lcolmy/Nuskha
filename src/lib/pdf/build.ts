// Writes a turath book as a Typst document: the whole book, one volume or a range of volumes.
//
//   cover · title page · book card · text · «الفهرس»
//
// The pages are read with the same code as the EPUB (renderPage), then written as Typst markup
// instead of XHTML. Every piece of book text goes in as a Typst string, so nothing in it is ever
// read as markup. Footnotes go at the foot of the page they belong to; a note that Shamela carries
// over to the next page («=») is joined to the note it continues, and Typst breaks it where it must.
//
// Each word is followed by a marker (see template.ts) and listed in `words`, for the hidden text layer.

import { num } from '../format.ts';
import type { EpubMeta } from '../epub/build.ts';
import { pageLabel } from '../epub/build.ts';
import { decodeEntities, renderPage, type Note, type PageOut } from '../epub/page.ts';
import type { TurathBook } from '../turath/book.ts';
import { spellHonorifics } from '../turath/honorifics.ts';
import { volLong, volShort, type Volume } from '../turath/volumes.ts';
import type { NoteAt } from './parts.ts';
import { headingSize, SIZE, str, template, type PageSize } from './template.ts';

export interface PdfInput {
  book: TurathBook;
  meta: EpubMeta;
  volumes: Volume[];
  /** Volumes to include (indexes into `volumes`, inclusive). */
  from: number;
  to: number;
  size: PageSize;
  /** Path of the cover image in the Typst file system, if there is one. */
  cover?: string;
  date?: Date;
  onProgress?: (fraction: number) => void;
}

export interface Word {
  /** The word as it should read when copied. */
  t: string;
  /** Type size, in em of the body text. */
  s: number;
  /** A space comes before it. */
  sp: boolean;
}

export interface TypstDoc {
  /** The page design (template.ts), and the opening pages: cover, title page, book card. */
  preamble: string;
  front: string;
  /** The text, one block (paragraph, heading…) per entry. */
  blocks: string[];
  /** Word n is the one whose marker has the value n. */
  words: Word[];
  /** Each labelled note («fn12»): the block its marker is in, and that block's first word. */
  notes: Record<string, NoteAt>;
  /** The headings, for «الفهرس»: label («h12»), level, title as plain text. */
  headings: { label: string; level: number; title: string }[];
  /** Blocks a part may start with: 0 a volume, 1 a chapter, 2 another heading (parts.ts). */
  starts: { block: number; rank: number }[];
  /** Title for the file details, with the volume: «سير أعلام النبلاء - ط الحديث - ج٣». */
  docTitle: string;
}

/** A chapter (new page, no running head) needs at least this many book pages on average. */
const CHAPTER_PAGES = 6;

export function buildTypst(input: PdfInput): TypstDoc {
  const { book, meta, volumes } = input;
  const date = input.date ?? new Date();
  const selected = volumes.slice(input.from, input.to + 1);
  const names = new Set(selected.map((v) => v.name));
  const multi = volumes.length > 1;
  const parts = selected.length > 1;
  const whole = selected.length === volumes.length;
  const shift = parts ? 1 : 0; // volume headings take level 1

  const pageIdx = book.pages.flatMap((p, i) => (names.has(p.vol) ? [i] : []));
  const top = book.headings.filter((h) => h.level === 1 && names.has(book.pages[h.page].vol)).length;
  const chapterLevel = top > 0 && top * CHAPTER_PAGES <= pageIdx.length ? 1 + shift : 0;
  const volumeLevel = parts ? 1 : 0;
  const w = new Writer();

  // --- read the pages ---------------------------------------------------------------------------
  const usedIds = new Set<string>();
  const levelOf = (n: number) => book.headings[n - 1]?.level;
  const outs: PageOut[] = [];
  pageIdx.forEach((i, k) => {
    const out = renderPage(book.pages[i].text, { key: String(i + 1), levelOf, usedIds });
    // A note starting with «=» carries on the last note of the page before.
    const prev = outs.at(-1)?.notes.at(-1);
    if (out.notes[0]?.cont && prev) prev.lines.push(...out.notes.shift()!.lines);
    outs.push(out);
    if ((k + 1) % 500 === 0) input.onProgress?.((0.5 * (k + 1)) / pageIdx.length);
  });

  // --- write the text ---------------------------------------------------------------------------
  const lines: string[] = [];
  let open: string | null = null; // a paragraph that may carry on over the page
  let lastPara = -1; // index in `lines` of the last paragraph written
  let carry: (() => string) | null = null; // a page marker waiting for the next paragraph
  let held = ''; // notes of a heading, waiting for the paragraph under it
  let vol: string | undefined;
  const notesAt: TypstDoc['notes'] = {};
  const headings: TypstDoc['headings'] = [];
  const starts: TypstDoc['starts'] = [];
  let paraWord = 0; // first word of the open paragraph

  /** A heading, labelled for «الفهرس»; its title is its words. */
  const heading = (level: number, markup: () => string, rank: number, start: number) => {
    const label = `h${headings.length + 1}`;
    const from = w.words.length;
    lines.push(`#heading(level: ${level})[${markup()}${END}]<${label}>`);
    const title = w.words
      .slice(from)
      .map((x, i) => (i && x.sp ? ' ' : '') + x.t)
      .join('');
    headings.push({ label, level, title });
    starts.push({ block: start, rank });
  };

  const endPara = () => {
    if (open === null) return;
    lines.push(open + END);
    lastPara = lines.length - 1;
    for (const id of w.ids.splice(0)) notesAt[id] = { block: lastPara, word: paraWord };
    open = null;
  };

  pageIdx.forEach((i, k) => {
    const p = book.pages[i];
    const out = outs[k];
    if (p.vol !== vol) {
      vol = p.vol;
      if (parts) {
        endPara();
        const v = vol;
        heading(1, () => w.text(volLong(v), SIZE.volume), 0, lines.length);
      }
    }
    const notes = new Map(out.notes.map((n) => [n.id, n]));

    const label = p.page === null ? '' : pageLabel(p.vol, p.page, multi);
    const at = p.page === null ? '' : `${str(multi ? volShort(p.vol) : '')}, ${str(num(p.page))}`;
    // The page marker, and the space after it (in the markup, not in a string) for the text layer.
    const shown = () => {
      const s = `[${w.text(`[${label}]`, SIZE.pg)}${END}]`;
      w.space = true;
      return s;
    };
    const mark = () => (label ? `#pg(${at}, ${shown()})` : '');
    const first = out.blocks[0];
    let placed = false;
    let b = 0;
    if (open !== null && first?.kind === 'p') {
      // The sentence carries on from the page before: same paragraph, marker in the middle.
      open = `${open} ${mark()} ${w.markup(first.html, notes, SIZE.body)}`;
      placed = true;
      b = 1;
      if (!first.open || out.blocks.length > 1) endPara();
    }
    for (; b < out.blocks.length; b++) {
      const blk = out.blocks[b];
      endPara();
      if (blk.kind === 'p') {
        paraWord = w.words.length;
        const lead = placed ? '' : `${mark()} `;
        const shownHere = carry ? `#pgv(${carry()}) ` : '';
        open = `${held}${lead}${shownHere}${w.markup(blk.html, notes, SIZE.body)}`;
        carry = null;
        held = '';
        placed = true;
        if (b < out.blocks.length - 1 || !blk.open) endPara();
      } else if (blk.kind === 'h') {
        const start = { block: lines.length, word: w.words.length };
        if (!placed && label) {
          // The marker's place is read before the heading; it is shown in the paragraph after it.
          lines.push(`#pgm(${at})`);
          carry = shown;
        }
        placed = true;
        const level = (blk.level ?? 2) + shift;
        // A note in a heading: the heading shows its number, the note itself goes at the start of the
        // paragraph under it (Typst can leave a note in a heading behind when it moves the heading to
        // the next page to keep it with its paragraph).
        w.defer = [];
        const size = headingSize(level, chapterLevel, volumeLevel);
        heading(level, () => w.markup(blk.html, notes, size), level === chapterLevel ? 1 : 2, start.block);
        held += w.defer.join('');
        w.defer = null;
        for (const id of w.deferred.splice(0)) notesAt[id] = start;
      } else {
        lines.push('#rule()');
      }
    }
    if (!placed && label) {
      if (open !== null) open += ` ${mark()}`;
      else {
        lines.push(`#pgm(${at})`);
        carry = shown;
      }
    }

    // Notes without a marker in the text: at the foot of this page, after its last paragraph.
    const plain = out.notes.filter((n) => !n.refId && notes.has(n.id)).map((n) => w.plainNote(n, notes));
    if (plain.length) {
      if (open !== null) open += plain.join('');
      else if (lastPara >= 0) lines[lastPara] += plain.join('');
      else lines.push(plain.join(''));
    }

    if ((k + 1) % 500 === 0) input.onProgress?.(0.5 + (0.5 * (k + 1)) / pageIdx.length);
  });
  endPara();
  if (held) lines.push(held);
  input.onProgress?.(1);

  // --- the document -----------------------------------------------------------------------------
  const firstVol = selected[0];
  const lastVol = selected.at(-1)!;
  const volNote = whole ? '' : parts ? `${volLong(firstVol.name)} – ${volShort(lastVol.name)}` : volLong(firstVol.name);
  const shortVol = whole ? '' : parts ? `${volShort(firstVol.name)}–${volShort(lastVol.name)}` : volShort(firstVol.name);
  const docTitle = shortVol ? `${meta.title} - ${shortVol}` : meta.title;
  const sourceNote = `المكتبة الشاملة، الكتاب رقم ${num(meta.id)} (shamela.ws/book/${meta.id})، عن نسخة تراث (turath.io).`;

  const head = template({
    size: input.size,
    title: w.text(meta.mainTitle, SIZE.head),
    docTitle,
    author: meta.author,
    description: `${sourceNote} أُنشئ بـ«نسخة».`,
    keywords: [meta.category, meta.publisher, `shamela:${meta.id}`].filter(Boolean),
    chapterLevel,
    volumeLevel,
  });

  const arg = (s: string, size: number) => (s ? `[${w.text(s, size)}${END}]` : 'none');
  const titleArgs = [
    arg(meta.mainTitle, 2.1),
    arg(meta.edition, 1.05),
    arg(volNote, 1.15),
    arg(meta.author, 1.3),
    arg(meta.died && `(${meta.died})`, 0.9),
    arg(meta.editor, 1.3),
    arg(meta.publisher, 1),
    arg(meta.imprint, 1),
  ];
  const front = [
    input.cover ? `#cover-page(${str(input.cover)})` : '',
    // In print the title page is an odd page of its own, the card on its back.
    input.cover && input.size === '17x24' ? '#page(header: none, numbering: none)[]' : '',
    `#title-page(${titleArgs.join(', ')})`,
    `#card-page[${cardBody(w, book.info, meta, sourceNote, date)}]`,
  ].filter(Boolean);

  return { preamble: head, front: front.join('\n'), blocks: lines, words: w.words, notes: notesAt, headings, starts, docTitle };
}

// --- markup -------------------------------------------------------------------------------------

/**
 * Closes a paragraph (or the label in a box). Typst places a marker that ends a paragraph under it,
 * at its left edge, which would put the last word's hidden text away from the printed word, out of
 * reach of selection. Anything after the marker keeps it in the line: zero-width spacing, which
 * unlike a character leaves the layout as it was (a full stop still hangs at the end of the line).
 */
const END = '#h(0pt)';

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// The few tags renderPage writes: Quran (span.q), run-in titles (span.t), anchors (span id), note
// markers (a.nr → the note, sup.nr when the page has no such note).
const TAGS = /<a [^>]*?href="#([^"]+)"[^>]*>[\s\S]*?<\/a>|<(\/?)(span|sup)\b([^>]*)>/g;

class Writer {
  words: Word[] = [];
  /** While writing a heading: its notes, to be placed after it. */
  defer: string[] | null = null;
  /** Labels of the notes written since last taken: inline, and held from a heading. */
  ids: string[] = [];
  deferred: string[] = [];
  private notes = 0;
  /** Whitespace came last. */
  space = false;

  /** Text as Typst strings (so nothing in it is read as markup), a marker after every word. */
  text(s: string, size: number): string {
    let out = '';
    let ws = '';
    for (const part of s.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s/.test(part)) {
        ws += part;
        this.space = true;
        continue;
      }
      out += `#${str(ws + part)}#metadata(${this.words.length})<w>`;
      this.words.push({ t: part, s: size, sp: this.space });
      this.space = false;
      ws = '';
    }
    return ws ? `${out}#${str(ws)}` : out;
  }

  markup(html: string, notes: Map<string, Note>, size: number): string {
    let out = '';
    const close: string[] = [];
    let at = 0;
    for (const m of html.matchAll(TAGS)) {
      const before = unescape(html.slice(at, m.index));
      at = m.index + m[0].length;
      if (m[1] !== undefined) {
        const note = notes.get(m[1]);
        // The marker never starts a line: a no-break space joins it to the word before.
        if (note && /\s$/.test(before)) {
          out += `${this.text(before.trimEnd(), size)}~`;
          this.space = true;
        } else out += this.text(before, size);
        if (note) {
          notes.delete(m[1]);
          const id = `fn${++this.notes}`;
          if (this.defer) {
            out += `#fnref(<${id}>)`;
            const defer = this.defer;
            this.defer = null;
            defer.push(`#box(width: 0pt, hide[#footnote[${this.noteBody(note, notes)}]<${id}>])`);
            this.defer = defer;
            this.deferred.push(id);
          } else {
            out += `#footnote[${this.noteBody(note, notes)}]<${id}>`;
            this.ids.push(id);
          }
        }
      } else if (m[2]) out += this.text(before, size) + (close.pop() ?? '');
      else {
        const open = m[3] === 'sup' ? '#super[' : /class="q"/.test(m[4]) ? '#q[' : /class="t"/.test(m[4]) ? '#t[' : '';
        out += this.text(before, size) + open;
        close.push(open ? ']' : '');
      }
    }
    out += this.text(unescape(html.slice(at)), size);
    while (close.length) out += close.pop();
    return out;
  }

  private noteBody(n: Note, notes: Map<string, Note>): string {
    const space = this.space;
    this.space = false;
    const body = n.lines.map((l) => this.markup(l, notes, SIZE.note) + END).join('#parbreak()');
    this.space = space;
    return body;
  }

  plainNote(n: Note, notes: Map<string, Note>): string {
    notes.delete(n.id);
    return `#note(${str(n.label ? `(${n.label})` : '')})[${this.noteBody(n, notes)}]`;
  }
}

function cardBody(w: Writer, info: string, meta: EpubMeta, source: string, date: Date): string {
  const rows = spellHonorifics(decodeEntities(info))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 && i < 40
        ? `#k[${w.text(`${l.slice(0, i)}:`, SIZE.card)}]${w.text(l.slice(i + 1), SIZE.card)}`
        : w.text(l, SIZE.card);
    });
  const d = `${num(date.getFullYear())}/${num(date.getMonth() + 1)}/${num(date.getDate())}`;
  return [
    ...(rows.length ? rows : [w.text(meta.title, SIZE.card)]),
    '#v(1.2em)',
    w.text(`المصدر: ${source}`, SIZE.card),
    w.text(`أُنشئ هذا الملف بـ«نسخة» في ${d}. الخط: أميري (رخصة SIL Open Font License).`, SIZE.card),
  ]
    .map((r) => (r.startsWith('#v(') ? r : r + END))
    .join('\n\n');
}
