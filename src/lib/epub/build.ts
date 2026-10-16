// Builds an EPUB 3 from a turath book: the whole book, one volume or a range of volumes.
//
//   cover · title page · book card («بطاقة الكتاب») · «الفهرس» · text
//
// Right to left throughout; a table of contents nested by heading level (each volume a top-level
// section when there are several); printed page numbers as page breaks plus a page-list; footnotes
// as noteref → aside, which readers with pop-ups show as pop-ups. Text files are split at headings
// into pieces of about 250 KB so readers open and turn pages fast. Runs in a worker or in Node.

import { strToU8, zipSync, type Zippable } from 'fflate';
import { num } from '../format.ts';
import type { TurathBook } from '../turath/book.ts';
import { spellHonorifics } from '../turath/honorifics.ts';
import { volLong, volShort, type Volume } from '../turath/volumes.ts';
import { esc, escAttr, renderPage, type Note } from './page.ts';
import { CSS } from './style.ts';

export interface EpubMeta {
  id: number;
  /** Full catalog title, with the edition: «سير أعلام النبلاء - ط الحديث». */
  title: string;
  /** Title without the edition, and the edition: «سير أعلام النبلاء», «ط الحديث». */
  mainTitle: string;
  edition: string;
  author: string;
  /** «ت ٧٤٨ هـ» or "". */
  died: string;
  editor: string;
  publisher: string;
  /** «الطبعة الأولى، ١٤٠٨ هـ / ١٩٨٨ م» or "". */
  imprint: string;
  category: string;
}

export interface EpubInput {
  book: TurathBook;
  meta: EpubMeta;
  /** All the book's volumes, from volumesOf(). */
  volumes: Volume[];
  /** Volumes to include (indexes into `volumes`, inclusive). */
  from: number;
  to: number;
  /** Amiri as TTF. */
  font?: Uint8Array;
  /** JPEG. */
  cover?: Uint8Array;
  /** For dcterms:modified and the card. */
  date?: Date;
  onProgress?: (fraction: number) => void;
}

/** About 250 KB of UTF-8 Arabic text per file: cut at a heading once past TARGET characters, anywhere past MAX. */
const TARGET = 120_000;
const MAX = 200_000;

interface TextFile {
  name: string;
  body: string;
  /** epub:type of the body. */
  type: string;
}

interface TocEntry {
  title: string;
  level: number;
  /** Relative to the package root: «text/t0003.xhtml#h12». */
  href: string;
  children: TocEntry[];
}

interface FihrisItem {
  title: string;
  level: number;
  href: string;
  vol: string;
  page: number | null;
}

