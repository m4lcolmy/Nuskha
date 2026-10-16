// The turath reader and the EPUB builder, on small made-up books shaped like the real ones
// (keys disguised as harakat, title spans, the two kinds of note separators, «=» continuations).
// scripts/epub-check.ts runs the 4 real test books through epubcheck.

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildEpub, pageLabel, type EpubMeta } from '../src/lib/epub/build.ts';
import { decodeEntities, renderPage, type PageContext } from '../src/lib/epub/page.ts';
import { parseBook } from '../src/lib/turath/book.ts';
import { spellHonorifics } from '../src/lib/turath/honorifics.ts';
import { volLong, volShort, volumesOf } from '../src/lib/turath/volumes.ts';

const ctx = (levels: Record<number, number> = {}): PageContext => ({
  key: '7',
  levelOf: (n) => levels[n],
  usedIds: new Set(),
});

describe('turath book file', () => {
  // The same fields under different keys in different books.
  const raw = (metaKey: string, idxKey: string) => ({
    [metaKey]: { 'ٌ': 1, 'ّ': 'الكتاب: تجربة\nالمؤلف: فلان' },
    [idxKey]: {
      'ٚ': ['1', '2'],
      'ٛ': [
        { title: 'باب الأول', level: 1, page: 1 },
        { title: 'فصل', level: 2, page: 2 },
        { title: 'باب الثاني', level: 1, page: 3 },
      ],
    },
    pages: [
      { text: 'أ', vol: '1', page: null },
      { text: 'ب', vol: '1', page: 2 },
      { text: 'ج', vol: 2, page: 1 },
    ],
  });

  it('finds every field by its shape, whatever its key', () => {
    for (const keys of [['ً', '٘'], ['ً', 'ٙ']]) {
      const b = parseBook(raw(keys[0], keys[1]));
      expect(b.info).toBe('الكتاب: تجربة\nالمؤلف: فلان');
      expect(b.headings.map((h) => h.page)).toEqual([0, 1, 2]);
      expect(b.pages[2]).toEqual({ text: 'ج', vol: '2', page: 1 });
      expect(b.pages[0].page).toBeNull();
    }
  });

  it('rejects files without pages', () => {
    expect(() => parseBook({ meta: {} })).toThrow();
  });
});

describe('volumes', () => {
  it('labels each volume with its first heading', () => {
    const vols = volumesOf(
      ['المقدمة', 'المقدمة', '1', '1', '2', 'فهارس'],
      [
        { title: 'مقدمة التحقيق', level: 1, page: 0 },
        { title: 'الجزء ١ [طبقة ١، ٢]', level: 1, page: 2 },
        { title: '[ذكر] جماعة من الأنبياء ﵇', level: 2, page: 4 },
        { title: 'فهرس الأعلام', level: 1, page: 5 },
      ],
    );
    expect(vols.map((v) => [v.name, v.first, v.count, v.label, v.kind])).toEqual([
      ['المقدمة', 0, 2, 'مقدمة التحقيق', 'intro'],
      ['1', 2, 2, 'طبقة ١، ٢', ''],
      ['2', 4, 1, '[ذكر] جماعة من الأنبياء عليه السلام', ''],
      ['فهارس', 5, 1, 'فهرس الأعلام', 'index'],
    ]);
  });

  it('shortens long labels at a word', () => {
    const [v] = volumesOf(['1'], [{ title: 'كلمة '.repeat(30), level: 1, page: 0 }]);
    expect(v.label.endsWith('…')).toBe(true);
    expect(v.label.length).toBeLessThanOrEqual(50);
  });

  it('names volumes in Arabic digits', () => {
    expect(volShort('3')).toBe('ج٣');
    expect(volLong('12')).toBe('الجزء ١٢');
    expect(volShort('سيرة 1')).toBe('سيرة ١');
    expect(pageLabel('3', 124, true)).toBe('ج٣ ص١٢٤');
    expect(pageLabel('1', 124, false)).toBe('ص١٢٤');
  });
});

