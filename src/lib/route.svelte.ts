// The page state lives in the URL, so every view can be shared and Back works:
//   ?q=سير اعلام   search          ?cat=26     a shelf (can be combined with q)
//   ?author=362     an author       ?book=22669 a book's title page

export interface Route {
  q: string;
  cat?: number;
  author?: number;
  book?: number;
}

const int = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

function fromUrl(): Route {
  const p = new URLSearchParams(location.search);
  return { q: p.get('q') ?? '', cat: int(p.get('cat')), author: int(p.get('author')), book: int(p.get('book')) };
}

export function href(r: Partial<Route>): string {
  const p = new URLSearchParams();
  if (r.book !== undefined) p.set('book', String(r.book));
  else if (r.author !== undefined) p.set('author', String(r.author));
  else {
    if (r.q?.trim()) p.set('q', r.q);
    if (r.cat !== undefined) p.set('cat', String(r.cat));
  }
  const s = p.toString();
  return s ? `?${s}` : location.pathname;
}

export const route: Route = $state(fromUrl());

/** Go to a view. `replace` is for typing in the search box, so Back doesn't step through every letter. */
export function go(r: Partial<Route>, { replace = false } = {}) {
  const url = href(r);
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  Object.assign(route, { q: '', cat: undefined, author: undefined, book: undefined }, r);
  if (!replace) window.scrollTo(0, 0);
}

addEventListener('popstate', () => Object.assign(route, fromUrl()));

/** Follow same-page links (`<a href="?book=1">`) without reloading; let modified clicks open new tabs. */
export function linkHandler(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest('a');
  if (!a || a.target || a.origin !== location.origin || a.pathname !== location.pathname) return;
  e.preventDefault();
  const p = new URLSearchParams(a.search);
  go({ q: p.get('q') ?? '', cat: int(p.get('cat')), author: int(p.get('author')), book: int(p.get('book')) });
}
