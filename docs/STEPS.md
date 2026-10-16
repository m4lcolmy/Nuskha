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

### Big books
- Everything runs in a background worker, so the page never freezes. A progress bar shows: تنزيل ← معالجة ← إنشاء.
- Books over about 1,500 printed pages (e.g. Siyar, 18 volumes) also offer **one EPUB per volume**.
  The biggest book (124,569 pages) is offered **per volume only**.
- The zip is made with **fflate** (small and fast), with `mimetype` first and uncompressed, as the EPUB rules require.

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

### [ ] 2. Design: home, results, book page
- The library design above, in Arabic, with day and night modes.
- **You check:** open it on your phone and computer and search for a few books.

### [ ] 3. Full-quality EPUB
- Book download, text cleanup and the EPUB builder, in the background with a progress bar. epubcheck on the 4 test books.
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
