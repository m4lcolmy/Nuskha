// Builds public/data/catalog.json from turath's catalog (files.turath.io/data-v4.sqlite).
//
//   npm run catalog              download if not cached, rebuild if turath's data_version changed
//   npm run catalog -- --refresh download again even if cached
//   npm run catalog -- --force   rebuild even if data_version is unchanged

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_FORMAT,
  FLAG_PDF,
  FLAG_PRINTED,
  type AuthorColumns,
  type BookColumns,
  type CatalogFile,
  type CatRow,
} from '../src/lib/catalog/types.ts';
import { toAsciiDigits } from '../src/lib/search/normalize.ts';

const SOURCE = 'https://files.turath.io/data-v4.sqlite';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cachePath = join(root, '.cache', 'data-v4.sqlite');
const outPath = join(root, 'public', 'data', 'catalog.json');

const args = new Set(process.argv.slice(2));

if (args.has('--refresh') || !existsSync(cachePath)) {
  console.log(`downloading ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${SOURCE}: HTTP ${res.status}`);
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, Buffer.from(await res.arrayBuffer()));
}

const db = new DatabaseSync(cachePath, { readOnly: true });
const json = <T>(sql: string): T[] => db.prepare(sql).all().map((r) => JSON.parse(r.json as string) as T);

const { data_version: dataVersion } = db.prepare('SELECT data_version FROM snapshot_meta').get() as {
  data_version: number;
};

if (!args.has('--force') && existsSync(outPath)) {
  const old = JSON.parse(readFileSync(outPath, 'utf8')) as CatalogFile;
  if (old.dataVersion === dataVersion && old.format === CATALOG_FORMAT) {
    console.log(`catalog already at data_version ${dataVersion}; nothing to do (use --force to rebuild)`);
    process.exit(0);
  }
}

interface TBook { id: number; name: string; author_id: number; cat_id: number; has_pdf: boolean; size: number; page_count: number }
interface TAuthor { id: number; name: string; death: number | null; death_inexact_label?: string }
interface TCat { id: number; name: string }
interface TMeta { book_id: number; info: string }

// --- the bibliographic card («بطاقة الكتاب») --------------------------------

/** "label: value" lines of a card. Labels are short; longer text before a colon is prose. */
function cardFields(info: string): [label: string, value: string][] {
  const out: [string, string][] = [];
  for (const line of info.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0 && i < 40) out.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return out;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** «المحقق», «تحقيق», «حققه وعلق عليه», «اعتنى به», «خرج أحاديثه واعتنى به», … but not «أصل التحقيق». */
const isEditorLabel = (l: string) => /حقق|تحقيق|اعتن|خرج أحاديثه|ضبط/.test(l) && !/^أصل/.test(l);
const isPublisherLabel = (l: string) => l === 'الناشر' || l === 'دار النشر';
const isYearLabel = (l: string) => /^(عام|سنة|تاريخ) النشر$/.test(l);

/** Author name as written on the card: drop dates «(ت ٧٤٨ هـ)» and notes «[…]». */
function cardAuthor(value: string): string {
  return clean(value.replace(/\([^)]*\)|\[[^\]]*\]/g, ''));
}

