// Messages between the book page and the book worker (which makes the EPUB, and writes the PDF's
// Typst document for the PDF worker).

import type { TypstDoc } from '../pdf/build.ts';
import type { PageSize } from '../pdf/template.ts';
import type { Volume } from '../turath/volumes.ts';
import type { EpubMeta } from './build.ts';

/** The whole book, or one volume. `list` only reads the book, to show its volumes when no list is stored. */
export type Choice = { kind: 'whole' } | { kind: 'volume'; name: string } | { kind: 'list' };

/** EPUB, or PDF in one of the two page sizes. */
export type Format = { kind: 'epub' } | { kind: 'pdf'; size: PageSize };

export type Stage = 'download' | 'process' | 'build';

export type ToWorker =
  | {
      type: 'make';
      job: number;
      bookId: number;
      url: string;
      /** Expected size of the book file, for the progress bar (the server sends it compressed). */
      size: number;
      fontUrl: string;
      meta: EpubMeta;
      choice: Choice;
      format: Format;
      /** File name without extension: «سير أعلام النبلاء - ط الحديث». */
      fileBase: string;
    }
  | { type: 'cover'; key: number; bytes: Uint8Array | undefined };

export type FromWorker =
  | { type: 'progress'; job: number; stage: Stage; fraction: number }
  | { type: 'volumes'; job: number; bookId: number; volumes: Volume[] }
  /** The worker asks the page to draw a cover (canvas and the site's fonts live there). */
  | { type: 'cover'; key: number; volNote: string }
  | { type: 'done'; job: number; name: string; bytes: Uint8Array; mime: string }
  /** The PDF's Typst document, for the PDF worker; the page draws the cover for it. */
  | { type: 'doc'; job: number; name: string; doc: TypstDoc; volNote: string }
  /** The book is read and its volumes sent (a `list` choice). */
  | { type: 'listed'; job: number }
  | { type: 'error'; job: number; message: string; network: boolean };

export const BOOK_CACHE = 'nuskha-books-v1';
/** Books kept in the browser, newest first; older ones are dropped. */
export const BOOKS_KEPT = 4;
/** Above this (book file size), the whole book is not offered as one EPUB: it would not open in readers. */
export const WHOLE_MAX_BYTES = 100 * 1024 * 1024;

export const bookUrl = (id: number) => `https://files.turath.io/books-v3/${id}.json`;
