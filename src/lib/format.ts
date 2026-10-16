// Arabic display helpers: Arabic-Indic digits and correct noun forms after numbers.

import type { Author, Book } from './catalog/types.ts';

const plain = new Intl.NumberFormat('ar-EG', { useGrouping: false });
const grouped = new Intl.NumberFormat('ar-EG');

/** 1427 → «١٤٢٧» */
export const num = (n: number) => plain.format(n);

/** Arabic plural categories: one, two, few (3–10), many (11–99), other (100, 101, …), zero. */
const rules = new Intl.PluralRules('ar');

interface Noun {
  one: string; // «جزء واحد»
  two: string; // «جزآن»
  few: string; // «٣ أجزاء»
  many: string; // «١١ جزءًا»
  other: string; // «١٠٠ جزء»
}

export const NOUNS = {
  part: { one: 'جزء واحد', two: 'جزآن', few: 'أجزاء', many: 'جزءًا', other: 'جزء' },
  page: { one: 'صفحة واحدة', two: 'صفحتان', few: 'صفحات', many: 'صفحةً', other: 'صفحة' },
  book: { one: 'كتاب واحد', two: 'كتابان', few: 'كتب', many: 'كتابًا', other: 'كتاب' },
  author: { one: 'مؤلف واحد', two: 'مؤلفان', few: 'مؤلفين', many: 'مؤلفًا', other: 'مؤلف' },
  result: { one: 'نتيجة واحدة', two: 'نتيجتان', few: 'نتائج', many: 'نتيجةً', other: 'نتيجة' },
} satisfies Record<string, Noun>;

/** count(18, NOUNS.part) → «١٨ جزءًا»; count(2, NOUNS.part) → «جزآن» */
export function count(n: number, noun: Noun): string {
  const cat = rules.select(n);
  if (cat === 'one' || cat === 'two') return noun[cat];
  const form = cat === 'few' ? noun.few : cat === 'many' ? noun.many : noun.other;
  return `${grouped.format(n)} ${form}`;
}

/** «ت ٧٤٨ هـ», «ت نحو ٥٤٣ هـ», or "" */
export function died(a: Author | undefined): string {
  if (!a?.death) return '';
  return `ت ${a.deathLabel ? a.deathLabel + ' ' : ''}${num(a.death)} هـ`;
}

/** «١٤٢٧ هـ / ٢٠٠٦ م», «١٤٢٧ هـ», «٢٠٠٦ م», or "" */
export function published(b: Book): string {
  return [b.hijri && `${num(b.hijri)} هـ`, b.greg && `${num(b.greg)} م`].filter(Boolean).join(' / ');
}

/** «٢٥ م.ب», «٣٤٠ ك.ب» */
export function size(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} م.ب`;
  return `${num(Math.max(1, Math.round(bytes / 1024)))} ك.ب`;
}

/**
 * Shamela titles often end with the edition: «سير أعلام النبلاء - ط الحديث», «التمهيد - ابن عبد البر - ت بشار».
 * Split that off so the main title can be set large and the edition small.
 */
export function splitTitle(title: string): { main: string; edition: string } {
  const parts = title.split(' - ');
  let i = parts.length;
  while (i > 1 && /^(ط|ت|ن)\s/.test(parts[i - 1])) i--;
  return { main: parts.slice(0, i).join(' - '), edition: parts.slice(i).join(' - ') };
}
