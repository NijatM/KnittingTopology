import { describe, it, expect } from 'vitest';
import type { KnitSettings, SurfaceSpec, SwatchEntry } from '../../src/core/types';
import { BASIC, customCopy, validateKey } from '../../src/knit/keys';
import { defaultKnitSettings, withKey } from '../../src/knit/settings';
import { buildKnitProgram } from '../../src/knit/program';
import { cellDifference, inputsDiffer, knitSnapshot } from '../../src/knit/compare';
import { knitCompareNote } from '../../src/app/knit/KnitVariant';

// test values, not measured gauges
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'compare' };
const jersey = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
function snap(knit: Partial<KnitSettings> = {}, swatches: SwatchEntry[] = jersey, surface = plane) {
  const input = {
    surface,
    graph: null,
    swatches,
    knit: { ...defaultKnitSettings(), mode: 'shape' as const, ...knit },
  };
  const r = buildKnitProgram(input);
  if (!r.ok) throw new Error(r.reason);
  return { program: r.program, snapshot: knitSnapshot(r.program, input) };
}

describe('knit variant snapshots', () => {
  it('keeps a copy of the cells, the key and the metrics', () => {
    const { program, snapshot } = snap();
    expect(snapshot).toMatchObject({
      mode: 'shape',
      custom: false,
      w: program.w,
      h: program.h,
      transfers: program.transfers.length,
      findings: program.findings.length,
      blockers: 0,
      unresolved: 0,
      context: { surface: 'compare', network: null },
    });
    expect(snapshot.key.name).toBe(BASIC.name);
    expect(snapshot.structures).toEqual([
      { name: 'single jersey', loops: program.structures[0]!.loops, gauge: 'measured' },
    ]);
    const before = snapshot.cells[0];
    program.cells[0] = 255;
    expect(snapshot.cells[0]).toBe(before);
  });
  it('compares operation meanings, not key colours', () => {
    const a = snap().snapshot;
    expect(cellDifference(a, a)).toEqual({ differ: 0, total: a.w * a.h });
    // a custom copy with other colours knits the same operations
    const copy = customCopy(BASIC, 'custom-c');
    const recoloured = validateKey({
      ...copy,
      ops: copy.ops.map((o, i) => ({ ...o, rgb: [i, 1, 2] })),
    });
    const b = snap(
      withKey({ ...defaultKnitSettings(), mode: 'shape', keys: [recoloured] }, 'custom-c').settings
    ).snapshot;
    expect(b.custom).toBe(true);
    expect(cellDifference(a, b)).toEqual({ differ: 0, total: a.w * a.h });
    // reverse jersey changes every knitted cell and no hold
    const c = snap({
      cells: { fill: 'reverse', rule: { kind: 'uniform' }, overrides: {} },
    }).snapshot;
    const knitted = a.cells.filter((v) => BASIC.ops[v]!.steps[0]!.action !== 'float').length;
    expect(knitted).toBeGreaterThan(0);
    expect(cellDifference(a, c)).toEqual({ differ: knitted, total: a.w * a.h });
  });
  it('does not compare different sizes cell by cell, and notes different inputs', () => {
    const a = snap().snapshot,
      b = snap({}, [{ structure: 'jersey', stitchWidth: 0.005, courseHeight: 0.004 }]).snapshot;
    expect(b.w).not.toBe(a.w);
    expect(cellDifference(a, b)).toBeNull();
    expect(inputsDiffer(a, b)).toBe(true);
    expect(inputsDiffer(a, snap({ newLoop: 'tuck' }).snapshot)).toBe(false);
    expect(knitCompareNote([a, b])).toContain('do not isolate the knit settings');
    expect(knitCompareNote([a, 'Knit program not captured', snap().snapshot])).toContain(
      'share surface, network and measurements'
    );
    expect(knitCompareNote([a, null])).toBe('');
  });
});
