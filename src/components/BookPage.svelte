<script lang="ts" module>
  import type { Book } from '../lib/catalog/types.ts';
  import { splitTitle } from '../lib/format.ts';
  import { terms } from '../lib/search/normalize.ts';

  const editionKey = (b: Book) => terms(splitTitle(b.title).main).join(' ');
  let editionIndex: Map<string, Book[]> | undefined;

  /** Books with the same main title («سير أعلام النبلاء - ط الرسالة» / «- ط الحديث»). */
  function editionsOf(book: Book, all: Book[]): Book[] {
    if (!editionIndex) {
      editionIndex = new Map();
      for (const b of all) {
        const k = editionKey(b);
        editionIndex.set(k, [...(editionIndex.get(k) ?? []), b]);
      }
    }
    return (editionIndex.get(editionKey(book)) ?? []).filter((b) => b.id !== book.id);
  }
</script>

<script lang="ts">
  // A book's title page: centred title, author, editor, publisher, then the download.
  import { store } from '../lib/catalog/store.svelte.ts';
  import { NOUNS, count, died, num, published, size } from '../lib/format.ts';
  import { href } from '../lib/route.svelte.ts';
  import { bindingColor } from '../lib/shelves.ts';

  let { id }: { id: number } = $props();

  const book = $derived(store.catalog?.byId.get(id));
  const title = $derived(book ? splitTitle(book.title) : undefined);

  const editions = $derived(book && store.catalog ? editionsOf(book, store.catalog.books) : []);

  let notice = $state(false);

  $effect(() => {
    if (book) document.title = `${book.title} — نسخة`;
    return () => (document.title = 'نسخة — المكتبة الشاملة، نسخةً في يدك');
  });
</script>

{#if !store.catalog}
  <p class="status" role="status">جارٍ فتح الفهرس…</p>
{:else if !book || !title}
  <div class="missing">
    <h1>لا يوجد كتاب بالرقم {num(id)} في الفهرس.</h1>
    <a href={href({})}>العودة إلى المكتبة</a>
  </div>
{:else}
  <article class="titlepage" style:--bind={bindingColor(book.category)}>
    {#if book.category}
      <a class="shelf" href={href({ cat: book.category.id })}>{book.category.name}</a>
    {/if}

    <h1>{title.main}</h1>
    {#if title.edition}<p class="edition">{title.edition}</p>{/if}

    <div class="ornament" aria-hidden="true"><span>۞</span></div>

    {#if book.author}
      <p class="role">تأليف</p>
      <p class="name">
        <a href={href({ author: book.author.id })}>{book.author.fullName || book.author.name}</a>
      </p>
      {#if died(book.author)}<p class="died">({died(book.author)})</p>{/if}
    {/if}

    {#if book.editor}
      <p class="role">تحقيق</p>
      <p class="editor">{book.editor}</p>
    {/if}

    <div class="rule" aria-hidden="true"></div>

    {#if book.publisher}<p class="imprint">{book.publisher}</p>{/if}
    {#if book.edition || published(book)}
      <p class="imprint-sub">
        {[book.edition && `الطبعة ${book.edition}`, published(book)].filter(Boolean).join('، ')}
      </p>
    {/if}

    <ul class="facts">
      {#if book.volumes > 1}<li>{count(book.volumes, NOUNS.part)}</li>{/if}
      <li>{count(book.pages, NOUNS.page)}</li>
      <li>{size(book.size)}</li>
      {#if book.printed}<li class="badge">موافق للمطبوع</li>{/if}
    </ul>

    <div class="download">
      <button class="primary" onclick={() => (notice = true)}>تحميل EPUB</button>
      {#if notice}
        <p class="notice" role="status">صفحة التحميل جاهزة؛ إنشاء الملف يأتي في الخطوة التالية.</p>
      {/if}
      <p class="links">
        <a href="https://shamela.ws/book/{book.id}" target="_blank" rel="noopener">الكتاب في المكتبة الشاملة</a>
        <span class="sep">·</span>
        <span>رقم {num(book.id)}</span>
      </p>
    </div>
  </article>

  {#if editions.length}
    <section class="editions" aria-labelledby="editions-heading">
      <h2 id="editions-heading">طبعات أخرى</h2>
      <ul>
        {#each editions as e (e.id)}
          {@const t = splitTitle(e.title)}
          <li>
            <a href={href({ book: e.id })}>{t.edition || e.title}</a>
            <span class="meta">
              {[e.publisher, published(e), count(e.pages, NOUNS.page)].filter(Boolean).join(' · ')}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<style>
  .status,
  .missing {
    text-align: center;
    color: var(--ink-soft);
    margin-top: 48px;
  }
  .missing h1 {
    font: 400 1.4rem/1.6 var(--serif);
    color: var(--ink);
  }
  .titlepage {
    max-width: 620px;
    margin: 8px auto 0;
    padding: 36px 24px 32px;
    text-align: center;
    border: 1px solid var(--rule-soft);
    border-top: 4px solid var(--bind);
    outline: 1px solid var(--rule-soft);
    outline-offset: 5px;
  }
  .shelf {
    font-size: 0.85rem;
    color: var(--ink-soft);
    text-decoration: none;
    letter-spacing: 0;
  }
  .shelf:hover {
    text-decoration: underline;
  }
  h1 {
    font: 400 clamp(1.9rem, 6vw, 2.6rem) / 1.45 var(--serif);
    margin: 12px 0 0;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  .edition {
    margin: 4px 0 0;
    color: var(--ink-soft);
  }
  .ornament {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 20px auto;
    max-width: 220px;
    color: var(--rule);
  }
  .ornament::before,
  .ornament::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--rule);
  }
  .role {
    margin: 14px 0 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .name {
    margin: 0;
    font: 400 1.35rem/1.6 var(--serif);
    text-wrap: balance;
  }
  .name a {
    text-decoration-color: var(--rule-soft);
  }
  .died {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .editor {
    margin: 0;
    font-size: 1rem;
    text-wrap: balance;
  }
  .rule {
    width: 64px;
    margin: 24px auto 16px;
    border-top: 1px solid var(--rule);
  }
  .imprint {
    margin: 0;
    font-size: 1.05rem;
  }
  .imprint-sub {
    margin: 0;
    color: var(--ink-soft);
  }
  .facts li + li::before {
    content: '·';
    color: var(--rule);
    margin-inline: 0.5em;
  }
  .facts {
    list-style: none;
    padding: 0;
    margin: 4px 0 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .badge {
    color: var(--accent);
  }
  .download {
    margin-top: 28px;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    border-radius: 2px;
    padding: 10px 40px;
    font-size: 1.15rem;
    cursor: pointer;
    min-width: 220px;
  }
  .primary:hover {
    filter: brightness(1.1);
  }
  .notice {
    font-size: 0.9rem;
    color: var(--ink-soft);
    margin: 10px 0 0;
  }
  .links {
    margin: 14px 0 0;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .sep {
    margin-inline: 0.5em;
    color: var(--rule);
  }
  .editions {
    max-width: 620px;
    margin: 40px auto 0;
  }
  h2 {
    font: 400 1.3rem/1.5 var(--serif);
    margin: 0 0 8px;
    border-bottom: 1px solid var(--rule-soft);
  }
  .editions ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .editions li {
    padding: 6px 0;
    border-bottom: 1px solid var(--rule-soft);
  }
  .editions .meta {
    display: block;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  @media (max-width: 480px) {
    .titlepage {
      padding: 28px 14px 24px;
    }
    .primary {
      width: 100%;
    }
  }
</style>
