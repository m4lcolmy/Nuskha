// Making an EPUB from the book page: starts the worker, draws covers when it asks, shows progress,
// and saves the file when it's ready. One download at a time.

import type { Book } from './catalog/types.ts';
import { drawCover } from './epub/cover.ts';
import { epubMeta } from './epub/meta.ts';
import { BOOK_CACHE, bookUrl, type Choice, type FromWorker, type Stage, type ToWorker } from './epub/protocol.ts';
import { bindingHex } from './shelves.ts';
import type { Volume } from './turath/volumes.ts';

class Download {
  /** The book being made, or the last one made. */
  bookId: number | undefined = $state();
  stage: Stage | 'done' | 'error' | undefined = $state();
  fraction = $state(0);
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
let job = 0;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./epub/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
  worker.onerror = () => {
    download.stage = 'error';
    download.network = false;
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

let current: Book | undefined;

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
    if (download.file) URL.revokeObjectURL(download.file.url);
    const url = URL.createObjectURL(new Blob([m.bytes as BlobPart], { type: m.mime }));
    download.file = { name: m.name, url };
    download.stage = 'done';
    save(url, m.name);
  } else if (m.type === 'listed') {
    download.stage = undefined;
  } else if (m.type === 'error') {
    console.error('EPUB:', m.message);
    download.stage = 'error';
    download.network = m.network;
  }
}

export function save(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

export function start(book: Book, choice: Choice) {
  current = book;
  job++;
  if (download.file) URL.revokeObjectURL(download.file.url);
  Object.assign(download, { bookId: book.id, stage: 'download', fraction: 0, network: false, file: undefined });
  const msg: ToWorker = {
    type: 'make',
    job,
    bookId: book.id,
    url: bookUrl(book.id),
    size: book.size,
    fontUrl: new URL('fonts/Amiri-Regular.ttf', document.baseURI).href,
    meta: epubMeta(book),
    choice,
    fileBase: book.title.replace(/[\\/:*?"<>|]+/g, '-'),
  };
  getWorker().postMessage(msg);
}

/** Stops the worker; the next download starts a fresh one (the book stays in the browser's cache). */
export function cancel() {
  job++;
  worker?.terminate();
  worker = undefined;
  download.stage = undefined;
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
