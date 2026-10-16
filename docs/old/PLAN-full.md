# Nuskha (نسخة) — Plan

**A free static website: pick any Shamela book → download a clean EPUB or a PDF whose Arabic text selects, copies and searches correctly.**
Everything runs in the visitor's browser. There is no server, and hosting costs nothing.

*Written 2026-10-10. The reader-app research (Midad) is kept separately in `~/code/Midad/docs/research.md`.*

---

## 1. Findings that shape the plan

### 1.1 Where the books come from
turath.io is a mirror of Shamela run by Nuqayah, and its file host can be read **directly from a browser**: it sends
`Access-Control-Allow-Origin: *` (CORS), so pages on other sites may fetch from it.

| URL | What | Size | Browser can fetch? |
|---|---|---|---|
| `files.turath.io/data-v4.sqlite` | Full catalog: **8,609 books**, 3,192 authors, 40 categories, bibliographic info | 22 MB | ✅ |
| `files.turath.io/books-v3/{id}.json` | Whole book: pages, volumes, printed page numbers, headings, footnotes | median 0.4 MB · p90 4.7 MB · max 267 MB (served compressed: Siyar 45 MB → 10.5 MB) | ✅ |
| `files.turath.io/epub/{id}.epub` | turath's own EPUB (one file per page, 3-line CSS, no page list) | | ✅ |
| `api.turath.io/…` (search, page, book) | JSON API | | ❌ no CORS header |
| `shamela.ws` | | | ❌ no CORS header |

- Book IDs match Shamela's. Siyar ط الرسالة = `10906`, **ط الحديث (your edition) = `22669`**.
- Book JSON has `meta`, `indexes` and `pages`. Some of the top-level keys are disguised as harakat characters
  (U+064B, U+0658, …), so we need a small key map (§4.2).
- Page text is light markup: `<span data-type="title" id=toc-N>`, footnote markers `(^١)`, a `\n_________\n`
  separator before the footnotes, and HTML entities (`&quot;`).

**Result: no backend is needed.** The catalog is rebuilt into our own small file at build time
(**278 KB gzipped**), and book content goes straight from turath to the visitor's browser.

### 1.2 Why your PDFs have broken text
I measured how many words come out exactly right when the text is extracted with the engines real readers use.

| Engine | Font | Poppler (Okular/Evince) | MuPDF (Android readers, Sumatra) | PDFium (Chrome/Edge viewer) | pdf.js (Firefox, web viewers) |
|---|---|---|---|---|---|
| **WeasyPrint 61.1 (your `نظيف.pdf`)** | Noto Naskh | **0.7%** | **0.5%** | **2.0%** | **0.3%** |
| calibre 7.6 (your other PDF) | Traditional Naskh | lam-alef and «الله» come out broken: `ثالث` `البالء` `اهلل` `ال يجالسوهم` | | | |
| Chrome print | Noto Naskh (system) | 90.6% | 91.1% | 33.7% | 5.0% |
| Typst 0.15 | Amiri | 90.9% | 92.4% | 94.2% | 83.8% |
| **WeasyPrint 70** | **Amiri** | **92.1%** | **96.9%** | **95.8%** | **94.7%** |
| **Chrome print** | **Amiri** | **91.1%** | **92.0%** | **93.2%** | **87.3%** |
| *Real test: Siyar vol. 1, 863 pages, 160k words* | | | | | |
| WeasyPrint 70 | Amiri | 93.5% | 96.7% | 96.6% | 95.7% |
| **Chrome print** | **Amiri** | **93.9%** | **95.1%** | **96.0%** | **93.5%** |

Diagnosis:
1. **WeasyPrint 61 writes a broken glyph-to-letter table** ("Illegal entry in bfchar block in ToUnicode CMap").
   That's why your clean PDF comes out reversed and repeats phrases. WeasyPrint 70 fixed it.
2. **The font matters as much as the engine.** Variable fonts (Google's current Noto Naskh, Noto Sans Arabic,
   Markazi) ruin the text layer: 3–20%. **Amiri (static TTF) is the best by far** in every engine and viewer.
