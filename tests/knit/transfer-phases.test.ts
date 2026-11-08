import { describe, expect, it } from 'vitest';
import {
  checkTransferPhases,
  TRANSFER_PHASE_ASSUMPTIONS,
  type LogicalLayer,
  type TransferLoop,
  type TransferPhase,
  type TransferSlot,
} from '../../src/knit/transfer-phases';

// All grid indices, widths, tokens and rackings below are synthetic project-model test values,
// not measured gauges, native machine settings or a machine-feasibility certificate.
const loop = (id: string, layer: LogicalLayer = 'front-layer'): TransferLoop => ({ id, layer });
const slot = (
  bed: TransferSlot['bed'],
  needle: number,
  ...loops: TransferLoop[]
): TransferSlot => ({ bed, needle, loops });
const phase = (
  racking: number,
  bed: TransferSlot['bed'],
  needle: number,
  offset: number
): TransferPhase => ({
  racking,
  transfers: [{ bed, needle, offset }],
});
const F = loop('front:shared-loop', 'front-layer'),
  B = loop('back:shared-loop', 'back-layer');
type Input = Parameters<typeof checkTransferPhases>[0];
const unsafe = (input: unknown) => checkTransferPhases(input as Input);
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

describe('explicit ordered whole-stack transfer phases', () => {
  it('moves both logical sheets through four explicit phases to the vacant neighbour', () => {
    const initial = [slot('front', 1, F), slot('back', 1, B)],
      phases = [
        phase(-1, 'front', 1, -1),
        phase(0, 'back', 0, 0),
        phase(0, 'back', 1, 0),
        phase(-1, 'front', 1, -1),
      ],
      expected = [slot('front', 0, F), slot('back', 0, B)],
      input = frozen({ width: 3, initial, phases, expected }),
      before = JSON.stringify(input),
      progress: number[] = [],
      result = checkTransferPhases(input, { progress: (fraction) => progress.push(fraction) });
    expect(result).toMatchObject({
      ok: true,
      structurallyValid: true,
      targetMatches: true,
      completed: 4,
      final: expected,
      mixedStacks: [],
      issues: [],
    });
    expect(progress).toEqual([0.25, 0.5, 0.75, 1]);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.final[0]!.loops[0]).not.toBe(F);
    expect(result.assumptions).toBe(TRANSFER_PHASE_ASSUMPTIONS);
    expect(result.assumptions.join(' ')).toContain('selective unstacking is not modelled');
    expect(result.assumptions.join(' ')).toContain('not a native machine value');
  });

  it('preserves held loops and consumes arrivals only in subsequent phases', () => {
    const held = loop('held', 'back-layer'),
      result = checkTransferPhases({
        width: 4,
        initial: [slot('front', 0, F), slot('back', 3, held)],
        phases: [phase(0, 'front', 0, 0), phase(-1, 'back', 0, 1)],
        expected: [slot('back', 3, held), slot('front', 1, F)],
      });
    expect(result.ok).toBe(true);
    expect(result.final).toEqual([slot('front', 1, F), slot('back', 3, held)]);
    expect(result.completed).toBe(2);
  });

  it('refuses a same-phase exchange even with occupied sources and consistent racking', () => {
    const initial = [slot('front', 0, F), slot('back', 0, B)],
      result = checkTransferPhases({
        width: 2,
        initial,
        phases: [
          {
            racking: 0,
            transfers: [
              { bed: 'front', needle: 0, offset: 0 },
              { bed: 'back', needle: 0, offset: 0 },
            ],
          },
        ],
      });
    expect(result).toMatchObject({
      ok: false,
      structurallyValid: false,
      completed: 0,
      final: initial,
    });
    expect(
      result.issues.some((i) => i.phase === 1 && i.message.includes('destination is also a source'))
    ).toBe(true);
    expect(result.issues.some((i) => i.message.includes('requires project racking'))).toBe(false);
  });

  it('keeps the state before a failed phase, including earlier completed arrivals', () => {
    const result = checkTransferPhases({
      width: 3,
      initial: [slot('front', 1, F), slot('back', 2, B)],
      phases: [
        phase(0, 'front', 1, 0),
        {
          racking: 0,
          transfers: [
            { bed: 'back', needle: 1, offset: 0 }, // Valid alone, but must not partially apply.
            { bed: 'back', needle: 2, offset: 0 },
            { bed: 'front', needle: 0, offset: 0 }, // Empty source invalidates the whole phase.
          ],
        },
        phase(0, 'back', 1, 0),
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      structurallyValid: false,
      completed: 1,
      final: [slot('back', 1, F), slot('back', 2, B)],
    });
    expect(result.issues.every((i) => i.phase === 2)).toBe(true);
  });

  it('moves an occupied destination as a whole mixed stack rather than selectively unstacking it', () => {
    const input: Input = {
        width: 3,
        initial: [slot('front', 0, F), slot('back', 0, B)],
        phases: [phase(0, 'front', 0, 0), phase(-1, 'back', 0, 1)],
        expected: [slot('front', 1, F), slot('back', 0, B)],
      },
      result = checkTransferPhases(input);
    expect(result).toMatchObject({
      ok: false,
      structurallyValid: true,
      targetMatches: false,
      completed: 2,
    });
    expect(result.final).toEqual([slot('front', 1, B, F)]);
    expect(result.mixedStacks).toEqual(result.final);
    expect(result.issues).toEqual([
      { phase: null, message: expect.stringContaining('Final occupancy differs') },
    ]);
    const inspected = checkTransferPhases({ ...input, expected: undefined });
    expect(inspected).toMatchObject({ ok: true, structurallyValid: true, targetMatches: null });
    expect(inspected.mixedStacks).toEqual(result.mixedStacks);
  });

  it('reports pre-existing mixed stacks without treating them as a structural failure', () => {
    const result = checkTransferPhases({
      width: 1,
      initial: [slot('front', 0, F, B)],
      phases: [],
      expected: [slot('front', 0, B, F)],
    });
    expect(result).toMatchObject({ ok: true, completed: 0, targetMatches: true });
    expect(result.mixedStacks).toEqual([slot('front', 0, B, F)]);
  });

  it('canonicalizes slots and loop order while ignoring explicit empty target slots', () => {
    const a = loop('a'),
      z = loop('z'),
      result = checkTransferPhases({
        width: 3,
        initial: [slot('back', 2, B), slot('front', 1, z, a)],
        phases: [],
        expected: [slot('back', 0), slot('front', 1, a, z), slot('back', 2, B)],
      });
    expect(result.ok).toBe(true);
    expect(result.final).toEqual([slot('front', 1, a, z), slot('back', 2, B)]);
  });

  it.each([
    ['missing', []],
    ['extra', [slot('front', 0, F, loop('extra'))]],
    ['relabeled', [slot('front', 0, { ...F, layer: 'back-layer' as const })]],
  ])(
    'rejects a %s target inventory without mislabeling structurally valid transfers',
    (_, expected) => {
      const result = checkTransferPhases({
        width: 2,
        initial: [slot('front', 0, F)],
        phases: [phase(0, 'front', 0, 0)],
        expected: expected as TransferSlot[],
      });
      expect(result).toMatchObject({
        ok: false,
        structurallyValid: true,
        targetMatches: false,
        completed: 1,
        final: [slot('back', 0, F)],
      });
      expect(result.issues).toEqual([
        { phase: null, message: expect.stringContaining('loop inventory differs') },
      ]);
    }
  );

  it('preserves distinct qualified IDs for equal unqualified reference IDs on different layers', () => {
    const result = checkTransferPhases({
      width: 2,
      initial: [slot('front', 1, F), slot('back', 1, B)],
      phases: [phase(0, 'front', 1, 0)],
      expected: [slot('back', 1, B, F)],
    });
    expect(result.ok).toBe(true);
    expect(result.final[0]!.loops).toEqual([B, F]);
    expect(result.mixedStacks).toHaveLength(1);
  });

  it.each([
    [
      'wrong front racking',
      [slot('front', 1, F)],
      phase(0, 'front', 1, 1),
      'requires project racking 1',
    ],
    [
      'wrong back sign',
      [slot('back', 1, B)],
      phase(1, 'back', 1, 1),
      'requires project racking -1',
    ],
    [
      'off-grid destination',
      [slot('front', 0, F)],
      phase(-1, 'front', 0, -1),
      'outside the declared logical grid',
    ],
    ['empty source', [slot('front', 0, F)], phase(0, 'back', 0, 0), 'is empty'],
  ])('refuses %s atomically', (_, initial, bad, message) => {
    const result = checkTransferPhases({
      width: 3,
      initial: initial as TransferSlot[],
      phases: [bad as TransferPhase],
    });
    expect(result).toMatchObject({
      ok: false,
      structurallyValid: false,
      completed: 0,
      final: initial,
    });
    expect(result.issues.some((i) => i.phase === 1 && i.message.includes(message as string))).toBe(
      true
    );
  });

  it('refuses different required rackings and repeated source slots', () => {
    const initial = [slot('front', 0, F), slot('front', 1, loop('other'))],
      conflict = checkTransferPhases({
        width: 3,
        initial,
        phases: [
          {
            racking: 1,
            transfers: [
              { bed: 'front', needle: 0, offset: 1 },
              { bed: 'front', needle: 1, offset: 0 },
            ],
          },
        ],
      });
    expect(conflict.structurallyValid).toBe(false);
    expect(conflict.final).toEqual(initial);
    expect(conflict.issues.some((i) => i.message.includes('requires project racking 0'))).toBe(
      true
    );
    const repeated = checkTransferPhases({
      width: 3,
      initial,
      phases: [
        {
          racking: 0,
          transfers: [
            { bed: 'front', needle: 0, offset: 0 },
            { bed: 'front', needle: 0, offset: 0 },
          ],
        },
      ],
    });
    expect(repeated.structurallyValid).toBe(false);
    expect(repeated.final).toEqual(initial);
    expect(repeated.issues.some((i) => i.message.includes('repeats source'))).toBe(true);
  });

  it('checks runtime phase and transfer schemas rather than trusting TypeScript input types', () => {
    const bads: unknown[] = [
      null,
      {},
      { racking: 0.5, transfers: [] },
      { racking: Infinity, transfers: [] },
      { racking: 0, transfers: null },
      { racking: 0, transfers: [null] },
      { racking: 0, transfers: [{ bed: 'side', needle: 0, offset: 0 }] },
      { racking: 0, transfers: [{ bed: 'front', needle: -1, offset: 0 }] },
      { racking: 0, transfers: [{ bed: 'front', needle: 0.5, offset: 0 }] },
      { racking: 0, transfers: [{ bed: 'front', needle: 0, offset: 0.5 }] },
      { racking: 0, transfers: [{ bed: 'front', needle: 0, offset: NaN }] },
    ];
    for (const bad of bads) {
      const result = unsafe({ width: 2, initial: [slot('front', 0, F)], phases: [bad] });
      expect(result.structurallyValid).toBe(false);
      expect(result.completed).toBe(0);
      expect(result.final).toEqual([slot('front', 0, F)]);
      expect(result.issues.every((i) => i.phase === 1)).toBe(true);
    }
  });

  it('rejects duplicate occupancy, duplicate loop IDs and invalid logical labels', () => {
    const bads: unknown[] = [
      [slot('front', 0, F), slot('front', 0, B)],
      [slot('front', 0, F), slot('back', 0, F)],
      [slot('front', 0, F), slot('back', 0, { ...F, layer: 'back-layer' })],
      [slot('front', 0, F, F)],
      [{ bed: 'front', needle: 0, loops: [{ id: 'x', layer: 'front' }] }],
      [{ bed: 'front', needle: 0, loops: [{ id: '', layer: 'front-layer' }] }],
      [{ bed: 'front', needle: 0, loops: null }],
      [{ bed: 'front', needle: 2, loops: [F] }],
      [{ bed: 'side', needle: 0, loops: [F] }],
      [null],
      null,
    ];
    for (const initial of bads) {
      const result = unsafe({ width: 2, initial, phases: [] });
      expect(result).toMatchObject({
        ok: false,
        structurallyValid: false,
        completed: 0,
        final: [],
        targetMatches: null,
      });
      expect(result.issues.every((i) => i.phase === null)).toBe(true);
    }
  });

  it('rejects malformed expected targets before applying phases', () => {
    for (const expected of [
      null,
      [slot('front', 0, F), slot('front', 0, B)],
      [slot('back', 0, F, F)],
    ]) {
      const result = unsafe({
        width: 2,
        initial: [slot('front', 0, F)],
        phases: [phase(0, 'front', 0, 0)],
        expected,
      });
      expect(result).toMatchObject({
        ok: false,
        structurallyValid: false,
        completed: 0,
        targetMatches: false,
        final: [slot('front', 0, F)],
      });
      expect(
        result.issues.every((i) => i.phase === null && i.message.startsWith('Expected target'))
      ).toBe(true);
    }
  });

  it('uses existing project width limits without inventing machine racking limits', () => {
    const result = checkTransferPhases({
      width: 600,
      initial: [slot('front', 599, F)],
      phases: [phase(-599, 'front', 599, -599)],
      expected: [slot('back', 0, F)],
    });
    expect(result.ok).toBe(true);
    for (const width of [0, 601, -1, 1.5, NaN, Infinity, '2'])
      expect(unsafe({ width, initial: [], phases: [] }).structurallyValid).toBe(false);
    expect(checkTransferPhases({ width: 1, initial: [], phases: [] }).ok).toBe(true);
    expect(
      checkTransferPhases({ width: 1, initial: [], phases: [{ racking: 12345, transfers: [] }] }).ok
    ).toBe(true);
    for (const value of [null, [], {}, { width: 2, initial: [], phases: null }])
      expect(unsafe(value).structurallyValid).toBe(false);
  });

  it('returns target equality for the actual completed prefix even when a later phase fails', () => {
    const result = checkTransferPhases({
      width: 2,
      initial: [slot('front', 0, F)],
      phases: [phase(0, 'front', 0, 0), phase(0, 'front', 0, 0)],
      expected: [slot('back', 0, F)],
    });
    expect(result).toMatchObject({
      ok: false,
      structurallyValid: false,
      targetMatches: true,
      completed: 1,
    });
  });

  it('throws AbortError on immediate cancellation and between committed phases', () => {
    const input: Input = {
      width: 2,
      initial: [slot('front', 0, F)],
      phases: [phase(0, 'front', 0, 0), phase(0, 'back', 0, 0)],
    };
    expect(() => checkTransferPhases(input, { cancelled: () => true })).toThrow(
      expect.objectContaining({ name: 'AbortError' })
    );
    let cancel = false,
      progressed = 0;
    expect(() =>
      checkTransferPhases(input, {
        cancelled: () => cancel,
        progress: () => {
          progressed++;
          cancel = true;
        },
      })
    ).toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(progressed).toBe(1);
    expect(input.initial).toEqual([slot('front', 0, F)]);
  });

  it('moves a large declared stack onto an occupied slot without an argument-count limit or token loss', () => {
    const loops = Array.from({ length: 150_000 }, (_, i) => loop(`F:${i}`)),
      initial: TransferSlot[] = [{ bed: 'front', needle: 0, loops }, slot('back', 0, B)],
      result = checkTransferPhases({ width: 1, initial, phases: [phase(0, 'front', 0, 0)] });
    expect(result.ok).toBe(true);
    expect(result.completed).toBe(1);
    expect(result.final).toHaveLength(1);
    expect(result.final[0]!.loops).toHaveLength(150_001);
    expect(new Set(result.final[0]!.loops.map((token) => token.id)).size).toBe(150_001);
    expect(result.mixedStacks).toHaveLength(1);
    expect(initial[0]!.loops).toHaveLength(150_000);
    expect(initial[1]!.loops).toEqual([B]);
  });
});
