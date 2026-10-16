// Reads a turath book file (files.turath.io/books-v3/{id}.json).
//
// Its keys are not fixed: the meta and index objects sit under keys disguised as harakat, and the same
// field has a different key in different books (checked on 8376, 22669, 10906, 17100). So every field
// is found by its shape, never by its key.

export interface Page {
  /** Light markup: title spans, `(^١)` note markers, a `_________` or `<hr>` line before the notes. */
  text: string;
  /** Volume name: "3", or a name like «المقدمة» or «سيرة 1». */
  vol: string;
  /** Printed page number, or null for unnumbered pages. */
  page: number | null;
}

export interface Heading {
  title: string;
  level: number;
  /** Index into `pages` (0-based). */
  page: number;
}

export interface TurathBook {
  /** The bibliographic card («الكتاب: …\nالمؤلف: …»), or "". */
  info: string;
  pages: Page[];
  /** In book order. Heading n (1-based) is the `toc-n` span in the page text. */
  headings: Heading[];
}

export class BookFormatError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isHeading = (v: unknown) =>
  isObject(v) && typeof v.title === 'string' && typeof v.level === 'number' && typeof v.page === 'number';

export function parseBook(json: unknown): TurathBook {
  if (!isObject(json) || !Array.isArray(json.pages)) throw new BookFormatError('no pages array');
  const others = Object.entries(json)
    .filter(([k]) => k !== 'pages')
    .map(([, v]) => v)
    .filter(isObject);

  const pages: Page[] = json.pages.map((p, i) => {
    if (!isObject(p) || typeof p.text !== 'string') throw new BookFormatError(`page ${i + 1} has no text`);
    const n = Number(p.page);
    return { text: p.text, vol: String(p.vol ?? ''), page: p.page == null || !Number.isFinite(n) ? null : n };
  });

  // The headings: the longest array of {title, level, page} anywhere one level down.
  let raw: unknown[] = [];
  for (const o of others) {
    for (const v of Object.values(o)) {
      if (Array.isArray(v) && v.length > raw.length && v.every(isHeading)) raw = v;
    }
  }
  const last = Math.max(0, pages.length - 1);
  const headings = (raw as { title: string; level: number; page: number }[]).map((h) => ({
    title: h.title.replace(/\s+/g, ' ').trim(),
    level: Math.max(1, Math.round(h.level)),
    page: Math.min(last, Math.max(0, h.page - 1)),
  }));

  // The card: the string that reads like one.
  let info = '';
  for (const o of others) {
    for (const v of Object.values(o)) if (typeof v === 'string' && /^\s*الكتاب\s*:/.test(v)) info = v.trim();
  }

  return { info, pages, headings };
}
