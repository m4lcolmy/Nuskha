# Nuskha (نسخة) — Plan

**Goal:** search any Shamela book and download a **full-quality EPUB** or a **print-quality PDF**, from a simple website that feels like a library.
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
  stored in small files loaded only when a book page opens. If a book has no stored list yet, the page offers
  «اختر جزءًا…», which reads the book first.
- **Choices on the book page:** one main button, then a list of volumes under it.
  - The main button: **تحميل الكتاب كاملًا** (one EPUB, each volume a top-level section of the table of contents), with the size.
  - «أو حمّل جزءًا واحدًا» opens the list: each volume with its label («ج٤ — أوّله: سنة ثلاث من الهجرة»), its pages,
    and its own «تحميل» button. A list on the page, not a `<select>`: a system menu cuts long names and can't show
    a second line.
  - When the book's own top headings divide it into a few parts («كتاب المبتدأ وقصص الأنبياء», «كتاب سيرة رسول الله ﷺ»),
    the volumes are grouped under them, and a part that starts inside a volume is noted on it («وفيه يبدأ: …»).
  - No ranges and no zip of all volumes: whole book or one volume is enough.
- **A Shamela page link picks the volume:** pasting `shamela.ws/book/8376/1672` opens the book with the volume that
  contains that page already chosen.
- **The biggest book** (124,569 pages) is offered per volume only; one file that size would not open in readers.
- Everything runs in a background worker, so the page never freezes. A progress bar shows: تنزيل ← معالجة ← إنشاء.
- The EPUB zip is made with **fflate** (small and fast), with `mimetype` first and uncompressed, as the EPUB rules require.
- turath's hidden keys are **not fixed**: the same field has a different key in different books (checked on 8376,
  22669, 10906, 17100), so the reader finds each field by its shape, not by its key.

### Steps we skip
Things a user would otherwise have to do, which Nuskha does for them:
- **No settings screen before downloading.** Good defaults (keep harakat, Amiri, pop-up footnotes). Options can come later.
- **No format screen.** «تحميل EPUB» and «تحميل PDF» sit side by side on the book page.
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

## 4. PDF: like a professionally printed book

**Idea:** the PDF should look like a good Beirut or Cairo printing of the book: fixed pages, footnotes at the foot
of the page they belong to, running heads, a «الفهرس» with real page numbers. And the text must still select, copy
and search correctly. That is what EPUB can't give: the same page for everyone, to print, cite or read as pages.

### The engine: Typst, in the visitor's browser
A real typesetting engine, compiled to WebAssembly (**typst.ts**), runs in a background worker of its own.
- **Why not "print to PDF" from the browser:** Chrome can't put footnotes at the foot of the page, can't number a
  contents page, and needs the print dialog (and «Headers and footers: off»); Firefox and Safari print differently
  again. Typst does all of it the same way on every browser, phones included, and the file downloads directly.
- **What it costs:** 11 MB (the 28 MB of WebAssembly, gzipped), fetched only the first time someone asks for a PDF,
  then kept in the browser. The site itself stays as small as it is.
- **Checked first, not assumed** (the first part of step 5): Typst against Chrome print with Paged.js, on the same
  chapter of Siyar. Compared on: how the page looks, word accuracy of the text layer (Typst scored 84–94% in the
  earlier test in [old/PLAN-full.md](old/PLAN-full.md), Chrome 87–93%), and the time to build an 800-page volume
  on a phone. If Typst loses clearly, the PDF uses Chrome print with Paged.js and a short guide to the print dialog.

### The page
- **Two sizes, one button each:** **A5** (default: reads well on a phone, a tablet and an e-reader) and **17×24 cm**,
  the usual size of Arabic scholarly books, for printing. The 17×24 version has mirrored margins (wider inside, for
  binding) and starts each chapter on an odd page (in an Arabic book, the left-hand page); the blank page this
  may take has no running head.
- **Type:** Amiri as in the EPUB, about 12.5 pt on A5, line height 1.9 (measured: the tightest that keeps the
  vowel marks of two lines apart), justified. Arabic-Indic digits everywhere.
- **Running heads:** the book's title on one page, the current chapter on the facing page, with a thin rule under
  them. The page number at the outer corner. No head on chapter openings.
- **Footnotes at the foot of the page**, under a short rule, smaller type, numbered from ١ on each page like
  printed Arabic books. A footnote too long for its page carries on to the next, as in print.
- **Printed-edition pages:** «[ص١٣٥]» stays in the text as in the EPUB, and the head shows which pages of the
  printed edition this page covers («ص ١٣٥–١٣٦»), so a citation can be read off any page.
