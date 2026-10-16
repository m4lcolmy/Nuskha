# Nuskha (نسخة) — Step-by-Step Build Plan

The **why** and **what** are in [PLAN.md](PLAN.md). This file is the **how, in order**: small steps that Claude carries out
and you check. Every step ends at a ⏸ **checkpoint**. Claude stops there, reports, and waits for your "OK, next".

---

## How we work

| Rule | Detail |
|---|---|
| One step at a time | Claude never starts the next step without your go-ahead. You can say "do S1.1–S1.3" to batch steps. |
| Every step is a git commit | Message format `S2.3: Arabic search normalizer`. Any step can be undone with one `git revert`. |
| Status lives here | Claude ticks the boxes in this file at each checkpoint: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped. |
| Checkpoint report | ① what changed (files) ② what Claude tested and the results ③ **how you check it**: 1–3 commands or a URL, under 5 minutes ④ anything that went differently from the plan. |
| Nothing leaves your machine without a yes | No `git push`, deploy, email or public post until you approve that action. |
| 👤 = your task | Things only you can do: accounts, sending emails, testing on your phone. |
| Small steps | A step is ~30–90 min of Claude work. If a step grows, Claude splits it and tells you. |
| Plan changes are explicit | If a finding changes the plan, Claude proposes the edit to PLAN.md/STEPS.md and you approve it. |

**Commands you'll use** (from step S1.1 on):
```bash
npm run dev
```
```bash
npm test
```
```bash
npm run build && npm run preview
```

---

## Phase 0: Foundations and proof (de-risk before building)

### [ ] S0.1 Project skeleton
- **Claude:** `git init`, README (what Nuskha is, the tagline, status), MIT `LICENSE` (your name: m4lcolmy), `.gitignore`, `.editorconfig`; move these docs in; first commit.
- **⏸ You check:** read README.md. Is the description right?
- **Done when:** `git log` shows 1 commit and the README reads well.

### [ ] S0.2 PDF text-quality benchmark (`scripts/pdf-bench/`)
- **Claude:** turn the throw-away test scripts into one clean, reusable tool. It takes PDFs plus the source text,
  extracts with **pdf.js, PDFium, MuPDF and Poppler**, and prints a word-accuracy table. Python venv + a small Node helper,
  with a one-line run command and a README.
- **⏸ You check:** run it on your old `سير أعلام النبلاء - نظيف.pdf` and see ≈0–2%. Run it on a fresh WeasyPrint-70/Amiri sample and see ≈93–97%.
- **Done when:** the numbers match the table in PLAN §1.2 (±1%).

### [ ] S0.3 turath format probe (`scripts/probe-turath/`)
- **Claude:** script downloads the catalog plus ~10 books (smallest, median, largest, multi-volume, footnote-heavy,
  Siyar 22669). It checks the key map from PLAN §4.2 on every book and writes `docs/turath-format.md`
  (keys, markup seen, footnote patterns, oddities). Downloads go to a git-ignored `.cache/` and are **never committed**.
- **⏸ You check:** skim `docs/turath-format.md`.
- **Done when:** the key map holds for all sampled books, or the report says exactly where it differs.

### [ ] S0.4 Browser-print spike (the biggest risk)
- **Claude:** one standalone test page `spikes/print/index.html`: Amiri **woff2 web font**, A5 `@page`, running header,
  footnotes, ~30 real pages from Siyar 22669 vol.1. Then: print it with headless Chrome, score it with S0.2, and fix CSS until ≥ 95%.
- **👤 You:** open the page and "Save as PDF" in **Firefox** (installed on your machine) and in **Chrome on your Android phone**.
  Also in Safari if you have access to an Apple device. Drop the PDFs into `spikes/print/results/`.
- **Claude:** scores your PDFs and writes the browser × viewer table into PLAN §5.2.
- **⏸ Decision:** which browsers get the "print to PDF" button and which get "use Chrome/Edge".
- **Done when:** the table is filled in and the go/no-go is recorded.

### [ ] S0.5 Permission emails (draft only)
- **Claude:** drafts 2 short, polite emails (Arabic + English) to turath's makers (Nuqayah) and Shamela (`mail@shamela.ws`).
  They explain the project, that no content is re-hosted, and ask for a blessing or preferred usage rules.
- **👤 You:** review and send them from your own address. We continue meanwhile; their answers may adjust Phase 2–3.
- **Done when:** sent (or you decide to postpone).

---

## Phase 1: App foundation

### [ ] S1.1 Scaffold
- **Claude:** Vite + Svelte 5 + TypeScript, ESLint + Prettier, Vitest, Playwright; `npm run dev/test/build/preview`;
  a placeholder page that says «نسخة».
