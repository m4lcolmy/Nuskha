// The 40 Shamela categories grouped into bookcases. Each bookcase has a binding colour,
// shown as the thin edge on catalog cards (like the spines on a shelf).

import type { Category } from './catalog/types.ts';

export interface Bookcase {
  key: string;
  name: string;
  cats: Category[];
}

const BOOKCASES: [key: string, name: string, cats: string[]][] = [
  ['aqida', 'العقيدة', ['العقيدة', 'الفرق والردود']],
  ['quran', 'القرآن وعلومه', ['التفسير', 'علوم القرآن وأصول التفسير', 'التجويد والقراءات']],
  ['hadith', 'الحديث وعلومه', ['كتب السنة', 'شروح الحديث', 'التخريج والأطراف', 'العلل والسؤلات الحديثية', 'علوم الحديث']],
  ['usul', 'أصول الفقه وقواعده', ['أصول الفقه', 'علوم الفقه والقواعد الفقهية', 'المنطق']],
  [
    'fiqh',
    'الفقه',
    ['الفقه الحنفي', 'الفقه المالكي', 'الفقه الشافعي', 'الفقه الحنبلي', 'الفقه العام', 'مسائل فقهية', 'السياسة الشرعية والقضاء', 'الفرائض والوصايا', 'الفتاوى'],
  ],
  ['raqaiq', 'الرقائق والآداب', ['الرقائق والآداب والأذكار']],
  ['tarikh', 'السيرة والتاريخ', ['السيرة النبوية', 'التاريخ', 'التراجم والطبقات', 'الأنساب', 'البلدان والرحلات']],
  ['lugha', 'اللغة والأدب', ['كتب اللغة', 'الغريب والمعاجم', 'النحو والصرف', 'الأدب', 'العروض والقوافي', 'الشعر ودواوينه', 'البلاغة']],
  ['amma', 'كتب عامة', []], // everything else
];

/** Bookcases with the catalog's categories placed in them. Unknown categories go to the last one. */
export function bookcases(cats: Category[]): Bookcase[] {
  const cases: Bookcase[] = BOOKCASES.map(([key, name]) => ({ key, name, cats: [] }));
  for (const c of cats) cases[caseIndex(c.name)].cats.push(c);
  return cases.filter((b) => b.cats.length);
}

function caseIndex(catName: string): number {
  const i = BOOKCASES.findIndex(([, , names]) => names.includes(catName));
  return i < 0 ? BOOKCASES.length - 1 : i;
}

/** CSS colour of a category's binding, e.g. `var(--bind-hadith)`. */
export function bindingColor(cat: Category | undefined): string {
  return `var(--bind-${bookcaseKey(cat)})`;
}

/** Day colours of the bindings (the same as --bind-* in app.css), for the EPUB cover. */
const BINDING_HEX: Record<string, string> = {
  aqida: '#7a2e2a',
  quran: '#2f5d4a',
  hadith: '#2b3f63',
  usul: '#5a3a5e',
  fiqh: '#8a5a1f',
  raqaiq: '#5b6332',
  tarikh: '#8c4a2f',
  lugha: '#3f5666',
  amma: '#6b5e50',
};

export function bindingHex(cat: Category | undefined): string {
  return BINDING_HEX[bookcaseKey(cat)];
}

const bookcaseKey = (cat: Category | undefined) => BOOKCASES[cat ? caseIndex(cat.name) : BOOKCASES.length - 1][0];
