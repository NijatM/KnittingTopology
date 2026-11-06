import { describe, it, expect } from 'vitest';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings, validateKnitSettings } from '../../src/knit/settings';
import { bmpBytes, grammarJson } from '../../src/knit/files';
import { validateShapeOperations } from '../../src/knit/shape-validate';
import { knitReport } from '../../src/knit/report';
import { createProject, parseProject, serializeProject } from '../../src/app/project';
import type { KnitSettings, SurfaceSpec } from '../../src/core/types';
import { mappedChart } from './shape-fixtures';

const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'shape-program' };
const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
function input(changes: Partial<KnitSettings> = {}, surface = plane) {
  return {
    surface,
    graph: null,
    swatches,
    knit: { ...defaultKnitSettings(), mode: 'shape' as const, ...changes },
  };
}
function program(changes: Partial<KnitSettings> = {}, surface = plane) {
  const r = buildKnitProgram(input(changes, surface));
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
describe('surface to shape bitmap integration', () => {
  it.each(['v0', 'u1', 'v1', 'u0'] as const)(
    'realizes every rectangular surface loop at %s',
    (startEdge) => {
      const p = program({ startEdge });
      expect([p.w, p.h]).toEqual([17, 25]);
      expect(p.exportBlockers).toEqual([]);
      expect(p.shape!.needles.steps).toEqual([]);
      expect(p.shape!.needles.moves).toEqual([]);
      expect(p.cells.every((i) => p.key.ops[i]!.id === 'kf')).toBe(true);
      expect(p.shape!.needles.placements).toHaveLength(425);
      const point = p.mapping.toSurface([3.5, 4.5]);
      expect(p.mapping.toGrid(point)).toEqual([3.5, 4.5]);
      expect(bmpBytes(p).slice(0, 2)).toEqual(new Uint8Array([66, 77]));
      expect(JSON.parse(grammarJson({ ...p, name: 'plane', note: 'test' })).passes).toBe(25);
    }
  );
  it('requires measured jersey, even with a typed size or another measured structure', () => {
    expect(
      buildKnitProgram({
        ...input({ size: { source: 'typed', needles: 10, passes: 10 } }),
        swatches: [],
      })
    ).toMatchObject({ ok: false, reason: expect.stringContaining('measured jersey') });
    expect(
      buildKnitProgram({
        ...input(),
        swatches: [{ structure: 'reverse', stitchWidth: 0.005, courseHeight: 0.005 }],
      }).ok
    ).toBe(false);
  });
  it('uses measured fill dimensions and flags a jersey assumption', () => {
    const s = {
      ...input(),
      swatches: [...swatches, { structure: 'reverse', stitchWidth: 0.01, courseHeight: 0.01 }],
    };
    s.knit.cells.fill = 'reverse';
    const r = buildKnitProgram(s);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([r.program.w, r.program.h]).toEqual([10, 10]);
      expect(r.program.sizeGauge?.measuredOn).toBe('reverse');
      expect(r.program.exportBlockers).toEqual([]);
    }
    const p = program({ cells: { fill: 'reverse', rule: { kind: 'uniform' }, overrides: {} } });
    expect(p.sizeGauge?.assumed).toBe(true);
    expect(p.issues.join(' ')).toContain('assumed = jersey');
  });
  it('blocks writers for operation graphs the selected structure cannot realize', () => {
    const p = program({ cells: { fill: 'hold', rule: { kind: 'uniform' }, overrides: {} } });
    expect(p.exportBlockers.length).toBeGreaterThan(0);
    expect(() => bmpBytes(p)).toThrow(/export blocked/);
    expect(() => grammarJson({ ...p, name: 'invalid', note: '' })).toThrow(/export blocked/);
    expect(() => knitReport(p, 'inspectable', 0.1)).not.toThrow();
  });
  it('detects a corrupted parent relationship independently of generation', () => {
    const p = program();
    const x = p.shape!.needles.placements.find((x) => x.course === 2)!;
    x.parents = ['wrong-parent'];
    expect(validateShapeOperations(p.shape!, p.cells, p.key).join(' ')).toContain(
      'loop parents differ'
    );
  });
  it('requires a generated network for network and combined modes', () => {
    const saddle = { ...plane, kind: 'saddle' as const, curvature: 0.5 };
    expect(buildKnitProgram(input({ mode: 'network' }, saddle))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Generate a network'),
    });
    expect(buildKnitProgram(input({ mode: 'both' }))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Generate a network'),
    });
  });
  it('saves optional start-edge and new-loop settings without changing schema', () => {
    const knit = {
      ...defaultKnitSettings(),
      mode: 'shape' as const,
      startEdge: 'u1' as const,
      newLoop: 'tuck' as const,
    };
    const project = { ...createProject(), knit, swatches };
    expect(parseProject(serializeProject(project)).knit).toEqual(knit);
    expect(() => validateKnitSettings({ ...knit, startEdge: 'middle' })).toThrow(/start edge/);
    expect(() => validateKnitSettings({ ...knit, newLoop: 'invented' })).toThrow(/new loop/);
    expect(validateKnitSettings(defaultKnitSettings()).startEdge).toBeUndefined();
  });
  it('returns finite saddle loops and an inspectable report', () => {
    const p = program({}, { ...plane, kind: 'saddle', curvature: 0.5 });
    expect(p.shape!.needles.placements.every((x) => x.loop.position.every(Number.isFinite))).toBe(
      true
    );
    expect(p.shape!.needles.moves.every((x) => Math.abs(x.to - x.needle) === 1)).toBe(true);
    expect(knitReport(p, 'saddle', 0.1)).toContain('Not machine-ready');
  });
  it.each([false, true])(
    'realizes widening/narrowing trapezoid loop graphs (reverse=%s)',
    (reverse) => {
      const s = mappedChart((u, v) => [u * (0.08 + 0.04 * (reverse ? 1 - v : v)), 0.1 * v, 0], 1);
      const p = program({}, s);
      expect(p.exportBlockers).toEqual([]);
      expect(p.shape!.needles.steps.filter((x) => x.role === 'turn')).toHaveLength(0);
      if (reverse)
        expect(p.shape!.needles.steps.filter((x) => x.role === 'decrease').length).toBeGreaterThan(
          0
        );
      else
        expect(
          p.shape!.needles.steps.filter((x) => x.role === 'edge increase').length
        ).toBeGreaterThan(0);
    }
  );
  it('sector has short rows with preserved held-loop parents', () => {
    const s = mappedChart((u, v) => {
      const r = 0.06 + 0.04 * u,
        a = 0.8 * v;
      return [r * Math.cos(a), r * Math.sin(a), 0];
    }, 24);
    const p = program({}, s);
    expect(p.exportBlockers).toEqual([]);
    expect(p.shape!.needles.steps.filter((x) => x.role === 'turn').length).toBeGreaterThan(0);
    expect(
      p.shape!.needles.steps.filter(
        (x) => x.role === 'increase' || x.role === 'decrease' || x.role === 'edge increase'
      )
    ).toHaveLength(0);
  });
});
