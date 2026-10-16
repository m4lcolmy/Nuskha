<script lang="ts">
  import { store } from '../lib/catalog/store.svelte.ts';
  import { NOUNS, count, died, num } from '../lib/format.ts';
  import { href } from '../lib/route.svelte.ts';
  import BookList from './BookList.svelte';

  let { id }: { id: number } = $props();

  const author = $derived(store.catalog?.authors.get(id));
  // Largest works first: for most authors that puts the main works at the top.
  const books = $derived(
    store.catalog?.books.filter((b) => b.author?.id === id).sort((a, b) => b.pages - a.pages) ?? [],
  );

  $effect(() => {
    if (author) document.title = `${author.name} — نسخة`;
    return () => (document.title = 'نسخة — المكتبة الشاملة، نسخةً في يدك');
  });
</script>

{#if !store.catalog}
  <p class="status" role="status">جارٍ فتح الفهرس…</p>
{:else if !author}
  <p class="status">لا يوجد مؤلف بالرقم {num(id)}. <a href={href({})}>العودة إلى المكتبة</a></p>
{:else}
  <header class="head">
    <h1>{author.name}</h1>
    {#if author.fullName}<p class="full">{author.fullName}</p>{/if}
    <p class="meta">
      {#if died(author)}<span>{died(author)}</span><span class="sep">·</span>{/if}
      <span>{count(books.length, NOUNS.book)}</span>
    </p>
  </header>
  <BookList {books} label="كتب {author.name}" showAuthor={false} />
{/if}

<style>
  .status {
    color: var(--ink-soft);
    text-align: center;
    margin-top: 48px;
  }
  .head {
    text-align: center;
    margin: 8px 0 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--rule-soft);
  }
  h1 {
    font: 400 clamp(1.9rem, 6vw, 2.4rem) / 1.4 var(--serif);
    margin: 0;
  }
  .full {
    margin: 4px 0 0;
    font: 400 1.15rem/1.6 var(--serif);
    text-wrap: balance;
  }
  .meta {
    margin: 4px 0 0;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .sep {
    margin-inline: 0.5em;
    color: var(--rule);
  }
</style>
