// The look of the book: like a well-printed Arabic book. The page background and body text colour
// are left to the reading app, so its paper, sepia and night modes keep working; only the accents
// (rubrication red, gold-brown rules, Quran green) are set, with lighter versions for night mode.

const DAY = { red: '#8b1e1e', gold: '#a8834a', green: '#1f5c3e', grey: '#8c8173' };
const NIGHT = { red: '#e3988a', gold: '#c9a46b', green: '#8cc7a1', grey: '#a39785' };
const INK = { red: '#222', gold: '#666', green: '#222', grey: '#777' };

const accents = (c: typeof DAY) => `
h1, h2, h3, h4, h5, h6, .t, .role, .k { color: ${c.red}; }
.q { color: ${c.green}; }
.pg, .loc, .died, .imprint, .source { color: ${c.grey}; }
.orn, .titlepage .orn { color: ${c.gold}; }
.fn:first-child::before { border-color: ${c.gold}; }
hr.rule { border-color: ${c.gold}; }`;

export const CSS = `@charset "utf-8";
@namespace epub "http://www.idpf.org/2007/ops";

@font-face {
  font-family: "Amiri";
  font-style: normal;
  font-weight: normal;
  src: url(../fonts/Amiri-Regular.ttf);
}

/* Vowelled Arabic needs tall lines: Amiri's own line is 1.76 em, and at a reader's usual 1.3 the
   marks of one line run into the next. The line height is set on p as well, since many reading
   apps put their own on body. */
body {
  font-family: "Amiri", "Traditional Arabic", "Geeza Pro", serif;
  line-height: 2.2;
  text-align: justify;
  margin: 0 4%;
  widows: 2;
  orphans: 2;
}
p { margin: 0 0 0.45em 0; text-indent: 0; line-height: 2.2; }

/* Headings: top level opens a chapter, centred, with a short rule and ۞ under it. */
h1, h2, h3, h4, h5, h6 {
  font-weight: normal;
  line-height: 1.8;
  page-break-after: avoid;
  break-after: avoid;
  text-align: right;
  margin: 1.4em 0 0.5em 0;
}
h2 { font-size: 1.45em; text-align: center; margin: 1.6em 0 0.2em 0; }
h2.ch { page-break-before: always; break-before: page; }
h3 { font-size: 1.22em; }
h4 { font-size: 1.1em; }
h5, h6 { font-size: 1em; }
.orn {
  text-align: center;
  font-size: 0.9em;
  line-height: 1;
  margin: 0.3em auto 1.2em auto;
  text-indent: 0;
}
.pb { margin: 0; text-align: right; line-height: 1.2; }
.pb.ch { page-break-before: always; break-before: page; }

/* Volume opening (whole book or a range) */
h1.vol { font-size: 2em; text-align: center; margin: 30% 0 0.3em 0; }

/* Printed page numbers: small and quiet, never in the way */
.pg {
  font-size: 0.62em;
  white-space: nowrap;
  padding: 0 0.25em;
  font-family: "Amiri", serif;
  text-indent: 0;
}

/* Footnotes: smaller, under a short rule; the number links back to the text */
a.nr {
  font-size: 0.72em;
  vertical-align: super;
  line-height: 0;
  text-decoration: none;
  color: inherit;
}
sup.nr { font-size: 0.72em; line-height: 0; }
.fns { margin: 0.8em 0 1.4em 0; }
.fn:first-child::before {
  content: "";
  display: block;
  width: 30%;
  margin: 0 0 0.3em 0;
  border-top: 1px solid;
}
.fn { font-size: 0.84em; line-height: 2; margin: 0 0 0.3em 0; }
.fn p { margin: 0; line-height: 2; }
.fn a.back { text-decoration: none; color: inherit; }
hr.rule { width: 20%; margin: 1em auto; border: 0; border-top: 1px solid; }

/* Title page */
.titlepage { text-align: center; }
.titlepage h1 { font-size: 2.1em; line-height: 1.5; margin: 18% 0 0.2em 0; text-align: center; }
.titlepage .ed { margin: 0; }
.titlepage .vols { margin: 0.6em 0 0 0; font-size: 1.15em; }
.titlepage .orn { margin: 1.2em auto; font-size: 1.2em; }
.role { margin: 1em 0 0 0; font-size: 0.9em; text-align: center; }
.name { margin: 0; font-size: 1.3em; text-align: center; }
.died { margin: 0; font-size: 0.9em; text-align: center; }
.imprint { margin: 3em 0 0 0; text-align: center; }
.imprint p { margin: 0; text-align: center; }

/* Book card: small, like the back of a title page */
.card { font-size: 0.85em; line-height: 2; margin-top: 10%; }
.card h1 { font-size: 1.3em; text-align: center; margin: 0 0 1em 0; }
.card p { text-align: right; margin: 0 0 0.2em 0; line-height: 2; }
.card .source { margin-top: 1.6em; }

/* Contents */
.fihris h1 { font-size: 1.6em; text-align: center; margin: 1em 0 0.8em 0; }
.fihris h2 { font-size: 1.2em; margin: 1.2em 0 0.4em 0; }
.fihris p { text-align: right; margin: 0 0 0.25em 0; line-height: 1.9; }
.fihris a { text-decoration: none; color: inherit; }
.fihris .l2 { margin-right: 1.2em; }
.fihris .l3 { margin-right: 2.4em; font-size: 0.95em; }
.fihris .l4, .fihris .l5, .fihris .l6 { margin-right: 3.6em; font-size: 0.92em; }
.loc { font-size: 0.8em; white-space: nowrap; padding-right: 0.5em; }

/* Cover */
body.cover { margin: 0; padding: 0; text-align: center; }
div.cover { margin: 0; padding: 0; text-align: center; height: 100%; }
div.cover img { max-width: 100%; max-height: 100%; height: 100%; }

/* Colours */
${accents(DAY)}

@media (prefers-color-scheme: dark) {${accents(NIGHT)}
}
:root[__ibooks_internal_theme*="Night"] h1, :root[__ibooks_internal_theme*="Night"] h2,
:root[__ibooks_internal_theme*="Night"] h3, :root[__ibooks_internal_theme*="Night"] h4,
:root[__ibooks_internal_theme*="Night"] h5, :root[__ibooks_internal_theme*="Night"] h6,
:root[__ibooks_internal_theme*="Night"] .t, :root[__ibooks_internal_theme*="Night"] .role,
:root[__ibooks_internal_theme*="Night"] .k { color: ${NIGHT.red}; }
:root[__ibooks_internal_theme*="Night"] .q { color: ${NIGHT.green}; }
:root[__ibooks_internal_theme*="Night"] .pg, :root[__ibooks_internal_theme*="Night"] .loc { color: ${NIGHT.grey}; }

/* E-ink: clean greys */
@media (monochrome) {${accents(INK)}
}
`;
