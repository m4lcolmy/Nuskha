<script lang="ts">
  // A catalog card. The coloured edge is the binding of the book's bookcase.
  import type { Book } from '../lib/catalog/types.ts';
  import { NOUNS, count, died, num, published, splitTitle } from '../lib/format.ts';
  import { bindingColor } from '../lib/shelves.ts';
  import { href } from '../lib/route.svelte.ts';

  let { book, active = false, showAuthor = true }: { book: Book; active?: boolean; showAuthor?: boolean } = $props();

  const title = $derived(splitTitle(book.title));
  // [text, keep on one line]: numbers stay with their nouns («١٨ جزءًا»); publisher names
  // can be very long («وزارة الشؤون الإسلامية …») and must be free to wrap.
  const facts = $derived(
    (
      [
        [book.publisher, false],
        [published(book), true],
        [book.volumes > 1 ? count(book.volumes, NOUNS.part) : '', true],
        [count(book.pages, NOUNS.page), true],
      ] as [string, boolean][]
    ).filter(([text]) => text),
  );
</script>

<a
  class="card"
  class:active
  id="r-{book.id}"
  href={href({ book: book.id })}
  role="option"
  aria-selected={active}
  style:--bind={bindingColor(book.category)}
>
  <span class="title">{title.main}</span>
  {#if title.edition}<span class="edition">{title.edition}</span>{/if}
  {#if showAuthor && book.author}
    <span class="by">{book.author.name}{#if died(book.author)}<span class="sep">·</span>{died(book.author)}{/if}</span>
  {/if}
  <span class="facts">
    {#each facts as [text, keep], i}<span class:keep>{text}{#if i < facts.length - 1}<span class="sep">·</span>{/if}</span
      >{' '}{/each}
  </span>
  <span class="foot">
    {#if book.printed}<span class="badge">موافق للمطبوع</span>{/if}
    <span class="callno">رقم {num(book.id)}</span>
  </span>
</a>

<style>
  .card {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    padding: 12px 16px 10px;
    border: 1px solid var(--rule-soft);
    border-inline-start: 4px solid var(--bind);
    border-radius: 2px;
    text-decoration: none;
    color: var(--ink);
    background: var(--paper);
  }
  .card:hover,
  .card.active {
    background: var(--paper-deep);
    border-color: var(--rule);
    border-inline-start-color: var(--bind);
  }
  .card.active {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .title {
    font: 400 1.35rem/1.5 var(--serif);
    overflow-wrap: anywhere;
  }
  .edition {
    font-size: 0.9rem;
    color: var(--ink-soft);
    margin-top: -2px;
  }
  .by {
    font-size: 0.95rem;
  }
  .facts {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .keep {
    white-space: nowrap;
  }
  .sep {
    margin-inline: 0.45em;
    color: var(--rule);
  }
  .facts .sep {
    margin-inline-end: 0;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 0.78rem;
  }
  .badge {
    color: var(--accent);
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0 6px;
    line-height: 1.7;
  }
  .callno {
    margin-inline-start: auto;
    color: var(--ink-soft);
  }
</style>
