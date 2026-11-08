import { describe, expect, it } from 'vitest';
import {
  checkTransferPhases,
  type TransferLoop,
  type TransferSlot,
} from '../../src/knit/transfer-phases';
import {
  planTransfers,
  validatePlanLimits,
  PLAN_DEFAULTS,
  PLAN_MAX,
  type TransferSearchResult,
} from '../../src/knit/transfer-planner';

// Synthetic logical slots and tokens, not measured gauges, native workspace or machine settings.
const F: TransferLoop = { id: 'front:a', layer: 'front-layer' },
  B: TransferLoop = { id: 'back:a', layer: 'back-layer' };
const slot = (
  bed: TransferSlot['bed'],
  needle: number,
  ...loops: TransferLoop[]
): TransferSlot => ({ bed, needle, loops });
const twoSheets = () => ({
  width: 2,
  initial: [slot('front', 1, F), slot('back', 1, B)],
  expected: [slot('front', 0, F), slot('back', 0, B)],
});
const unsafe = (input: unknown) => planTransfers(input as Parameters<typeof planTransfers>[0]);
function verify(result: TransferSearchResult) {
  expect(result.status).toBe('found');
  expect(result.validation?.ok).toBe(true);
  expect(result.phases.every((phase) => phase.transfers.length === 1)).toBe(true);
  expect(
    checkTransferPhases({
      width: result.width,
      initial: result.initial,
      expected: result.expected,
      phases: result.phases,
    }).ok
  ).toBe(true);
  expect(result.stats.retainedStates).toBeLessThanOrEqual(result.limits.maxStates);
  expect(result.stats.testedMoves).toBeLessThanOrEqual(result.limits.maxMoves);
  expect(result.phases.length).toBeLessThanOrEqual(result.limits.maxPhases);
}

/** Independent tiny-grid BFS over individual token locations, including all irreversible merges.
 * It uses neither planner atoms/heuristic/pruning nor the production phase checker for successors.
 */
function oracle(width: number, start: number[]): Map<string, number> {
  const queue = [start],
    distance = new Map([[start.join(','), 0]]);
  for (let q = 0; q < queue.length; q++) {
    const state = queue[q]!,
      depth = distance.get(state.join(','))!;
    for (const source of new Set(state))
      for (let needle = 0; needle < width; needle++) {
        const destination = (source < width ? width : 0) + needle,
          next = state.map((at) => (at === source ? destination : at)),
          key = next.join(',');
        if (!distance.has(key)) {
          distance.set(key, depth + 1);
          queue.push(next);
        }
      }
  }
  return distance;
}
function occupancy(width: number, positions: number[]): TransferSlot[] {
  const slots = new Map<number, TransferSlot>();
  positions.forEach((at, i) => {
    if (!slots.has(at))
      slots.set(at, { bed: at < width ? 'front' : 'back', needle: at % width, loops: [] });
    slots.get(at)!.loops.push({ id: `token:${i}`, layer: i % 2 ? 'back-layer' : 'front-layer' });
  });
  return [...slots.values()];
}
function positions(width: number): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < 2 * width; a++)
    for (let b = 0; b < 2 * width; b++) for (let c = 0; c < 2 * width; c++) out.push([a, b, c]);
  return out;
}

