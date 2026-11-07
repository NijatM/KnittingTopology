import { describe, it, expect } from 'vitest';
import type { KnitSettings, PatternGraph, SurfaceSpec, Vec3 } from '../../src/core/types';
import { createProject } from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import { evaluateSurface } from '../../src/core/surfaces';
import { buildCutDisk, cutSourceSignature } from '../../src/knit/cuts';
import { cubeCrossCut } from '../../src/knit/cut-presets';
import {
  creaseKey,
  cubeNetFromCut,
  cubeNetPlacement,
  facesAt,
  faceUV,
  layoutCubeNet,
  netPoint,
} from '../../src/knit/cube-net';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings } from '../../src/knit/settings';
import { knitReport } from '../../src/knit/report';
import { SOURCE } from '../../src/knit/rasterize';

const surface: SurfaceSpec = { kind: 'cube', size: 0.12, curvature: 0, revision: 'cube-net' };
const graph: PatternGraph = generatePattern({
  ...createProject(),
  surface,
  parameters: { ...createProject().parameters, family: 'quad', spacing: 0.04, relaxation: 0 },
}).graph;
const nodes = new Map(graph.nodes.map((n) => [n.id, n.position]));
const creaseOfEdge = (e: PatternGraph['edges'][0]) => {
  const path = e.path && e.path.length >= 2 ? e.path : [nodes.get(e.a)!, nodes.get(e.b)!];
  const on = [0, 1, 2, 3, 4, 5].filter((f) => path.every((p) => facesAt(surface, p).includes(f)));
  return on.length === 2 ? creaseKey(on[0]!, on[1]!) : undefined;
};
const CREASES: string[] = [];
for (let a = 0; a < 6; a++)
  for (let b = a + 1; b < 6; b++) if (a >> 1 !== b >> 1) CREASES.push(creaseKey(a, b));
const cutFor = (creases: string[]) =>
  graph.edges.filter((e) => creases.includes(creaseOfEdge(e) ?? '')).map((e) => e.id);
