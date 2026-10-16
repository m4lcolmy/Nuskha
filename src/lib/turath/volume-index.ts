// Stored volume lists (public/data/volumes/{shard}.json, written by scripts/build-volumes.ts), so a
// book page can show what is in each volume before the book is downloaded. A shard is loaded only
// when a book page opens.

import type { Volume, VolumeKind } from './volumes.ts';

export const VOLUME_SHARDS = 32;
export const VOLUME_FORMAT = 2;

/** [name, first page, page count, label, kind, part, part that begins inside]; the last two left out when "". */
export type VolumeRow = [name: string, first: number, count: number, label: string, kind: VolumeKind, part?: string, begins?: string];

export interface VolumeShard {
  format: number;
  books: Record<string, VolumeRow[]>;
}

export const shardOf = (id: number) => id % VOLUME_SHARDS;

export function toRow(v: Volume): VolumeRow {
  const row: VolumeRow = [v.name, v.first, v.count, v.label, v.kind];
  if (v.part || v.begins) row.push(v.part, ...(v.begins ? [v.begins] : []));
  return row;
}
const fromRow = ([name, first, count, label, kind, part = '', begins = '']: VolumeRow): Volume => ({
  name,
  first,
  count,
  label,
  kind,
  part,
  begins,
});

const shards = new Map<number, Promise<VolumeShard | undefined>>();

/** The stored volume list, or undefined if the book has none (one volume, or not listed yet). */
export async function storedVolumes(id: number): Promise<Volume[] | undefined> {
  const n = shardOf(id);
  let p = shards.get(n);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/volumes/${n}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<VolumeShard>) : undefined))
      .then((s) => (s?.format === VOLUME_FORMAT ? s : undefined))
      .catch(() => undefined);
    shards.set(n, p);
  }
  return (await p)?.books[id]?.map(fromRow);
}
