// Shamela writes honorifics as single Unicode-14 signs (﵀ ﵁ ﷿ …). Amiri, and most fonts in reading
// apps, don't have them, so they would show as empty boxes. They are written out as words instead.
// ﷺ ﷻ ﷽ stay: Amiri has them.

const WORDS: Record<string, string> = {
  '﵀': 'رحمه الله',
  '﵁': 'رضي الله عنه',
  '﵂': 'رضي الله عنها',
  '﵃': 'رضي الله عنهم',
  '﵄': 'رضي الله عنهما',
  '﵅': 'رضي الله عنهن',
  '﵆': 'صلى الله عليه وآله',
  '﵇': 'عليه السلام',
  '﵈': 'عليهم السلام',
  '﵉': 'عليهما السلام',
  '﵊': 'عليه الصلاة والسلام',
  '﵋': 'قدس سره',
  '﵌': 'صلى الله عليه وآله وسلم',
  '﵍': 'عليها السلام',
  '﵎': 'تبارك وتعالى',
  '﵏': 'رحمهم الله',
  '﷾': 'سبحانه وتعالى',
  '﷿': 'عز وجل',
};

const SIGNS = /[﵀-﵏﷾﷿]/g;

/** «الحاكم ﵀» → «الحاكم رحمه الله» */
export function spellHonorifics(text: string): string {
  return text.replace(SIGNS, (c) => WORDS[c] ?? c);
}
