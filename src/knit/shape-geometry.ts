/** Popescu (2019), §§6.2.2–6.2.3: contour/sample/course stages.
 * Distance source, triangle relaxation and monotone alignment are project adaptations.
 * Supported subset: a single contour, monotone across chart rows. */
import type { GenerationContext, SurfaceSpec, Vec2, Vec3 } from '../core/types';
import { evaluateSurface, validateSurface } from '../core/surfaces';
import type {
  ChartWindow,
  ShapeCourse,
  ShapeGeometry,
  ShapeLoop,
  ShapePoint,
  StartEdge,
} from './shape-types';
import { surfaceDistance } from './surface-distance';

const toChart = (w: ChartWindow | undefined, u: number, v: number): Vec2 =>
  w ? [w.u[0] + u * (w.u[1] - w.u[0]), w.v[0] + v * (w.v[1] - w.v[0])] : [u, v];
const fromChart = (w: ChartWindow | undefined, uv: Vec2): Vec2 =>
  w ? [(uv[0] - w.u[0]) / (w.u[1] - w.u[0]), (uv[1] - w.v[0]) / (w.v[1] - w.v[0])] : [uv[0], uv[1]];
/** Chart coordinates of rotated coordinates (u from the needle-1 side, v along it), inside `window`. */
export function originalShapeUV(u: number, v: number, edge: StartEdge, window?: ChartWindow): Vec2 {
  switch (edge) {
    case 'v0':
      return toChart(window, u, v);
    case 'u1':
      return toChart(window, 1 - v, u);
    case 'v1':
      return toChart(window, 1 - u, 1 - v);
    case 'u0':
      return toChart(window, v, 1 - u);
  }
}
/** Chart extent of one rotated unit: [across the needles, along the needle-1 side]. */
export function rotatedSpan(edge: StartEdge, window?: ChartWindow): Vec2 {
  if (!window) return [1, 1];
  const du = window.u[1] - window.u[0],
    dv = window.v[1] - window.v[0];
  return edge === 'v0' || edge === 'v1' ? [du, dv] : [dv, du];
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const countCeil = (x: number) => Math.ceil(x - 1e-10 * Math.max(1, x));
export function shapeLengths(p: ShapePoint[]): number[] {
  const l = [0];
  for (let i = 1; i < p.length; i++) l.push(l[i - 1] + distance(p[i - 1].position, p[i].position));
  return l;
}
const lengths = shapeLengths;
/** Chart coordinates after the start-edge rotation (inverse of `originalShapeUV`). */
export function rotatedShapeUV(chart: Vec2, edge: StartEdge, window?: ChartWindow): Vec2 {
  const uv = fromChart(window, chart);
  return edge === 'v0'
    ? [uv[0], uv[1]]
    : edge === 'u1'
      ? [uv[1], 1 - uv[0]]
      : edge === 'v1'
        ? [1 - uv[0], 1 - uv[1]]
        : [1 - uv[1], uv[0]];
}
/** Chart v after the start-edge rotation: the direction along a contour. */
export function rotatedShapeV(chart: Vec2, edge: StartEdge, window?: ChartWindow): number {
  const uv = fromChart(window, chart);
  return edge === 'v0' ? uv[1] : edge === 'v1' ? 1 - uv[1] : edge === 'u1' ? 1 - uv[0] : uv[0];
}
/** Point at fraction `t` of the arc length `l` of polyline `p`; chart-linear between samples. */
export function interpolateShape(
  surface: SurfaceSpec,
  p: ShapePoint[],
  l: number[],
  t: number
): ShapePoint {
  const target = t * l[l.length - 1];
  let k = 1;
  while (k < l.length - 1 && l[k] < target) k++;
  const a = p[k - 1],
    b = p[k],
    f = l[k] === l[k - 1] ? 0 : (target - l[k - 1]) / (l[k] - l[k - 1]);
  const uv: Vec2 = [a.uv[0] + f * (b.uv[0] - a.uv[0]), a.uv[1] + f * (b.uv[1] - a.uv[1])];
  return {
    uv,
    position: evaluateSurface(surface, 0, ...uv),
    across: a.across + f * (b.across - a.across),
  };
}
/** Sampled distance from the needle-1 side on a rotated (resolution + 1)² chart grid. */
export interface ShapeField {
  surface: SurfaceSpec;
  startEdge: StartEdge;
  n: number;
  d: ArrayLike<number>;
  /** Largest distance on the opposite side. */
  max: number;
  /** The patch rectangle of the chart; absent for the whole chart. */
  window?: ChartWindow;
  at: (u: number, v: number, across: number) => ShapePoint;
  check: () => void;
}
export function shapeDistanceField(
  surface: SurfaceSpec,
  stitchWidth: number,
  courseHeight: number,
  startEdge: StartEdge = 'v0',
  context?: GenerationContext,
  /** Numerical comparisons only; not a saved/UI setting. */
  resolution = surface.kind === 'plane' ? 16 : 128,
  window?: ChartWindow
): ShapeField {
  validateSurface(surface);
  if (
    !['plane', 'saddle', 'mesh'].includes(surface.kind) ||
    (surface.kind === 'mesh' && surface.mapping !== 'rectangular-obj-uv-v1')
  )
    throw new Error('Shaping requires a plane, saddle or supplied rectangular OBJ chart.');
  if (!['v0', 'u1', 'v1', 'u0'].includes(startEdge)) throw new Error('Invalid shaping start edge.');
  if (![stitchWidth, courseHeight].every((x) => Number.isFinite(x) && x > 0))
    throw new Error('Measured stitch width and course height must be finite and positive.');
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 256)
    throw new Error('Shaping grid resolution must be an integer from 2 to 256.');
  const check = () => {
    if (context?.cancelled?.()) {
      const e = new Error('Shaping cancelled.');
      e.name = 'AbortError';
      throw e;
    }
  };
  check();
  const n = resolution,
    side = n + 1;
  const at = (u: number, v: number, across: number): ShapePoint => {
    const uv = originalShapeUV(u, v, startEdge, window),
      position = evaluateSurface(surface, 0, ...uv);
    if (!position.every(Number.isFinite)) throw new Error('Nonfinite shaping surface evaluation.');
    return { uv, position, across };
  };
  const grid: ShapePoint[] = [];
  for (let y = 0; y <= n; y++) {
    check();
    for (let x = 0; x <= n; x++) grid.push(at(x / n, y / n, 0));
  }
  // Continuous interpolation on incident triangle edges avoids a fixed angular stencil.
  // The field remains a sampled first-order approximation, not an exact geodesic.
  const d =
    surface.kind === 'plane'
      ? Float64Array.from(
          grid,
          (_, i) => ((i % side) * surface.size * rotatedSpan(startEdge, window)[0]) / n
        )
      : surfaceDistance(
          grid.map((p) => p.position),
          n,
          check
        ).values;
  const max = Math.max(...Array.from({ length: side }, (_, y) => d[y * side + n]));
  return { surface, startEdge, n, d, max, at, check, ...(window ? { window } : {}) };
}
export function assertMonotone(field: ShapeField) {
  const { n, d, surface } = field,
    side = n + 1;
  for (let y = 0; y <= n; y++)
    for (let x = 1; x <= n; x++)
      if (d[y * side + x] < d[y * side + x - 1] - 1e-10 * surface.size)
        throw new Error('Unsupported nonmonotone distance contour; split the chart into patches.');
}
/** Level set of the distance field, ordered along the contour; one run only. */
export function shapeContour(field: ShapeField, level: number): ShapePoint[] {
  const { n, d, at } = field,
    side = n + 1;
  const p: ShapePoint[] = [];
  let runs = 0,
    inside = false;
  for (let y = 0; y <= n; y++) {
    const right = d[y * side + n],
      valid = right >= level;
    if (valid !== inside && y > 0) {
      const prev = d[(y - 1) * side + n],
        f = (level - prev) / (right - prev);
      p.push(at(1, (y - 1 + f) / n, level));
    }
    if (valid) {
      if (!inside) runs++;
      let x = 1;
      while (x < n && d[y * side + x] < level) x++;
      const a = d[y * side + x - 1],
        b = d[y * side + x];
      p.push(at((x - 1 + (level - a) / (b - a)) / n, y / n, level));
    }
    inside = valid;
  }
  if (runs !== 1 || p.length < 2)
    throw new Error(
      'Unsupported disconnected or degenerate contour; split the chart into patches.'
    );
  return p;
}
/** The chart side opposite needle 1, with its sampled distances. */
export function shapeFarSide(field: ShapeField): ShapePoint[] {
  const { n, d, at } = field;
  return Array.from({ length: n + 1 }, (_, y) => at(1, y / n, d[y * (n + 1) + n]));
}
/** The needle-1 chart side, at distance zero. */
export function shapeNearSide(field: ShapeField): ShapePoint[] {
  const { n, at } = field;
  return Array.from({ length: n + 1 }, (_, y) => at(0, y / n, 0));
}
/** Loops at the centres of equal parts of a course polyline; the count is the measured stitch width, rounded up. */
export function shapeCourseLoops(
  surface: SurfaceSpec,
  points: ShapePoint[],
  stitchWidth: number,
  index: number
): { loops: ShapeLoop[]; length: number } {
  const l = lengths(points),
    length = l.at(-1)!;
  const count = Math.max(1, countCeil(length / stitchWidth));
  if (count > 600) throw new Error('Shaping exceeds the 600 needle limit.');
  const loops = Array.from({ length: count }, (_, i) => ({
    ...interpolateShape(surface, points, l, (i + 0.5) / count),
    id: `shape:${index}:${i}`,
  }));
  return { loops, length };
}
export function buildShapeGeometry(
  surface: SurfaceSpec,
  stitchWidth: number,
  courseHeight: number,
  startEdge: StartEdge = 'v0',
  context?: GenerationContext,
  /** Numerical comparisons only; not a saved/UI setting. */
  resolution = surface.kind === 'plane' ? 16 : 128,
  window?: ChartWindow
): ShapeGeometry {
  const field = shapeDistanceField(
    surface,
    stitchWidth,
    courseHeight,
    startEdge,
    context,
    resolution,
    window
  );
  // One course height in rotated chart units along the needle-1 side.
  const courseStep = courseHeight / (surface.size * rotatedSpan(startEdge, window)[1]);
  const { n, d, max, at, check } = field,
    side = n + 1;
  const width = Math.max(1, countCeil(max / stitchWidth));
  if (width > 600) throw new Error('Shaping exceeds the 600 needle limit.');
  assertMonotone(field);
  const interpolate = (p: ShapePoint[], l: number[], t: number) =>
    interpolateShape(surface, p, l, t);
  const contours: ShapePoint[][] = [],
    samples: ShapePoint[][] = [],
    rounding: number[] = [];
  for (let j = 0; j < width; j++) {
    check();
    const level = Math.min((j + 0.5) * stitchWidth, max * (1 - 1e-12));
    const p = shapeContour(field, level);
    const l = lengths(p),
      len = l[l.length - 1],
      m = Math.max(1, Math.round(len / courseHeight));
    if (m > 600) throw new Error('Shaping exceeds the 600 pass limit.');
    contours.push(p);
    rounding.push(len - m * courseHeight);
    samples.push(Array.from({ length: m }, (_, i) => interpolate(p, l, (i + 0.5) / m)));
  }
  context?.progress?.(0.5, 'Aligning shaping contours');
  // Minimum-cost monotone blocks. Only the closer edge in a triangle is unioned;
  // the other sample becomes an explicit partial course.
  const offsets: number[] = [];
  let size = 0;
  for (const p of samples) {
    offsets.push(size);
    size += p.length;
  }
  const parent = Array.from({ length: size }, (_, i) => i),
    find = (a: number): number => {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    };
  const links: [number, number][] = [];
  const union = (a: number, b: number) => {
    links.push([a, b]);
    a = find(a);
    b = find(b);
    if (a !== b) parent[b] = a;
  };
  let maxLinkOffset = 0;
  for (let col = 1; col < samples.length; col++) {
    check();
    // On an analytic plane all contours are parallel and have the same sample
    // count. Identity links have zero perpendicular cost, the global minimum.
    // Avoid allocating a quadratic alignment table for this exact case.
    if (surface.kind === 'plane') {
      if (samples[col - 1].length !== samples[col].length)
        throw new Error('Inconsistent analytic-plane contour sampling.');
      for (let i = 0; i < samples[col].length; i++) union(offsets[col - 1] + i, offsets[col] + i);
      continue;
    }
    const a = samples[col - 1],
      b = samples[col],
      h = b.length + 1,
      costs = new Float64Array((a.length + 1) * h).fill(Infinity),
      step = new Uint8Array(costs.length);
    costs[0] = 0;
    const unrotateV = (p: ShapePoint) => rotatedShapeV(p.uv, startEdge, window);
    const boundaryTrimmed =
      Math.abs(unrotateV(contours[col][0]) - unrotateV(contours[col - 1][0])) > 1e-8 ||
      Math.abs(unrotateV(contours[col].at(-1)!) - unrotateV(contours[col - 1].at(-1)!)) > 1e-8;

    const cost = (i: number, j: number) => {
      const t =
        a.length === 1
          ? contours[col - 1]
          : [a[Math.max(0, i - 1)], a[Math.min(a.length - 1, i + 1)]];
      const v = t[t.length - 1].position.map((x, k) => x - t[0].position[k]);
      const norm = Math.hypot(...v);
      const dot = b[j].position.reduce((s, x, k) => s + (x - a[i].position[k]) * v[k], 0);
      return (norm ? dot / norm / courseHeight : 0) ** 2;
    };
    // Preserve the first/last course between contours with matching untrimmed ends.
    // Otherwise a slightly closer interior sample can terminate a boundary-adjacent
    // course when a rounded sample count changes. Trimmed ends keep terminal gaps.
    const triangleLink = (i: number, j: number, di: number, dj: number): [number, number] => {
      const endI = i + di - 1,
        endJ = j + dj - 1;
      if (!boundaryTrimmed && a.length > 1 && b.length > 1) {
        if (i === 0 && j === 0) return [i, j];
        if (endI === a.length - 1 && endJ === b.length - 1) return [endI, endJ];
      }
      return cost(i, j) < cost(endI, endJ) ? [i, j] : [endI, endJ];
    };
    for (let i = 0; i <= a.length; i++)
      for (let j = 0; j <= b.length; j++) {
        const k = i * h + j,
          v = costs[k];
        if (!Number.isFinite(v)) continue;
        const set = (di: number, dj: number, c: number, s: number) => {
          if (i + di > a.length || j + dj > b.length) return;
          const q = (i + di) * h + j + dj;
          if (v + c < costs[q]) {
            costs[q] = v + c;
            step[q] = s;
          }
        };
        if (i < a.length && j < b.length) {
          set(1, 1, cost(i, j), 1);
          if (!boundaryTrimmed && a.length > b.length && i + 1 < a.length) {
            const [ai, bj] = triangleLink(i, j, 2, 1);
            set(2, 1, cost(ai, bj) + 0.25, 2);
          }
          if (!boundaryTrimmed && b.length > a.length && j + 1 < b.length) {
            const [ai, bj] = triangleLink(i, j, 1, 2);
            set(1, 2, cost(ai, bj) + 0.25, 3);
          }
        }
        // Boundary-trimmed terminal intervals may straddle the adjacent contour endpoint.
        // The one-course chart tolerance below is a project discretization choice.
        const uvV = (p: ShapePoint) => rotatedShapeV(p.uv, startEdge, window);
        if (
          i < a.length &&
          (j === 0 || j === b.length) &&
          ((uvV(contours[col][0]) > uvV(contours[col - 1][0]) + 1e-8 &&
            uvV(a[i]) < uvV(contours[col][0]) + courseStep) ||
            (uvV(contours[col].at(-1)!) < uvV(contours[col - 1].at(-1)!) - 1e-8 &&
              uvV(a[i]) > uvV(contours[col].at(-1)!) - courseStep))
        )
          set(1, 0, 0, 4);
        if (
          j < b.length &&
          (i === 0 || i === a.length) &&
          ((uvV(contours[col - 1][0]) > uvV(contours[col][0]) + 1e-8 &&
            uvV(b[j]) < uvV(contours[col - 1][0]) + courseStep) ||
            (uvV(contours[col - 1].at(-1)!) < uvV(contours[col].at(-1)!) - 1e-8 &&
              uvV(b[j]) > uvV(contours[col - 1].at(-1)!) - courseStep))
        )
          set(0, 1, 0, 5);
      }
    let i = a.length,
      j = b.length;
    if (!Number.isFinite(costs[i * h + j]))
      throw new Error('Adjacent contours cannot be aligned with 1:1 / 1:2 / 2:1 blocks.');
    while (i || j) {
      const s = step[i * h + j];
      let ai = i - 1,
        bj = j - 1;
      if (s === 2) {
        [ai, bj] = triangleLink(i - 2, j - 1, 2, 1);
        i -= 2;
        j--;
      } else if (s === 3) {
        [ai, bj] = triangleLink(i - 1, j - 2, 1, 2);
        i--;
        j -= 2;
      } else if (s === 1) {
        i--;
        j--;
      } else if (s === 4) {
        i--;
        continue;
      } else if (s === 5) {
        j--;
        continue;
      } else throw new Error('Invalid shaping alignment.');
      union(offsets[col - 1] + ai, offsets[col] + bj);
      maxLinkOffset = Math.max(maxLinkOffset, Math.sqrt(cost(ai, bj)));
    }
  }
  const groups = new Map<number, { p: ShapePoint; col: number; index: number }[]>();
  samples.forEach((s, col) =>
    s.forEach((p, i) => {
      const key = find(offsets[col] + i),
        g = groups.get(key) ?? [];
      g.push({ p, col, index: offsets[col] + i });
      groups.set(key, g);
    })
  );
  // Course order is a topological order of the sample order along each contour.
  const next = new Map<number, Set<number>>(),
    indegree = new Map<number, number>();
  for (const k of groups.keys()) {
    next.set(k, new Set());
    indegree.set(k, 0);
  }
  samples.forEach((s, col) => {
    for (let i = 1; i < s.length; i++) {
      const a = find(offsets[col] + i - 1),
        b = find(offsets[col] + i);
      if (a !== b && !next.get(a)!.has(b)) {
        next.get(a)!.add(b);
        indegree.set(b, indegree.get(b)! + 1);
      }
    }
  });
  const ready = [...groups.keys()].filter((k) => !indegree.get(k)).sort((a, b) => a - b),
    order: number[] = [];
  while (ready.length) {
    ready.sort((a, b) => a - b);
    const k = ready.shift()!;
    order.push(k);
    for (const b of next.get(k)!) {
      indegree.set(b, indegree.get(b)! - 1);
      if (!indegree.get(b)) ready.push(b);
    }
  }
  if (order.length !== groups.size) throw new Error('Cyclic shaping course order.');
  if (order.length > 600) throw new Error('Shaping exceeds the 600 pass limit.');
  const courseRounding: number[] = [],
    courseVertices: number[][] = [],
    courses: ShapeCourse[] = order.map((key, index) => {
      const g = groups.get(key)!,
        first = g[0],
        last = g.at(-1)!;
      const points = g.map((x) => x.p);
      courseVertices.push(g.map((x) => x.index));
      const extend = (p: ShapePoint, u: number, across: number) => {
        const uv = p.uv;
        const v = rotatedShapeV(uv, startEdge, window);
        return at(u, v, across);
      };
      const rotatedV = (p: ShapePoint) => rotatedShapeV(p.uv, startEdge, window);
      const sideDistance = (p: ShapePoint) => {
        const y = rotatedV(p) * n,
          k = Math.min(n - 1, Math.floor(y)),
          f = y - k;
        return d[k * side + n] * (1 - f) + d[(k + 1) * side + n] * f;
      };
      const leftBoundary = first.col === 0;
      const next = contours[last.col + 1];
      const outsideNext =
        next &&
        (rotatedV(last.p) < rotatedV(next[0]) + courseStep ||
          rotatedV(last.p) > rotatedV(next.at(-1)!) - courseStep) &&
        sideDistance(last.p) - last.p.across < stitchWidth * 1.5;
      const rightBoundary = last.col === width - 1 || !!outsideNext;
      const midpoint = (p: ShapePoint, col: number) => {
        const target = rotatedV(p),
          path = contours[col];
        let k = 1;
        while (k < path.length - 1 && rotatedV(path[k]) < target) k++;
        const a = path[k - 1],
          b = path[k],
          den = rotatedV(b) - rotatedV(a),
          f = Math.max(0, Math.min(1, den ? (target - rotatedV(a)) / den : 0));
        const uv: Vec2 = [
          (p.uv[0] + a.uv[0] + f * (b.uv[0] - a.uv[0])) / 2,
          (p.uv[1] + a.uv[1] + f * (b.uv[1] - a.uv[1])) / 2,
        ];
        return {
          uv,
          position: evaluateSurface(surface, 0, ...uv),
          across: (p.across + a.across) / 2,
        };
      };
      points.unshift(leftBoundary ? extend(first.p, 0, 0) : midpoint(first.p, first.col - 1));
      points.push(
        rightBoundary ? extend(last.p, 1, sideDistance(last.p)) : midpoint(last.p, last.col + 1)
      );
      const { loops, length } = shapeCourseLoops(surface, points, stitchWidth, index);
      courseRounding.push(length - loops.length * stitchWidth);
      return {
        id: `course:${index}`,
        index,
        points,
        loops,
        extent: [points[0].across, points.at(-1)!.across],
        leftBoundary,
        rightBoundary,
        turnStart: !leftBoundary,
        turnEnd: !rightBoundary,
        length,
      };
    });
  check();
  context?.progress?.(1, 'Shaping geometry complete');
  return {
    courses,
    contours,
    courseHeight,
    stitchWidth,
    contourRounding: rounding,
    courseRounding,
    maxLinkOffset,
    resolution: n,
    graph: { samples, links, courses: courseVertices },
    method:
      'Popescu 2019 §§6.2.2–6.2.3 stages; project triangle-distance and endpoint-anchored monotone alignment v3',
    issues: [
      'Sampled triangle-distance and chart interpolation errors are not bounded on curved surfaces.',
      'Single monotone contour per level is supported; complex charts require patching.',
      'Boundary-trimmed contour pairs use terminal gaps, without interior triangle blocks; mixed boundary trimming and interior short rows require separate patches.',
      'Sampled triangle faces can shortcut curved surfaces; distance, arc interpolation and turn positions are numerical approximations.',
    ],
  };
}
