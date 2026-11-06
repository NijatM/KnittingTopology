// Program grid conventions shared by the knit modules (Knit Grammar): one cell = one needle in one carriage pass.
// Cells are stored like an image, row 0 on top; the bottom row is pass 1. Needle j and pass k are 0-based here
// (needle 1 = j 0, pass 1 = k 0); the UI and files count from 1.
import type { Key } from './keys';

/** Cell values >= UNKNOWN are colours outside the key (Knit Grammar convention; never produced here). */
export const UNKNOWN = 128;
/** Largest side Knit Grammar opens. */
export const MAX_SIDE = 600;

export interface KnitCells {
  w: number;
  h: number;
  /** Op indices into `key.ops`, image order (row 0 = last pass). */
  cells: Uint8Array;
  key: Key;
  /** Derived shape programs carry mandatory-operation failures to the file writers. */
  exportBlockers?: readonly string[];
}

export const imageIndex = (w: number, h: number, j: number, k: number) => (h - 1 - k) * w + j;
export const needleOf = (w: number, i: number) => i % w;
export const passOf = (w: number, h: number, i: number) => h - 1 - Math.floor(i / w);
