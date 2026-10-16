// The 30+ real searches from docs/STEPS.md, run against the real catalog (public/data/catalog.json).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeCatalog, type Book, type CatalogFile } from '../src/lib/catalog/types.ts';
import { CatalogSearch, parseBookRef } from '../src/lib/search/search.ts';

const file = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url), 'utf8')) as CatalogFile;
const search = new CatalogSearch(decodeCatalog(file));

// Author ids in turath's catalog.
const DHAHABI = 362;
const IBN_TAYMIYYA = 54;
const BUKHARI = 215;
const IBN_KATHIR = 3;
const MALIK = 214;

type Check = number[] | ((book: Book) => boolean);

/** [query, what the first result must be: one of these ids, or a test on the book]. */
const CASES: [string, Check][] = [
  // Titles, with the cleanup the plan asks for
  ['سير اعلام', [22669, 10906]],
  ['سير اع', [22669, 10906]], // unfinished word
  ['سِيَر أَعْلام النُّبَلاء', [22669, 10906]], // harakat
  ['سيــر أعلام', [22669, 10906]], // tatweel
  ['فتح الباري', [1673, 137]],
  ['صحيح البخارى', (b) => b.author?.id === BUKHARI && b.title.startsWith('صحيح البخاري')], // ى
  ['صحيح مسلم', [711, 1727]],
  ['رياض الصالحين', [2348, 12014]],
  ['المغني لابن قدامه', [6910, 8463]], // ة → ه
  ['موطا مالك', (b) => b.author?.id === MALIK && b.title.startsWith('موطأ مالك')], // أ → ا
  ['تفسير الطبري', [7798, 43]],
  ['زاد المعاد', [197, 21713]],
  ['مجموع الفتاوى', [7289]],
  ['الاربعون النوويه', [12836]],
  ['لسان العرب', [1687]],
  ['تهذيب الكمال', [3722]],
  ['الاصابه', [9767]], // إ → ا, ة → ه
  ['البدايه والنهايه', (b) => b.author?.id === IBN_KATHIR && b.title.startsWith('البداية والنهاية')],
  ['مسند احمد', [25794, 98139]],
  ['سنن ابي داود', [117359, 654, 1726]],
  ['الرحيق المختوم', [9820]],
  ['الجامع لاحكام القران', [20855]], // the second title after «=»
  ['تيسير الكريم الرحمن', [42]],
  ['الكامل في الضعفاء', [12579, 5827]],
  ['التمهيد لابن عبد البر', [1719, 236]],

  // Typos (fuzzy)
  ['تفسير ابن كتير', (b) => b.author?.id === IBN_KATHIR && b.title.startsWith('تفسير ابن كثير')],
  ['تهذيب الكمل', [3722]],

  // Editions: the publisher in the title picks the edition
  ['سير اعلام الحديث', [22669]],
  ['سير اعلام الرساله', [10906]],

  // Authors
  ['الذهبي', (b) => b.author?.id === DHAHABI],
  ['ابن تيميه', (b) => b.author?.id === IBN_TAYMIYYA], // ة → ه
  ['محمد بن احمد بن عثمان الذهبي', (b) => b.author?.id === DHAHABI], // full name from the card

  // Editor (only on the card, not in the title)
  ['محمد ايمن الشبراوي', [22669]],

  // Book numbers and links
  ['22669', [22669]],
  ['٢٢٦٦٩', [22669]],
  ['۲۲۶۶۹', [22669]],
  ['https://shamela.ws/book/22669/1234', [22669]],
  ['shamela.ws/book/10906', [10906]],
];

describe('search: first result', () => {
  it.each(CASES)('«%s»', (q, check) => {
    const top = search.search(q, { limit: 5 });
    const first = top[0]?.book;
    const shown = top.map((h) => `${h.book.id} ${h.book.title}`).join('\n');
    expect(first, `no results for «${q}»`).toBeDefined();
    const ok = Array.isArray(check) ? check.includes(first!.id) : check(first!);
    expect(ok, `«${q}» got:\n${shown}`).toBe(true);
  });

  it('puts both Siyar editions at the top for «سير اعلام»', () => {
    const ids = search.search('سير اعلام', { limit: 2 }).map((h) => h.book.id);
    expect(ids.sort()).toEqual([10906, 22669]);
  });
});

describe('search: other ways in', () => {
  it('finds the author for an author query', () => {
    expect(search.authors('ابن تيميه').map((a) => a.id)).toContain(IBN_TAYMIYYA);
    expect(search.authors('الذهب').map((a) => a.id)).toContain(DHAHABI);
  });

  it('lists all of an author’s books', () => {
    const books = search.booksByAuthor(DHAHABI);
    expect(books.length).toBeGreaterThan(50);
    expect(books.every((b) => b.author?.id === DHAHABI)).toBe(true);
    expect(books.map((b) => b.id)).toEqual(expect.arrayContaining([22669, 10906]));
  });

  it('filters by category (shelf)', () => {
    const tarajim = 26;
    const hits = search.search('سير', { cat: tarajim });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.book.category?.id === tarajim)).toBe(true);
    expect(search.search('', { cat: tarajim, limit: 1000 }).length).toBe(search.byCategory(tarajim).length);
  });

  it('falls back to any word when no book has them all', () => {
    expect(search.search('صحيح كلمةلاتوجد').length).toBeGreaterThan(0);
  });

  it('returns nothing for an empty query without a shelf', () => {
    expect(search.search('   ')).toEqual([]);
  });

  it('reads book numbers and links', () => {
    expect(parseBookRef('https://shamela.ws/book/22669')).toBe(22669);
    expect(parseBookRef('https://app.turath.io/book/22669')).toBe(22669);
    expect(parseBookRef('٢٢٦٦٩')).toBe(22669);
    expect(parseBookRef('سير 22669')).toBeUndefined();
    expect(search.direct('99999999')).toBeUndefined();
  });

  it('is fast', () => {
    const t = performance.now();
    for (const q of ['سير اعلام', 'الذهبي', 'صحيح', 'ابن', 'تفسير ابن كتير']) search.search(q);
    expect(performance.now() - t).toBeLessThan(500);
  });
});
