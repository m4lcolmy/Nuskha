// Shape of public/data/catalog.json, written by scripts/build-catalog.ts.

export const CATALOG_FORMAT = 1;

/** Book flags (bitmask). */
export const FLAG_PRINTED = 1; // «ترقيم الكتاب موافق للمطبوع»
export const FLAG_PDF = 2; // turath has a scan of the printed book

export type CatRow = [id: number, name: string];

/** Column-major: one array per field, all the same length. Compresses much better than rows. */
export interface AuthorColumns {
  id: number[];
  name: string[];
  /** Hijri year, 0 = unknown. */
  death: number[];
  /** «نحو» / «بعد» / «ق» (century) for inexact death years, else "". */
  deathLabel: string[];
  /** Full name from the books' cards, "" if unknown or same as `name`. */
  fullName: string[];
}

export interface BookColumns {
  /** Book id minus the previous book's id (ids are sorted). */
  idDelta: number[];
  title: string[];
  authorId: number[];
  catId: number[];
  pages: number[];
  /** Size of turath's book JSON, in KB. */
  sizeKB: number[];
  flags: number[];
  editor: string[];
  publisher: string[];
  /** «الأولى», «الثانية», … or "". */
  edition: string[];
  /** Publication year, 0 = unknown. */
  hijri: number[];
  greg: number[];
  /** 0 = unknown. */
  volumes: number[];
}

export interface CatalogFile {
  format: number;
  dataVersion: number;
  builtAt: string;
  cats: CatRow[];
  authors: AuthorColumns;
  books: BookColumns;
}

export interface Category {
  id: number;
  name: string;
}

export interface Author {
  id: number;
  name: string;
  death: number;
  deathLabel: string;
  fullName: string;
}

export interface Book {
  id: number;
  title: string;
  author: Author | undefined;
  category: Category | undefined;
  pages: number;
  size: number;
  printed: boolean;
  hasPdf: boolean;
  editor: string;
  publisher: string;
  edition: string;
  hijri: number;
  greg: number;
  volumes: number;
}

export interface Catalog {
  dataVersion: number;
  builtAt: string;
  cats: Category[];
  authors: Map<number, Author>;
  books: Book[];
  byId: Map<number, Book>;
}

export function decodeCatalog(file: CatalogFile): Catalog {
  if (file.format !== CATALOG_FORMAT) {
    throw new Error(`catalog format ${file.format}, expected ${CATALOG_FORMAT}`);
  }
  const cats = file.cats.map(([id, name]) => ({ id, name }));
  const catById = new Map(cats.map((c) => [c.id, c]));

  const a = file.authors;
  const authors = new Map<number, Author>(
    a.id.map((id, i) => [
      id,
      { id, name: a.name[i], death: a.death[i], deathLabel: a.deathLabel[i], fullName: a.fullName[i] },
    ]),
  );

  const b = file.books;
  let id = 0;
  const books: Book[] = b.idDelta.map((delta, i) => ({
    id: (id += delta),
    title: b.title[i],
    author: authors.get(b.authorId[i]),
    category: catById.get(b.catId[i]),
    pages: b.pages[i],
    size: b.sizeKB[i] * 1024,
    printed: (b.flags[i] & FLAG_PRINTED) !== 0,
    hasPdf: (b.flags[i] & FLAG_PDF) !== 0,
    editor: b.editor[i],
    publisher: b.publisher[i],
    edition: b.edition[i],
    hijri: b.hijri[i],
    greg: b.greg[i],
    volumes: b.volumes[i],
  }));

  return {
    dataVersion: file.dataVersion,
    builtAt: file.builtAt,
    cats,
    authors,
    books,
    byId: new Map(books.map((x) => [x.id, x])),
  };
}
