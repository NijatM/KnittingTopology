/** Popescu (2019), §§6.2.2–6.2.4 (pp. 99–104): course generation by connection rules, loop generation by
 * segment division, and the loop dual. Reconstructed from the thesis text, not from compas_knit; where the
 * text is silent the choices below are the project's and are listed in `POPESCU_ISSUES`. */
import type {
  GenerationContext,
  KnitCourseStage,
  KnitLoopRole,
  KnitLoopStage,
  KnitPrimalGraph,
  KnitStageCourse,
  KnitStagePoint,
  SurfaceSpec,
  Vec3,
} from '../core/types';
import { evaluateSurface } from '../core/surfaces';
import {
  assertMonotone,
  interpolateShape,
  rotatedShapeUV,
  shapeContour,
  shapeDistanceField,
  shapeFarSide,
  shapeLengths,
  shapeNearSide,
} from './shape-geometry';
import { crossingPairs, segmentsConflict, stagePoint } from './knit-graph';
import type { ChartWindow, ShapePoint, StartEdge } from './shape-types';

export const POPESCU_METHOD =
  'Popescu 2019 §§6.2.2–6.2.4 written connection rules, reconstructed from the thesis text (not compas_knit); project contours, sampling and dual v1';
export const POPESCU_ISSUES = [
  'Contours: the needle-1 side, level sets at most one loop width apart and the opposite chart side, each sampled with the measured course height including both ends (project choices; the thesis does not give the spacing or rounding).',
  'Revisit order, the reading of “two edges” as one per adjacent contour or course, the reference edge of the angle tie-break and the warp candidate sets are project readings of the thesis text.',
  'Project rules not in the thesis: a candidate edge that would cross, overlap or touch an existing edge is skipped; equal division counts are joined only between segments adjacent at both ends; warp candidates never come from the vertex’s own segments.',
  'Loops sit at face centroids; a course is a weft chain continued by the straightest pair at each vertex; loops on the first leaf chain form the cast-on course; a decrease triangle joins the child of its nearer row neighbour (project choices).',
  'Spacing weft/warp and Refinement are not implemented.',
  'Sampled triangle-distance and chart interpolation errors are not bounded on curved surfaces.',
];
export interface PopescuOptions {
  resultCount: number;
  angleTolerance: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angle = (a: Vec3, b: Vec3) => {
  const n = Math.sqrt(dot(a, a) * dot(b, b));
  return n ? (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / n))) * 180) / Math.PI : 90;
};
const countCeil = (x: number) => Math.ceil(x - 1e-10 * Math.max(1, x));
const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Chart segments in a bucket grid, to skip candidates whose edge would cross an existing edge
 * (project rule; the thesis leaves crossings to manual editing). */