describe('page text', () => {
  it('writes out honorifics the fonts lack, keeps ﷺ', () => {
    expect(spellHonorifics('الحاكم ﵀ قال ﷺ')).toBe('الحاكم رحمه الله قال ﷺ');
  });

  it('decodes entities and escapes for XHTML', () => {
    expect(decodeEntities('&quot;أ&quot; &amp; &#1576;')).toBe('"أ" & ب');
    const out = renderPage('أ &lt; ب & ج', ctx());
    expect(out.blocks[0].html).toBe('أ &lt; ب &amp; ج');
  });

  it('links (^n) markers to the notes after the _________ line', () => {
    const out = renderPage('قال (^١) ثم (^٢).\n_________\n(^١) أول.\n(^٢) ثان.\nتتمة الثاني.', ctx());
    expect(out.notes.map((n) => [n.label, n.refId, n.lines.length])).toEqual([
      ['١', 'r7-1', 1],
      ['٢', 'r7-2', 2],
    ]);
    expect(out.blocks[0].html).toContain('<a epub:type="noteref" role="doc-noteref" class="nr" id="r7-1" href="#n7-1">(١)</a>');
  });

  it('links bare (n) markers only when that note exists, and reads <hr> notes', () => {
    const out = renderPage('في (٢) مواضع، انظر (١) و(*).\n<hr>\n(١) هنا.\n(*) ترجمته.', ctx());
    const html = out.blocks[0].html;
    expect(html).toContain('في (٢) مواضع');
    expect(html).toContain('href="#n7-1">(١)</a>');
    expect(html).toContain('href="#n7-2">(*)</a>');
  });

  it('keeps <hr> in the text when no notes follow it', () => {
    const out = renderPage('أ\n<hr>\nب', ctx());
    expect(out.blocks.map((b) => b.kind)).toEqual(['p', 'hr', 'p']);
    expect(out.notes).toEqual([]);
  });

  it('marks a note that carries on from the page before', () => {
    const out = renderPage('نص\n_________\n= بقية الحاشية', ctx());
    expect(out.notes[0]).toMatchObject({ cont: true, label: '', lines: ['بقية الحاشية'] });
  });

  it('makes a heading of a title line, with the level from the index', () => {
    const out = renderPage('<span data-type="title" id="toc-5">باب الصلاة</span>:\nنص', ctx({ 5: 2 }));
    expect(out.blocks[0]).toMatchObject({ kind: 'h', html: 'باب الصلاة', level: 2, id: 'h5' });
    expect(out.toc).toEqual([5]);
  });

  it('keeps a title inside a long line as a paragraph with an anchor', () => {
    const line = `${'كلام طويل '.repeat(10)}<span data-type='title' id=toc-9>غزوة</span> ثم ذكر ما كان بعدها من الأحداث الكثيرة`;
    const out = renderPage(line, ctx());
    expect(out.blocks[0].kind).toBe('p');
    expect(out.blocks[0].html).toContain('<span class="t" id="h9">غزوة</span>');
  });

  it('gives nested title spans their own anchors', () => {
    const out = renderPage('<span data-type="title" id="toc-1">٧٢٤ -<span data-type="title" id="toc-2"> سماك بن حرب</span> </span>(^٨)', ctx());
    expect(out.blocks[0].kind).toBe('h');
    expect(out.blocks[0].id).toBe('h1');
    expect(out.blocks[0].html).toContain('<span id="h2"></span>');
    expect(out.toc).toEqual([1, 2]);
  });

  it('never uses a heading id twice', () => {
    const c = ctx();
    renderPage('<span data-type="title" id="toc-3">أ</span>', c);
    expect(renderPage('<span data-type="title" id="toc-3">أ</span>', c).blocks[0].id).toBeUndefined();
  });

  it('sets Quran apart and notes paragraphs that run over the page', () => {
    const out = renderPage('قال تعالى: ﴿اقرأ﴾.\nوهذا كلام لم', ctx());
    expect(out.blocks[0].html).toBe('قال تعالى: <span class="q">﴿اقرأ﴾</span>.');
    expect(out.blocks.map((b) => b.open)).toEqual([false, true]);
  });
});

