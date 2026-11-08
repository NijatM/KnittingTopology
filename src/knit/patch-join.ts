// Joining computational patches into one piece (Popescu 2019, §6.3.2, pp. 107–110). The thesis combines
// patch patterns into one pattern ("virtually stitch together") but describes no algorithm, and notes that
// manual editing was needed to align patches (p. 153, fn. 9). Everything here is a project construction:
// - bands are rows of patches in the common knitting frame, knitted one after another;
// - side by side, the courses reaching the shared edge are paired 1:1 in order by position along it
//   (monotone minimum-cost matching); a pair becomes one course, an unpaired course a short row turning at
//   the edge;
// - stacked, the needle planner links the upper patch's first course to the loops below;
// - a side on the piece boundary inside the chart is free: loops beyond it stay held, and a patch that
//   stops under a seam leaves the bed after its last course.
import type { KnitPatchLayout, Vec3 } from '../core/types';
import type { ShapeCourse, ShapeGeometry, ShapeLoop, ShapePoint, StartEdge } from './shape-types';
import { rotatedShapeUV, shapeLengths } from './shape-geometry';

/** One patch of a piece, laid out in its own knitting frame. */
export interface JoinPart {
  index: number;
  stitchWidth: number;
  geometry: ShapeGeometry;
  fixedParents?: ReadonlyMap<string, readonly string[]>;
}
export interface JoinResult {
  geometry: ShapeGeometry;
  fixedParents?: Map<string, string[]>;
  /** Some band holds separate runs of patches: the yarn jumps between them. */
  splitArms: boolean;
}
type Course = ShapeCourse & { y: number; patches: number[]; rounding: number };

const prefix = (patch: number) => `P${patch + 1}/`;
/** Patch of a joined loop ID. */
export function loopPatch(id: string): number {
  const m = /^P(\d+)\//.exec(id);
  return m ? Number(m[1]) - 1 : -1;
}
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const total = (points: ShapePoint[]) => shapeLengths(points).at(-1)!;
const cutsOf = (c: ShapeCourse) =>
  c.loopCuts ?? Array.from({ length: c.loops.length + 1 }, (_, i) => i / c.loops.length);
function shifted<T extends ShapePoint>(p: T, by: number): T {
  return { ...p, across: p.across + by };
}
function shiftCourse(c: Course, by: number): Course {
  if (!by) return c;
  return {
    ...c,
    points: c.points.map((p) => shifted(p, by)),
    loops: c.loops.map((p) => shifted(p, by)),
    extent: [c.extent[0] + by, c.extent[1] + by],
  };
}
const withFlags = (c: Course): Course => ({
  ...c,
  turnStart: !(c.leftBoundary || c.leftFree),
  turnEnd: !(c.rightBoundary || c.rightFree),
});

/** Grid position of each patch in the common knitting frame: band (along the wales) and column (from
 * the needle-1 side). */
export function rotatedGrid(layout: Pick<KnitPatchLayout, 'u' | 'v'>, start: StartEdge) {
  const nu = layout.u.length + 1,
    nv = layout.v.length + 1;
  const at = (i: number): { band: number; col: number } => {
    const c = i % nu,
      r = Math.floor(i / nu);
    return start === 'v0'
      ? { band: r, col: c }
      : start === 'v1'
        ? { band: nv - 1 - r, col: nu - 1 - c }
        : start === 'u0'
          ? { band: c, col: nv - 1 - r }
          : { band: nu - 1 - c, col: r };
  };
  const vertical = start === 'u0' || start === 'u1';
  return { at, bands: vertical ? nu : nv, cols: vertical ? nv : nu };
}

/** Pairs the courses of two sides of an edge 1:1 in order, by position along it (minimum total distance;
 * leaving a course unpaired costs half the larger mean course spacing). */