- **Headings never sit alone** at the foot of a page. (Single lines of a paragraph may: see the notes under step 5.)
- **Colours:** the same rubrication red for headings and green for Quran as the EPUB, chosen to print well in
  greyscale too.

### The book
- **Opening pages:** the cover (the same cloth-binding design, as a full page), the title page, the book card.
- **«الفهرس» at the end**, where Arabic books put it, with real page numbers and dotted leaders, every entry a link.
- **PDF bookmarks** from the headings (nested), so readers show a contents side panel.
- **Links:** footnote numbers jump to the note and back.
- **File details:** title, author, `lang="ar"`, right-to-left reading order (so two-page view puts page 1 on the
  right), the source note. Fonts embedded as subsets.
- **Volumes:** the same choices as the EPUB: one volume, or the whole book, however long. A long book is laid out
  in parts and joined into one file (see the notes under step 5).

### Text that copies right
- The font is static Amiri (variable fonts ruined the text layer, 3–20%, in the earlier test).
- **A hidden text layer**, as in scanned books with OCR: the printed glyphs read as spaces, and every word is
  written again, invisibly, at the place Typst reports for it, in the order viewers expect (each line left to
  right, letters in visual order, real spaces between words). Without it, fully vowelled text copies at 8–30%.
- A quality check in the tests: build three fixture books, extract them with **pdf.js** (Firefox, most web and
  Android viewers) and **PDFium** (Chrome, Edge), and fail below **95%** of words correct, and in order.

### Steps we skip
- **No print dialog** and no settings to explain: the PDF downloads like the EPUB.
- **No layout options** beyond the page size. One good design.

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
- Volumes: a button for the whole book and a list of volumes (with labels, grouped by part); the book file kept in the browser.
- The look of the book: cloth-binding cover, title page, book card, «الفهرس», chapter openings, book colours
  that work in the reader's white, sepia and night modes.
- **You check:** download 3–4 books and open them in your readers.
  `npm run epubcheck` builds the 4 test books (whole and one volume) into `.cache/epub/` and checks them.

**Notes from building it**
- Honorific signs Amiri lacks (﵀ ﵁ ﷿ …) are written out as words («رحمه الله»); ﷺ ﷻ ﷽ stay as signs.
- The footnote number is the back link (↩ is not in Amiri and shows as an emoji on Apple devices).
- A sentence that runs over a page stays one paragraph, with the «[ج٣ ص١٢٤]» marker inside it.
- The cover has no woven texture: any fine texture made the JPEG about 200 KB bigger.
- Volume lists come from `npm run volumes`, which reads turath's index one book at a time. turath allows
  a few hundred requests, then asks to wait up to an hour; the script then stops and the next run carries
  on, biggest books first. For a book not listed yet, the page has «اختر جزءًا…»: it downloads and reads
  the book once (no file made), shows the list of its volumes, and then any volume is made at once.
  `npm run volumes -- --cached` rebuilds the lists from the kept indexes without asking turath.

### [ ] 4. Put it online
- GitHub Pages (free). The catalog refreshes once a week automatically.
- **You check:** the live link works everywhere.

**Notes from building it**
- `.github/workflows/deploy.yml`: every push to `main` runs the tests, builds, and publishes `dist/` to
  https://m4lcolmy.github.io/Nuskha/. In the repo's Settings → Pages, Source must be «GitHub Actions».
- `.github/workflows/refresh.yml`: every Friday, `npm run catalog` and `npm run volumes`; if `public/data`
  changed, it commits and starts a deploy. It can also be started by hand from the Actions tab.
  turath's indexes are kept in the Actions cache between runs. If that cache has expired, the volume script
  keeps the lists it already has, so a run never loses lists.

### [ ] 5. Print-quality PDF
- **First, a check:** one chapter of Siyar (vowelled, many footnotes) made with Typst and with Chrome print plus
  Paged.js. Pages side by side, text-layer accuracy in pdf.js and PDFium, time for 800 pages on a phone.
  **You choose the engine** from the two PDFs.
- The PDF builder: the same parsed pages, footnotes and headings as the EPUB, written as Typst instead of XHTML,
  then the layout above: A5 and 17×24, running heads, footnotes at the foot of the page, «الفهرس» with page numbers,
  bookmarks, links, right-to-left reading order.
- On the book page: «تحميل PDF» next to the EPUB button, with the size choice under it; the same progress bar
  (the engine is fetched once, then kept).
