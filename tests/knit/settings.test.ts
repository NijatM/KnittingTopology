import { describe, expect, it } from 'vitest';
import {
  createProject,
  historyReducer,
  parseProject,
  scientificSignature,
  serializeProject,
} from '../../src/app/project';
import { defaultKnitSettings, validateKnitSettings } from '../../src/knit/settings';
import { gaugeOf, parseSwatchFile, swatchFileText, validateSwatches } from '../../src/knit/gauge';
import type { ProjectState, SwatchEntry } from '../../src/core/types';

const jersey: SwatchEntry = {
  structure: 'jersey',
  stitchWidth: 0.0011,
  courseHeight: 0.0009,
  date: '2026-11-06',
  gauge: 'to confirm',
  yarn: 'test yarn',
};

describe('knit settings', () => {
  it('defaults validate unchanged', () => {
    expect(validateKnitSettings(defaultKnitSettings())).toEqual(defaultKnitSettings());
  });
  it.each([
    ['mode', { mode: 'loops' }],
    ['key', { keyId: 'nope' }],
    ['typed size', { size: { source: 'typed', needles: 601, passes: 10 } }],
    ['edge width', { edges: { structure: 'rib11', width: 0, boundary: false } }],
    [
      'palette',
      { cells: { fill: 'jersey', rule: { kind: 'coarse', palette: [] }, overrides: {} } },
    ],
    [
      'side class',
      {
        cells: { fill: 'jersey', rule: { kind: 'sides', bySides: { '7': 'seed' } }, overrides: {} },
      },
    ],
    ['limits', { limits: { float: -1, held: 12, tucks: 4 } }],
    ['lab', { lab: { firstPass: 'up', transferTiming: 'after-row', travel: 'same-stroke' } }],
  ])('rejects an invalid %s', (_name, change) => {
    expect(() => validateKnitSettings({ ...defaultKnitSettings(), ...change })).toThrow();
  });
});

describe('measurement table', () => {
  it('validates, keeps text as entered and rejects duplicates and bad values', () => {
    expect(validateSwatches([jersey])).toEqual([jersey]);
    expect(() => validateSwatches([jersey, jersey])).toThrow(/more than once/);
    expect(() => validateSwatches([{ ...jersey, stitchWidth: 0 }])).toThrow(/between/);
    expect(() => validateSwatches([{ ...jersey, courseHeight: Number.NaN }])).toThrow();
  });
  it('uses jersey for unmeasured structures, flagged, and nothing without jersey', () => {
    const rib = { structure: 'rib11', stitchWidth: 0.0008, courseHeight: 0.001 };
    expect(gaugeOf('rib11', [jersey, rib])).toMatchObject({ assumed: false, stitchWidth: 0.0008 });
    expect(gaugeOf('seed', [jersey, rib])).toMatchObject({ assumed: true, measuredOn: 'jersey' });
    expect(gaugeOf('seed', [rib])).toBeNull();
  });
  it('round-trips as its own file with declared units', () => {
    const text = swatchFileText([jersey]);
    expect(JSON.parse(text).units).toEqual({ stitchWidth: 'm', courseHeight: 'm' });
    expect(parseSwatchFile(text)).toEqual([jersey]);
    expect(() =>
      parseSwatchFile(text.replace('"courseHeight": "m"', '"courseHeight": "mm"'))
    ).toThrow(/meters/);
  });
});

describe('project contract', () => {
  const withKnit = (): ProjectState => ({
    ...createProject(),
    knit: { ...defaultKnitSettings(), edges: { structure: 'rib11', width: 3, boundary: true } },
    swatches: [jersey],
  });

  it('saves and restores knit settings and swatches', () => {
    const p = withKnit();
    const restored = parseProject(serializeProject(p));
    expect(restored.knit).toEqual(p.knit);
    expect(restored.swatches).toEqual(p.swatches);
  });

  it('opens schema 1.0.0 projects without knit fields unchanged', () => {
    const restored = parseProject(serializeProject(createProject()));
    expect(restored.knit).toBeUndefined();
    expect(restored.swatches).toBeUndefined();
  });

  it('rejects invalid knit fields with a project file error', () => {
    const file = JSON.parse(serializeProject(withKnit()));
    file.project.knit.edges.width = 1000;
    expect(() => parseProject(JSON.stringify(file))).toThrow(/Project file: knit program/);
    const bad = JSON.parse(serializeProject(withKnit()));
    bad.project.swatches = [{ structure: 'jersey', stitchWidth: 'wide', courseHeight: 0.001 }];
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/Project file: knit program/);
  });

  it('knit changes do not stale the network and are undoable', () => {
    const p = createProject();
    const q = withKnit();
    expect(scientificSignature(q)).toBe(scientificSignature(p));
    let h = historyReducer({ past: [], present: p, future: [] }, { type: 'commit', next: q });
    expect(h.present.knit?.edges.width).toBe(3);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.knit).toBeUndefined();
  });
});