describe('bounded whole-stack transfer search', () => {
  it('finds and independently replays the four-phase two-sheet neighbour move', () => {
    const result = planTransfers(twoSheets());
    verify(result);
    expect(result.phases).toHaveLength(4);
    expect(result.validation!.mixedStacks).toEqual([]);
    expect(result.validation!.final).toEqual(twoSheets().expected);
    expect(result.reason).toContain('no native pass optimality');
  });

  it('temporarily relocates a held loop when every opposite-bed slot is occupied, then restores it', () => {
    const holds = [0, 1, 2].map((i): TransferLoop => ({ id: `held:${i}`, layer: 'back-layer' })),
      input = {
        width: 3,
        initial: [slot('front', 1, F), ...holds.map((loop, i) => slot('back', i, loop))],
        expected: [slot('front', 0, F), ...holds.map((loop, i) => slot('back', i, loop))],
      },
      result = planTransfers(input);
    verify(result);
    const tokenLocations = new Map<string, string>();
    for (const held of input.initial)
      for (const loop of held.loops) tokenLocations.set(loop.id, `${held.bed}:${held.needle}`);
    let relocatedHeld = false;
    for (const phase of result.phases) {
      const move = phase.transfers[0]!,
        source = `${move.bed}:${move.needle}`,
        destination = `${move.bed === 'front' ? 'back' : 'front'}:${move.needle + move.offset}`;
      for (const [id, at] of tokenLocations)
        if (at === source) {
          if (id.startsWith('held:')) relocatedHeld = true;
          tokenLocations.set(id, destination);
        }
    }
    expect(relocatedHeld).toBe(true);
    for (let i = 0; i < holds.length; i++)
      expect(tokenLocations.get(holds[i]!.id)).toBe(`back:${i}`);
  });

  it('allows whole-stack merges at occupied goal slots for a declared decrease', () => {
    const result = planTransfers({
      width: 1,
      initial: [slot('front', 0, F), slot('back', 0, B)],
      expected: [slot('front', 0, F, B)],
    });
    verify(result);
    expect(result.phases).toHaveLength(1);
    expect(result.validation!.mixedStacks).toHaveLength(1);
    expect(result.validation!.final[0]!.loops.map((loop) => loop.id).sort()).toEqual([B.id, F.id]);
  });

  it('proves that an initially inseparable stack cannot be assigned to different target slots', () => {
    const result = planTransfers({
      width: 2,
      initial: [slot('front', 0, F, B)],
      expected: [slot('front', 0, F), slot('back', 0, B)],
    });
    expect(result.status).toBe('unreachable');
    expect(result.proof).toContain('never split a stack');
    expect(result.stats.retainedStates).toBe(0);
    expect(result.phases).toEqual([]);
    expect(result.validation).toBeNull();
  });

  it.each(['missing', 'extra', 'relabeled'] as const)(
    'proves a %s loop inventory cannot be repaired by transfers',
    (kind) => {
      const expected =
        kind === 'missing'
          ? []
          : [slot('front', 0, kind === 'relabeled' ? { ...F, layer: 'back-layer' } : F)];
      if (kind === 'extra') expected.push(slot('back', 0, B));
      const result = planTransfers({ width: 2, initial: [slot('front', 0, F)], expected });
      expect(result.status).toBe('unreachable');
      expect(result.proof).toContain('inventories differ');
      expect(result.stats.testedMoves).toBe(0);
    }
  );

  it('distinguishes exhaustive model unreachability from a move-budget cutoff', () => {
    const input = {
        width: 1,
        initial: [slot('front', 0, F), slot('back', 0, B)],
        expected: [slot('front', 0, B), slot('back', 0, F)],
      },
      exhausted = planTransfers({ ...input, limits: { maxMoves: 2 } });
    expect(exhausted.status).toBe('unreachable');
    expect(exhausted.proof).toContain('Every reachable state');
    expect(exhausted.stats).toEqual({
      retainedStates: 1,
      expandedStates: 1,
      testedMoves: 2,
      depthCutoffs: 0,
    });
    const cutoff = planTransfers({ ...input, limits: { maxMoves: 1 } });
    expect(cutoff.status).toBe('limit');
    expect(cutoff.proof).toBeUndefined();
    expect(cutoff.stats.testedMoves).toBe(1);
  });

  it.each([
    ['maxStates', 1, 'Retained-state'],
    ['maxMoves', 1, 'Tested-move'],
    ['maxPhases', 3, 'Phase-depth'],
  ] as const)('reports %s cutoffs without a no-plan certificate', (limit, bound, text) => {
    const result = planTransfers({ ...twoSheets(), limits: { [limit]: bound } });
    expect(result.status).toBe('limit');
    expect(result.reason).toContain(text);
    expect(result.reason).toContain('not proof');
    expect(result.proof).toBeUndefined();
    expect(result.phases).toEqual([]);
    expect(result.validation).toBeNull();
    expect(result.stats.retainedStates).toBeLessThanOrEqual(result.limits.maxStates);
    expect(result.stats.testedMoves).toBeLessThanOrEqual(result.limits.maxMoves);
    if (limit === 'maxPhases') expect(result.stats.depthCutoffs).toBeGreaterThan(0);
  });

  it('finds a candidate exactly at the phase-depth bound and handles an already-satisfied target', () => {
    verify(planTransfers({ ...twoSheets(), limits: { maxPhases: 4 } }));
    const initial = [slot('back', 0, B), slot('front', 1, F)],
      result = planTransfers({
        width: 2,
        initial,
        expected: [...initial].reverse(),
        limits: { maxStates: 1, maxMoves: 1, maxPhases: 1 },
      });
    verify(result);
    expect(result.phases).toEqual([]);
    expect(result.stats).toEqual({
      retainedStates: 1,
      expandedStates: 0,
      testedMoves: 0,
      depthCutoffs: 0,
    });
    verify(planTransfers({ width: 1, initial: [], expected: [] }));
  });

  it('is deterministic across repeated calls and canonical input ordering', () => {
    const input = twoSheets(),
      first = planTransfers(input),
      second = planTransfers(structuredClone(input)),
      reordered = planTransfers({
        ...input,
        initial: [...input.initial].reverse(),
        expected: [...input.expected].reverse(),
      });
    verify(first);
    expect(second).toEqual(first);
    expect(reordered).toEqual(first);
  });

  it('preserves mirrored slots and relabeled logical-loop identities', () => {
    const input = twoSheets(),
      mirror = (slots: TransferSlot[]) =>
        slots.map((s) => ({ ...s, needle: input.width - 1 - s.needle })),
      mirrored = planTransfers({
        ...input,
        initial: mirror(input.initial),
        expected: mirror(input.expected),
      });
    verify(mirrored);
    const rename = (slots: TransferSlot[]) =>
        slots.map((s) => ({
          ...s,
          loops: s.loops.map((loop) => ({ ...loop, id: `renamed(${loop.id})` })),
        })),
      relabeled = planTransfers({
        ...input,
        initial: rename(input.initial),
        expected: rename(input.expected),
      });
    verify(relabeled);
    expect(relabeled.phases).toEqual(planTransfers(input).phases);
  });

  it('validates partial resource bounds and rejects malformed or unknown limits', () => {
    expect(validatePlanLimits(undefined)).toEqual(PLAN_DEFAULTS);
    expect(validatePlanLimits({ maxMoves: 9 })).toEqual({ ...PLAN_DEFAULTS, maxMoves: 9 });
    expect(validatePlanLimits(PLAN_MAX)).toEqual(PLAN_MAX);
    for (const key of ['maxStates', 'maxMoves', 'maxPhases'] as const)
      for (const n of [0, -1, 0.5, NaN, Infinity, PLAN_MAX[key] + 1, '3']) {
        expect(() => validatePlanLimits({ [key]: n })).toThrow(key);
        expect(unsafe({ ...twoSheets(), limits: { [key]: n } }).status).toBe('invalid');
      }
    for (const value of [null, [], 1, { maxState: 10 }]) {
      expect(() => validatePlanLimits(value)).toThrow();
      expect(unsafe({ ...twoSheets(), limits: value }).status).toBe('invalid');
    }
  });

  it('uses the independent checker for malformed slot, width and layer schemas', () => {
    const invalid: unknown[] = [
      null,
      [],
      {},
      { ...twoSheets(), width: 0 },
      { ...twoSheets(), width: 601 },
      { ...twoSheets(), width: NaN },
      { ...twoSheets(), initial: null },
      { ...twoSheets(), expected: null },
      { width: 2, initial: [] },
      { ...twoSheets(), initial: [slot('front', 1, F), slot('front', 1, B)] },
      { ...twoSheets(), initial: [slot('front', 1, F), slot('back', 1, F)] },
      { ...twoSheets(), expected: [slot('front', 0, F), slot('front', 0, B)] },
      {
        ...twoSheets(),
        expected: [{ bed: 'front', needle: 0, loops: [{ id: F.id, layer: 'front' }] }],
      },
    ];
    for (const value of invalid) {
      const result = unsafe(value);
      expect(result.status).toBe('invalid');
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.stats.testedMoves).toBe(0);
      expect(result.phases).toEqual([]);
    }
  });

  it('cancels before or during search and leaves every input object unchanged', () => {
    const input = twoSheets(),
      before = JSON.stringify(input);
    expect(() => planTransfers(input, { cancelled: () => true })).toThrow(
      expect.objectContaining({ name: 'AbortError' })
    );
    let cancel = false,
      reports = 0;
    expect(() =>
      planTransfers(input, {
        cancelled: () => cancel,
        progress: () => {
          reports++;
          cancel = true;
        },
      })
    ).toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(reports).toBe(1);
    expect(JSON.stringify(input)).toBe(before);
    verify(planTransfers(input));
    expect(JSON.stringify(input)).toBe(before);
    for (const s of input.initial) {
      Object.freeze(s.loops);
      Object.freeze(s);
    }
    Object.freeze(input.initial);
    Object.freeze(input.expected);
    Object.freeze(input);
    verify(planTransfers(input));
  });

  it('matches exhaustive tiny-grid BFS reachability, including merges, at each reachable target depth', () => {
    let cases = 0;
    for (const width of [1, 2]) {
      const states = positions(width);
      for (const start of states) {
        const reachable = oracle(width, start);
        for (const target of states) {
          const distance = reachable.get(target.join(',')),
            result = planTransfers({
              width,
              initial: occupancy(width, start),
              expected: occupancy(width, target),
              limits: { maxPhases: distance === undefined ? 64 : Math.max(1, distance) },
            });
          if (distance === undefined) {
            expect(result.status, `${width}: ${start} -> ${target}`).toBe('unreachable');
            expect(result.proof).toBeDefined();
          } else {
            verify(result);
            expect(result.phases.length).toBeLessThanOrEqual(distance);
          }
          cases++;
        }
      }
    }
    expect(cases).toBe(4160);
  });
});
