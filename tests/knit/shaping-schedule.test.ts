import { describe, expect, it } from 'vitest';
import { TWO } from '../../src/knit/keys';
import { imageIndex } from '../../src/knit/grid';
import type { ShapePlacement } from '../../src/knit/shape-types';
import type { ScheduleEvent, ScheduleSource } from '../../src/knit/schedule-types';
import {
  buildShapingSchedule,
  shapingScheduleJson,
  validateScheduleLimits,
  SCHEDULE_DEFAULTS,
} from '../../src/knit/shaping-schedule';
import { validateSchedule } from '../../src/knit/schedule-replay';
import { createProject } from '../../src/app/project';
import { withKey, defaultKnitSettings } from '../../src/knit/settings';
import { buildKnitProgram } from '../../src/knit/program';
import { transitionSource } from '../../src/knit/transition-plan';
import { bmpBytes } from '../../src/knit/files';

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
function source(
  placements = [place('a', 0, 2), place('b', 1, 1, ['a']), place('c', 2, 0, ['b'])],
  h = 3,
  w = 3
): ScheduleSource {
  const placementAt = new Int32Array(w * h).fill(-1),
    rows = new Uint16Array(w * h);
  placements.forEach((p, i) => {
    placementAt[imageIndex(w, h, p.needle, p.course)] = i;
    rows[p.course * w + p.needle] = 1;
  });
  return {
    program: {
      w,
      h,
      key: TWO,
      cells: new Uint8Array(w * h),
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
            id: 'both',
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
    surface: { kind: 'plane', revision: 'schedule-test' },
    signature: 'schedule-test',
    referenceMethod: 'analytic test fixture',
    blockers: ['Original two-guide transfer blocker stays.'],
  };
}
describe('carried-state whole-program schedule assembly', () => {
  it('reports unreadable later source symbols with their verified prefix instead of throwing', () => {
    for (const bad of [
      undefined,
      { id: 'missing-steps', steps: null },
      { id: 'null-step', steps: [null] },
    ]) {
      const input = source();
      input.program.operations!.rows[4] = bad ? 2 : 999;
      if (bad) input.program.operations!.symbols.push(bad as never);
      const r = buildShapingSchedule(input);
      expect(r.status).toBe('unsupported');
      expect(r.complete).toBe(false);
      expect(r.stop!.pass).toBe(1);
      expect(r.validation).toMatchObject({ ok: true, complete: false, completedPasses: 1 });
    }
  });
  it('repairs successive relocations without replaying the original failed prefixes', () => {
    const input = source(),
      before = structuredClone(input),
      r = buildShapingSchedule(input);
    expect(r.status).toBe('complete');
    expect(r.complete).toBe(true);
    expect(r.validation).toMatchObject({
      ok: true,
      complete: true,
      completedPasses: 3,
      matchedParents: 6,
    });
    expect(r.transitions.map((t) => t.phases)).toEqual([4, 4]);
    expect(r.events.filter((e) => e.kind === 'source-pass').map((e) => e.pass)).toEqual([0, 1, 2]);
    expect(r.events).toHaveLength(11);
    expect(r.validation.final.flatMap((s) => s.loops.map((l) => l.id)).sort()).toEqual([
      'back-layer:c',
      'front-layer:c',
    ]);
    expect(r.source.programBlockers).toEqual(input.blockers);
    expect(input).toEqual(before);
    expect(validateSchedule(input, r.events).ok).toBe(true);
    expect(
      validateSchedule(input, [
        { kind: 'source-pass', pass: 0 },
        { kind: 'source-pass', pass: 1 },
      ]).ok
    ).toBe(false);
  });
  it('keeps unused held loops at their final positions through successive transitions', () => {
    const r = buildShapingSchedule(
      source([
        place('a', 0, 1),
        place('hold', 0, 2),
        place('b', 1, 0, ['a']),
        place('c', 2, 1, ['b']),
      ])
    );
    expect(r.complete).toBe(true);
    expect(r.transitions.map((t) => t.heldLoops)).toEqual([2, 2]);
    for (const bed of ['front', 'back'] as const)
      expect(
        r.validation.final.find((s) => s.bed === bed && s.needle === 2)?.loops.map((l) => l.id)
      ).toEqual([`${bed}-layer:hold`]);
  });
  it('preserves valid tucks on held loops, followed by a declared decrease', () => {
    const input = source([place('a', 0, 0), place('t', 1, 0), place('b', 2, 0, ['a', 't'])]);
    input.program.operations!.symbols.push({
      id: 'tucks',
      steps: [
        { kind: 'tuck', guide: 1, bed: 'front' },
        { kind: 'tuck', guide: 2, bed: 'back' },
      ],
    });
    input.program.operations!.rows[3] = 2;
    const r = buildShapingSchedule(input);
    expect(r.complete).toBe(true);
    expect(r.stats.addedPhases).toBe(0);
    expect(r.canonical).toEqual(input.program.operations);
    expect(r.transitions[0]!.heldLoops).toBe(2);
    expect(r.validation.matchedParents).toBe(6);
  });
  it('stops at an incompatible tuck instead of changing the source action', () => {
    const input = source();
    input.program.operations!.symbols[1]!.steps[0]!.kind = 'tuck';
    const r = buildShapingSchedule(input);
    expect(r.complete).toBe(false);
    expect(r.status).toBe('unsupported');
    expect(r.validation).toMatchObject({ ok: true, complete: false, completedPasses: 1 });
    expect(r.stop!.message).toMatch(/tuck consumes no parents/);
    expect(r.canonical!.symbols[1]!.steps[0]!.kind).toBe('tuck');
  });
  it('retains an independently verified prefix when fixed-held targets conflict', () => {
    const r = buildShapingSchedule(
      source([
        place('a', 0, 0),
        place('hold', 0, 1),
        place('b', 1, 1, ['a']),
        place('c', 2, 1, ['b']),
      ])
    );
    expect(r.status).toBe('unsupported');
    expect(r.stop).toMatchObject({ pass: 1 });
    expect(r.stop!.message).toContain('Fixed-held target conflict');
    expect(r.validation).toMatchObject({
      ok: true,
      complete: false,
      completedPasses: 1,
      checkedEvents: 1,
    });
    expect(r.events).toEqual([{ kind: 'source-pass', pass: 0 }]);
  });
  it('keeps valid added phases before a source pass that cannot be replayed, without claiming that pass completed', () => {
    const input = source();
    input.program.operations!.symbols.push({
      id: 'knit-and-drop',
      steps: [...input.program.operations!.symbols[1]!.steps, { kind: 'drop', bed: 'front' }],
    });
    input.program.operations!.rows[4] = 2;
    const r = buildShapingSchedule(input);
    expect(r.status).toBe('unsupported');
    expect(r.complete).toBe(false);
    expect(r.events.filter((e) => e.kind === 'transfer-phase')).toHaveLength(4);
    expect(r.validation).toMatchObject({
      ok: true,
      complete: false,
      completedPasses: 1,
      checkedEvents: 5,
    });
    expect(r.validation.final.every((s) => s.needle === 1)).toBe(true);
    expect(r.canonical!.symbols[2]!.steps.at(-1)!.kind).toBe('drop');
  });
  it('distinguishes per-transition and aggregate computational cutoffs from impossibility', () => {
    for (const limits of [
      { perTransition: { maxStates: 1 } },
      { maxTotalMoves: 1 },
      { maxAddedPhases: 3 },
    ]) {
      const r = buildShapingSchedule(source(), limits);
      expect(r.status).toBe('limit');
      expect(r.complete).toBe(false);
      expect(r.validation).toMatchObject({ ok: true, completedPasses: 1 });
      expect(r.transitions[0]!.proof).toBeUndefined();
    }
    const r = buildShapingSchedule(source(), { maxAddedPhases: 4 });
    expect(r.status).toBe('limit');
    expect(r.stop!.pass).toBe(2);
    expect(r.stats.addedPhases).toBe(4);
    expect(r.validation.completedPasses).toBe(2);
    expect(r.stop!.message).toContain('Aggregate added-phase budget');
  });
  it('can finish zero-cost transitions after the aggregate phase or move budget is fully consumed', () => {
    const input = source([place('a', 0, 2), place('b', 1, 1, ['a']), place('c', 2, 1, ['b'])]);
    const baseline = buildShapingSchedule(input);
    expect(baseline.complete).toBe(true);
    const r = buildShapingSchedule(input, {
      maxAddedPhases: 4,
      maxTotalMoves: baseline.stats.testedMoves,
    });
    expect(r.complete).toBe(true);
    expect(r.transitions.map((t) => t.phases)).toEqual([4, 0]);
    expect(r.stats.testedMoves).toBe(baseline.stats.testedMoves);
  });
  it('keeps original knitting directions, source symbols and guide assignments', () => {
    const input = source();
    input.program.firstDir = -1;
    input.program.operations!.firstDir = -1;
    const r = buildShapingSchedule(input);
    expect(r.complete).toBe(true);
    const data = JSON.parse(shapingScheduleJson(r));
    expect(data.canonical.passes.map((p: { direction: number }) => p.direction)).toEqual([
      -1, 1, -1,
    ]);
    expect(data.canonical.symbols).toEqual(input.program.operations!.symbols);
    expect(data.canonical.rows).toEqual(Array.from(input.program.operations!.rows));
    expect(r.stats.addedPhases).toBe(8);
  });
  it('supports a one-pass symbolic start without claiming cast-on or finishing', () => {
    const r = buildShapingSchedule(source([place('a', 0, 0)], 1));
    expect(r.complete).toBe(true);
    expect(r.events).toHaveLength(1);
    expect(r.transitions).toEqual([]);
    expect(r.validation.final).toHaveLength(2);
  });
  it('rejects malformed source/limits and supports cancellation without changing inputs', () => {
    for (const limits of [
      null,
      { bad: 1 },
      { maxTotalMoves: 0 },
      { maxAddedPhases: 16385 },
      { perTransition: { maxMoves: 1.5 } },
    ])
      expect(buildShapingSchedule(source(), limits as never).status).toBe('invalid');
    expect(validateScheduleLimits()).toEqual(SCHEDULE_DEFAULTS);
    const bad = source();
    bad.program.settings.layerModel = undefined;
    expect(buildShapingSchedule(bad).status).toBe('unsupported');
    const input = source(),
      before = structuredClone(input);
    let calls = 0;
    expect(() => buildShapingSchedule(input, {}, { cancelled: () => ++calls > 12 })).toThrow(
      /cancelled/i
    );
    expect(input).toEqual(before);
  });
  it('exports one-based replayable events, source/reference provenance and honest completion/stale flags', () => {
    const input = source(),
      r = buildShapingSchedule(input),
      data = JSON.parse(shapingScheduleJson(r, true));
    expect(data).toMatchObject({
      format: 'knit-shaping-schedule',
      version: 1,
      complete: true,
      stale: true,
      status: 'complete',
    });
    expect(data.source.programBlockers).toEqual(input.blockers);
    expect(data.reference[0]).toMatchObject({ pass: 1, needle: 3 });
    const events: ScheduleEvent[] = data.events.map((e: ScheduleEvent) =>
      e.kind === 'source-pass'
        ? { ...e, pass: e.pass - 1 }
        : {
            ...e,
            beforePass: e.beforePass - 1,
            phase: {
              ...e.phase,
              transfers: e.phase.transfers.map((t) => ({ ...t, needle: t.needle - 1 })),
            },
          }
    );
    expect(validateSchedule(input, events)).toEqual(r.validation);
    expect(data.events.map((e: { event: number }) => e.event)).toEqual(
      Array.from({ length: r.events.length }, (_, i) => i + 1)
    );
    const partial = JSON.parse(
      shapingScheduleJson(buildShapingSchedule(input, { maxAddedPhases: 4 }))
    );
    expect(partial).toMatchObject({ complete: false, status: 'limit', stop: { pass: 3 } });
    expect(partial.validation.completedPasses).toBe(2);
  });
  it('does not alter actual plane program bytes, project settings or original export gates', () => {
    const project = createProject();
    project.surface = { kind: 'plane', size: 0.1, curvature: 0, revision: 'schedule-plane' };
    project.swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
    project.knit = {
      ...withKey({ ...defaultKnitSettings(), mode: 'shape' }, TWO.id).settings,
      layerModel: 'shared-reference-v1',
    };
    const built = buildKnitProgram(project);
    if (!built.ok) throw new Error(built.reason);
    const p = built.program,
      before = bmpBytes(p),
      settings = structuredClone(project.knit);
    const r = buildShapingSchedule(transitionSource(p, project.surface));
    expect(r.complete).toBe(true);
    expect(r.stats.addedPhases).toBe(0);
    expect(r.validation.completedPasses).toBe(p.h);
    expect(bmpBytes(p)).toEqual(before);
    expect(project.knit).toEqual(settings);
    expect(p.exportBlockers).toEqual([]);
  });
});
