// A book's volumes, each with a short label taken from its first heading, so the reader can see what
// is inside before downloading: «ج٣ · باب كيف بدأ الوحي…». Used by the catalog job (from turath's
// index) and by the book page (from the downloaded book).

import { num } from '../format.ts';
import type { Heading } from './book.ts';
import { spellHonorifics } from './honorifics.ts';

export type VolumeKind = '' | 'intro' | 'index';

export interface Volume {
  /** turath's name: "3", «المقدمة», «سيرة 1». */
  name: string;
  /** First page (index into the book's pages) and number of pages. */
  first: number;
  count: number;
  /** First heading in the volume, shortened; "" if none. */
  label: string;
  /** «مقدمة التحقيق» or «فهارس»: shown so it's clear what can be left out. */
  kind: VolumeKind;
}

const LABEL_MAX = 48;
const INTRO = /^(مقدم|تقديم|ترجمة المؤلف|دراسة|بين يدي)/;
const INDEX = /^(ال)?فهرس|^(ال)?فهارس/;

/**
 * `pageVols[i]` is the volume of page i. Volumes come in the order they first appear,
 * and a volume name that comes back later is still the same volume.
 */
export function volumesOf(pageVols: string[], headings: Heading[]): Volume[] {
  const vols: Volume[] = [];
  const byName = new Map<string, Volume>();
  pageVols.forEach((name, i) => {
    let v = byName.get(name);
    if (!v) {
      v = { name, first: i, count: 0, label: '', kind: '' };
      byName.set(name, v);
      vols.push(v);
    }
    v.count++;
  });

  const inVol = new Map<Volume, Heading[]>();
  for (const h of headings) {
    const v = byName.get(pageVols[h.page]);
    if (v) inVol.set(v, [...(inVol.get(v) ?? []), h]);
  }
  for (const v of vols) {
    const hs = inVol.get(v) ?? [];
    v.label = shorten(withoutVolName(hs[0]?.title ?? '', v.name));
    const top = Math.min(...hs.map((h) => h.level));
    const tops = hs.filter((h) => h.level === top).map((h) => strip(h.title));
    if (/فهارس|فهرس/.test(v.name) || (tops.length && tops.every((t) => INDEX.test(t)))) v.kind = 'index';
    else if (/مقدم/.test(v.name) || (tops.length && tops.every((t) => INTRO.test(t)))) v.kind = 'intro';
  }
  return vols;
}

/** «[سير الخلفاء الراشدين]» → «سير الخلفاء الراشدين»; «[ذكر] جماعة» stays. */
function strip(title: string): string {
  let t = title.replace(/\s+/g, ' ').replace(/^[\s*\-ـ]+|[\s*:\-ـ]+$/g, '');
  while (/^\[[^\]]*\]$/.test(t) || /^\([^)]*\)$/.test(t)) t = t.slice(1, -1).trim();
  return t;
}

/** In volume 3, «الجزء ٣ [طبقة ١، ٢]» → «طبقة ١، ٢»: the volume number is shown already. */
function withoutVolName(title: string, vol: string): string {
  if (!/^\d+$/.test(vol)) return title;
  const m = title.match(/^\s*(?:الجزء|المجلد|ج)\s*([0-9٠-٩]+)\s*[-:،]?\s*/);
  if (!m || Number(m[1].replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))) !== Number(vol)) return title;
  return title.slice(m[0].length) || title;
}

function shorten(title: string): string {
  const t = strip(spellHonorifics(title));
  if (t.length <= LABEL_MAX) return t;
  const cut = t.lastIndexOf(' ', LABEL_MAX);
  return t.slice(0, cut > LABEL_MAX / 2 ? cut : LABEL_MAX) + '…';
}

/** Digits in a volume name as Arabic-Indic: «سيرة 1» → «سيرة ١». */
const arabicDigits = (s: string) => s.replace(/\d+/g, (d) => num(Number(d)));

/** Short name for lists and page markers: «ج٣», «المقدمة», «سيرة ١». */
export function volShort(name: string): string {
  return /^\d+$/.test(name) ? `ج${num(Number(name))}` : arabicDigits(name);
}

/** Long name for headings: «الجزء ٣», «المقدمة». */
export function volLong(name: string): string {
  return /^\d+$/.test(name) ? `الجزء ${num(Number(name))}` : arabicDigits(name);
}
