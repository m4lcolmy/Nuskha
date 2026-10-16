<script lang="ts">
  // Day / «قاعة المطالعة ليلًا». Day by default; the reader's pick is remembered.
  let dark = $state(document.documentElement.dataset.theme === 'dark');

  function toggle() {
    dark = !dark;
    const picked = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = picked;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content = dark ? '#1c1714' : '#f6f1e7';
    try {
      localStorage.setItem('theme', picked);
    } catch {
      // private mode: the choice lasts for this visit only
    }
  }
</script>

<button class="toggle" onclick={toggle} aria-pressed={dark} title={dark ? 'قاعة المطالعة نهارًا' : 'قاعة المطالعة ليلًا'}>
  <span class="visually-hidden">قاعة المطالعة ليلًا</span>
  {#if dark}
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><circle cx="12" cy="12" r="4.5" /><path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
      /></svg
    >
  {:else}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
  {/if}
</button>

<style>
  .toggle {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid transparent;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }
  .toggle:hover {
    border-color: var(--rule-soft);
  }
  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