describe('EPUB', () => {
  const meta: EpubMeta = {
    id: 99,
    title: 'كتاب التجربة - ط الأولى',
    mainTitle: 'كتاب التجربة',
    edition: 'ط الأولى',
    author: 'فلان بن فلان',
    died: 'ت ٧٤٨ هـ',
    editor: 'المحقق',
    publisher: 'دار النشر',
    imprint: 'الطبعة الأولى',
    category: 'التاريخ',
  };
  const book = parseBook({
    m: { a: 'الكتاب: كتاب التجربة' },
    i: {
      h: [
        { title: 'الباب الأول', level: 1, page: 1 },
        { title: 'فصل بلا عنوان في النص', level: 2, page: 2 },
        { title: 'الباب الثاني', level: 1, page: 3 },
      ],
    },
    pages: [
      { text: '<span data-type="title" id="toc-1">الباب الأول</span>\nأول الكلام (^١) وهو', vol: '1', page: 1 },
      { text: 'متصل بما قبله.\n_________\n= بقية الحاشية', vol: '1', page: 2 },
      { text: '<span data-type="title" id="toc-3">الباب الثاني</span>\nنص.\n_________\n(^١) حاشية.', vol: '2', page: 1 },
    ].map((p, i) => (i === 0 ? { ...p, text: p.text + '\n_________\n(^١) أول الحاشية' } : p)),
  });
  const volumes = volumesOf(
    book.pages.map((p) => p.vol),
    book.headings,
  );
  const files = (epub: Uint8Array) => {
    const z = unzipSync(epub);
    return Object.fromEntries(Object.entries(z).map(([k, v]) => [k, k.endsWith('.ttf') || k.endsWith('.jpg') ? '' : strFromU8(v)]));
  };

  it('puts an uncompressed mimetype first', () => {
    const epub = buildEpub({ book, meta, volumes, from: 0, to: 1, date: new Date(0) });
    expect(strFromU8(epub.subarray(30, 38))).toBe('mimetype');
    expect(strFromU8(epub.subarray(38, 58))).toBe('application/epub+zip');
  });

  it('builds the whole book with volumes as top-level sections', () => {
    const f = files(buildEpub({ book, meta, volumes, from: 0, to: 1, date: new Date(0) }));
    const opf = f['EPUB/content.opf'];
    expect(opf).toContain('page-progression-direction="rtl"');
    expect(opf).toContain('<dc:language>ar</dc:language>');
    expect(opf).toContain('<dc:identifier id="uid">urn:shamela:99</dc:identifier>');
    expect(opf).not.toContain('belongs-to-collection');
    const nav = f['EPUB/nav.xhtml'];
    expect(nav).toMatch(/<li><a href="text\/t0001\.xhtml#v-1">الجزء ١<\/a><ol>\n<li><a href="text\/t0002\.xhtml#h1">الباب الأول<\/a>/);
    // The heading with no anchor in the text points at its page.
    expect(nav).toContain('#p2">فصل بلا عنوان في النص</a>');
    expect(nav).toContain('<nav epub:type="page-list"');
    expect(nav).toContain('<a href="text/t0002.xhtml#p2">1/2</a>');
    expect(f['EPUB/text/title.xhtml']).toContain('<p class="name">فلان بن فلان</p>');
    expect(f['EPUB/text/fihris.xhtml']).toContain('<h2>الجزء ٢</h2>');
  });

  it('carries a sentence over the page and joins the continued footnote', () => {
    const f = files(buildEpub({ book, meta, volumes, from: 0, to: 0, date: new Date(0) }));
    const text = f['EPUB/text/t0001.xhtml'];
    expect(text).toMatch(/وهو <span epub:type="pagebreak"[^>]*>\[ج١ ص٢\]<\/span> متصل بما قبله\.<\/p>/);
    expect(text).toContain('<p><a class="back" href="#r1-1">(١)</a> أول الحاشية</p><p>بقية الحاشية</p></aside>');
    expect(text).not.toContain('= بقية');
  });

  it('builds one volume as part of a set', () => {
    const f = files(buildEpub({ book, meta, volumes, from: 1, to: 1, date: new Date(0) }));
    const opf = f['EPUB/content.opf'];
    expect(opf).toContain('urn:shamela:99:v2');
    expect(opf).toContain('<dc:title id="title">كتاب التجربة - ط الأولى - ج٢</dc:title>');
    expect(opf).toContain('<meta refines="#set" property="group-position">2</meta>');
    expect(f['EPUB/text/title.xhtml']).toContain('<p class="vols">الجزء ٢</p>');
    expect(f['EPUB/text/t0001.xhtml']).toContain('الباب الثاني');
    expect(f['EPUB/text/t0001.xhtml']).not.toContain('الباب الأول');
  });

  it('includes the font and cover when given', () => {
    const f = files(buildEpub({ book, meta, volumes, from: 0, to: 1, font: new Uint8Array(4), cover: new Uint8Array(4) }));
    expect(f['EPUB/content.opf']).toContain('properties="cover-image"');
    expect(f['EPUB/content.opf']).toContain('media-type="font/ttf"');
    expect(f['EPUB/text/cover.xhtml']).toContain('src="../images/cover.jpg"');
  });
});
