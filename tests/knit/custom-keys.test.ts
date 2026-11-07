import { describe, it, expect } from 'vitest';
import type { KnitSettings, SurfaceSpec } from '../../src/core/types';
import {
  BASIC,
  TWO,
  customCopy,
  findOp,
  importGrammarKey,
  meaningName,
  sameMeaning,
  settingsKey,
  translateOp,
  validateKey,
  type Key,
} from '../../src/knit/keys';
import { structuresForKey } from '../../src/knit/structures';
import { defaultKnitSettings, validateKnitSettings, withKey } from '../../src/knit/settings';
import { addKey, opUsers, removeKey, replaceKey } from '../../src/knit/custom-keys';
import { buildKnitProgram } from '../../src/knit/program';
import { insertTransfers } from '../../src/knit/transfers';
import { bmpBytes, grammarJson } from '../../src/knit/files';
import { knitReport } from '../../src/knit/report';
import { imageIndex } from '../../src/knit/grid';
import { validateShapeOperations } from '../../src/knit/shape-validate';
import { mappedChart } from './shape-fixtures';
import { createProject } from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';

// Node's fs without @types/node, as in grammar.test.ts.
const fs = (
  globalThis as unknown as {
    process: { getBuiltinModule(id: 'node:fs'): { readFileSync(path: URL): Uint8Array } };
  }
).process.getBuiltinModule('node:fs');
const fixture = (name: string) =>
  new TextDecoder().decode(fs.readFileSync(new URL(`../fixtures/knit/${name}`, import.meta.url)));
const ids = (key: Key) => key.ops.map((o) => o.id);
/** A custom copy of a class key whose operations have new ids, names and colours (same meanings). */
function renamed(from: Key, id = 'custom-renamed'): Key {
  const k = customCopy(from, id);
  return validateKey({
    ...k,
    ops: k.ops.map((o, i) => ({
      ...o,
      id: `op-${i}`,
      name: `op ${i}`,
      rgb: [i * 7, 255 - i * 7, 100],
      colour: `c${i}`,
    })),
  });
}
const without = (k: Key, drop: string[]): Key =>
  validateKey({ ...k, ops: k.ops.filter((o) => !drop.includes(o.id)) });

describe('operations by meaning', () => {
  it('matches steps and transfer; a float has no bed', () => {
    const kf = BASIC.ops.find((o) => o.id === 'kf')!;
    expect(BASIC.ops[findOp(BASIC, kf.steps)]!.id).toBe('kf');
    expect(
      sameMeaning(
        { steps: [{ action: 'float', bed: 'front' }], move: 'none' },
        { steps: [{ action: 'float', bed: 'back' }], move: 'none' }
      )
    ).toBe(true);
    expect(findOp(BASIC, [{ action: 'knit', bed: 'front' }], 'right')).toBeGreaterThanOrEqual(0);
    expect(findOp(TWO, [{ action: 'knit', bed: 'front' }], 'none')).toBe(-1);
    expect(meaningName([{ action: 'knit', bed: 'front' }], 'across')).toBe(
      'knit front, transfer to back'
    );
  });
  it('translates op ids between keys and keeps ids within one key', () => {
    const r = renamed(BASIC);
    expect(translateOp(BASIC, 'kf', r)).toBe(r.ops[BASIC.ops.findIndex((o) => o.id === 'kf')]!.id);
    expect(translateOp(r, 'op-0', r)).toBe('op-0');
    expect(translateOp(BASIC, 'k2f', r)).toBeUndefined();
  });
});

