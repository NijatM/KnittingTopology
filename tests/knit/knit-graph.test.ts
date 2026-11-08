import { describe, it, expect } from 'vitest';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings, validateKnitSettings } from '../../src/knit/settings';
import { bmpBytes } from '../../src/knit/files';
import {
  checkBlockers,
  checkKnitGraph,
  freshStages,
  knitGraphFreshness,
  loadStage,
  parseStageFile,
  stageFileText,
  validateKnitGraph,
} from '../../src/knit/knit-graph';
import { knitReport } from '../../src/knit/report';
import { historyReducer } from '../../src/app/project';
import type { KnitGraphStages, KnitSettings, SurfaceSpec } from '../../src/core/types';

// Test values (not lab measurements): 6 mm stitch width, 4 mm course height.
const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'kg' };
const saddle: SurfaceSpec = { kind: 'saddle', size: 0.1, curvature: 1, revision: 'kg' };
const knit = (extra: Partial<KnitSettings> = {}): KnitSettings => ({
  ...defaultKnitSettings(),
  mode: 'shape',
  ...extra,
});
function build(surface: SurfaceSpec, settings: KnitSettings) {
  const r = buildKnitProgram({ surface, graph: null, swatches, knit: settings });
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const stagesOf = (p: ReturnType<typeof build>) =>
  validateKnitGraph(clone(p.shape!.knitGraph!.stages));

describe('knit graph stages', () => {
  it('extracts both stages and rebuilds the same bitmap from them after a project round trip', () => {
    // Right to left: this test saddle blocks a left-to-right start at its cast-on (turn-pairing tests).
    const rtl = knit({ lab: { ...defaultKnitSettings().lab, firstPass: 'right-to-left' } }),
      p = build(saddle, rtl),
      stages = stagesOf(p);
    expect(p.shape!.needles.steps.some((s) => s.role === 'turn')).toBe(true);
    expect(p.shape!.knitGraph!.saved).toEqual({ courses: false, loops: false });
    expect(stages.courses.courses).toHaveLength(p.h);
    expect(stages.loops!.loops).toHaveLength(p.shape!.needles.placements.length);
    const settings = validateKnitSettings(clone({ ...rtl, graph: stages }));
    expect(knitGraphFreshness({ surface: saddle, knit: settings, swatches })).toMatchObject({
      courses: 'fresh',
      loops: 'fresh',
    });
    const again = build(saddle, settings);
    expect(again.shape!.knitGraph!.saved).toEqual({ courses: true, loops: true });
    expect(bmpBytes(again)).toEqual(bmpBytes(p));
    expect(again.exportBlockers).toEqual([]);
  }, 30000);

  it('marks stages stale when an input changes and never reuses them', () => {
    const stages = stagesOf(build(plane, knit()));
    const state = (s: SurfaceSpec, k: KnitSettings, sw = swatches) =>
      knitGraphFreshness({ surface: s, knit: { ...k, graph: stages }, swatches: sw });
    expect(state(plane, knit())).toMatchObject({ courses: 'fresh', loops: 'fresh' });
    for (const changed of [
      state({ ...plane, size: 0.11 }, knit()),
      state({ ...plane, revision: 'other' }, knit()),
      state(plane, knit({ startEdge: 'u1' })),
      state(plane, knit(), [{ ...swatches[0]!, stitchWidth: 0.007 }]),
      state(plane, knit({ courseMethod: 'popescu-2019-rules' })),
    ])
      expect(changed).toMatchObject({ courses: 'stale', loops: 'stale' });
    // The first pass only enters the loops stage.
    const lab = { ...defaultKnitSettings().lab, firstPass: 'right-to-left' as const };
    expect(state(plane, knit({ lab }))).toMatchObject({ courses: 'fresh', loops: 'stale' });
    expect(
      freshStages({ surface: plane, knit: knit({ lab, graph: stages }), swatches })?.loops
    ).toBeUndefined();
    // A stale saved stage blocks operation export; a rebuild from fresh inputs does not reuse it.
    const stale = build({ ...plane, size: 0.11 }, knit({ graph: stages }));
    expect(stale.shape!.knitGraph!.saved).toEqual({ courses: false, loops: false });
  }, 30000);

  it('downloads and loads stage files only for matching inputs', () => {
    const stages = stagesOf(build(plane, knit())),
      project = { surface: plane, knit: knit(), swatches };
    const courses = parseStageFile(stageFileText(stages.courseMethod, stages.courses));
    const loops = parseStageFile(stageFileText(stages.courseMethod, stages.loops!));
    expect(() => loadStage(project, loops)).toThrow(/courses stage first/);
    const withCourses = loadStage(project, courses);
    expect(withCourses.courses).toEqual(stages.courses);
    expect(loadStage({ ...project, knit: knit({ graph: withCourses }) }, loops)).toEqual(stages);
    expect(() => loadStage({ ...project, surface: { ...plane, size: 0.2 } }, courses)).toThrow(
      /other inputs/
    );
    expect(() =>
      loadStage({ ...project, knit: knit({ courseMethod: 'popescu-2019-rules' }) }, courses)
    ).toThrow(/another course method/);
    const text = stageFileText(stages.courseMethod, stages.courses);
    expect(() => parseStageFile(text.replace(stages.courses.fingerprint, 'courses-0'))).toThrow();
    expect(() => parseStageFile('{"format":"other"}')).toThrow(/knit-graph-stage/);
  }, 30000);

  it('reports synthetic rule violations as export blockers', () => {
    const stages = stagesOf(build(plane, knit()));
    expect(checkBlockers(checkKnitGraph(stages))).toEqual([]);
    const bad: KnitGraphStages = clone(stages);
    bad.courses.vertices.push(bad.courses.vertices[0]!);
    const loop = bad.loops!.loops.find((l) => l.parents.length)!;
    loop.parents = ['missing-loop'];
    const checks = checkKnitGraph(bad);
    expect(checks.find((c) => c.id === 'duplicate-vertices')?.violations).toBeGreaterThan(0);
    expect(checks.find((c) => c.id === 'parent-links')?.violations).toBeGreaterThan(0);
    expect(checkBlockers(checks).length).toBeGreaterThan(0);
  }, 30000);

  it('builds the Popescu connection-rules stages for a plane (all quads) and a widening chart', () => {
    const p = build(plane, knit({ courseMethod: 'popescu-2019-rules' })),
      g = p.shape!.knitGraph!;
    expect(p.exportBlockers).toEqual([]);
    expect(g.checks.every((c) => c.violations === 0)).toBe(true);
    expect(new Set(g.stages.loops!.primal!.faces.map((f) => f.kind))).toEqual(new Set(['quad']));
    expect(knitReport(p, 'kg', 0.1)).toContain('Course connection rule');
    // Reloading the saved stages reproduces the bitmap with the saved parent links.
    const again = build(plane, knit({ courseMethod: 'popescu-2019-rules', graph: stagesOf(p) }));
    expect(again.shape!.knitGraph!.saved).toEqual({ courses: true, loops: true });
    expect(bmpBytes(again)).toEqual(bmpBytes(p));
    expect(() =>
      validateKnitSettings({ ...knit(), popescu: { resultCount: 3, angleTolerance: 5 } })
    ).toThrow();
    expect(() =>
      validateKnitSettings({ ...knit(), popescu: { resultCount: 4, angleTolerance: 50 } })
    ).toThrow();
  }, 60000);

  it('rejects the Popescu method on closed surfaces', () => {
    const r = buildKnitProgram({
      surface: { kind: 'sphere', size: 0.1, curvature: 0, revision: 'kg' } as SurfaceSpec,
      graph: null,
      swatches,
      knit: knit({ courseMethod: 'popescu-2019-rules' }),
    });
    expect(r.ok).toBe(false);
  });

  it('saves stages as part of the present state, not as an undo step', () => {
    const stages = stagesOf(build(plane, knit()));
    const present = {
      surface: plane,
      knit: knit(),
      swatches,
      revision: 1,
    } as unknown as Parameters<typeof historyReducer>[0]['present'];
    const history = { past: [present], present: { ...present, revision: 2 }, future: [] };
    const next = historyReducer(history, { type: 'accept-knit-graph', graph: stages });
    expect(next.past).toBe(history.past);
    expect(next.present.knit?.graph).toEqual(stages);
    // Stages that do not match the present inputs are not saved.
    const other = historyReducer(
      { ...history, present: { ...history.present, surface: { ...plane, size: 0.2 } } },
      { type: 'accept-knit-graph', graph: stages }
    );
    expect(other.present.knit?.graph).toBeUndefined();
  }, 30000);
});
