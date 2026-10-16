# Nuskha (نسخة) — Plan

**Goal:** search any Shamela book and download a **full-quality EPUB**, from a simple website that feels like a library.
Everything runs in the visitor's browser, so there is no server and hosting is free.

## Where the books come from

turath.io (a Shamela mirror) lets the browser fetch these directly:

| URL | What |
|---|---|
| `files.turath.io/data-v4.sqlite` | Catalog: 8,609 books, 3,192 authors, 40 categories, and each book's bibliographic card |
| `files.turath.io/books-v3/{id}.json` | Full book: text, volumes, printed page numbers, headings, footnotes |

Book IDs are the same as Shamela's (`shamela.ws/book/22669` = `22669`).
We don't use turath's own EPUB (checked on book 17100): one file per page, no font, no printed page numbers, no real footnotes.

---

## 1. Search: how to make it perfect

### What we index (checked in the catalog)
Each book's card has **title, author's short name** (الذهبي), **author's full name** (محمد بن أحمد بن عثمان الذهبي),
**editor** (المحقق, 2,286 books), **publisher** (7,346), **edition** (الطبعة), **category**, death year, pages.
All of this fits in one file of about **350 KB** (gzipped), loaded once. After that, every search is instant and works offline.

Editions matter: Siyar has `10906 ط الرسالة` and `22669 ط الحديث`. So results always show **publisher + year**,
and a badge «موافق للمطبوع» when the page numbers match the printed book.

### Arabic matching
The same cleanup runs on the books and on what the user types:

| Always | Also (makes more matches) |
|---|---|
| remove harakat and tatweel (ـ) | ة = ه |
| أ إ آ ٱ → ا | ؤ → و, ئ → ي |
| ى → ي | ignore a leading «ال» in each word |
| Arabic/Persian digits → one form; Unicode NFKC | |

This follows the rules of Lucene's standard Arabic normalizer.

### How results are found and ranked
- Library: **MiniSearch** (small, about 7 KB) with our Arabic cleanup plugged in. It gives:
  - matches as you type (prefix: «سير اع» finds «سير أعلام»)
  - small typos allowed (fuzzy: «البخارى» / «البخاري»)
  - field weights: **title > author > editor/publisher > category**
- Ranking ties: title starts with the query → shorter title → more pages.
- Quick ways in:
  - paste a **shamela.ws link** or a **book number** → go straight to the book
  - click an author → all of that author's books
  - category chips («رفوف») to filter
- The query is kept in the URL (`?q=…`), so you can share a search. Press `/` to focus the search box, use ↑↓ to move, Enter to open.

### Test before calling it done
A list of **30 real searches with the expected first result**, run automatically. For example:
«سير اعلام» → 22669 and 10906 at the top · «الذهبي» · «ابن تيميه» (with ه) · «فتح الباري» · «صحيح البخارى» (typo) · «22669».

---

## 2. EPUB: how to make it perfect

### Structure
- **Right to left:** `dir="rtl"` and `lang="ar"` on every page, `page-progression-direction="rtl"` on the spine,
  `dc:language ar`. (Amazon rejects Arabic files that are not set to right to left.)
- **Table of contents:** built from the book's headings and nested by level. Also a visible «الفهرس» page at the start.
- **Printed page numbers:** a hidden marker at every page (`epub:type="pagebreak"`, «ج٣ ص١٢٤») plus a `page-list`,
  so "go to page" and citations work in readers that support it.
- **Footnotes** in the Apple Books pattern: `<a epub:type="noteref">` → `<aside epub:type="footnote">`, with a
  **link back** from the note to the text, and the note text in an RTL paragraph. Readers with pop-ups (Apple Books,
  KOReader, Kindle) show a pop-up. Other readers show a normal link and a "back" link, so it works everywhere.
- **Files of a good size:** split the book at headings into pieces of about 250 KB, so readers open and turn pages fast.
- **Cover:** a simple generated cover in the library style (title, author, «نسخة»), so the book looks right on your shelf.
- **Book details:** title, author's full name, editor, publisher, edition, ID `urn:shamela:22669`, and a source note.

