// A book's volumes, each with a short label taken from its first heading, so the reader can see what
// is inside before downloading: «ج٣ · باب كيف بدأ الوحي…». When the book's own top headings divide it
// into a few big parts («كتاب المبتدأ وقصص الأنبياء», «كتاب سيرة رسول الله ﷺ» …), each volume also
// names its part, so the list can be grouped the way the author divided the book. Used by the catalog
// job (from turath's index) and by the book page (from the downloaded book).

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
  /** The book's own part that most of the volume belongs to; "" if the book has no such parts. */
  part: string;
  /** Another part that starts inside this volume, part way through; "" if none. */
  begins: string;
}

const LABEL_MAX = 48;
const INTRO = /^(ال)?(مقدم|تقديم|ترجمة المؤلف|دراسة|بين يدي)/;
const INDEX = /^(ال)?فهرس|^(ال)?فهارس/;
/** Top headings that only repeat the volumes («الجزء الأول», «المجلد ٢», «العدد ١٩»). */
const VOL_HEAD = /^(الجزء|المجلد|العدد|السفر|ج\s*[0-9٠-٩])/;
/** More top headings than this are chapters, not parts. */
const PARTS_MAX = 15;
const PART_MAX = 90;

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
      v = { name, first: i, count: 0, label: '', kind: '', part: '', begins: '' };
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
  addParts(vols, headings);
  return vols;
}

/**
 * The book's parts are its top-level headings, when there are a few of them and fewer than the volumes.
 * Introductions, indexes and headings that only name a volume end the part before them but are no part
 * themselves. Each volume goes with the part that holds most of its pages, and a part that starts
 * part way through a volume is noted on it.
 */
function addParts(vols: Volume[], headings: Heading[]) {
  if (vols.length < 2 || !headings.length) return;
  const top = headings.reduce((m, h) => Math.min(m, h.level), Infinity);
  const tops = headings.filter((h) => h.level === top);
  if (tops.length < 2 || tops.length > PARTS_MAX || tops.length >= vols.length) return;
  const end = vols.reduce((m, v) => Math.max(m, v.first + v.count), 0);
  const parts = tops.map((h, i) => {
    const t = strip(h.title);
    const real = !INTRO.test(t) && !INDEX.test(t) && !VOL_HEAD.test(t);
    return { title: real ? shorten(h.title, PART_MAX) : '', from: h.page, to: tops[i + 1]?.page ?? end };
  });
  const named = parts.filter((p) => p.title);
  if (named.length < 2) return;

  for (const v of vols) {
    const [a, b] = [v.first, v.first + v.count];
    let best = 0;
    for (const p of parts) {
      const overlap = Math.min(b, p.to) - Math.max(a, p.from);
      if (overlap > best) [best, v.part] = [overlap, p.title];
    }
    v.begins = named.find((p) => p.from > a && p.from < b && p.title !== v.part)?.title ?? '';
  }
  // Grouping only helps if the volumes fall into at least two parts.
  if (new Set(vols.map((v) => v.part).filter(Boolean)).size < 2) for (const v of vols) v.part = v.begins = '';
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

function shorten(title: string, max = LABEL_MAX): string {
  const t = strip(spellHonorifics(title));
  if (t.length <= max) return t;
  const cut = t.lastIndexOf(' ', max);
  return t.slice(0, cut > max / 2 ? cut : max) + '…';
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
