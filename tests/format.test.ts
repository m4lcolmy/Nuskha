import { describe, expect, it } from 'vitest';
import { NOUNS, count, num, size, splitTitle } from '../src/lib/format.ts';

describe('count: Arabic noun forms after numbers', () => {
  it.each([
    [1, 'جزء واحد'],
    [2, 'جزآن'],
    [3, '٣ أجزاء'],
    [10, '١٠ أجزاء'],
    [18, '١٨ جزءًا'],
    [100, '١٠٠ جزء'],
    [103, '١٠٣ أجزاء'],
    [125, '١٢٥ جزءًا'],
  ])('%i parts → %s', (n, out) => {
    expect(count(n, NOUNS.part)).toBe(out);
  });

  it('groups thousands', () => {
    expect(count(9721, NOUNS.page)).toBe('٩٬٧٢١ صفحةً');
  });
});

describe('num', () => {
  it('uses Arabic-Indic digits without grouping', () => {
    expect(num(1427)).toBe('١٤٢٧');
  });
});

describe('size', () => {
  it('shows MB or KB', () => {
    expect(size(26_000 * 1024)).toBe('٢٥ م.ب');
    expect(size(1.5 * 1024 * 1024)).toBe('١٫٥ م.ب');
    expect(size(210 * 1024)).toBe('٢١٠ ك.ب');
  });
});

describe('splitTitle', () => {
  it.each([
    ['سير أعلام النبلاء - ط الحديث', 'سير أعلام النبلاء', 'ط الحديث'],
    ['التمهيد - ابن عبد البر - ت بشار', 'التمهيد - ابن عبد البر', 'ت بشار'],
    ['مسند أحمد - ت شاكر - ط دار الحديث', 'مسند أحمد', 'ت شاكر - ط دار الحديث'],
    ['صحيح البخاري - ن عطاءات العلم', 'صحيح البخاري', 'ن عطاءات العلم'],
    ['شرح عمدة الفقه - ابن تيمية - كتاب الحج', 'شرح عمدة الفقه - ابن تيمية - كتاب الحج', ''],
    ['لسان العرب', 'لسان العرب', ''],
  ])('%s', (title, main, edition) => {
    expect(splitTitle(title)).toEqual({ main, edition });
  });
});
