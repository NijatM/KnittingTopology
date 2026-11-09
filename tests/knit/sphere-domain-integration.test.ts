import { describe, it, expect } from 'vitest';
import type { ProjectState, PatternFamily } from '../../src/core/types';
import {
  createProject,
  geometryChange,
  historyReducer,
  serializeProject,
  parseProject,
  scientificSignature,
  parametersMatchGraph,
} from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import { sphereDomain, surfacePatchCount } from '../../src/core/sphere-domain';
import { defaultKnitSettings, withKey } from '../../src/knit/settings';
import { TWO } from '../../src/knit/keys';
import { buildKnitProgram } from '../../src/knit/program';
import { bmpBytes, grammarJson } from '../../src/knit/files';
import { generateCutPlan } from '../../src/knit/cut-presets';
import {
  buildCutDisk,
  cutSourceSignature,
  inspectSphereSector,
  assertSeamPairs,
  seamMapJson,
} from '../../src/knit/cuts';
import { knitRequirements } from '../../src/knit/requirements';
import { requiresKnitCut } from '../../src/knit/surface-scope';
import { courseStageFingerprint } from '../../src/knit/knit-graph';
import { knitReport } from '../../src/knit/report';
import { describeMethod } from '../../src/learning/citations';

// All fixture dimensions and loop sizes are test values, not measured gauges or machine settings.
const gauge = { stitchWidth: 0.006, courseHeight: 0.004 };
function fixture(opening = 0.04, fraction = 1, family: PatternFamily = 'quad'): ProjectState {
  const p = createProject();
  p.surface = {
    kind: 'sphere',
    size: 0.18,
    curvature: 0,
    revision: `domain-${opening}-${fraction}-${family}`,
    ...(opening ? { poleOpeningDiameter: opening } : {}),
    ...(fraction !== 1 ? { sphereFraction: fraction } : {}),
  };
  p.parameters = { ...p.parameters, spacing: 0.025, family };
  Object.assign(p, generatePattern(p));
  p.swatches = [{ structure: 'jersey', ...gauge }];
  p.knit = {
    ...defaultKnitSettings(),
    mode: 'shape',
    edges: { ...defaultKnitSettings().edges, structure: null },
    nodes: { ...defaultKnitSettings().nodes, structure: null },
  };
  return p;
}
function prepareCut(p: ProjectState) {
  const r = generateCutPlan({ surface: p.surface, graph: p.graph!, preset: 'sphere-meridian' });
  if (!r.ok) throw new Error(r.reason);
  p.knit = { ...p.knit!, cut: r.plan.settings };
  return r.plan;
}
function build(p: ProjectState) {
  const r = buildKnitProgram(p);
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}

