import { describe, it, expect } from 'vitest';
import { generatePattern, supportedPatchTemplate } from '../../src/core/generate';
import { analyzeGraph, polygonArea } from '../../src/core/diagnostics';
import {
  buildSurfaceMesh,
  evaluateSurface,
  projectToSurface,
  surfaceResidual,
  embeddedEdgeLength,
} from '../../src/core/surfaces';
import type {
  GenerationInput,
  PatternFamily,
  SurfaceKind,
  TopologyPreset,
} from '../../src/core/types';
const input = (
  kind: SurfaceKind = 'plane',
  family: PatternFamily = 'quad',
  preset: TopologyPreset = 'regular'
): GenerationInput => ({
  surface: { kind, size: 0.12, curvature: 0.3, revision: 'test:1' },
  parameters: {
    strategy: 'patch-grid',
    spacing: 0.02,
    orientation: 0,
    guideStrength: 0.8,
    relaxation: 0,
    preset,
    family,
    seed: 7,
    patchSides: 4,
    boundaryCounts: [4, 4, 4, 4],
    variant: 0,
  },
  guides: [],
});
describe('analytic surfaces and oriented atlas', () => {
  for (const kind of ['plane', 'cube', 'sphere', 'saddle'] as const)
    it(`${kind} evaluation/project/mesh`, () => {
      const s = input(kind).surface;
      for (let patch = 0; patch < (kind === 'cube' || kind === 'sphere' ? 6 : 1); patch++)
        for (const u of [0, 0.19, 0.5, 1])
          for (const v of [0, 0.31, 0.5, 1]) {
            const p = evaluateSurface(s, patch, u, v),
              q = projectToSurface(s, p, patch);
            expect(surfaceResidual(s, p)).toBeLessThan(1e-12);
            q.position.forEach((x, i) => expect(x).toBeCloseTo(p[i]!, 12));
            expect(q.attachment.uv[0]).toBeCloseTo(u, 12);
            expect(q.attachment.uv[1]).toBeCloseTo(v, 12);
          }
      const mesh = buildSurfaceMesh(s, 4);
      expect(mesh.indices.length / 3).toBe((kind === 'cube' || kind === 'sphere' ? 6 : 1) * 32);
      expect(mesh.positions.every(Number.isFinite)).toBe(true);
    });
  it('sphere great circle arc and surface area are analytic', () => {
    const s = input('sphere').surface,
      a = evaluateSurface(s, 0, 0.5, 0.5),
      b = evaluateSurface(s, 2, 0.5, 0.5);
    expect(embeddedEdgeLength(s, a, b)).toBeCloseTo((Math.PI * s.size) / 4, 12);
    const result = generatePattern(input('sphere'));
    expect(result.statistics.surfaceArea).toBeCloseTo(Math.PI * s.size * s.size, 12);
  });
  it('sphere coarse edge analytic arc and chord-area refinement approach analytic area', () => {
    const x = input('sphere'),
      a = evaluateSurface(x.surface, 0, 0, 0),
      b = evaluateSurface(x.surface, 0, 1, 0);
    expect(embeddedEdgeLength(x.surface, a, b)).toBeCloseTo(
      (x.surface.size / 2) * Math.acos(1 / 3),
      12
    );
    x.parameters.spacing = 0.08;
    const coarse = generatePattern(x);
    x.parameters.spacing = 0.02;
    const fine = generatePattern(x);
    const area = Math.PI * x.surface.size * x.surface.size;
    expect(Math.abs(polygonArea(fine.graph) - area)).toBeLessThan(
      Math.abs(polygonArea(coarse.graph) - area)
    );
  });
  it('rejects invalid and unbounded inputs', () => {
    expect(() => evaluateSurface({ ...input().surface, size: 0 }, 0, 0.5, 0.5)).toThrow();
    expect(() => evaluateSurface(input().surface, 0, -1, 0.5)).toThrow();
    expect(() => projectToSurface(input('sphere').surface, [0, 0, 0])).toThrow();
    expect(() => buildSurfaceMesh(input().surface, 500)).toThrow();
  });
});
describe('explicit connected graph generation', () => {
  for (const kind of ['plane', 'cube', 'sphere', 'saddle'] as const)
    for (const preset of ['regular', 'inset', 'alternating', 'radial'] as const)
      it(`${kind}/${preset} quad invariants`, () => {
        const x = input(kind, 'quad', preset),
          r = generatePattern(x);
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(r.statistics.components).toBe(1);
        expect(r.statistics.euler).toBe(kind === 'cube' || kind === 'sphere' ? 2 : 1);
        expect(r.statistics.quadFraction).toBe(1);
        expect(r.graph.nodes.every((n) => surfaceResidual(x.surface, n.position) < 1e-10)).toBe(
          true
        );
        if (kind === 'cube' || kind === 'sphere') {
          expect(r.statistics.boundaryEdges).toBe(0);
          expect(r.diagnostics.find((d) => d.id === 'quad-deficit')?.value).toBe(8);
        }
        if (kind === 'cube') {
          expect(r.graph.edges.filter((e) => e.feature === 'crease').length).toBeGreaterThan(0);
          expect(r.graph.nodes.filter((n) => n.feature === 'corner')).toHaveLength(8);
        }
      });
  for (const kind of ['plane', 'cube', 'sphere'] as const)
    for (const family of ['dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)
      it(`${kind}/${family} real graph transformation`, () => {
        const r = generatePattern(input(kind, family));
        expect(r.statistics.euler).toBe(kind === 'plane' ? 1 : 2);
        expect(r.statistics.components).toBe(1);
        expect(r.graph.cells.every((c) => typeof c.sourceCell === 'string')).toBe(true);
        if (family === 'kis' || family === 'diagonal')
          expect(r.graph.cells.every((c) => c.nodes.length === 3)).toBe(true);
        if (family === 'gyro') expect(r.graph.cells.every((c) => c.nodes.length === 5)).toBe(true);
      });
  it('counts refinement and exact cube shared identities', () => {
    const x = input('cube');
    x.parameters.spacing = 0.03;
    const a = generatePattern(x);
    expect(a.statistics.cells).toBe(6 * 4 * 4);
    expect(a.statistics.vertices).toBe(6 * 4 * 4 + 2);
    x.parameters.spacing = 0.015;
    const b = generatePattern(x);
    expect(b.statistics.cells).toBe(4 * a.statistics.cells);
    expect(b.statistics.vertices).toBe(6 * 8 * 8 + 2);
    const ids = new Set(b.graph.nodes.map((n) => n.position.map((p) => p.toFixed(12)).join(',')));
    expect(ids.size).toBe(b.graph.nodes.length);
  });
  it('explicit cube strips accept independent anisotropic densities with no cracks', () => {
    const x = input('cube');
    const initial = generatePattern(x),
      strips = initial.graph.coarseTopology!.strips;
    expect(strips).toHaveLength(3);
    expect(strips.every((s) => s.closed)).toBe(true);
    x.parameters.stripOverrides = Object.fromEntries(strips.map((s, i) => [s.id, [2, 3, 5][i]!]));
    const r = generatePattern(x);
    expect(r.statistics.cells).toBe(2 * (2 * 3 + 3 * 5 + 5 * 2));
    expect(r.statistics.vertices).toBe(r.statistics.cells + 2);
    expect(r.statistics.edges).toBe(2 * r.statistics.cells);
    expect(r.statistics.boundaryEdges).toBe(0);
    expect(r.statistics.extraordinaryVertices).toBe(8);
  });
  it('inset adds loop strips while retaining explicit coarse identity', () => {
    const regular = generatePattern(input('cube')),
      inset = generatePattern(input('cube', 'quad', 'inset'));
    expect(inset.graph.coarseTopology!.strips.length).toBe(
      regular.graph.coarseTopology!.strips.length + 6
    );
    const x = input();
    x.parameters.stripOverrides = { 'strip:impossible': 3 };
    expect(() => generatePattern(x)).toThrow(/Unknown coarse strip/);
  });
  it('stable IDs and full deterministic regeneration', () => {
    expect(generatePattern(input())).toEqual(generatePattern(input()));
  });
  it('validates tampered incidence and flipped boundaries', () => {
    const x = input(),
      r = generatePattern(x);
    r.graph.cells[0]!.nodes.reverse();
    expect(
      analyzeGraph(r.graph, x.surface).diagnostics.some(
        (d) => d.id === 'inverted-cells' && d.severity === 'error'
      )
    ).toBe(true);
    r.graph.edges.pop();
    expect(
      analyzeGraph(r.graph, x.surface).diagnostics.some((d) => d.id === 'edge-incidence')
    ).toBe(true);
  });
  it('a 30-degree guide decreases true tangent cross-field error, strength zero is exact identity', () => {
    const x = input();
    x.parameters.spacing = 0.012;
    x.parameters.guideStrength = 1;
    const angle = Math.PI / 6;
    x.guides = [
      {
        id: 'direction',
        strength: 1,
        samples: [-0.05, 0.05].map((t) =>
          projectToSurface(x.surface, [t * Math.cos(angle), t * Math.sin(angle), 0])
        ),
      },
    ];
    const guided = generatePattern(x),
      diagnostic = guided.diagnostics.find((d) => d.id === 'guide-alignment')!;
    const numbers = diagnostic.message.match(/([0-9]+\.[0-9]+)°/g)!.map((n) => parseFloat(n));
    expect(numbers[1]!).toBeLessThan(numbers[0]!);
    x.parameters.guideStrength = 0;
    const zero = generatePattern(x);
    x.guides = [];
    expect(generatePattern(x).graph.nodes).toEqual(zero.graph.nodes);
  });
  it('cancellation and bounded density', () => {
    expect(() => generatePattern(input(), { cancelled: () => true })).toThrow(/cancelled/);
    const x = input();
    x.parameters.spacing = 1e-6;
    expect(() => generatePattern(x)).toThrow(/spacing/);
    let last = 0;
    generatePattern(input(), {
      progress: (f) => {
        expect(f).toBeGreaterThanOrEqual(last);
        last = f;
      },
    });
    expect(last).toBe(1);
  });
  it('orientation changes free nodes while fixing boundaries', () => {
    const x = input(),
      a = generatePattern(x);
    x.parameters.orientation = 45;
    const b = generatePattern(x);
    const map = new Map(a.graph.nodes.map((n) => [n.id, n]));
    expect(
      b.graph.nodes.some(
        (n) => Math.hypot(...n.position.map((v, i) => v - map.get(n.id)!.position[i]!)) > 1e-6
      )
    ).toBe(true);
    for (const n of b.graph.nodes)
      if (n.feature === 'boundary') expect(n.position).toEqual(map.get(n.id)!.position);
  });
  it('soft guides have a real, reversal-invariant geometric effect and stale guides reject', () => {
    const x = input(),
      a = generatePattern(x);
    x.guides = [
      {
        id: 'g',
        strength: 1,
        samples: [
          [-0.05, -0.02, 0],
          [0.05, 0.03, 0],
        ].map((p) => projectToSurface(x.surface, p as [number, number, number])),
      },
    ];
    const b = generatePattern(x);
    expect(
      b.graph.nodes.some(
        (n, i) => Math.hypot(...n.position.map((v, j) => v - a.graph.nodes[i]!.position[j]!)) > 1e-6
      )
    ).toBe(true);
    x.guides[0]!.samples.reverse();
    generatePattern(x).graph.nodes.forEach((n, i) =>
      n.position.forEach((v, j) => expect(v).toBeCloseTo(b.graph.nodes[i]!.position[j]!, 12))
    );
    x.guides[0]!.samples[0]!.attachment.surfaceRevision = 'old';
    expect(() => generatePattern(x)).toThrow(/revision/);
  });
});
describe('documented n-sided integer-template subset', () => {
  for (const sides of [3, 4, 5, 6])
    it(`${sides} equal-even fan preserves specified boundary subdivisions`, () => {
      const x = input();
      x.parameters.strategy = 'n-sided-patch';
      x.parameters.patchSides = sides;
      x.parameters.boundaryCounts = Array(sides).fill(6);
      x.parameters.variant = 1;
      const r = generatePattern(x);
      expect(r.statistics.boundaryEdges).toBe(sides * 6);
      expect(r.statistics.cells).toBe(sides * 3 * 3);
      expect(r.statistics.quadFraction).toBe(1);
      expect(r.statistics.euler).toBe(1);
    });
  it('minimum triangular (2,1,1) kernels are a single oriented quad', () => {
    for (const counts of [
      [2, 1, 1],
      [1, 2, 1],
      [1, 1, 2],
    ]) {
      const x = input();
      x.parameters.strategy = 'n-sided-patch';
      x.parameters.patchSides = 3;
      x.parameters.boundaryCounts = counts;
      const r = generatePattern(x);
      expect(r.statistics.cells).toBe(1);
      expect(r.statistics.vertices).toBe(4);
      expect(r.statistics.boundaryEdges).toBe(4);
      expect(r.graph.coarsePatches[0]!.template).toBe('triangle-single-quad-211');
    }
  });
  it('published bounded side-count coverage is honest for counts 1–4', () => {
    const rows = [];
    for (const n of [3, 4, 5, 6]) {
      let even = 0,
        supported = 0;
      for (let i = 0; i < 4 ** n; i++) {
        const counts = Array.from({ length: n }, (_, j) => (Math.floor(i / 4 ** j) % 4) + 1);
        if (counts.reduce((a, b) => a + b, 0) % 2 === 0) {
          even++;
          if (supportedPatchTemplate(n, counts, 0) || supportedPatchTemplate(n, counts, 1))
            supported++;
        }
      }
      rows.push([n, even, supported]);
    }
    expect(rows).toEqual([
      [3, 32, 5],
      [4, 128, 16],
      [5, 512, 2],
      [6, 2048, 4],
    ]);
  });
  it('opposite-equal rectangle supports odd counts', () => {
    const x = input();
    x.parameters.strategy = 'n-sided-patch';
    x.parameters.boundaryCounts = [3, 5, 3, 5];
    const r = generatePattern(x);
    expect(r.statistics.cells).toBe(15);
    expect(r.statistics.boundaryEdges).toBe(16);
  });
  it('compatible alternating even counts on hexagon', () => {
    const x = input();
    x.parameters.strategy = 'n-sided-patch';
    x.parameters.patchSides = 6;
    x.parameters.boundaryCounts = [2, 4, 2, 4, 2, 4];
    const r = generatePattern(x);
    expect(r.statistics.boundaryEdges).toBe(18);
    expect(r.statistics.cells).toBe(12);
  });
  it('rejects odd total and unsupported even count combinations explicitly', () => {
    const x = input();
    x.parameters.strategy = 'n-sided-patch';
    x.parameters.patchSides = 3;
    x.parameters.boundaryCounts = [2, 2, 3];
    expect(() => generatePattern(x)).toThrow(/even total/);
    x.parameters.boundaryCounts = [4, 1, 1];
    expect(() => generatePattern(x)).toThrow(/Unsupported side-count/);
  });
});
