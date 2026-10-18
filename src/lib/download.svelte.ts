// Making an EPUB or a PDF from the book page: starts the workers, draws covers when they ask, shows
// progress, and saves the file when it's ready. One download at a time.
//
// EPUB: the book worker downloads and reads the book and makes the file.
// PDF: the book worker writes a Typst document. Its parts (pdf/parts.ts) are laid out one by one,
// each by a fresh PDF worker (the engine is fetched once, then kept), and a last one joins them.

import type { Book } from './catalog/types.ts';
import { drawCover } from './epub/cover.ts';
import { epubMeta } from './epub/meta.ts';
import { BOOK_CACHE, bookUrl, type Choice, type Format, type FromWorker, type Stage, type ToWorker } from './epub/protocol.ts';
import { num } from './format.ts';
import type { TypstDoc } from './pdf/build.ts';
import type { PartResult } from './pdf/make.ts';
import { partDoc, planParts } from './pdf/parts.ts';
import { ENGINE_CACHE, ENGINE_FILE, type FromPdf, type ToPdf } from './pdf/protocol.ts';
import { PAGE_SIZES, type PageSize } from './pdf/template.ts';
import { bindingHex } from './shelves.ts';
import type { Volume } from './turath/volumes.ts';

class Download {
  /** The book being made, or the last one made. */
  bookId: number | undefined = $state();
  format: Format | undefined = $state.raw();
  stage: Stage | 'done' | 'error' | undefined = $state();
  fraction = $state(0);
  /** What the PDF engine is doing, for a big book: «الجزء ٢ من ٧». */
  step = $state('');
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

/** A fresh PDF worker, fetching the engine (from the browser's cache after the first time). */
function newPdfWorker(): Worker {
  endPdfWorker();
  pdfWorker = new Worker(new URL('./pdf/worker.ts', import.meta.url), { type: 'module' });
  pdfWorker.onmessage = (e: MessageEvent<FromPdf>) => onPdfMessage(e.data);
  pdfWorker.onerror = () => {
    // Most likely out of memory.
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

/** A PDF worker's memory (gigabytes for a big part) goes back when its job is done. */
function endPdfWorker() {
  pdfWorker?.terminate();
  pdfWorker = undefined;
  stopTicking();
}

let current: Book | undefined;
/** The PDF engine has been fetched; until then the bar shows its download. */
let engineReady = false;

/** A PDF being made: the parts laid out so far, and what comes next. */
let pdf:
  | {
      job: number;
      doc: TypstDoc;
      ranges: [number, number][];
      results: PartResult[];
      cover: Uint8Array | undefined;
      size: PageSize;
      name: string;
      /** The bar: words per step (each part, then the end), and the words done. */
      weights: number[];
      done: number;
      /** The step waiting for the engine. */
      waiting: boolean;
    }
  | undefined;

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
    if (!book || format?.kind !== 'pdf') return;
    const spec = PAGE_SIZES[format.size];
    const cover = await drawCover(epubMeta(book), m.volNote, bindingHex(book.category), spec.height / spec.width).catch(() => undefined);
    if (m.job !== job) return;
    const ranges = planParts(m.doc);
    const words = ranges.map(([from, to]) => m.doc.blocks.slice(from, to).reduce((n, b) => n + (b.match(/<w>/g) ?? []).length, 0));
    // The end (contents, joining, the hidden text) takes about an eighth of the time of the text.
    const total = words.reduce((a, b) => a + b, 0);
    pdf = { job: m.job, doc: m.doc, ranges, results: [], cover, size: format.size, name: m.name, weights: [...words, total / 8], done: 0, waiting: false };
    next();
  } else if (m.type === 'listed') {
    download.stage = undefined;
  } else if (m.type === 'error') {
    console.error('Book:', m.message);
    fail(m.network);
  }
}

/** The next part, or the end, in a fresh PDF worker. */
function next() {
  if (!pdf) return;
  const k = pdf.results.length;
  const n = pdf.ranges.length;
  // The worker started while the book downloaded takes the first part.
  const w = k === 0 && pdfWorker ? pdfWorker : newPdfWorker();
  let msg: ToPdf;
  if (k < n) {
    const part = partDoc(pdf.doc, pdf.ranges[k], (pdf.results.at(-1)?.lastPage ?? 0) + 1);
    msg = { type: 'part', job: pdf.job, part, cover: k === 0 ? pdf.cover : undefined };
    download.step = n > 1 ? `الجزء ${num(k + 1)} من ${num(n)}` : '';
  } else {
    const { doc, results, size, name } = pdf;
    msg = { type: 'finish', job: pdf.job, preamble: doc.preamble, headings: doc.headings, words: doc.words, parts: results, size, name };
    download.step = n > 1 ? 'الفهرس وجمع الأجزاء' : '';
  }
  w.postMessage(msg);
  pdf.waiting = !engineReady;
  if (pdf.waiting) {
    download.stage = 'download';
    download.engine = true;
    download.fraction = 0;
  } else tick();
}

function onPdfMessage(m: FromPdf) {
  if (m.type === 'engine') {
    if (m.fraction >= 1) engineReady = true;
    if (pdf?.waiting) {
      download.fraction = m.fraction;
      if (engineReady) {
        pdf.waiting = false;
        download.engine = false;
        tick();
      }
    }
    return;
  }
  if (m.job !== job || !pdf) return;
  if (m.type === 'part') {
    pdf.results.push(m.result);
    pdf.done += pdf.weights[pdf.results.length - 1];
    next();
  } else if (m.type === 'done') {
    finish(m.name, m.bytes, 'application/pdf');
    endPdfWorker();
    pdf = undefined;
  } else if (m.type === 'error') {
    console.error('PDF:', m.message);
    fail(m.network);
    endPdfWorker();
    pdf = undefined;
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * The «إنشاء» bar for a PDF. Typst says nothing until a part is done, so within a part the bar moves
 * on a guess, about 8,000 words a second on a laptop (slower on a phone), and never past the part.
 */
function tick() {
  stopTicking();
  if (!pdf) return;
  const { weights, done } = pdf;
  const w = weights[pdf.results.length] ?? 0;
  const total = weights.reduce((a, b) => a + b, 0);
  const tau = Math.max(1, w / 8000);
  const t0 = performance.now();
  download.stage = 'build';
  download.fraction = done / total;
  timer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    download.fraction = Math.max(download.fraction, (done + w * 0.95 * (1 - Math.exp(-t / tau))) / total);
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
  download.step = '';
  save(url, name);
}

function fail(network: boolean) {
  stopTicking();
  download.stage = 'error';
  download.network = network;
  download.engine = false;
  download.step = '';
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
  Object.assign(download, { bookId: book.id, format, stage: 'download', fraction: 0, network: false, file: undefined, engine: false, step: '' });
  pdf = undefined;
  if (format.kind === 'pdf' && choice.kind !== 'list') newPdfWorker(); // fetches the engine while the book downloads
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
  pdf = undefined;
  download.stage = undefined;
  download.engine = false;
  download.step = '';
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
