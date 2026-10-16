// Just enough of the PDF format to rewrite the files Typst makes: read every object through the
// cross-reference table, change dictionaries and streams, drop what nothing points to any more, and
// write the file again (compact, with a fresh cross-reference table).
//
// Not a general PDF reader: it expects what Typst writes (a classic xref table, plain dictionaries,
// streams with a direct /Length).

import { zlibSync } from 'fflate';

export interface PdfObject {
  /** Everything between «N 0 obj» and «stream»/«endobj»: a dictionary, array, number… */
  body: string;
  /** Raw stream bytes (as stored, usually Flate-compressed). */
  stream?: Uint8Array;
}

export interface Pdf {
  objects: Map<number, PdfObject>;
  /** The trailer dictionary, without «trailer». */
  trailer: string;
}

export class PdfFormatError extends Error {}

const latin1 = new TextDecoder('latin1');
const ascii = (s: string) => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
};

export function readPdf(bytes: Uint8Array): Pdf {
  const tail = latin1.decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  const sx = tail.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  if (!sx) throw new PdfFormatError('no startxref');
  const xrefAt = Number(sx[1]);
  const rest = latin1.decode(bytes.subarray(xrefAt));
  if (!rest.startsWith('xref')) throw new PdfFormatError('not a classic xref table');
  const trailerAt = rest.indexOf('trailer');
  const table = rest.slice(4, trailerAt);
  const trailer = rest.slice(trailerAt + 7, rest.indexOf('startxref')).trim();
  if (/\/Prev\b/.test(trailer)) throw new PdfFormatError('incremental updates are not supported');

  const offsets: [num: number, at: number][] = [];
  const lines = table.trim().split(/\r?\n/);
  for (let i = 0; i < lines.length; ) {
    const [start, count] = lines[i++].trim().split(/\s+/).map(Number);
    for (let k = 0; k < count; k++, i++) {
      const m = lines[i].match(/^(\d{10}) (\d{5}) ([nf])/);
      if (m && m[3] === 'n') offsets.push([start + k, Number(m[1])]);
    }
  }

  const objects = new Map<number, PdfObject>();
  for (const [n, at] of offsets) {
    // The object header and body are ASCII; read a window and look for where it ends.
    const head = latin1.decode(bytes.subarray(at, Math.min(bytes.length, at + 64)));
    const hm = head.match(/^(\d+)\s+0\s+obj\s*/);
    if (!hm || Number(hm[1]) !== n) throw new PdfFormatError(`object ${n} not at ${at}`);
    const start = at + hm[0].length;
    let end = start;
    let text = '';
    // Grow the window until «endobj» or «stream» shows up.
    for (let size = 4096; ; size *= 4) {
      text = latin1.decode(bytes.subarray(start, Math.min(bytes.length, start + size)));
      const e = findEnd(text);
      if (e) {
        end = e.at;
        if (e.stream) {
          const body = text.slice(0, end);
          const len = body.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
          if (!len) throw new PdfFormatError(`object ${n}: no direct /Length`);
          let s = start + e.streamStart;
          if (bytes[s] === 0x0d) s++;
          if (bytes[s] === 0x0a) s++;
          objects.set(n, { body: body.trim(), stream: bytes.slice(s, s + Number(len[1])) });
        } else objects.set(n, { body: text.slice(0, end).trim() });
        break;
      }
      if (start + size >= bytes.length) throw new PdfFormatError(`object ${n} has no end`);
    }
  }
  return { objects, trailer };
}

/** Where an object body ends: at «stream» (outside strings) or «endobj». */
function findEnd(s: string): { at: number; stream: boolean; streamStart: number } | undefined {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') {
      // A literal string: skip it, with its escapes and nested parentheses.
      let d = 1;
      for (i++; i < s.length && d > 0; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === '(') d++;
        else if (s[i] === ')') d--;
      }
      i--;
    } else if (c === '<' && s[i + 1] === '<') {
      depth++;
      i++;
    } else if (c === '>' && s[i + 1] === '>') {
      depth--;
      i++;
    } else if (depth === 0 && c === 's' && s.startsWith('stream', i) && !/[a-z]/i.test(s[i - 1] ?? ' ')) {
      return { at: i, stream: true, streamStart: i + 6 };
    } else if (depth === 0 && c === 'e' && s.startsWith('endobj', i)) {
      return { at: i, stream: false, streamStart: 0 };
    }
  }
  return undefined;
}

