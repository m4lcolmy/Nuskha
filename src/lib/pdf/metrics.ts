// Advance widths from a TrueType font (cmap + hmtx), for the width of each hidden word. Isolated
// letter forms only, so a little wider than the joined word; textlayer.ts trims it to the line.

export function advances(font: Uint8Array): (cp: number) => number {
  const v = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = new Map<string, number>();
  const count = v.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(font[at], font[at + 1], font[at + 2], font[at + 3]);
    tables.set(tag, v.getUint32(at + 8));
  }
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const cmap = tables.get('cmap');
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined) return () => 0.45;
  const upem = v.getUint16(head + 18);
  const metrics = v.getUint16(hhea + 34);

  // A Unicode subtable, format 4 (BMP).
  let sub = -1;
  const n = v.getUint16(cmap + 2);
  for (let i = 0; i < n; i++) {
    const pid = v.getUint16(cmap + 4 + i * 8);
    const eid = v.getUint16(cmap + 6 + i * 8);
    const off = v.getUint32(cmap + 8 + i * 8);
    if ((pid === 3 && eid === 1) || pid === 0) {
      if (v.getUint16(cmap + off) === 4) sub = cmap + off;
    }
  }
  const glyph = (cp: number): number => {
    if (sub < 0 || cp > 0xffff) return 0;
    const segs = v.getUint16(sub + 6) / 2;
    const ends = sub + 14;
    const starts = ends + segs * 2 + 2;
    const deltas = starts + segs * 2;
    const ranges = deltas + segs * 2;
    for (let i = 0; i < segs; i++) {
      if (v.getUint16(ends + i * 2) < cp) continue;
      const start = v.getUint16(starts + i * 2);
      if (start > cp) return 0;
      const delta = v.getInt16(deltas + i * 2);
      const ro = v.getUint16(ranges + i * 2);
      if (!ro) return (cp + delta) & 0xffff;
      const g = v.getUint16(ranges + i * 2 + ro + (cp - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  const cache = new Map<number, number>();
  return (cp) => {
    let w = cache.get(cp);
    if (w === undefined) {
      const g = glyph(cp);
      w = g ? v.getUint16(hmtx + Math.min(g, metrics - 1) * 4) / upem : 0;
      cache.set(cp, w);
    }
    return w;
  };
}
