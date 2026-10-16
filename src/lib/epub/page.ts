// One turath page → XHTML blocks and footnotes.
//
// Page text is light markup, one paragraph per line:
//   <span data-type="title" id="toc-12" data-level="2">heading</span>   (nested spans happen)
//   (^١) or (١) or (*)   a note marker
//   a `_________` line (or `<hr>` in some books) before the notes; notes start with the same marker.
//   A note starting with «=» continues the last note of the page before.
//   HTML entities (&quot;), honorific signs (﵀).

import { num } from '../format.ts';
import { spellHonorifics } from '../turath/honorifics.ts';

export interface Block {
  kind: 'p' | 'h' | 'hr';
  /** Inner XHTML (no enclosing tag). */
  html: string;
  /** Headings: turath level (1 = top). */
  level?: number;
  /** Headings: element id. */
  id?: string;
  /** Paragraphs: ends mid-sentence, so the next page may carry on in the same paragraph. */
  open?: boolean;
}

export interface Note {
  /** «١», «*», or "" for a continuation («=») or a note without a number. */
  label: string;
  /** One XHTML string per line of the note. */
  lines: string[];
  /** Ids of the note and of its marker in the text; refId is "" when no marker was found. */
  id: string;
  refId: string;
  /** Continues the last note of the page before. */
  cont: boolean;
}

export interface PageOut {
  blocks: Block[];
  notes: Note[];
  /** Heading numbers (toc-n) whose anchors are on this page. */
  toc: number[];
}

export interface PageContext {
  /** Unique per page in the book; used in note ids. */
  key: string;
  /** Level of heading n (1-based) from the book's index. */
  levelOf: (n: number) => number | undefined;
  /** Ids already used in this EPUB; ids are added to it. */
  usedIds: Set<string>;
}

// --- text --------------------------------------------------------------------------------------