describe('custom key validation', () => {
  it('copies a class key with its credit and a new name', () => {
    const k = customCopy(BASIC, 'custom-a');
    expect(k).toMatchObject({ id: 'custom-a', name: `my key (from ${BASIC.name})`, mode: 1 });
    expect(k.credit).toBe(BASIC.credit);
    expect(k.preset).toBeUndefined();
    expect(ids(k)).toEqual(ids(BASIC));
    expect(customCopy(TWO, 'custom-b').mode).toBe(2);
  });
  it.each([
    ['a class key id', { id: '4s52-basic' }, 'custom-'],
    [
      'a duplicate colour',
      { ops: [BASIC.ops[0], { ...BASIC.ops[1], rgb: BASIC.ops[0]!.rgb }] },
      'colour',
    ],
    [
      'no float',
      { ops: BASIC.ops.filter((o) => !o.steps.every((s) => s.action === 'float')) },
      'float',
    ],
    ['a two-guide step count', { ops: [...BASIC.ops, { ...TWO.ops[1], rgb: [1, 2, 3] }] }, 'step'],
    [
      'too many operations',
      {
        ops: Array.from({ length: 33 }, (_, i) => ({
          ...BASIC.ops[0],
          id: `o${i}`,
          rgb: [i, 0, 0],
        })),
      },
      '32',
    ],
    ['a long name', { name: 'x'.repeat(61) }, '60'],
  ])('refuses %s', (_, change, message) => {
    expect(() => validateKey({ ...customCopy(BASIC, 'custom-a'), ...change })).toThrow(message);
  });
  it('refuses a transfer in a two-guide key', () => {
    const k = customCopy(TWO, 'custom-t');
    expect(() =>
      validateKey({
        ...k,
        ops: [...k.ops, { ...k.ops[1]!, id: 'x', rgb: [1, 2, 3], move: 'left' }],
      })
    ).toThrow('no transfer');
  });
  it('saves custom keys and their tiles in knit settings', () => {
    const k = customCopy(BASIC, 'custom-a');
    const tile = { id: 'custom:t', name: 't', keyId: k.id, w: 1, h: 1, rows: [['kf']] };
    const s = validateKnitSettings({
      ...defaultKnitSettings(),
      keyId: k.id,
      keys: [k],
      tiles: [tile],
    });
    expect(s.keys).toEqual([k]);
    expect(settingsKey(s)).toEqual(k);
    expect(() => validateKnitSettings({ ...defaultKnitSettings(), keyId: 'custom-x' })).toThrow(
      'knit key'
    );
    expect(() =>
      validateKnitSettings({
        ...defaultKnitSettings(),
        keys: Array.from({ length: 9 }, (_, i) => customCopy(BASIC, `custom-${i}`)),
      })
    ).toThrow('at most 8');
    expect(() => validateKnitSettings({ ...defaultKnitSettings(), keys: [k, k] })).toThrow(
      'unique'
    );
  });
});

describe('structures under custom keys', () => {
  it('rewrites built-ins to the custom op ids, with the same meanings', () => {
    const r = renamed(BASIC);
    const built = structuresForKey(BASIC),
      custom = structuresForKey(r);
    expect(custom.map((s) => s.id)).toEqual(built.map((s) => s.id));
    for (const [i, s] of custom.entries())
      s.rows.flat().forEach((id, n) => {
        const a = BASIC.ops.find((o) => o.id === built[i]!.rows.flat()[n])!,
          b = r.ops.find((o) => o.id === id)!;
        expect(sameMeaning(a, b)).toBe(true);
      });
  });
  it('drops structures whose operations the key lacks', () => {
    const k = without(customCopy(BASIC, 'custom-a'), ['kfxb', 'kbxf']);
    const names = structuresForKey(k).map((s) => s.id);
    expect(names).toContain('jersey');
    const needsAcross = structuresForKey(BASIC).filter((s) =>
      s.rows.flat().some((id) => id === 'kfxb' || id === 'kbxf')
    );
    expect(needsAcross.length).toBeGreaterThan(0);
    for (const s of needsAcross) expect(names).not.toContain(s.id);
  });
  it('offers class-key tiles in custom copies of the same mode only', () => {
    const tile = { id: 'custom:t', name: 't', keyId: BASIC.id, w: 1, h: 1, rows: [['kb']] };
    const r = renamed(BASIC);
    expect(structuresForKey(r, [tile]).find((s) => s.id === 'custom:t')?.rows).toEqual([
      [translateOp(BASIC, 'kb', r)],
    ]);
    expect(structuresForKey(TWO, [tile]).some((s) => s.id === 'custom:t')).toBe(false);
  });
});

describe('switching keys', () => {
  it('moves unavailable assignments to the new fill and switches marks off', () => {
    const s: KnitSettings = {
      ...defaultKnitSettings(),
      cells: {
        fill: 'jersey',
        rule: { kind: 'alternating', palette: ['jersey', 'reverse'] },
        overrides: { c1: 'seed' },
      },
      edges: { structure: 'reverse', width: 2, boundary: false },
      nodes: { structure: 'reverse', size: 3, extraordinary: null },
    };
    const two = withKey(s, TWO.id);
    expect(two.settings.cells).toEqual({
      fill: 'dk-a',
      rule: { kind: 'alternating', palette: ['dk-a', 'dk-a'] },
      overrides: { c1: 'dk-a' },
    });
    expect(two.settings.edges.structure).toBeNull();
    expect(two.settings.nodes.structure).toBeNull();
    expect(two.reset).toBe(6);
    const copy = addKey(s, customCopy(BASIC, 'custom-a'));
    expect(copy.reset).toBe(0);
    expect(copy.settings.keyId).toBe('custom-a');
    expect(copy.settings.cells).toEqual(s.cells);
  });
});