- **⏸ You check:** `npm install && npm run dev`, open the URL, see «نسخة».
- **Done when:** dev, test and build all pass.

### [ ] S1.2 Design system
- **Claude:** design tokens (colours, type scale, spacing, radius) for light and dark; fonts self-hosted as woff2 (IBM Plex Sans Arabic for UI,
  Amiri for titles), OFL licence files; base components: Button, IconButton, SearchField, Card, Badge, Chip, ProgressBar, Sheet/Modal, Toggle.
  Plus a hidden `/styleguide` page showing all of them. RTL first; phone-width checked.
- **⏸ You check:** open `/styleguide` in light and dark mode, and on your phone through the local network URL. Tell Claude what to change.
- **Done when:** you approve the look. **This sets the visual language for everything after.**

### [ ] S1.3 i18n (Arabic + English)
- **Claude:** small typed dictionary system, language toggle (remembered), `dir`/`lang` switch, all UI strings externalized.
- **⏸ You check:** toggle languages on `/styleguide`. The layout mirrors correctly.

### [ ] S1.4 CI
- **Claude:** `.github/workflows/ci.yml`: install, lint, type-check, unit tests, build.
  It runs once the repo is on GitHub, and Claude runs the same commands locally now.
- **⏸ You check:** `npm run ci` passes locally.

### [ ] S1.5 GitHub repo + Pages deploy
- **👤 You:** create a public GitHub repo `nuskha`. Then either install the `gh` CLI and log in, or give Claude the repo URL.
- **Claude:** adds the remote and `deploy.yml` (build → GitHub Pages), sets the Vite `base` path, adds a 404 fallback.
  After you approve, pushes.
- **⏸ You check:** the live URL `https://<you>.github.io/nuskha/` shows the placeholder.
- **Done when:** a push to `main` updates the live site automatically.

---

## Phase 2: Catalog and search

### [ ] S2.1 Catalog builder (`scripts/build-catalog.ts`)
- **Claude:** downloads `data-v4.sqlite` and emits `public/data/catalog.json` (~280 KB gz) and `public/data/info/{0..63}.json`.
  Skips the rebuild when `data_version` is unchanged. Unit tests on a tiny synthetic SQLite fixture.
- **⏸ You check:** `npm run catalog`, then look at the printed stats (books, authors, sizes) and a sample row for 22669.

### [ ] S2.2 Daily catalog job
- **Claude:** `.github/workflows/catalog.yml` runs daily and on manual trigger, rebuilds, and commits only if changed.
- **⏸ You check:** after S1.5, run it once from the GitHub Actions tab.

### [ ] S2.3 Arabic search
- **Claude:** normalizer (أإآ→ا, ى→ي, ة→ه, strip harakat/tatweel, unify digits) + MiniSearch index over title, author and category,
  with prefix and fuzzy matching. Tests with real queries, e.g. «سير اعلام» finds both Siyar editions, «الذهبى» finds الذهبي.
- **⏸ You check:** `npm test`, and read the list of test queries. Add any query you care about.

### [ ] S2.4 Home page
- **Claude:** wordmark + tagline, big search field, category chips, live results (title, author · death year, pages · size, badges),
  empty, loading and no-results states, keyboard navigation.
- **⏸ You check:** `npm run dev` and try 5–10 real searches. Is it fast and clear?

### [ ] S2.5 Book page
- **Claude:** route `/book/:id`: title, author, category, collapsible bibliographic info (lazy-loaded shard), volumes, page count, size,
  source attribution, and format buttons (disabled until Phase 3).
- **⏸ You check:** open `/book/22669` and a few others. Is the info complete and correct?
- **🚀 Optional deploy:** a searchable catalog is already useful online.

---

## Phase 3: Book engine and EPUB

### [ ] S3.1 Download in a Web Worker
- **Claude:** Worker + Comlink. Streams `fetch` from `files.turath.io/books-v3/{id}.json` with byte progress and cancel.
  Errors: offline, 404, too large.
- **⏸ You check:** a debug button on the book page downloads 22669 and shows progress, and cancel works.

### [ ] S3.2 Parser
- **Claude:** typed parser with the key map and schema validation, giving clear errors if turath changes the format.
  Tests run on cached real books from S0.3 (not committed) and tiny committed synthetic fixtures.
- **⏸ You check:** `npm test` passes, with the summary of parsed books (pages, volumes, headings count).

### [ ] S3.3 Normalizer → BookModel
- **Claude:** unescape entities; split body/footnotes at `_________`; link `(^n)` markers to notes; headings from `indexes`;
  volume + printed page markers. Options: remove harakat, honorifics (symbol/words), remove tatweel. Snapshot tests on fixture pages.
- **⏸ You check:** Claude shows 3 before/after page examples from Siyar, including a page with footnotes. Do they look right?

