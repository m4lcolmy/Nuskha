// Messages between the book page and the PDF worker.

import type { TypstDoc } from './build.ts';
import type { PageSize } from './template.ts';

export type PdfStage = 'engine' | 'layout' | 'again' | 'text';

export type ToPdf =
  /** Start fetching the engine (while the book downloads). */
  | { type: 'warm'; engineUrl: string; fontUrl: string }
  | { type: 'render'; job: number; doc: TypstDoc; size: PageSize; cover: Uint8Array | undefined; name: string };

export type FromPdf =
  | { type: 'engine'; fraction: number }
  | { type: 'stage'; job: number; stage: PdfStage }
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

/** More book pages than this make no PDF in the browser: a phone runs out of memory. */
export const PDF_MAX_PAGES = 1000;