describe('editing custom keys', () => {
  it('guards operations in use and keys in use by tiles', () => {
    const k = customCopy(BASIC, 'custom-a');
    let s = addKey(defaultKnitSettings(), k).settings;
    expect(opUsers(s, k, 'kf')).toContain('assigned structure single jersey');
    expect(opUsers(s, k, 'fl')).toContain('needles that knit nothing');
    expect(opUsers(s, k, 'tb')).toEqual([]);
    s = replaceKey(s, without(k, ['tb']));
    expect(settingsKey(s).ops.some((o) => o.id === 'tb')).toBe(false);
    expect(() =>
      replaceKey(s, {
        ...settingsKey(s),
        ops: settingsKey(s).ops.map((o, i) => (i ? { ...o, rgb: settingsKey(s).ops[0]!.rgb } : o)),
      })
    ).toThrow('colour');
    const tiled = {
      ...s,
      tiles: [{ id: 'custom:t', name: 'mine', keyId: k.id, w: 1, h: 1, rows: [['kb']] }],
    };
    expect(opUsers(tiled, settingsKey(s), 'kb')).toContain('tile mine');
    expect(() => removeKey(tiled, k.id)).toThrow('mine');
    const removed = removeKey(s, k.id);
    expect(removed.settings.keyId).toBe(BASIC.id);
    expect(removed.settings.keys).toEqual([]);
  });
  it('reads a key from a Knit Grammar pattern JSON once', () => {
    let n = 0;
    const newId = () => `custom-new${n++}`;
    expect(() => importGrammarKey(fixture('two-guide.json'), [], newId)).toThrow(
      'already available'
    );
    const j = JSON.parse(fixture('two-guide.json'));
    j.key.id = 'custom-lab';
    j.key.name = 'lab key';
    j.key.ops[5].rgb = [200, 150, 10];
    const text = JSON.stringify(j);
    const first = importGrammarKey(text, [], newId);
    expect(first).toMatchObject({
      existing: false,
      key: { id: 'custom-lab', name: 'lab key', mode: 2 },
    });
    expect(importGrammarKey(text, [first.key], newId)).toEqual({ key: first.key, existing: true });
    j.key.ops[6].rgb = [1, 1, 1];
    expect(importGrammarKey(JSON.stringify(j), [first.key], newId).key.id).toBe('custom-new0');
    expect(() => importGrammarKey('{', [], newId)).toThrow('not JSON');
    expect(() => importGrammarKey('{"format":"x"}', [], newId)).toThrow('Knit Grammar pattern');
  });
});