export function pairInOrder(a: readonly number[], b: readonly number[]): [number, number][] {
  const spacing = (x: readonly number[]) =>
    x.length > 1 ? Math.abs(x.at(-1)! - x[0]!) / (x.length - 1) : NaN;
  const s = [spacing(a), spacing(b)].filter(Number.isFinite),
    skip = s.length ? 0.5 * Math.max(...s) : Infinity;
  const n = a.length,
    m = b.length,
    cols = m + 1,
    cost = new Float64Array((n + 1) * cols).fill(Infinity),
    from = new Uint8Array((n + 1) * cols);
  cost[0] = 0;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const at = i * cols + j,
        here = cost[at]!;
      if (here === Infinity) continue;
      const offer = (k: number, value: number, code: number) => {
        if (value < cost[k]!) {
          cost[k] = value;
          from[k] = code;
        }
      };
      // Infinite skip: pair as many as possible, so skip only where pairing is impossible.
      const step = Number.isFinite(skip) ? skip : 1e9;
      if (i < n) offer(at + cols, here + step, 1);
      if (j < m) offer(at + 1, here + step, 2);
      if (i < n && j < m) offer(at + cols + 1, here + Math.abs(a[i]! - b[j]!), 3);
    }
  const pairs: [number, number][] = [];
  let i = n,
    j = m;
  while (i || j) {
    const code = from[i * cols + j];
    if (code === 3) pairs.push([--i, --j]);
    else if (code === 1) i--;
    else j--;
  }
  return pairs.reverse();
}

/** Joins the courses of a run's next patch (`right`) to the run so far (`left`). */
function joinSideBySide(left: Course[], right: Course[], gy: (p: ShapePoint) => number): Course[] {
  const li = left.flatMap((c, i) => (c.rightBoundary ? [i] : [])),
    ri = right.flatMap((c, i) => (c.leftBoundary ? [i] : []));
  const pairs = pairInOrder(
    li.map((i) => gy(left[i]!.points.at(-1)!)),
    ri.map((i) => gy(right[i]!.points[0]!))
  ).map(([a, b]) => [li[a]!, ri[b]!] as [number, number]);
  const partnerOfLeft = new Map(pairs),
    partnerOfRight = new Map(pairs.map(([a, b]) => [b, a]));
  // Shift of the right patch's frame at each pair: the left course's end, plus the gap at the edge.
  const shifts = pairs.map(([a, b]) => {
    const l = left[a]!.points.at(-1)!,
      r = right[b]!.points[0]!;
    return l.across + dist(l.position, r.position) - r.across;
  });
  const fallback = Math.max(...left.map((c) => c.extent[1]));
  const shiftAt = (j: number) => {
    let k = -1;
    pairs.forEach(([, b], n) => {
      if (b <= j) k = n;
    });
    return k >= 0 ? shifts[k]! : shifts.length ? shifts[0]! : fallback;
  };
  const merge = (a: Course, b: Course, by: number): Course => {
    const l = a.points.at(-1)!,
      gap = dist(l.position, b.points[0]!.position),
      bp = (gap < 1e-12 ? b.points.slice(1) : b.points).map((p) => shifted(p, by)),
      points = [...a.points, ...bp],
      la = total(a.points),
      lb = total(b.points),
      sum = total(points),
      ca = cutsOf(a),
      cb = cutsOf(b);
    return withFlags({
      ...a,
      points,
      loops: [...a.loops, ...b.loops.map((p) => shifted(p, by))],
      extent: [points[0]!.across, points.at(-1)!.across],
      rightBoundary: b.rightBoundary,
      rightFree: b.rightFree,
      loopCuts: [
        ...ca.map((t) => (t * la) / sum),
        ...cb.slice(1).map((t) => (sum - lb + t * lb) / sum),
      ],
      length: sum,
      y: (a.y + b.y) / 2,
      patches: [...a.patches, ...b.patches],
      rounding: a.rounding + b.rounding,
    });
  };
  const out: Course[] = [];
  let i = 0,
    j = 0;
  while (i < left.length || j < right.length) {
    const a = left[i],
      b = right[j];
    if (a && b && partnerOfLeft.get(i) === j) {
      out.push(merge(a, b, shifts[pairs.findIndex(([x]) => x === i)]!));
      i++;
      j++;
    } else if (a && (partnerOfLeft.has(i) ? false : !b || partnerOfRight.has(j) || a.y <= b.y)) {
      // An edge course without a partner turns at the edge.
      out.push(a.rightBoundary ? withFlags({ ...a, rightBoundary: false }) : a);
      i++;
    } else {
      const c = shiftCourse(b!, shiftAt(j));
      out.push(c.leftBoundary ? withFlags({ ...c, leftBoundary: false }) : c);
      j++;
    }
  }
  return out;
}