### [ ] S3.4 EPUB 3 builder
- **Claude:** fflate zip, per-volume XHTML (split if large), nested TOC, **printed-page page-list**, footnote pop-ups
  (`noteref`/`footnote`), RTL metadata, embedded Amiri subset, source and attribution page. **epubcheck** in tests.
- **👤 You check:** open the generated `22669.epub` in your e-reader app(s) (Librera/Readest/others). Check the TOC, footnote pop-ups,
  going to a printed page, the look, and the opening speed.
- **Done when:** epubcheck passes with 0 errors and you're happy reading it.

### [ ] S3.5 Download flow UI
- **Claude:** enable the EPUB button. Options panel (font size, harakat, honorifics, footnote placement), progress sheet
  (download → process → build), save file named `«الكتاب» - المؤلف (22669).epub`, size warning for huge books, per-volume choice.
- **⏸ You check:** end-to-end in the browser: search → book → EPUB on 3 books (small, Siyar, one with >10 volumes).
- **🚀 Deploy v0.1** after your OK.

---

## Phase 4: PDF

### [ ] S4.1 Print document builder
- **Claude:** the CSS proven in S0.4 turned into a builder. A5 default (A4 option), running header «الكتاب · ج/ص», page numbers,
  «ج ٣ / ص ١٢٤» markers, footnotes under each source page, headings that don't get stranded at the bottom of a page.
- **⏸ You check:** a preview page renders the book as it will print.

### [ ] S4.2 Print flow
- **Claude:** hidden iframe → `document.fonts.ready` → `print()`. Print guide modal (Save as PDF, headers/footers off),
  browser detection based on the S0.4 results, per-volume buttons for big books.
- **👤 You check:** print Siyar vol.1 to PDF from the app in Chrome, then open it in your e-reader app.
  Select and copy a paragraph and paste it somewhere.

### [ ] S4.3 PDF quality gate in CI
- **Claude:** Playwright prints fixture books → S0.2 scorer (pdf.js + PDFium) → **fail if < 95%**.
- **⏸ You check:** `npm run test:pdf` shows the score table.
- **🚀 Deploy v0.2** after your OK.

---

## Phase 5: Text quality and the PDF checker

### [ ] S5.1 Honorifics
- **Claude:** handle U+FD40–FD4F and U+FDFF: "words" mode (default for PDF) and "symbol" mode with a Scheherazade New fallback
  through `unicode-range`. Benchmark both.
- **⏸ You check:** pick the default, with the scores to help.

### [ ] S5.2 "Nuskha Naskh" font experiment
- **Claude:** fontTools build from Amiri (respecting its OFL terms, renamed). Removes the lam-kaf tatweel insertion and other
  ligatures that hurt extraction, adds the honorific glyphs, subsets. Benchmarks against plain Amiri. **Kept only if it scores higher with no visual loss.**
- **⏸ You check:** side-by-side visual sample + score table → keep or drop.

### [ ] S5.3 PDF checker page `/check`
- **Claude:** drop any PDF and it's scored **locally** with pdf.js (nothing uploaded). Shows Arabic text accuracy, reversed text,
  presentation-form letters, broken lam-alef, and a plain-language explanation and suggestion.
- **👤 You check:** drop your old `نظيف.pdf` (expect ❌ ~0%) and a Nuskha PDF (expect ✅ ≥95%).
- **🚀 Deploy v0.3** after your OK.

---

## Phase 6: Polish and v1.0

### [ ] S6.1 HTML and TXT outputs
Self-contained single HTML (embedded font, TOC sidebar) and plain TXT with `[ج٣ ص١٢٤]` markers. **⏸** open both.

### [ ] S6.2 About / Legal page
Sources, attribution, licences (MIT, OFL), no-re-hosting statement, takedown contact. **⏸** you approve the wording.

### [ ] S6.3 PWA + performance + accessibility
Installable, offline app shell + cached catalog. Lighthouse ≥ 95 in all categories, keyboard and screen-reader pass. **⏸** Lighthouse report.

### [ ] S6.4 Turkish UI
`tr` dictionary. **👤** you proofread it.

### [ ] S6.5 Release v1.0
CHANGELOG, version tag, README screenshots, short announcement text (ar/en/tr). **⏸** you approve, then push the tag and publish.

---

## Later (not scheduled)
- Typst-WASM PDF engine for browsers where printing scores badly
- Cloudflare Worker proxy for turath full-text search
- DOCX output
- "Send to Midad", the future reader app

## Progress log
| Date | Step | Result |
|---|---|---|
| 2026-10-10 | Planning | PLAN.md + STEPS.md written; name **Nuskha**, licence **MIT**, PDF **A5** decided |
