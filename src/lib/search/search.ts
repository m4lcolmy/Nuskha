import MiniSearch from 'minisearch';
import type { Author, Book, Catalog } from '../catalog/types.ts';
import { normalizeArabic, stripArticle, terms, toAsciiDigits } from './normalize.ts';

interface Doc {
  id: number;
  title: string;
  author: string;
  authorFull: string;
  editor: string;
  publisher: string;
  category: string;
}

/** Field weights: title > author > editor/publisher > category. */
const BOOST: Partial<Record<keyof Doc, number>> = {
  title: 5,
  author: 3,
  authorFull: 2,
  editor: 1,
  publisher: 1,
  category: 0.5,
};

export interface SearchOptions {
  /** Only books in this category. */
  cat?: number;
  limit?: number;
}

export interface Hit {
  book: Book;
  score: number;
}

/** Book id from a shamela.ws / turath.io link or a bare number (Arabic digits allowed). */
export function parseBookRef(q: string): number | undefined {
  const s = toAsciiDigits(q.trim());
  const m =
    s.match(/^(?:https?:\/\/)?(?:www\.)?(?:shamela\.ws|(?:app\.)?turath\.io)\/book\/(\d+)/i) ?? s.match(/^#?(\d{1,7})$/);
  return m ? Number(m[1]) : undefined;
}

export class CatalogSearch {
  readonly catalog: Catalog;
  private index: MiniSearch<Doc>;
  /** Normalized title words joined by spaces, for the «title starts with the query» tie-break. */
  private normTitle = new Map<number, string>();
  /** Normalized words of each author's short name. */
  private authorTerms: [Author, string[]][];

  constructor(catalog: Catalog) {
    this.catalog = catalog;
    this.index = new MiniSearch<Doc>({
      fields: ['title', 'author', 'authorFull', 'editor', 'publisher', 'category'],
      tokenize: (s) => normalizeArabic(s).split(/[^\p{L}\p{N}]+/u),
      processTerm: (t) => (t ? stripArticle(t) : null),
      searchOptions: {
        boost: BOOST,
        prefix: true,
        // One typo allowed in words of 4+ letters, two in 8+.
        fuzzy: (term) => (term.length >= 8 ? 2 : term.length >= 4 ? 1 : false),
        combineWith: 'AND',
      },
    });
    this.index.addAll(
      catalog.books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author?.name ?? '',
        authorFull: b.author?.fullName ?? '',
        editor: b.editor,
        publisher: b.publisher,
        category: b.category?.name ?? '',
      })),
    );
    for (const b of catalog.books) this.normTitle.set(b.id, terms(b.title).join(' '));
    this.authorTerms = [...catalog.authors.values()].map((a) => [a, terms(a.name)]);
  }

  /** The book a pasted link or book number points to, if it exists. */
  direct(q: string): Book | undefined {
    const id = parseBookRef(q);
    return id === undefined ? undefined : this.catalog.byId.get(id);
  }

  search(q: string, opts: SearchOptions = {}): Hit[] {
    const { cat, limit = 50 } = opts;
    const direct = this.direct(q);
    if (direct) return [{ book: direct, score: Infinity }];

    const query = terms(q).join(' ');
    if (!query) return cat === undefined ? [] : this.byCategory(cat).slice(0, limit).map((book) => ({ book, score: 0 }));

    const filter = cat === undefined ? undefined : (r: { id: number }) => this.catalog.byId.get(r.id)?.category?.id === cat;
    let results = this.index.search(q, { filter });
    // Every word has to match. If that finds nothing, allow a typo in short words too,
    // and then show books matching any word.
    if (results.length === 0) {
      results = this.index.search(q, { filter, fuzzy: (t) => (t.length >= 8 ? 2 : t.length >= 3 ? 1 : false) });
    }
    if (results.length === 0) results = this.index.search(q, { filter, combineWith: 'OR' });

    const authors = new Set(this.authors(q).map((a) => a.id));
    const hits = results.map((r) => {
      const book = this.catalog.byId.get(r.id)!;
      let score = r.score;
      if (this.normTitle.get(r.id)!.startsWith(query)) score *= 1.5;
      // «الذهبي» means books by al-Dhahabi before books about him.
      if (book.author && authors.has(book.author.id)) score *= 2;
      // Big books are more often the main work a short query is after («المغني», «الموطأ»).
      score *= 1 + 0.1 * Math.log10(book.pages + 1);
      return { book, score };
    });
    hits.sort(compareHits);
    return hits.slice(0, limit);
  }

  /**
   * Authors whose short name contains every word of the query («ابن تيميه», «الذهبي»).
   * The last word may be unfinished.
   */
  authors(q: string): Author[] {
    const qt = terms(q);
    const last = qt.at(-1);
    if (!last || last.length < 3) return [];
    return this.authorTerms
      .filter(([, at]) => qt.every((t, i) => (i === qt.length - 1 ? at.some((w) => w.startsWith(t)) : at.includes(t))))
      .map(([a]) => a);
  }

  booksByAuthor(authorId: number): Book[] {
    return this.catalog.books.filter((b) => b.author?.id === authorId).sort(byTitle);
  }

  /** A shelf: oldest authors first, books with unknown authors last. */
  byCategory(catId: number): Book[] {
    const death = (b: Book) => b.author?.death || 99999;
    return this.catalog.books.filter((b) => b.category?.id === catId).sort((a, b) => death(a) - death(b) || byTitle(a, b));
  }
}

const byTitle = (a: Book, b: Book) => a.title.localeCompare(b.title, 'ar');

/** Scores within about 2% of each other count as a tie. */
const bucket = (score: number) => Math.round(Math.log(score) / Math.log(1.02));

/** Higher score first; ties go to the shorter title, then the longer book. */
function compareHits(a: Hit, b: Hit): number {
  return bucket(b.score) - bucket(a.score) || a.book.title.length - b.book.title.length || b.book.pages - a.book.pages;
}
