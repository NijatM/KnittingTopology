/** Popescu (2019), §§6.2.2–6.2.3: contour/sample/course stages.
 * Distance source, triangle relaxation and monotone alignment are project adaptations.
 * Supported subset: a single contour, monotone across chart rows. */
import type { GenerationContext, SurfaceSpec, Vec2, Vec3 } from '../core/types';
import { evaluateSurface, validateSurface } from '../core/surfaces';
import type { ShapeCourse, ShapeGeometry, ShapePoint, StartEdge } from './shape-types';
import { surfaceDistance } from './surface-distance';

export function originalShapeUV(u: number, v: number, edge: StartEdge): Vec2 {
  switch (edge) {
    case 'v0':
      return [u, v];
    case 'u1':
      return [1 - v, u];
    case 'v1':
      return [1 - u, 1 - v];
    case 'u0':
      return [v, 1 - u];
  }
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const countCeil = (x: number) => Math.ceil(x - 1e-10 * Math.max(1, x));
function lengths(p: ShapePoint[]): number[] {
  const l = [0];
  for (let i = 1; i < p.length; i++) l.push(l[i - 1] + distance(p[i - 1].position, p[i].position));
  return l;
}
export function buildShapeGeometry(
  surface: SurfaceSpec,
  stitchWidth: number,
  courseHeight: number,
  startEdge: StartEdge = 'v0',
  context?: GenerationContext
): ShapeGeometry {
  validateSurface(surface);
  if (
    !['plane', 'saddle', 'mesh'].includes(surface.kind) ||
    (surface.kind === 'mesh' && surface.mapping !== 'rectangular-obj-uv-v1')
  )
    throw new Error('Shaping requires a plane, saddle or supplied rectangular OBJ chart.');
  if (!['v0', 'u1', 'v1', 'u0'].includes(startEdge)) throw new Error('Invalid shaping start edge.');
  if (![stitchWidth, courseHeight].every((x) => Number.isFinite(x) && x > 0))
    throw new Error('Measured stitch width and course height must be finite and positive.');
  const check = () => {
    if (context?.cancelled?.()) {
      const e = new Error('Shaping cancelled.');
      e.name = 'AbortError';
      throw e;
    }
  };
  check();
  const n = surface.kind === 'plane' ? 16 : 128,
    side = n + 1;
  const at = (u: number, v: number, across: number): ShapePoint => {
    const uv = originalShapeUV(u, v, startEdge),
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
      ? Float64Array.from(grid, (_, i) => ((i % side) * surface.size) / n)
      : surfaceDistance(
          grid.map((p) => p.position),
          n,
          check
        ).values;
  const max = Math.max(...Array.from({ length: side }, (_, y) => d[y * side + n]));
  const width = Math.max(1, countCeil(max / stitchWidth));
  if (width > 600) throw new Error('Shaping exceeds the 600 needle limit.');
  for (let y = 0; y <= n; y++)
    for (let x = 1; x <= n; x++)
      if (d[y * side + x] < d[y * side + x - 1] - 1e-10 * surface.size)
        throw new Error('Unsupported nonmonotone distance contour; split the chart into patches.');
  const interpolate = (p: ShapePoint[], l: number[], t: number): ShapePoint => {
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
  };
  const contours: ShapePoint[][] = [],
    samples: ShapePoint[][] = [],
    rounding: number[] = [];
  for (let j = 0; j < width; j++) {
    check();
    const level = Math.min((j + 0.5) * stitchWidth, max * (1 - 1e-12));
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
  const union = (a: number, b: number) => {
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
    const unrotateV = (p: ShapePoint) =>
      startEdge === 'v0'
        ? p.uv[1]
        : startEdge === 'v1'
          ? 1 - p.uv[1]
          : startEdge === 'u1'
            ? 1 - p.uv[0]
            : p.uv[0];
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
          if (!boundaryTrimmed && a.length > b.length && i + 1 < a.length)
            set(2, 1, Math.min(cost(i, j), cost(i + 1, j)) + 0.25, 2);
          if (!boundaryTrimmed && b.length > a.length && j + 1 < b.length)
            set(1, 2, Math.min(cost(i, j), cost(i, j + 1)) + 0.25, 3);
        }
        // Boundary-trimmed terminal intervals may straddle the adjacent contour endpoint.
        // The one-course chart tolerance below is a project discretization choice.
        const uvV = (p: ShapePoint) =>
          startEdge === 'v0'
            ? p.uv[1]
            : startEdge === 'v1'
              ? 1 - p.uv[1]
              : startEdge === 'u1'
                ? 1 - p.uv[0]
                : p.uv[0];
        if (
          i < a.length &&
          (j === 0 || j === b.length) &&
          ((uvV(contours[col][0]) > uvV(contours[col - 1][0]) + 1e-8 &&
            uvV(a[i]) < uvV(contours[col][0]) + courseHeight / surface.size) ||
            (uvV(contours[col].at(-1)!) < uvV(contours[col - 1].at(-1)!) - 1e-8 &&
              uvV(a[i]) > uvV(contours[col].at(-1)!) - courseHeight / surface.size))
        )
          set(1, 0, 0, 4);
        if (
          j < b.length &&
          (i === 0 || i === a.length) &&
          ((uvV(contours[col - 1][0]) > uvV(contours[col][0]) + 1e-8 &&
            uvV(b[j]) < uvV(contours[col - 1][0]) + courseHeight / surface.size) ||
            (uvV(contours[col - 1].at(-1)!) < uvV(contours[col].at(-1)!) - 1e-8 &&
              uvV(b[j]) > uvV(contours[col - 1].at(-1)!) - courseHeight / surface.size))
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
        if (cost(i - 2, bj) < cost(ai, bj)) ai = i - 2;
        i -= 2;
        j--;
      } else if (s === 3) {
        if (cost(ai, j - 2) < cost(ai, bj)) bj = j - 2;
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
  const groups = new Map<number, { p: ShapePoint; col: number }[]>();
  samples.forEach((s, col) =>
    s.forEach((p, i) => {
      const key = find(offsets[col] + i),
        g = groups.get(key) ?? [];
      g.push({ p, col });
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
    courses: ShapeCourse[] = order.map((key, index) => {
      const g = groups.get(key)!,
        first = g[0],
        last = g.at(-1)!;
      const points = g.map((x) => x.p);
      const extend = (p: ShapePoint, u: number, across: number) => {
        const uv = p.uv;
        const v =
          startEdge === 'v0'
            ? uv[1]
            : startEdge === 'v1'
              ? 1 - uv[1]
              : startEdge === 'u1'
                ? 1 - uv[0]
                : uv[0];
        return at(u, v, across);
      };
      const rotatedV = (p: ShapePoint) =>
        startEdge === 'v0'
          ? p.uv[1]
          : startEdge === 'v1'
            ? 1 - p.uv[1]
            : startEdge === 'u1'
              ? 1 - p.uv[0]
              : p.uv[0];
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
        (rotatedV(last.p) < rotatedV(next[0]) + courseHeight / surface.size ||
          rotatedV(last.p) > rotatedV(next.at(-1)!) - courseHeight / surface.size) &&
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
      const l = lengths(points),
        length = l.at(-1)!;
      const count = Math.max(1, countCeil(length / stitchWidth));
      if (count > 600) throw new Error('Shaping exceeds the 600 needle limit.');
      const loops = Array.from({ length: count }, (_, i) => ({
        ...interpolate(points, l, (i + 0.5) / count),
        id: `shape:${index}:${i}`,
      }));
      courseRounding.push(length - count * stitchWidth);
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
    method:
      'Popescu 2019 §§6.2.2–6.2.3 stages; project triangle-distance and monotone-alignment adaptation v2',
    issues: [
      'Sampled triangle-distance and chart interpolation errors are not bounded on curved surfaces.',
      'Single monotone contour per level is supported; complex charts require patching.',
      'Boundary-trimmed contour pairs use terminal gaps, without interior triangle blocks; mixed boundary trimming and interior short rows require separate patches.',
      'Sampled triangle faces can shortcut curved surfaces; distance, arc interpolation and turn positions are numerical approximations.',
    ],
  };
}
