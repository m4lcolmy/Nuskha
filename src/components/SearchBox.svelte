<script lang="ts">
  import { store } from '../lib/catalog/store.svelte.ts';
  import { go, route } from '../lib/route.svelte.ts';
  import { parseBookLink } from '../lib/search/search.ts';
  import { ui } from '../lib/ui.svelte.ts';

  let { large = false }: { large?: boolean } = $props();
  let input: HTMLInputElement;

  $effect(() => {
    ui.searchInput = input;
  });

  function oninput(e?: Event) {
    const q = input.value;
    // A pasted shamela.ws link goes straight to the book (and the volume of its page). Not while
    // typing one: «…/book/8» is already a link.
    const pasted = e instanceof InputEvent && (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop');
    const link = pasted ? parseBookLink(q) : undefined;
    if (link && store.catalog?.byId.has(link.book)) {
      input.value = '';
      go({ book: link.book, page: link.page });
      return;
    }
    // The first letter typed from another view adds a history entry; the rest replace it.
    const inResults = route.book === undefined && route.author === undefined && (route.q.trim() !== '' || route.cat !== undefined);
    go({ q, cat: route.book === undefined && route.author === undefined ? route.cat : undefined }, { replace: inResults });
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      input.value = '';
      oninput();
    }
  }
</script>

<form class="search" class:large role="search" onsubmit={(e) => e.preventDefault()}>
  <label for="q" class="visually-hidden">ابحث في المكتبة</label>
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
    ><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg
  >
  <input
    id="q"
    bind:this={input}
    type="search"
    value={route.q}
    {oninput}
    {onkeydown}
    placeholder="ابحث بالعنوان أو المؤلف أو المحقق"
    autocomplete="off"
    spellcheck="false"
    enterkeyhint="search"
    role="combobox"
    aria-autocomplete="list"
    aria-controls="results"
    aria-expanded={route.q.trim() !== ''}
    aria-activedescendant={ui.activeId || undefined}
  />
  <kbd class="hint" aria-hidden="true">/</kbd>
</form>

<style>
  .search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid var(--ink);
    padding: 2px 2px 4px;
  }
  .search:focus-within {
    border-bottom-color: var(--accent);
    box-shadow: 0 1px 0 var(--accent);
  }
  .icon {
    width: 20px;
    height: 20px;
    flex: none;
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1.05rem;
    padding: 6px 0;
  }
  input:focus {
    outline: none;
  }
  input::placeholder {
    color: var(--ink-soft);
    opacity: 0.85;
  }
  input::-webkit-search-cancel-button {
    filter: grayscale(1);
  }
  .large {
    padding-bottom: 6px;
  }
  .large input {
    font-size: 1.3rem;
  }
  .large .icon {
    width: 24px;
    height: 24px;
  }
  .hint {
    font: 0.75rem/1 var(--text);
    color: var(--ink-soft);
    border: 1px solid var(--rule-soft);
    border-radius: 3px;
    padding: 3px 6px;
  }
  .search:focus-within .hint {
    display: none;
  }
  @media (hover: none) {
    .hint {
      display: none;
    }
  }
</style>
