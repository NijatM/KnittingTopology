import { describe, expect, it } from 'vitest';
import type { SwatchEntry } from '../../src/core/types';
import {
  createProject,
  historyReducer,
  parseProject,
  scientificSignature,
  serializeProject,
} from '../../src/app/project';
import {
  gaugeOf,
  measurementStateLabel,
  parseSwatchFile,
  swatchFileText,
  validateSwatches,
} from '../../src/knit/gauge';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings } from '../../src/knit/settings';
import { knitReport } from '../../src/knit/report';
import { bmpBytes } from '../../src/knit/files';

// All dimensions and machine-setting strings below are test values, not measured gauges.
const old: SwatchEntry = { structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 };
const context: NonNullable<SwatchEntry['calibration']> = {
  state: 'biaxial-locked',
  machine: 'Test machine — not a lab specification',
  knitPoint: 'dial 4 (test value)',
  yarnTension: 'test tension in user units',
  knittingSpeed: 'test speed in user units',
  protocol: 'Synthetic record, not a measurement.\nRecord both loading directions and supports.',
};

describe('measurement conditions across file and generator boundaries', () => {
  it.each(['relaxed', 'tensioned', 'biaxial-locked'] as const)(
    'round-trips %s context and exact user units through both files',
    (state) => {
      const entry = { ...old, calibration: { ...context, state } };
      expect(parseSwatchFile(swatchFileText([entry]))).toEqual([entry]);
      const project = { ...createProject(), swatches: [entry] };
      expect(parseProject(serializeProject(project)).swatches).toEqual([entry]);
    }
  );

  it('keeps legacy state unspecified rather than inventing relaxed or locked calibration', () => {
    expect(parseSwatchFile(swatchFileText([old]))).toEqual([old]);
    const restored = parseProject(serializeProject({ ...createProject(), swatches: [old] }));
    expect(restored.swatches?.[0]).not.toHaveProperty('calibration');
    expect(measurementStateLabel(restored.swatches?.[0]?.calibration)).toBe('Unspecified');
    expect(validateSwatches([{ ...old, calibration: { machine: 'test machine' } }])[0]).toEqual({
      ...old,
      calibration: { machine: 'test machine' },
    });
  });

  it.each([
    null,
    [],
    'relaxed',
    { state: 'machine-ready' },
    { state: null },
    { machine: 7 },
    { protocol: 'x'.repeat(501) },
    { yarnTension: { value: 5 } },
  ])('rejects malformed calibration %j on table and project import', (calibration) => {
    const bad = { ...old, calibration };
    expect(() => validateSwatches([bad])).toThrow(/calibration/);
    const table = JSON.parse(swatchFileText([old]));
    table.swatches = [bad];
    expect(() => parseSwatchFile(JSON.stringify(table))).toThrow(/calibration/);
    const file = JSON.parse(serializeProject({ ...createProject(), swatches: [old] }));
    file.project.swatches = [bad];
    expect(() => parseProject(JSON.stringify(file))).toThrow(/Project file: knit program/);
  });

  it('tracks the actual measurement source instead of borrowing another structure’s conditions', () => {
    const jersey = { ...old, calibration: context };
    const rib: SwatchEntry = { ...old, structure: 'rib11', calibration: { state: 'relaxed' } };
    expect(gaugeOf('rib11', [jersey, rib])?.calibration).toEqual({ state: 'relaxed' });
    expect(gaugeOf('seed', [jersey, rib])).toMatchObject({
      assumed: true,
      measuredOn: 'jersey',
      calibration: context,
    });
    expect(gaugeOf('rib11', [jersey, { ...old, structure: 'rib11' }])).not.toHaveProperty(
      'calibration'
    );
  });

  it('preserves graph freshness and supports undoing context alone', () => {
    const before = { ...createProject(), swatches: [old] };
    const after = { ...before, swatches: [{ ...old, calibration: context }] };
    expect(scientificSignature(before)).toBe(scientificSignature(after));
    let history = historyReducer(
      { past: [], present: before, future: [] },
      { type: 'commit', next: after }
    );
    expect(history.present.swatches?.[0]?.calibration).toEqual(context);
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.swatches).toEqual([old]);
    history = historyReducer(history, { type: 'redo' });
    expect(history.present.swatches?.[0]?.calibration).toEqual(context);
  });

  it('changes report provenance without changing courses, parent identities or bitmap', () => {
    const project = {
      ...createProject(),
      surface: { kind: 'plane' as const, size: 0.1, curvature: 0, revision: 'calibration-test' },
      knit: {
        ...defaultKnitSettings(),
        mode: 'shape' as const,
        cells: { fill: 'reverse', rule: { kind: 'uniform' as const }, overrides: {} },
      },
      swatches: [old],
    };
    const a = buildKnitProgram(project);
    const b = buildKnitProgram({ ...project, swatches: [{ ...old, calibration: context }] });
    if (!a.ok || !b.ok) throw new Error('test shape unexpectedly unavailable');
    expect(b.program.shape).toEqual(a.program.shape);
    expect(b.program.cells).toEqual(a.program.cells);
    expect(bmpBytes(b.program)).toEqual(bmpBytes(a.program));
    expect(b.program.exportBlockers).toEqual(a.program.exportBlockers);
    const report = knitReport(b.program, 'test only', 0.1);
    // the state is reported by its label; the text fields verbatim, continuation lines indented
    const { state: _state, ...texts } = context;
    expect(report).toContain('state Biaxial locked (user-declared)');
    for (const text of Object.values(texts)) {
      expect(report).toContain(text.replace(/\n/g, '\n      '));
    }
    expect(report).toContain('fallback, not measured on this structure');
    expect(report).toContain('not machine settings or physical validation');
    expect(report).toContain('Thesis Libra/Model 9 examples are not the target specification');
    expect(knitReport(a.program, 'legacy test', 0.1)).toContain('state Unspecified');
  });
});
