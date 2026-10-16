// Plain page for trying the search (step 1). The real design comes in step 2.

import { decodeCatalog, type Author, type Book, type CatalogFile } from './lib/catalog/types.ts';
import { CatalogSearch } from './lib/search/search.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLInputElement>('q');
const catsEl = $('cats');
const statusEl = $('status');
const authorsEl = $('authors');
const bookEl = $('book');
const resultsEl = $('results');

const arDigits = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

let search: CatalogSearch;
let cat: number | undefined;
let shown: Book[] = [];
let selected = -1;

function deathText(a: Author): string {
  if (!a.death) return '';
  return `ت ${a.deathLabel ? a.deathLabel + ' ' : ''}${arDigits(a.death)} هـ`;
}

function bookMeta(b: Book): string {
  const year = b.hijri ? `${arDigits(b.hijri)} هـ` : b.greg ? `${arDigits(b.greg)} م` : '';
  return [
    b.publisher,
    year,
    b.volumes ? `${arDigits(b.volumes)} مج` : '',
    `${arDigits(b.pages)} ص`,
    b.category?.name,
  ]
    .filter(Boolean)
    .join(' · ');
}

function renderList(books: Book[], note: string) {
  shown = books;
  selected = books.length ? 0 : -1;
  statusEl.textContent = note;
  resultsEl.innerHTML = books
    .map(
      (b, i) => `<li role="option" data-i="${i}" aria-selected="${i === selected}">
        <div class="title">${esc(b.title)}${b.printed ? '<span class="badge">موافق للمطبوع</span>' : ''}</div>
        <div class="meta">${b.author ? esc(b.author.name) + (b.author.death ? ' · ' + deathText(b.author) : '') : ''}</div>
        <div class="meta">${esc(bookMeta(b))} · <bdi>#${b.id}</bdi></div>
      </li>`,
    )
    .join('');
}

function select(i: number) {
  if (!shown.length) return;
  selected = Math.max(0, Math.min(shown.length - 1, i));
  resultsEl.querySelectorAll('li').forEach((li, j) => li.setAttribute('aria-selected', String(j === selected)));
  resultsEl.children[selected]?.scrollIntoView({ block: 'nearest' });
}

function openBook(b: Book) {
  const rows: [string, string][] = [
    ['المؤلف', b.author ? `${b.author.name}${b.author.death ? ` (${deathText(b.author)})` : ''}` : ''],
    ['الاسم الكامل', b.author?.fullName ?? ''],
    ['المحقق', b.editor],
    ['الناشر', b.publisher],
    ['الطبعة', b.edition],
    ['سنة النشر', [b.hijri && `${arDigits(b.hijri)} هـ`, b.greg && `${arDigits(b.greg)} م`].filter(Boolean).join(' - ')],
    ['الأجزاء', b.volumes ? arDigits(b.volumes) : ''],
    ['الصفحات', arDigits(b.pages)],
    ['الحجم', `${arDigits((b.size / 1024 / 1024).toFixed(1))} م.ب`],
    ['القسم', b.category?.name ?? ''],
  ];
  bookEl.hidden = false;
  bookEl.innerHTML = `<div class="title">${esc(b.title)}${b.printed ? '<span class="badge">موافق للمطبوع</span>' : ''}</div>
    <dl>${rows.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <a href="https://shamela.ws/book/${b.id}" target="_blank" rel="noopener">الكتاب في الشاملة ↗</a>
    · <button class="author" data-author="${b.author?.id ?? ''}">كل كتب المؤلف</button>`;
  bookEl.scrollIntoView({ block: 'nearest' });
}

function showAuthor(id: number) {
  const a = search.catalog.authors.get(id);
  if (!a) return;
  bookEl.hidden = true;
  authorsEl.innerHTML = '';
  const books = search.booksByAuthor(id);
  renderList(books, `${a.name}${a.death ? ` (${deathText(a)})` : ''}: ${arDigits(books.length)} كتاب`);
}

function run() {
  const q = input.value;
  const url = new URL(location.href);
  if (q.trim()) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  if (cat !== undefined) url.searchParams.set('cat', String(cat));
  else url.searchParams.delete('cat');
  history.replaceState(null, '', url);

  bookEl.hidden = true;
  const direct = search.direct(q);
  if (direct) {
    authorsEl.innerHTML = '';
    renderList([direct], 'رقم كتاب');
    openBook(direct);
    return;
  }

  const t = performance.now();
  const hits = search.search(q, { cat, limit: 100 });
  const ms = Math.round(performance.now() - t);
  const authors = search.authors(q).slice(0, 8);
  authorsEl.innerHTML = authors.length
    ? 'مؤلفون: ' +
      authors.map((a) => `<button class="author" data-author="${a.id}">${esc(a.name)}</button>`).join(' ')
    : '';
  renderList(
    hits.map((h) => h.book),
    q.trim() || cat !== undefined ? `${arDigits(hits.length)} نتيجة${hits.length === 100 ? ' (أول ١٠٠)' : ''} · ${arDigits(ms)} م.ث` : '',
  );
}

function renderCats() {
  catsEl.innerHTML = search.catalog.cats
    .map((c) => `<button data-cat="${c.id}" aria-pressed="${c.id === cat}">${esc(c.name)}</button>`)
    .join('');
}

catsEl.addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-cat]')?.dataset.cat;
  if (!id) return;
  cat = cat === +id ? undefined : +id;
  renderCats();
  run();
});

document.addEventListener('click', (e) => {
  const el = e.target as HTMLElement;
  const author = el.closest<HTMLElement>('[data-author]')?.dataset.author;
  if (author) return showAuthor(+author);
  const li = el.closest<HTMLElement>('li[data-i]');
  if (li) {
    select(+li.dataset.i!);
    openBook(shown[selected]);
  }
});

input.addEventListener('input', run);
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') select(selected + 1);
  else if (e.key === 'ArrowUp') select(selected - 1);
  else if (e.key === 'Enter' && shown[selected]) openBook(shown[selected]);
  else return;
  e.preventDefault();
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
    input.select();
  }
});

async function main() {
  const t = performance.now();
  const res = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`);
  const file = (await res.json()) as CatalogFile;
  search = new CatalogSearch(decodeCatalog(file));
  const ms = Math.round(performance.now() - t);
  statusEl.textContent = `${arDigits(search.catalog.books.length)} كتاب · ${arDigits(ms)} م.ث للتحميل والفهرسة`;

  const params = new URLSearchParams(location.search);
  input.value = params.get('q') ?? '';
  const c = params.get('cat');
  cat = c ? +c : undefined;
  renderCats();
  if (input.value || cat !== undefined) run();
}

main().catch((err) => {
  statusEl.textContent = `تعذّر تحميل الفهرس: ${err}`;
});