const settingsFor = (edgeIds: string[]) => ({
  surfaceRevision: surface.revision,
  sourceSignature: cutSourceSignature(surface, graph),
  preset: 'manual' as const,
  edgeIds: [...edgeIds].sort(),
});
const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
function program(changes: Partial<KnitSettings> = {}, edgeIds = cubeCrossCut(surface, graph)) {
  const r = buildKnitProgram({
    surface,
    graph,
    swatches,
    knit: { ...defaultKnitSettings(), mode: 'shape', cut: settingsFor(edgeIds), ...changes },
  });
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
// Points along a crease, strictly between its corners.
const creaseSamples = (key: string): Vec3[] => {
  const [a, b] = key.split(',').map(Number) as [number, number],
    n = (f: number) => [0, 1, 2].map((k) => (k === f >> 1 ? (f % 2 ? -1 : 1) : 0));
  const axis = [0, 1, 2].find((k) => !n(a)[k] && !n(b)[k])!;
  return [-0.3, 0, 0.45].map(
    (t) => [0, 1, 2].map((k) => (k === axis ? t : n(a)[k]! + n(b)[k]!) * 0.06) as Vec3
  );
};

describe('cube flat net', () => {
  it('unfolds all 384 whole-crease cuts without overlap, keeping hinges continuous', () => {
    let trees = 0;
    const shapes = new Set<string>();
    for (let m = 0; m < 1 << 12; m++) {
      const hinges = CREASES.filter((_, i) => (m >> i) & 1);
      if (hinges.length !== 5) continue;
      const cut = CREASES.filter((k) => !hinges.includes(k));
      // The hinge set must connect all faces; otherwise the cut is not a tree.
      const seen = new Set([0]);
      for (let grow = true; grow;) {
        grow = false;
        for (const k of hinges) {
          const [a, b] = k.split(',').map(Number) as [number, number];
          if (seen.has(a) !== seen.has(b)) {
            seen.add(a).add(b);
            grow = true;
          }
        }
      }
      if (seen.size !== 6) {
        expect(() => cubeNetFromCut(surface, graph, cutFor(cut))).toThrow();
        continue;
      }
      trees++;
      const net = cubeNetFromCut(surface, graph, cutFor(cut));
      expect(new Set(net.faces.map((f) => f.cell.join())).size).toBe(6);
      expect(net.cols * net.rows).toBeGreaterThanOrEqual(6);
      // Every row and column of the net is one unbroken run of cells.
      const cells = net.faces.map((f) => f.cell);
      for (const axis of [0, 1])
        for (let line = 0; line < (axis ? net.rows : net.cols); line++) {
          const along = cells.filter((c) => c[axis] === line).map((c) => c[1 - axis]!);
          if (along.length) expect(Math.max(...along) - Math.min(...along) + 1).toBe(along.length);
        }
      // Net shape up to rotation and mirroring.
      const forms = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => {
        const q = cells.map(([x, y]) => {
          const r = t & 1 ? [y!, -x!] : [x!, y!],
            s = t & 2 ? [-r[0]!, -r[1]!] : r;
          return t & 4 ? [-s[0]!, s[1]!] : s;
        });
        const mx = Math.min(...q.map((c) => c[0]!)),
          my = Math.min(...q.map((c) => c[1]!));
        return q
          .map((c) => `${c[0]! - mx},${c[1]! - my}`)
          .sort()
          .join(' ');
      });
      shapes.add(forms.sort()[0]!);
      for (const key of CREASES) {
        const [a, b] = key.split(',').map(Number) as [number, number];
        for (const p of creaseSamples(key)) {
          const qa = netPoint(net, a, faceUV(surface, a, p)),
            qb = netPoint(net, b, faceUV(surface, b, p)),
            d = Math.hypot(qa[0] - qb[0], qa[1] - qb[1]);
          if (hinges.includes(key)) expect(d).toBeLessThan(1e-12);
          else expect(d).toBeGreaterThan(1e-3);
        }
      }
      // Isometry: unit face edges stay unit length in the net.
      for (let f = 0; f < 6; f++) {
        const p0 = netPoint(net, f, [0, 0]),
          p1 = netPoint(net, f, [1, 0]),
          p2 = netPoint(net, f, [0, 1]);
        expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])).toBeCloseTo(1, 12);
        expect(Math.hypot(p2[0] - p0[0], p2[1] - p0[1])).toBeCloseTo(1, 12);
        // Outward orientation is kept: no mirrored face.
        expect((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])).toBeCloseTo(
          1,
          12
        );
      }
      if (trees <= 12) expect(buildCutDisk(surface, graph, settingsFor(cutFor(cut))).ok).toBe(true);
    }
    expect(trees).toBe(384);
    expect(shapes.size).toBe(11);
  });

  it('rejects cuts through a face and partly cut creases', () => {
    const cross = cubeCrossCut(surface, graph),
      inner = graph.edges.find((e) => !creaseOfEdge(e))!;
    expect(() => cubeNetFromCut(surface, graph, [...cross, inner.id])).toThrow(
      /inside of a cube face/
    );
    const crease = creaseOfEdge(graph.edges.find((e) => cross.includes(e.id))!)!;
    const partial = cross.filter(
      (id) => creaseOfEdge(graph.edges.find((e) => e.id === id)!) !== crease
    );
    partial.push(
      cross.find((id) => creaseOfEdge(graph.edges.find((e) => e.id === id)!) === crease)!
    );
    expect(() => cubeNetFromCut(surface, graph, partial)).toThrow(/only partly cut/);
  });

  it('lays out the cross net with measured faces, stops and one-pass shifts', () => {
    const net = cubeNetFromCut(surface, graph, cubeCrossCut(surface, graph));
    // Root +Y has four hinges: a 4 × 3 cross with −Z at the bottom.
    expect([net.cols, net.rows, net.root]).toEqual([4, 3, 2]);
    const { needles, layout } = layoutCubeNet(surface, net, 0.006, 0.004, 1);
    expect([layout.needlesPerFace, layout.passesPerFace]).toEqual([20, 30]);
    expect([needles.w, needles.h]).toEqual([80, 90]);
    const width = (k: number) => needles.placements.filter((p) => p.course === k).length;
    expect([width(0), width(29), width(31), width(59), width(61), width(89)]).toEqual([
      20, 20, 80, 80, 20, 20,
    ]);
    // Passes 31 and 61 run left to right from where the yarn is: the left-side change waits one
    // pass, the right-side change at the far end does not.
    expect(layout.shifts).toEqual([
      { pass: 31, from: 0, to: 39, kind: 'late start' },
      { pass: 61, from: 0, to: 39, kind: 'extra course' },
    ]);
    expect(width(30)).toBe(40);
    expect(width(60)).toBe(60);
    expect(layout.stops).toEqual([
      { pass: 61, from: 0, to: 39 },
      { pass: 60, from: 60, to: 79 },
    ]);
    expect(needles.yarnJumps).toBe(0);
    expect(needles.moves).toEqual([]);
    // Every loop knits through its one parent below; new loops only where a needle starts.
    const byKey = new Map(needles.placements.map((p) => [`${p.needle},${p.course}`, p]));
    for (const p of needles.placements) {
      const below = byKey.get(`${p.needle},${p.course - 1}`);
      expect(p.parents).toEqual(below ? [below.loop.id] : []);
      expect(p.role).toBe(below || p.course === 0 ? 'loop' : 'edge increase');
      const f = p.loop.patch!;
      expect(evaluateSurface(surface, f, ...p.loop.uv)).toEqual(p.loop.position);
    }
    expect(needles.steps.filter((s) => s.role === 'edge increase')).toHaveLength(60);
  });

  it('builds an exportable shape program with seam loops on both sides', () => {
    const p = program();
    expect(p.exportBlockers).toEqual([]);
    const closed = p.shape!.closed!;
    expect(closed.seams).toHaveLength(7);
    const ids = new Set(p.shape!.needles.placements.map((x) => x.loop.id));
    for (const seam of closed.seams) {
      expect(seam.sourceEdgeIds.length).toBeGreaterThan(0);
      for (const side of seam.sides) {
        // Start/end sides list every wale (shifted = displaced by a pass); sides list passes (shifted = missing).
        if (side.kind === 'start' || side.kind === 'end') expect(side.loops).toHaveLength(20);
        else expect(side.loops.length + side.shifted).toBe(30);
        expect(side.loops.every((l) => ids.has(l.id))).toBe(true);
        expect(Object.keys(side.cutSides).sort()).toEqual([...seam.sourceEdgeIds].sort());
      }
      // The two seam sides take opposite M4a sides of each cut source edge.
      for (const id of seam.sourceEdgeIds)
        expect(seam.sides[0].cutSides[id]).not.toBe(seam.sides[1].cutSides[id]);
    }
    const report = knitReport(p, 'cube', surface.size);
    expect(report).toMatch(/Flat cube net/);
    expect(report).toMatch(/cast off/);
  });

  it.each(['v0', 'u1', 'v1', 'u0'] as const)('rotates the net for start edge %s', (startEdge) => {
    const p = program({ startEdge });
    const swap = startEdge === 'u1' || startEdge === 'u0';
    expect([p.w, p.h]).toEqual(swap ? [60, 120] : [80, 90]);
    expect(p.exportBlockers).toEqual([]);
    expect(p.shape!.needles.yarnJumps).toBe(0);
  });

  it('maps network cells onto the net and draws cut edges on both sides', () => {
    const p = program({
      mode: 'both',
      edges: { ...defaultKnitSettings().edges, structure: 'tf', width: 2 },
    });
    expect(p.exportBlockers).toEqual([]);
    const cells = new Set<number>(),
      edges = new Map<number, number>();
    for (let i = 0; i < p.raster.kind.length; i++) {
      if (p.raster.kind[i] === SOURCE.cell) cells.add(p.raster.element[i]!);
      if (p.raster.kind[i] === SOURCE.edge)
        edges.set(p.raster.element[i]!, (edges.get(p.raster.element[i]!) ?? 0) + 1);
    }
    expect(cells.size).toBe(graph.cells.length);
    const cut = new Set(cubeCrossCut(surface, graph));
    graph.edges.forEach((e, i) => {
      if (cut.has(e.id)) expect(edges.get(i) ?? 0, e.id).toBeGreaterThan(0);
    });
    // Cut edges have one flat-net copy per seam side; fold edges have one copy.
    const placed = cubeNetPlacement(surface, graph, cubeNetFromCut(surface, graph, [...cut]));
    graph.edges.forEach((e, i) => {
      const crease = creaseOfEdge(e);
      expect(placed.edges[i], e.id).toHaveLength(cut.has(e.id) ? 2 : 1);
      if (crease && !cut.has(e.id)) expect(placed.edges[i]).toHaveLength(1);
    });
  });

  it('refuses a stale cut and typed network sizes', () => {
    const r = buildKnitProgram({
      surface: { ...surface, size: 0.15 },
      graph,
      swatches,
      knit: {
        ...defaultKnitSettings(),
        mode: 'shape',
        cut: settingsFor(cubeCrossCut(surface, graph)),
      },
    });
    expect(r.ok).toBe(false);
    const typed = buildKnitProgram({
      surface,
      graph,
      swatches,
      knit: {
        ...defaultKnitSettings(),
        mode: 'network',
        size: { source: 'typed', needles: 50, passes: 50 },
        cut: settingsFor(cubeCrossCut(surface, graph)),
      },
    });
    expect(typed.ok).toBe(false);
  });
});
