import { describe, it, expect } from 'vitest';
import type {
  KnitSettings,
  PatternFamily,
  PatternGraph,
  SurfaceSpec,
  Vec3,
} from '../../src/core/types';
import { createProject } from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import { cutSourceSignature } from '../../src/knit/cuts';
import { sphereMeridianCut } from '../../src/knit/cut-presets';
import { orientedEdgePath } from '../../src/knit/cut-types';
import {
  layoutSphere,
  sphereChart,
  sphereCutPath,
  type SphereCut,
} from '../../src/knit/sphere-knit';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings } from '../../src/knit/settings';
import { knitReport } from '../../src/knit/report';
import { SOURCE } from '../../src/knit/rasterize';

type Net = { surface: SurfaceSpec; graph: PatternGraph };
function network(family: PatternFamily, spacing: number, size = 0.12): Net {
  const surface: SurfaceSpec = {
    kind: 'sphere',
    size,
    curvature: 0,
    revision: `sphere:${family}:${spacing}:${size}`,
  };
  const p = createProject();
  return {
    surface,
    graph: generatePattern({
      ...p,
      surface,
      parameters: { ...p.parameters, family, spacing, relaxation: 0 },
    }).graph,
  };
}
const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
const cutSettings = (net: Net, edgeIds = sphereMeridianCut(net.surface, net.graph)) => ({
  surfaceRevision: net.surface.revision,
  sourceSignature: cutSourceSignature(net.surface, net.graph),
  preset: 'sphere-meridian' as const,
  edgeIds: [...edgeIds].sort(),
});
function build(net: Net, changes: Partial<KnitSettings> = {}, edgeIds?: string[]) {
  return buildKnitProgram({
    ...net,
    swatches,
    knit: { ...defaultKnitSettings(), mode: 'shape', cut: cutSettings(net, edgeIds), ...changes },
  });
}
function program(net: Net, changes: Partial<KnitSettings> = {}, edgeIds?: string[]) {
  const r = build(net, changes, edgeIds);
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
const NO_MARKS = {
  edges: { structure: null, width: 2, boundary: false },
  nodes: { structure: null, size: 3, extraordinary: null },
};
/** One straight meridian from pole to pole, for layouts that do not depend on a network. */
const MERIDIAN: SphereCut = {
  edges: [{ id: 'm', top: Math.PI / 2, bottom: -Math.PI / 2 }],
  samples: [
    { lat: Math.PI / 2, lon: 0 },
    { lat: -Math.PI / 2, lon: 0 },
  ],
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Winding of a closed outline around p, seen along the outward normal at p (radians). */
function winding(p: Vec3, outline: Vec3[]) {
  const n = p.map((x) => x / Math.hypot(...p)) as Vec3,
    e1 = cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n),
    e2 = cross(n, e1);
  const angle = (q: Vec3) => {
    const d = sub(q, p);
    return Math.atan2(dot(d, e2), dot(d, e1));
  };
  let total = 0;
  outline.forEach((q, i) => {
    const a = angle(q),
      b = angle(outline[(i + 1) % outline.length]!);
    let d = b - a;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    total += d;
  });
  return total;
}
function segmentDistance(p: Vec3, a: Vec3, b: Vec3) {
  const ab = sub(b, a),
    t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return Math.hypot(...sub(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]));
}
function outlines(graph: PatternGraph): Vec3[][] {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n.position])),
    edges = new Map(graph.edges.map((e) => [e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`, e]));
  return graph.cells.map((c) =>
    c.nodes.flatMap((a, i) => {
      const b = c.nodes[(i + 1) % c.nodes.length]!,
        e = edges.get(a < b ? `${a}|${b}` : `${b}|${a}`);
      if (!e) return [nodes.get(a)!];
      // Network edges are great-circle arcs between samples; follow them closely.
      const p = orientedEdgePath(e, nodes.get(a)!, nodes.get(b)!);
      return p.slice(0, -1).flatMap((q, i) =>
        Array.from({ length: 16 }, (_, k) => {
          const x = q.map((c, d) => c + ((p[i + 1]![d]! - c) * k) / 16) as Vec3,
            r = Math.hypot(...q) / Math.hypot(...x);
          return x.map((c) => c * r) as Vec3;
        })
      );
    })
  );
}
/** Loop index of every placement on its own needle. */
function loopIndex(placements: { needle: number; course: number }[]) {
  const seen = new Map<number, number>();
  return placements.map((p) => {
    const m = seen.get(p.needle) ?? 0;
    seen.set(p.needle, m + 1);
    return m;
  });
}

describe('sphere cut', () => {
  it.each(['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)(
    'accepts the meridian preset on %s as one descending path',
    (family) => {
      for (const spacing of [0.02, 0.04, 0.05]) {
        const net = network(family, spacing),
          cut = sphereCutPath(net.surface, net.graph, sphereMeridianCut(net.surface, net.graph));
        for (let i = 1; i < cut.samples.length; i++)
          expect(cut.samples[i]!.lat).toBeLessThan(cut.samples[i - 1]!.lat);
      }
    }
  );

  it('refuses branched, partial and climbing cuts', () => {
    const net = network('quad', 0.04),
      preset = sphereMeridianCut(net.surface, net.graph),
      edges = new Map(net.graph.edges.map((e) => [e.id, e]));
    const first = edges.get(preset[0]!)!,
      second = edges.get(preset[1]!)!,
      joint = [first.a, first.b].find((n) => n === second.a || n === second.b)!,
      extra = net.graph.edges.find(
        (e) => !preset.includes(e.id) && (e.a === joint || e.b === joint)
      )!;
    expect(() => sphereCutPath(net.surface, net.graph, [...preset, extra.id])).toThrow(/branches/);
    expect(() => sphereCutPath(net.surface, net.graph, preset.slice(0, -1))).toThrow(
      /highest network node to a lowest/
    );
    // Eight cube corners: four tie at the top, so an edge between two of them is level, then bulges.
    const corners = network('quad', 0.05),
      z = new Map(corners.graph.nodes.map((n) => [n.id, n.position[2]])),
      top = corners.graph.edges.find((e) => z.get(e.a)! > 0 && z.get(e.b)! > 0)!,
      down = corners.graph.edges.find(
        (e) => (e.a === top.b && z.get(e.b)! < 0) || (e.b === top.b && z.get(e.a)! < 0)
      )!;
    expect(() => sphereCutPath(corners.surface, corners.graph, [top.id, down.id])).toThrow(
      /climbs or runs level/
    );
    const branched = build(net, {}, [...preset, extra.id]);
    expect(branched.ok).toBe(false);
  });
});

describe('sphere layout', () => {
  it.each([
    [0.18, 0.006, 0.004, 3],
    [0.12, 0.006, 0.004, 3],
    [0.1, 0.0035, 0.0025, 3],
    [0.3, 0.005, 0.0035, 3.5],
    [0.05, 0.006, 0.004, 2],
  ] as const)(
    'spreads short rows evenly on a %s m sphere (%s × %s m loops)',
    (size, w, h, bound) => {
      for (const firstDir of [1, -1] as const) {
        const surface: SurfaceSpec = { kind: 'sphere', size, curvature: 0, revision: 's' };
        const { needles, layout } = layoutSphere(surface, MERIDIAN, w, h, firstDir, 'v0'),
          N = layout.needles,
          P = layout.passes;
        expect(N).toBe(Math.ceil((Math.PI * size) / 2 / w - 1e-10));
        expect(needles.yarnJumps).toBe(0);
        const passes: number[][] = Array.from({ length: N }, () => []);
        for (const p of needles.placements) passes[p.needle]!.push(p.course);
        const runs = Array.from({ length: P }, () => [Infinity, -Infinity]);
        for (const p of needles.placements) {
          runs[p.course]![0] = Math.min(runs[p.course]![0]!, p.needle);
          runs[p.course]![1] = Math.max(runs[p.course]![1]!, p.needle);
        }
        // Every run is unbroken, and only the end where the pass finishes changes.
        runs.forEach(([l, r], k) => {
          expect(needles.placements.filter((p) => p.course === k)).toHaveLength(r! - l! + 1);
          if (!k) return;
          const dir = firstDir * (k % 2 ? -1 : 1);
          expect(dir === 1 ? l : r).toBe(dir === 1 ? runs[k - 1]![0] : runs[k - 1]![1]);
        });
        const mid = (N - 1) / 2;
        for (let j = 0; j < N; j++) {
          expect(passes[j]!.length).toBe(layout.counts[j]);
          expect(Math.abs(layout.counts[j]! - layout.exact[j]!)).toBeLessThanOrEqual(1.5);
          expect(passes[j]![0]).toBe(0);
          expect(passes[j]!.at(-1)).toBe(P - 1);
          // A needle farther from the middle knits only passes its inner neighbour knits.
          const inner = j < mid ? j + 1 : j - 1;
          if (Math.abs(inner - mid) < Math.abs(j - mid) && j <= mid === inner <= mid) {
            const set = new Set(passes[inner]);
            expect(passes[j]!.every((k) => set.has(k))).toBe(true);
          }
        }
        expect(layout.maxCountError).toBeLessThanOrEqual(1.5);
        expect(layout.maxCourseDeviation).toBeLessThanOrEqual(bound);
        expect(layout.cutWander).toBe(0);
      }
    }
  );
});

describe('sphere knit program', () => {
  it.each(['v0', 'v1'] as const)(
    'builds an exportable shape program with needle 1 at the %s pole side',
    (startEdge) => {
      const net = network('quad', 0.04),
        p = program(net, { startEdge }),
        s = p.shape!,
        sp = s.sphere!;
      expect([p.w, p.h]).toEqual([32, 94]);
      expect(p.exportBlockers).toEqual([]);
      expect(s.needles.yarnJumps).toBe(0);
      expect(s.needles.moves).toEqual([]);
      expect(p.findings.some((f) => f.id === 'held')).toBe(true);
      // Every loop knits through the previous loop on its needle, held across skipped passes.
      const last = new Map<number, string>();
      for (const x of s.needles.placements) {
        expect(x.role).toBe('loop');
        expect(x.parents).toEqual(last.has(x.needle) ? [last.get(x.needle)] : []);
        last.set(x.needle, x.loop.id);
      }
      const zOf = (j: number) => s.needles.placements.find((x) => x.needle === j)!.loop.position[2];
      expect(Math.sign(zOf(0))).toBe(startEdge === 'v0' ? -1 : 1);
      expect(sp.poles.map((x) => x.pole)).toEqual(
        startEdge === 'v0' ? ['bottom', 'top'] : ['top', 'bottom']
      );
      // Needles and passes keep the outward orientation: no mirrored knit.
      const at = new Map(s.needles.placements.map((x) => [`${x.needle},${x.course}`, x])),
        index = loopIndex(s.needles.placements),
        next = new Map<string, Vec3>();
      s.needles.placements.forEach((x, i) => {
        const following = s.needles.placements.find(
          (y, k) => y.needle === x.needle && index[k] === index[i]! + 1
        );
        if (following) next.set(x.loop.id, following.loop.position);
      });
      let checked = 0;
      for (const x of s.needles.placements) {
        const right = at.get(`${x.needle + 1},${x.course}`),
          up = next.get(x.loop.id);
        if (!right || !up || x.needle !== 15) continue;
        const n = cross(sub(right.loop.position, x.loop.position), sub(up, x.loop.position));
        expect(dot(n, x.loop.position)).toBeGreaterThan(0);
        checked++;
      }
      expect(checked).toBeGreaterThan(50);
      // Seam: pass 1 and the last pass, every needle, opposite M4a sides of each cut edge.
      const [start, end] = sp.seam.sides;
      expect(start.loops).toHaveLength(32);
      expect(end.loops).toHaveLength(32);
      expect(start.loops.every((l) => l.course === 0)).toBe(true);
      expect(end.loops.every((l) => l.course === 93)).toBe(true);
      for (const id of sp.seam.sourceEdgeIds) {
        expect(start.cutSides[id]).toBeDefined();
        expect(start.cutSides[id]).not.toBe(end.cutSides[id]);
      }
      const covered = sp.seam.edges.flatMap((x) =>
        x.needles ? Array.from({ length: x.needles[1] - x.needles[0] + 1 }, (_, i) => i) : []
      );
      expect(covered.length).toBeLessThanOrEqual(32);
      const report = knitReport(p, 'sphere', net.surface.size);
      expect(report).toMatch(/Sphere opened from pole to pole/);
      expect(report).toMatch(/gathered closed/);
      expect(report).toMatch(/Loops per needle \(needle 1 first\): 6, /);
    }
  );

  it.each([
    ['quad', 0.04, 0.12],
    ['dual', 0.04, 0.12],
    ['ambo', 0.02, 0.12],
    ['kis', 0.05, 0.12],
    ['gyro', 0.04, 0.18],
    ['ambo', 0.05, 0.18],
  ] as const)(
    'places every loop in the %s (%s m spacing) cell that holds it on the sphere',
    (family, spacing, size) => {
      const net = network(family, spacing, size),
        cells = outlines(net.graph);
      // Chart outlines follow the edge arcs in short straight steps, so a loop this close to an
      // outline can fall in either neighbouring cell.
      let worst = 0;
      for (const startEdge of ['v0', 'v1'] as const) {
        const p = program(net, { mode: 'both', startEdge, ...NO_MARKS }),
          s = p.shape!;
        expect(p.exportBlockers).toEqual([]);
        s.needles.placements.forEach((x) => {
          const i = (p.h - 1 - x.course) * p.w + x.needle;
          expect(p.raster.kind[i]).toBe(SOURCE.cell);
          const cell = cells[p.raster.element[i]!]!,
            q = x.loop.position;
          if (Math.abs(winding(q, cell)) > Math.PI) return;
          worst = Math.max(
            worst,
            Math.min(...cell.map((a, k) => segmentDistance(q, a, cell[(k + 1) % cell.length]!)))
          );
        });
      }
      expect(worst).toBeLessThan(1e-5 * size);
    }
  );

  it('draws cut edges on both seam sides and a pole node around its pole edge', () => {
    const net = network('quad', 0.04),
      p = program(net, {
        mode: 'both',
        edges: { structure: 'tf', width: 2, boundary: false },
        nodes: { structure: 'tb', size: 2, extraordinary: null },
      }),
      s = p.shape!,
      sp = s.sphere!,
      index = loopIndex(s.needles.placements),
      ids = new Map(net.graph.edges.map((e, i) => [e.id, i]));
    expect(p.exportBlockers).toEqual([]);
    const kindAt = (x: { needle: number; course: number }) => (p.h - 1 - x.course) * p.w + x.needle;
    for (const edge of sp.seam.edges) {
      if (!edge.needles) continue;
      const ei = ids.get(edge.id)!,
        sides = new Set<string>();
      s.needles.placements.forEach((x, k) => {
        const i = kindAt(x);
        if (x.needle < edge.needles![0] || x.needle > edge.needles![1]) return;
        if (p.raster.kind[i] !== SOURCE.edge || p.raster.element[i] !== ei) return;
        if (index[k] === 0) sides.add('start');
        if (index[k] === sp.counts[x.needle]! - 1) sides.add('end');
      });
      expect([...sides].sort(), edge.id).toEqual(['end', 'start']);
    }
    const top = net.graph.nodes.reduce((a, b) => (b.position[2] > a.position[2] ? b : a)),
      ni = net.graph.nodes.indexOf(top);
    expect(Math.hypot(top.position[0], top.position[1])).toBeLessThan(1e-9);
    const pole = s.needles.placements.filter((x) => x.needle === p.w - 1);
    expect(pole.length).toBe(sp.counts.at(-1));
    for (const x of pole) {
      const i = kindAt(x);
      expect(p.raster.kind[i]).toBe(SOURCE.node);
      expect(p.raster.element[i]).toBe(ni);
    }
  });

  it('maps chart points back to the same surface point', () => {
    const net = network('dual', 0.04),
      cut = sphereCutPath(net.surface, net.graph, sphereMeridianCut(net.surface, net.graph)),
      { layout } = layoutSphere(net.surface, cut, 0.006, 0.004, 1, 'v0'),
      chart = sphereChart(net.surface, net.graph, cut, layout),
      R = net.surface.size / 2;
    for (let k = 0; k < 200; k++) {
      const lat = Math.asin(((k * 0.618034) % 2) - 1) * 0.999,
        lon = k * 2.399963,
        p: Vec3 = [
          R * Math.cos(lat) * Math.cos(lon),
          R * Math.cos(lat) * Math.sin(lon),
          R * Math.sin(lat),
        ],
        uv = chart.toGrid(p);
      expect(uv[0]).toBeGreaterThanOrEqual(0);
      expect(uv[0]).toBeLessThan(1);
      expect(Math.hypot(...sub(chart.toSurface(uv), p))).toBeLessThan(1e-12);
    }
  });

  it('refuses typed sizes, net start sides and a stale cut', () => {
    const net = network('quad', 0.04);
    const typed = build(net, {
      mode: 'network',
      size: { source: 'typed', needles: 50, passes: 50 },
    });
    expect(typed.ok).toBe(false);
    const side = build(net, { startEdge: 'u1' });
    expect(side.ok || side.reason).toMatch(/bottom or the top pole/);
    const stale = buildKnitProgram({
      surface: { ...net.surface, size: 0.15 },
      graph: net.graph,
      swatches,
      knit: { ...defaultKnitSettings(), mode: 'shape', cut: cutSettings(net) },
    });
    expect(stale.ok).toBe(false);
  });
});
