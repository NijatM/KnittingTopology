/** Short-row turn pairing (project rule): every carriage pass starts where the previous pass ended.
 * Popescu (2019) leaves yarn guides and needle actions to the machine software, simulates the yarn-guide
 * movement there and corrects errors by hand (pp. 104, 111, 114). This rule automates that correction for
 * the project alignment method: at an unpaired turn the narrower course sets the turn point, and the wider
 * course's loops beyond it are removed. Loops are only removed, never moved or added. */
import type { GenerationContext, SurfaceSpec } from '../core/types';
import type { ShapeCourse, ShapeGeometry, ShapeNeedles, ShapePoint } from './shape-types';
import { interpolateShape, shapeLengths } from './shape-geometry';
import { placeShapeNeedles } from './shape-needles';

export const TURN_PAIRING_RULE = 'turn-pairing-v1';
export const TURN_PAIRING_NOTE =
  'Short-row turns are paired: at each turn the narrower course sets the turn point and the wider course’s loops beyond it are removed (project rule; Popescu 2019 corrects the yarn path by hand in the machine software, pp. 104, 111, 114). Each removed loop shortens its wale by one course height.';
const MAX_ROUNDS = 200;

/** One-based pass; zero-based needles. The yarn ends at `from` but the pass starts at `to`. */
export interface YarnJump {
  pass: number;
  from: number;
  to: number;
}

/** Yarn path of a needle layout: a pass must start within one needle of the previous pass's end. */
export function yarnJumpList(
  needles: Pick<ShapeNeedles, 'h' | 'placements'>,
  firstDir: 1 | -1
): YarnJump[] {
  const left = new Array<number>(needles.h).fill(Infinity),
    right = new Array<number>(needles.h).fill(-Infinity);
  for (const p of needles.placements) {
    left[p.course] = Math.min(left[p.course]!, p.needle);
    right[p.course] = Math.max(right[p.course]!, p.needle);
  }
  const jumps: YarnJump[] = [];
  let previousEnd: number | undefined;
  for (let k = 0; k < needles.h; k++) {
    if (!Number.isFinite(left[k])) continue;
    const forward = firstDir * (k % 2 ? -1 : 1) === 1,
      start = forward ? left[k]! : right[k]!;
    if (previousEnd !== undefined && Math.abs(start - previousEnd) > 1)
      jumps.push({ pass: k + 1, from: previousEnd, to: start });
    previousEnd = forward ? right[k]! : left[k]!;
  }
  return jumps;
}

/** Keeps loops `a..b` of a course. Loops sit at the centres of equal parts of the polyline, so the
 * polyline is cut at the part boundaries and the kept loops keep their positions. */
function trimCourse(
  surface: SurfaceSpec,
  c: ShapeCourse,
  a: number,
  b: number,
  stitchWidth: number
): { course: ShapeCourse; rounding: number } {
  const n = c.loops.length,
    l = shapeLengths(c.points),
    total = l.at(-1)!;
  const t0 = a / n,
    t1 = (b + 1) / n;
  const inside = c.points.filter((_, i) => l[i]! > t0 * total && l[i]! < t1 * total);
  const points: ShapePoint[] = [
    a ? interpolateShape(surface, c.points, l, t0) : c.points[0]!,
    ...inside,
    b < n - 1 ? interpolateShape(surface, c.points, l, t1) : c.points.at(-1)!,
  ];
  const length = shapeLengths(points).at(-1)!,
    leftBoundary = c.leftBoundary && a === 0,
    rightBoundary = c.rightBoundary && b === n - 1;
  return {
    course: {
      ...c,
      points,
      loops: c.loops.slice(a, b + 1),
      extent: [points[0]!.across, points.at(-1)!.across],
      leftBoundary,
      rightBoundary,
      turnStart: !leftBoundary,
      turnEnd: !rightBoundary,
      length,
    },
    rounding: length - (b - a + 1) * stitchWidth,
  };
}

/** Plans needles and pairs every short-row turn it can (first jump first, then re-plan). A jump is left in
 * place, and blocks export, when pairing would trim the cast-on course, empty a course or leave more
 * shaping steps unresolved. Deterministic for equal inputs. */
export function pairShortRowTurns(
  surface: SurfaceSpec,
  geometry: ShapeGeometry,
  firstDir: 1 | -1,
  context?: GenerationContext
): { geometry: ShapeGeometry; needles: ShapeNeedles; removed: number; maxPerWale: number } {
  let g = geometry,
    needles = placeShapeNeedles(g, firstDir);
  const stuck = new Set<number>(),
    // Removed loops per wale position (distance from the needle-1 side in stitch widths).
    lost = new Map<number, number>();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (context?.cancelled?.()) throw new DOMException('Shaping cancelled.', 'AbortError');
    const jump = yarnJumpList(needles, firstDir).find((j) => !stuck.has(j.pass));
    if (!jump) break;
    const k = jump.pass - 1,
      // Pass k − 1 ends, and pass k starts, on this side: +1 right (high needles), −1 left.
      side = firstDir * ((k - 1) % 2 ? -1 : 1),
      narrowerIsLater = side * (jump.to - jump.from) < 0,
      wider = narrowerIsLater ? k - 1 : k,
      limit = narrowerIsLater ? jump.to : jump.from;
    const course = g.courses[wider]!,
      needleOf = new Map(
        needles.placements.filter((p) => p.course === wider).map((p) => [p.loop.id, p.needle])
      ),
      keep = course.loops.map((loop) => side * (needleOf.get(loop.id)! - limit) <= 1);
    const a = keep.indexOf(true),
      b = keep.lastIndexOf(true);
    // The cast-on course sets the starting needles and is never trimmed.
    if (!wider || a < 0 || keep.every(Boolean) || keep.slice(a, b + 1).some((x) => !x)) {
      stuck.add(jump.pass);
      continue;
    }
    const trimmed = trimCourse(surface, course, a, b, g.stitchWidth),
      next: ShapeGeometry = {
        ...g,
        courses: g.courses.map((c) => (c.index === wider ? trimmed.course : c)),
        courseRounding: g.courseRounding.map((r, i) => (i === wider ? trimmed.rounding : r)),
      },
      planned = placeShapeNeedles(next, firstDir);
    // A trim that leaves more shaping steps unresolved is not taken; the jump then blocks export.
    if (planned.unresolved.length > needles.unresolved.length) {
      stuck.add(jump.pass);
      continue;
    }
    for (const loop of course.loops.slice(0, a).concat(course.loops.slice(b + 1))) {
      const wale = Math.max(0, Math.floor(loop.across / g.stitchWidth));
      lost.set(wale, (lost.get(wale) ?? 0) + 1);
    }
    g = next;
    needles = planned;
  }
  const removed = [...lost.values()].reduce((sum, x) => sum + x, 0);
  return { geometry: g, needles, removed, maxPerWale: Math.max(0, ...lost.values()) };
}
