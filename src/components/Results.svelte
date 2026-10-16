<script lang="ts">
  import { store } from '../lib/catalog/store.svelte.ts';
  import { NOUNS, count, died } from '../lib/format.ts';
  import { href, route } from '../lib/route.svelte.ts';
  import BookList from './BookList.svelte';

  const LIMIT = 400;

  const shelf = $derived(route.cat === undefined ? undefined : store.catalog?.cats.find((c) => c.id === route.cat));
  // A whole shelf can be browsed; a search shows its best matches.
  const limit = $derived(route.q.trim() ? LIMIT : Infinity);
  const hits = $derived(store.search ? store.search.search(route.q, { cat: route.cat, limit }).map((h) => h.book) : []);
  const authors = $derived(store.search && route.cat === undefined ? store.search.authors(route.q).slice(0, 6) : []);
</script>

<section aria-labelledby="results-heading">
  {#if shelf}
    <div class="shelf">
      <h1 id="results-heading">{shelf.name}</h1>
      <a class="clear" href={href({ q: route.q })}>كل الرفوف <span aria-hidden="true">×</span></a>
    </div>
  {:else}
    <h1 id="results-heading" class="visually-hidden">نتائج البحث</h1>
  {/if}

  {#if authors.length}
    <div class="authors">
      <span class="label">المؤلفون:</span>
      {#each authors as a (a.id)}
        <a class="author" href={href({ author: a.id })}>{a.name}{#if died(a)}<small>{died(a)}</small>{/if}</a>
      {/each}
    </div>
  {/if}

  {#if !store.search}
    <p class="status" role="status">جارٍ إعداد البحث…</p>
  {:else}
    <p class="status" role="status">
      {#if hits.length === 0}
        لم نجد كتابًا بهذا الاسم. جرّب كلمة واحدة من العنوان، أو اسم المؤلف المشهور.
      {:else if hits.length >= limit}
        أكثر من {count(LIMIT, NOUNS.result)}
      {:else if !route.q.trim()}
        {count(hits.length, NOUNS.book)}، الأقدم مؤلفًا أولًا
      {:else}
        {count(hits.length, NOUNS.result)}
      {/if}
    </p>
    <BookList books={hits} label={shelf ? shelf.name : 'نتائج البحث'} />
  {/if}
</section>

<style>
  .shelf {
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
  }
  h1 {
    font: 400 1.8rem/1.4 var(--serif);
    margin: 0;
  }
  .clear {
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .authors {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin: 4px 0 8px;
  }
  .label {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .author {
    border: 1px solid var(--rule-soft);
    border-radius: 2px;
    padding: 0 10px;
    text-decoration: none;
    font-size: 0.95rem;
  }
  .author:hover {
    background: var(--paper-deep);
    border-color: var(--rule);
  }
  .author small {
    color: var(--ink-soft);
    margin-inline-start: 6px;
    font-size: 0.8rem;
  }
  .status {
    color: var(--ink-soft);
    font-size: 0.9rem;
    margin: 6px 0 12px;
  }
</style>
