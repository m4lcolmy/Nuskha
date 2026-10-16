<script lang="ts">
  // A list of catalog cards, shown 40 at a time. ↑ ↓ move through it from the search box or the
  // page, Enter opens the highlighted book.
  import type { Book } from '../lib/catalog/types.ts';
  import { go } from '../lib/route.svelte.ts';
  import { ui } from '../lib/ui.svelte.ts';
  import BookCard from './BookCard.svelte';

  const PAGE = 40;
  let { books, label, showAuthor = true }: { books: Book[]; label: string; showAuthor?: boolean } = $props();

  let shown = $state(PAGE);
  let active = $state(-1);

  // A new list starts from the top.
  $effect.pre(() => {
    void books;
    shown = PAGE;
    active = -1;
  });

  $effect(() => {
    ui.activeId = active >= 0 && books[active] ? `r-${books[active].id}` : '';
    return () => (ui.activeId = '');
  });

  function move(to: number) {
    active = Math.max(0, Math.min(books.length - 1, to));
    if (active >= shown) shown = active + 1;
    queueMicrotask(() => document.getElementById(`r-${books[active].id}`)?.scrollIntoView({ block: 'nearest' }));
  }

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const inSearch = t.id === 'q';
    if (!inSearch && t !== document.body) return;
    if (e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowUp' && active > 0) move(active - 1);
    else if (e.key === 'Enter' && inSearch && books[Math.max(active, 0)]) go({ book: books[Math.max(active, 0)].id });
    else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<ol id="results" class="list" role="listbox" aria-label={label}>
  {#each books.slice(0, shown) as book, i (book.id)}
    <li role="none"><BookCard {book} active={i === active} {showAuthor} /></li>
  {/each}
</ol>

{#if books.length > shown}
  <button class="more" onclick={() => (shown += PAGE)}>عرض المزيد</button>
{/if}

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    /* minmax(0, …): one card with a long unbreakable line must not widen the whole list */
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .more {
    display: block;
    margin: 24px auto 0;
    padding: 6px 22px;
    border: 1px solid var(--rule);
    border-radius: 2px;
    background: none;
    cursor: pointer;
  }
  .more:hover {
    background: var(--paper-deep);
  }
</style>
