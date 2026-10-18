// The hidden text layer: what PDF viewers copy and search, written over the printed words.
//
// Viewers rebuild text from the positions of the glyphs, and with Amiri's vowel marks they get it
// wrong: Typst draws every letter that carries a mark as a separate piece at its own height, so
// viewers split words into lines and put the marks back in the wrong order («قَالَ» → «قَلاَ»).
// So the printed glyphs are made to read as spaces, and every word is written again, invisibly
// (text render mode 3), in a font whose codes are Unicode code points, at the place Typst reported
// for the word's marker. Scanned books with OCR work the same way.
//
// How pdf.js (Firefox, Android) and PDFium (Chrome, Edge) read text decides the details: each line
// is one run, left to right, its letters in visual order, the words touching, with real spaces
// between them. tests/pdf.test.ts measures both.
//
// Also: the tagged-PDF structure goes (it pointed at the printed glyphs, which no longer read as
// text), and the file is written compactly.

import { unzlibSync } from 'fflate';
import type { Word } from './build.ts';
import { addObject, getKey, pageList, refsIn, removeKey, rootOf, setKey, streamObject, type Pdf } from './pdffile.ts';
import type { Mark } from './typst.ts';

export interface LayerInput {
  /** Pages numbered in the whole file. */
  marks: Mark[];
  words: Word[];
  /** Body text size, pt. */
  size: number;
  /** Top margin, pt: marks above it are in the running head. */
  top: number;
  /** Head and «الفهرس» sizes, em, for words shown again there. */
  headSize: number;
  /** Advance width of a character, in em (from the font); for the width of each word. */
  advance: (cp: number) => number;
}

const FONT = 'fN';

/** Adds the hidden text layer to a PDF Typst made (read with readPdf or joinPdfs). */
export function addTextLayer(pdf: Pdf, input: LayerInput): void {
  const catalog = pdf.objects.get(rootOf(pdf));
  if (!catalog) throw new Error('no catalog');
  catalog.body = removeKey(removeKey(catalog.body, 'StructTreeRoot'), 'MarkInfo');

  const pages = pageList(pdf, refsIn(getKey(catalog.body, 'Pages') ?? '')[0]);

  // Typst's fonts read as nothing; struct links go.
  for (const o of pdf.objects.values()) {
    if (/\/Subtype\s*\/Type0/.test(o.body) && !o.body.includes(`/BaseFont/${FONT}`)) {
      const tu = refsIn(getKey(o.body, 'ToUnicode') ?? '')[0];
      if (tu !== undefined) pdf.objects.set(tu, streamObject(silentCmap(pdf.objects.get(tu)?.stream)));
    }
    if (/\/Type\s*\/Annot\b/.test(o.body)) o.body = removeKey(o.body, 'StructParent');
  }

  const font = hiddenFont(pdf);

  // Marks by page, in reading order.
  const byPage = new Map<number, Mark[]>();
  for (const m of input.marks) {
    const list = byPage.get(m[1]) ?? [];
    list.push(m);
    byPage.set(m[1], list);
  }

  const seen = new Set<number>();
  pages.forEach((pageNum, i) => {
    const page = pdf.objects.get(pageNum)!;
    page.body = removeKey(page.body, 'StructParents');
    for (const ref of refsIn(getKey(page.body, 'Contents') ?? '')) tidyContent(pdf, ref);
    const marks = byPage.get(i + 1);
    if (!marks?.length) return;
    const box = (getKey(page.body, 'MediaBox') ?? '').match(/[-\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    const content = pageText(marks, input, box[3], seen);
    if (!content) return;
    const ref = addObject(pdf, streamObject(content));
    const contents = getKey(page.body, 'Contents');
    page.body = setKey(page.body, 'Contents', contents ? `[${contents.replace(/^\[|\]$/g, '')} ${ref} 0 R]` : `${ref} 0 R`);
    page.body = addFont(pdf, page.body, font);
  });
}

/**
 * Typst's page content, tidied: its marked content goes (the tags pointed into the structure tree,
 * which is gone; and some carry ActualText, which PDFium would read instead of the hidden text), and
 * numbers keep two decimals instead of eight (a hundredth of a point; four below 10).
 */
const short = (n: number) => String(Math.abs(n) >= 10 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000);

function tidyContent(pdf: Pdf, ref: number): void {
  const o = pdf.objects.get(ref);
  if (!o?.stream) return;
  const compressed = /\/FlateDecode/.test(o.body);
  const text = latin1.decode(compressed ? unzlibSync(o.stream) : o.stream);
  // Strings first, so nothing inside a string (glyph codes) is touched.
  const out = text.replace(
    /(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f]*>(?!>))|\/[A-Za-z]+\s*(?:<<(?:[^<>]|<[0-9A-Fa-f]*>|\((?:\\.|[^\\()])*\))*>>|\/[A-Za-z]+)\s*BDC\b|\/[A-Za-z]+\s+BMC\b|\bEMC\b|(-?\d+\.\d{3,})/g,
    (m, str: string | undefined, num: string | undefined) => (str ? m : num ? short(Number(num)) : ''),
  );
  pdf.objects.set(ref, streamObject(bytesOf(out), pdfDictExtra(o.body)));
}

const latin1 = new TextDecoder('latin1');
const bytesOf = (s: string) => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
};
/** A stream's dictionary entries other than its length and filter. */
const pdfDictExtra = (body: string) => removeKey(removeKey(body, 'Length'), 'Filter').replace(/^<<|>>$/g, '');

