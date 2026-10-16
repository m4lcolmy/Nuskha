// The look of the printed book, as a Typst preamble: page, type, running heads, footnotes, headings,
// opening pages and «الفهرس». The book's own text comes after it (see build.ts).
//
// Two page sizes: A5 for reading on a screen, and 17×24 cm (the usual size of Arabic scholarly books)
// for printing, with mirrored margins and chapters opening on an odd page (in an Arabic book, the
// left-hand page).
//
// Every word carries a marker, `<w>`, placed just after it: its value is the word's number in the
// list build.ts keeps, or (text, size) for words made here. Typst reports where each marker landed,
// and textlayer.ts writes the hidden text layer from that.

export type PageSize = 'a5' | '17x24';

export interface PageSpec {
  width: number;
  height: number;
  /** Margins in mm; inside/outside on the print size. */
  top: number;
  bottom: number;
  inside: number;
  outside: number;
  /** Body text, pt. */
  size: number;
  print: boolean;
}

export const PAGE_SIZES: Record<PageSize, PageSpec> = {
  a5: { width: 148, height: 210, top: 22, bottom: 18, inside: 16, outside: 16, size: 12.5, print: false },
  '17x24': { width: 170, height: 240, top: 24, bottom: 20, inside: 22, outside: 16, size: 13.5, print: true },
};

/** Type sizes, in em of the body text. */
export const SIZE = {
  body: 1,
  note: 0.82,
  pg: 0.62,
  head: 0.78,
  card: 0.85,
  volume: 2,
  chapter: 1.45,
};

/** The size of a heading of this level, as the template sets it. */
export function headingSize(level: number, chapterLevel: number, volumeLevel: number): number {
  if (volumeLevel > 0 && level === volumeLevel) return SIZE.volume;
  if (chapterLevel > 0 && level === chapterLevel) return SIZE.chapter;
  return level <= chapterLevel + 1 ? 1.22 : level === chapterLevel + 2 ? 1.1 : 1;
}

/** A Typst string literal. */
export const str = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export interface TemplateInput {
  size: PageSize;
  /** Running head on even pages: Typst markup (with word markers). */
  title: string;
  /** PDF details. */
  docTitle: string;
  author: string;
  description: string;
  keywords: string[];
  /** The heading level that opens a chapter (new page, centred, no running head); 0 for none. */
  chapterLevel: number;
  /** The level of volume headings in a book of several volumes; 0 for none. */
  volumeLevel: number;
}

// Vowelled Arabic needs tall lines. As in the EPUB, the line is 1.9 em from baseline to baseline,
// shared out around Amiri's ascender (1.124) and descender (0.634) as a browser would:
// (1.9 − 1.758) / 2 = 0.071 em above and below.
const EDGES = 'top-edge: 1.195em, bottom-edge: -0.705em';