export function buildEpub(input: EpubInput): Uint8Array {
  const { book, meta, volumes } = input;
  const date = input.date ?? new Date();
  const selected = volumes.slice(input.from, input.to + 1);
  const names = new Set(selected.map((v) => v.name));
  const multi = volumes.length > 1; // page markers name the volume
  const parts = selected.length > 1; // each volume opens with its own page and TOC section
  const whole = selected.length === volumes.length;

  // --- text files ---------------------------------------------------------------------------
  const files: TextFile[] = [];
  const where = new Map<string, string>(); // element id → its file
  const seq = new Map<string, number>(); // element id → position in the book
  const usedIds = new Set<string>();
  const pageList: { label: string; href: string }[] = [];
  const volStart = new Map<string, string>(); // volume name → href of its opening page
  let cur: (string | Note[])[] = [];
  let size = 0;
  let open: string | null = null; // a paragraph that may carry on over the page
  let pending: Note[][] = []; // notes waiting for that paragraph to close
  let lastNotes: { notes: Note[]; file: number } | undefined;

  const fileHref = () => `text/t${String(files.length + 1).padStart(4, '0')}.xhtml`;
  const emit = (part: string | Note[]) => {
    cur.push(part);
    size += typeof part === 'string' ? part.length : part.reduce((n, x) => n + x.lines.join('').length, 0);
  };
  const closePara = () => {
    if (open !== null) emit(open + '</p>');
    open = null;
    for (const n of pending) emit(n);
    pending = [];
  };
  const flush = () => {
    closePara();
    if (!cur.length) return;
    const body = cur.map((x) => (typeof x === 'string' ? x : notesHtml(x))).join('\n');
    files.push({ name: fileHref().slice('text/'.length), body, type: 'bodymatter' });
    cur = [];
    size = 0;
  };
  const anchor = (id: string) => {
    where.set(id, fileHref());
    seq.set(id, seq.size);
  };

  const levelOf = (n: number) => book.headings[n - 1]?.level;
  const pageIdx = book.pages.flatMap((p, i) => (names.has(p.vol) ? [i] : []));
  let done = 0;
  let vol: string | undefined;

  for (const i of pageIdx) {
    const p = book.pages[i];
    if (p.vol !== vol) {
      vol = p.vol;
      if (parts) {
        flush();
        volStart.set(vol, `${fileHref()}#v-${i + 1}`);
        emit(`<h1 class="vol" id="v-${i + 1}">${esc(volLong(vol))}</h1>\n<p class="orn" aria-hidden="true">۞</p>`);
        flush();
      }
    }

    const out = renderPage(p.text, { key: String(i + 1), levelOf, usedIds });
    const first = out.blocks[0];

    // A note starting with «=» carries on the last note of the page before.
    if (out.notes[0]?.cont && lastNotes && lastNotes.file === files.length) {
      lastNotes.notes.at(-1)!.lines.push(...out.notes.shift()!.lines);
    }

    // A new file at a top-level heading, at any heading once the file is big, or anywhere if huge.
    const chapter = first?.kind === 'h' && first.level === 1;
    if ((chapter && size > 2000) || (first?.kind === 'h' && size > TARGET) || size > MAX) flush();

    const id = `p${i + 1}`;
    const label = p.page === null ? '' : pageLabel(p.vol, p.page, multi);
    const mark = label
      ? `<span epub:type="pagebreak" role="doc-pagebreak" id="${id}" aria-label="${escAttr(label)}" class="pg">[${esc(label)}]</span>`
      : `<span id="${id}"></span>`;
    anchor(id);
    if (p.page !== null) pageList.push({ label: multi ? `${p.vol}/${p.page}` : String(p.page), href: `${fileHref()}#${id}` });

    let placed = false; // the page marker
    let k = 0;
    if (open !== null && first?.kind === 'p') {
      // The sentence carries on from the page before: same paragraph, marker in the middle.
      open += ` ${mark} ${first.html}`;
      placed = true;
      k = 1;
      if (!first.open || out.blocks.length > 1) closePara();
    }
    for (; k < out.blocks.length; k++) {
      const b = out.blocks[k];
      closePara();
      if (b.kind === 'p') {
        const html = `<p>${placed ? '' : `${mark} `}${b.html}`;
        placed = true;
        if (k === out.blocks.length - 1 && b.open) open = html;
        else emit(html + '</p>');
      } else if (b.kind === 'h') {
        const top = b.level === 1;
        // A chapter that doesn't start a file starts a new page.
        const brk = top && cur.length > 0;
        const tag = `h${Math.min(6, (b.level ?? 2) + 1)}`;
        if (!placed) emit(`<div class="pb${brk ? ' ch' : ''}">${mark}</div>`);
        emit(`<${tag}${b.id ? ` id="${b.id}"` : ''}${brk && placed ? ' class="ch"' : ''}>${b.html}</${tag}>`);
        if (top) emit('<p class="orn" aria-hidden="true">۞</p>');
        placed = true;
      } else {
        emit('<hr class="rule"/>');
      }
    }
    for (const n of out.toc) anchor(`h${n}`);
    if (!placed) {
      if (open !== null) open += ` ${mark}`;
      else emit(`<div class="pb">${mark}</div>`);
    }

    if (out.notes.length) {
      if (open !== null) pending.push(out.notes);
      else emit(out.notes);
      lastNotes = { notes: out.notes, file: files.length };
    } else lastNotes = undefined;

    if (++done % 200 === 0) input.onProgress?.(done / pageIdx.length);
  }
  flush();
  input.onProgress?.(1);

  // --- table of contents ----------------------------------------------------------------------
  const items: FihrisItem[] = [];
  let prev = '';
  book.headings.forEach((h, i) => {
    const p = book.pages[h.page];
    if (!names.has(p.vol)) return;
    // The heading itself, or its page if the text has no anchor for it (but never before the
    // heading listed above it: the table of contents has to stay in reading order).
    let id = where.has(`h${i + 1}`) ? `h${i + 1}` : `p${h.page + 1}`;
    if (prev && (seq.get(id) ?? 0) < seq.get(prev)!) id = prev;
    const title = spellHonorifics(h.title).replace(/\s+/g, ' ').trim();
    if (!where.has(id) || !title) return;
    items.push({ title, level: h.level, href: `${where.get(id)}#${id}`, vol: p.vol, page: p.page });
    prev = id;
  });

  const tree = (list: FihrisItem[]): TocEntry[] => {
    const root: TocEntry[] = [];
    const stack: TocEntry[] = [];
    for (const it of list) {
      const e: TocEntry = { title: it.title, level: it.level, href: it.href, children: [] };
      while (stack.length && stack.at(-1)!.level >= e.level) stack.pop();
      (stack.length ? stack.at(-1)!.children : root).push(e);
      stack.push(e);
    }
    return root;
  };

  let toc: TocEntry[] = parts
    ? selected.map((v) => ({
        title: volLong(v.name),
        level: 0,
        href: volStart.get(v.name)!,
        children: tree(items.filter((t) => t.vol === v.name)),
      }))
    : tree(items);
  if (!toc.length && files.length) toc = [{ title: meta.mainTitle, level: 1, href: `text/${files[0].name}`, children: [] }];

  // --- front matter ----------------------------------------------------------------------------
  const firstVol = selected[0];
  const lastVol = selected.at(-1)!;
  const volNote = whole ? '' : parts ? `${volLong(firstVol.name)} – ${volShort(lastVol.name)}` : volLong(firstVol.name);
  const shortVol = whole ? '' : parts ? `${volShort(firstVol.name)}–${volShort(lastVol.name)}` : volShort(firstVol.name);
  const docTitle = shortVol ? `${meta.title} - ${shortVol}` : meta.title;

  const front: TextFile[] = [
    { name: 'title.xhtml', type: 'titlepage', body: titlePage(meta, volNote) },
    { name: 'card.xhtml', type: 'frontmatter', body: cardPage(meta, book.info, date) },
    ...fihrisPages(items, parts).map((body, i) => ({ name: `fihris${i ? i + 1 : ''}.xhtml`, type: i ? 'frontmatter' : 'toc', body })),
  ];

  // --- package -------------------------------------------------------------------------------
  const uid = `urn:shamela:${meta.id}${whole ? '' : `:v${input.from + 1}${parts ? `-${input.to + 1}` : ''}`}`;
  const zip: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(CONTAINER),
    'META-INF/com.apple.ibooks.display-options.xml': strToU8(APPLE_OPTIONS),
  };
  const put = (path: string, text: string) => (zip[`EPUB/${path}`] = strToU8(text));

  put('css/book.css', CSS);
  if (input.font) zip['EPUB/fonts/Amiri-Regular.ttf'] = [input.font, { level: 9 }];
  if (input.cover) {
    zip['EPUB/images/cover.jpg'] = [input.cover, { level: 0 }];
    put('text/cover.xhtml', xhtml(docTitle, '<div class="cover"><img src="../images/cover.jpg" alt="الغلاف"/></div>', 'cover', 'cover'));
  }
  for (const f of [...front, ...files]) put(`text/${f.name}`, xhtml(docTitle, f.body, f.type));

  const lead: TocEntry[] = [
    { title: 'صفحة العنوان', level: 1, href: 'text/title.xhtml', children: [] },
    { title: 'بطاقة الكتاب', level: 1, href: 'text/card.xhtml', children: [] },
    { title: 'الفهرس', level: 1, href: 'text/fihris.xhtml', children: [] },
  ];
  const start = files[0] ? `text/${files[0].name}` : 'text/title.xhtml';
  put('nav.xhtml', navDoc(docTitle, [...lead, ...toc], pageList, start, !!input.cover));
  put('toc.ncx', ncx(uid, docTitle, [...lead, ...toc]));
  put(
    'content.opf',
    opf({ uid, docTitle, meta, date, files: [...front, ...files], cover: !!input.cover, font: !!input.font, set: whole ? 0 : input.from + 1 }),
  );

  return zipSync(zip, { level: 6 });
}