function addFont(pdf: Pdf, page: string, font: number): string {
  const res = getKey(page, 'Resources');
  if (res && /^\d+\s+0\s+R$/.test(res)) {
    const o = pdf.objects.get(refsIn(res)[0])!;
    o.body = withFont(o.body, font);
    return page;
  }
  return setKey(page, 'Resources', withFont(res ?? '<<>>', font));
}

function withFont(resources: string, font: number): string {
  const fonts = getKey(resources, 'Font');
  return setKey(resources, 'Font', setKey(fonts ?? '<<>>', FONT, `${font} 0 R`));
}

// --- the words -------------------------------------------------------------------------------------

interface Placed {
  /** Characters in visual order (left to right). */
  glyphs: string[];
  /** Left edge, baseline (PDF coordinates), width, size, pt. */
  x: number;
  y: number;
  width: number;
  size: number;
  /** A space before it in reading order (on its right). */
  sp: boolean;
  /** Reading order. */
  seq: number;
}

/**
 * The page's words, a line at a time, each line drawn left to right with its letters in visual order
 * and real spaces between the words, as PDF viewers expect Arabic to be: they read that back into
 * reading order themselves.
 */
function pageText(marks: Mark[], input: LayerInput, height: number, seen: Set<number>): string {
  const placed: Placed[] = [];
  for (let k = 0; k < marks.length; k++) {
    const [value, , x, y] = marks[k];
    let text: string;
    let em: number;
    let sp = true;
    if (Array.isArray(value)) [text, em] = value;
    else {
      const w = input.words[value];
      if (!w) continue;
      text = w.t;
      em = w.s;
      sp = w.sp;
      // A word shown again (a heading in the running head or «الفهرس»).
      if (seen.has(value)) em = y < input.top ? input.headSize : 1;
      seen.add(value);
    }
    const chars = [...text].filter((c) => c.codePointAt(0)! <= 0xffff);
    if (!chars.length) continue;
    const fs = em * input.size;
    // Width: from the font, but never past the word before it on the line (on its right).
    const prev = marks[k - 1];
    let width = chars.reduce((n, c) => n + input.advance(c.codePointAt(0)!), 0) * fs;
    if (prev && Math.abs(prev[3] - y) < fs * 0.5 && prev[2] > x) width = Math.min(width, prev[2] - x - fs * 0.1);
    width = Math.max(width, fs * 0.3);
    placed.push({ glyphs: visual(chars), x, y: height - y, width, size: fs, sp, seq: k });
  }

  // Lines: words on one baseline, from the top of the page down (Typst lists a note's words just
  // after its marker; a reader selects the notes after the text).
  const lines: Placed[][] = [];
  for (const p of placed) {
    const line = lines.find((l) => Math.abs(l[0].y - p.y) < Math.min(l[0].size, p.size) * 0.3);
    if (line) line.push(p);
    else lines.push([p]);
  }
  lines.sort((a, b) => b[0].y - a[0].y);
  const ops: string[] = ['q', 'BT', '3 Tr'];
  lines.forEach((line) => {
    line.sort((a, b) => a.x - b.x);
    // One size for the whole line, and every word running up to the one on its right: then the
    // line stays one piece of text, which viewers read back in the right order.
    const fs = Math.max(...line.map((p) => p.size));
    ops.push(`/${FONT} ${round(fs)} Tf`);
    // A NUL glyph opens the line. pdf.js places a vowel mark by the glyph before it, so a mark that
    // started the line would land on the line before; the viewer drops NULs when copying and
    // searching, and PDFium skips them.
    // Positions: the line's start once, then each piece relative to the one before (Td).
    const first = line[0];
    let lastX = Number(round(first.x - fs * 0.05));
    let lastTz = 10;
    ops.push(`10 Tz 1 0 0 1 ${lastX} ${round(first.y)} Tm <0000> Tj`);
    const piece = (x: number, width: number, glyphs: number, codes: string) => {
      const tz = Math.max(1, Math.round((100 * width) / (glyphs * 0.5 * fs)));
      const dx = round(x - lastX);
      ops.push(`${tz === lastTz ? '' : `${tz} Tz `}${dx} 0 Td <${codes}> Tj`);
      lastX += Number(dx); // as written, so rounding never adds up
      lastTz = tz;
    };
    for (let i = 0; i < line.length; i++) {
      const p = line[i];
      const left = line[i - 1];
      const right = line[i + 1];
      // A space glyph just before the word (on its left) when reading order has one between them.
      if (left && spaceBetween(left, p)) {
        const g = gapBefore(p) * fs;
        piece(p.x - g, g, 1, '0020');
      }
      const w = right ? Math.max(fs * 0.2, right.x - p.x - (spaceBetween(p, right) ? gapBefore(right) : 0) * fs) : p.width;
      piece(p.x, w, Math.max(1, p.glyphs.filter((c) => !ZERO_WIDTH.test(c)).length), hex(p.glyphs));
    }
  });
  ops.push('ET', 'Q');
  return lines.length ? ops.join('\n') : '';
}

