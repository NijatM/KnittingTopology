import { describe, it, expect } from 'vitest';
import { generatePattern, validateGenerationInput } from '../../src/core/generate';
import { embeddedEdgeLength, evaluateSurface, projectToSurface } from '../../src/core/surfaces';
import {
  MAX_BASE_CELLS,
  MAX_GRAPH_NODES,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_CELLS,
} from '../../src/core/limits';
import type {
  GenerationInput,
  PatternFamily,
  PatternGraph,
  SurfaceKind,
  TopologyPreset,
} from '../../src/core/types';
function input(
  kind: SurfaceKind = 'cube',
  family: PatternFamily = 'quad',
  preset: TopologyPreset = 'regular'
): GenerationInput {
  return {
    surface: { kind, size: 0.12, curvature: -0.3, revision: 'audit' },
    parameters: {
      strategy: 'patch-grid',
      spacing: 0.024,
      orientation: 0,
      guideStrength: 1,
      relaxation: 0,
      preset,
      family,
      seed: -1,
      patchSides: 4,
      boundaryCounts: [4, 4, 4, 4],
      variant: 0,
    },
    guides: [],
  };
}
function creaseCoverage(g: PatternGraph, size: number) {
  const nodes = new Map(g.nodes.map((n) => [n.id, n.position])),
    lines = new Map<string, [number, number][]>();
  for (const edge of g.edges)
    if (edge.feature === 'crease') {
      expect(edge.cells).toHaveLength(2);
      const a = nodes.get(edge.a)!,
        b = nodes.get(edge.b)!,
        fixed = [0, 1, 2].filter(
          (i) =>
            Math.abs(a[i]! - b[i]!) < size * 1e-10 &&
            Math.abs(Math.abs(a[i]!) - size / 2) < size * 1e-10
        );
      expect(fixed).toHaveLength(2);
      const variable = [0, 1, 2].find((i) => !fixed.includes(i))!,
        key = fixed.map((i) => `${i}:${Math.sign(a[i]!)}`).join('/'),
        spans = lines.get(key) ?? [];
      spans.push([Math.min(a[variable]!, b[variable]!), Math.max(a[variable]!, b[variable]!)]);
      lines.set(key, spans);
    }
  expect(lines.size).toBe(12);
  for (const spans of lines.values()) {
    spans.sort((a, b) => a[0] - b[0]);
    expect(spans[0]![0]).toBeCloseTo(-size / 2, 12);
    expect(spans.at(-1)![1]).toBeCloseTo(size / 2, 12);
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]).toBeCloseTo(spans[i - 1]![1], 12);
  }
}
describe('bounded independent-audit regressions', () => {
  for (const kind of ['plane', 'cube', 'sphere', 'saddle'] as const)
    for (const preset of ['regular', 'inset', 'alternating', 'radial'] as const)
      it(`${kind}/${preset}: unique coarse IDs and unambiguous dense source IDs`, () => {
        const r = generatePattern(input(kind, 'quad', preset)),
          coarse = r.graph.coarseTopology!;
        for (const entities of [coarse.nodes, coarse.edges, coarse.cells, r.graph.coarsePatches])
          expect(new Set(entities.map((x) => x.id)).size).toBe(entities.length);
        const ids = new Set(coarse.cells.map((c) => c.id));
        expect(r.graph.cells.every((c) => ids.has(c.sourceCell!))).toBe(true);
        expect(
          coarse.edges.every(
            (e) => new Set(e.cells).size === e.cells.length && e.cells.every((id) => ids.has(id))
          )
        ).toBe(true);
      });
  for (const preset of ['regular', 'inset', 'alternating', 'radial'] as const)
    for (const family of ['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)
      it(`cube/${preset}/${family} retains all 12 sharp creases as final shared edge chains`, () => {
        const x = input('cube', family, preset),
          r = generatePattern(x);
        creaseCoverage(r.graph, x.surface.size);
        expect(r.statistics.boundaryEdges).toBe(0);
        expect(r.statistics.euler).toBe(2);
      });
  it('all cyclic triangular211 diagonal choices produce two positive triangles', () => {
    for (const counts of [
      [2, 1, 1],
      [1, 2, 1],
      [1, 1, 2],
    ]) {
      const x = input('plane', 'diagonal');
      x.parameters.strategy = 'n-sided-patch';
      x.parameters.patchSides = 3;
      x.parameters.boundaryCounts = counts;
      const r = generatePattern(x);
      expect(r.statistics.cells).toBe(2);
      expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(false);
    }
  });
  it('cube top-face guide cannot silently transfer to adjacent +X chart', () => {
    const x = input(),
      baseline = generatePattern(x),
      samples = [
        [0.75, 0.35],
        [0.98, 0.58],
      ].map(([u, v]) => projectToSurface(x.surface, evaluateSurface(x.surface, 4, u!, v!), 4));
    x.guides = [{ id: 'top45', strength: 1, samples }];
    const guided = generatePattern(x),
      byId = new Map(baseline.graph.nodes.map((n) => [n.id, n]));
    const adjacent = guided.graph.nodes.filter((n) => n.attachment.patch === 0);
    expect(adjacent.length).toBeGreaterThan(0);
    for (const n of adjacent) expect(n.position).toEqual(byId.get(n.id)!.position);
    expect(
      guided.graph.nodes.some(
        (n) =>
          n.attachment.patch === 4 &&
          n.position.some((p, i) => Math.abs(p - byId.get(n.id)!.position[i]!) > 1e-8)
      )
    ).toBe(true);
  });
  it('cross-chart guide segments are counted and no undefined guide angle is reported', () => {
    const x = input(),
      baseline = generatePattern(x);
    x.guides = [
      {
        id: 'cross',
        strength: 1,
        samples: [
          projectToSurface(x.surface, evaluateSurface(x.surface, 4, 0.5, 0.5), 4),
          projectToSurface(x.surface, evaluateSurface(x.surface, 0, 0.5, 0.5), 0),
        ],
      },
    ];
    const r = generatePattern(x);
    expect(r.diagnostics.find((d) => d.id === 'guide-segments')?.value).toBe(1);
    expect(r.diagnostics.some((d) => d.id === 'guide-alignment')).toBe(false);
    expect(r.graph.nodes).toEqual(baseline.graph.nodes);
  });
  it('sphere imported path excursions accumulate actual segment arc lengths', () => {
    const s = input('sphere').surface,
      a = evaluateSurface(s, 0, 0.5, 0.5),
      b = evaluateSurface(s, 2, 0.5, 0.5),
      north = evaluateSurface(s, 4, 0.5, 0.5);
    expect(embeddedEdgeLength(s, a, b)).toBeCloseTo((s.size * Math.PI) / 4, 12);
    expect(embeddedEdgeLength(s, a, b, [a, north, b])).toBeCloseTo((s.size * Math.PI) / 2, 12);
  });
  it('strip IDs derive from canonical member edges and retain meanings under anisotropic edits', () => {
    const x = input(),
      a = generatePattern(x),
      strips = a.graph.coarseTopology!.strips;
    for (const s of strips) expect(s.id).toBe(`strip:${[...s.edgeIds].sort()[0]}`);
    x.parameters.stripOverrides = Object.fromEntries(strips.map((s, i) => [s.id, [2, 3, 5][i]!]));
    const b = generatePattern(x);
    expect(b.graph.coarseTopology!.strips.map((s) => [s.id, s.edgeIds])).toEqual(
      strips.map((s) => [s.id, s.edgeIds])
    );
    expect(b.graph.coarseTopology!.strips.map((s) => s.subdivisions)).toEqual([2, 3, 5]);
  });
  // Each independent scale gets its own budget on slower CI runners.
  it.each([1e-6, 0.12, 1000])(
    'integer-keyed seam nodes survive 128/127/1 strips on a %s m sphere',
    (size) => {
      const x = input('sphere');
      x.surface.size = size;
      x.parameters.spacing = size;
      const initial = generatePattern(x);
      x.parameters.stripOverrides = Object.fromEntries(
        initial.graph.coarseTopology!.strips.map((s, i) => [s.id, [128, 127, 1][i]!])
      );
      const r = generatePattern(x);
      expect(r.statistics.cells).toBe(2 * (128 * 127 + 127 + 128));
      expect(r.statistics.boundaryEdges).toBe(0);
      expect(r.statistics.euler).toBe(2);
      expect(r.statistics.vertices).toBe(r.statistics.cells + 2);
    },
    30000
  );
  it('shared validators accept scientific negative saddle/seed and enforce project output caps', () => {
    const x = input('saddle');
    expect(() => validateGenerationInput(x)).not.toThrow();
    const r = generatePattern(x);
    expect(r.graph.nodes.length).toBeLessThanOrEqual(MAX_GRAPH_NODES);
    expect(r.graph.edges.length).toBeLessThanOrEqual(MAX_GRAPH_EDGES);
    expect(r.graph.cells.length).toBeLessThanOrEqual(MAX_GRAPH_CELLS);
    expect(MAX_BASE_CELLS).toBe(40000);
    x.parameters.stripOverrides = Object.fromEntries(
      r.graph.coarseTopology!.strips.map((s) => [s.id, 129])
    );
    expect(() => generatePattern(x)).toThrow(/128/);
  });
  it('global sphere Conway counts agree with explicit incidence', () => {
    const base = generatePattern(input('sphere')),
      v = base.statistics.vertices,
      e = base.statistics.edges,
      f = base.statistics.cells;
    for (const [family, expected] of [
      ['dual', [f, e, v]],
      ['ambo', [e, 2 * e, v + f]],
      ['kis', [v + f, e + 4 * f, 4 * f]],
      ['gyro', [v + 2 * e + f, 5 * e, 2 * e]],
    ] as const) {
      const r = generatePattern(input('sphere', family));
      expect([r.statistics.vertices, r.statistics.edges, r.statistics.cells]).toEqual(expected);
    }
  });
});
