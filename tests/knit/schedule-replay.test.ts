import { describe, expect, it } from 'vitest';
import type { ScheduleEvent, ScheduleSource } from '../../src/knit/schedule-types';
import {
  prepareScheduleSource,
  replaySchedulePass,
  validateSchedule,
} from '../../src/knit/schedule-replay';
import { imageIndex } from '../../src/knit/grid';
import { TWO } from '../../src/knit/keys';
import { keySymbols, type SeqSymbol } from '../../src/knit/sequence';
import type { TransferPhase, TransferSlot } from '../../src/knit/transfer-phases';

// Synthetic reference geometry, logical indices and tokens; not measured gauges or machine instructions.
type Ref = { id: string; pass: number; needle: number; parents: string[] };
const K: SeqSymbol = {
    id: 'K',
    steps: [
      { kind: 'knit', guide: 1, bed: 'front' },
      { kind: 'knit', guide: 2, bed: 'back' },
    ],
  },
  S: SeqSymbol = {
    id: 'S',
    steps: [
      { kind: 'knit', guide: 1, bed: 'back' },
      { kind: 'knit', guide: 2, bed: 'front' },
    ],
  },
  T: SeqSymbol = {
    id: 'T',
    steps: [
      { kind: 'tuck', guide: 1, bed: 'front' },
      { kind: 'tuck', guide: 2, bed: 'back' },
    ],
  },
  M: SeqSymbol = { id: 'M', steps: [] };
function source(
  width: number,
  height: number,
  refs: Ref[],
  grid?: string[][],
  symbols = [K, S, T, M],
  firstDir: 1 | -1 = 1
): ScheduleSource {
  const placements = refs.map((r) => ({
      loop: {
        id: r.id,
        uv: [0, 0] as [number, number],
        position: [0, 0, 0] as [number, number, number],
        across: 0,
      },
      course: r.pass,
      needle: r.needle,
      role: 'loop' as const,
      parents: [...r.parents],
    })),
    placementAt = new Int32Array(width * height).fill(-1),
    rows = new Uint16Array(width * height);
  refs.forEach((r, n) => {
    placementAt[imageIndex(width, height, r.needle, r.pass)] = n;
  });
  for (let k = 0; k < height; k++)
    for (let j = 0; j < width; j++) {
      const id = grid?.[k]?.[j] ?? (refs.some((r) => r.pass === k && r.needle === j) ? 'K' : 'M');
      rows[k * width + j] = symbols.findIndex((s) => s.id === id);
    }
  return {
    program: {
      w: width,
      h: height,
      key: TWO,
      cells: new Uint8Array(width * height),
      firstDir,
      settings: { mode: 'shape', layerModel: 'shared-reference-v1' },
      shape: { placementAt, needles: { placements, moves: [] } },
      operations: {
        w: width,
        h: height,
        guides: 2,
        firstDir,
        symbols: structuredClone(symbols),
        rows,
        clusters: [],
        fills: [],
      },
    },
    surface: { kind: 'plane', revision: 'synthetic' },
    signature: 'synthetic-source',
    referenceMethod: 'synthetic-test-reference',
    blockers: ['original export blocker remains separate'],
  };
}
const identity = () =>
  source(1, 2, [
    { id: 'A', pass: 0, needle: 0, parents: [] },
    { id: 'B', pass: 1, needle: 0, parents: ['A'] },
  ]);
const originalEvents = (height: number): ScheduleEvent[] =>
  Array.from({ length: height }, (_, pass) => ({ kind: 'source-pass', pass }));
function transfer(
  beforePass: number,
  racking: number,
  bed: 'front' | 'back',
  needle: number,
  offset: number
): ScheduleEvent {
  return {
    kind: 'transfer-phase',
    beforePass,
    phase: { racking, transfers: [{ bed, needle, offset }] },
  };
}
function moving() {
  const input = source(
    2,
    3,
    [
      { id: 'A', pass: 0, needle: 1, parents: [] },
      { id: 'B', pass: 1, needle: 0, parents: ['A'] },
      { id: 'C', pass: 2, needle: 1, parents: ['B'] },
    ],
    [
      ['M', 'K'],
      ['S', 'M'],
      ['M', 'K'],
    ]
  );
  const events: ScheduleEvent[] = [
    { kind: 'source-pass', pass: 0 },
    transfer(1, -1, 'front', 1, -1),
    transfer(1, 0, 'back', 0, 0),
    transfer(1, 0, 'back', 1, 0),
    transfer(1, -1, 'front', 1, -1),
    { kind: 'source-pass', pass: 1 },
    transfer(2, 1, 'front', 0, 1),
    transfer(2, 0, 'back', 1, 0),
    transfer(2, 0, 'back', 0, 0),
    transfer(2, 1, 'front', 0, 1),
    { kind: 'source-pass', pass: 2 },
  ];
  return { input, events };
}
const ids = (slots: TransferSlot[]) => slots.flatMap((s) => s.loops.map((loop) => loop.id)).sort();

