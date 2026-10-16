<script lang="ts">
  // The download on a book's title page: one button for the whole book, and for a book with volumes
  // a list of them under it, grouped by the book's own parts when it has them («كتاب سيرة رسول الله ﷺ»
  // ج٣–ج٩), each with its own button. A list on the page, not a <select>: the system draws a select's
  // menu (on Linux it covers the page and cuts long names), and it can't show a second line.
  // Each download comes as EPUB or PDF, side by side; the PDF's page size is chosen under them.
  // Progress shows next to the button pressed, and the file saves by itself.
  import type { Book } from '../lib/catalog/types.ts';
  import { cancel, download, isEngineKept, isKept, save, start } from '../lib/download.svelte.ts';
  import { WHOLE_MAX_BYTES, type Choice, type Format } from '../lib/epub/protocol.ts';
  import { PDF_MAX_PAGES } from '../lib/pdf/protocol.ts';
  import type { PageSize } from '../lib/pdf/template.ts';
  import { NOUNS, count, size } from '../lib/format.ts';
  import { storedVolumes } from '../lib/turath/volume-index.ts';
  import { volLong, volShort, type Volume } from '../lib/turath/volumes.ts';

  let { book, page }: { book: Book; page?: number } = $props();

  let stored: Volume[] | undefined = $state.raw();
  let kept = $state(false);
  /** What was last started here, so its progress shows next to its button. */
  let active: Choice = $state.raw({ kind: 'whole' });
  let open = $state(false);
  let opened = false; // the list has been opened once by itself
  /** The format last started here. */
  let activeFormat: Format['kind'] = $state('epub');
  let engineKept = $state(false);
  isEngineKept().then((k) => (engineKept ||= k));

  // The PDF page size, remembered in this browser.
  const SIZE_KEY = 'nuskha.pdfSize';
  let pdfSize: PageSize = $state(readSize());
  function readSize(): PageSize {
    try {
      return localStorage.getItem(SIZE_KEY) === '17x24' ? '17x24' : 'a5';
    } catch {
      return 'a5';
    }
  }
  $effect(() => {
    try {
      localStorage.setItem(SIZE_KEY, pdfSize);
    } catch {
      // No storage: the choice lasts as long as the page.
    }
  });

  $effect(() => {
    const id = book.id;
    stored = undefined;
    kept = false;
    active = { kind: 'whole' };
    open = opened = false;
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
  /** The volume holding the Shamela page the link pointed to. */
  const pointed = $derived(
    page === undefined || !volumes ? undefined : volumes.find((x) => page - 1 >= x.first && page - 1 < x.first + x.count),
  );

  /** Runs of volumes in the same part of the book; one run with no part for most books. */
  const groups = $derived.by(() => {
    const gs: { part: string; vols: Volume[] }[] = [];
    for (const v of multi ? volumes! : []) {
      const g = gs.at(-1);
      if (g && g.part === v.part) g.vols.push(v);
      else gs.push({ part: v.part, vols: [v] });
    }
    return gs;
  });

  // Open the list by itself when it is the way to download: the book is too big for one file, a page
  // link points into a volume, or the reader asked to see the volumes.
  $effect(() => {
    if (!multi || opened) return;
    if (tooBig || pointed || active.kind === 'list') open = opened = true;
  });

  // Once the book has been read here (a file made, or its volumes listed), it is kept in the browser.
  $effect(() => {
    if (mine && (download.stage === 'done' || download.volumes?.bookId === book.id)) kept = true;
  });

  /** What the main button downloads: «الكتاب كاملًا», or «الكتاب» for a one-volume book. */
  const what = $derived(multi || (mayHaveVolumes && !volumes) ? 'الكتاب كاملًا' : 'الكتاب');

  function go(choice: Choice, format: Format['kind'] = activeFormat) {
    active = choice;
    activeFormat = format;
    start(book, choice, format === 'pdf' ? { kind: 'pdf', size: pdfSize } : { kind: 'epub' });
  }

  /** Whether the progress or result of `choice` belongs here: the last one started on this book. */
  const at = (choice: Choice) =>
    mine &&
    (active.kind === choice.kind || (active.kind === 'list' && choice.kind === 'whole')) &&
    (choice.kind !== 'volume' || (active.kind === 'volume' && active.name === choice.name));

  /** A PDF is made in the browser; past this many pages a phone runs out of memory. */
  const pdfWhole = $derived(book.pages <= PDF_MAX_PAGES);
  const pdfVolume = (v: Volume) => v.count <= PDF_MAX_PAGES;
  // Once a PDF is made, the engine is kept.
  $effect(() => {
    if (mine && download.stage === 'done' && download.format?.kind === 'pdf') engineKept = true;
  });

  const STAGES = [
    ['download', 'تنزيل'],
    ['process', 'معالجة'],
    ['build', 'إنشاء'],
  ] as const;
  const stageIndex = $derived(STAGES.findIndex(([k]) => k === download.stage));
</script>

{#snippet status(choice: Choice)}
  {#if at(choice) && busy}
    <div class="progress" role="status" aria-live="polite">
      <ol class="stages">
        {#each STAGES as [key, name], i (key)}
          <li class:active={i === stageIndex} class:done={i < stageIndex}>{name}</li>
        {/each}
      </ol>
      {#if download.engine}<p class="hint">تنزيل محرّك PDF، مرة واحدة ثم يبقى في متصفحك.</p>{/if}
      <div class="bar" aria-hidden="true"><div style:width="{Math.round(download.fraction * 100)}%"></div></div>
      <button class="link" onclick={cancel}>إلغاء</button>
    </div>
  {:else if at(choice) && download.stage === 'done' && download.file}
    <p class="done" role="status">
      تمّ. حُفظ الملف «{download.file.name}».
      <button class="link" onclick={() => save(download.file!.url, download.file!.name)}>احفظه مرة أخرى</button>
    </p>
  {:else if at(choice) && download.stage === 'error'}
    <p class="error" role="alert">
      {download.network
        ? 'تعذّر تنزيل الكتاب. تحقّق من الاتصال ثم أعد المحاولة.'
        : 'تعذّر إنشاء الملف من هذا الكتاب.'}
      <button class="link" onclick={() => go(active)}>أعد المحاولة</button>
    </p>
  {/if}
{/snippet}

{#snippet sizes()}
  <fieldset class="sizes">
    <legend>حجم صفحة PDF</legend>
    <label><input type="radio" bind:group={pdfSize} value="a5" /> <span>A5</span> <span class="for">للقراءة على الشاشة</span></label>
<!-- LRMs: Arabic-Indic digits around «×» would show as «٢٤×١٧» even left to right. -->
    <label><input type="radio" bind:group={pdfSize} value="17x24" /> <span><bdi dir="ltr">١٧&lrm;×&lrm;٢٤</bdi> سم</span> <span class="for">للطباعة</span></label>
  </fieldset>
  {#if !engineKept}<p class="hint small">أول ملف PDF يُنزَّل معه محرّك الإنشاء (١١ م.ب) مرة واحدة.</p>{/if}
{/snippet}

<div class="download">
  {#if !(multi && tooBig)}
    {#if what === 'الكتاب كاملًا'}<p class="what">الكتاب كاملًا</p>{/if}
    <div class="formats">
      <button class="primary" disabled={busy} onclick={() => go({ kind: 'whole' }, 'epub')}>
        <span class="label">تحميل EPUB</span>{#if !kept}<span class="size">{size(book.size)}</span>{/if}
      </button>
      <button
        class="primary pdf"
        disabled={busy || !pdfWhole}
        title={pdfWhole ? undefined : 'الكتاب أكبر من أن يُنشأ PDF منه في المتصفح؛ اختر جزءًا'}
        onclick={() => go({ kind: 'whole' }, 'pdf')}
      >
        <span class="label">تحميل PDF</span>
      </button>
    </div>
    {@render sizes()}
    {#if !(at({ kind: 'whole' }) && (busy || download.stage === 'error'))}
      <!-- Never end on a Latin word: a full stop after it shows on the wrong side. -->
      <p class="hint">
        {kept ? 'الكتاب محفوظ في متصفحك، فيُنشأ الملف فورًا.' : 'يُحفظ الكتاب في متصفحك لما بعدُ.'}
        {#if !pdfWhole}{multi || mayHaveVolumes ? 'ويُنشأ PDF لكل جزء على حدة.' : 'والكتاب أكبر من أن يُنشأ منه PDF في المتصفح.'}{/if}
      </p>
    {/if}
    {@render status({ kind: 'whole' })}
  {/if}

  {#if multi && volumes}
    <details class="volumes" bind:open>
      <summary>
        {tooBig ? 'اختر جزءًا لتحميله' : 'أو حمّل جزءًا واحدًا'}
        <span class="n">{count(volumes.length, NOUNS.part)}</span>
      </summary>
      {#if tooBig}
        <p class="hint">الكتاب أكبر من أن يُفتح في ملف واحد، فيُحمَّل جزءًا جزءًا.</p>
      {/if}
      {#if !kept}
        <p class="hint">يُنزَّل الكتاب كله أول مرة ({size(book.size)})، ثم يُنشأ كل جزء منه فورًا.</p>
      {/if}
      {#each groups as g, gi (gi)}
        <section class="group">
          {#if g.part}<h3 class="part">{g.part}</h3>{/if}
          <ul>
            {#each g.vols as v (v.name)}
              {@const choice = { kind: 'volume', name: v.name } satisfies Choice}
              <li class:here={v === pointed}>
                <div class="row">
                  <span class="vol">{volShort(v.name)}</span>
                  <div class="what">
                    {#if v.label}<span class="label"><span class="lead">أوّله:</span> {v.label}</span>{/if}
                    <span class="meta">
                      <span>{count(v.count, NOUNS.page)}</span>
                      {#if v.kind}<span class="tag">{v.kind === 'index' ? 'فهارس' : 'مقدمة'}</span>{/if}
                      {#if v === pointed}<span class="tag">فيه الصفحة المطلوبة</span>{/if}
                    </span>
                    {#if v.begins}<span class="begins">وفيه يبدأ: {v.begins}</span>{/if}
                  </div>
                  <div class="gets">
                    <button class="get" disabled={busy} onclick={() => go(choice, 'epub')} aria-label="تحميل {volLong(v.name)} بصيغة EPUB">
                      EPUB
                    </button>
                    <button
                      class="get"
                      disabled={busy || !pdfVolume(v)}
                      title={pdfVolume(v) ? undefined : 'الجزء أكبر من أن يُنشأ PDF منه في المتصفح'}
                      onclick={() => go(choice, 'pdf')}
                      aria-label="تحميل {volLong(v.name)} بصيغة PDF"
                    >
                      PDF
                    </button>
                  </div>
                </div>
                {@render status(choice)}
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </details>
  {:else if mayHaveVolumes && !volumes}
    {#if !(at({ kind: 'list' }) && (busy || download.stage === 'error'))}
      <button class="link more" disabled={busy} onclick={() => go({ kind: 'list' })}>
        اختر جزءًا… (يُنزَّل الكتاب أولًا)
      </button>
    {/if}
    {@render status({ kind: 'list' })}
  {/if}
</div>

<style>
  .download {
    margin-top: 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
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
  .what {
    margin: 0 0 8px;
    color: var(--ink-soft);
    font-size: 0.95rem;
  }
  .formats {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .formats .primary {
    min-width: 180px;
  }
  .primary.pdf {
    background: none;
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .primary.pdf:hover:not(:disabled) {
    background: var(--accent);
    color: var(--accent-ink);
    filter: none;
  }
  .sizes {
    border: 0;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 18px;
    font-size: 0.9rem;
  }
  .sizes legend {
    float: right;
    color: var(--ink-soft);
    margin-inline-end: 4px;
  }
  .sizes label {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    cursor: pointer;
  }
  .sizes input {
    accent-color: var(--accent);
    margin: 0;
    align-self: center;
  }
  .sizes .for {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
  .hint.small {
    font-size: 0.8rem;
    margin-top: 4px;
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
  .more {
    margin-top: 14px;
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  .more:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .volumes {
    margin-top: 22px;
    width: 100%;
    max-width: 520px;
    text-align: start;
  }
  summary {
    cursor: pointer;
    text-align: center;
    color: var(--ink-soft);
    font-size: 0.95rem;
    padding: 4px 0;
  }
  summary:hover {
    color: var(--ink);
  }
  summary .n {
    unicode-bidi: isolate;
    margin-inline-start: 0.4em;
    font-size: 0.85rem;
  }
  .volumes > .hint {
    margin-bottom: 4px;
  }
  .group {
    margin-top: 14px;
  }
  .part {
    font: inherit;
    font-family: var(--serif);
    font-size: 1.05rem;
    color: var(--accent);
    margin: 0 0 2px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--rule);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    border-bottom: 1px solid var(--rule-soft);
    padding: 8px 6px;
  }
  li.here {
    background: var(--paper-deep);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .vol {
    flex: none;
    min-width: 2.6em;
    font-family: var(--serif);
    font-size: 1.05rem;
    unicode-bidi: isolate;
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.6;
  }
  .what .label {
    font-size: 0.95rem;
    unicode-bidi: normal;
    overflow-wrap: anywhere;
  }
  .lead {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .tag {
    color: var(--accent);
  }
  .begins {
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .gets {
    flex: none;
    display: flex;
    gap: 6px;
  }
  .get {
    flex: none;
    font-family: inherit;
    background: none;
    border: 1px solid var(--accent);
    color: var(--accent);
    border-radius: 2px;
    padding: 2px 14px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .get:hover:not(:disabled) {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .get:disabled {
    opacity: 0.5;
    cursor: default;
  }
  li .progress,
  li .done,
  li .error {
    max-width: none;
    margin-top: 8px;
    text-align: center;
  }
  @media (max-width: 480px) {
    .formats {
      width: 100%;
    }
    .formats .primary {
      flex: 1;
      min-width: 0;
      padding-inline: 12px;
    }
  }
</style>
