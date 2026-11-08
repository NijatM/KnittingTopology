import { describe, it, expect } from 'vitest';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings, validateKnitSettings } from '../../src/knit/settings';
import { bmpBytes } from '../../src/knit/files';
import { knitReport } from '../../src/knit/report';
import {
  addSplit,
  moveSplit,
  pairByPosition,
  patchAt,
  patchSettings,
  patchSide,
  patchWindow,
  pieceBuild,
  removeSplit,
  seamMapJson,
  splitProblem,
  withPatchSettings,
} from '../../src/knit/patches';
import { courseStageFingerprint, knitGraphFreshness } from '../../src/knit/knit-graph';
import { applyCourseEdit, coursePoints, editContext } from '../../src/knit/knit-graph-edit';
import { buildShapeGeometry, rotatedShapeUV } from '../../src/knit/shape-geometry';
import { withMappings, withoutMappings } from '../../src/knit/client';
import type { KnitSettings, SurfaceSpec } from '../../src/core/types';

// Test values (not lab measurements): 6 mm stitch width, 4 mm course height; reverse jersey 9 mm × 4 mm.
const swatches = [
  { structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 },
  { structure: 'reverse', stitchWidth: 0.009, courseHeight: 0.004 },
];
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'pt' };
const saddle: SurfaceSpec = { kind: 'saddle', size: 0.1, curvature: 1, revision: 'pt' };
const knit = (extra: Partial<KnitSettings> = {}): KnitSettings => ({
  ...defaultKnitSettings(),
  mode: 'shape',
  ...extra,
});
const project = (surface: SurfaceSpec, settings: KnitSettings) => ({
  surface,
  graph: null,
  swatches,
  knit: settings,
});
function build(surface: SurfaceSpec, settings: KnitSettings) {
  const r = buildKnitProgram(project(surface, settings));
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('computational patches (Popescu 2019, §6.3.2)', () => {
  it('splits the chart into a grid numbered row by row and keeps settings by the project rules', () => {
    const base = knit({ startEdge: 'u0' });
    const one = addSplit(base, 'u', 0.4);
    expect(one.patches!.u).toEqual([0.4]);
    expect(one.patches!.patches.map((p) => p.startEdge)).toEqual(['u0', 'u0']);
    const two = addSplit(one, 'v', 0.5);
    expect(two.patches!.patches).toHaveLength(4);
    expect(patchWindow(two.patches!, 0)).toEqual({ u: [0, 0.4], v: [0, 0.5] });
    expect(patchWindow(two.patches!, 1)).toEqual({ u: [0.4, 1], v: [0, 0.5] });
    expect(patchWindow(two.patches!, 2)).toEqual({ u: [0, 0.4], v: [0.5, 1] });
    expect(patchAt(two.patches!, [0.7, 0.9])).toBe(3);
    // Give P2 its own settings, then remove the u split: the merged patches keep the left ones.
    const p2 = withPatchSettings(two, 1, { ...patchSettings(two, 1), startEdge: 'v1' });
    const merged = removeSplit(p2, 'u', 0);
    expect(merged.patches!.patches.map((p) => p.startEdge)).toEqual(['u0', 'u0']);
    const right = removeSplit(p2, 'v', 0);
    expect(right.patches!.patches.map((p) => p.startEdge)).toEqual(['u0', 'v1']);
    // The last split returns the remaining patch to the whole-chart settings.
    const whole = removeSplit(right, 'u', 0);
    expect(whole.patches).toBeUndefined();
    expect(whole.startEdge).toBe('u0');
    expect(splitProblem([0.4], 0.41)).toMatch(/0\.02 apart/);
    expect(splitProblem([], 1)).toMatch(/between 0 and 1/);
    expect(() => moveSplit(two, 'u', 0, 0.99)).toThrow(/0\.02 apart/);
    expect(validateKnitSettings(clone(p2))).toEqual(p2);
    expect(() =>
      validateKnitSettings({ ...clone(p2), patches: { ...clone(p2.patches!), patches: [] } })
    ).toThrow(/does not match/);
  });

  it('names each chart side of a patch in its own knitting frame', () => {
    const w = { u: [0, 0.5] as [number, number], v: [0, 1] as [number, number] };
    expect(patchSide({ startEdge: 'v0' }, w, 'v0')).toBe('start');
    expect(patchSide({ startEdge: 'v0' }, w, 'u0')).toBe('needle-1');
    expect(patchSide({ startEdge: 'v0' }, w, 'u1')).toBe('far');
    expect(patchSide({ startEdge: 'u1' }, w, 'u1')).toBe('start');
    expect(patchSide({ startEdge: 'u1' }, w, 'v0')).toBe('needle-1');
    expect(rotatedShapeUV([0.25, 0.5], 'v0', w)).toEqual([0.5, 0.5]);
  });

  it('builds each patch as its own piece; on a plane the counts are exact', () => {
    const settings = addSplit(knit(), 'u', 0.5);
    const program = build(plane, settings),
      pieces = program.patches!.pieces;
    expect(pieces).toHaveLength(2);
    // 50 mm across at 6 mm loops: ceil(8.33) = 9 needles; 100 mm along at 4 mm courses: 25 passes.
    for (const p of pieces) {
      if (!p.build.ok) throw new Error(p.build.reason);
      expect(p.build.program.exportBlockers).toEqual([]);
      expect(p.build.program.shape!.needles.placements.length).toBe(9 * 25);
      const across = p.build.program.shape!.geometry.courses[0]!.points.map((q) => q.across);
      expect(Math.max(...across)).toBeCloseTo(0.05, 12);
    }
    // P1's far side meets P2's needle-1 side: 25 course ends on each side, paired one to one.
    const [seam] = program.patches!.seams;
    expect(seam!.sides.map((s) => s.side)).toEqual(['far', 'needle-1']);
    expect(seam!.sides.map((s) => s.elements!.length)).toEqual([25, 25]);
    expect(seam!.pairs).toEqual(Array.from({ length: 25 }, (_, i) => [i, i]));
    expect(seam!.length).toBeCloseTo(0.1, 12);
    const text = seamMapJson(plane, settings.patches!, program.patches!.seams);
    expect(JSON.parse(text)).toMatchObject({ format: 'knit-patch-seam-map', version: 1 });
    // The report of a piece names it and lists every patch and seam.
    const second = pieceBuild(program.patches!, 1);
    if (!second.ok) throw new Error(second.reason);
    const report = knitReport(second.program, 'test', plane.size);
    expect(report).toContain('piece P2 of 2: chart u 0.5-1, v 0-1');
    expect(report).toContain(
      'P1 far side 25 course ends, P2 needle-1 side 25 course ends; 25 pairs'
    );
  });

  it('gives each patch its own direction, fill and stages; stages are fresh per patch', () => {
    let settings = addSplit(knit(), 'v', 0.5);
    settings = withPatchSettings(settings, 1, {
      ...patchSettings(settings, 1),
      startEdge: 'u0',
      cells: { ...settings.cells, fill: 'reverse' },
    });
    const program = build(saddle, settings),
      [p1, p2] = program.patches!.pieces;
    if (!p1!.build.ok || !p2!.build.ok)
      throw new Error(JSON.stringify([p1!.build, p2!.build].map((b) => (b.ok ? 'ok' : b.reason))));
    // P2 (u0, reverse jersey 9 mm) runs its needles along v: about 50 mm / 9 mm loops on a curved patch.
    expect(p2!.build.program.settings.startEdge).toBe('u0');
    expect(p1!.build.program.w).not.toBe(p2!.build.program.w);
    // A stage carries its patch rectangle in the fingerprint; the whole chart keeps the old one.
    const view = patchSettings(settings, 0),
      gauge = { stitchWidth: 0.006, courseHeight: 0.004 };
    expect(courseStageFingerprint(saddle, view, gauge, patchWindow(settings.patches!, 0))).not.toBe(
      courseStageFingerprint(saddle, view, gauge)
    );
    // Saved stages per patch are fresh only for their own patch.
    const stages = p1!.build.program.shape!.knitGraph!.stages;
    const saved = withPatchSettings(settings, 0, { ...view, graph: stages });
    const window = patchWindow(settings.patches!, 0);
    const state = (s: KnitSettings, w = window) =>
      knitGraphFreshness({ surface: saddle, knit: patchSettings(s, 0), swatches }, w)?.courses;
    expect(state(saved)).toBe('fresh');
    expect(state(saved, patchWindow(settings.patches!, 1))).toBe('stale');
    // Rebuilding from the saved stages gives the same bitmap.
    const again = build(saddle, saved).patches!.pieces[0]!.build;
    if (!again.ok) throw new Error(again.reason);
    expect(bmpBytes(again.program)).toEqual(bmpBytes(p1!.build.program));
    // A new split drops the stages of the divided patches only.
    const more = addSplit(saved, 'u', 0.5);
    expect(more.patches!.patches.every((p) => !p.graph)).toBe(true);
    const moved = moveSplit(saved, 'v', 0, 0.6);
    expect(moved.patches!.patches[0]!.graph).toBeUndefined();
  });

  it('edits a patch inside its rectangle', () => {
    const settings = addSplit(knit(), 'u', 0.5),
      window = patchWindow(settings.patches!, 1);
    const program = build(saddle, settings),
      p2 = program.patches!.pieces[1]!.build;
    if (!p2.ok) throw new Error(p2.reason);
    const stage = p2.program.shape!.knitGraph!.stages.courses,
      ctx = editContext(saddle, 'v0', window);
    // A point dragged outside the patch is kept on its rectangle; the needle-1 side is u = 0.5.
    const moved = applyCourseEdit(
      stage,
      'project-alignment',
      { op: 'move-point', course: 3, point: 0, uv: [0.1, 0.3] },
      ctx
    );
    const first = coursePoints(moved, 3)[0]!;
    expect(first.uv[0]).toBe(0.5);
    expect(first.across).toBe(0);
    expect(moved.courses[3]!.leftBoundary).toBe(true);
  });

  it('pairs seam elements by position and survives the worker transfer', () => {
    const { pairs, unpaired } = pairByPosition(
      [{ at: 0.1 }, { at: 0.3 }, { at: 0.5 }, { at: 0.9 }],
      [{ at: 0.12 }, { at: 0.7 }, { at: 0.95 }]
    );
    expect(pairs).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 2],
    ]);
    expect(unpaired).toEqual([[], []]);
    expect(
      pairByPosition([{ at: 0.1 }, { at: 0.15 }], [{ at: 0.1 }, { at: 0.9 }]).unpaired
    ).toEqual([[], [1]]);
    const settings = addSplit(knit(), 'u', 0.5),
      input = project(plane, settings),
      built = buildKnitProgram(input);
    const back = withMappings(clone(withoutMappings(built)), input);
    if (!back.ok) throw new Error(back.reason);
    const piece = pieceBuild(back.program.patches!, 1);
    if (!piece.ok) throw new Error(piece.reason);
    expect(piece.program.patches!.piece).toBe(1);
    expect(typeof piece.program.mapping.toGrid).toBe('function');
  });

  it('keeps patches to shape mode and leaves unsplit layouts unchanged', () => {
    const settings = { ...addSplit(knit(), 'u', 0.5), mode: 'both' as const };
    const r = buildKnitProgram(project(plane, settings));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/shape mode/);
    const whole = buildShapeGeometry(saddle, 0.006, 0.004, 'v0');
    const windowed = buildShapeGeometry(saddle, 0.006, 0.004, 'v0', undefined, undefined, {
      u: [0, 1],
      v: [0, 1],
    });
    expect(windowed.courses.map((c) => c.loops.length)).toEqual(
      whole.courses.map((c) => c.loops.length)
    );
  });
});
