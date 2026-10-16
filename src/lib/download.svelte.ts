// Making an EPUB or a PDF from the book page: starts the workers, draws covers when they ask, shows
// progress, and saves the file when it's ready. One download at a time.
//
// EPUB: the book worker downloads and reads the book and makes the file.
// PDF: the book worker writes a Typst document; the PDF worker (fetched once, then kept) lays it out.

import type { Book } from './catalog/types.ts';
import { drawCover } from './epub/cover.ts';
import { epubMeta } from './epub/meta.ts';
import { BOOK_CACHE, bookUrl, type Choice, type Format, type FromWorker, type Stage, type ToWorker } from './epub/protocol.ts';
import { ENGINE_CACHE, ENGINE_FILE, type FromPdf, type ToPdf } from './pdf/protocol.ts';
import { PAGE_SIZES } from './pdf/template.ts';
import { bindingHex } from './shelves.ts';
import type { Volume } from './turath/volumes.ts';

class Download {
  /** The book being made, or the last one made. */
  bookId: number | undefined = $state();
  format: Format | undefined = $state.raw();
  stage: Stage | 'done' | 'error' | undefined = $state();
  fraction = $state(0);
  /** Fetching the PDF engine (the first PDF only). */
  engine = $state(false);
  /** Network trouble (worth trying again) or a book we couldn't read. */
  network = $state(false);
  /** The saved file, kept so it can be saved again. */
  file: { name: string; url: string } | undefined = $state.raw();
  /** Volumes read from the downloaded book, for books with no stored list. */
  volumes: { bookId: number; list: Volume[] } | undefined = $state.raw();

  get busy() {
    return this.stage === 'download' || this.stage === 'process' || this.stage === 'build';
  }
}

export const download = new Download();

