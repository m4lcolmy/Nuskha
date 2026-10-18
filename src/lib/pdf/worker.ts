// A PDF worker: Typst (WebAssembly) lays out one part of the book the book worker wrote, or does the
// end (finishPdf). A worker of its own, loaded only for a PDF, and one per job: the engine gives no
// memory back between runs, and Typst runs much faster away from the parsed book. The page ends it
// when its job is done.

import type { TypstCompiler } from '@myriaddreamin/typst-ts-web-compiler';
import { coverFiles, finishPdf, layoutPart } from './make.ts';
import { advances } from './metrics.ts';
import { ENGINE_CACHE, type FromPdf, type ToPdf } from './protocol.ts';
import { createCompiler } from './typst.ts';

const scope = self as unknown as {
  postMessage(m: FromPdf, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToPdf>) => void) | null;
};
const post = (m: FromPdf, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

let engine: Promise<{ compiler: TypstCompiler; font: Uint8Array }> | undefined;

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'warm') {
    engine ??= load(m.engineUrl, m.fontUrl);
    engine.catch(() => (engine = undefined));
    return;
  }
  run(m).catch((err: unknown) => {
    const network = err instanceof TypeError || (err instanceof Error && /^HTTP /.test(err.message));
    post({ type: 'error', job: m.job, message: err instanceof Error ? err.message : String(err), network });
  });
};

async function run(m: Exclude<ToPdf, { type: 'warm' }>) {
  if (!engine) throw new Error('engine not started');
  const { compiler, font } = await engine;
  if (m.type === 'part') {
    const result = layoutPart(compiler, m.part, coverFiles(m.cover), () => post({ type: 'again', job: m.job }));
    post({ type: 'part', job: m.job, result }, [result.pdf.buffer]);
  } else {
    const { pdf } = finishPdf(compiler, { ...m, advance: advances(font) });
    post({ type: 'done', job: m.job, name: m.name, bytes: pdf }, [pdf.buffer]);
  }
}

async function load(engineUrl: string, fontUrl: string) {
  const [wasm, font] = await Promise.all([
    kept(engineUrl, (f) => post({ type: 'engine', fraction: f })),
    fetch(fontUrl).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }),
  ]);
  post({ type: 'engine', fraction: 1 });
  return { compiler: await createCompiler(wasm, font), font };
}

/** The engine, unzipped: from the browser's cache, or downloaded (and then kept). */
async function kept(url: string, onProgress: (f: number) => void): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(ENGINE_CACHE);
    const hit = await cache.match(url);
    if (hit) return await unzip(hit);
  } catch {
    cache = undefined;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 11_000_000;
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(0.99, received / total));
  }
  const gz = new Blob(chunks as BlobPart[]);
  if (cache) {
    try {
      // Older versions of the engine go; this one stays.
      for (const old of await cache.keys()) if (old.url !== url) await cache.delete(old);
      await cache.put(url, new Response(gz, { headers: { 'content-type': 'application/gzip' } }));
    } catch {
      // Storage full: fetched again next time.
    }
  }
  return unzip(new Response(gz));
}

async function unzip(res: Response): Promise<Uint8Array> {
  const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
