// Builds EPUBs from real books with the same code the site runs, and checks them with epubcheck
// (the official EPUB checker, which must report 0 errors).
//
//   node scripts/epub-check.ts                     the 4 test books, whole and one volume each
//   node scripts/epub-check.ts 22669 --vol 3       one book; --vol picks a volume, --to a range end
//   … --cover cover.jpg                            with a cover (the site draws them with canvas)
//
// Books are kept in .cache/books, epubcheck in .cache/epubcheck, the EPUBs in .cache/epub (open
// them in your readers). Needs Java for epubcheck; without it the EPUBs are still built.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { decodeCatalog, type CatalogFile } from '../src/lib/catalog/types.ts';
import { buildEpub } from '../src/lib/epub/build.ts';
import { epubMeta } from '../src/lib/epub/meta.ts';
import { parseBook } from '../src/lib/turath/book.ts';
import { volumesOf } from '../src/lib/turath/volumes.ts';

const EPUBCHECK = '5.4.0';
// A small one, one with many footnotes, one with many volumes, one with deep headings.
const TEST_BOOKS = [17100, 22669, 8376, 10906];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = (...p: string[]) => join(root, '.cache', ...p);

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args.splice(i, 2)[1]) : undefined;
};
const coverAt = args.indexOf('--cover');
const cover = coverAt >= 0 ? new Uint8Array(readFileSync(args.splice(coverAt, 2)[1])) : undefined;
const vol = opt('--vol');
const to = opt('--to');
const ids = args.length ? args.map(Number) : TEST_BOOKS;

const catalog = decodeCatalog(JSON.parse(readFileSync(join(root, 'public/data/catalog.json'), 'utf8')) as CatalogFile);
const font = new Uint8Array(readFileSync(join(root, 'public/fonts/Amiri-Regular.ttf')));

async function download(url: string, path: string) {
  if (existsSync(path)) return;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

async function epubcheckJar(): Promise<string | undefined> {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' });
  } catch {
    console.log('Java not found: building only, no epubcheck.');
    return undefined;
  }
  const jar = cache('epubcheck', `epubcheck-${EPUBCHECK}`, 'epubcheck.jar');
  if (!existsSync(jar)) {
    const zip = cache('epubcheck', `epubcheck-${EPUBCHECK}.zip`);
    await download(`https://github.com/w3c/epubcheck/releases/download/v${EPUBCHECK}/epubcheck-${EPUBCHECK}.zip`, zip);
    for (const [name, data] of Object.entries(unzipSync(new Uint8Array(readFileSync(zip))))) {
      if (name.endsWith('/')) continue;
      mkdirSync(dirname(cache('epubcheck', name)), { recursive: true });
      writeFileSync(cache('epubcheck', name), data);
    }
  }
  return jar;
}

const jar = await epubcheckJar();
let failed = 0;

for (const id of ids) {
  const entry = catalog.byId.get(id);
  if (!entry) throw new Error(`book ${id} is not in the catalog`);
  const path = cache('books', `${id}.json`);
  await download(`https://files.turath.io/books-v3/${id}.json`, path);
  const book = parseBook(JSON.parse(readFileSync(path, 'utf8')));
  const volumes = volumesOf(
    book.pages.map((p) => p.vol),
    book.headings,
  );

  const runs: [from: number, to: number][] =
    vol !== undefined ? [[vol - 1, (to ?? vol) - 1]] : volumes.length > 1 ? [[0, volumes.length - 1], [1, 1]] : [[0, 0]];
  for (const [from, end] of runs) {
    const t = performance.now();
    const epub = buildEpub({ book, meta: epubMeta(entry), volumes, from, to: end, font, cover });
    const name = from === 0 && end === volumes.length - 1 ? `${id}.epub` : `${id}-v${from + 1}${end > from ? `-${end + 1}` : ''}.epub`;
    const out = cache('epub', name);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, epub);
    const ms = Math.round(performance.now() - t);
    console.log(`${name}: ${(epub.length / 1024 / 1024).toFixed(1)} MB in ${ms} ms (${book.pages.length} pages, ${volumes.length} volumes)`);
    if (!jar) continue;
    try {
      const report = execFileSync('java', ['-jar', jar, '--quiet', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      console.log(report.trim() ? report.trim() : '  epubcheck: 0 errors, 0 warnings');
    } catch (e) {
      failed++;
      const err = e as { stdout?: string; stderr?: string };
      const lines = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().split('\n');
      console.log(lines.slice(0, 30).join('\n') + (lines.length > 30 ? `\n  … ${lines.length - 30} more lines` : ''));
    }
  }
}
if (failed) {
  console.log(`epubcheck found errors in ${failed} file(s).`);
  process.exitCode = 1;
}