- The text-layer check in `npm test`, failing below 95%.
- **You check:** download a small book, a book with many footnotes, and one volume of البداية والنهاية. Open them on
  your phone and computer, print a few pages, and copy a paragraph with vowel marks into a search box.

**The engine check (2026-10-16)**

Same pages, same parser (`renderPage`), same type (Amiri 12.5 pt, A5, line height 1.9). Typst 0.14.2 through
typst.ts 0.7.0 (the WebAssembly build the site would use); Chrome 155 printing with Paged.js 0.4.3.
The PDFs are in `.cache/pdf/check/`.

| | Typst | Chrome + Paged.js |
|---|---|---|
| Siyar «بقية العشرة» (94 pages, 5 notes a page) | 133 pages, 2.1 s | 136 pages, 2.5 s + print |
| Siyar vol. 12 (739 pages) | 938 pages: 8.6 s in Chrome, **36 s at 4× slower CPU** (a mid-range phone) | stopped after 887 pages; not done after 10 min |
| Footnotes at the foot of the page | yes; long notes carry on to the next page | yes, but numbering does not restart per page (`counter-reset` ignored) |
| Running heads, odd/even pages | yes | only with more work; `:left`/`:right` assume left-to-right books |
| Right to left | works | lays out nothing past page 1 unless the page frame is left-to-right and only the text right-to-left |
| Bookmarks, «الفهرس» page numbers, links | yes | bookmarks yes; page numbers via `target-counter` |
| The file | bytes in the page: downloads directly, can be fixed up after | goes through the print dialog; the page never gets the file |
| Size | 1.6 MB for 133 pages; vol. 12 is 10 MB (6 MB of it tagged-PDF structure and links, which typst.ts can't switch off) | 1.2 MB for 136 pages |

Text layer, words correct (pdf.js = Firefox and web viewers, PDFium = Chrome and Edge):

| | Typst pdf.js | Typst PDFium | Chrome pdf.js | Chrome PDFium |
|---|---|---|---|---|
| Siyar chapter (hardly any vowel marks, 30k words) | 90.5% | **98.1%** | 90.6% | 96.8% |
| رياض الصالحين 12014, pages 21–80 (fully vowelled, 10k words) | **8.6%** | **30.0%** | **11.0%** | **25.0%** |

- **Vowelled text breaks in both engines.** Typst draws every letter that carries a mark as its own piece of
  text at its own height; the viewers read those pieces as separate lines and put them back in the wrong order
  («قَالَ» → «قَلاَ», marks doubled). Chrome's PDFs fail the same way. Typst also writes the right text as
  `ActualText` for some letters, but pdf.js reads ActualText only for screen readers, never for copy and search.
  The earlier 84–94% (old plan) was measured on Siyar, which has almost no marks.
- In unvowelled text the losses are: a word glued to the digits after it («صحيح٣/١٣٣», pdf.js), ﷺ spelled out in
  reverse by pdf.js, and «إلَّا», «رجلًا» (mark order on alef), in both engines.
- Typst bug: when a paragraph moves to the next page to avoid a stranded line, a footnote can stay behind on the
  page before. With widow/orphan control off, notes always sit with their marker, but a single line can be left
  at the top of a page. (Handled since: see below.)

**You chose Typst.** Notes from building it:

- **The hidden text layer** (`src/lib/pdf/textlayer.ts`). Each word in the Typst source is followed by an
  invisible marker; Typst reports where every marker landed, and the PDF is rewritten
  (`src/lib/pdf/pdffile.ts`): the printed glyphs read as spaces, Typst's `ActualText` goes, and each line is
  written again in a font whose codes are Unicode code points. What the viewers needed, found by testing:
  - pdf.js reverses a line letter by letter, so letters go in reversed order, marks before their letter.
  - pdf.js treats an empty mapping as "no mapping" and shows the glyph codes as Latin letters; a space works.
  - pdf.js breaks a line into pieces at a space glyph followed by a gap under 0.1 em, and adds its own space at
    0.1–0.6 em, after any vowel mark that opens the next word. So the gap depends on the word's first glyph.
  - pdf.js puts a mark that opens a line onto the line before; a NUL glyph opens each line (the viewer drops NULs
    when copying and searching, PDFium skips them).
  - PDFium moves a word's last vowel mark past the punctuation after it; an RLM between them stops that.
  - Arabic-Indic numbers around «–» or «×» are in reverse order on screen; a small bidi step orders each word.

  | words correct, and in order (`npm run pdfcheck`) | pdf.js | PDFium |
  |---|---|---|
  | 17100 (small book) | 99.8%, 98.6% | 99.8%, 98.9% |
  | Siyar «بقية العشرة» (many notes) | 99.9%, 98.2% | 99.9%, 98.4% |
  | رياض الصالحين 12014, pages 21–80 (fully vowelled) | 99.7%, 98.9% | 98.9%, 98.4% |
  | البداية والنهاية 8376, pages 1–120 | 99.9%, 96.9% | 99.9%, 97.2% |

  Poppler (Okular, Evince) reads the vowelled book at 95.8% (12.6% before). The pages look exactly as Typst made
  them (pixel for pixel). The tagged-PDF structure goes, as it pointed at the printed glyphs.
- **Notes on the right page.** Typst 0.14 leaves a note on the page before its marker when it moves the
  marker's line to the next page (to keep a heading with its paragraph, or two lines of a paragraph together).
  So: a note in a heading is placed under the heading (the heading shows its number), and widow and orphan
  control is off (a single line may now sit alone at the top or foot of a page). If Typst still leaves a note
  behind and the block holding the marker starts on the marker's page, a page break goes before the block and
  Typst lays out the part once more. With widow control on, Siyar vol. 12 had 139 of 1,356 notes a page early,
  and زاد المعاد 637 of 16,164 (392 after the second layout). Now 187 (1.2%) of زاد المعاد's notes are not on
  their marker's page; in the part examined closely (2,385 notes), all such notes start on the page after their
  marker, where a long note did not fit at all, and none is on an earlier page.
- **Long books in parts.** One Typst engine can't lay out a whole long book: WebAssembly here has at most 4 GB,
  Siyar vol. 12 already takes 2 GB, and an engine gives no memory back between runs (the third volume in a row
  failed). So the text is cut into parts of at most 120,000 words (about 700 A5 pages, `src/lib/pdf/parts.ts`),
  where the book starts a new page anyway (a volume, else a chapter, else a heading). Each part is laid out by
  a fresh worker, numbering its pages on from the part before; a last worker lays out «الفهرس» (now written by
  Nuskha, from where every heading landed), joins the parts (bookmarks and page labels too), adds the links of
  «الفهرس» and the hidden text. The bar counts the parts («الجزء ٣ من ١٣») and moves within each on an estimate.
- **Speed and memory.** The markers make Typst about 1.5× slower and use twice the memory. In Chrome on this
  laptop, from the click to the file: Siyar vol. 12 (739 book pages, 940 A5 pages) 30 s; زاد المعاد whole (3,983
  book pages, 3,818 A5 pages, 13 parts) 2 min 3 s. A phone will take a few times longer. (In Node, Typst runs
  2–3× slower next to a parsed book, even in another thread, so `npm run pdfcheck` times are not the site's.)
- **File size.** Dictionaries go into compressed object streams, the streams are compressed harder, and Typst's
  page content loses its tags and its eight-decimal positions (two are a hundredth of a point; no visible
  change): زاد المعاد whole is 36 MB (47 MB before the content was tidied). Typst's page content is two thirds of
  a file, the hidden text a third.
- **Brackets in PDFium.** Chrome's reader mirrors «» () [] when it reads right-to-left text back; pdf.js doesn't.
  The hidden text suits pdf.js, so in Chrome a copied «و«الكبرى»» reads «و»الكبرى«». Searching is not affected.
- **The book page.** «تحميل EPUB» and «تحميل PDF» side by side, the page size (A5 or ١٧×٢٤ سم) under them,
  remembered in the browser; every volume has its own EPUB and PDF buttons. The first PDF notes that the engine is
  fetched once. Made in the browser: a small book in a few seconds; volume 3 of البداية والنهاية (416 book pages)
  in 38 s, with the 22 MB book download; زاد المعاد whole in 2 min.

  | `npm run pdfcheck 197` (زاد المعاد whole) | words | in order |
  |---|---|---|
  | pdf.js | 100.0% | 99.5% |
  | PDFium | 99.7% | 96.8% |
- `npm run pdfcheck` builds the test books into `.cache/pdf/` and scores them (`-- 22669 --vol 12`,
  `--size 17x24`, `--pages 1007-1101`). `npm test` builds excerpts of three books (`tests/fixtures/`).

## Later (only if wanted)
- Search inside book text
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
- PDF: [typst.ts (Typst in the browser)](https://github.com/myriad-dreamin/typst.ts), [Typst: Arabic justification (open issue)](https://github.com/typst/typst/issues/195),
  [Chrome print margin boxes](https://developer.chrome.com/blog/print-margins), [Paged.js supported features](https://pagedjs.org/en/documentation/14-supported-feature-of-the-w3c-specifications/)
