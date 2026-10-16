// Writes the excerpts tests/pdf.test.ts builds into PDFs: a few pages of three real books, as the
// reader of turath's files returns them, with the catalog details. Run again only to change them.
//   node scripts/pdf-fixtures.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeCatalog, type CatalogFile } from '../src/lib/catalog/types.ts';
import { epubMeta } from '../src/lib/epub/meta.ts';
import { parseBook } from '../src/lib/turath/book.ts';

const root = join(import.meta.dirname, '..');
// A small book, a chapter of Siyar with many notes, and fully vowelled text.
const EXCERPTS: [id: number, from: number, to: number][] = [
  [17100, 0, 30],
  [22669, 1007, 1040],
  [12014, 20, 50],
];

const catalog = decodeCatalog(JSON.parse(readFileSync(join(root, 'public/data/catalog.json'), 'utf8')) as CatalogFile);
for (const [id, from, to] of EXCERPTS) {
  const book = parseBook(JSON.parse(readFileSync(join(root, '.cache/books', `${id}.json`), 'utf8')));
  const pages = book.pages.slice(from, to);
  const headings = book.headings.filter((h) => h.page >= from && h.page < to).map((h) => ({ ...h, page: h.page - from }));
  const meta = epubMeta(catalog.byId.get(id)!);
  writeFileSync(join(root, 'tests/fixtures', `pdf-${id}.json`), JSON.stringify({ meta, info: book.info, pages, headings }));
}
