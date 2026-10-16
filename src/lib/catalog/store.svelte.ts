// Loads the catalog once. The list of books is ready first (for shelves and book pages);
// the search index is built right after, without holding up the first paint.

import { decodeCatalog, type Catalog, type CatalogFile } from './types.ts';
import { CatalogSearch } from '../search/search.ts';

class Store {
  // Raw: thousands of books don't need deep reactivity.
  catalog: Catalog | undefined = $state.raw();
  search: CatalogSearch | undefined = $state.raw();
  error: string | undefined = $state();
}

export const store = new Store();

export async function loadCatalog() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = decodeCatalog((await res.json()) as CatalogFile);
    store.catalog = catalog;
    // Let the shelves paint before the ~0.3 s index build. (Not requestAnimationFrame: it never
    // fires in a background tab, which would leave search waiting forever.)
    await new Promise((r) => setTimeout(r, 50));
    store.search = new CatalogSearch(catalog);
  } catch (err) {
    store.error = String(err);
  }
}