describe('fresh source-pass and complete schedule replay', () => {
  it('derives distinct reference histories without rejecting the original export blockers', () => {
    const input = identity(),
      prepared = prepareScheduleSource(input);
    expect(prepared.status).toBe('ready');
    expect(prepared.reference).toHaveLength(4);
    expect(prepared.byCell.get('1:front:0')!.parents).toEqual(['front-layer:A']);
    expect(prepared.byCell.get('1:back:0')!.parents).toEqual(['back-layer:A']);
    expect(prepared.byPass.map((p) => p.length)).toEqual([2, 2]);
    expect(input.blockers).toEqual(['original export blocker remains separate']);
    const result = validateSchedule(input, originalEvents(2));
    expect(result).toMatchObject({
      ok: true,
      complete: true,
      completedPasses: 2,
      checkedEvents: 2,
      matchedParents: 4,
      issues: [],
    });
    expect(ids(result.final)).toEqual(['back-layer:B', 'front-layer:B']);
  });

  it('replays a multi-pass witness with inserted phases from fresh actual occupancy', () => {
    const { input, events } = moving(),
      before = JSON.stringify({ input, events }),
      result = validateSchedule(input, events);
    expect(result).toMatchObject({
      ok: true,
      complete: true,
      checkedEvents: 11,
      completedPasses: 3,
      matchedParents: 6,
    });
    expect(result.final.map((s) => [s.bed, s.needle])).toEqual([
      ['front', 1],
      ['back', 1],
    ]);
    expect(ids(result.final)).toEqual(['back-layer:C', 'front-layer:C']);
    expect(JSON.stringify({ input, events })).toBe(before);
    const failed = validateSchedule(input, originalEvents(3));
    expect(failed).toMatchObject({
      ok: false,
      complete: false,
      completedPasses: 1,
      checkedEvents: 1,
    });
    expect(failed.issues[0]).toMatchObject({
      event: 1,
      pass: 1,
      expected: ['back-layer:A'],
      actual: [],
    });
    expect(ids(failed.final)).toEqual(['back-layer:A', 'front-layer:A']);
  });

  it.each([1, -1] as const)(
    'preserves original direction %s and guide/bed assignments despite added phase parity',
    (firstDir) => {
      const { input, events } = moving();
      input.program.firstDir = firstDir;
      input.program.operations!.firstDir = firstDir;
      // An extra valid empty phase makes the inserted phase count odd without changing the held state.
      events.splice(5, 0, {
        kind: 'transfer-phase',
        beforePass: 1,
        phase: { racking: 0, transfers: [] },
      });
      const prepared = prepareScheduleSource(input),
        guideSteps = structuredClone(input.program.operations!.symbols[1]!.steps);
      expect(prepared.sequence!.firstDir).toBe(firstDir);
      expect(prepared.sequence!.symbols[1]!.steps).toEqual(guideSteps);
      expect(validateSchedule(input, events).complete).toBe(true);
      expect(input.program.operations!.symbols[1]!.steps).toEqual(guideSteps);
    }
  );

  it('permits a tuck on held loops when parents are empty, then knits the complete held stack', () => {
    const input = source(
        1,
        3,
        [
          { id: 'A', pass: 0, needle: 0, parents: [] },
          { id: 'B', pass: 1, needle: 0, parents: [] },
          { id: 'C', pass: 2, needle: 0, parents: ['A', 'B'] },
        ],
        [['K'], ['T'], ['K']]
      ),
      prepared = prepareScheduleSource(input),
      first = replaySchedulePass(prepared, 0, []),
      second = replaySchedulePass(prepared, 1, first.final);
    expect(second.ok).toBe(true);
    expect(second.final.every((s) => s.loops.length === 2)).toBe(true);
    const result = validateSchedule(input, originalEvents(3));
    expect(result).toMatchObject({ ok: true, complete: true, matchedParents: 6 });
    expect(ids(result.final)).toEqual(['back-layer:C', 'front-layer:C']);
    const contradictory = identity();
    contradictory.program.operations!.rows[1] = 2;
    const bad = validateSchedule(contradictory, originalEvents(2));
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]!.message).toContain('tuck consumes no parents');
    expect(bad.issues[0]!.actual).toEqual([]);
  });

  it('keeps unused legacy same-bed entries but atomically stops when one is used later', () => {
    const input = identity(),
      symbols = keySymbols(TWO),
      unused: SeqSymbol = {
        id: 'legacy-same-bed',
        steps: [
          { kind: 'knit', guide: 1, bed: 'front' },
          { kind: 'knit', guide: 2, bed: 'front' },
        ],
      };
    input.program.operations!.symbols.push(...symbols, unused);
    expect(validateSchedule(input, originalEvents(2)).complete).toBe(true);
    input.program.operations!.rows[1] = input.program.operations!.symbols.length - 1;
    expect(prepareScheduleSource(input).status).toBe('ready');
    const bad = validateSchedule(input, originalEvents(2));
    expect(bad).toMatchObject({ ok: false, completedPasses: 1, checkedEvents: 1 });
    expect(bad.issues[0]!.message).toContain('same bed');
    expect(ids(bad.final)).toEqual(['back-layer:A', 'front-layer:A']);
  });

  it('preserves simultaneous source departures and arrivals rather than treating them as inserted phases', () => {
    const x: SeqSymbol = {
        id: 'X',
        steps: [...K.steps, { kind: 'transfer', bed: 'front', offset: 1 }],
      },
      y: SeqSymbol = {
        id: 'Y',
        steps: [...K.steps, { kind: 'transfer', bed: 'back', offset: -1 }],
      },
      input = source(
        2,
        1,
        [
          { id: 'A', pass: 0, needle: 0, parents: [] },
          { id: 'B', pass: 0, needle: 1, parents: [] },
        ],
        [['X', 'Y']],
        [x, y]
      ),
      result = validateSchedule(input, originalEvents(1));
    expect(result.complete).toBe(true);
    expect(result.final).toEqual([
      { bed: 'front', needle: 0, loops: [{ id: 'back-layer:B', layer: 'back-layer' }] },
      { bed: 'front', needle: 1, loops: [{ id: 'front-layer:B', layer: 'front-layer' }] },
      { bed: 'back', needle: 0, loops: [{ id: 'back-layer:A', layer: 'back-layer' }] },
      { bed: 'back', needle: 1, loops: [{ id: 'front-layer:A', layer: 'front-layer' }] },
    ]);
  });

  it('preserves simultaneous same-bed moves, without cascading an arrival through the neighbour', () => {
    const move: SeqSymbol = {
        id: 'R',
        steps: [...K.steps, { kind: 'move', bed: 'front', offset: 1 }],
      },
      input = source(
        3,
        1,
        [
          { id: 'A', pass: 0, needle: 0, parents: [] },
          { id: 'B', pass: 0, needle: 1, parents: [] },
        ],
        [['R', 'R', 'M']],
        [move, M]
      ),
      result = validateSchedule(input, originalEvents(1));
    expect(result.complete).toBe(true);
    expect(
      result.final.filter((s) => s.bed === 'front').map((s) => [s.needle, s.loops[0]!.id])
    ).toEqual([
      [1, 'front-layer:A'],
      [2, 'front-layer:B'],
    ]);
  });

  it('refuses live drops, including old unconsumed leaves, instead of inventing finishing', () => {
    const drop: SeqSymbol = { id: 'D', steps: [...K.steps, { kind: 'drop', bed: 'front' }] },
      input = source(1, 1, [{ id: 'A', pass: 0, needle: 0, parents: [] }], [['D']], [drop]),
      result = validateSchedule(input, originalEvents(1));
    expect(result).toMatchObject({ ok: false, checkedEvents: 0, completedPasses: 0, final: [] });
    expect(result.issues[0]!.message).toContain('live drops are not finishing');
    const heldDrop: SeqSymbol = { id: 'drop-held', steps: [{ kind: 'drop', bed: 'front' }] },
      held = source(
        2,
        2,
        [
          { id: 'A', pass: 0, needle: 0, parents: [] },
          { id: 'B', pass: 1, needle: 1, parents: [] },
        ],
        [
          ['K', 'M'],
          ['drop-held', 'K'],
        ],
        [K, M, heldDrop]
      );
    const failed = validateSchedule(held, originalEvents(2));
    expect(failed.completedPasses).toBe(1);
    expect(ids(failed.final)).toEqual(['back-layer:A', 'front-layer:A']);
    const emptyDrop = source(
      2,
      1,
      [{ id: 'A', pass: 0, needle: 0, parents: [] }],
      [['K', 'drop-held']],
      [K, heldDrop]
    );
    expect(validateSchedule(emptyDrop, originalEvents(1)).complete).toBe(true);
  });

  it.each(['off-grid', 'racking', 'unknown'] as const)(
    'atomically refuses %s source free actions',
    (kind) => {
      const symbols: SeqSymbol[] =
        kind === 'racking'
          ? [
              { id: 'X', steps: [...K.steps, { kind: 'transfer', bed: 'front', offset: 1 }] },
              { id: 'Y', steps: [...K.steps, { kind: 'transfer', bed: 'back', offset: 0 }] },
            ]
          : [
              {
                id: 'X',
                steps: [
                  ...K.steps,
                  kind === 'off-grid'
                    ? { kind: 'move', bed: 'front', offset: -1 }
                    : ({ kind: 'mystery', bed: 'front' } as unknown as SeqSymbol['steps'][number]),
                ],
              },
              K,
            ];
      const input = source(
          2,
          1,
          [
            { id: 'A', pass: 0, needle: 0, parents: [] },
            { id: 'B', pass: 0, needle: 1, parents: [] },
          ],
          [['X', kind === 'racking' ? 'Y' : 'K']],
          symbols
        ),
        result = validateSchedule(input, originalEvents(1));
      expect(result).toMatchObject({ ok: false, checkedEvents: 0, final: [] });
      expect(result.issues[0]!.message).toContain(
        kind === 'off-grid' ? 'leaves' : kind === 'racking' ? 'rackings' : 'unknown'
      );
    }
  );

  it('refuses missing and outside-reference yarn-fed actions at their pass', () => {
    const missing = identity();
    missing.program.operations!.rows[1] = 3;
    expect(validateSchedule(missing, originalEvents(2)).issues[0]!.message).toContain(
      'no source knit or tuck'
    );
    const outside = source(2, 1, [{ id: 'A', pass: 0, needle: 0, parents: [] }], [['K', 'K']]);
    expect(validateSchedule(outside, originalEvents(1)).issues[0]!.message).toContain(
      'no declared reference target'
    );
    const unknown = identity();
    unknown.program.operations!.rows[1] = 65535;
    expect(prepareScheduleSource(unknown).status).toBe('ready');
    expect(validateSchedule(unknown, originalEvents(2)).completedPasses).toBe(1);
  });

  it('rejects wrong-layer and unknown local incoming identities without consuming the prior state', () => {
    const prepared = prepareScheduleSource(identity()),
      first = replaySchedulePass(prepared, 0, []),
      wrong = structuredClone(first.final);
    wrong[0]!.loops[0]!.layer = 'back-layer';
    const result = replaySchedulePass(prepared, 1, wrong);
    expect(result.ok).toBe(false);
    expect(result.matchedParents).toBe(0);
    expect(result.final).toEqual(wrong);
    expect(result.issues[0]!.message).toContain('wrong-layer');
    const unknown = structuredClone(first.final);
    unknown[0]!.loops[0]!.id = 'front-layer:unknown';
    expect(replaySchedulePass(prepared, 1, unknown).ok).toBe(false);
  });

  it('accepts explicitly incomplete prefixes, including completed phases before the next unexecuted pass', () => {
    const { input, events } = moving();
    for (const count of [0, 1, 2, 5, 6, 10]) {
      const result = validateSchedule(input, events.slice(0, count));
      expect(result).toMatchObject({ ok: true, complete: false, checkedEvents: count, issues: [] });
    }
  });

  it('requires unused held loops to return to their pre-transition slots before committing the next pass', () => {
    const input = source(3, 2, [
        { id: 'A', pass: 0, needle: 0, parents: [] },
        { id: 'hold', pass: 0, needle: 2, parents: [] },
        { id: 'B', pass: 1, needle: 0, parents: ['A'] },
      ]),
      parked: ScheduleEvent[] = [
        { kind: 'source-pass', pass: 0 },
        transfer(1, -1, 'front', 2, -1),
        { kind: 'source-pass', pass: 1 },
      ],
      failed = validateSchedule(input, parked);
    expect(failed).toMatchObject({
      ok: false,
      complete: false,
      completedPasses: 1,
      checkedEvents: 2,
    });
    expect(failed.issues[0]).toMatchObject({
      event: 2,
      pass: 1,
      bed: 'front',
      needle: 2,
      expected: ['front-layer:hold'],
      actual: [],
    });
    expect(failed.issues[0]!.message).toContain('fixed final');
    const prefix = validateSchedule(input, parked.slice(0, 2));
    expect(prefix).toMatchObject({ ok: true, complete: false, checkedEvents: 2 });
    expect(prefix.final).toEqual(failed.final);
    const restored = [...parked.slice(0, 2), transfer(1, -1, 'back', 1, 1), parked[2]!];
    expect(validateSchedule(input, restored)).toMatchObject({
      ok: true,
      complete: true,
      checkedEvents: 4,
    });
  });

  it('uses actual post-source-free occupancy as the next fixed-held baseline', () => {
    const moveHeld: SeqSymbol = {
        id: 'H',
        steps: [...K.steps, { kind: 'move', bed: 'front', offset: -1 }],
      },
      input = source(
        3,
        2,
        [
          { id: 'A', pass: 0, needle: 0, parents: [] },
          { id: 'hold', pass: 0, needle: 2, parents: [] },
          { id: 'B', pass: 1, needle: 0, parents: ['A'] },
        ],
        [
          ['K', 'M', 'H'],
          ['K', 'M', 'M'],
        ],
        [K, M, moveHeld]
      );
    expect(validateSchedule(input, originalEvents(2)).complete).toBe(true);
    const restored = [
      { kind: 'source-pass', pass: 0 } as ScheduleEvent,
      transfer(1, 0, 'front', 1, 0),
      transfer(1, 0, 'back', 1, 0),
      { kind: 'source-pass', pass: 1 } as ScheduleEvent,
    ];
    expect(validateSchedule(input, restored).complete).toBe(true);
    const wrongOriginalLocation = [...restored];
    wrongOriginalLocation[2] = transfer(1, -1, 'back', 1, 1);
    expect(validateSchedule(input, wrongOriginalLocation).ok).toBe(false);
  });

  it('stops at tampered, reordered or omitted phases while retaining only the verified event prefix', () => {
    const { input, events } = moving(),
      reordered = [...events];
    [reordered[1], reordered[2]] = [reordered[2]!, reordered[1]!];
    const bad = validateSchedule(input, reordered);
    expect(bad.checkedEvents).toBe(1);
    expect(bad.issues[0]!.event).toBe(1);
    const omitted = validateSchedule(
      input,
      events.filter((_, n) => n !== 4)
    );
    expect(omitted.ok).toBe(false);
    expect(omitted.complete).toBe(false);
    const tampered = structuredClone(events);
    (tampered[1] as { phase: TransferPhase }).phase.racking = 999;
    expect(validateSchedule(input, tampered).checkedEvents).toBe(1);
    // Claimed snapshots are not replay inputs and cannot fill the missing actual parent.
    const claims = originalEvents(3).map((event) => ({
      ...event,
      final: [{ id: 'invented' }],
      matchedParents: 99999,
    }));
    expect(validateSchedule(input, claims).ok).toBe(false);
  });

  it('enforces source-pass order and the only valid locations for inserted phases', () => {
    const input = identity(),
      invalid: unknown[][] = [
        [{ kind: 'source-pass', pass: 1 }],
        [
          { kind: 'source-pass', pass: 0 },
          { kind: 'source-pass', pass: 0 },
        ],
        [transfer(0, 0, 'front', 0, 0)],
        [{ kind: 'source-pass', pass: 0 }, transfer(2, 0, 'front', 0, 0)],
        [...originalEvents(2), transfer(2, 0, 'front', 0, 0)],
        [...originalEvents(2), { kind: 'source-pass', pass: 2 }],
        [null],
        [{ kind: 'unknown' }],
        [
          { kind: 'source-pass', pass: 0 },
          { kind: 'transfer-phase', beforePass: 1 },
        ],
      ];
    for (const events of invalid) {
      const result = validateSchedule(input, events as ScheduleEvent[]);
      expect(result.ok).toBe(false);
      expect(result.issues[0]!.event).toBeDefined();
    }
    expect(validateSchedule(input, null as unknown as ScheduleEvent[]).ok).toBe(false);
  });

  it('preflights global reference defects rather than returning a misleading valid early prefix', () => {
    const mutations: ((input: ScheduleSource) => void)[] = [
      (s) => {
        s.program.shape!.needles.placements[1]!.loop.id = 'A';
      },
      (s) => {
        s.program.shape!.needles.placements[1]!.course = 0;
      },
      (s) => {
        s.program.shape!.needles.placements[1]!.needle = 1;
      },
      (s) => {
        s.program.shape!.needles.placements[1]!.parents = ['absent'];
      },
      (s) => {
        s.program.shape!.needles.placements[0]!.parents = ['B'];
      },
      (s) => {
        s.program.shape!.needles.placements[1]!.parents = ['A', 'A'];
      },
      (s) => {
        s.program.shape!.placementAt[0] = -1;
      },
      (s) => {
        s.program.shape!.placementAt[0] = 99;
      },
      (s) => {
        s.program.shape!.needles.placements.length = 0;
      },
    ];
    for (const mutate of mutations) {
      const input = identity();
      mutate(input);
      expect(prepareScheduleSource(input).status).toBe('invalid');
      expect(validateSchedule(input, [{ kind: 'source-pass', pass: 0 }]).checkedEvents).toBe(0);
    }
    const reused = source(1, 3, [
      { id: 'A', pass: 0, needle: 0, parents: [] },
      { id: 'B', pass: 1, needle: 0, parents: ['A'] },
      { id: 'C', pass: 2, needle: 0, parents: ['A'] },
    ]);
    expect(
      prepareScheduleSource(reused).issues.some((i) => i.message.includes('more than one child'))
    ).toBe(true);
  });

  it('rejects global source metadata defects and reports unsupported scope separately', () => {
    const cases: ((input: ScheduleSource) => void)[] = [
      (s) => {
        s.program.w = 0;
      },
      (s) => {
        s.program.h = 601;
      },
      (s) => {
        s.program.cells = new Uint8Array(1);
      },
      (s) => {
        s.program.operations!.w = 9;
      },
      (s) => {
        s.program.operations!.guides = 1;
      },
      (s) => {
        s.program.operations!.firstDir = -1;
      },
      (s) => {
        s.program.operations!.rows = new Uint16Array(1);
      },
    ];
    for (const mutate of cases) {
      const input = identity();
      mutate(input);
      expect(prepareScheduleSource(input).status).toBe('invalid');
    }
    for (const mutate of [
      (s: ScheduleSource) => {
        s.program.settings.mode = 'network';
      },
      (s: ScheduleSource) => {
        s.program.settings.layerModel = undefined;
      },
      (s: ScheduleSource) => {
        s.program.patches = true;
      },
      (s: ScheduleSource) => {
        s.surface.kind = 'cube';
      },
    ]) {
      const input = identity();
      mutate(input);
      expect(prepareScheduleSource(input).status).toBe('unsupported');
    }
    expect(prepareScheduleSource(null as unknown as ScheduleSource).status).toBe('invalid');
  });

  it('cancels, emits bounded progress, and leaves source events and incoming stacks immutable', () => {
    const { input, events } = moving(),
      before = JSON.stringify({ input, events }),
      progress: number[] = [];
    expect(validateSchedule(input, events, { progress: (n) => progress.push(n) }).complete).toBe(
      true
    );
    expect(progress.every((n) => n >= 0 && n <= 1)).toBe(true);
    expect(() => prepareScheduleSource(input, { cancelled: () => true })).toThrow(
      expect.objectContaining({ name: 'AbortError' })
    );
    let cancel = false;
    expect(() =>
      validateSchedule(input, events, {
        cancelled: () => cancel,
        progress: () => {
          cancel = true;
        },
      })
    ).toThrow(expect.objectContaining({ name: 'AbortError' }));
    const prepared = prepareScheduleSource(identity()),
      first = replaySchedulePass(prepared, 0, []);
    for (const slot of first.final) {
      for (const loop of slot.loops) Object.freeze(loop);
      Object.freeze(slot.loops);
      Object.freeze(slot);
    }
    Object.freeze(first.final);
    expect(replaySchedulePass(prepared, 1, first.final).ok).toBe(true);
    expect(JSON.stringify({ input, events })).toBe(before);
  });
});
