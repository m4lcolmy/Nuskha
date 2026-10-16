<script lang="ts">
  // «الرفوف»: the categories as bookcases, each a short table of contents with dot leaders.
  import { store } from '../lib/catalog/store.svelte.ts';
  import { num } from '../lib/format.ts';
  import { href } from '../lib/route.svelte.ts';
  import { bookcases } from '../lib/shelves.ts';

  const cases = $derived(store.catalog ? bookcases(store.catalog.cats) : []);
  const counts = $derived.by(() => {
    const m = new Map<number, number>();
    for (const b of store.catalog?.books ?? []) if (b.category) m.set(b.category.id, (m.get(b.category.id) ?? 0) + 1);
    return m;
  });
</script>

<section class="shelves" aria-labelledby="shelves-heading">
  <h2 id="shelves-heading"><span aria-hidden="true">۞</span> الرفوف</h2>
  <div class="cases">
    {#each cases as bc (bc.key)}
      <div class="case" style:--bind="var(--bind-{bc.key})">
        <h3>{bc.name}</h3>
        <ul>
          {#each bc.cats as c (c.id)}
            <li>
              <a href={href({ cat: c.id })}>
                <span class="name">{c.name}</span>
                <span class="dots" aria-hidden="true"></span>
                <span class="n">{num(counts.get(c.id) ?? 0)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
</section>

<style>
  .shelves {
    margin-top: 48px;
  }
  h2 {
    font: 400 1.5rem/1.4 var(--serif);
    text-align: center;
    margin: 0 0 24px;
  }
  h2 span {
    color: var(--rule);
    font-size: 1.1rem;
    margin-inline-end: 4px;
  }
  .cases {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr));
    gap: 28px 36px;
  }
  .case {
    border-top: 3px solid var(--bind);
    padding-top: 8px;
  }
  h3 {
    font: 400 1.3rem/1.5 var(--serif);
    margin: 0 0 4px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  a {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 0;
    text-decoration: none;
    font-size: 0.98rem;
  }
  a:hover .name {
    text-decoration: underline;
    text-decoration-color: var(--rule);
  }
  .dots {
    flex: 1;
    min-width: 12px;
    border-bottom: 1px dotted var(--rule);
    transform: translateY(-0.35em);
  }
  .n {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
</style>