describe('programs with custom keys', () => {
  const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'keys' };
  const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
  function program(knit: KnitSettings, surface = plane) {
    const r = buildKnitProgram({ surface, graph: null, swatches, knit });
    if (!r.ok) throw new Error(r.reason);
    return r.program;
  }
  const shape = (keyId: string, keys: Key[] = [], changes: Partial<KnitSettings> = {}) =>
    withKey({ ...defaultKnitSettings(), mode: 'shape', keys, ...changes }, keyId).settings;

  it('writes the same operations in the custom colours', () => {
    const r = renamed(BASIC);
    const a = program(shape(BASIC.id)),
      b = program(shape(r.id, [r]));
    expect(b.cells.length).toBe(a.cells.length);
    for (let i = 0; i < a.cells.length; i++)
      expect(sameMeaning(BASIC.ops[a.cells[i]!]!, r.ops[b.cells[i]!]!)).toBe(true);
    const bmp = bmpBytes(b);
    const first = r.ops[b.cells[(b.h - 1) * b.w]!]!.rgb;
    // bottom row, needle 1, stored BGR at the start of the pixel data
    expect([...bmp.slice(54, 57)].reverse()).toEqual(first);
    const json = JSON.parse(grammarJson({ ...b, name: 'x', firstDir: 1, note: '' }));
    expect(json.key).toMatchObject({ id: r.id, name: r.name });
    expect(knitReport(b, 'plane', 0.1)).toContain('(custom; operations matched by meaning)');
  });
  it('skips automatic transfers the key cannot express, and reports them', () => {
    const w = 1,
      h = 2,
      cells = new Uint8Array(2);
    const k = without(customCopy(BASIC, 'custom-a'), ['kfxb', 'kbxf']);
    cells[imageIndex(w, h, 0, 0)] = ids(k).indexOf('kf');
    cells[imageIndex(w, h, 0, 1)] = ids(k).indexOf('kb');
    const t = insertTransfers(w, h, cells, k, () => false);
    expect(t.changes).toEqual([]);
    expect(t.skipped).toEqual([
      { needle: 0, pass: 0, reason: 'the key has no knit front, transfer to back operation' },
    ]);
    const full = insertTransfers(w, h, cells, BASIC, () => false);
    expect(full.changes).toHaveLength(1);
    expect(full.changes[0]).toMatchObject({ from: 'kf', to: 'kfxb' });
  });

  const sector = mappedChart((u, v) => {
    const r = 0.06 + 0.04 * u,
      a = 0.8 * v;
    return [r * Math.cos(a), r * Math.sin(a), 0];
  }, 24);
  const narrowing = mappedChart((u, v) => [u * (0.08 + 0.04 * (1 - v)), 0.1 * v, 0], 1);
  const widening = mappedChart((u, v) => [u * (0.08 + 0.04 * v), 0.1 * v, 0], 1);

  it('knits two-guide short rows with both yarns held and no blocker', () => {
    const p = program(shape(TWO.id), sector);
    expect(p.exportBlockers).toEqual([]);
    expect(p.shape!.needles.steps.some((x) => x.role === 'turn')).toBe(true);
    const fl2 = ids(TWO).indexOf('fl2'),
      k2f = ids(TWO).indexOf('k2f');
    for (let i = 0; i < p.cells.length; i++)
      expect(p.cells[i]).toBe(p.shape!.placementAt[i]! >= 0 ? k2f : fl2);
    expect(p.issues.some((t) => t.includes('short rows hold both yarns'))).toBe(true);
    expect(knitReport(p, 'sector', 0.1)).toContain('both yarns held on short rows');
  });
  it('follows the loop chain on every bed a two-guide operation knits', () => {
    const p = program(shape(TWO.id), sector);
    const at = (name: string) => ids(TWO).indexOf(name);
    const birdseye = p.cells.slice(),
      single = p.cells.slice();
    for (const x of p.shape!.needles.placements) {
      const i = imageIndex(p.w, p.h, x.needle, x.course);
      birdseye[i] = at(x.course % 2 ? 'k2b' : 'k2f');
      if (x.course === 3) single[i] = at('g2');
    }
    expect(validateShapeOperations(p.shape!, birdseye, TWO)).toEqual([]);
    expect(validateShapeOperations(p.shape!, single, TWO).join(' ')).toContain(
      'A required parent remains on the opposite bed.'
    );
  });
  it('blocks two-guide shaping that needs transfers', () => {
    const p = program(shape(TWO.id), narrowing);
    expect(p.shape!.needles.moves.length).toBeGreaterThan(0);
    expect(p.exportBlockers.length).toBeGreaterThan(0);
    expect(p.exportBlockers.join(' ')).toContain('two-layer');
  });
  it('blocks shaping transfers that a custom key lacks', () => {
    const k = without(customCopy(BASIC, 'custom-a'), ['kfxl', 'kfxr']);
    const p = program(shape(k.id, [k]), narrowing);
    expect(p.exportBlockers.join(' ')).toMatch(
      /The key has no knit front, transfer (left|right) operation/
    );
    expect(program(shape(BASIC.id), narrowing).exportBlockers).toEqual([]);
  });
  it('tucks new loops with the matching two-guide tuck pair', () => {
    const p = program(shape(TWO.id, [], { newLoop: 'tuck' }), widening);
    const fresh = p.shape!.needles.placements.filter((x) => x.course > 0 && !x.parents.length);
    expect(fresh.length).toBeGreaterThan(0);
    for (const x of fresh)
      expect(TWO.ops[p.cells[imageIndex(p.w, p.h, x.needle, x.course)]!]!.id).toBe('t2f');
    const k = without(customCopy(TWO, 'custom-t'), ['t2f']);
    const q = program(shape(k.id, [k], { newLoop: 'tuck' }), widening);
    expect(q.exportBlockers.join(' ')).toContain(
      'The key has no YG1 tuck front · YG2 tuck back operation for the new loop.'
    );
  });
  it('realizes two-guide network structures in combined mode, birdseye included', () => {
    const p = {
      ...createProject(),
      surface: { ...plane, size: 0.12, revision: 'two-both' },
      swatches: [{ structure: 'jersey', stitchWidth: 0.004, courseHeight: 0.004 }],
      knit: withKey(
        {
          ...defaultKnitSettings(),
          mode: 'both' as const,
          cells: {
            fill: 'dk-a',
            rule: { kind: 'alternating' as const, palette: ['dk-a', 'birdseye'] },
            overrides: {},
          },
        },
        TWO.id
      ).settings,
    };
    p.parameters = { ...p.parameters, spacing: 0.03, relaxation: 0 };
    const r = buildKnitProgram({ ...p, graph: generatePattern(p).graph });
    if (!r.ok) throw new Error(r.reason);
    expect(r.program.structures.map((x) => x.id).sort()).toEqual(['birdseye', 'dk-a']);
    expect(r.program.exportBlockers).toEqual([]);
  });
});