describe('integrated polar openings and angular sectors', () => {
  it.each(['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as const)(
    'opens %s sphere bands into disks while preserving natural rims',
    (family) => {
      const p = fixture(0.06, 1, family),
        plan = prepareCut(p);
      expect(plan.statistics).toMatchObject({
        sourceEuler: 0,
        euler: 1,
        components: 1,
        boundaryComponents: 1,
      });
      expect(plan.naturalBoundaries!.length).toBe(
        p.graph!.edges.filter((e) => e.cells.length === 1).length
      );
      expect(plan.boundary.length).toBe(plan.naturalBoundaries!.length + 2 * plan.seams.length);
      expect(
        plan.seams.every(
          (s) => p.graph!.edges.find((e) => e.id === s.sourceEdgeId)!.cells.length === 2
        )
      ).toBe(true);
      expect(() => assertSeamPairs(plan)).not.toThrow();
      const file = JSON.parse(seamMapJson(plan, plan.settings));
      expect(file.naturalBoundaries.length).toBe(plan.naturalBoundaries!.length);
    }
  );
  it('rejects lost, repeated or falsely paired natural boundary metadata', () => {
    const p = fixture(),
      plan = prepareCut(p);
    const lost = { ...plan, naturalBoundaries: plan.naturalBoundaries!.slice(1) };
    expect(() => assertSeamPairs(lost)).toThrow(/cover/);
    expect(() =>
      assertSeamPairs({
        ...plan,
        naturalBoundaries: [...plan.naturalBoundaries!, plan.naturalBoundaries![0]!],
      })
    ).toThrow(/overlaps|differs/);
    expect(() =>
      assertSeamPairs({
        ...plan,
        naturalBoundaries: [...plan.naturalBoundaries!, plan.seams[0]!.sides[0]],
      })
    ).toThrow(/overlaps|differs/);
  });
  it('rejects selecting an existing open rim as a paired seam', () => {
    const p = fixture(),
      rim = p.graph!.edges.find((e) => e.cells.length === 1)!;
    const r = buildCutDisk(p.surface, p.graph!, {
      surfaceRevision: p.surface.revision,
      sourceSignature: cutSourceSignature(p.surface, p.graph!),
      preset: 'manual',
      edgeIds: [rim.id],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('natural rim boundary');
  });
  it.each([
    [0, 0.5],
    [0.04, 0.5],
    [0.04, 0.25],
    [0.04, 0.01],
  ])('knits sector opening=%s fraction=%s without an added closing seam', (opening, fraction) => {
    const p = fixture(opening, fraction);
    expect(inspectSphereSector(p.surface, p.graph!)).toMatchObject({
      euler: 1,
      components: 1,
      boundaryComponents: 1,
    });
    expect(requiresKnitCut(p.surface)).toBe(false);
    expect(knitRequirements(p).some((r) => r.id === 'cut')).toBe(false);
    for (const mode of ['shape', 'network', 'both'] as const) {
      p.knit = { ...p.knit!, mode };
      const b = build(p);
      expect(b.shape!.sphere!.domain!.fraction).toBe(fraction);
      expect(b.shape!.sphere!.seam.naturalBoundaries!.paired).toBe(false);
      expect(b.shape!.sphere!.seam.edges).toEqual([]);
      expect(b.shape!.needles.yarnJumps).toBe(0);
      expect(b.exportBlockers).toEqual([]);
      expect(() => bmpBytes(b)).not.toThrow();
      expect(() => grammarJson({ ...b, name: 'test', note: '' })).not.toThrow();
      const d = sphereDomain(p.surface);
      expect(
        b.shape!.needles.placements.every((x) => Math.abs(x.loop.position[2]) <= d.zMax + 1e-10)
      ).toBe(true);
      const report = knitReport(b, 'test values, not measured gauges', p.surface.size);
      expect(report).toContain('Open-sector meridian boundaries');
      expect(report).toContain(
        'Project construction; not the open-surface distance-contour connection method.'
      );
      expect(report).not.toContain('to be gathered closed');
    }
  });
  it('builds full polar bands with existing keys and distinguishes target vs sampled rims', () => {
    const p = fixture();
    prepareCut(p);
    for (const two of [false, true]) {
      const q = { ...p, knit: two ? withKey(p.knit!, TWO.id).settings : p.knit };
      const b = build(q);
      expect(b.shape!.sphere!.domain!.openingDiameter).toBe(0.04);
      expect(b.shape!.sphere!.domain!.actualOuterRingDiameters.every((x) => x > 0.04)).toBe(true);
      expect(b.shape!.sphere!.seam.naturalBoundaries).toBeUndefined();
      expect(b.exportBlockers).toEqual([]);
      const report = knitReport(b, 'test values, not measured gauges', p.surface.size);
      expect(report).toContain('Polar rims are not seam pairs');
      expect(report).toContain('Longest held loop');
      expect(report).not.toContain('to be gathered closed');
    }
  });
  it('retains cut prerequisites for full coverage and graph/measurement prerequisites for sectors', () => {
    const full = fixture();
    expect(knitRequirements(full).some((r) => r.id === 'cut')).toBe(true);
    const partial = fixture(0.04, 0.5);
    partial.graph = null;
    expect(knitRequirements(partial).map((r) => r.id)).toContain('network');
    partial.swatches = [];
    expect(knitRequirements(partial).map((r) => r.id)).toContain('measurement');
  });
  it('round-trips domain parameters, graph identities and measured programs through project JSON', () => {
    for (const fraction of [1, 0.5]) {
      const p = fixture(0.04, fraction);
      if (fraction === 1) prepareCut(p);
      const before = build(p),
        loaded = parseProject(serializeProject(p));
      expect(loaded.surface).toEqual(p.surface);
      expect(loaded.graph).toEqual(p.graph);
      expect(parametersMatchGraph(loaded)).toBe(true);
      expect(bmpBytes(build(loaded))).toEqual(bmpBytes(before));
    }
  });
  it('invalidates cuts, stages and signatures when either domain parameter changes', () => {
    const p = fixture();
    const plan = prepareCut(p);
    const altered = { ...p.surface, poleOpeningDiameter: 0.05 };
    expect(cutSourceSignature(altered, p.graph!)).not.toBe(plan.settings.sourceSignature);
    expect(buildCutDisk(altered, p.graph!, plan.settings).ok).toBe(false);
    expect(courseStageFingerprint(altered, p.knit!, gauge)).not.toBe(
      courseStageFingerprint(p.surface, p.knit!, gauge)
    );
    const sector = { ...p.surface, sphereFraction: 0.5 };
    expect(scientificSignature({ ...p, surface: sector })).not.toBe(scientificSignature(p));
    expect(courseStageFingerprint(sector, p.knit!, gauge)).not.toBe(
      courseStageFingerprint(p.surface, p.knit!, gauge)
    );
    expect(() => inspectSphereSector({ ...sector, revision: 'new' }, p.graph!)).toThrow(
      /different surface/
    );
  });
  it('clears domain-only fields on surface switches and restores them through undo', () => {
    const p = fixture(0.04, 0.5),
      next = geometryChange(p, { kind: 'plane' });
    expect(next.surface.poleOpeningDiameter).toBeUndefined();
    expect(next.surface.sphereFraction).toBeUndefined();
    expect(next.graph).toBeNull();
    let h = { past: [] as ProjectState[], present: p, future: [] as ProjectState[] };
    h = historyReducer(h, { type: 'commit', next });
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.surface).toEqual(p.surface);
    expect(h.present.graph).toEqual(p.graph);
    const reset = geometryChange(p, { poleOpeningDiameter: 0, sphereFraction: 1 });
    expect(reset.surface.poleOpeningDiameter).toBeUndefined();
    expect(reset.surface.sphereFraction).toBeUndefined();
    expect(surfacePatchCount(reset.surface)).toBe(6);
  });
  it('rejects invalid saved domains and unresolved tiny rings rather than silently flattening them', () => {
    const p = fixture(0.04, 0.5);
    for (const bad of [
      { poleOpeningDiameter: 0.18 },
      { sphereFraction: 0 },
      { sphereFraction: 1.1 },
      { poleOpeningDiameter: 1e-12 },
    ]) {
      const data = JSON.parse(serializeProject(p));
      Object.assign(data.project.surface, bad);
      expect(() => parseProject(JSON.stringify(data))).toThrow(
        /opening|fraction|numerically unresolved/
      );
    }
    expect(() => geometryChange(p, { size: 0.03 })).toThrow(/opening/);
  });
  it('reports modified-domain construction honestly in citation descriptions', () => {
    const p = fixture(0.04, 0.5),
      text = describeMethod(p.parameters, p.surface);
    expect(text).toContain('target polar opening diameter 0.04 m');
    expect(text).toContain('180 degrees');
    expect(text).not.toContain('shared cubical atlas');
  });
});
