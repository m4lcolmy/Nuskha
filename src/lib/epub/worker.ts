// The EPUB worker: download the book (or take it from the browser's cache), read it, build the EPUB.
// Runs off the main thread so the page never freezes. The last book read stays in memory, so a
// second volume of the same book is made at once.

import { buildTypst } from '../pdf/build.ts';
import { COVER_PATH } from '../pdf/protocol.ts';
import { parseBook, type TurathBook } from '../turath/book.ts';
import { volLong, volumesOf, type Volume } from '../turath/volumes.ts';
import { buildEpub } from './build.ts';
import { BOOK_CACHE, BOOKS_KEPT, type FromWorker, type ToWorker } from './protocol.ts';

// The project's types are for the page (DOM); this is all the worker needs of its own scope.
const scope = self as unknown as {
  postMessage(m: FromWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

let loaded: { bookId: number; book: TurathBook; volumes: Volume[] } | undefined;
let font: Promise<Uint8Array | undefined> | undefined;
const covers = new Map<number, (bytes: Uint8Array | undefined) => void>();
let coverKey = 0;

const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'cover') {
    covers.get(m.key)?.(m.bytes);
    covers.delete(m.key);
  } else if (m.type === 'make') {
    make(m).catch((err: unknown) => {
      const network = err instanceof TypeError || (err instanceof Error && /^HTTP /.test(err.message));
      post({ type: 'error', job: m.job, message: err instanceof Error ? err.message : String(err), network });
    });
  }
};

async function make(m: Extract<ToWorker, { type: 'make' }>) {
  const progress = (stage: 'download' | 'process' | 'build', fraction: number) =>
    post({ type: 'progress', job: m.job, stage, fraction });

  if (loaded?.bookId !== m.bookId) {
    loaded = undefined;
    progress('download', 0);
    const text = await fetchBook(m.url, m.size, (f) => progress('download', f));
    progress('process', 0);
    const book = parseBook(JSON.parse(text));
    const volumes = volumesOf(
      book.pages.map((p) => p.vol),
      book.headings,
    );
    loaded = { bookId: m.bookId, book, volumes };
  }
  const { book, volumes } = loaded;
  post({ type: 'volumes', job: m.job, bookId: m.bookId, volumes });
  if (m.choice.kind === 'list') {
    post({ type: 'listed', job: m.job });
    return;
  }

  // The chosen volume, or the whole book (also if the book has no volume of that name).
  const choice = m.choice;
  const i = choice.kind === 'volume' ? volumes.findIndex((v) => v.name === choice.name) : -1;
  const [from, to] = i >= 0 ? [i, i] : [0, volumes.length - 1];
  const base = i >= 0 ? volumeFile(m.fileBase, volumes, i) : m.fileBase;
  const volNote = i >= 0 ? volLong(volumes[i].name) : '';

  if (m.format.kind === 'pdf') {
    const size = m.format.size;
    const doc = buildTypst({ book, meta: m.meta, volumes, from, to, size, cover: COVER_PATH, onProgress: (f) => progress('process', f) });
    const name = `${base}${size === '17x24' ? ' - 17×24' : ''}.pdf`;
    post({ type: 'doc', job: m.job, name, doc, volNote });
    return;
  }
  font ??= fetch(m.fontUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : undefined))
    .then((b) => (b ? new Uint8Array(b) : undefined))
    .catch(() => undefined);
  const fontBytes = await font;
  const cover = await askCover(volNote);
  const bytes = buildEpub({
    book,
    meta: m.meta,
    volumes,
    from,
    to,
    font: fontBytes,
    cover,
    onProgress: (f) => progress(f < 1 ? 'process' : 'build', f),
  });
  const name = `${base}.epub`;
  post({ type: 'done', job: m.job, name, bytes, mime: 'application/epub+zip' }, [bytes.buffer]);
}

/** «سير أعلام النبلاء - ط الحديث - ج03»; ASCII digits so files sort in order. */
function volumeFile(base: string, volumes: Volume[], i: number): string {
  const name = volumes[i].name;
  const part = /^\d+$/.test(name) ? `ج${name.padStart(Math.max(2, String(volumes.length).length), '0')}` : name;
  return `${base} - ${part}`.replace(/[\\/:*?"<>|]+/g, '-');
}

function askCover(volNote: string): Promise<Uint8Array | undefined> {
  const key = ++coverKey;
  return new Promise((resolve) => {
    covers.set(key, resolve);
    post({ type: 'cover', key, volNote });
  });
}

/** The book file as text: from the browser's cache, or downloaded (and then kept). */
async function fetchBook(url: string, size: number, onProgress: (f: number) => void): Promise<string> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(BOOK_CACHE);
    const hit = await cache.match(url);
    if (hit) return await hit.text();
  } catch {
    cache = undefined; // no Cache API (private mode, http): download every time
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const now = performance.now();
    if (now - last > 100) {
      onProgress(Math.min(0.99, received / Math.max(size, 1)));
      last = now;
    }
  }
  onProgress(1);
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  chunks.length = 0;

  if (cache) {
    try {
      await cache.put(url, new Response(bytes, { headers: { 'content-type': 'application/json' } }));
      const keys = await cache.keys();
      for (const old of keys.slice(0, Math.max(0, keys.length - BOOKS_KEPT))) await cache.delete(old);
    } catch {
      // Storage full: the book just isn't kept.
    }
  }
  return new TextDecoder().decode(bytes);
}
