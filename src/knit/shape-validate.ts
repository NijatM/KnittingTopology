// Symbolic parent-loop check for the chosen bitmap convention. This is not a knitting-machine simulation.
import type { ShapeResult } from './shape-types';
import type { Bed, Key } from './keys';
import { otherBed } from './keys';
import { imageIndex } from './grid';

/** Check actual bitmap bed/needle arrivals against each placement's declared parent loop IDs. */
export function validateShapeOperations(shape: ShapeResult, cells: Uint8Array, key: Key): string[] {
  const { w, h, placements } = shape.needles;
  const bed: Record<Bed, Set<string>[]> = {
    front: Array.from({ length: w }, () => new Set()),
    back: Array.from({ length: w }, () => new Set()),
  };
  const issues: string[] = [];
  const fail = (pass: number, needle: number, reason: string) =>
    issues.push(`Pass ${pass + 1}, needle ${needle + 1}: ${reason}`);
  for (let k = 0; k < h; k++) {
    const arrivals: { needle: number; bed: Bed; id: string }[] = [];
    for (let j = 0; j < w; j++) {
      const i = imageIndex(w, h, j, k),
        n = shape.placementAt[i]!,
        p = n < 0 ? undefined : placements[n];
      // Every bed that a yarn guide knits or tucks on carries the loop chain (both beds in double knit).
      const op = key.ops[cells[i]!],
        worked = (op?.steps ?? []).filter((s) => s.action !== 'float');
      if (!p) {
        if (!op || worked.length)
          fail(k, j, 'An operation is assigned outside the declared course.');
        continue;
      }
      if (!worked.length) {
        fail(k, j, 'The required surface loop has no knit operation.');
        continue;
      }
      const beds = [...new Set(worked.map((s) => s.bed))];
      const expected = new Set(p.parents);
      if (expected.size !== p.parents.length)
        fail(k, j, 'The shaping graph repeats a parent loop.');
      if (
        beds.some((b) => {
          const current = bed[b][j]!;
          return current.size !== expected.size || [...current].some((id) => !expected.has(id));
        })
      )
        fail(k, j, 'Bitmap loop parents differ from the declared shaping graph.');
      if ((['front', 'back'] as const).some((b) => !beds.includes(b) && bed[b][j]!.size))
        fail(k, j, 'A required parent remains on the opposite bed.');
      if (worked.some((s) => s.action === 'tuck') && expected.size)
        fail(k, j, 'A tuck does not realize the required parent-to-child knit.');
      for (const b of beds) {
        bed[b][j]!.clear();
        if (op!.move === 'none') bed[b][j]!.add(p.loop.id);
        else {
          const target = op!.move === 'left' ? j - 1 : op!.move === 'right' ? j + 1 : j;
          if (target < 0 || target >= w) fail(k, j, 'A transfer leaves the needle span.');
          else
            arrivals.push({
              needle: target,
              bed: op!.move === 'across' ? otherBed(b) : b,
              id: p.loop.id,
            });
        }
      }
    }
    // All stitches precede transfers; simultaneous shifts preserve neighbouring moving loops.
    for (const a of arrivals) bed[a.bed][a.needle]!.add(a.id);
  }
  return issues;
}