/** Object numbers this text refers to («12 0 R»), strings skipped. */
export function refsIn(body: string): number[] {
  const out: number[] = [];
  for (const m of stripStrings(body).matchAll(/(\d+)\s+0\s+R\b/g)) out.push(Number(m[1]));
  return out;
}

function stripStrings(s: string): string {
  return s.replace(/\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)/g, '()').replace(/<[0-9A-Fa-f\s]*>/g, '<>');
}

/** Whitespace squeezed out of a dictionary or array (outside strings). */
export function compact(body: string): string {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '(') {
      let d = 1;
      let j = i + 1;
      for (; j < body.length && d > 0; j++) {
        if (body[j] === '\\') j++;
        else if (body[j] === '(') d++;
        else if (body[j] === ')') d--;
      }
      out += body.slice(i, j);
      i = j;
    } else if (/\s/.test(c)) {
      let j = i;
      while (j < body.length && /\s/.test(body[j])) j++;
      const prev = out.at(-1) ?? '';
      const next = body[j] ?? '';
      // A space is needed only between two things that would otherwise run together.
      if (prev && next && !/[[\]<>()/{}]/.test(next) && !/[[\]<>(){}]/.test(prev)) out += ' ';
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Keeps only the objects reachable from the trailer. */
export function collectGarbage(pdf: Pdf): void {
  const keep = new Set<number>();
  const todo = refsIn(pdf.trailer);
  while (todo.length) {
    const n = todo.pop()!;
    if (keep.has(n)) continue;
    const o = pdf.objects.get(n);
    if (!o) continue;
    keep.add(n);
    todo.push(...refsIn(o.body));
  }
  for (const n of [...pdf.objects.keys()]) if (!keep.has(n)) pdf.objects.delete(n);
}

const nextNumber = new WeakMap<Pdf, number>();

/** Adds an object under a new number. */
export function addObject(pdf: Pdf, obj: PdfObject): number {
  let n = nextNumber.get(pdf);
  if (n === undefined) {
    n = 1;
    for (const k of pdf.objects.keys()) n = Math.max(n, k + 1);
  }
  pdf.objects.set(n, obj);
  nextNumber.set(pdf, n + 1);
  return n;
}

/** A Flate stream object from bytes or text, with extra dictionary entries. */
export function streamObject(data: Uint8Array | string, dict = ''): PdfObject {
  const raw = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const z = zlibSync(raw, { level: 9 });
  return { body: `<<${dict}/Length ${z.length}/Filter/FlateDecode>>`, stream: z };
}

/**
 * The file, written compactly: dictionaries and arrays packed into compressed object streams (most
 * of them are the links of the notes and of «الفهرس»), with a cross-reference stream (PDF 1.5).
 */
export function writePdf(pdf: Pdf): Uint8Array {
  const nums = [...pdf.objects.keys()].sort((a, b) => a - b);
  const chunks: Uint8Array[] = [];
  let at = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    at += b.length;
  };
  push(ascii('%PDF-1.7\n%\x80\x80\x80\x80\n'));

  // Where each object is: [1, offset] in the file, or [2, stream, index] in an object stream.
  const where = new Map<number, [1, number] | [2, number, number]>();
  const writeStream = (n: number, dict: string, data: Uint8Array) => {
    where.set(n, [1, at]);
    push(ascii(`${n} 0 obj\n${dict}\nstream\n`));
    push(data);
    push(ascii('\nendstream\nendobj\n'));
  };
  let next = (nums.at(-1) ?? 0) + 1;

  const plain: number[] = [];
  for (const n of nums) {
    const o = pdf.objects.get(n)!;
    if (o.stream) writeStream(n, compact(o.body).replace(/\/Length\s+\d+/, `/Length ${o.stream.length}`), o.stream);
    else plain.push(n);
  }
  for (let i = 0; i < plain.length; i += 200) {
    const group = plain.slice(i, i + 200);
    const bodies = group.map((n) => compact(pdf.objects.get(n)!.body));
    let offset = 0;
    const index = group.map((n, k) => {
      const entry = `${n} ${offset}`;
      offset += bodies[k].length + 1;
      return entry;
    });
    const head = `${index.join(' ')}\n`;
    const data = zlibSync(utf8(head + bodies.join('\n') + '\n'), { level: 9 });
    const sn = next++;
    group.forEach((n, k) => where.set(n, [2, sn, k]));
    writeStream(sn, `<</Type/ObjStm/N ${group.length}/First ${utf8(head).length}/Length ${data.length}/Filter/FlateDecode>>`, data);
  }

  // The cross-reference stream: 1 byte type, 4 bytes offset or stream number, 2 bytes index.
  const xn = next++;
  const size = next;
  const rows = new Uint8Array(size * 7);
  where.set(xn, [1, at]);
  for (let n = 0; n < size; n++) {
    const w = where.get(n);
    const r = n * 7;
    if (!w) {
      rows.set([0, 0, 0, 0, 0, 0xff, 0xff], r);
      continue;
    }
    rows[r] = w[0];
    new DataView(rows.buffer).setUint32(r + 1, w[1]);
    if (w[0] === 2) new DataView(rows.buffer).setUint16(r + 5, w[2]);
  }
  const data = zlibSync(rows, { level: 9 });
  const keep = ['Root', 'Info', 'ID'].map((k) => {
    const v = getKey(pdf.trailer, k);
    return v ? `/${k} ${v}` : '';
  });
  const xrefAt = at;
  push(ascii(`${xn} 0 obj\n<</Type/XRef/Size ${size}/W[1 4 2]${compact(keep.join(''))}/Length ${data.length}/Filter/FlateDecode>>\nstream\n`));
  push(data);
  push(ascii(`\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`));

  const out = new Uint8Array(at);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** A dictionary entry's raw value: «/Font << … >>» → «<< … >>», «/Contents 12 0 R» → «12 0 R». */
export function getKey(body: string, key: string): string | undefined {
  const at = keyAt(body, key);
  if (at < 0) return undefined;
  const [s, e] = valueSpan(body, at + key.length + 1);
  return body.slice(s, e);
}

/** Sets (or adds) a top-level dictionary entry. */
export function setKey(body: string, key: string, value: string): string {
  const at = keyAt(body, key);
  if (at < 0) {
    const end = body.lastIndexOf('>>');
    return `${body.slice(0, end)}/${key} ${value}${body.slice(end)}`;
  }
  const [s, e] = valueSpan(body, at + key.length + 1);
  return `${body.slice(0, s)}${value}${body.slice(e)}`;
}

export function removeKey(body: string, key: string): string {
  const at = keyAt(body, key);
  if (at < 0) return body;
  const [, e] = valueSpan(body, at + key.length + 1);
  return body.slice(0, at) + body.slice(e);
}

/** Position of «/key» at the top level of the outermost dictionary, or -1. */
function keyAt(body: string, key: string): number {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(') {
      let d = 1;
      for (i++; i < body.length && d > 0; i++) {
        if (body[i] === '\\') i++;
        else if (body[i] === '(') d++;
        else if (body[i] === ')') d--;
      }
      i--;
    } else if (c === '<' && body[i + 1] === '<') {
      depth++;
      i++;
    } else if (c === '>' && body[i + 1] === '>') {
      depth--;
      i++;
    } else if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === '/' && depth === 1 && body.startsWith(key, i + 1) && !/[A-Za-z0-9]/.test(body[i + 1 + key.length] ?? ' ')) {
      return i;
    }
  }
  return -1;
}

