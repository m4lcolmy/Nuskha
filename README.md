# Nuskha (نسخة)

Search any Shamela book. Download it as a good EPUB.

Everything runs in your browser. There is no server.

## What it does

- Searches 8,600+ books by title, author, editor or publisher.
- Understands Arabic spelling differences (أ/ا, ة/ه, ى/ي) and small typos.
- Takes a shamela.ws link or a book number, too.
- Makes an EPUB of the whole book or one volume.

## The EPUB

- Right to left.
- Amiri font built in.
- Cover, title page and «الفهرس».
- Table of contents from the book's headings.
- Printed page numbers (ج٣ ص١٢٤).
- Pop-up footnotes.

## Where the books come from

[turath.io](https://turath.io), a mirror of Shamela.
Book numbers are the same as on shamela.ws.

## Run it

You need Node.js 22.18 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open the link it prints.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the site locally |
| `npm run build` | Check types and build to `dist/` |
| `npm test` | Run the tests |
| `npm run catalog` | Rebuild the book list from turath |
| `npm run volumes` | Rebuild the volume lists |
| `npm run fonts` | Rebuild the fonts (needs Python, fontTools, brotli) |
| `npm run epubcheck` | Build 4 test books and check them |
| `npm run size` | Show the size of the built site |

## Online

https://m4lcolmy.github.io/Nuskha/

Every push to `main` builds and publishes the site (GitHub Pages).
Every Friday the book list and volume lists are refreshed from turath.

## Project layout

- `src/` – the website (Svelte)
- `src/lib/epub/` – the EPUB builder
- `src/lib/search/` – Arabic search
- `scripts/` – data and font scripts
- `.github/workflows/` – deploy and weekly refresh
- `public/data/` – the book list and volume lists
- `tests/` – tests
- `docs/STEPS.md` – the plan

## License

MIT