/** «ج٣ ص١٢٤», or «ص١٢٤» in a one-volume book. */
export function pageLabel(vol: string, page: number, multi: boolean): string {
  return multi ? `${volShort(vol)} ص${num(page)}` : `ص${num(page)}`;
}

function notesHtml(notes: Note[]): string {
  const items = notes.map((n) => {
    const lines = n.lines.map((l, i) => {
      const label = i === 0 && n.label ? (n.refId ? `<a class="back" href="#${n.refId}">(${esc(n.label)})</a> ` : `(${esc(n.label)}) `) : '';
      return `<p>${label}${l}</p>`;
    });
    // Only a note with a marker in the text is an aside: Apple Books hides those and shows them as pop-ups.
    return n.refId
      ? `<aside epub:type="footnote" role="doc-footnote" class="fn" id="${n.id}">${lines.join('')}</aside>`
      : `<div class="fn" id="${n.id}">${lines.join('')}</div>`;
  });
  return `<div class="fns">${items.join('')}</div>`;
}

// --- documents --------------------------------------------------------------------------------

function xhtml(title: string, body: string, type: string, bodyClass = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ar" lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="../css/book.css"/>
</head>
<body dir="rtl" epub:type="${type}"${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
</body>
</html>
`;
}

function titlePage(m: EpubMeta, volNote: string): string {
  const p = (cls: string, text: string) => (text ? `<p${cls ? ` class="${cls}"` : ''}>${esc(text)}</p>` : '');
  return [
    '<section class="titlepage">',
    `<h1>${esc(m.mainTitle)}</h1>`,
    p('ed', m.edition),
    p('vols', volNote),
    '<p class="orn" aria-hidden="true">۞</p>',
    m.author && p('role', 'تأليف'),
    p('name', m.author),
    m.author && m.died && p('died', `(${m.died})`),
    m.editor && p('role', 'تحقيق'),
    p('name', m.editor),
    m.publisher || m.imprint ? `<div class="imprint">${p('', m.publisher)}${p('', m.imprint)}</div>` : '',
    '</section>',
  ]
    .filter(Boolean)
    .join('\n');
}

function cardPage(m: EpubMeta, info: string, date: Date): string {
  const lines = spellHonorifics(info)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 && i < 40 ? `<p><span class="k">${esc(l.slice(0, i))}:</span>${esc(l.slice(i + 1))}</p>` : `<p>${esc(l)}</p>`;
    });
  const d = `${num(date.getFullYear())}/${num(date.getMonth() + 1)}/${num(date.getDate())}`;
  return `<section class="card">
<h1>بطاقة الكتاب</h1>
${lines.join('\n') || `<p>${esc(m.title)}</p>`}
<p class="source">المصدر: المكتبة الشاملة، الكتاب رقم ${num(m.id)} (shamela.ws/book/${m.id})، عن نسخة تراث (turath.io).</p>
<p class="source">أُنشئ هذا الملف بـ«نسخة» في ${d}. الخط: أميري (رخصة SIL Open Font License).</p>
</section>`;
}

/** The visible contents, with the printed page next to each heading. Split like the text. */
function fihrisPages(items: FihrisItem[], parts: boolean): string[] {
  const pages: string[] = [];
  let cur = ['<section class="fihris">', '<h1>الفهرس</h1>'];
  let size = 0;
  let vol: string | undefined;
  for (const it of items) {
    if (size > TARGET) {
      pages.push([...cur, '</section>'].join('\n'));
      cur = ['<section class="fihris">'];
      size = 0;
    }
    if (parts && it.vol !== vol) cur.push(`<h2>${esc(volLong(it.vol))}</h2>`);
    vol = it.vol;
    const loc = it.page === null ? '' : ` <span class="loc">${num(it.page)}</span>`;
    // Fihris pages sit next to the text files: drop the «text/» prefix.
    const line = `<p class="l${Math.min(6, it.level)}"><a href="${it.href.slice('text/'.length)}">${esc(it.title)}</a>${loc}</p>`;
    cur.push(line);
    size += line.length;
  }
  pages.push([...cur, '</section>'].join('\n'));
  return pages;
}

function navList(entries: TocEntry[]): string {
  const li = (e: TocEntry) => `<li><a href="${e.href}">${esc(e.title)}</a>${e.children.length ? navList(e.children) : ''}</li>`;
  return `<ol>\n${entries.map(li).join('\n')}\n</ol>`;
}

function navDoc(title: string, toc: TocEntry[], pageList: { label: string; href: string }[], start: string, cover: boolean): string {
  const pages = pageList.length
    ? `<nav epub:type="page-list" role="doc-pagelist" id="page-list" hidden="hidden">
<h2>الصفحات</h2>
<ol>
${pageList.map((p) => `<li><a href="${p.href}">${esc(p.label)}</a></li>`).join('\n')}
</ol>
</nav>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ar" lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="css/book.css"/>
</head>
<body dir="rtl">
<nav epub:type="toc" role="doc-toc" id="toc">
<h1>المحتويات</h1>
${navList(toc)}
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
<h2>معالم الكتاب</h2>
<ol>
${cover ? '<li><a epub:type="cover" href="text/cover.xhtml">الغلاف</a></li>\n' : ''}<li><a epub:type="titlepage" href="text/title.xhtml">صفحة العنوان</a></li>
<li><a epub:type="toc" href="text/fihris.xhtml">الفهرس</a></li>
<li><a epub:type="bodymatter" href="${start}">بداية الكتاب</a></li>
</ol>
</nav>
${pages}
</body>
</html>
`;
}

/** EPUB 2 table of contents, for older readers. */
function ncx(uid: string, title: string, toc: TocEntry[]): string {
  // Entries pointing at the same place must share a playOrder.
  const order = new Map<string, number>();
  let n = 0;
  const points = (entries: TocEntry[]): string =>
    entries
      .map((e) => {
        n++;
        if (!order.has(e.href)) order.set(e.href, order.size + 1);
        const po = order.get(e.href)!;
        return `<navPoint id="np${n}" playOrder="${po}"><navLabel><text>${esc(e.title)}</text></navLabel><content src="${e.href}"/>${points(e.children)}</navPoint>`;
      })
      .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ar">
<head>
<meta name="dtb:uid" content="${escAttr(uid)}"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${esc(title)}</text></docTitle>
<navMap>
${points(toc)}
</navMap>
</ncx>
`;
}

function opf(o: {
  uid: string;
  docTitle: string;
  meta: EpubMeta;
  date: Date;
  files: TextFile[];
  cover: boolean;
  font: boolean;
  /** Position in the set of volumes; 0 for the whole book. */
  set: number;
}): string {
  const { meta } = o;
  const items = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="css/book.css" media-type="text/css"/>',
  ];
  if (o.font) items.push('<item id="font" href="fonts/Amiri-Regular.ttf" media-type="font/ttf"/>');
  const spine: string[] = [];
  if (o.cover) {
    items.push('<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>');
    items.push('<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover"/>');
  }
  for (const f of o.files) {
    const id = `x-${f.name.replace(/\.xhtml$/, '')}`;
    items.push(`<item id="${id}" href="text/${f.name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
  }

  const md = [
    `<dc:identifier id="uid">${esc(o.uid)}</dc:identifier>`,
    `<dc:title id="title">${esc(o.docTitle)}</dc:title>`,
    '<dc:language>ar</dc:language>',
    `<meta property="dcterms:modified">${o.date.toISOString().replace(/\.\d+Z$/, 'Z')}</meta>`,
    `<dc:source>https://shamela.ws/book/${meta.id}</dc:source>`,
  ];
  if (meta.author) {
    md.push(`<dc:creator id="author">${esc(meta.author)}</dc:creator>`);
    md.push('<meta refines="#author" property="role" scheme="marc:relators">aut</meta>');
  }
  if (meta.editor) {
    md.push(`<dc:contributor id="editor">${esc(meta.editor)}</dc:contributor>`);
    md.push('<meta refines="#editor" property="role" scheme="marc:relators">edt</meta>');
  }
  if (meta.publisher) md.push(`<dc:publisher>${esc(meta.publisher)}</dc:publisher>`);
  if (meta.category) md.push(`<dc:subject>${esc(meta.category)}</dc:subject>`);
  md.push(`<dc:description>${esc(`المكتبة الشاملة، الكتاب رقم ${meta.id}. أُنشئ بـ«نسخة».`)}</dc:description>`);
  if (o.set) {
    // Volumes of one book group together on the reader's shelf.
    md.push(`<meta property="belongs-to-collection" id="set">${esc(meta.title)}</meta>`);
    md.push('<meta refines="#set" property="collection-type">set</meta>');
    md.push(`<meta refines="#set" property="group-position">${o.set}</meta>`);
  }
  if (o.cover) md.push('<meta name="cover" content="cover-image"/>');

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="ar" dir="rtl">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${md.join('\n')}
</metadata>
<manifest>
${items.join('\n')}
</manifest>
<spine toc="ncx" page-progression-direction="rtl">
${spine.join('\n')}
</spine>
</package>
`;
}

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

const APPLE_OPTIONS = `<?xml version="1.0" encoding="utf-8"?>
<display_options>
<platform name="*">
<option name="specified-fonts">true</option>
</platform>
</display_options>
`;
