import { describe, it, expect } from 'vitest';
import type { PatternFamily, SurfaceSpec, Vec2 } from '../../src/core/types';
import { createProject } from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import { sphereDomain, sphereDomainPoint } from '../../src/core/sphere-domain';
import {
  layoutSphere,
  sphereChart,
  sphereCutPath,
  sphereSectorCut,
  sphereSectorSeam,
  sphereToSurface,
  sphereSeam,
  type SphereCut,
} from '../../src/knit/sphere-knit';
import { sphereMeridianCut } from '../../src/knit/cut-presets';
import { rasterizeSurfaceNetwork, type NetworkChart } from '../../src/knit/rasterize-surface';
import { defaultKnitSettings } from '../../src/knit/settings';
import { settingsKey } from '../../src/knit/keys';
import { buildCutDisk, cutSourceSignature } from '../../src/knit/cuts';
import { SOURCE } from '../../src/knit/rasterize';

// Synthetic geometry and gauge values test the numerical construction, not measured fabric.
const base: SurfaceSpec = { kind: 'sphere', size: 0.12, curvature: 0, revision: 'synthetic' };
const meridian: SphereCut = {
  edges: [{ id: 'm', top: Math.PI / 2, bottom: -Math.PI / 2 }],
  samples: [
    { lat: Math.PI / 2, lon: 0 },
    { lat: -Math.PI / 2, lon: 0 },
  ],
};
const fingerprints = [
  '4b442c3abf7b9d0f1bff7dfeaaf9d5a438ed0c99db3e32b62544dba42a60ed5d',
  '6f8d30ff39ea6822e16db5dd421f32eff0fdf6fc2d66d357f963b8d96cfcbc86',
  'e6f15d8b097238c66489a8c68f6ea9b909e01f945c01b202d91b723280f3b702',
  'fff5ddf1220fe0f66444dfd3915c8300f52259e1d8d74361e891adbe202994b0',
];
const digest = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
    ),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
function network(surface: SurfaceSpec, family: PatternFamily = 'quad') {
  const p = createProject();
  return generatePattern({
    ...p,
    surface,
    parameters: { ...p.parameters, family, spacing: 0.025, relaxation: 0 },
  }).graph;
}
const inPolygon = (p: Vec2, poly: Vec2[]) => {
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
};
function covered(chart: NetworkChart, p: Vec2) {
  return chart.cells.some((poly) =>
    (chart.periodic ? [-1, 0, 1] : [0]).some((s) => inPolygon([p[0] - s, p[1]], poly))
  );
}

