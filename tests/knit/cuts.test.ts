import { describe, it, expect } from 'vitest';
import type {
  KnitCutSettings,
  PatternGraph,
  PatternFamily,
  SurfaceSpec,
  Vec3,
} from '../../src/core/types';
import { projectToSurface } from '../../src/core/surfaces';
import { generatePattern } from '../../src/core/generate';
import {
  createProject,
  parseProject,
  serializeProject,
  scientificSignature,
  historyReducer,
} from '../../src/app/project';
import { defaultKnitSettings, validateKnitSettings } from '../../src/knit/settings';
import { sphereCutPath } from '../../src/knit/sphere-knit';
import {
  buildCutDisk,
  cutSourceSignature,
  inspectCutComplex,
  seamMapJson,
} from '../../src/knit/cuts';
import { generateCutPlan, cubeCrossCut, sphereMeridianCut } from '../../src/knit/cut-presets';
const surface: SurfaceSpec = { kind: 'sphere', size: 2, curvature: 0, revision: 'cut-fixture' };
function tetra(): PatternGraph {
  const p = createProject(),
    positions: Vec3[] = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ].map((p) => p.map((x) => x / Math.sqrt(3)) as Vec3);
  const faces = [
    [0, 1, 2],
    [0, 3, 1],
    [0, 2, 3],
    [1, 3, 2],
  ].map((v, i) => ({ id: `f${i}`, nodes: v.map((n) => `v${n}`), patch: 0 }));
  const edges = new Map<string, { id: string; a: string; b: string; cells: string[] }>();
  for (const f of faces)
    for (let i = 0; i < 3; i++) {
      const ends = [f.nodes[i]!, f.nodes[(i + 1) % 3]!].sort(),
        key = ends.join('-'),
        e = edges.get(key) ?? { id: key, a: ends[0]!, b: ends[1]!, cells: [] };
      e.cells.push(f.id);
      edges.set(key, e);
    }
  return {
    nodes: positions.map((position, i) => ({
      id: `v${i}`,
      position,
      attachment: projectToSurface(surface, position).attachment,
    })),
    edges: [...edges.values()],
    cells: faces,
    coarsePatches: [],
    provenance: {
      algorithm: 'analytic-tetrahedron',
      version: 'test',
      sources: [],
      scope: 'oriented sphere-topology fixture',
      parameters: p.parameters,
      surfaceRevision: surface.revision,
      seed: 0,
      notes: [],
    },
  };
}
const settings = (graph: PatternGraph, ids: string[]): KnitCutSettings => ({
  surfaceRevision: surface.revision,
  sourceSignature: cutSourceSignature(surface, graph),
  preset: 'manual',
  edgeIds: ids,
});
function accepted(ids: string[]) {
  const graph = tetra(),
    s = settings(graph, ids),
    r = buildCutDisk(surface, graph, s);
  if (!r.ok) throw new Error(r.reason);
  return { graph, s, plan: r.plan };
}
describe('corner-fan cuts and paired boundaries', () => {
  it('a single cut edge produces a disk with a two-edge boundary', () => {
    const { graph, plan } = accepted(['v0-v1']);
    expect(plan.statistics).toMatchObject({
      sourceEuler: 2,
      euler: 1,
      components: 1,
      boundaryComponents: 1,
      cutEdges: 1,
    });
    expect(plan.complex.vertices).toHaveLength(4);
    expect(plan.complex.edges).toHaveLength(7);
    expect(plan.boundary).toHaveLength(2);
    expect(plan.seams).toHaveLength(1);
    expect(plan.seams[0]!.vertexPairs.every(([a, b]) => a === b)).toBe(true);
    expect(graph.nodes.map((n) => n.id)).toEqual(['v0', 'v1', 'v2', 'v3']);
  });
  it('splits an interior path vertex but preserves its endpoints', () => {
    const { plan } = accepted(['v0-v1', 'v1-v2']);
    expect(plan.complex.vertices.filter((v) => v.sourceId === 'v1')).toHaveLength(2);
    expect(plan.complex.vertices.filter((v) => v.sourceId === 'v0')).toHaveLength(1);
    expect(plan.complex.vertices.filter((v) => v.sourceId === 'v2')).toHaveLength(1);
    expect(plan.boundary).toHaveLength(4);
  });
  it('supports a branched tree with one boundary and complete seam pairing', () => {
    const { plan } = accepted(['v0-v1', 'v0-v2', 'v0-v3']);
    expect(plan.statistics.branchVertices).toBe(1);
    expect(plan.complex.vertices.filter((v) => v.sourceId === 'v0')).toHaveLength(3);
    expect(
      plan.complex.vertices.length - plan.complex.edges.length + plan.complex.faces.length
    ).toBe(1);
    expect(new Set(plan.seams.flatMap((s) => s.sides.map((s) => s.edgeId))).size).toBe(
      plan.boundary.length
    );
    for (const seam of plan.seams) {
      const [a, b] = seam.sides;
      const nodes = new Map(plan.complex.vertices.map((v) => [v.id, v.sourceId]));
      expect(nodes.get(a.from)).toBe(nodes.get(b.to));
    }
  });
  it.each([
    { ids: [], reason: 'at least one' },
    { ids: ['missing'], reason: 'missing' },
    { ids: ['v0-v1', 'v0-v1'], reason: 'duplicated' },
    { ids: ['v0-v1', 'v1-v2', 'v0-v2'], reason: 'cycle' },
    { ids: ['v0-v1', 'v2-v3'], reason: 'disconnected' },
  ])('rejects $reason cuts', ({ ids, reason }) => {
    const g = tetra();
    expect(buildCutDisk(surface, g, settings(g, ids))).toMatchObject({
      ok: false,
      reason: expect.stringContaining(reason),
    });
  });
  it('rejects inconsistent face orientation and source vertex links', () => {
    const g = tetra();
    g.cells[0]!.nodes.reverse();
    expect(buildCutDisk(surface, g, settings(g, ['v0-v1']))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('orientations'),
    });
    const h = tetra();
    h.edges[0]!.cells = ['f0'];
    expect(buildCutDisk(surface, h, settings(h, ['v0-v1']))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('incidence'),
    });
  });
  it('is deterministic, preserves the source and detects stale source signatures', () => {
    const { graph, s, plan } = accepted(['v0-v1', 'v1-v2']),
      before = JSON.stringify(graph);
    const repeat = buildCutDisk(surface, graph, { ...s, edgeIds: [...s.edgeIds].reverse() });
    expect(repeat).toEqual({ ok: true, plan });
    plan.complex.vertices[0]!.position[0] += 1;
    expect(JSON.stringify(graph)).toBe(before);
    graph.nodes[0]!.position[0] += 0.001;
    expect(buildCutDisk(surface, graph, s)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('different surface or network'),
    });
  });
  it('reconstructs the original face cycles and edge incidences by source identity', () => {
    const { graph, plan } = accepted(['v0-v1', 'v0-v2', 'v0-v3']),
      nodes = new Map(plan.complex.vertices.map((v) => [v.id, v.sourceId]));
    expect(
      plan.complex.faces.map((f) => ({
        id: f.sourceId,
        nodes: f.vertices.map((v) => nodes.get(v)),
      }))
    ).toEqual(graph.cells.map((f) => ({ id: f.id, nodes: f.nodes })));
    for (const e of graph.edges)
      expect(
        [
          ...new Set(plan.complex.edges.filter((c) => c.sourceId === e.id).flatMap((c) => c.faces)),
        ].sort()
      ).toEqual([...e.cells].sort());
  });
  it('guards exported topology, endpoint copies and current draft identity', () => {
    const { plan, s } = accepted(['v0-v1', 'v1-v2']);
    const file = JSON.parse(seamMapJson(plan, s));
    expect(file).toMatchObject({ format: 'knitting-topology-seam-map', units: 'm', version: 1 });
    expect(() => seamMapJson(plan, { ...s, edgeIds: ['v0-v1'] })).toThrow(/current cut draft/);
    const broken = structuredClone(plan);
    broken.complex.faces[0]!.vertices.reverse();
    expect(() => seamMapJson(broken, s)).toThrow();
    const shifted = structuredClone(plan);
    const copies = shifted.complex.vertices.filter((v) => v.sourceId === 'v1');
    copies[0]!.position[0] += 0.1;
    expect(() => seamMapJson(shifted, s)).toThrow(/different 3D/);
    const duplicate = structuredClone(plan);
    duplicate.seams[0]!.vertexPairs[1] = duplicate.seams[0]!.vertexPairs[0];
    expect(() => seamMapJson(duplicate, s)).toThrow(/cover both sides/);
    const boundary = structuredClone(plan);
    boundary.boundary.reverse();
    expect(() => seamMapJson(boundary, s)).toThrow(/Stored boundary/);
  });
  it('honours cancellation', () => {
    const g = tetra();
    expect(() =>
      buildCutDisk(surface, g, settings(g, ['v0-v1']), { cancelled: () => true })
    ).toThrowError(expect.objectContaining({ name: 'AbortError' }));
  });
});
describe('generated cube/sphere presets and project contract', () => {
  function source(kind: 'cube' | 'sphere', family: PatternFamily = 'quad') {
    const p = createProject();
    const surface = { ...p.surface, kind, size: 0.12, revision: `preset:${kind}` };
    return {
      surface,
      graph: generatePattern({
        ...p,
        surface,
        parameters: { ...p.parameters, family, spacing: 0.04, relaxation: 0 },
      }).graph,
    };
  }
  it.each(['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)(
    'cube cross preset validates on %s',
    (family) => {
      const p = source('cube', family),
        ids = cubeCrossCut(p.surface, p.graph),
        r = generateCutPlan({ ...p, preset: 'cube-cross' });
      expect(ids.length).toBeGreaterThan(0);
      expect(r.ok, r.ok ? '' : r.reason).toBe(true);
      if (r.ok)
        expect(r.plan.statistics).toMatchObject({ euler: 1, components: 1, boundaryComponents: 1 });
    }
  );
  it.each(['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)(
    'sphere graph-meridian validates on %s',
    (family) => {
      const p = source('sphere', family),
        ids = sphereMeridianCut(p.surface, p.graph),
        r = generateCutPlan({ ...p, preset: 'sphere-meridian' });
      expect(new Set(ids).size).toBe(ids.length);
      expect(r.ok, r.ok ? '' : r.reason).toBe(true);
      // The preset prefers one path that descends at every sample, which can be knitted.
      expect(() => sphereCutPath(p.surface, p.graph, ids)).not.toThrow();
    }
  );
  it('persists only cut inputs, leaving the geometric signature and undo intact', () => {
    const p = source('sphere'),
      r = generateCutPlan({ ...p, preset: 'sphere-meridian' });
    if (!r.ok) throw new Error(r.reason);
    const base = { ...createProject(), ...p },
      next = { ...base, knit: { ...defaultKnitSettings(), cut: r.plan.settings } };
    expect(parseProject(serializeProject(next)).knit?.cut).toEqual(r.plan.settings);
    expect(scientificSignature(base)).toBe(scientificSignature(next));
    let h = historyReducer({ past: [], present: base, future: [] }, { type: 'commit', next });
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.knit).toBeUndefined();
    expect(() =>
      validateKnitSettings({ ...next.knit, cut: { ...r.plan.settings, edgeIds: ['a', 'a'] } })
    ).toThrow(/unique/);
  });
});
