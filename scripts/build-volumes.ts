// Builds public/data/volumes/*.json: for every book with more than one volume, each volume with a
// label from its first heading, so the book page can show the list before anything is downloaded.
//
// Reads turath's index of each book (headings and page → volume), never the book text. The indexes
// are kept in .cache/indexes and fetched again only when older than --max-age days (default 90),
// one at a time, to be gentle on turath. turath allows a few hundred requests and then asks to wait
// (HTTP 429, sometimes for most of an hour): the run then stops fetching and writes the lists it
// has, and the next run carries on where this one stopped.
//
//   node scripts/build-volumes.ts                 after `npm run catalog`
//   node scripts/build-volumes.ts --max-age 0     fetch every index again

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogFile } from '../src/lib/catalog/types.ts';
import type { Heading } from '../src/lib/turath/book.ts';
import { VOLUME_FORMAT, VOLUME_SHARDS, shardOf, toRow, type VolumeShard } from '../src/lib/turath/volume-index.ts';
import { volumesOf } from '../src/lib/turath/volumes.ts';

const API = (id: number) => `https://api.turath.io/book?id=${id}&include=indexes&ver=3`;
// turath answers HTTP 429 to a few requests in parallel: one at a time, with a pause between.
const PAUSE_MS = 1500;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, '.cache', 'indexes');
const outDir = join(root, 'public', 'data', 'volumes');

const args = process.argv.slice(2);
const ageAt = args.indexOf('--max-age');
const maxAgeDays = ageAt >= 0 ? Number(args[ageAt + 1]) : 90;
/** Set when turath asks for a long wait: from then on, only cached indexes are used. */
let blocked = false;

/** What we keep of an index: volume runs in page order, and the headings. */
interface Cached {
  vols: [name: string, pages: number][];
  heads: [title: string, level: number, page: number][];
}

const catalog = JSON.parse(readFileSync(join(root, 'public/data/catalog.json'), 'utf8')) as CatalogFile;
const b = catalog.books;
const found: [id: number, pages: number][] = [];
let id = 0;
b.idDelta.forEach((d, i) => {
  id += d;
  // Several volumes on the card, or no count on the card and long enough to have several.
  if (b.volumes[i] > 1 || (b.volumes[i] === 0 && b.pages[i] >= 800)) found.push([id, b.pages[i]]);
});
// Biggest books first: they gain most from choosing a volume, and turath may stop a run part way.
const candidates = found.sort((x, y) => y[1] - x[1]).map(([i]) => i);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function index(id: number): Promise<Cached | undefined> {
  const path = join(cacheDir, `${id}.json`);
  const cached = () => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Cached) : undefined);
  if (blocked || (existsSync(path) && (Date.now() - statSync(path).mtimeMs) / 86_400_000 < maxAgeDays)) return cached();
  for (let attempt = 1; ; attempt++) {
    try {
      await sleep(PAUSE_MS);
      const res = await fetch(API(id), { signal: AbortSignal.timeout(60_000) });
      if (res.status === 404) return undefined;
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after')) || 30 * attempt;
        if (wait > 120 || attempt >= 4) {
          console.log(`turath asks to wait ${Math.round(wait / 60)} min: using cached indexes only for the rest of this run`);
          blocked = true;
          return cached();
        }
        console.log(`turath asks to slow down; waiting ${wait} s`);
        await sleep(wait * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        indexes?: { page_map?: (string | null)[]; headings?: { title: string; level: number; page: number }[] };
      };
      // "vol,page" per page; null for an unnumbered page, which belongs with the page before it.
      const names = (j.indexes?.page_map ?? []).map((k) => (k == null ? undefined : k.slice(0, k.lastIndexOf(','))));
      const firstKnown = names.find((n) => n !== undefined) ?? '';
      const vols: Cached['vols'] = [];
      for (const n of names) {
        const name = n ?? vols.at(-1)?.[0] ?? firstKnown;
        if (vols.at(-1)?.[0] === name) vols.at(-1)![1]++;
        else vols.push([name, 1]);
      }
      const heads: Cached['heads'] = (j.indexes?.headings ?? []).map((h) => [h.title, h.level, h.page]);
      const data: Cached = { vols, heads };
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(path, JSON.stringify(data));
      return data;
    } catch (err) {
      if (attempt >= 3) {
        console.warn(`book ${id}: ${String(err)}`);
        return cached();
      }
      await sleep(2000 * attempt);
    }
  }
}

const shards: VolumeShard[] = Array.from({ length: VOLUME_SHARDS }, () => ({ format: VOLUME_FORMAT, books: {} }));
let next = 0;
let done = 0;
let listed = 0;

async function run() {
  while (next < candidates.length) {
    const id = candidates[next++];
    const data = await index(id);
    if (data) {
      const pageVols = data.vols.flatMap(([name, n]) => Array<string>(n).fill(name));
      const last = Math.max(0, pageVols.length - 1);
      const headings: Heading[] = data.heads.map(([title, level, page]) => ({
        title,
        level: Math.max(1, level),
        page: Math.min(last, Math.max(0, page - 1)),
      }));
      const volumes = volumesOf(pageVols, headings);
      if (volumes.length > 1) {
        shards[shardOf(id)].books[id] = volumes.map(toRow);
        listed++;
      }
    }
    if (++done % 100 === 0) console.log(`${done}/${candidates.length}`);
  }
}

await run();

mkdirSync(outDir, { recursive: true });
let raw = 0;
let gz = 0;
shards.forEach((s, n) => {
  // Books in id order, one per line.
  const ids = Object.keys(s.books).map(Number).sort((x, y) => x - y);
  const text = `{"format":${s.format},"books":{\n${ids.map((i) => `${JSON.stringify(String(i))}:${JSON.stringify(s.books[i])}`).join(',\n')}\n}}\n`;
  writeFileSync(join(outDir, `${n}.json`), text);
  raw += Buffer.byteLength(text);
  gz += gzipSync(text).length;
});
const missing = candidates.filter((i) => !existsSync(join(cacheDir, `${i}.json`))).length;
console.log(
  `wrote ${outDir}: ${listed} books with several volumes (of ${candidates.length - missing} checked` +
    `${missing ? `; ${missing} not fetched yet, run again later` : ''}); ` +
    `${Math.round(raw / 1024)} KB raw, ${Math.round(gz / 1024)} KB gzipped in ${VOLUME_SHARDS} files`,
);
