// Automatic transfers at bed changes. When a needle knits on one bed while its loop sits on the other, the loop
// would be held there and the new stitch would start without it. The last pass that placed the loop is changed so
// that the loop moves across in time, as in Knit Grammar's Accordion experiment (rows "knit + transfer to the
// other bed" below and above a rib band):
//   - placed by a plain knit (kf / kb): it becomes knit + transfer across (kfxb / kbxf);
//   - placed by a transfer across from the new bed (kfxb / kbxf): the transfer is dropped (kf / kb).
// Two-layer structures (tubular, double knit) are left alone: their bed changes are intended. One-guide keys only.
// Operations are found by meaning, so custom keys work; when the key lacks the needed one, the change is skipped.
import { findOp, meaningName, otherBed, type Bed, type Key, type Move, type Op } from './keys';
import { imageIndex, UNKNOWN } from './grid';

export interface TransferChange {
  /** 0-based needle and pass. */
  needle: number;
  pass: number;
  from: string;
  to: string;
  /** Pass at which the needle knits on the other bed. */
  forPass: number;
}
export interface SkippedTransfer {
  needle: number;
  pass: number;
  reason: string;
}

const knitThen = (op: Op | null, bed: Bed, move: Move) =>
  !!op &&
  op.steps.length === 1 &&
  op.steps[0]!.action === 'knit' &&
  op.steps[0]!.bed === bed &&
  op.move === move;

/** Returns a new cell array; `twoLayer(i)` says whether the structure at image cell i is two-layer. */
export function insertTransfers(
  w: number,
  h: number,
  cells: Uint8Array,
  key: Key,
  twoLayer: (i: number) => boolean
): { cells: Uint8Array; changes: TransferChange[]; skipped: SkippedTransfer[] } {
  const out = cells.slice(),
    changes: TransferChange[] = [],
    skipped: SkippedTransfer[] = [];
  if (key.mode !== 1) return { cells: out, changes, skipped };
  const opOf = (i: number): Op | null => (out[i]! < UNKNOWN ? (key.ops[out[i]!] ?? null) : null);

  // per needle and bed: whether a loop sits there, the pass that placed it (-2: it came from a neighbouring
  // needle), and tucks since then
  const loop = { front: new Uint8Array(w), back: new Uint8Array(w) };
  const placed = { front: new Int32Array(w).fill(-1), back: new Int32Array(w).fill(-1) };
  const tucked = { front: new Uint8Array(w), back: new Uint8Array(w) };

  for (let k = 0; k < h; k++) {
    const arrivals: [number, Bed, boolean][] = [];
    for (let j = 0; j < w; j++) {
      const i = imageIndex(w, h, j, k),
        op = opOf(i);
      if (!op) continue;
      const step = op.steps[0]!;
      if (step.action === 'tuck') {
        tucked[step.bed][j] = 1;
        continue;
      }
      if (step.action !== 'knit') continue;
      const b = step.bed,
        o = otherBed(b);
      if (!loop[b][j] && loop[o][j] && !twoLayer(i)) {
        const p = placed[o][j]!,
          pi = p >= 0 ? imageIndex(w, h, j, p) : -1,
          prev = pi >= 0 ? opOf(pi) : null;
        let to: [Bed, Move] | null = null;
        if (p < 0)
          skipped.push({ needle: j, pass: k, reason: 'the loop came from a neighbouring needle' });
        else if (twoLayer(pi)) to = null;
        else if (tucked[o][j])
          skipped.push({ needle: j, pass: p, reason: 'tucks on the old bed in between' });
        else if (knitThen(prev, o, 'none')) to = [o, 'across'];
        else if (knitThen(prev, b, 'across')) to = [b, 'none'];
        else
          skipped.push({
            needle: j,
            pass: p,
            reason: `the loop was placed by ${prev?.name ?? 'an unknown operation'}`,
          });
        const toOp = to ? findOp(key, [{ action: 'knit', bed: to[0] }], to[1]) : -1;
        if (to && toOp < 0) {
          skipped.push({
            needle: j,
            pass: p,
            reason: `the key has no ${meaningName([{ action: 'knit', bed: to[0] }], to[1])} operation`,
          });
          to = null;
        }
        if (to) {
          changes.push({ needle: j, pass: p, from: prev!.id, to: key.ops[toOp]!.id, forPass: k });
          out[pi] = toOp;
          loop[o][j] = 0;
          loop[b][j] = 1;
        }
      }
      // apply this pass's operation
      tucked[b][j] = 0;
      if (op.move === 'none') {
        loop[b][j] = 1;
        placed[b][j] = k;
      } else {
        loop[b][j] = 0;
        if (op.move === 'across') arrivals.push([j, o, false]);
        else {
          const n = op.move === 'left' ? j - 1 : j + 1;
          if (n >= 0 && n < w) arrivals.push([n, b, true]);
        }
      }
    }
    // transfers happen after the stitches of the pass
    for (const [j, bed, sideways] of arrivals) {
      loop[bed][j] = 1;
      placed[bed][j] = sideways ? -2 : k;
      tucked[bed][j] = 0;
    }
  }
  return { cells: out, changes, skipped };
}