class EdgeGrid {
  private cells = new Map<number, [number, number][]>();
  private size: number;
  constructor(
    private uv: (i: number) => readonly [number, number],
    count: number
  ) {
    this.size = Math.max(1, Math.min(400, Math.ceil(Math.sqrt(count))));
  }
  private each(a: number, b: number, fn: (cell: number) => boolean | void): boolean {
    const p = this.uv(a),
      q = this.uv(b),
      n = this.size,
      c = (x: number) => Math.max(0, Math.min(n - 1, Math.floor(x * n)));
    for (let x = c(Math.min(p[0], q[0])); x <= c(Math.max(p[0], q[0])); x++)
      for (let y = c(Math.min(p[1], q[1])); y <= c(Math.max(p[1], q[1])); y++)
        if (fn(x * n + y)) return true;
    return false;
  }
  add(a: number, b: number) {
    this.each(a, b, (cell) => {
      const list = this.cells.get(cell) ?? [];
      list.push([a, b]);
      this.cells.set(cell, list);
    });
  }
  crosses(a: number, b: number): boolean {
    const p = this.uv(a),
      q = this.uv(b);
    return this.each(a, b, (cell) =>
      (this.cells.get(cell) ?? []).some(
        ([c, d]) =>
          !((c === a && d === b) || (c === b && d === a)) &&
          segmentsConflict(p, q, this.uv(c), this.uv(d))
      )
    );
  }
}
/** The `count` candidates closest in space, nearest first (§6.2.2, p. 99). */
function nearest(from: Vec3, pool: readonly number[], pos: (i: number) => Vec3, count: number) {
  return pool
    .map((i) => ({ i, d: dot(sub(pos(i), from), sub(pos(i), from)) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, count)
    .map((x) => x.i);
}
/** The candidate closest to perpendicular to `tangent`; when the best two are within the angle tolerance,
 * the one with the smaller angle to the reference edge (§6.2.2, p. 101). */
function choose(
  from: Vec3,
  candidates: readonly number[],
  pos: (i: number) => Vec3,
  tangent: Vec3,
  reference: Vec3 | undefined,
  tolerance: number
): number | undefined {
  const scored = candidates
    .map((c) => ({ c, dev: Math.abs(90 - angle(sub(pos(c), from), tangent)) }))
    .sort((a, b) => a.dev - b.dev || a.c - b.c);
  const [first, second] = scored;
  if (!first) return undefined;
  if (reference && second && second.dev - first.dev <= tolerance)
    return angle(sub(pos(second.c), from), reference) < angle(sub(pos(first.c), from), reference)
      ? second.c
      : first.c;
  return first.c;
}

/** §6.2.2: contours, vertex attributes, weft edges, short-row ends and warp edges between end vertices. */
export function popescuCourseStage(
  surface: SurfaceSpec,
  stitchWidth: number,
  courseHeight: number,
  startEdge: StartEdge,
  options: PopescuOptions,
  fingerprint: string,
  context?: GenerationContext,
  window?: ChartWindow
): KnitCourseStage {
  const field = shapeDistanceField(
    surface,
    stitchWidth,
    courseHeight,
    startEdge,
    context,
    undefined,
    window
  );
  assertMonotone(field);
  const { n, d, check } = field;
  let far = Infinity;
  for (let y = 0; y <= n; y++) far = Math.min(far, d[y * (n + 1) + n]!);
  if (!(far > 0))
    throw new Error('The opposite side meets the needle-1 side; split the chart into patches.');
  const columns = Math.max(1, countCeil(far / stitchWidth));
  if (columns > 600) throw new Error('Shaping exceeds the 600 needle limit.');
  const contours: ShapePoint[][] = [shapeNearSide(field)];
  for (let k = 1; k < columns; k++) contours.push(shapeContour(field, (k * far) / columns));
  contours.push(shapeFarSide(field));
  const rounding: number[] = [],
    samples: ShapePoint[][] = [];
  for (const p of contours) {
    check();
    const l = shapeLengths(p),
      len = l.at(-1)!,
      m = Math.max(1, Math.round(len / courseHeight));
    if (m > 600) throw new Error('Shaping exceeds the 600 pass limit.');
    rounding.push(len - m * courseHeight);
    samples.push(Array.from({ length: m + 1 }, (_, i) => interpolateShape(surface, p, l, i / m)));
  }
  const offsets: number[] = [],
    vertices: KnitCourseStage['vertices'] = [],
    pos: Vec3[] = [];
  samples.forEach((list, contour) => {
    offsets.push(vertices.length);
    list.forEach((p, position) => {
      vertices.push({
        ...stagePoint(p),
        contour,
        position,
        leaf: position === 0 || position === list.length - 1,
        end: contour === 0 || contour === columns,
      });
      pos.push(p.position);
    });
  });
  const at = (j: number, i: number) => offsets[j]! + i,
    last = (j: number) => samples[j]!.length - 1;
  const back: number[][] = vertices.map(() => []),
    forward: number[][] = vertices.map(() => []),
    links: [number, number][] = [],
    seen = new Set<string>(),
    grid = new EdgeGrid((i) => vertices[i]!.uv, vertices.length);
  const addWeft = (a: number, b: number) => {
    const [lo, hi] = vertices[a]!.contour < vertices[b]!.contour ? [a, b] : [b, a];
    if (seen.has(key(lo, hi))) return;
    seen.add(key(lo, hi));
    grid.add(lo, hi);
    links.push([lo, hi]);
    forward[lo]!.push(hi);
    back[hi]!.push(lo);
  };
  // Leaf edges form the first and last course; then contours with equal counts are joined in order.
  for (let j = 0; j < columns; j++) {
    addWeft(at(j, 0), at(j + 1, 0));
    addWeft(at(j, last(j)), at(j + 1, last(j + 1)));
  }
  for (let j = 0; j < columns; j++)
    if (last(j) === last(j + 1)) for (let i = 0; i <= last(j); i++) addWeft(at(j, i), at(j + 1, i));
  // Revisit: an 'end' vertex needs one weft edge, others two (read as one per adjacent contour).
  const pool = (j: number) => Array.from({ length: last(j) + 1 }, (_, i) => at(j, i));
  const tangentAt = (j: number, i: number) =>
    sub(pos[at(j, Math.min(i + 1, last(j)))]!, pos[at(j, Math.max(i - 1, 0))]!);
  for (let j = 0; j <= columns; j++) {
    check();
    for (let i = 0; i <= last(j); i++) {
      const v = at(j, i),
        p = pos[v]!,
        tangent = tangentAt(j, i);
      for (const side of [-1, 1] as const) {
        const own = side < 0 ? back[v]! : forward[v]!,
          other = side < 0 ? forward[v]! : back[v]!;
        if (own.length || j + side < 0 || j + side > columns) continue;
        const candidates = nearest(p, pool(j + side), (k) => pos[k]!, options.resultCount).filter(
          (c) => !grid.crosses(v, c)
        );
        const reference = other.length ? sub(p, pos[other[0]!]!) : undefined;
        const chosen = choose(
          p,
          candidates,
          (k) => pos[k]!,
          tangent,
          reference,
          options.angleTolerance
        );
        if (chosen !== undefined) addWeft(v, chosen);
      }
    }
  }
  // Valency > 2 marks short-row ends; end vertices get warp edges to their contour neighbours.
  vertices.forEach((v, i) => {
    if (back[i]!.length + forward[i]!.length > 2) v.end = true;
  });
  const warp: [number, number][] = [],
    warpSeen = new Set<string>();
  vertices.forEach((v, i) => {
    if (!v.end) return;
    for (const k of [v.position - 1, v.position + 1])
      if (k >= 0 && k <= last(v.contour)) {
        const w = at(v.contour, k);
        if (!warpSeen.has(key(i, w))) {
          warpSeen.add(key(i, w));
          warp.push(i < w ? [i, w] : [w, i]);
        }
      }
  });
  for (const [a, b] of warp) vertices[a]!.end = vertices[b]!.end = true;
  let maxLinkOffset = 0;
  for (const [lo, hi] of links) {
    const v = vertices[lo]!,
      t = tangentAt(v.contour, v.position),
      norm = Math.sqrt(dot(t, t));
    if (norm)
      maxLinkOffset = Math.max(
        maxLinkOffset,
        Math.abs(dot(sub(pos[hi]!, pos[lo]!), t)) / norm / courseHeight
      );
  }
  return {
    stage: 'courses',
    fingerprint,
    method: POPESCU_METHOD,
    vertices,
    links,
    warp,
    courses: [],
    contourRounding: rounding,
    maxLinkOffset,
    resolution: n,
    issues: [...POPESCU_ISSUES],
  };
}

type FaceKind = KnitPrimalGraph['faces'][number]['kind'];
/** §6.2.3–6.2.4: weft segments between end vertices divided by the loop width, warp edges between
 * adjacent segments, faces, and the loop dual with its parent links. */
export function popescuLoopStage(
  surface: SurfaceSpec,
  courses: KnitCourseStage,
  stitchWidth: number,
  startEdge: StartEdge,
  options: PopescuOptions,
  fingerprint: string,
  context?: GenerationContext,
  window?: ChartWindow
): KnitLoopStage {
  const check = () => {
    if (context?.cancelled?.()) {
      const e = new Error('Shaping cancelled.');
      e.name = 'AbortError';
      throw e;
    }
  };
  const V = courses.vertices,
    columns = Math.max(0, ...V.map((v) => v.contour));
  const point = (p: KnitStagePoint): ShapePoint => ({
    uv: [p.uv[0], p.uv[1]],
    position: evaluateSurface(surface, 0, p.uv[0], p.uv[1]),
    across: p.across,
  });
  const weftOf: number[][] = V.map(() => []);
  for (const [a, b] of courses.links) {
    weftOf[a]!.push(b);
    weftOf[b]!.push(a);
  }
  // Segments: weft chains between two end vertices, ordered from the lower contour.
  const segmentPaths: number[][] = [],
    seenPaths = new Set<string>();
  V.forEach((v, e) => {
    if (!v.end) return;
    for (const x of weftOf[e]!) {
      const path = [e, x];
      let prev = e,
        cur = x;
      while (!V[cur]!.end && path.length <= V.length) {
        const next = weftOf[cur]!.filter((y) => y !== prev);
        if (next.length !== 1) break;
        prev = cur;
        cur = next[0]!;
        path.push(cur);
      }
      if (V[path[0]!]!.contour > V[path.at(-1)!]!.contour) path.reverse();
      const id = path.join(',');
      if (!seenPaths.has(id)) {
        seenPaths.add(id);
        segmentPaths.push(path);
      }
    }
  });
  const finals: (ShapePoint & { leaf: boolean; end: boolean; contour?: number })[] = [],
    finalOf = new Map<number, number>();
  const original = (i: number) => {
    let f = finalOf.get(i);
    if (f === undefined) {
      f = finals.length;
      finals.push({ ...point(V[i]!), leaf: V[i]!.leaf, end: V[i]!.end, contour: V[i]!.contour });
      finalOf.set(i, f);
    }
    return f;
  };
  const edgeKind = new Map<string, 'weft' | 'warp'>(),
    edges: KnitPrimalGraph['edges'] = [],
    linked: Set<number>[] = [];
  let grid: EdgeGrid | undefined;
  const addEdge = (a: number, b: number, kind: 'weft' | 'warp') => {
    if (a === b || edgeKind.has(key(a, b)) || grid?.crosses(a, b)) return false;
    grid?.add(a, b);
    edgeKind.set(key(a, b), kind);
    edges.push({ a, b, kind });
    (linked[a] ??= new Set()).add(b);
    (linked[b] ??= new Set()).add(a);
    return true;
  };
  const segments = segmentPaths.map((path) => {
    check();
    const points = path.map((i) => point(V[i]!)),
      l = shapeLengths(points),
      parts = Math.max(1, countCeil(l.at(-1)! / stitchWidth)),
      leaf = path.every((i) => V[i]!.leaf),
      list = [original(path[0]!)];
    for (let k = 1; k < parts; k++) {
      list.push(finals.length);
      finals.push({ ...interpolateShape(surface, points, l, k / parts), leaf, end: false });
    }
    list.push(original(path.at(-1)!));
    for (let k = 1; k < list.length; k++) addEdge(list[k - 1]!, list[k]!, 'weft');
    return { finals: list, above: new Set<number>(), below: new Set<number>() };
  });
  if (finals.length > 400_000) throw new Error('The knit graph exceeds 400 000 vertices.');
  for (const [a, b] of courses.warp ?? []) addEdge(original(a), original(b), 'warp');
  grid = new EdgeGrid((i) => finals[i]!.uv, finals.length);
  for (const e of edges) grid.add(e.a, e.b);
  const rotated = finals.map((p) => rotatedShapeUV(p.uv, startEdge, window)),
    rv = (i: number) => rotated[i]![1];
  // Adjacent segments leave warp-linked or shared end vertices on the same side (project reading of
  // "segment adjacency", p. 103); the upper one has the larger chart coordinate along the contours.
  const at = new Map<number, { s: number; side: 1 | -1 }[]>();
  segments.forEach((s, k) => {
    for (const [f, side] of [
      [s.finals[0]!, 1],
      [s.finals.at(-1)!, -1],
    ] as const) {
      const list = at.get(f) ?? [];
      list.push({ s: k, side });
      at.set(f, list);
    }
  });
  const nextAlong = (s: number, side: 1 | -1) => {
    const list = segments[s]!.finals;
    return side > 0 ? list[1]! : list[list.length - 2]!;
  };
  const both = new Map<string, number>();
  segments.forEach((s, k) => {
    for (const [e, side] of [
      [s.finals[0]!, 1],
      [s.finals.at(-1)!, -1],
    ] as const)
      for (const f of [
        e,
        ...[...(linked[e] ?? [])].filter((x) => edgeKind.get(key(e, x)) === 'warp'),
      ])
        for (const t of at.get(f) ?? []) {
          if (t.s === k || t.side !== side) continue;
          both.set(`${k}:${t.s}`, (both.get(`${k}:${t.s}`) ?? 0) | (side > 0 ? 1 : 2));
          if (s.above.has(t.s) || s.below.has(t.s)) continue;
          const up = f !== e ? rv(f) > rv(e) : rv(nextAlong(t.s, side)) > rv(nextAlong(k, side));
          (up ? s.above : s.below).add(t.s);
          (up ? segments[t.s]!.below : segments[t.s]!.above).add(k);
        }
  });
  // Equal division counts are joined in order, as for contours; only segments adjacent at both ends.
  segments.forEach((s, k) => {
    for (const t of s.above) {
      const other = segments[t]!.finals;
      if (other.length === s.finals.length && both.get(`${k}:${t}`) === 3)
        s.finals.forEach((a, k) => {
          if (!linked[a]?.has(other[k]!)) addEdge(a, other[k]!, 'warp');
        });
    }
  });
  // Revisit (§6.2.3 "the same strategy"): an end vertex until it has the warp edges of Fig. 6.17 (one at a
  // leaf, else two); any other vertex until it has one towards every side with an adjacent segment
  // (project reading of "two"). Candidates come from adjacent segments, never the vertex's own.
  const ofVertex = new Map<number, number[]>();
  segments.forEach((s, k) =>
    s.finals.forEach((f) => ofVertex.set(f, [...(ofVertex.get(f) ?? []), k]))
  );
  const pos = (i: number) => finals[i]!.position;
  segments.forEach((s) => {
    check();
    s.finals.forEach((x, k) => {
      const own = ofVertex.get(x) ?? [];
      const tangent = sub(
        pos(s.finals[Math.min(k + 1, s.finals.length - 1)]!),
        pos(s.finals[Math.max(k - 1, 0)]!)
      );
      for (const up of [false, true]) {
        const warpNeighbours = [...(linked[x] ?? [])].filter(
          (y) => edgeKind.get(key(x, y)) === 'warp'
        );
        if (
          warpNeighbours.some((y) => rv(y) > rv(x) === up) ||
          (finals[x]!.end && warpNeighbours.length >= (finals[x]!.leaf ? 1 : 2))
        )
          continue;
        const pool = new Set<number>();
        for (const o of own)
          for (const t of up ? segments[o]!.above : segments[o]!.below)
            if (!own.includes(t))
              for (const f of segments[t]!.finals) if (f !== x && !linked[x]?.has(f)) pool.add(f);
        if (!pool.size) continue;
        const opposite = warpNeighbours.find((y) => rv(y) > rv(x) !== up);
        const chosen = choose(
          pos(x),
          nearest(pos(x), [...pool], pos, options.resultCount).filter((c) => !grid!.crosses(x, c)),
          pos,
          tangent,
          opposite === undefined ? undefined : sub(pos(x), pos(opposite)),
          options.angleTolerance
        );
        if (chosen !== undefined) addEdge(x, chosen, 'warp');
      }
    });
  });
  const primalVertices = finals.map((p) => ({
    ...stagePoint(p),
    leaf: p.leaf,
    end: p.end,
    ...(p.contour !== undefined ? { contour: p.contour } : {}),
  }));
  // The thesis fixes such graphs by manual editing (§6.3.2); edits need a saved courses stage.
  const fixHint = courses.edits?.length
    ? 'The thesis fixes such graphs by manual editing: edit the courses stage further or undo the last edit.'
    : 'The thesis fixes such graphs by manual editing, which needs a courses stage saved by a successful build; try another angle tolerance or result count, or the project alignment method.';
  const crossings = crossingPairs(
    primalVertices,
    edges.map((e) => [e.a, e.b])
  );
  if (crossings.length)
    throw new Error(
      `The connection rules produced crossing edges (${crossings.length}${crossings.length >= 50 ? '+' : ''}); this graph cannot be read as loops. ${fixHint}`
    );
  // Faces of the plane graph in the rotated chart; the outer face has negative area.
  const around: number[][] = finals.map(() => []);
  for (const e of edges) {
    around[e.a]!.push(e.b);
    around[e.b]!.push(e.a);
  }
  around.forEach((list, v) =>
    list.sort(
      (a, b) =>
        Math.atan2(rotated[a]![1] - rotated[v]![1], rotated[a]![0] - rotated[v]![0]) -
        Math.atan2(rotated[b]![1] - rotated[v]![1], rotated[b]![0] - rotated[v]![0])
    )
  );
  const slot = around.map((list) => new Map(list.map((w, k) => [w, k])));
  const visited = new Set<string>(),
    cycles: number[][] = [];
  around.forEach((list, v) => {
    for (const w of list) {
      if (visited.has(`${v}>${w}`)) continue;
      const cycle: number[] = [];
      let a = v,
        b = w;
      while (!visited.has(`${a}>${b}`)) {
        visited.add(`${a}>${b}`);
        cycle.push(a);
        const ring = around[b]!,
          c = ring[(slot[b]!.get(a)! - 1 + ring.length) % ring.length]!;
        a = b;
        b = c;
      }
      let area = 0;
      cycle.forEach((p, k) => {
        const q = cycle[(k + 1) % cycle.length]!;
        area += rotated[p]![0] * rotated[q]![1] - rotated[q]![0] * rotated[p]![1];
      });
      if (area > 0) cycles.push(cycle);
    }
  });
  const faces = cycles.map((vertices) => {
    const kinds = vertices.map((a, k) =>
      edgeKind.get(key(a, vertices[(k + 1) % vertices.length]!))!
    );
    const weft = kinds.filter((k) => k === 'weft').length;
    let kind: FaceKind = 'other',
      bottom: number | undefined,
      top: number | undefined;
    const edgeAt = (k: number) => key(vertices[k]!, vertices[(k + 1) % vertices.length]!);
    const height = (k: number) => rv(vertices[k]!) + rv(vertices[(k + 1) % vertices.length]!);
    const wefts = kinds.flatMap((x, k) => (x === 'weft' ? [k] : []));
    if (vertices.length === 4 && weft === 2 && kinds[0] !== kinds[1] && kinds[1] !== kinds[2])
      kind = 'quad';
    else if (vertices.length === 3 && weft === 2) kind = 'short-row';
    else if (vertices.length === 3 && weft === 1) {
      const k = wefts[0]!,
        apex = vertices[(k + 2) % 3]!;
      kind = height(k) / 2 > rv(apex) ? 'increase' : 'decrease';
    }
    if (kind === 'quad' || kind === 'short-row') {
      const [k0, k1] = wefts as [number, number];
      [bottom, top] = height(k0) < height(k1) ? [k0, k1] : [k1, k0];
    } else if (kind === 'increase') top = wefts[0];
    else if (kind === 'decrease') bottom = wefts[0];
    return {
      vertices,
      kind,
      bottom: bottom === undefined ? undefined : edgeAt(bottom),
      top: top === undefined ? undefined : edgeAt(top),
      warps: kinds.flatMap((x, k) => (x === 'warp' ? [edgeAt(k)] : [])),
      across: vertices.reduce((s, v) => s + finals[v]!.across, 0) / vertices.length,
      height: vertices.reduce((s, v) => s + rv(v), 0) / vertices.length,
    };
  });
  const other = faces.filter((f) => f.kind === 'other').length;
  if (other)
    throw new Error(
      `${other} face${other === 1 ? ' is' : 's are'} neither a loop quad nor a shaping triangle; this graph cannot be read as loops. ${fixHint}`
    );
  // Loop dual: a parent shares the loop's bottom weft edge. A course is a weft chain, continued through
  // each vertex by the straightest arriving/leaving pair (project reading of Fig. 6.8); a loop belongs
  // to the chain along its top edge, and a decrease triangle to its nearer row neighbour's course.
  const byWarp = new Map<string, number[]>(),
    byTop = new Map<string, number>();
  faces.forEach((f, i) => {
    for (const w of f.warps) byWarp.set(w, [...(byWarp.get(w) ?? []), i]);
    if (f.top) byTop.set(f.top, i);
  });
  const weftEdges = segments.flatMap((s) =>
    s.finals.slice(1).map((b, k) => [s.finals[k]!, b] as [number, number])
  );
  const chain = weftEdges.map((_, i) => i),
    root = (a: number): number => (chain[a] === a ? a : (chain[a] = root(chain[a]!)));
  const arriving = new Map<number, number[]>(),
    leaving = new Map<number, number[]>();
  weftEdges.forEach(([a, b], i) => {
    leaving.set(a, [...(leaving.get(a) ?? []), i]);
    arriving.set(b, [...(arriving.get(b) ?? []), i]);
  });
  const direction = (i: number) => sub(pos(weftEdges[i]![1]), pos(weftEdges[i]![0]));
  for (const [x, ins] of arriving) {
    const pairs = ins
      .flatMap((i) =>
        (leaving.get(x) ?? []).map((o) => ({ i, o, turn: angle(direction(i), direction(o)) }))
      )
      .sort((p, q) => p.turn - q.turn || p.i - q.i || p.o - q.o);
    const done = new Set<number>();
    for (const { i, o } of pairs)
      if (!done.has(i) && !done.has(-1 - o)) {
        done.add(i).add(-1 - o);
        chain[root(o)] = root(i);
      }
  }
  const edgeIndex = new Map(weftEdges.map(([a, b], i) => [key(a, b), i]));
  const faceRow = faces.map((f, i) => (f.top ? root(edgeIndex.get(f.top)!) : -1 - i));
  faces.forEach((f, i) => {
    if (f.kind !== 'decrease') return;
    const near = f.warps
      .flatMap((w) => byWarp.get(w) ?? [])
      .filter((g) => g !== i && faces[g]!.top)
      .sort(
        (a, b) =>
          Math.abs(faces[a]!.across - f.across) - Math.abs(faces[b]!.across - f.across) ||
          faces[a]!.across - faces[b]!.across
      )[0];
    if (near !== undefined) faceRow[i] = faceRow[near]!;
  });
  // Loops on the first leaf chain form the cast-on course (project reading; short rows start after it).
  const castOn = new Set(
    segmentPaths
      .flatMap((path, k) => (path.every((i) => V[i]!.position === 0) ? [k] : []))
      .flatMap((k) => segments[k]!.finals.slice(1).map((b, i) => key(segments[k]!.finals[i]!, b)))
  );
  faces.forEach((f, i) => {
    if (f.bottom && castOn.has(f.bottom)) faceRow[i] = -1 - faces.length;
  });
  const find = (face: number) => faceRow[face]!;
  const parents: number[][] = faces.map((f) => {
    const g = f.bottom === undefined ? undefined : byTop.get(f.bottom);
    return g === undefined ? [] : [g];
  });
  const childOf = new Map<number, number>();
  parents.forEach((list, child) => list.forEach((p) => childOf.set(p, child)));
  faces.forEach((f, i) => {
    if (f.kind !== 'decrease') return;
    const neighbours = f.warps
      .flatMap((w) => byWarp.get(w) ?? [])
      .filter((g) => g !== i)
      .sort(
        (a, b) =>
          Math.abs(faces[a]!.across - f.across) - Math.abs(faces[b]!.across - f.across) ||
          faces[a]!.across - faces[b]!.across
      );
    for (const g of neighbours) {
      const child = childOf.get(g);
      if (child !== undefined) {
        parents[child]!.push(i);
        break;
      }
    }
  });
  // Rows in a topological order of their parent links; ties by chart height, then across.
  const rows = new Map<number, number[]>();
  faces.forEach((_, i) => rows.set(find(i), [...(rows.get(find(i)) ?? []), i]));
  const ids = [...rows.keys()],
    rank = (r: number) => {
      const list = rows.get(r)!;
      return [
        Math.min(...list.map((i) => faces[i]!.height)),
        Math.min(...list.map((i) => faces[i]!.across)),
      ];
    };
  const next = new Map(ids.map((r) => [r, new Set<number>()])),
    indegree = new Map(ids.map((r) => [r, 0]));
  parents.forEach((list, child) =>
    list.forEach((p) => {
      const a = find(p),
        b = find(child);
      if (a === b)
        throw new Error(
          'A loop and its parent lie in one course; this graph cannot be knitted as courses.'
        );
      if (!next.get(a)!.has(b)) {
        next.get(a)!.add(b);
        indegree.set(b, indegree.get(b)! + 1);
      }
    })
  );
  const ready = ids.filter((r) => !indegree.get(r)),
    order: number[] = [];
  const before = (a: number, b: number) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0]! - y[0]! || x[1]! - y[1]!;
  };
  while (ready.length) {
    ready.sort(before);
    const r = ready.shift()!;
    order.push(r);
    for (const b of next.get(r)!) {
      indegree.set(b, indegree.get(b)! - 1);
      if (!indegree.get(b)) ready.push(b);
    }
  }
  if (order.length !== ids.length) throw new Error('Cyclic course order in the loop dual.');
  if (order.length > 600) throw new Error('Shaping exceeds the 600 pass limit.');
  const loopId = new Map<number, string>(),
    stageRows: KnitStageCourse[] = [],
    placed: { face: number; course: number }[] = [];
  order.forEach((r, course) => {
    const list = rows
      .get(r)!
      .sort((a, b) => faces[a]!.across - faces[b]!.across || faces[a]!.height - faces[b]!.height);
    if (list.length > 600) throw new Error('Shaping exceeds the 600 needle limit.');
    list.forEach((f, i) => {
      loopId.set(f, `shape:${course}:${i}`);
      placed.push({ face: f, course });
    });
    const extreme = (f: number, sign: 1 | -1) =>
      faces[f]!.vertices.reduce((best, v) =>
        sign * (finals[v]!.across - finals[best]!.across) > 0 ? v : best
      );
    const first = faces[list[0]!]!,
      final = faces[list.at(-1)!]!;
    stageRows.push({
      vertices: [],
      points: [
        stagePoint(finals[extreme(list[0]!, -1)]!),
        ...list.map((f) => stagePoint(centroid(faces[f]!.vertices))),
        stagePoint(finals[extreme(list.at(-1)!, 1)]!),
      ],
      leftBoundary: first.vertices.some((v) => finals[v]!.contour === 0),
      rightBoundary: final.vertices.some((v) => finals[v]!.contour === columns),
    });
  });
  function centroid(list: number[]): ShapePoint {
    const uv: [number, number] = [0, 0];
    let across = 0;
    for (const v of list) {
      uv[0] += finals[v]!.uv[0] / list.length;
      uv[1] += finals[v]!.uv[1] / list.length;
      across += finals[v]!.across / list.length;
    }
    return { uv, position: evaluateSurface(surface, 0, uv[0], uv[1]), across };
  }
  const roleOf: Record<Exclude<FaceKind, 'other'>, KnitLoopRole> = {
    quad: 'loop',
    'short-row': 'short-row',
    increase: 'increase',
    decrease: 'decrease',
  };
  return {
    stage: 'loops',
    fingerprint,
    method: POPESCU_METHOD,
    loops: placed.map(({ face, course }) => ({
      ...stagePoint(centroid(faces[face]!.vertices)),
      id: loopId.get(face)!,
      course,
      role: roleOf[faces[face]!.kind as Exclude<FaceKind, 'other'>],
      parents: parents[face]!.map((p) => loopId.get(p)!),
    })),
    rows: stageRows,
    primal: {
      vertices: primalVertices,
      edges,
      faces: faces.map((f, i) => ({ vertices: f.vertices, kind: f.kind, loop: loopId.get(i)! })),
    },
  };
}
