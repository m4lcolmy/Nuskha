// The book details printed in the EPUB (title page, metadata), from the catalog.

import type { Book } from '../catalog/types.ts';
import { died, published, splitTitle } from '../format.ts';
import type { EpubMeta } from './build.ts';

export function epubMeta(b: Book): EpubMeta {
  const { main, edition } = splitTitle(b.title);
  return {
    id: b.id,
    title: b.title,
    mainTitle: main,
    edition,
    author: b.author ? b.author.fullName || b.author.name : '',
    died: died(b.author),
    editor: b.editor,
    publisher: b.publisher,
    imprint: [b.edition && `الطبعة ${b.edition}`, published(b)].filter(Boolean).join('، '),
    category: b.category?.name ?? '',
  };
}