3. **Chrome's built-in "Save as PDF" with Amiri is as good as WeasyPrint 70, and 6× faster** (863 pages in 3.9 s vs 24 s).
   So the website can make the PDF **inside the visitor's own browser**.
4. The remaining 4–7% loss comes from specific spots:
   - some vowel marks are dropped or reordered on fully-vowelled words (`فَلَمَّا`)
   - Amiri inserts a tatweel between lam and kaf (`الـكوفة`)
   - a few letter pairs (`زيارة` → `يارة` in Poppler and pdf.js)
   - `ﷺ` is expanded to words by some viewers

   §5.3 covers how we'll fix these.
5. **Amiri lacks the Unicode-14 honorifics Shamela uses** (﵀ ﵁ ﵂ ﵃ ﵄ ﵇ ﷿, U+FD40–FD4F, U+FDFF).
   We'll expand them to words or fall back to Scheherazade New for those characters only.

---

## 2. Scope

**v1 (MVP)**
- Search and browse the full catalog by title, author or category. Arabic-aware matching (أ/إ/آ/ا, ى/ي, ة/ه, harakat ignored).
- Book page: title, author (with death year), category, editor/publisher info, volumes, page count, size.
- Download formats:
  - **EPUB 3**: volumes, table of contents from headings, **printed page numbers** (page-list), footnotes as pop-ups, embedded Amiri.
  - **PDF**: Chrome/Edge print path, per volume or whole book, **A5 by default** (A4 optional), page header «الكتاب – ج/ص».
  - **HTML**: one self-contained file.
  - **TXT**: plain text.
- Options: font size, harakat keep/remove, honorifics as symbol or words, footnotes after each page or at the end.
- Progress, cancel, and a warning for huge books.
- Arabic-first UI, plus English (Turkish later). Light and dark mode. Works on phones.

**Not in v1:** OCR or the scanned PDFs, full-text search inside books, accounts, any server, Nuskha-hosted copies of books.

---

## 3. Architecture

```
┌──────────── GitHub repo (public, open source) ────────────┐
│  src/ (Svelte + TS)   scripts/build-catalog.ts              │
│  GitHub Action: daily ─► download data-v4.sqlite ─►         │
│      catalog.json.gz (278 KB) + info/{shard}.json           │
│  GitHub Action: on push ─► test ─► build ─► deploy          │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
                 GitHub Pages (static, free)
                               │  HTML/JS/CSS, fonts, catalog
                               ▼
┌──────────────────── Visitor's browser ─────────────────────┐
│ UI (main thread)          Web Worker                        │
│ search ◄── catalog        fetch files.turath.io/books-v3/id │
│ book page ──request──►    parse → normalize → BookModel     │
│                           ├─► EPUB builder (fflate zip)     │
│                           ├─► HTML/TXT builder              │
│                           └─► Print HTML ─► hidden iframe   │
│                                 └─► window.print() → PDF    │
│ ◄──── Blob download (no upload anywhere) ────               │
└─────────────────────────────────────────────────────────────┘
```

**Hosting: GitHub Pages.** It's free for public repos, builds from the same repo through Actions, and has a 1 GB site
limit and roughly 100 GB/month bandwidth. Our traffic is small because books never pass through us.
If we ever need a proxy (e.g. for `api.turath.io` search), the alternative is Cloudflare Pages + a Worker
(unlimited static bandwidth, 100k Worker requests per day).

---

## 4. Data layer

### 4.1 Catalog (build time)
`scripts/build-catalog.ts` runs in a daily GitHub Action:
1. Download `data-v4.sqlite`. Skip the rebuild if `snapshot_meta.data_version` hasn't changed (currently 21676).
2. Emit `public/data/catalog.json` with rows `[id, name, author_id, cat_id, page_count, size, has_pdf]`,
   plus authors `{id: [name, death]}` and categories.
3. Emit `public/data/info/{id % 64}.json` shards with `info` (bibliographic text: محقق، الناشر، الطبعة).
   Each shard is about 11 KB gzipped and is loaded when a book page opens.
4. Pre-compute normalized search keys. Commit only if something changed.

