import { describe, expect, it } from 'vitest';
import { TWO } from '../../src/knit/keys';
import { imageIndex } from '../../src/knit/grid';
import { inspectLayerGraph, type LayerProgram } from '../../src/knit/layer-graph';
import { checkTransferPhases } from '../../src/knit/transfer-phases';
import {
  planTransition,
  prepareTransition,
  transitionPlanJson,
  transitionSource,
  type TransitionSource,
} from '../../src/knit/transition-plan';
import { createProject } from '../../src/app/project';
import { defaultKnitSettings, withKey } from '../../src/knit/settings';
import { buildKnitProgram } from '../../src/knit/program';
import { bmpBytes } from '../../src/knit/files';
import type { ShapePlacement } from '../../src/knit/shape-types';

// Synthetic geometry and grid test values, not measured gauges or machine specifications.
const place = (
  id: string,
  course: number,
  needle: number,
  parents: string[] = []
): ShapePlacement => ({
  loop: {
    id,
    uv: [needle / 3, course / 3],
    position: [needle * 0.01, course * 0.01, 0],
    across: needle * 0.01,
  },
  course,
  needle,
  parents,
  role: 'loop',
});
function fixture(
  placements = [place('a', 0, 1), place('b', 1, 0, ['a'])],
  h = 2
): TransitionSource {
  const w = 3,
    placementAt = new Int32Array(w * h).fill(-1),
    rows = new Uint16Array(w * h);
  placements.forEach((p, i) => {
    placementAt[imageIndex(w, h, p.needle, p.course)] = i;
    rows[p.course * w + p.needle] = 1;
  });
  return {
    program: {
      w,
      h,
      cells: new Uint8Array(w * h),
      key: TWO,
      firstDir: 1,
      settings: { mode: 'shape', layerModel: 'shared-reference-v1' },
      shape: { placementAt, needles: { placements, moves: [] } },
      operations: {
        w,
        h,
        guides: 2,
        firstDir: 1,
        rows,
        symbols: [
          { id: 'empty', steps: [] },
          {
            id: 'two',
            steps: [
              { kind: 'knit', guide: 1, bed: 'front' },
              { kind: 'knit', guide: 2, bed: 'back' },
            ],
          },
        ],
        clusters: [],
        fills: [],
      },
    },
    surface: { kind: 'plane', revision: 'analytic-test' },
    signature: 'analytic-test',
    referenceMethod: 'analytic test fixture',
    blockers: ['Existing program blocker retained.'],
  };
}
describe('selected two-layer transition preparation and artifacts', () => {
  it('uses actual prefix occupancy despite later failures, and independently finds the paired relocation', () => {
    const source = fixture(),
      snapshot = structuredClone(source);
    expect(inspectLayerGraph(source.program, source.surface).counts.failed).toBeGreaterThan(0);
    const r = planTransition(source, 2, {});
    expect(r.status).toBe('found');
    expect(r.search!.phases.length).toBe(4);
    expect(r.search!.validation!.ok).toBe(true);
    expect(r.request.initial!.map((s) => s.needle)).toEqual([1, 1]);
    expect(r.request.expected!.map((s) => s.needle)).toEqual([0, 0]);
    expect(r.source.programBlockers).toEqual(source.blockers);
    expect(source).toEqual(snapshot);
  });
  it('rejects invalid histories before the chosen transition, while the earlier valid prefix stays usable', () => {
    const source = fixture([place('a', 0, 1), place('b', 1, 0, ['a']), place('c', 2, 0, ['b'])], 3);
    const early = inspectLayerGraph(source.program, source.surface, undefined, 2);
    expect(early.prefix!.findings).toEqual([]);
    expect(early.findings.length).toBeGreaterThan(0);
    expect(prepareTransition(source, 2).status).toBe('ready');
    const later = prepareTransition(source, 3);
    expect(later.status).toBe('unsupported');
    expect(later.prefixFindings.some((f) => f.title === 'parent histories differ')).toBe(true);
    expect(later.initial).toBeNull();
  });
  it('detects missing preceding stitches before the final replay sweep', () => {
    const source = fixture();
    source.program.operations!.rows[1] = 0;
    const r = prepareTransition(source, 2);
    expect(r.status).toBe('unsupported');
    expect(r.prefixFindings.some((f) => f.title === 'required layer stitch missing')).toBe(true);
  });
  it('preserves every unused held loop at its original final bed and needle', () => {
    const source = fixture([place('a', 0, 1), place('hold', 0, 2), place('b', 1, 0, ['a'])]);
    const r = planTransition(source, 2, {});
    expect(r.status).toBe('found');
    expect(r.request.heldLoops).toBe(2);
    for (const bed of ['front', 'back'] as const) {
      const held = r.request.expected!.find((s) => s.bed === bed && s.needle === 2)!;
      expect(held.loops.map((l) => l.id)).toEqual([`${bed}-layer:hold`]);
    }
    expect(r.search!.validation!.ok).toBe(true);
  });
  it('reports a fixed-held target conflict as unsupported, never as an unreachable proof', () => {
    const r = planTransition(
      fixture([place('a', 0, 1), place('hold', 0, 2), place('b', 1, 2, ['a'])]),
      2,
      {}
    );
    expect(r.status).toBe('unsupported');
    expect(r.search).toBeNull();
    expect(r.issues.join(' ')).toContain('fixed-held target cannot be constructed');
  });
  it('keeps empty-parent slots empty and refuses to park an unused loop there', () => {
    const r = prepareTransition(fixture([place('a', 0, 1), place('b', 1, 1)]), 2);
    expect(r.status).toBe('unsupported');
    expect(r.heldLoops).toBe(2);
  });
  it('rejects missing required live parents and defective reference ancestry', () => {
    const dropped = fixture();
    dropped.program.operations!.symbols[1]!.steps.push({ kind: 'drop', bed: 'front' });
    expect(
      prepareTransition(dropped, 2).prefixFindings.some(
        (f) => f.title === 'incoming layer inventory differs'
      )
    ).toBe(true);
    const invalid = fixture([place('a', 0, 1), place('b', 1, 0, ['unknown'])]);
    expect(
      prepareTransition(invalid, 2).prefixFindings.some(
        (f) => f.title === 'invalid reference ancestry'
      )
    ).toBe(true);
  });
  it('rejects dropped prior leaves even when the next pass does not consume them', () => {
    const source = fixture([place('a', 0, 1), place('hold', 0, 2), place('b', 1, 1, ['a'])]);
    source.program.operations!.symbols.push({
      id: 'drop-held',
      steps: [
        { kind: 'knit', guide: 1, bed: 'front' },
        { kind: 'knit', guide: 2, bed: 'back' },
        { kind: 'drop', bed: 'front' },
      ],
    });
    source.program.operations!.rows[2] = 2;
    const r = prepareTransition(source, 2);
    expect(r.status).toBe('unsupported');
    expect(r.prefixFindings.some((f) => f.title === 'incoming layer inventory differs')).toBe(true);
    expect(r.initial).toBeNull();
  });
  it('validates pass, grid, enabled model, unsupported surfaces and limits', () => {
    for (const pass of [0, 1, 3, NaN, 1.5])
      expect(prepareTransition(fixture(), pass).status).toBe('invalid');
    const disabled = fixture();
    disabled.program.settings.layerModel = undefined;
    expect(prepareTransition(disabled, 2).status).toBe('unsupported');
    const closed = fixture();
    closed.surface.kind = 'sphere';
    expect(prepareTransition(closed, 2).status).toBe('unsupported');
    const malformed = fixture();
    malformed.program.w = 0;
    expect(prepareTransition(malformed, 2).status).toBe('invalid');
    expect(() => planTransition(fixture(), 2, { maxMoves: 0 })).toThrow(/maxMoves/);
  });
  it('supports cancellation and does not expose aliases to captured live state', () => {
    expect(() => planTransition(fixture(), 2, {}, { cancelled: () => true })).toThrow(/cancelled/);
    const source = fixture(),
      g = inspectLayerGraph(source.program, source.surface, undefined, 2);
    const original = structuredClone(g.prefix!.live);
    g.live[0]!.loops.push('mutation');
    expect(g.prefix!.live).toEqual(original);
  });
  it('exports one-based slots/phases/diagnostic cells with a replayable target and honest blockers', () => {
    const r = planTransition(fixture(), 2, {}),
      data = JSON.parse(transitionPlanJson(r, true));
    expect(data).toMatchObject({
      format: 'knit-transfer-plan',
      version: 1,
      stale: true,
      request: { beforePass: 2, width: 3, height: 2 },
    });
    expect(data.request.initial[0].needle).toBe(2);
    expect(data.request.expected[0].needle).toBe(1);
    const convert = (slots: NonNullable<typeof r.search>['initial']) =>
      slots.map((s) => ({ ...s, needle: s.needle - 1 }));
    expect(
      checkTransferPhases({
        width: data.request.width,
        initial: convert(data.search.initial),
        expected: convert(data.search.expected),
        phases: data.search.phases.map((p: NonNullable<typeof r.search>['phases'][number]) => ({
          ...p,
          transfers: p.transfers.map((t) => ({ ...t, needle: t.needle - 1 })),
        })),
      }).ok
    ).toBe(true);
    const source = fixture([place('a', 0, 1), place('b', 1, 0, ['a']), place('c', 2, 0, ['b'])], 3);
    const bad = JSON.parse(transitionPlanJson(planTransition(source, 3, {})));
    expect(bad.request.prefixFindings[0].cells).toEqual([[1, 2]]);
  });
  it('makes a cloneable minimal source and leaves real plane outputs byte-identical after a zero-phase analysis', () => {
    const project = createProject();
    project.surface = { kind: 'plane', size: 0.1, curvature: 0, revision: 'test' };
    project.swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
    project.knit = {
      ...withKey({ ...defaultKnitSettings(), mode: 'shape' }, TWO.id).settings,
      layerModel: 'shared-reference-v1',
    };
    const build = buildKnitProgram(project);
    if (!build.ok) throw new Error(build.reason);
    const p = build.program,
      before = bmpBytes(p),
      source = transitionSource(p, project.surface);
    expect(() => structuredClone(source)).not.toThrow();
    expect(Object.keys(source.program.shape!).sort()).toEqual(['needles', 'placementAt']);
    expect((source.program as LayerProgram & { mapping?: unknown }).mapping).toBeUndefined();
    const r = planTransition(source, 2, {});
    expect(r.status).toBe('found');
    expect(r.search!.phases).toEqual([]);
    expect(r.search!.validation!.ok).toBe(true);
    expect(bmpBytes(p)).toEqual(before);
    expect(p.exportBlockers).toEqual([]);
  });
});