/** Across of a course at global wale coordinate `x`, interpolated along its points. */
function acrossAt(c: Course, x: number, gx: (p: ShapePoint) => number): number {
  const xs = c.points.map(gx);
  if (x <= xs[0]!) return c.points[0]!.across;
  for (let k = 1; k < xs.length; k++)
    if (x <= xs[k]!) {
      const t = (x - xs[k - 1]!) / (xs[k]! - xs[k - 1]! || 1);
      return c.points[k - 1]!.across + t * (c.points[k]!.across - c.points[k - 1]!.across);
    }
  return c.points.at(-1)!.across;
}
const covers = (c: Course, x: number, gx: (p: ShapePoint) => number) => {
  const xs = c.points.map(gx);
  return Math.min(...xs) <= x + 1e-9 && x <= Math.max(...xs) + 1e-9;
};

/** One joined geometry from the patches of a piece. `knitted(a, b)` says whether patches a and b share a
 * knitted-through edge. */
export function joinPatches(
  layout: Pick<KnitPatchLayout, 'u' | 'v'>,
  start: StartEdge,
  parts: readonly JoinPart[],
  knitted: (a: number, b: number) => boolean
): JoinResult {
  const grid = rotatedGrid(layout, start),
    gx = (p: ShapePoint) => rotatedShapeUV(p.uv, start)[0],
    gy = (p: ShapePoint) => rotatedShapeUV(p.uv, start)[1],
    stitchWidth = parts[0]!.stitchWidth;
  const cell = new Map(parts.map((p) => [`${grid.at(p.index).band}:${grid.at(p.index).col}`, p]));
  // A patch's courses in its own frame, with joined loop IDs.
  const coursesOf = (part: JoinPart): Course[] =>
    part.geometry.courses.map((c, k) =>
      withFlags({
        ...c,
        loops: c.loops.map((l): ShapeLoop => ({
          ...l,
          id: prefix(part.index) + l.id,
          ...(part.stitchWidth !== stitchWidth ? { stitchWidth: part.stitchWidth } : {}),
        })),
        y: gy(c.points[Math.floor(c.points.length / 2)]!),
        patches: [part.index],
        rounding: part.geometry.courseRounding[k] ?? 0,
      })
    );
  // Runs: patches of a band linked side by side by knitted-through edges.
  const runs: { band: number; cols: number[]; courses: Course[] }[] = [];
  for (let band = 0; band < grid.bands; band++)
    for (let col = 0; col < grid.cols; col++) {
      const part = cell.get(`${band}:${col}`);
      if (!part) continue;
      const run = runs.at(-1),
        before = cell.get(`${band}:${col - 1}`);
      if (run && run.band === band && before && knitted(before.index, part.index)) {
        run.cols.push(col);
        run.courses = joinSideBySide(run.courses, coursesOf(part), gy);
      } else runs.push({ band, cols: [col], courses: coursesOf(part) });
    }
  // A run end inside the chart is a free side.
  for (const run of runs) {
    const first = run.cols[0]! > 0,
      last = run.cols.at(-1)! < grid.cols - 1;
    run.courses = run.courses.map((c) =>
      (first && c.leftBoundary) || (last && c.rightBoundary)
        ? withFlags({
            ...c,
            ...(first && c.leftBoundary ? { leftBoundary: false, leftFree: true } : {}),
            ...(last && c.rightBoundary ? { rightBoundary: false, rightFree: true } : {}),
          })
        : c
    );
  }
  // Across frames of the runs: matched along stacked knitted-through edges (first visit wins).
  const runOf = (band: number, col: number) =>
    runs.findIndex((r) => r.band === band && r.cols.includes(col));
  const offset = new Array<number | undefined>(runs.length).fill(undefined);
  offset[0] = 0;
  const queue = [0];
  while (queue.length) {
    const r = queue.shift()!,
      run = runs[r]!;
    for (const col of run.cols)
      for (const dir of [-1, 1]) {
        const band = run.band + dir,
          other = runOf(band, col),
          a = cell.get(`${run.band}:${col}`)!,
          b = cell.get(`${band}:${col}`);
        if (other < 0 || offset[other] !== undefined || !b || !knitted(a.index, b.index)) continue;
        // Middle of the shared edge, in the global wale coordinate.
        const x = (col + 0.5) / grid.cols,
          lower = dir === 1 ? run : runs[other]!,
          upper = dir === 1 ? runs[other]! : run,
          below =
            [...lower.courses].reverse().find((c) => covers(c, x, gx)) ?? lower.courses.at(-1)!,
          above = upper.courses.find((c) => covers(c, x, gx)) ?? upper.courses[0]!,
          delta = acrossAt(below, x, gx) - acrossAt(above, x, gx);
        // offset(upper) = offset(lower) + delta.
        offset[other] = dir === 1 ? offset[r]! + delta : offset[r]! - delta;
        queue.push(other);
      }
  }
  // Pass order: bands one after another, runs from the needle-1 side.
  let courses = runs.flatMap((run, r) => run.courses.map((c) => shiftCourse(c, offset[r] ?? 0)));
  const min = Math.min(...courses.map((c) => c.extent[0]));
  courses = courses.map((c) => shiftCourse(c, -min));
  // Saved parent links stay inside each Popescu-method patch; a patch stacked on another starts free.
  let fixedParents: Map<string, string[]> | undefined;
  for (const part of parts) {
    if (!part.fixedParents) continue;
    const { band, col } = grid.at(part.index),
      below = cell.get(`${band - 1}:${col}`),
      first = new Set(part.geometry.courses[0]?.loops.map((l) => l.id) ?? []),
      stacked = !!below && knitted(below.index, part.index);
    fixedParents ??= new Map();
    for (const [id, parents] of part.fixedParents)
      if (!(stacked && first.has(id)))
        fixedParents.set(
          prefix(part.index) + id,
          parents.map((p) => prefix(part.index) + p)
        );
  }
  // A patch whose top is inside the chart and not knitted to the patch above stops there.
  const release: { after: number; prefix: string }[] = [];
  for (const part of parts) {
    const { band, col } = grid.at(part.index),
      above = cell.get(`${band + 1}:${col}`);
    if (band === grid.bands - 1 || (above && knitted(part.index, above.index))) continue;
    let after = -1;
    courses.forEach((c, k) => {
      if (c.patches.includes(part.index)) after = k;
    });
    if (after >= 0) release.push({ after, prefix: prefix(part.index) });
  }
  const methods = [...new Set(parts.map((p) => p.geometry.method))];
  const geometry: ShapeGeometry = {
    courses: courses.map(({ y: _y, patches: _p, rounding: _r, ...c }, index) => ({
      ...c,
      id: `course:${index}`,
      index,
    })),
    contours: [],
    courseHeight: parts[0]!.geometry.courseHeight,
    stitchWidth,
    contourRounding: [],
    courseRounding: courses.map((c) => c.rounding),
    maxLinkOffset: Math.max(...parts.map((p) => p.geometry.maxLinkOffset)),
    resolution: Math.max(...parts.map((p) => p.geometry.resolution)),
    method: `Joined patches (project construction): ${methods.join(' + ')}`,
    issues: parts.flatMap((p) => p.geometry.issues.map((x) => `P${p.index + 1}: ${x}`)),
    ...(release.length ? { release } : {}),
  };
  return {
    geometry,
    ...(fixedParents ? { fixedParents } : {}),
    splitArms: runs.some((r, k) => k > 0 && runs[k - 1]!.band === r.band),
  };
}
