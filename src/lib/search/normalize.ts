// Arabic text cleanup used on both the catalog and what the user types,
// following the rules of Lucene's ArabicNormalizer, plus a few extra folds
// (ة→ه, ؤ→و, ئ→ي, leading «ال») that trade a little precision for more matches.

// Harakat, Quranic annotation marks, superscript alef, and tatweel.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

const FOLD: Record<string, string> = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ى': 'ي', 'ی': 'ي', 'ئ': 'ي',
  'ؤ': 'و',
  'ة': 'ه',
  'ک': 'ك',
};
const FOLD_RE = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g');

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII. */
export function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

export function normalizeArabic(s: string): string {
  return toAsciiDigits(s.normalize('NFKC'))
    .replace(MARKS, '')
    .replace(FOLD_RE, (c) => FOLD[c])
    .toLowerCase();
}

/** Drop a leading «ال» so «الذهبي» and «ذهبي» match. */
export function stripArticle(term: string): string {
  return term.length > 2 && term.startsWith('ال') ? term.slice(2) : term;
}

/** Normalized words of `s`, with the article removed. */
export function terms(s: string): string[] {
  return normalizeArabic(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stripArticle);
}