const NAMED: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Escapes for XHTML text, and drops characters XML doesn't allow. */
export function esc(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escapes for an attribute value in double quotes. */
export const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

const toAscii = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
/** «12» or «١٢» → «١٢»; «*» stays. */
const noteLabel = (s: string) => (/^[0-9٠-٩]+$/.test(s) ? num(Number(toAscii(s))) : s);

// Placeholders for note markers while the text is escaped:  n .
const PH = /(\d+)/g;

/** Plain text → XHTML: entities, honorifics, Quran in ﴿ ﴾ set apart. Placeholders pass through. */
function textHtml(s: string): string {
  return esc(spellHonorifics(decodeEntities(s))).replace(/﴿[^﴾]*﴾/g, (q) => `<span class="q">${q}</span>`);
}

// --- tags --------------------------------------------------------------------------------------

type Tok =
  | { t: 'text'; s: string }
  | { t: 'open'; title: boolean; toc?: number; level?: number }
  | { t: 'close'; title: boolean };

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g;

function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const stack: boolean[] = []; // open spans: is it a title?
  let at = 0;
  for (const m of line.matchAll(TAG)) {
    if (m.index > at) out.push({ t: 'text', s: line.slice(at, m.index) });
    at = m.index + m[0].length;
    if (m[2].toLowerCase() !== 'span') continue; // other tags: keep their text only
    if (m[1]) {
      if (stack.length) out.push({ t: 'close', title: stack.pop()! });
      continue;
    }
    const attrs = m[3];
    const title = /data-type\s*=\s*["']?title/.test(attrs);
    const toc = attrs.match(/id\s*=\s*["']?toc-(\d+)/)?.[1];
    const level = attrs.match(/data-level\s*=\s*["']?(\d+)/)?.[1];
    stack.push(title);
    out.push({ t: 'open', title, toc: toc ? Number(toc) : undefined, level: level ? Number(level) : undefined });
  }
  if (at < line.length) out.push({ t: 'text', s: line.slice(at) });
  while (stack.length) out.push({ t: 'close', title: stack.pop()! });
  return out;
}

const visible = (s: string) => decodeEntities(s.replace(PH, '')).replace(/\s+/g, '');

// --- page --------------------------------------------------------------------------------------

/** Text outside the title span longer than this makes the line a paragraph with a heading in it. */
const HEADING_SLACK = 40;
const NOTE_START = /^\(\^?([0-9٠-٩]+|\*+)\)\s*/;

function splitNotes(text: string): [body: string, notes: string] {
  const sep = text.match(/\n?[ \t]*_{5,}[ \t]*(?:\n|$)/);
  if (sep) return [text.slice(0, sep.index), text.slice(sep.index! + sep[0].length)];
  // Some books use <hr> before the notes, others as a rule in the text.
  const hr = text.match(/(?:^|\n)[ \t]*<hr\s*\/?>[ \t]*(?:\n|$)/i);
  if (hr) {
    const after = text.slice(hr.index! + hr[0].length);
    if (/^\s*(\(|=)/.test(after)) return [text.slice(0, hr.index), after];
  }
  return [text, ''];
}

export function renderPage(text: string, ctx: PageContext): PageOut {
  text = text.replace(/[-]/g, '').replace(/\r\n?/g, '\n');
  const [bodyRaw, notesRaw] = splitNotes(text);

  // Notes
  const notes: (Note & { key: string })[] = [];
  for (const raw of notesRaw.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(NOTE_START);
    const id = () => `n${ctx.key}-${notes.length + 1}`;
    if (m) notes.push({ key: toAscii(m[1]), label: noteLabel(m[1]), lines: [line.slice(m[0].length)], id: id(), refId: '', cont: false });
    else if (!notes.length) notes.push({ key: '', label: '', lines: [line.replace(/^=\s*/, '')], id: id(), refId: '', cont: line.startsWith('=') });
    else notes.at(-1)!.lines.push(line);
  }

  // Markers in the text: «(^١)» first, then a bare «(١)» for notes still without one.
  const refs: string[] = [];
  const link = (all: string, label: string) => {
    const note = notes.find((n) => !n.refId && n.key && n.key === toAscii(label));
    if (!note) return all;
    note.refId = `r${ctx.key}-${notes.indexOf(note) + 1}`;
    refs.push(`<a epub:type="noteref" role="doc-noteref" class="nr" id="${note.refId}" href="#${note.id}">(${note.label})</a>`);
    return `${refs.length - 1}`;
  };
  let body = bodyRaw.replace(/\(\^([0-9٠-٩]+|\*+)\)/g, link);
  // Carets left over have no note on this page: show them as plain markers.
  body = body.replace(/\(\^([0-9٠-٩]+|\*+)\)/g, (_, l: string) => {
    refs.push(`<sup class="nr">(${esc(noteLabel(l))})</sup>`);
    return `${refs.length - 1}`;
  });
  if (notes.some((n) => n.key && !n.refId)) body = body.replace(/\(([0-9٠-٩]+|\*+)\)/g, link);
  const fill = (html: string) => html.replace(PH, (_, i: string) => refs[Number(i)]);

  // Body
  const blocks: Block[] = [];
  const toc: number[] = [];
  const claim = (n: number | undefined) => {
    if (n === undefined || ctx.usedIds.has(`h${n}`)) return undefined;
    ctx.usedIds.add(`h${n}`);
    toc.push(n);
    return `h${n}`;
  };

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^<hr\s*\/?>$/i.test(line)) {
      blocks.push({ kind: 'hr', html: '' });
      continue;
    }
    const toks = tokenize(line);
    let inside = '';
    let outside = '';
    let depth = 0;
    let first: Extract<Tok, { t: 'open' }> | undefined;
    for (const tk of toks) {
      if (tk.t === 'open' && tk.title) {
        first ??= tk;
        depth++;
      } else if (tk.t === 'close' && tk.title) depth--;
      else if (tk.t === 'text') {
        if (depth > 0) inside += tk.s;
        else outside += tk.s;
      }
    }

    if (first && visible(inside) && visible(outside).length <= HEADING_SLACK) {
      // A heading: anchors for every title span in it, the first one on the heading itself.
      let id: string | undefined;
      let html = '';
      for (const tk of toks) {
        if (tk.t === 'text') html += textHtml(tk.s);
        else if (tk.t === 'open' && tk.title) {
          const a = claim(tk.toc);
          if (a && !id && !html.trim()) id = a;
          else if (a) html += `<span id="${a}"></span>`;
        }
      }
      html = html.trim().replace(/[\s:]+$/, '');
      const level = (first.toc !== undefined ? ctx.levelOf(first.toc) : undefined) ?? first.level ?? 2;
      blocks.push({ kind: 'h', html: fill(html), level, id });
    } else {
      let html = '';
      for (const tk of toks) {
        if (tk.t === 'text') html += textHtml(tk.s);
        else if (tk.title && tk.t === 'open') {
          const a = claim(tk.toc);
          html += a ? `<span class="t" id="${a}">` : '<span class="t">';
        } else if (tk.title) html += '</span>';
      }
      const plain = visible(line.replace(TAG, ''));
      // Ends in a letter or comma: the sentence carries on over the page. Verse lines («…») never do.
      const open = /[\p{L}\p{M}،,]$/u.test(plain) && !line.includes('…');
      blocks.push({ kind: 'p', html: fill(html), open });
    }
  }

  const noteHtml = (s: string) => {
    let html = '';
    for (const tk of tokenize(s)) if (tk.t === 'text') html += textHtml(tk.s);
    return html;
  };
  return {
    blocks,
    notes: notes.map(({ key: _, ...n }) => ({ ...n, lines: n.lines.map(noteHtml) })),
    toc,
  };
}