export function template(t: TemplateInput): string {
  const p = PAGE_SIZES[t.size];
  const margin = p.print
    ? `(top: ${p.top}mm, bottom: ${p.bottom}mm, inside: ${p.inside}mm, outside: ${p.outside}mm)`
    : `(top: ${p.top}mm, bottom: ${p.bottom}mm, x: ${p.inside}mm)`;
  return `// Made by Nuskha (نسخة).
#let red = rgb("#8b1e1e")
#let gold = rgb("#a8834a")
#let green = rgb("#1f5c3e")
#let grey = rgb("#7d7366")
#let ink = rgb("#1a1714")
#let print = ${p.print}
#let chapter-level = ${t.chapterLevel}
#let volume-level = ${t.volumeLevel}

#set document(
  title: ${str(t.docTitle)},
  author: ${str(t.author)},
  description: ${str(t.description)},
  keywords: (${t.keywords.map(str).join(', ')}${t.keywords.length === 1 ? ',' : ''}),
)
#set text(font: "Amiri", lang: "ar", dir: rtl, size: ${p.size}pt, ${EDGES}, fill: ink)
#set par(justify: true, leading: 0pt, spacing: 0.45em, first-line-indent: 0pt)
#set block(spacing: 0.45em)

// A word made here (not from the book), with its marker; size in em of the body text.
#let lit(s, size) = [#s#metadata((s, size))<w>]

#let book-title = [${t.title}]

// --- the page ----------------------------------------------------------------------------------

// Printed-edition pages: «[ص١٣٥]» in the text, and a marker the running head reads.
#let pgm(vol, page) = [#metadata((vol: vol, page: page))<pg>]
#let pgv(label) = box(text(size: ${SIZE.pg}em, fill: grey, top-edge: "ascender", bottom-edge: "descender", label))
#let pg(vol, page, label) = { pgm(vol, page); pgv(label) }

// The last item of a sorted array whose page is at most n (binary search: heads read it on every page).
#let last-upto(items, n) = {
  let (lo, hi) = (0, items.len())
  while lo < hi {
    let mid = calc.quo(lo + hi, 2)
    if items.at(mid).location().page() <= n { lo = mid + 1 } else { hi = mid }
  }
  if lo > 0 { items.at(lo - 1) } else { none }
}
#let first-from(items, n) = {
  let (lo, hi) = (0, items.len())
  while lo < hi {
    let mid = calc.quo(lo + hi, 2)
    if items.at(mid).location().page() < n { lo = mid + 1 } else { hi = mid }
  }
  if lo < items.len() and items.at(lo).location().page() == n { items.at(lo) } else { none }
}

// A new page, and in print an odd one (the left-hand page of an Arabic book). The blank page that
// may take is marked, so it gets no running head (Typst's own pagebreak(to: "odd") gives it one).
#let to-odd() = {
  pagebreak(weak: true)
  if print { context if calc.even(counter(page).get().first()) { [#metadata(none)<blank>]; pagebreak() } }
}

#let head() = context {
  counter(footnote).update(0)
  let n = here().page()
  if first-from(query(<blank>), n) != none { return }
  if chapter-level > 0 and first-from(query(heading.where(level: chapter-level)), n) != none { return }
  if volume-level > 0 and first-from(query(heading.where(level: volume-level)), n) != none { return }
  // Printed pages this page covers: from the one running at its top to the last one starting on it.
  let marks = query(<pg>)
  let before = last-upto(marks, n - 1)
  let last = last-upto(marks, n)
  let first = if before != none { before } else { first-from(marks, n) }
  let range = if first == none { "" } else {
    let (a, b) = (first.value, if last != none { last.value } else { first.value })
    let vol = if a.vol != "" { a.vol + " " } else { "" }
    if a.vol != b.vol { vol + "ص " + a.page + " – " + b.vol + " ص " + b.page }
    else if a.page == b.page { vol + "ص " + a.page }
    else { vol + "ص " + a.page + "–" + b.page }
  }
  // Odd pages are the left-hand pages of an Arabic book: the chapter there, the book's title opposite.
  let even = calc.even(counter(page).get().first())
  let num = numbering("١", ..counter(page).get())
  let middle = if even { book-title } else {
    let level = if chapter-level > 0 { chapter-level } else { 1 }
    let h = last-upto(query(heading.where(level: level)), n)
    if h != none { h.body } else { book-title }
  }
  show footnote: none
  show super: none
  set text(size: ${SIZE.head}em, fill: red, top-edge: "ascender", bottom-edge: "descender")
  set par(justify: false)
  // Right to left: start is the right edge. The page number sits at the outer corner.
  let cells = (
    text(fill: ink, lit(num, ${SIZE.head})),
    align(center, box(height: 1.2em, clip: true, middle)),
    text(fill: grey, if range != "" { lit(range, ${SIZE.head}) }),
  )
  grid(
    columns: (1fr, 4fr, 1fr),
    align: (start + bottom, center + bottom, end + bottom),
    ..(if even { cells } else { cells.rev() }),
  )
  v(-0.35em)
  line(length: 100%, stroke: 0.4pt + gold)
}

#set page(
  width: ${p.width}mm,
  height: ${p.height}mm,
  margin: ${margin},
  header-ascent: 35%,
  numbering: "١",
  header: head(),
  footer: [],
)

// --- footnotes: at the foot of the page, numbered from ١ on each page --------------------------

#set footnote(numbering: "(١)")
#set footnote.entry(
  separator: align(right, line(length: 28%, stroke: 0.5pt + gold)),
  clearance: 0.9em,
  gap: 0.25em,
  indent: 0pt,
)
// «(١) text», the number the same size as the note and a link back to the text.
#show footnote.entry: it => {
  let loc = it.note.location()
  let n = numbering(it.note.numbering, ..counter(footnote).at(loc))
  set text(size: ${SIZE.note}em)
  set par(justify: true)
  // Where the note and its marker landed: Typst can leave a note on the page before (see make.ts).
  let at = if it.note.has("label") { [#metadata((str(it.note.label), loc.page(), here().page()))<fe>] }
  [#at#link(loc, n) #it.note.body]
}
#show footnote: set text(fill: ink)

// A note the text has no marker for: at the foot of the page with its own label, nothing in the text.
#let note(label, body) = {
  box(width: 0pt, hide(footnote(numbering: (..n) => label, body)))
  counter(footnote).update(n => calc.max(0, n - 1))
}

// The number of a heading's note, shown in the heading; the note itself is under the heading.
#let fnref(l) = context super(numbering("(١)", ..counter(footnote).at(l)))

// --- text ----------------------------------------------------------------------------------------

#let q(body) = text(fill: green, body)
#let t(body) = text(fill: red, body)
#let rule() = align(center, block(above: 1em, below: 1em, line(length: 20%, stroke: 0.5pt + gold)))
#let orn() = align(center, block(above: 0.3em, below: 1.2em, text(fill: gold, size: 0.9em, top-edge: "ascender", bottom-edge: "descender")[۞]))

// --- headings ----------------------------------------------------------------------------------

#show heading: set text(weight: "regular", fill: red)
#show heading: it => {
  // The title of «الفهرس» is a heading too, but none of the book's.
  if not it.outlined { return block(below: 1em, it.body) }
  if volume-level > 0 and it.level == volume-level {
    to-odd()
    v(28%)
    align(center, text(size: ${SIZE.volume}em, it.body))
    orn()
    pagebreak(weak: true)
  } else if chapter-level > 0 and it.level == chapter-level {
    to-odd()
    v(8%)
    align(center, block(below: 0.4em, text(size: ${SIZE.chapter}em, it.body)))
    align(center, line(length: 16%, stroke: 0.5pt + gold))
    orn()
  } else {
    let size = if it.level <= chapter-level + 1 { 1.22em } else if it.level == chapter-level + 2 { 1.1em } else { 1em }
    let centred = chapter-level == 0 and it.level == 1
    block(above: 1.3em, below: 0.6em, sticky: true,
      align(if centred { center } else { start }, text(size: size, it.body)))
  }
}

// --- opening pages -----------------------------------------------------------------------------

#let cover-page(path) = page(margin: 0pt, header: none, numbering: none,
  image(path, width: 100%, height: 100%, fit: "cover"))

// Each argument is content (with word markers), or none.
#let title-page(main, edition, vols, author, died, editor, publisher, imprint) = page(header: none, numbering: none, {
  set align(center)
  set par(justify: false)
  v(16%)
  text(size: 2.1em, fill: red, main)
  if edition != none { linebreak(); text(size: 1.05em, edition) }
  if vols != none { v(0.6em); text(size: 1.15em, vols) }
  v(1.2em)
  text(fill: gold, size: 1.2em)[۞]
  v(1.2em)
  if author != none {
    text(size: 0.9em, fill: red, lit("تأليف", 0.9))
    linebreak()
    text(size: 1.3em, author)
    if died != none { linebreak(); text(size: 0.9em, fill: grey, died) }
    v(1em)
  }
  if editor != none {
    text(size: 0.9em, fill: red, lit("تحقيق", 0.9))
    linebreak()
    text(size: 1.3em, editor)
  }
  place(bottom + center, text(fill: grey, {
    publisher
    if publisher != none and imprint != none { linebreak() }
    imprint
  }))
})

#let card-page(body) = page(header: none, numbering: none, {
  set text(size: ${SIZE.card}em)
  set par(justify: false, spacing: 0.3em)
  v(6%)
  align(center, text(size: 1.3em, fill: red, lit("بطاقة الكتاب", ${SIZE.card * 1.3})))
  v(0.8em)
  body
})
#let k(key) = text(fill: red, key)

// --- «الفهرس», at the end, where Arabic books put it ----------------------------------------------

#let fihris() = {
  pagebreak(weak: true)
  to-odd()
  set page(header: none)
  show outline.entry: it => {
    show footnote: none
    show super: none
    let indent = (it.level - 1) * 1.2em
    let size = if it.level <= 1 { 1 } else { 0.94 }
    let n = numbering("١", ..counter(page).at(it.element.location()))
    block(above: 0.3em, below: 0.3em, pad(right: indent, text(size: size * 1em, link(it.element.location(),
      it.indented(none, it.body() + box(width: 1fr, inset: (x: 0.3em), repeat(text(fill: grey)[.], gap: 0.15em)) + text(fill: grey, lit(n, size)))))))
  }
  outline(title: align(center, text(size: 1.6em, fill: red, weight: "regular", lit("الفهرس", 1.6))), indent: 0pt, depth: 4)
}
`;
}
