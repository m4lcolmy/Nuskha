// Messages between the book page and a PDF worker. A worker does one job and is ended: a part of
// the book (layoutPart), or the end (finishPdf: «الفهرس», joining the parts, the hidden text).

import type { TypstDoc, Word } from './build.ts';
import type { PartResult } from './make.ts';
import type { PartDoc } from './parts.ts';
import type { PageSize } from './template.ts';

export type ToPdf =
  /** Start fetching the engine (while the book downloads). */
  | { type: 'warm'; engineUrl: string; fontUrl: string }
  | { type: 'part'; job: number; part: PartDoc; cover: Uint8Array | undefined }
  | {
      type: 'finish';
      job: number;
      preamble: string;
      headings: TypstDoc['headings'];
      words: Word[];
      parts: PartResult[];
      size: PageSize;
      name: string;
    };

export type FromPdf =
  | { type: 'engine'; fraction: number }
  /** Laying out the part again, to put notes back on their pages. */
  | { type: 'again'; job: number }
  | { type: 'part'; job: number; result: PartResult }
  | { type: 'done'; job: number; name: string; bytes: Uint8Array }
  | { type: 'error'; job: number; message: string; network: boolean };

/** Where the cover image sits in Typst's file system. */
export const COVER_PATH = '/cover.jpg';

/**
 * The Typst compiler, gzipped (see vite.config.ts); fetched once, then kept in the browser. Named
 * with the version of @myriaddreamin/typst-ts-web-compiler, so a new engine is fetched anew.
 */
export const ENGINE_FILE = 'engine/typst-ts-web-compiler-0.7.0.wasm.gz';
export const ENGINE_CACHE = 'nuskha-engine-v1';