/** Reading order puts a space between these two neighbours (a on the left): before the one read second. */
const spaceBetween = (a: Placed, b: Placed) => (b.seq < a.seq ? a.sp : b.sp);

/**
 * The gap left before a word for the space glyph, in em. pdf.js reads a space glyph followed by a gap
 * under 0.1 em as the end of a piece of text, and splits the line there; with 0.1–0.6 em it adds a
 * space and goes on. But when the word starts (on its left) with a vowel mark, that space would go
 * after the mark, tearing it off its letter; there a gap under 0.1 em keeps the line whole.
 */
const gapBefore = (p: Placed) => (ZERO_WIDTH.test(p.glyphs[0] ?? '') ? 0.05 : 0.3);

const hex = (glyphs: string[]) => glyphs.map((c) => c.codePointAt(0)!.toString(16).padStart(4, '0')).join('');

// --- visual order ---------------------------------------------------------------------------------

type Bidi = 'R' | 'L' | 'EN' | 'AN' | 'ES' | 'CS' | 'NSM' | 'ON';

function bidiClass(c: string): Bidi {
  const n = c.codePointAt(0)!;
  if (/\p{Mn}/u.test(c)) return 'NSM';
  if ((n >= 0x30 && n <= 0x39) || (n >= 0x6f0 && n <= 0x6f9)) return 'EN';
  if ((n >= 0x660 && n <= 0x669) || n === 0x66b || n === 0x66c) return 'AN';
  if (c === '+' || c === '-') return 'ES';
  if (c === ',' || c === '.' || c === '/' || c === ':' || c === '\u060c' || c === '\u00a0') return 'CS';
  if (/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(c) && /\p{L}/u.test(c)) return 'R';
  if (/\p{L}/u.test(c)) return 'L';
  return 'ON';
}