### 4.2 Book JSON parser (`src/lib/turath/parse.ts`)
Observed key map:

| Key | Meaning |
|---|---|
| `U+064B` | meta → `U+064C` id, `U+064D` name, `U+0650` pdf_links, `U+0651` info, `U+0653` version, `U+0654` author_id, `U+0655` cat_id |
| `U+0658` | indexes → `U+0659` volumes, `U+065A` headings `{title, level, page}`, `U+065B` "vol,page"→page-index map, `U+065C` volume bounds, `U+065D` page list, `U+065E` page→heading |
| `pages[]` | `{text, vol, page}` |

- Validate the map with schema checks on startup. If the format changes, fail loudly with a clear message.
- Keep **fixture books** in `tests/fixtures/` (17100 = small, 22669 vol.1 extract = Siyar ط الحديث) for snapshot tests.

### 4.3 Normalization → `BookModel`
For each page: unescape entities, split body from footnotes at `_________`, link `(^n)` markers to their notes,
turn title spans into heading levels from `indexes.headings`, and keep `vol` + printed `page`.
Options are applied here:
- remove harakat (U+064B–U+0652, U+0670)
- expand honorifics (﵁ → رضي الله عنه …)
- remove tatweel

### 4.4 Large books
- Parse in a Web Worker so the UI never freezes. Show download progress (streamed `fetch`) and conversion progress.
- Above 50 MB of JSON, warn first. Above 150 MB, offer per-volume output only.
- Generate EPUB and PDF **per volume** when there are more than ~1,500 printed pages (Siyar ط الحديث: 16 volumes).

---

## 5. Output formats

### 5.1 EPUB 3 (primary format)
- One XHTML per volume, or per heading chunk if a volume is longer than ~300 KB, for reader speed.
- `nav.xhtml` TOC from `indexes.headings` (nested by `level`), plus `page-list` nav for **printed page numbers**,
  so citations like (٣/ ١٢٤) can be found in the reader.
- Page markers as `<span epub:type="pagebreak" id="v3p124" title="١٢٤"/>`.
- Footnotes: `<a epub:type="noteref">` → `<aside epub:type="footnote">` at the end of each source page.
  This gives pop-ups in Apple Books, KOReader and Readest, with a plain fallback elsewhere.
- Metadata: title, author, `dc:language ar`, `page-progression-direction="rtl"`, source note «turath.io / المكتبة الشاملة — رقم الكتاب».
- Embedded **Amiri** subset (OFL licence included). CSS: RTL, justified, 1.8 line height, footnotes smaller.
- Check every output with **epubcheck** in CI.

### 5.2 PDF: print in the browser
1. Build a print-only HTML document in a hidden `<iframe>`:
   - `@page { size: A5; margin: … }`
   - a running header (book title · volume/page) using Chrome's `@page` margin boxes, plus page numbers
   - each Shamela page starts with a small «ج ٣ / ص ١٢٤» marker
   - footnotes at the bottom of each source page
2. Wait for `document.fonts.ready`, then call `iframe.contentWindow.print()`.
3. Before the dialog opens, a short guide explains the two settings: **Destination: Save as PDF** and **Headers and footers: off**.
4. **Supported:** Chrome and Edge (measured above).
   Firefox and Safari use other print engines and haven't been tested yet (Phase 0). Until they are, show:
   "For a PDF with correct Arabic text, use Chrome or Edge."
   Fallback if they fail: an in-browser **Typst (WASM)** engine (83–94%).

### 5.3 Getting text quality closer to 100%
- **Quality gate in CI:** Playwright (headless Chrome) prints the fixture books, and extraction is scored with
  **pdf.js and PDFium**. The build fails below **95%** word accuracy. These are the same benchmark scripts used for §1.2, cleaned up.
- **"Nuskha Naskh" font:** a fontTools build of Amiri (OFL lets us modify it under a new name):
  - remove the lam-kaf tatweel lookup and other decorative ligatures that confuse text extraction
  - add the U+FD40–FD4F honorifics from Scheherazade New
  - subset to the Arabic + Latin + digits used in Shamela

  Keep it only if the benchmark improves.
