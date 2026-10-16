import { describe, expect, it } from 'vitest';
import { normalizeArabic, stripArticle, terms, toAsciiDigits } from '../src/lib/search/normalize.ts';

describe('normalizeArabic', () => {
  it.each([
    ['سِيَرُ أَعْلَامِ النُّبَلَاءِ', 'سير اعلام النبلاء'], // harakat, أ
    ['ســـير', 'سير'], // tatweel
    ['إسلام آدم ٱلله', 'اسلام ادم الله'], // إ آ ٱ
    ['مصطفى', 'مصطفي'], // ى
    ['تيمية', 'تيميه'], // ة
    ['مؤمن قائم', 'مومن قايم'], // ؤ ئ
    ['ﻻ', 'لا'], // presentation form (NFKC)
    ['ج٣ ص۱۲٤', 'ج3 ص124'], // Arabic and Persian digits
    ['Siyar', 'siyar'],
  ])('%s → %s', (input, out) => {
    expect(normalizeArabic(input)).toBe(out);
  });
});

describe('terms', () => {
  it('splits words and drops a leading «ال»', () => {
    expect(terms('الجامع لأحكام القرآن')).toEqual(['جامع', 'لاحكام', 'قران']);
    expect(terms('سير أعلام النبلاء - ط الحديث')).toEqual(['سير', 'اعلام', 'نبلاء', 'ط', 'حديث']);
  });

  it('keeps a bare «ال»', () => {
    expect(stripArticle('ال')).toBe('ال');
  });
});

describe('toAsciiDigits', () => {
  it('converts both digit sets', () => {
    expect(toAsciiDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789 0123456789');
  });
});