### Text
- Clean up HTML entities, keep Quran brackets ﴿ ﴾, link each footnote marker `(^١)` to its note.
- Keep harakat as they are. "Remove harakat" can be an option later.
- **Amiri** font built in as the default. Readers can still switch to their own font.
  (Kindle may ignore built-in Arabic fonts and use its own; that's fine.)

### The look of the book (inside the EPUB)
The pages should look like a well-printed Arabic book, not a web page.

- **Cover:** like a cloth binding. The colour of the book's bookcase (the same binding colours as the site), a thin
  gold-brown frame, the title and author in Amiri, a small «نسخة» at the foot. Made as a real image, because Kindle
  and Apple Books need an image cover.
- **Opening pages, in the order of a printed book:**
  1. **Title page:** centred title, ornament, «تأليف» and the author's full name with death year, «تحقيق», then the
     publisher and edition at the foot of the page.
  2. **Book card** («بطاقة الكتاب»): the bibliographic card from Shamela and the source note, set small, like the
     back of a title page.
  3. **«الفهرس»**: the table of contents, with the volume and printed page next to each heading.
- **Chapters:** each top-level heading starts on a new page, centred, with a short gold-brown rule and ۞ under it.
  Lower headings are smaller and right-aligned, with space above them.
- **Body text:** Amiri, justified, line height about 1.9, generous margins; space between paragraphs.
- **Quran:** verses in ﴿ ﴾ set in a deep green; **hadith and poetry** are left as Shamela gives them.
- **Footnotes:** smaller text under a short rule, numbered with Arabic-Indic digits, each with a ↩ back link.
- **Printed page numbers:** a small, quiet «ج٣ ص١٢٤» in grey at each page change, never in the way of reading.
- **Colours like a real book:** near-black ink, deep red (like rubrication in old books) for headings, gold-brown for
  rules and ornaments, deep green for Quran. The **page background is left to the reader app**, so its paper,
  sepia and night modes all keep working; in night mode the accent colours switch to lighter versions so they stay
  readable. On e-ink (Kindle, Kobo) the colours become clean greys.
- **Check:** screenshots of the same pages in Apple Books (white, sepia, night), Thorium, KOReader and Kindle Previewer.

### Volumes: one volume, a few, or the whole book
Every book with more than one volume offers **both**: each volume on its own, and the whole book in one EPUB.
Nobody has to take all 14 volumes of البداية والنهاية to read the year they need.

- **What turath gives us:** one file per book, never per volume (البداية والنهاية 6 MB to download, Siyar ط الحديث 7 MB,
  Siyar ط الرسالة 11 MB). So any choice downloads the book file once. It is then **kept in the browser**, so a second
  volume, or the whole book later, is made instantly and works offline.
- **The volume list, before downloading:** each volume with a label taken from its first headings, so you can see what is
  inside without opening it. Real examples:
  - البداية والنهاية: ج٣ «باب كيف بدأ الوحي…» · ج٤ «سنة ثلاث من الهجرة…» · ج١٢ «سنة ست وأربعمائة…»
  - Siyar ط الرسالة: «المقدمة» · «سيرة ١» · «سيرة ٢» · «راشدون» · ج١ «الطبقة الأولى» …

  These labels come from turath's index, which our weekly catalog job reads (index only, never the book text), and are
  stored in small files loaded only when a book page opens. If a book has no stored list yet, the list appears right
  after the download instead.
- **Choices on the book page:**
  - **الكتاب كاملًا**: one EPUB, each volume a top-level section of the table of contents.
  - **one volume**: tap it in the list.
  - **a range** (e.g. ج٣–ج٥) in one EPUB, for a period or a section that spans volumes.
  - **all volumes, one file each**: saved as one .zip, since browsers block many downloads at once.
- **A Shamela page link picks the volume:** pasting `shamela.ws/book/8376/1672` opens the book with the volume that
  contains that page already chosen.
- **The biggest book** (124,569 pages) is offered per volume and by range only; one file that size would not open in readers.
- Everything runs in a background worker, so the page never freezes. A progress bar shows: تنزيل ← معالجة ← إنشاء.
- The zip is made with **fflate** (small and fast), with `mimetype` first and uncompressed, as the EPUB rules require.
- turath's hidden keys are **not fixed**: the same field has a different key in different books (checked on 8376,
  22669, 10906, 17100), so the reader finds each field by its shape, not by its key.

### Steps we skip
Things a user would otherwise have to do, which Nuskha does for them:
- **No settings screen before downloading.** Good defaults (keep harakat, Amiri, pop-up footnotes). Options can come later.
- **No format choice.** EPUB only, so one button.
- **No volume question for one-volume books.** One button, done.
- **No "this is a big file, continue?" dialog.** The size is on the button instead: «تحميل EPUB · ٦ م.ب».
- **No separate download screen.** The progress bar is on the book page, and the file saves by itself when ready.
- **No second download.** Another volume of a book already fetched is made from the copy in the browser.
- **A pasted link or book number goes straight to the book page**, not to a list with one result in it.
- **Index volumes and editor's introductions** are marked in the volume list («فهارس», «مقدمة التحقيق»), so it is
  clear what can be left out. They stay in «الكتاب كاملًا», which is what the printed book has.

### Test before calling it done
- **epubcheck** (the official EPUB checker) must pass with **0 errors** on 4 test books: a small one, one with many footnotes,
  one with many volumes (Siyar 22669), and one with deep headings.
