<script lang="ts">
  // The download on a book's title page: for a book with volumes, one dropdown (the whole book, or
  // one volume), then one button that says what it will download. Progress shows here, and the file
  // saves by itself.
  import type { Book } from '../lib/catalog/types.ts';
  import { cancel, download, isKept, save, start } from '../lib/download.svelte.ts';
  import { WHOLE_MAX_BYTES, type Choice } from '../lib/epub/protocol.ts';
  import { NOUNS, count, size } from '../lib/format.ts';
  import { storedVolumes } from '../lib/turath/volume-index.ts';
  import { volLong, volShort, type Volume } from '../lib/turath/volumes.ts';

  let { book, page }: { book: Book; page?: number } = $props();

  /** Dropdown values besides volume names. */
  const WHOLE = '';
  const LIST = '\u0000list';

  let stored: Volume[] | undefined = $state.raw();
  let kept = $state(false);
  /** WHOLE, a volume name, or LIST (read the book to show its volumes). */
  let chosen = $state(WHOLE);
  let preset = false; // the page link or size has picked the starting volume

  $effect(() => {
    const id = book.id;
    stored = undefined;
    kept = false;
    chosen = WHOLE;
    preset = false;
    storedVolumes(id).then((v) => {
      if (book.id === id) stored = v;
    });
    isKept(id).then((k) => {
      if (book.id === id) kept ||= k;
    });
  });

  const mine = $derived(download.bookId === book.id);
  const busy = $derived(mine && download.busy);
  // From the downloaded book once there is one; until then, the stored list.
  const volumes = $derived(download.volumes?.bookId === book.id ? download.volumes.list : stored);
  const multi = $derived(!!volumes && volumes.length > 1);
  /** Several volumes on the card, or no count and long enough to have several. */
  const mayHaveVolumes = $derived(book.volumes > 1 || (book.volumes === 0 && book.pages >= 800));
  /** The biggest books would not open in readers as one file. */
  const tooBig = $derived(book.size > WHOLE_MAX_BYTES);

  // Start on the volume a Shamela page link points to; a book too big for one file starts at its first volume.
  $effect(() => {
    if (volumes && !multi && chosen === LIST) chosen = WHOLE; // it turned out to be one volume
    if (!volumes || !multi || preset) return;
    preset = true;
    const v = page === undefined ? undefined : volumes.find((x) => page! - 1 >= x.first && page! - 1 < x.first + x.count);
    if (v) chosen = v.name;
    else if (tooBig || chosen === LIST) chosen = volumes[0].name;
  });

  // Once the book has been read here (a file made, or its volumes listed), it is kept in the browser.
  $effect(() => {
    if (mine && (download.stage === 'done' || download.volumes?.bookId === book.id)) kept = true;
  });

  const volume = $derived(multi ? volumes!.find((v) => v.name === chosen) : undefined);
  const choice: Choice = $derived(volume ? { kind: 'volume', name: volume.name } : { kind: 'whole' });
  /** What the button downloads: «الكتاب كاملًا», «الجزء ٤», or «الكتاب» for a one-volume book. */
  const what = $derived(volume ? volLong(volume.name) : multi || (mayHaveVolumes && !volumes) ? 'الكتاب كاملًا' : 'الكتاب');

  function onchange() {
    // No stored list: read the book once, then the dropdown fills with its volumes.
    if (chosen === LIST) start(book, { kind: 'list' });
  }

  const option = (v: Volume) =>
    `${volShort(v.name)}${v.label ? ` — ${v.label}` : ''}${v.kind ? ` (${v.kind === 'index' ? 'فهارس' : 'مقدمة'})` : ''}`;

  const STAGES = [
    ['download', 'تنزيل'],
    ['process', 'معالجة'],
    ['build', 'إنشاء'],
  ] as const;
  const stageIndex = $derived(STAGES.findIndex(([k]) => k === download.stage));
</script>

