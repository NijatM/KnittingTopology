import { describe, expect, it } from 'vitest';
import { generatePattern } from '../../src/core/generate';
import { analyzeGraph } from '../../src/core/diagnostics';
import {
  sphereDomain,
  sphereDomainPoint,
  sphereDomainUV,
  surfacePatchCount,
} from '../../src/core/sphere-domain';
import {
  analyticSurfaceArea,
  buildSurfaceMesh,
  embeddedEdgeLength,
  evaluateSurface,
  projectToSurface,
  surfacePath,
  surfaceResidual,
  validateSurface,
} from '../../src/core/surfaces';
import type {
  GenerationInput,
  PatternFamily,
  SurfaceSpec,
  TopologyPreset,
  Vec3,
} from '../../src/core/types';
const surface = (opening = 0.04, fraction = 1): SurfaceSpec => ({
  kind: 'sphere',
  size: 0.12,
  curvature: 0,
  revision: 'synthetic-domain',
  poleOpeningDiameter: opening,
  sphereFraction: fraction,
});
const input = (
  opening = 0.04,
  fraction = 1,
  family: PatternFamily = 'quad',
  preset: TopologyPreset = 'regular'
): GenerationInput => ({
  surface: surface(opening, fraction),
  parameters: {
    strategy: 'patch-grid',
    spacing: 0.02,
    orientation: 0,
    guideStrength: 0,
    relaxation: 0,
    preset,
    family,
    seed: 0,
    patchSides: 4,
    boundaryCounts: [4, 4, 4, 4],
    variant: 0,
  },
  guides: [],
});
function boundaries(g: ReturnType<typeof generatePattern>['graph']) {
  const neighbors = new Map<string, string[]>();
  for (const e of g.edges)
    if (e.cells.length === 1) {
      neighbors.set(e.a, [...(neighbors.get(e.a) ?? []), e.b]);
      neighbors.set(e.b, [...(neighbors.get(e.b) ?? []), e.a]);
    }
  let count = 0;
  const seen = new Set<string>();
  for (const id of neighbors.keys())
    if (!seen.has(id)) {
      count++;
      const stack = [id];
      seen.add(id);
      while (stack.length)
        for (const n of neighbors.get(stack.pop()!) ?? [])
          if (!seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
    }
  expect([...neighbors.values()].every((x) => x.length === 2)).toBe(true);
  return count;
}
describe('synthetic analytic retained sphere domains', () => {
  it('matches circle diameter, area, atlas projection and clamped membership', () => {
    for (const fraction of [1, 0.5, 0.25, 0.01]) {
      const s = surface(0.04, fraction),
        d = sphereDomain(s);
      expect(analyticSurfaceArea(s)).toBeCloseTo(
        4 * Math.PI * d.radius * Math.sqrt(d.radius ** 2 - 0.02 ** 2) * fraction,
        13
      );
      expect(surfacePatchCount(s)).toBe(4);
      for (let patch = 0; patch < 4; patch++)
        for (const u of [0, 0.2, 1])
          for (const v of [0, 0.3, 0.5, 1]) {
            const p = evaluateSurface(s, patch, u, v),
              q = projectToSurface(s, p, patch);
            expect(q.attachment.patch).toBe(patch);
            expect(q.attachment.uv[0]).toBeCloseTo(u, 11);
            expect(q.attachment.uv[1]).toBeCloseTo(v, 11);
            expect(surfaceResidual(s, p)).toBeLessThan(1e-12);
            if (v === 0 || v === 1) expect(Math.hypot(p[0], p[1]) * 2).toBeCloseTo(0.04, 12);
          }
      expect(surfaceResidual(s, [0, 0, 0.06])).toBeGreaterThan(0.01);
      const p = projectToSurface(s, [0, 0, 0.06]).position;
      expect(p[2]).toBeCloseTo(d.zMax, 12);
      const outside = sphereDomainPoint(surface(0.04, 1), 0.75, 0.5);
      if (fraction <= 0.5) expect(surfaceResidual(s, outside)).toBeGreaterThan(0.01);
    }
  });
  it('retains exact rim paths and meridians without crossing removed caps or sectors', () => {
    for (const fraction of [1, 0.5, 0.01]) {
      const s = surface(0.04, fraction),
        d = sphereDomain(s),
        a = sphereDomainPoint(s, 0.1, 0),
        b = sphereDomainPoint(s, 0.35, 0);
      const path = surfacePath(s, a, b);
      expect(path.every((p) => surfaceResidual(s, p) < 1e-12)).toBe(true);
      expect(path.every((p) => Math.abs(p[2] + d.zMax) < 1e-12)).toBe(true);
      expect(embeddedEdgeLength(s, a, b, path)).toBeCloseTo(0.02 * d.longitudeSpan * 0.25, 12);
      const c = sphereDomainPoint(s, 0.2, 1),
        e = sphereDomainPoint(s, 0.2, 0);
      expect(embeddedEdgeLength(s, c, e)).toBeCloseTo(d.meridianLength, 12);
    }
  });
  it('a retained-pole sector keeps nonempty mesh fans at minimum resolution', () => {
    const mesh = buildSurfaceMesh(surface(0, 0.5), 1);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(new Set(mesh.indices).size).toBeGreaterThan(4);
  });
  it('display mesh has no cap faces or collapsed pole triangles', () => {
    for (const opening of [0, 0.04])
      for (const fraction of [0.25, 1]) {
        if (!opening && fraction === 1) continue;
        const s = surface(opening, fraction),
          mesh = buildSurfaceMesh(s, 8);
        const point = (i: number) => mesh.positions.slice(i * 3, i * 3 + 3) as Vec3;
        for (let i = 0; i < mesh.indices.length; i += 3) {
          const p = mesh.indices.slice(i, i + 3).map(point);
          expect(p.every((q) => surfaceResidual(s, q) < 1e-12)).toBe(true);
          const a = p[1]!.map((x, k) => x - p[0]![k]!),
            b = p[2]!.map((x, k) => x - p[0]![k]!);
          expect(
            Math.hypot(
              a[1]! * b[2]! - a[2]! * b[1]!,
              a[2]! * b[0]! - a[0]! * b[2]!,
              a[0]! * b[1]! - a[1]! * b[0]!
            )
          ).toBeGreaterThan(1e-14);
        }
      }
  });
  for (const [opening, fraction] of [
    [0.04, 1],
    [0.04, 0.5],
    [0, 0.5],
    [0.001, 0.01],
    [0.119, 0.25],
  ] as const)
    for (const family of ['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)
      it(`validates ${family} opening ${opening} fraction ${fraction}`, () => {
        const x = input(opening, fraction, family),
          r = generatePattern(x);
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(r.statistics.euler).toBe(fraction === 1 ? 0 : 1);
        expect(boundaries(r.graph)).toBe(fraction === 1 ? 2 : 1);
        expect(r.graph.nodes.every((n) => surfaceResidual(x.surface, n.position) < 1e-10)).toBe(
          true
        );
      });
  for (const preset of ['inset', 'alternating', 'radial'] as const)
    for (const opening of [0, 0.04])
      for (const family of ['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)
        it(`supports ${preset} ${family} opening ${opening}`, () => {
          const r = generatePattern(input(opening, 0.5, family, preset));
          expect(r.statistics.euler).toBe(1);
          expect(boundaries(r.graph)).toBe(1);
        });
  for (const preset of ['inset', 'alternating', 'radial'] as const)
    for (const family of ['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)
      it(`supports full annular ${preset} ${family}`, () => {
        const r = generatePattern(input(0.04, 1, family, preset));
        expect(r.statistics.euler).toBe(0);
        expect(boundaries(r.graph)).toBe(2);
      });
  it('zero-opening pole meridian metric ignores ambiguous pole longitude', () => {
    const s = surface(0, 0.5),
      a = sphereDomainPoint(s, 0.75, 0),
      b = sphereDomainPoint(s, 0.75, 1);
    expect(embeddedEdgeLength(s, a, b)).toBeCloseTo(Math.PI * 0.06, 12);
  });
  it('preserves explicit zero/full defaults exactly and rejects invalid dimensions', () => {
    const x = input(0, 1);
    delete x.surface.poleOpeningDiameter;
    delete x.surface.sphereFraction;
    const a = generatePattern(x),
      b = generatePattern(input(0, 1));
    expect(b).toEqual(a);
    for (const opening of [-1, NaN, 0.12, 0.121, 1e-12])
      expect(() => validateSurface(surface(opening))).toThrow();
    for (const f of [0, 0.0099, 1.01, NaN, 1 - 1e-12])
      expect(() => validateSurface(surface(0.04, f))).toThrow();
    expect(() => validateSurface({ ...surface(), kind: 'plane' })).toThrow(/sphere-only/);
  });
  it('responds to cancellation and rejects excessive density', () => {
    expect(() => generatePattern(input(), { cancelled: () => true })).toThrow(/cancelled/);
    let checks = 0;
    expect(() => generatePattern(input(), { cancelled: () => ++checks > 4 })).toThrow(/cancelled/);
    const x = input();
    x.parameters.spacing = 1e-9;
    expect(() => generatePattern(x)).toThrow(/Strip|limit/);
  });
  it('equatorial strip density remains resolved with small circular rims', () => {
    const r = generatePattern(input(0.001, 1));
    const coarse = r.graph.coarseTopology!;
    expect(coarse.nodes.some((n) => Math.abs(n.position[2]) < 1e-12)).toBe(true);
    expect(Math.max(...coarse.strips.map((s) => s.subdivisions))).toBeGreaterThanOrEqual(4);
    expect(
      analyzeGraph(r.graph, surface(0.001, 1)).diagnostics.filter((d) => d.severity === 'error')
    ).toEqual([]);
  });
});