/** «الأولى، ١٤٠٧ هـ» → «الأولى»; «بدون طبعة»/«-» → "". `text` has ASCII digits. */
function editionName(text: string): string {
  const name = clean(
    text
      .split('،')[0]
      .replace(/\(.*|\d.*$/, '')
      .replace(/^الطبعة\s*/, '')
      .replace(/[\s\-:.*]+$/, '')
      .replace(/^ال[اأ]ول[ىي]$/, 'الأولى'),
  );
  // Journal issues («السنة …، العدد …») have no edition.
  return /^(بدون.*|.*(السنة|العدد).*)?$/.test(name) ? '' : cap(name, 30);
}

function years(text: string): { hijri: number; greg: number } {
  const t = toAsciiDigits(text);
  const h = t.match(/(\d{3,4})\s*هـ/);
  const g = t.match(/(\d{4})\s*م/);
  return { hijri: h ? +h[1] : 0, greg: g ? +g[1] : 0 };
}

// --- build -------------------------------------------------------------------

const cats: CatRow[] = json<TCat>('SELECT json FROM cats').map((c) => [c.id, c.name]);
const books = json<TBook>('SELECT json FROM books').sort((x, y) => x.id - y.id);
const meta = new Map(json<TMeta>('SELECT json FROM book_meta').map((m) => [m.book_id, m.info]));

// The author's full name is taken from the cards of their books (most common spelling wins).
const fullNames = new Map<number, Map<string, number>>();
const B: BookColumns = {
  idDelta: [], title: [], authorId: [], catId: [], pages: [], sizeKB: [], flags: [],
  editor: [], publisher: [], edition: [], hijri: [], greg: [], volumes: [],
};

let prevId = 0;
for (const b of books) {
  const info = meta.get(b.id) ?? '';
  const fields = cardFields(info);
  const get = (pred: (l: string) => boolean) => fields.filter(([l]) => pred(l)).map(([, v]) => clean(v));

  const author = get((l) => l === 'المؤلف')[0];
  if (author) {
    const name = cardAuthor(author);
    if (name) {
      const counts = fullNames.get(b.author_id) ?? new Map<string, number>();
      counts.set(name, (counts.get(name) ?? 0) + 1);
      fullNames.set(b.author_id, counts);
    }
  }

  const editionText = toAsciiDigits(get((l) => l === 'الطبعة')[0] ?? '');
  const { hijri, greg } = years([...get(isYearLabel), editionText].join(' '));

  B.idDelta.push(b.id - prevId);
  prevId = b.id;
  B.title.push(clean(b.name));
  B.authorId.push(b.author_id);
  B.catId.push(b.cat_id);
  B.pages.push(b.page_count);
  B.sizeKB.push(Math.max(1, Math.round(b.size / 1024)));
  B.flags.push((info.includes('موافق للمطبوع') ? FLAG_PRINTED : 0) | (b.has_pdf ? FLAG_PDF : 0));
  B.editor.push(cap(get(isEditorLabel).join('، '), 100));
  // «دار الحديث، القاهرة - مصر» → «دار الحديث»
  B.publisher.push(cap((get(isPublisherLabel)[0] ?? '').split('،')[0].trim(), 80));
  B.edition.push(editionName(editionText));
  B.hijri.push(hijri);
  B.greg.push(greg);
  B.volumes.push(+(toAsciiDigits(get((l) => l === 'عدد الأجزاء' || l === 'عدد المجلدات')[0] ?? '').match(/\d+/)?.[0] ?? 0));
}

const A: AuthorColumns = { id: [], name: [], death: [], deathLabel: [], fullName: [] };
for (const a of json<TAuthor>('SELECT json FROM authors').sort((x, y) => x.id - y.id)) {
  const name = clean(a.name);
  const full = [...(fullNames.get(a.id) ?? [])].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  A.id.push(a.id);
  A.name.push(name);
  A.death.push(a.death ?? 0);
  A.deathLabel.push(a.death_inexact_label ?? '');
  A.fullName.push(full === name ? '' : full);
}

const out: CatalogFile = {
  format: CATALOG_FORMAT,
  dataVersion,
  builtAt: new Date().toISOString().slice(0, 10),
  cats,
  authors: A,
  books: B,
};

// One field per line.
const columns = (o: object) => `{\n${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}`;
const text =
  '{' +
  [
    `"format":${out.format}`,
    `"dataVersion":${out.dataVersion}`,
    `"builtAt":${JSON.stringify(out.builtAt)}`,
    `"cats":${JSON.stringify(out.cats)}`,
    `"authors":${columns(out.authors)}`,
    `"books":${columns(out.books)}`,
  ].join(',\n') +
  '}\n';

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, text);
const kb = (n: number) => `${Math.round(n / 1024)} KB`;
console.log(
  `wrote ${outPath}: ${books.length} books, ${A.id.length} authors, ${cats.length} categories; ` +
    `${kb(Buffer.byteLength(text))} raw, ${kb(gzipSync(text).length)} gzipped; data_version ${dataVersion}`,
);