describe('sphere domain knitting', () => {
  it('keeps exact legacy layouts for both needle orders and pass directions', async () => {
    let i = 0;
    for (const start of ['v0', 'v1'] as const)
      for (const dir of [1, -1] as const) {
        const old = layoutSphere(base, meridian, 0.006, 0.004, dir, start);
        expect(await digest(old)).toBe(fingerprints[i++]);
        expect(
          layoutSphere(
            { ...base, poleOpeningDiameter: 0, sphereFraction: 1 },
            meridian,
            0.006,
            0.004,
            dir,
            start
          )
        ).toEqual(old);
        expect(old.layout.domain).toBeUndefined();
      }
  });

  it.each([
    [0.04, 1],
    [0.04, 0.5],
    [0.04, 0.25],
    [0, 0.5],
    [0, 0.25],
    [0.1, 0.01],
  ] as const)(
    'uses the retained meridian and angular arc (%s m opening, %s coverage)',
    (opening, fraction) => {
      const surface = { ...base, poleOpeningDiameter: opening, sphereFraction: fraction },
        d = sphereDomain(surface),
        cut: SphereCut = {
          edges: [],
          samples: [
            { lat: Math.PI / 2 - d.thetaMin, lon: 0 },
            { lat: Math.PI / 2 - d.thetaMax, lon: 0 },
          ],
        };
      for (const start of ['v0', 'v1'] as const)
        for (const dir of [1, -1] as const) {
          const { layout, needles, geometry } = layoutSphere(
              surface,
              cut,
              0.006,
              0.004,
              dir,
              start
            ),
            N = layout.needles;
          expect(N).toBe(Math.max(2, Math.ceil(d.meridianLength / 0.006 - 1e-10)));
          expect(layout.domain).toMatchObject({
            openingDiameter: opening,
            fraction,
            longitudeSpan: d.longitudeSpan,
            retainedMeridianLength: d.meridianLength,
          });
          expect(layout.exact[0]).toBeCloseTo(
            (d.longitudeSpan * d.radius * Math.sin(d.thetaMin + d.thetaSpan / (2 * N))) / 0.004,
            12
          );
          expect(layout.domain!.actualOuterRingDiameters[0]).toBeCloseTo(
            2 * d.radius * Math.sin(d.thetaMin + d.thetaSpan / (2 * N)),
            14
          );
          expect(layout.widthRounding).toBeCloseTo(d.meridianLength - N * 0.006, 14);
          expect(
            geometry.courses.every(
              (c) => Math.abs(c.length - (c.loops.length * d.meridianLength) / N) < 1e-14
            )
          ).toBe(true);
          expect(needles.yarnJumps).toBe(0);
          const last = new Map<number, string>(),
            counts = new Array(N).fill(0),
            lastPass = new Map<number, number>();
          let maxHeld = 0;
          for (const p of needles.placements) {
            const q = p.loop.position,
              uv = p.loop.net!;
            expect(Math.hypot(...q)).toBeCloseTo(d.radius, 14);
            expect(Math.abs(q[2])).toBeLessThan(d.zMax + 1e-12);
            expect(q).toEqual(sphereToSurface(surface, cut)(uv));
            expect(p.parents).toEqual(last.has(p.needle) ? [last.get(p.needle)] : []);
            if (lastPass.has(p.needle))
              maxHeld = Math.max(maxHeld, p.course - lastPass.get(p.needle)! - 1);
            lastPass.set(p.needle, p.course);
            last.set(p.needle, p.loop.id);
            counts[p.needle]++;
            const a = Math.atan2(q[1], q[0]);
            if (fraction < 1)
              expect(a < 0 ? a + 2 * Math.PI : a).toBeLessThan(d.longitudeSpan + 1e-10);
          }
          expect(counts).toEqual(layout.counts);
          expect(layout.maxHeld).toBe(maxHeld);
          expect(layout.maxCountError).toBe(
            Math.max(...counts.map((c, j) => Math.abs(c - layout.exact[j]!)))
          );
          if (opening) expect(geometry.issues.join(' ')).not.toMatch(/gathered closed/);
        }
    }
  );

  it.each([
    [0.04, 1],
    [0.04, 0.5],
    [0.04, 0.25],
    [0, 0.5],
    [0, 0.25],
  ] as const)(
    'round-trips the retained chart and keeps its network cells (%s, %s)',
    (opening, fraction) => {
      const surface = { ...base, poleOpeningDiameter: opening, sphereFraction: fraction },
        graph = network(surface),
        cut =
          fraction < 1
            ? sphereSectorCut(surface, graph)
            : sphereCutPath(surface, graph, sphereMeridianCut(surface, graph)),
        result = layoutSphere(surface, cut, 0.006, 0.004, 1, 'v0'),
        chart = sphereChart(surface, graph, cut, result.layout);
      expect(chart.periodic).toBe(fraction === 1);
      for (let i = 0; i < 100; i++) {
        const uv: Vec2 = [
            ((i * 0.618034) % 1) * 0.998 + 0.001,
            ((i * 0.414214) % 1) * 0.998 + 0.001,
          ],
          p = chart.toSurface(uv),
          actual = chart.toGrid(p);
        expect(actual[0]).toBeCloseTo(uv[0], 12);
        expect(actual[1]).toBeCloseTo(uv[1], 12);
      }
      for (const p of result.needles.placements) expect(covered(chart, p.loop.net!)).toBe(true);
      if (fraction < 1) {
        const seam = sphereSectorSeam(surface, graph, cut, result.layout, result.needles);
        expect(seam.sourceEdgeIds).toEqual([]);
        expect(seam.edges).toEqual([]);
        expect(seam.naturalBoundaries!.paired).toBe(false);
        expect(seam.naturalBoundaries!.startEdgeIds.length).toBeGreaterThan(0);
        expect(seam.naturalBoundaries!.endEdgeIds.length).toBeGreaterThan(0);
        const byId = new Map(graph.edges.map((e) => [e.id, e]));
        expect(
          [...seam.naturalBoundaries!.startEdgeIds, ...seam.naturalBoundaries!.endEdgeIds].every(
            (id) => byId.get(id)!.cells.length === 1
          )
        ).toBe(true);
        expect(seam.sides.every((s) => Object.keys(s.cutSides).length === 0)).toBe(true);
      }
      const p = sphereDomainPoint(surface, 0.4, 0.3);
      expect(chart.toSurface(chart.toGrid(p))).toEqual(
        expect.arrayContaining(p.map((x) => expect.closeTo(x, 12)))
      );
    }
  );
  it.each(['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)(
    'retains source cell provenance for all modes of the %s network',
    (family) => {
      for (const [opening, fraction] of [
        [0.04, 1],
        [0.04, 0.5],
        [0, 0.5],
      ] as const) {
        const surface = { ...base, poleOpeningDiameter: opening, sphereFraction: fraction },
          graph = network(surface, family),
          cut =
            fraction < 1
              ? sphereSectorCut(surface, graph)
              : sphereCutPath(surface, graph, sphereMeridianCut(surface, graph));
        for (const start of ['v0', 'v1'] as const) {
          const result = layoutSphere(surface, cut, 0.006, 0.004, -1, start),
            chart = sphereChart(surface, graph, cut, result.layout),
            settings = {
              ...defaultKnitSettings(),
              mode: 'both' as const,
              edges: { structure: null, width: 2, boundary: false },
              nodes: { structure: null, size: 3, extraordinary: null },
            },
            raster = rasterizeSurfaceNetwork(
              graph,
              surface,
              result.needles,
              settings,
              settingsKey(settings),
              null,
              undefined,
              chart
            );
          for (const p of result.needles.placements) {
            const i = (result.needles.h - 1 - p.course) * result.needles.w + p.needle;
            expect(raster.kind[i], `${family}/${opening}/${fraction}/${start}/${p.loop.id}`).toBe(
              SOURCE.cell
            );
            expect(graph.cells[raster.element[i]!]!.id).toBeTruthy();
          }
          expect(chart.nodes).toHaveLength(graph.nodes.length);
          expect(chart.edges).toHaveLength(graph.edges.length);
          expect(chart.cells).toHaveLength(graph.cells.length);
          if (opening) expect(chart.nodes.every((copies) => copies.length === 1)).toBe(true);
        }
      }
    }
  );

  it('pairs only validated connecting-meridian edges on a full opened band', () => {
    const surface = { ...base, poleOpeningDiameter: 0.04 },
      graph = network(surface),
      edgeIds = sphereMeridianCut(surface, graph),
      settings = {
        surfaceRevision: surface.revision,
        sourceSignature: cutSourceSignature(surface, graph),
        preset: 'sphere-meridian' as const,
        edgeIds,
      },
      disk = buildCutDisk(surface, graph, settings);
    if (!disk.ok) throw new Error(disk.reason);
    const cut = sphereCutPath(surface, graph, edgeIds),
      d = sphereDomain(surface);
    expect(cut.samples[0]!.lat).toBeCloseTo(Math.PI / 2 - d.thetaMin, 12);
    expect(cut.samples.at(-1)!.lat).toBeCloseTo(Math.PI / 2 - d.thetaMax, 12);
    for (const start of ['v0', 'v1'] as const) {
      const result = layoutSphere(surface, cut, 0.006, 0.004, 1, start),
        seam = sphereSeam(surface, graph, disk.plan, cut, result.layout, result.needles);
      expect(seam.sourceEdgeIds).toEqual(cut.edges.map((e) => e.id));
      for (const id of seam.sourceEdgeIds) {
        expect(graph.edges.find((e) => e.id === id)!.cells.length).toBe(2);
        expect(seam.sides[0].cutSides[id]).not.toBe(seam.sides[1].cutSides[id]);
      }
      expect(seam.naturalBoundaries).toBeUndefined();
    }
    const interior = edgeIds.slice(1, -1);
    expect(() => sphereCutPath(surface, graph, interior)).toThrow(/actual top rim/);
  });
});
