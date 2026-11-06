// Fidelity to Knit Grammar: fixtures in tests/fixtures/knit were written by Knit Grammar's own code.
import { describe, expect, it } from 'vitest';
import { BASIC, TWO, type Key } from '../../src/knit/keys';
import { bmpBytes, grammarJson } from '../../src/knit/files';
import { runChecks } from '../../src/knit/checks';
import { STRUCTURES_1, STRUCTURES_2, tileOp } from '../../src/knit/structures';
import { MAX_SIDE } from '../../src/knit/grid';

// Node's fs without @types/node (the project ships no Node typings).
const fs = (
  globalThis as unknown as {
    process: { getBuiltinModule(id: 'node:fs'): { readFileSync(path: URL): Uint8Array } };
  }
).process.getBuiltinModule('node:fs');
const dir = new URL('../fixtures/knit/', import.meta.url);
const bytes = (name: string) => fs.readFileSync(new URL(name, dir));
const text = (name: string) => new TextDecoder().decode(bytes(name));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Verbatim logic of Knit Grammar `fromJSON` (src/grammar/pattern.ts, MIT, same author), minus app-only fields. */
function knitGrammarFromJSON(text: string) {
  const j = JSON.parse(text);
  if (j?.format !== 'knit-grammar-pattern') throw new Error('not a knit grammar project file');
  const w = j.needles | 0,
    h = j.passes | 0;
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE) throw new Error('size out of range');
  const cells = unb64(j.cells);
  if (cells.length !== w * h) throw new Error("cells don't match the size");
  const key: Key = {
    id: j.key.id ?? 'custom',
    name: j.key.name ?? 'imported key',
    mode: j.key.mode === 2 ? 2 : 1,
    ops: j.key.ops,
    credit: j.key.credit,
    notes: j.key.notes,
  };
  return {
    name: j.name ?? 'imported',
    w,
    h,
    key,
    cells,
    unknown: j.unknownColours ?? [],
    firstDir: j.firstPass === 'right-to-left' ? -1 : 1,
    note: j.note ?? '',
  };
}

const FILES = [
  ['basic-all-ops', BASIC],
  ['basic-reversed', BASIC],
  ['two-guide', TWO],
  ['checks-basic', BASIC],
  ['checks-two', TWO],
] as const;

describe('Knit Grammar files', () => {
  it.each(FILES)('%s: BMP and project JSON are byte-identical', (name, key) => {
    const original = text(`${name}.json`);
    const p = knitGrammarFromJSON(original);
    const ours = { ...p, key, firstDir: p.firstDir as 1 | -1 };
    expect(grammarJson(ours)).toBe(original);
    expect([...bmpBytes(ours)]).toEqual([...bytes(`${name}.bmp`)]);
  });

  it('keys keep the exact operations, colours and credit', () => {
    const p = knitGrammarFromJSON(text('basic-all-ops.json'));
    expect(p.key.ops).toEqual(BASIC.ops);
    expect(p.key.credit).toBe(BASIC.credit);
    expect(knitGrammarFromJSON(text('two-guide.json')).key.ops).toEqual(TWO.ops);
  });

  it('BMP is 24-bit, bottom-up, padded rows, exact RGB', () => {
    const cells = new Uint8Array([1, 0, 2, 5, 9, 3]); // 3 x 2, row 0 = last pass
    const b = bmpBytes({ w: 3, h: 2, cells, key: BASIC });
    const v = new DataView(b.buffer);
    expect([b[0], b[1]]).toEqual([0x42, 0x4d]);
    expect(v.getUint16(28, true)).toBe(24);
    expect(v.getInt32(22, true)).toBe(2); // positive height: bottom-up
    expect(v.byteLength).toBe(54 + 12 * 2); // 9 bytes per row padded to 12
    const pixel = (row: number, x: number) => [
      ...b.subarray(54 + row * 12 + x * 3, 57 + row * 12 + x * 3),
    ];
    // file row 0 is the bottom image row (pass 1): cells 5, 9, 3 -> BGR
    expect(pixel(0, 0)).toEqual([...BASIC.ops[5]!.rgb].reverse());
    expect(pixel(1, 0)).toEqual([...BASIC.ops[1]!.rgb].reverse());
  });
});

describe('Knit Grammar checks', () => {
  const expected = JSON.parse(text('checks.json'));
  it.each([
    ['basic', BASIC],
    ['two', TWO],
  ] as const)('%s findings match runChecks', (name, key) => {
    const p = knitGrammarFromJSON(text(`checks-${name}.json`));
    const findings = runChecks({ w: p.w, h: p.h, cells: p.cells, key }, expected.limits);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings).toEqual(expected[name]);
  });
});

describe('Knit Grammar structures', () => {
  const fixture = JSON.parse(text('structures.json'));
  it('structure data is unchanged', () => {
    expect(JSON.parse(JSON.stringify(STRUCTURES_1))).toEqual(fixture.structures1);
    expect(JSON.parse(JSON.stringify(STRUCTURES_2))).toEqual(fixture.structures2);
  });
  it('tiles repeat from needle 1 and pass 1 exactly as generate()', () => {
    const { w, h, signs, cells, generated } = fixture.design;
    const byId = new Map(STRUCTURES_1.map((s) => [s.id, s]));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = byId.get(signs[cells[y * w + x]])!;
        const op = tileOp(s, x, h - 1 - y);
        expect(BASIC.ops[generated[y * w + x]]!.id).toBe(op);
      }
  });
});