- Option **"remove harakat"**, for the cleanest selection and search. Unvowelled text extracts at about 97%+.
- Offer **"Text-selectable check"**: we extract the generated PDF with pdf.js in the browser and show the score
  (e.g. "Text quality 96% ✓"). This is the "show the PDF problem" you asked for. Users can also drop in **any
  PDF** (like the old `نظيف.pdf`) and see why its text is broken. Everything runs locally; nothing is uploaded.

### 5.4 HTML and TXT
One self-contained HTML file (Amiri embedded as base64 woff2, TOC sidebar, printable), and a plain UTF-8 TXT with
`[ج٣ ص١٢٤]` markers and footnotes after each page.

---

## 6. Design: minimal and professional

**Principles:** one task per screen, generous whitespace, Arabic typography first, no ads, no clutter, no pop-ups except the print guide.

| Element | Spec |
|---|---|
| Layout | max-width 720 px column, 16 px side gutter on phones; RTL by default (`dir` switches with UI language) |
| UI type | **IBM Plex Sans Arabic** for interface (clean, many weights); **Amiri** for book titles and previews |
| Colour | Ink-black text `#1a1a1a` on paper `#fbfaf7`; single accent **deep ink-blue `#1f3a5f`**; muted grey `#6b6b6b`; dark mode `#121212` / `#e8e6e1`, same accent lightened |
| Shape | 8 px radius, 1 px hairline borders, no heavy shadows, no gradients |
| Motion | 150 ms fades only; respects `prefers-reduced-motion` |
| Icons | Lucide, 1.5 px stroke, used sparingly |

**Screens**
1. **Home:** wordmark «نسخة», one-line purpose, a large search field, and category chips under it. Results appear as you type:
   title (Amiri), author · death year, pages · size, small badges like «مصور» (has scan) and «كبير» (large).
2. **Book page:** title, author, a collapsed bibliographic info block, volumes list, then **one primary button
   "تحميل EPUB"** and secondary buttons PDF / HTML / TXT. Options sit in a collapsed "إعدادات" panel.
3. **Progress sheet:** a single bar with 3 labelled steps (تنزيل ← معالجة ← إنشاء), size downloaded, and a cancel button.
4. **Print guide** (PDF only): a small illustration of Chrome's dialog with the 2 settings highlighted, then "متابعة".
5. **PDF checker:** drop a PDF, see the score per viewer engine (pdf.js only, in-browser), with a plain explanation of the cause.
6. **About / Legal:** sources, licences, a takedown contact.

Accessibility: WCAG AA contrast, full keyboard navigation, visible focus rings, `lang="ar"` on Arabic content.

---

## 7. Tech stack

| Need | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | fast, static output |
| UI | **Svelte 5** | tiny bundles, simple code for a solo developer |
| Zip (EPUB) | **fflate** | small, fast, works in a Worker |
| Search | own normalizer + **MiniSearch** | catalog is only 8.6k rows |
| Worker RPC | **Comlink** | clean Worker API |
| Font tooling | **fontTools** (Python, build-time only) | subset/patch Amiri |
| Tests | **Vitest** (parser and builders), **Playwright** (end-to-end + PDF quality gate), **epubcheck** | |
| PDF scoring | **pdfjs-dist** (CI + in-browser checker), **pypdfium2** (CI) | the viewers people actually use |
| Deploy | GitHub Actions → GitHub Pages | free |

### Repository layout
```
nuskha/
├─ src/
│  ├─ routes/ (Home, Book, Checker, About)
│  ├─ lib/turath/ (fetch, parse, keymap, types)
│  ├─ lib/model/ (normalize, BookModel)
│  ├─ lib/build/ (epub/, print/, html/, txt/)
│  ├─ lib/search/ (arabic-normalize, index)
│  ├─ lib/check/ (pdf text-quality scorer)
│  ├─ workers/convert.worker.ts
│  └─ i18n/ (ar, en)
├─ public/fonts/ (NuskhaNaskh.woff2, IBMPlexSansArabic*.woff2, OFL.txt)
├─ public/data/ (generated: catalog.json, info/*.json)
├─ scripts/ (build-catalog.ts, build-font.py, pdf-bench/)
├─ tests/ (fixtures/, unit/, e2e/)
└─ .github/workflows/ (catalog.yml, ci.yml, deploy.yml)
```

