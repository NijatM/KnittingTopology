// Original-chart containment with a local anisotropic loop metric. Project mapping, not geodesic distance.
import type {
  GenerationContext,
  KnitSettings,
  PatternGraph,
  SurfaceSpec,
  Vec2,
  Vec3,
} from '../core/types';
import { evaluateSurface, projectToSurface } from '../core/surfaces';
import { extraordinaryNodeIds } from '../core/diagnostics';
import { assignCells, SOURCE, type Raster } from './rasterize';
import { structuresForKey } from './structures';
import type { Key } from './keys';
import type { Gauge } from './gauge';
import type { ShapeCourse, ShapePlacement } from './shape-types';
import { imageIndex } from './grid';
import type { KnitMapping } from './mapping';
import { hasRectangularMapping } from '../import/uv-mapping';

export type Metric = [number, number, number, number];
/** Explicit chart for a cut closed surface: one polygon per source cell, and one or more
 * copies per source edge and node (cut copies lie on both sides of a seam). */
export interface NetworkChart {
  method: string;
  cells: Vec2[][];
  edges: Vec2[][][];
  nodes: Vec2[][];
  /** Loop position in the [0,1]^2 chart and its chart-to-loop linear map. */
  loop(p: ShapePlacement): { uv: Vec2; metric: Metric };
  toSurface(uv: Vec2): Vec3;
  toGrid(p: Vec3): Vec2;
  /** The chart repeats with period 1 in u; shapes are also tested shifted by -1 and +1. */
  periodic?: boolean;
  /** Report line on how network marks are placed. */
  marks?: string;
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a);
  if (!(n > 1e-14)) throw new Error('Degenerate local loop frame.');
  return a.map((x) => x / n) as Vec3;
};
function inside(p: Vec2, poly: Vec2[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
function bounds(points: Vec2[]): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
export function rasterizeSurfaceNetwork(
  graph: PatternGraph,
  surface: SurfaceSpec,
  layout: { w: number; h: number; placements: readonly ShapePlacement[]; courses?: ShapeCourse[] },
  settings: KnitSettings,
  key: Key,
  gauge: Gauge | null,
  context?: GenerationContext,
  chart?: NetworkChart
): Raster {
  const { w, h, placements } = layout,
    issues: string[] = [];
  const library = structuresForKey(key, settings.tiles, settings.keys),
    structures: Raster['structures'] = [],
    slots = new Map<string, number>(),
    unknown = new Set<string>();
  const resolve = (id: string) => {
    let s = library.find((x) => x.id === id);
    if (!s) {
      unknown.add(id);
      s = library.find((x) => x.id === settings.cells.fill) ?? library[0]!;
    }
    let i = slots.get(s.id);
    if (i === undefined) {
      i = structures.length;
      structures.push(s);
      slots.set(s.id, i);
    }
    return i;
  };
  const structure = new Uint16Array(w * h).fill(resolve(settings.cells.fill)),
    kind = new Uint8Array(w * h),
    element = new Int32Array(w * h).fill(-1);
  // Use chart identities, not a nearest-3D projection at coincident or intersecting chart locations.
  const chartPoints = new Map<Vec3, Vec2>();
  for (const n of [...graph.nodes, ...(graph.coarseTopology?.nodes ?? [])])
    chartPoints.set(n.position, n.attachment.uv);
  const uvOf = (p: Vec3) => chartPoints.get(p) ?? projectToSurface(surface, p, 0).attachment.uv;
  const nodes = new Map(graph.nodes.map((n) => [n.id, n.attachment.uv]));
  // Supplied-chart edges are canonically UV-straight; their 3D crossing samples can be ambiguous in 3D.
  const edgeLines: Vec2[][][] =
    chart?.edges ??
    graph.edges.map((e) => [
      !hasRectangularMapping(surface) && e.path && e.path.length >= 2
        ? e.path.map(uvOf)
        : [nodes.get(e.a)!, nodes.get(e.b)!],
    ]);
  const nodeCopies: Vec2[][] = chart?.nodes ?? graph.nodes.map((n) => [nodes.get(n.id)!]);
  const edgeIndex = new Map(
    graph.edges.map((e, i) => [e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`, i])
  );
  const polys =
    chart?.cells ??
    graph.cells.map((c) =>
      c.nodes.flatMap((a, i) => {
        const b = c.nodes[(i + 1) % c.nodes.length]!,
          ei = edgeIndex.get(a < b ? `${a}|${b}` : `${b}|${a}`);
        if (ei === undefined) return [nodes.get(a)!];
        const line = edgeLines[ei]![0]!;
        return (graph.edges[ei]!.a === a ? line : [...line].reverse()).slice(0, -1);
      })
    );
  const uvMapping: KnitMapping = {
    needles: w,
    passes: h,
    method: chart?.method ?? 'original chart UV',
    toGrid: chart?.toGrid ?? uvOf,
    toSurface: chart?.toSurface ?? (([u, v]) => evaluateSurface(surface, 0, u, v)),
  };
  // Coarse cells can cross a cut seam, where one chart position per coarse node is not enough.
  const cellSettings =
    chart && settings.cells.rule.kind === 'coarse'
      ? { ...settings, cells: { ...settings.cells, rule: { kind: 'uniform' as const } } }
      : settings;
  if (cellSettings !== settings)
    issues.push('Coarse rule is not available on a cut closed surface yet; cells use the fill.');
  const cellStructure = assignCells(
    graph,
    polys.map((p) => p.flat()),
    uvMapping,
    cellSettings,
    issues
  );
  const side = Math.min(128, Math.max(8, Math.ceil(Math.sqrt(placements.length)))),
    buckets: number[][] = Array.from({ length: side * side }, () => []);
  const bin = (x: number) => Math.max(0, Math.min(side - 1, Math.floor(x * side)));
  const metrics: Metric[] = [],
    loopUV: Vec2[] = [];
  // Search padding per chart axis: the chart extent of a mark around any loop.
  let padU = 0,
    padV = 0,
    work = 0;
  const tick = () => {
    if (++work > 50_000_000)
      throw new Error(
        'Surface rasterization work limit exceeded. Reduce network density, program size or mark widths.'
      );
    if ((work & 1023) === 0 && context?.cancelled?.()) {
      const e = new Error('Surface rasterization cancelled.');
      e.name = 'AbortError';
      throw e;
    }
  };
  const maxMark = Math.max(
    settings.edges.structure ? settings.edges.width / 2 : 0,
    settings.nodes.structure || settings.nodes.extraordinary ? settings.nodes.size / 2 : 0
  );
  placements.forEach((p, i) => {
    tick();
    const local = chart?.loop(p),
      [u, v] = local?.uv ?? p.loop.uv;
    if (![u, v].every(Number.isFinite) || u < 0 || u > 1 || v < 0 || v > 1)
      throw new Error('Surface rasterization requires original UV in [0,1].');
    buckets[bin(v) * side + bin(u)]!.push(i);
    loopUV.push([u, v]);
    let m: Metric;
    if (local) m = local.metric;
    else if (!gauge) {
      const e = settings.startEdge ?? 'v0';
      m =
        e === 'v0'
          ? [w, 0, 0, h]
          : e === 'u1'
            ? [0, w, -h, 0]
            : e === 'v1'
              ? [-w, 0, 0, -h]
              : [0, -w, h, 0];
    } else {
      const eps = 1e-5;
      const derivative = (axis: 0 | 1): Vec3 => {
        const a: Vec2 = [u, v],
          b: Vec2 = [u, v];
        a[axis] = Math.max(0, a[axis] - eps);
        b[axis] = Math.min(1, b[axis] + eps);
        return sub(evaluateSurface(surface, 0, ...b), evaluateSurface(surface, 0, ...a)).map(
          (x) => x / (b[axis] - a[axis])
        ) as Vec3;
      };
      const du = derivative(0),
        dv = derivative(1),
        points = layout.courses?.[p.course]?.points;
      let tangent: Vec3;
      if (points && points.length > 1) {
        let k = 1;
        while (k < points.length - 1 && points[k]!.across < p.loop.across) k++;
        tangent = sub(points[k]!.position, points[k - 1]!.position);
      } else tangent = du;
      const x = unit(tangent),
        e = settings.startEdge ?? 'v0';
      const hint =
        e === 'v0'
          ? dv
          : e === 'u1'
            ? (du.map((x) => -x) as Vec3)
            : e === 'v1'
              ? (dv.map((x) => -x) as Vec3)
              : du;
      const y = unit(hint.map((q, k) => q - dot(hint, x) * x[k]!) as Vec3);
      m = [
        dot(du, x) / gauge.stitchWidth,
        dot(dv, x) / gauge.stitchWidth,
        dot(du, y) / gauge.courseHeight,
        dot(dv, y) / gauge.courseHeight,
      ];
    }
    const det = m[0] * m[3] - m[1] * m[2];
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12)
      throw new Error('Degenerate local UV-to-loop metric.');
    // Hit tests allow 1e-9 loops beyond a mark; the reach keeps a margin above that.
    const reach = maxMark + 1e-6;
    padU = Math.max(padU, (reach * (Math.abs(m[3]) + Math.abs(m[1]))) / Math.abs(det));
    padV = Math.max(padV, (reach * (Math.abs(m[2]) + Math.abs(m[0]))) / Math.abs(det));
    metrics.push(m);
  });
  // A periodic chart tests every shape at u shifts -1, 0 and +1; `fn` gets the shift.
  const shifts = chart?.periodic ? [-1, 0, 1] : [0];
  const visit = (
    box: [number, number, number, number],
    pad: [number, number],
    fn: (p: ShapePlacement, li: number, i: number, shift: number) => void
  ) => {
    const [pu, pv] = pad;
    for (const shift of shifts) {
      const x0 = box[0] + shift,
        x1 = box[2] + shift,
        [, y0, , y1] = box;
      if (x1 + pu < 0 || x0 - pu > 1) continue;
      for (let by = bin(y0 - pv); by <= bin(y1 + pv); by++)
        for (let bx = bin(x0 - pu); bx <= bin(x1 + pu); bx++)
          for (const li of buckets[by * side + bx]!) {
            tick();
            const p = placements[li]!,
              uv = loopUV[li]!;
            if (uv[0] >= x0 - pu && uv[0] <= x1 + pu && uv[1] >= y0 - pv && uv[1] <= y1 + pv)
              fn(p, li, imageIndex(w, h, p.needle, p.course), shift);
          }
    }
  };
  polys.forEach((poly, ci) => {
    const slot = resolve(cellStructure[ci]!);
    visit(bounds(poly), [0, 0], (_p, li, i, shift) => {
      const [u, v] = loopUV[li]!;
      if (kind[i] === SOURCE.background && inside([u - shift, v], poly)) {
        structure[i] = slot;
        kind[i] = SOURCE.cell;
        element[i] = ci;
      }
    });
  });
  if (chart?.periodic) {
    // Cells tile a closed surface. A loop on a shared outline can be missed by both cells through
    // rounding; it takes the cell with the nearest outline.
    let missed = 0;
    placements.forEach((p, li) => {
      const i = imageIndex(w, h, p.needle, p.course);
      if (kind[i] !== SOURCE.background) return;
      const [u, v] = loopUV[li]!;
      let best = Infinity,
        cell = -1;
      polys.forEach((poly, ci) => {
        for (const shift of shifts)
          poly.forEach((a, k) => {
            tick();
            const b = poly[(k + 1) % poly.length]!,
              dx = b[0] - a[0],
              dy = b[1] - a[1],
              x = u - shift - a[0],
              y = v - a[1],
              t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1))),
              d = Math.hypot(x - t * dx, y - t * dy);
            if (d < best) {
              best = d;
              cell = ci;
            }
          });
      });
      if (cell < 0) return;
      structure[i] = resolve(cellStructure[cell]!);
      kind[i] = SOURCE.cell;
      element[i] = cell;
      missed++;
    });
    if (missed)
      issues.push(
        `${missed} loops lie on cell outlines and take the cell with the nearest outline.`
      );
  }
  // `shift` moves the chart point q by whole periods.
  const metricPoint = (q: Vec2, p: Vec2, m: Metric, shift = 0): Vec2 => [
    m[0] * (q[0] + shift - p[0]) + m[1] * (q[1] - p[1]),
    m[2] * (q[0] + shift - p[0]) + m[3] * (q[1] - p[1]),
  ];
  if (settings.edges.structure) {
    const slot = resolve(settings.edges.structure),
      r = settings.edges.width / 2;
    graph.edges.forEach((edge, ei) => {
      if (edge.cells.length < 2 && !settings.edges.boundary) return;
      for (const line of edgeLines[ei]!)
        for (let s = 1; s < line.length; s++)
          visit(bounds([line[s - 1]!, line[s]!]), [padU, padV], (_p, li, i, shift) => {
            let a = metricPoint(line[s - 1]!, loopUV[li]!, metrics[li]!, shift),
              b = metricPoint(line[s]!, loopUV[li]!, metrics[li]!, shift);
            if (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1])) [a, b] = [b, a];
            const dx = b[0] - a[0],
              dy = b[1] - a[1],
              len = Math.hypot(dx, dy),
              t = len ? (-a[0] * dx - a[1] * dy) / (len * len) : 0;
            const hit =
              len && t >= 0 && t <= 1
                ? (dx * -a[1] - dy * -a[0]) / len > -r + 1e-9 &&
                  (dx * -a[1] - dy * -a[0]) / len <= r + 1e-9
                : Math.hypot(...(t > 1 ? b : a)) < r;
            if (hit) {
              structure[i] = slot;
              kind[i] = SOURCE.edge;
              element[i] = ei;
            }
          });
    });
  }
  const boundary = new Set(
      graph.edges.filter((e) => e.cells.length < 2).flatMap((e) => [e.a, e.b])
    ),
    special = extraordinaryNodeIds(graph, surface);
  graph.nodes.forEach((node, ni) => {
    if (boundary.has(node.id) && !settings.edges.boundary) return;
    const odd = special.has(node.id),
      id = (odd && settings.nodes.extraordinary) || settings.nodes.structure;
    if (!id) return;
    const slot = resolve(id),
      r = settings.nodes.size / 2;
    for (const uv of nodeCopies[ni]!)
      visit([uv[0], uv[1], uv[0], uv[1]], [padU, padV], (_p, li, i, shift) => {
        const [x, y] = metricPoint(uv, loopUV[li]!, metrics[li]!, shift);
        if (x >= -r - 1e-9 && x < r - 1e-9 && y >= -r - 1e-9 && y < r - 1e-9) {
          structure[i] = slot;
          kind[i] = odd && settings.nodes.extraordinary ? SOURCE.extraordinary : SOURCE.node;
          element[i] = ni;
        }
      });
  });
  if (unknown.size)
    issues.push(`Unknown structures: ${[...unknown].join(', ')}; fill used instead.`);
  issues.push(
    chart
      ? (chart.marks ??
          'Network marks use the flat-net position and the uniform needle/pass grid; cut edges and nodes are drawn on both seam sides.')
      : 'Network marks use an original-UV local loop metric; widths on curved charts are sampled approximations, not geodesic guarantees.'
  );
  return { w, h, structure, kind, element, structures, cellStructure, issues };
}