/** The span of the value that starts at or after `i`. */
function valueSpan(body: string, i: number): [number, number] {
  while (/\s/.test(body[i])) i++;
  const s = i;
  const c = body[i];
  if (c === '<' && body[i + 1] === '<') {
    let d = 0;
    for (; i < body.length; i++) {
      if (body[i] === '(') {
        let p = 1;
        for (i++; p > 0; i++) {
          if (body[i] === '\\') i++;
          else if (body[i] === '(') p++;
          else if (body[i] === ')') p--;
        }
        i--;
      } else if (body[i] === '<' && body[i + 1] === '<') {
        d++;
        i++;
      } else if (body[i] === '>' && body[i + 1] === '>') {
        d--;
        i++;
        if (d === 0) return [s, i + 1];
      }
    }
  }
  if (c === '[') {
    let d = 0;
    for (; i < body.length; i++) {
      if (body[i] === '[') d++;
      else if (body[i] === ']' && --d === 0) return [s, i + 1];
    }
  }
  if (c === '(') {
    let d = 0;
    for (; i < body.length; i++) {
      if (body[i] === '\\') i++;
      else if (body[i] === '(') d++;
      else if (body[i] === ')' && --d === 0) return [s, i + 1];
    }
  }
  const ref = body.slice(i).match(/^\d+\s+\d+\s+R/);
  if (ref) return [s, i + ref[0].length];
  const tok = body.slice(i).match(/^(\/[^\s/<>[\]()]+|<[^<][^>]*>|[^\s/<>[\]()]+)/);
  return [s, i + (tok ? tok[0].length : 0)];
}