---

## 8. Milestones

| Phase | Work | Done when |
|---|---|---|
| **0. Spikes** (2–3 days) | ① Print from a page with Amiri **as a web font (woff2)** in Chrome, Edge, Firefox, Safari and re-score. ② Print one full Siyar volume from an iframe in Chrome on a mid-range laptop and phone, and measure time and memory. ③ Confirm the turath key map on 5 random books including the largest. ④ Email turath (Nuqayah) and Shamela about use (see §9). | A table of browser × score; a go/no-go for browser printing on each browser |
| **1. Catalog + search** (week 1) | Catalog Action, search with Arabic normalization, Home + Book pages, design system, i18n, deploy | You can search any of the 8,609 books on the live URL |
| **2. EPUB** (week 2) | Parser, normalizer, EPUB builder, Worker + progress, fixture snapshot tests, epubcheck in CI | Siyar ط الحديث EPUB passes epubcheck and opens with TOC, page list and footnotes in Readest/KOReader/Apple Books |
| **3. PDF** (week 3) | Print document, running headers, per-volume printing, print guide, quality gate in CI | Siyar vol.1 PDF scores ≥ 95% in pdf.js and PDFium |
| **4. Text-quality work** (week 4) | Nuskha Naskh font build, honorific handling, in-browser PDF checker page | Score ≥ 97% unvowelled; the checker shows `نظيف.pdf` ≈ 0% vs new PDF ≥ 95% |
| **5. Polish** | HTML/TXT, dark mode, PWA install, Turkish UI, Lighthouse ≥ 95, About/Legal | v1.0 announced |
| Later | Typst-WASM PDF for Firefox/Safari, Cloudflare Worker for turath full-text search, DOCX, pass a book straight to the future Midad reader app (~/code/Midad) | |

---

## 9. Legal and ethics (not legal advice)
- **Nuskha never stores or re-hosts books.** The visitor's browser fetches from turath and converts locally.
  Nuskha's site only serves the catalog metadata.
- Attribution on every book page and inside every file: «المصدر: تراث / المكتبة الشاملة، رقم الكتاب ٢٢٦٦٩».
- Show the edition's محقق and publisher (from `info`). Modern تحقيق and footnotes can be copyrighted by their editors.
- Be polite to turath: no bulk or parallel downloads. Use one request per user action and cache the catalog by `data_version`.
- **Ask permission before launch:** turath (Nuqayah, the makers of the app at app.turath.io) and Shamela (`mail@shamela.ws`).
  Their public file host sends `Access-Control-Allow-Origin: *`, which suggests open access, but a written OK is better.
- Takedown contact on the About page. Licences: code **MIT**; fonts OFL (licence file shipped alongside); the catalog belongs to its source.

## 10. Risks
| Risk | Mitigation |
|---|---|
| turath changes JSON keys or URLs | Schema check + fixture tests + daily catalog job alerts; parser versioned by `ver=3` |
| turath blocks third-party use | Ask early; fallback: user-supplied Shamela desktop export (the `.htm` files from your current workflow) converted in-browser |
| Firefox/Safari print gives a bad text layer | Detect browser, recommend Chrome/Edge; later a Typst-WASM engine |
| Browser runs out of memory on giant books | Worker + per-volume generation + size warnings |
| Print dialog settings confuse users | Illustrated guide; `@page` margins set so default settings already look right |

## 11. Decisions
**Decided (2026-10-10)**
- Name: **Nuskha · نُسخة**. Tagline: «خذ نسختك من كتب الشاملة: PDF و EPUB بنص عربي سليم».
- Code licence: **MIT**.
- Default PDF page size: **A5**. It reads best in e-book apps and on phones. A4 stays as an option.

**Open (defaults in bold)**
1. UI languages: **Arabic + English** first, Turkish in Phase 5?
2. Hosting: **GitHub Pages** or Cloudflare Pages?