<div class="download">
  {#if multi && volumes}
    <label class="visually-hidden" for="volume">ما تريد تحميله</label>
    <select id="volume" bind:value={chosen} disabled={busy}>
      {#if !tooBig}<option value={WHOLE}>الكتاب كاملًا ({count(volumes.length, NOUNS.part)})</option>{/if}
      <optgroup label="الأجزاء">
        {#each volumes as v (v.name)}
          <option value={v.name}>{option(v)}</option>
        {/each}
      </optgroup>
    </select>
    {#if tooBig}<p class="hint">الكتاب أكبر من أن يُفتح في ملف واحد، فيُحمَّل جزءًا جزءًا.</p>{/if}
  {:else if mayHaveVolumes && !volumes}
    <label class="visually-hidden" for="volume">ما تريد تحميله</label>
    <select id="volume" bind:value={chosen} {onchange} disabled={busy}>
      <option value={WHOLE}>الكتاب كاملًا</option>
      <option value={LIST}>اختر جزءًا… (يُنزَّل الكتاب أولًا)</option>
    </select>
  {/if}

  {#if chosen !== LIST}
    <button class="primary" disabled={busy} onclick={() => start(book, choice)}>
      <span class="label">تحميل {what}</span>{#if !kept}<span class="size">{size(book.size)}</span>{/if}
    </button>
    {#if !busy}
      <!-- Never end on «EPUB»: a full stop after Latin shows on the wrong side. -->
      <p class="hint">
        {kept ? 'بصيغة EPUB، والكتاب محفوظ في متصفحك فيُنشأ الملف فورًا.' : 'بصيغة EPUB، ويُحفظ الكتاب في متصفحك لما بعدُ.'}
      </p>
    {/if}
  {/if}

  {#if busy}
    <div class="progress" role="status" aria-live="polite">
      <ol class="stages">
        {#each STAGES as [key, name], i (key)}
          <li class:active={i === stageIndex} class:done={i < stageIndex}>{name}</li>
        {/each}
      </ol>
      <div class="bar" aria-hidden="true"><div style:width="{Math.round(download.fraction * 100)}%"></div></div>
      <button class="link" onclick={cancel}>إلغاء</button>
    </div>
  {:else if mine && download.stage === 'done' && download.file}
    <p class="done" role="status">
      تمّ. حُفظ الملف «{download.file.name}».
      <button class="link" onclick={() => save(download.file!.url, download.file!.name)}>احفظه مرة أخرى</button>
    </p>
  {:else if mine && download.stage === 'error'}
    <p class="error" role="alert">
      {download.network
        ? 'تعذّر تنزيل الكتاب. تحقّق من الاتصال ثم أعد المحاولة.'
        : 'تعذّر إنشاء الملف من هذا الكتاب.'}
      <button class="link" onclick={() => start(book, chosen === LIST ? { kind: 'list' } : choice)}>أعد المحاولة</button>
    </p>
  {/if}
</div>

<style>
  .download {
    margin-top: 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  select {
    font: inherit;
    font-size: 1rem;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 2px;
    padding: 6px 10px;
    margin-bottom: 12px;
    width: 100%;
    max-width: 420px;
    cursor: pointer;
  }
  select:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    border-radius: 2px;
    padding: 10px 32px;
    font-size: 1.15rem;
    cursor: pointer;
    min-width: 220px;
  }
  .primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .primary:disabled {
    opacity: 0.6;
    cursor: default;
  }
  /* Each its own bidi run, so the digits stay with the size. */
  .label,
  .size {
    unicode-bidi: isolate;
  }
  /* A thin rule, not «·»: next to Arabic digits a dot reads as a zero («٢١٠»). */
  .size {
    font-size: 0.95rem;
    margin-inline-start: 0.6em;
    padding-inline-start: 0.6em;
    border-inline-start: 1px solid color-mix(in srgb, currentColor 45%, transparent);
  }
  .hint {
    font-size: 0.85rem;
    color: var(--ink-soft);
    margin: 8px 0 0;
    text-align: center;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 0.3em;
    cursor: pointer;
  }
  .progress {
    margin-top: 16px;
    width: 100%;
    max-width: 360px;
  }
  .stages {
    list-style: none;
    display: flex;
    justify-content: center;
    padding: 0;
    margin: 0 0 6px;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .stages li + li::before {
    content: '←';
    margin-inline: 0.6em;
    color: var(--rule);
  }
  .stages .active {
    color: var(--ink);
  }
  .stages .done {
    color: var(--accent);
  }
  .bar {
    height: 3px;
    background: var(--rule-soft);
    margin-bottom: 8px;
  }
  .bar div {
    height: 100%;
    background: var(--accent);
    transition: width 0.15s linear;
  }
  @media (prefers-reduced-motion: reduce) {
    .bar div {
      transition: none;
    }
  }
  .progress .link {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .done,
  .error {
    margin: 12px 0 0;
    font-size: 0.95rem;
    overflow-wrap: anywhere;
  }
  .done .link,
  .error .link {
    font-size: 0.9rem;
    margin-inline-start: 6px;
  }
  @media (max-width: 480px) {
    .primary {
      width: 100%;
    }
  }
</style>