/**
 * One word, from reading order to the order it is drawn in (left to right), by the Unicode bidi
 * rules for a right-to-left paragraph, enough for book text: viewers apply the same rules to read
 * it back. Marks stay with their letters' runs; an RLM between a word-final mark and punctuation
 * keeps PDFium from moving the mark past it (pdf.js ignores the RLM).
 */
export function visual(chars: string[]): string[] {
  const cs: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    cs.push(chars[i]);
    if (/\p{Mn}/u.test(chars[i]) && chars[i + 1] && !/[\p{L}\p{Mn}\p{N}]/u.test(chars[i + 1])) cs.push('\u200f');
  }
  const t = cs.map((c) => (c === '\u200f' ? 'R' : bidiClass(c)));
  // W1: a mark takes its letter's class.
  for (let i = 0; i < t.length; i++) if (t[i] === 'NSM') t[i] = i ? t[i - 1] : 'R';
  // W2: European digits after Arabic letters are Arabic numbers.
  let strong: Bidi = 'R';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'R' || t[i] === 'L') strong = t[i];
    else if (t[i] === 'EN' && strong === 'R') t[i] = 'AN';
  }
  // W4: one separator between two numbers of the same kind joins them.
  for (let i = 1; i < t.length - 1; i++) {
    if (t[i] === 'ES' && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN';
    if (t[i] === 'CS' && t[i - 1] === t[i + 1] && (t[i - 1] === 'EN' || t[i - 1] === 'AN')) t[i] = t[i - 1];
  }
  // Levels: right to left 1, left to right and numbers 2; other marks by their neighbours (N1/N2).
  const dir = (x: Bidi) => (x === 'L' ? 'L' : x === 'R' || x === 'AN' || x === 'EN' ? 'R' : undefined);
  const levels = t.map((x) => (x === 'R' ? 1 : x === 'L' || x === 'EN' || x === 'AN' ? 2 : 0));
  for (let i = 0; i < t.length; ) {
    if (levels[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < t.length && !levels[j]) j++;
    const before = i ? dir(t[i - 1]) : 'R';
    const after = j < t.length ? dir(t[j]) : 'R';
    levels.fill(before === 'L' && after === 'L' ? 2 : 1, i, j);
    i = j;
  }
  // L2: reverse every run at level 2 or more, then the whole word.
  const out = [...cs];
  for (let i = 0; i < out.length; ) {
    if (levels[i] < 2) {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && levels[j] >= 2) j++;
    const run = out.slice(i, j).reverse();
    out.splice(i, j - i, ...run);
    i = j;
  }
  return out.reverse();
}

const round = (n: number) => String(Math.round(n * 10) / 10);

// --- fonts ---------------------------------------------------------------------------------------

/**
 * The font of the hidden text: two-byte codes that are Unicode code points, each glyph 0.5 em wide.
 * It borrows Typst's embedded Amiri file (every code shows its empty glyph 0; nothing is drawn anyway).
 */
function hiddenFont(pdf: Pdf): number {
  let file: string | undefined;
  for (const o of pdf.objects.values()) {
    if (/\/Type\s*\/FontDescriptor/.test(o.body)) file ??= getKey(o.body, 'FontFile2');
  }
  const toUnicode = addObject(pdf, streamObject(IDENTITY_CMAP));
  const gids = addObject(pdf, streamObject(new Uint8Array(0x20000)));
  const desc = addObject(pdf, {
    body: `<</Type/FontDescriptor/FontName/${FONT}/Flags 4/FontBBox[0 -300 1000 1000]/ItalicAngle 0/Ascent 1000/Descent -300/CapHeight 700/StemV 80${file ? `/FontFile2 ${file}` : ''}>>`,
  });
  const cid = addObject(pdf, {
    body: `<</Type/Font/Subtype/CIDFontType2/BaseFont/${FONT}/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>/FontDescriptor ${desc} 0 R/DW 500/W[${ZERO}]/CIDToGIDMap ${gids} 0 R>>`,
  });
  return addObject(pdf, {
    body: `<</Type/Font/Subtype/Type0/BaseFont/${FONT}/Encoding/Identity-H/DescendantFonts[${cid} 0 R]/ToUnicode ${toUnicode} 0 R>>`,
  });
}

// Vowel marks and other combining marks take no width, as in a real font; so do RLM and LRM.
const ZERO_WIDTH = /[\p{Mn}\u200e\u200f]/u;
const ZERO = [[0x0610, 0x061a], [0x064b, 0x065f], [0x0670, 0x0670], [0x06d6, 0x06dc], [0x06df, 0x06e4], [0x06e7, 0x06e8], [0x06ea, 0x06ed], [0x200e, 0x200f]]
  .map(([a, b]) => `${a} ${b} 0`)
  .join(' ');

const cmap = (name: string, body: string) => `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /${name} def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${body}endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;

// Every code reads as itself (ranges may not cross a high byte).
const IDENTITY_CMAP = (() => {
  const lines: string[] = [];
  for (let hi = 0; hi < 0x100; hi++) {
    if (hi >= 0xd8 && hi <= 0xdf) continue; // surrogates
    const h = hi.toString(16).padStart(2, '0');
    lines.push(`<${h}00> <${h}ff> <${h}00>`);
  }
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 100) {
    const part = lines.slice(i, i + 100);
    out.push(`${part.length} beginbfrange\n${part.join('\n')}\nendbfrange\n`);
  }
  return cmap('NuskhaIdentity', out.join(''));
})();

/**
 * The printed glyphs read as spaces, which both viewers drop or fold into the spacing (an empty
 * mapping makes pdf.js show the codes as Latin letters). Every code up to the highest Typst used:
 * glyphs it described only with ActualText are in no map.
 */
function silentCmap(old: Uint8Array | undefined): string {
  let text = '';
  if (old) {
    try {
      text = latin1.decode(unzlibSync(old));
    } catch {
      text = latin1.decode(old); // stored uncompressed
    }
  }
  // The codes in its maps (not the code space «<0000> <FFFF>»), and a margin for the unmapped.
  let max = 0xff;
  for (const block of text.matchAll(/begin(bfchar|bfrange)([\s\S]*?)endbf(?:char|range)/g)) {
    for (const m of block[2].matchAll(/^\s*<([0-9A-Fa-f]{4})>\s*(?:<([0-9A-Fa-f]{4})>\s*)?/gm)) {
      max = Math.max(max, parseInt(block[1] === 'bfrange' && m[2] ? m[2] : m[1], 16));
    }
  }
  max = Math.min(0xffff, max + 0x100);
  const out: string[] = [];
  for (let c = 0; c <= max; c += 100) {
    const part: string[] = [];
    for (let k = c; k < Math.min(max + 1, c + 100); k++) part.push(`<${k.toString(16).padStart(4, '0')}> <0020>`);
    out.push(`${part.length} beginbfchar\n${part.join('\n')}\nendbfchar\n`);
  }
  return cmap('NuskhaSpaces', out.join(''));
}
