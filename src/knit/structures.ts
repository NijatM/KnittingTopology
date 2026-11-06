// Structures: small tiles of operations (op ids), repeated from needle 1 and pass 1 so that neighbouring regions
// mesh. Ported as data from KnittingPixelArtEditor `src/grammar/structures.ts` (MIT License, (c) 2026 Nijat
// Mahamaliyev); ids, names, rows and notes are unchanged.
import type { Key } from './keys';
import type { KnitTile } from '../core/types';

/** Rows are stored top (last pass) first, like the image. */
export interface Structure {
  id: string;
  name: string;
  w: number;
  h: number;
  rows: string[][];
  note?: string;
}

/** Rows bottom (pass 1) first, as a knitting chart is read; stored top first like the image. */
const S = (id: string, name: string, bottomUp: string[], note: string): Structure => {
  const rows = bottomUp.map((r) => r.split(' ')).reverse();
  return { id, name, w: rows[0]!.length, h: rows.length, rows, note };
};

/** Structures in the 4.S52 basic key (one yarn guide). A needle that changes bed between passes needs its loop
 *  transferred first, which is why seed and garter use "knit and transfer". */
export const STRUCTURES_1: readonly Structure[] = [
  S('jersey', 'single jersey', ['kf'], 'every needle knits on the front bed'),
  S('reverse', 'reverse jersey', ['kb'], 'every needle knits on the back bed'),
  S('rib11', '1 × 1 rib', ['kf kb'], 'front and back needles alternate; pulls in across'),
  S('rib22', '2 × 2 rib', ['kf kf kb kb'], 'pairs of front and back needles'),
  S(
    'garter',
    'garter (purl)',
    ['kfxb', 'kbxf'],
    'each course changes bed by a transfer; ridges, pulls in along'
  ),
  S('seed', 'seed', ['kfxb kbxf', 'kbxf kfxb'], 'face and back stitches alternate both ways'),
  S(
    'tubular',
    'tubular',
    ['kf', 'kb'],
    'front and back beds in turn: two layers joined at the edges'
  ),
  S(
    'tuckmoss',
    'tuck moss',
    ['kf tf', 'tf kf'],
    'every other stitch tucks, offset each pass: thick, wide, puckered'
  ),
  S(
    'honeycomb',
    'tuck honeycomb',
    ['kf kf kf kf', 'tf kf kf kf', 'tf kf kf kf', 'kf kf kf kf', 'kf kf tf kf', 'kf kf tf kf'],
    'double tucks, offset: raised cells; wider and shorter'
  ),
  S(
    'slip',
    'float stripes',
    ['kf kf kf kf', 'kf fl fl kf'],
    'floats behind every other pass; pulls in'
  ),
  S(
    'eyelet',
    'eyelets',
    ['kf kf kf kf', 'kf kfxr kf kf', 'kf kf kf kf', 'kf kf kf kf'],
    'a loop moved right leaves an empty needle: a hole'
  ),
  S('hold', 'hold (short rows)', ['fl'], 'the needles knit nothing here; the rest grows longer'),
];

/** Structures in the 4.S52 two-guide key. */
export const STRUCTURES_2: readonly Structure[] = [
  S('dk-a', 'double knit, YG1 face', ['k2f'], 'YG1 on the front bed, YG2 on the back'),
  S('dk-b', 'double knit, YG2 face', ['k2b'], 'YG2 on the front bed, YG1 on the back'),
  S('birdseye', 'mixed (birdseye)', ['k2f k2b', 'k2b k2f'], 'the two yarns alternate on the face'),
  S('tuck2', 'tuck pair', ['t2f'], 'both guides tuck, one on each bed'),
  S('yg1only', 'YG1 alone', ['g2'], 'YG1 knits the front, YG2 floats (provisional colour)'),
  S('hold2', 'hold (both float)', ['fl2'], 'nothing knits here'),
];

export const structuresForKey = (
  key: Key,
  tiles: readonly KnitTile[] = []
): readonly Structure[] => [
  ...(key.mode === 2 ? STRUCTURES_2 : STRUCTURES_1),
  ...tiles.filter((s) => s.keyId === key.id),
];

/** Op id at 0-based needle j and 0-based pass k (pass 1 = k 0); tiles repeat from needle 1 and pass 1. */
export function tileOp(s: Structure, j: number, k: number): string {
  return s.rows[s.h - 1 - (k % s.h)]![j % s.w]!;
}

/** Ops of a structure that the key does not have. */
export function missingOps(s: Structure, key: Key): string[] {
  const ids = new Set(key.ops.map((o) => o.id));
  return [...new Set(s.rows.flat())].filter((id) => !ids.has(id));
}

/** A structure is two-layer when one of its needle columns knits on both beds without a transfer across (tubular,
 *  double knit). Automatic bed-change transfers leave such structures alone. */
export function isTwoLayer(s: Structure, key: Key): boolean {
  const ops = new Map(key.ops.map((o) => [o.id, o]));
  for (let j = 0; j < s.w; j++) {
    const beds = new Set<string>();
    let across = false;
    for (let k = 0; k < s.h; k++) {
      const op = ops.get(tileOp(s, j, k));
      if (!op) continue;
      if (op.move === 'across') across = true;
      for (const step of op.steps) if (step.action === 'knit') beds.add(step.bed);
    }
    if (beds.size > 1 && !across) return true;
  }
  return false;
}