- Open them in: **Apple Books, Google Play Books, KOReader, Thorium, and Kindle** (Send to Kindle / Kindle Previewer).
  Check: right-to-left page turns, table of contents, footnote pop-up and back link, page numbers, font, cover.

---

## 3. Design: how to make it perfect

**Idea:** a quiet library reading room. Paper, ink, old bindings, card catalogs. Nothing flashy.

| | |
|---|---|
| **Colours** | paper `#f6f1e7`, ink-brown text `#2b2118`, one accent **library green `#2f4a3a`**, thin gold-brown rules `#b08d57`. Night mode «قاعة المطالعة ليلًا»: walnut `#1c1714`, cream text `#ece3d2` |
| **Fonts** | **Amiri** for the name «نسخة», titles and headings; **Noto Naskh Arabic** for everything else (made for reading on screens). Both stored on our own site, only the Arabic letters we need |
| **Text** | 18 px body, line height about 1.8 (Arabic needs more room than Latin). Numbers in Arabic-Indic digits |
| **Shapes** | thin 1 px rules, no shadows, no gradients, small ornaments (۞) used rarely |

### Screens
1. **Home:** «نسخة» and one line «المكتبة الشاملة، نسخةً في يدك» above one large search box that looks like a line on a page.
   Under it, the categories as **shelves (رفوف)**.
2. **Results:** each book is a **catalog card** with:
   - the title in Amiri
   - author · death year
   - publisher · year · volumes · pages
   - badges like «موافق للمطبوع»

   A thin coloured edge on each card shows its category, like the spines of books on a shelf.
3. **Book page:** like a book's **title page**: centred title, author, editor, publisher, then the volumes list and one green button
   **تحميل EPUB**. A link to the book on shamela.ws.
4. **Download:** the progress bar, then «تمّ» and the file saves.

### Quality bar
Works on a phone first. Full keyboard use. Good contrast (WCAG AA). First visit under 500 KB.
Test with the longest real titles and on Android, iPhone, Windows and Mac.

---

## Build steps

Each step ends with something you check. I stop after each step and wait for your OK.

### [x] 1. Catalog and search
- A script builds the search file from turath's catalog (all fields above).
- Search with the Arabic cleanup and ranking above, plus the 30 test searches.
- **You check:** try your own searches on a plain test page.

### [x] 2. Design: home, results, book page
- The library design above, in Arabic, with day and night modes.
- **You check:** open it on your phone and computer and search for a few books.

### [ ] 3. Full-quality EPUB
- Book download, text cleanup and the EPUB builder, in the background with a progress bar. epubcheck on the 4 test books.
- Volumes: the volume list with labels; one volume, a range, the whole book, or all volumes as a .zip;
  the book file kept in the browser.
- The look of the book: cloth-binding cover, title page, book card, «الفهرس», chapter openings, book colours
  that work in the reader's white, sepia and night modes.
- **You check:** download 3–4 books and open them in your readers.

### [ ] 4. Put it online
- GitHub Pages (free). The catalog refreshes once a week automatically.
- **You check:** the live link works everywhere.

## Later (only if wanted)
- Search inside book text
- PDF with selectable Arabic text
- English and Turkish interface
- "Remove harakat" option

The earlier detailed plan is in [old/PLAN-full.md](old/PLAN-full.md).

## Sources
- Arabic matching rules: [Lucene ArabicNormalizer](https://lucene.apache.org/core/8_5_1/analyzers-common/org/apache/lucene/analysis/ar/ArabicNormalizer.html), [normalization guide](https://noqta.tn/en/blog/arabic-text-normalization-search-rag-llm-guide-2026)
- Search libraries: [FlexSearch / Orama / Fuse comparison](https://www.pkgpulse.com/guides/fusejs-vs-flexsearch-vs-orama-client-side-search-2026)
- Footnote pop-ups: [Apple Books Asset Guide](https://help.apple.com/itc/booksassetguide/en.lproj/itccf8ecf5c8.html), [W3C note on pop-up footnotes](https://lists.w3.org/Archives/Public/public-pm-wg/2025Mar/0002.html)
- Kindle and Arabic: [KDP Arabic help](https://kdp.amazon.com/en_US/help/topic/GUQT4C8J6RR6V8TY), [Kindle Arabic fonts (forum)](https://www.mobileread.com/forums/showthread.php?p=3064809)
- EPUB in the browser: [Jim Nielsen](https://blog.jim-nielsen.com/2022/generating-epub-file-in-browser/), [epub-gen-memory](https://github.com/cpiber/epub-gen-memory)
- Fonts: [Noto Naskh Arabic](https://fontsource.org/fonts/noto-naskh-arabic/about), [Amiri](https://fonts.google.com/specimen/Amiri/about)
