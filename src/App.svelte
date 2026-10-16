<script lang="ts">
  import { store } from './lib/catalog/store.svelte.ts';
  import { NOUNS, count } from './lib/format.ts';
  import { href, linkHandler, route } from './lib/route.svelte.ts';
  import { ui } from './lib/ui.svelte.ts';
  import AuthorPage from './components/AuthorPage.svelte';
  import BookPage from './components/BookPage.svelte';
  import Results from './components/Results.svelte';
  import SearchBox from './components/SearchBox.svelte';
  import Shelves from './components/Shelves.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';

  const view = $derived(
    route.book !== undefined
      ? 'book'
      : route.author !== undefined
        ? 'author'
        : route.q.trim() || route.cat !== undefined
          ? 'results'
          : 'home',
  );
  const home = $derived(view === 'home');

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      ui.focusSearch();
    }
  }
</script>

<svelte:document onclick={linkHandler} />
<svelte:window {onkeydown} />

<a class="skip" href="#main">تخطَّ إلى المحتوى</a>

<div class="page" class:home>
  <header class="masthead">
    <a class="wordmark" href={href({})} aria-label="نسخة: الصفحة الرئيسية">نسخة</a>
    <div class="theme"><ThemeToggle /></div>
    {#if home}
      <p class="tagline">المكتبة الشاملة، نسخةً في يدك</p>
    {/if}
    <div class="searchwrap">
      <SearchBox large={home} />
    </div>
    {#if home && store.catalog}
      <p class="stats">
        {count(store.catalog.books.length, NOUNS.book)} · {count(store.catalog.authors.size, NOUNS.author)}
        <br />ويمكنك لصق رابط كتاب من الشاملة أو كتابة رقمه.
      </p>
    {/if}
  </header>

  <main id="main" tabindex="-1">
    {#if store.error}
      <p class="error" role="alert">تعذّر تحميل الفهرس. تحقّق من الاتصال ثم أعد تحميل الصفحة.</p>
    {:else if view === 'book'}
      <BookPage id={route.book!} />
    {:else if view === 'author'}
      <AuthorPage id={route.author!} />
    {:else if view === 'results'}
      <Results />
    {:else if store.catalog}
      <Shelves />
    {/if}
  </main>

  <footer>
    <p>
      الكتب من <a href="https://turath.io" target="_blank" rel="noopener">تراث</a> و<a
        href="https://shamela.ws"
        target="_blank"
        rel="noopener">المكتبة الشاملة</a
      >. لا تحفظ «نسخة» الكتب؛ يُنزَّل الكتاب ويُنشأ ملفه في متصفحك.
    </p>
  </footer>
</div>

<style>
  .skip {
    position: absolute;
    inset-inline-start: 8px;
    top: -60px;
    background: var(--accent);
    color: var(--accent-ink);
    padding: 6px 12px;
    z-index: 10;
  }
  .skip:focus {
    top: 8px;
  }
  .page {
    max-width: 880px;
    margin: 0 auto;
    padding: 0 16px 32px;
    padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right));
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  main {
    flex: 1;
    outline: none;
  }

  /* Compact masthead (results, book, author) */
  .masthead {
    padding: 10px 0 20px;
    margin-bottom: 24px;
    border-bottom: 1px solid var(--rule-soft);
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas: 'brand search theme';
    align-items: center;
    gap: 8px 24px;
  }
  .wordmark {
    grid-area: brand;
    font: 400 2rem/1.2 var(--serif);
    text-decoration: none;
    color: var(--ink);
  }
  .searchwrap {
    grid-area: search;
  }
  .theme {
    grid-area: theme;
  }

  /* Home: the wordmark large and centred above one search line */
  .home .masthead {
    display: block;
    text-align: center;
    border-bottom: 0;
    padding-top: 12vh;
    margin-bottom: 0;
  }
  .home .theme {
    position: absolute;
    top: 12px;
    inset-inline-end: 12px;
  }
  .home .wordmark {
    font-size: clamp(4rem, 16vw, 6rem);
    line-height: 1.1;
  }
  .tagline {
    margin: 4px 0 36px;
    font: 400 1.3rem/1.6 var(--serif);
    color: var(--ink-soft);
  }
  .home .searchwrap {
    max-width: 620px;
    margin: 0 auto;
    text-align: start;
  }
  .stats {
    margin: 10px 0 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }

  .error {
    text-align: center;
    margin-top: 48px;
  }

  footer {
    margin-top: 64px;
    padding-top: 16px;
    border-top: 1px solid var(--rule-soft);
    font-size: 0.8rem;
    color: var(--ink-soft);
    text-align: center;
  }
  footer p {
    margin: 0;
  }

  @media (max-width: 640px) {
    .masthead {
      grid-template-columns: 1fr auto;
      grid-template-areas: 'brand theme' 'search search';
      gap: 4px 12px;
      padding-bottom: 0;
      margin-bottom: 24px;
      border-bottom: 0; /* the search line is the rule */
    }
    .wordmark {
      font-size: 1.7rem;
    }
    .home .masthead {
      padding-top: 10vh;
    }
  }
</style>