let worker: Worker | undefined;
let pdfWorker: Worker | undefined;
let job = 0;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./epub/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
  worker.onerror = () => {
    fail(false);
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

function getPdfWorker(): Worker {
  if (pdfWorker) return pdfWorker;
  pdfWorker = new Worker(new URL('./pdf/worker.ts', import.meta.url), { type: 'module' });
  pdfWorker.onmessage = (e: MessageEvent<FromPdf>) => onPdfMessage(e.data);
  pdfWorker.onerror = () => {
    // Most likely out of memory: the book is too big for a PDF on this device.
    fail(false);
    endPdfWorker();
  };
  const msg: ToPdf = {
    type: 'warm',
    engineUrl: new URL(ENGINE_FILE, document.baseURI).href,
    fontUrl: new URL('fonts/Amiri-Regular.ttf', document.baseURI).href,
  };
  pdfWorker.postMessage(msg);
  return pdfWorker;
}

/** The PDF worker's memory (gigabytes for a big volume) goes back after each PDF. */
function endPdfWorker() {
  pdfWorker?.terminate();
  pdfWorker = undefined;
  stopTicking();
}

let current: Book | undefined;
/** The PDF engine is ready; the PDF document is waiting for it. */
let engineReady = false;
let waiting = false;

async function onMessage(m: FromWorker) {
  if (m.type === 'cover') {
    const book = current;
    const bytes = book ? await drawCover(epubMeta(book), m.volNote, bindingHex(book.category)).catch(() => undefined) : undefined;
    const msg: ToWorker = { type: 'cover', key: m.key, bytes };
    worker?.postMessage(msg, bytes ? [bytes.buffer] : []);
    return;
  }
  if (m.job !== job) return; // a cancelled job
  if (m.type === 'progress') {
    download.stage = m.stage;
    download.fraction = m.fraction;
  } else if (m.type === 'volumes') {
    download.volumes = { bookId: m.bookId, list: m.volumes };
  } else if (m.type === 'done') {
    finish(m.name, m.bytes, m.mime);
  } else if (m.type === 'doc') {
    const book = current;
    const format = download.format;
    if (!book || format?.kind !== 'pdf' || !pdfWorker) return;
    const spec = PAGE_SIZES[format.size];
    const cover = await drawCover(epubMeta(book), m.volNote, bindingHex(book.category), spec.height / spec.width).catch(() => undefined);
    if (m.job !== job || !pdfWorker) return;
    const msg: ToPdf = { type: 'render', job: m.job, doc: m.doc, size: format.size, cover, name: m.name };
    pdfWorker.postMessage(msg, cover ? [cover.buffer] : []);
    // Typst says nothing until it is done; the bar moves on a guess from the number of words.
    waiting = !engineReady;
    if (waiting) {
      download.stage = 'download';
      download.engine = true;
    } else tick(m.doc.words.length);
    expected = m.doc.words.length;
  } else if (m.type === 'listed') {
    download.stage = undefined;
  } else if (m.type === 'error') {
    console.error('Book:', m.message);
    fail(m.network);
  }
}

let expected = 0;

function onPdfMessage(m: FromPdf) {
  if (m.type === 'engine') {
    if (m.fraction >= 1) engineReady = true;
    if (waiting) {
      download.fraction = m.fraction;
      if (engineReady) {
        waiting = false;
        download.engine = false;
        tick(expected);
      }
    }
    return;
  }
  if (m.job !== job) return;
  if (m.type === 'stage') {
    if (m.stage === 'text') download.fraction = Math.max(download.fraction, 0.95);
  } else if (m.type === 'done') {
    finish(m.name, m.bytes, 'application/pdf');
    endPdfWorker();
  } else if (m.type === 'error') {
    console.error('PDF:', m.message);
    fail(m.network);
    endPdfWorker();
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/** The «إنشاء» bar for a PDF: about 8,000 words a second on a laptop, slower on a phone; never full until done. */
function tick(words: number) {
  stopTicking();
  download.stage = 'build';
  download.fraction = 0;
  const tau = Math.max(2, words / 8000);
  const t0 = performance.now();
  timer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    download.fraction = Math.max(download.fraction, 0.94 * (1 - Math.exp(-t / tau)));
  }, 200);
}

function stopTicking() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

function finish(name: string, bytes: Uint8Array, mime: string) {
  stopTicking();
  if (download.file) URL.revokeObjectURL(download.file.url);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  download.file = { name, url };
  download.stage = 'done';
  save(url, name);
}

function fail(network: boolean) {
  stopTicking();
  download.stage = 'error';
  download.network = network;
  download.engine = false;
}

export function save(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

export function start(book: Book, choice: Choice, format: Format = { kind: 'epub' }) {
  current = book;
  job++;
  stopTicking();
  if (download.file) URL.revokeObjectURL(download.file.url);
  Object.assign(download, { bookId: book.id, format, stage: 'download', fraction: 0, network: false, file: undefined, engine: false });
  if (format.kind === 'pdf' && choice.kind !== 'list') {
    if (!pdfWorker) engineReady = false;
    getPdfWorker(); // fetches the engine while the book downloads
  }
  const msg: ToWorker = {
    type: 'make',
    job,
    bookId: book.id,
    url: bookUrl(book.id),
    size: book.size,
    fontUrl: new URL('fonts/Amiri-Regular.ttf', document.baseURI).href,
    meta: epubMeta(book),
    choice,
    format,
    fileBase: book.title.replace(/[\\/:*?"<>|]+/g, '-'),
  };
  getWorker().postMessage(msg);
}

/** Stops the workers; the next download starts fresh ones (the book stays in the browser's cache). */
export function cancel() {
  job++;
  worker?.terminate();
  worker = undefined;
  endPdfWorker();
  download.stage = undefined;
  download.engine = false;
}

/** Whether the book file is already kept in this browser. */
export async function isKept(id: number): Promise<boolean> {
  try {
    const cache = await caches.open(BOOK_CACHE);
    return (await cache.match(bookUrl(id))) !== undefined;
  } catch {
    return false;
  }
}

/** Whether the PDF engine is already kept in this browser. */
export async function isEngineKept(): Promise<boolean> {
  try {
    const cache = await caches.open(ENGINE_CACHE);
    return (await cache.match(new URL(ENGINE_FILE, document.baseURI).href)) !== undefined;
  } catch {
    return false;
  }
}
