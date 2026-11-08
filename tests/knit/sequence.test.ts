import { describe, expect, it } from 'vitest';
import { generatePattern } from '../../src/core/generate';
import type { GenerationInput, KnitSettings, SurfaceSpec } from '../../src/core/types';
import { BASIC, TWO, type Key } from '../../src/knit/keys';
import { imageIndex } from '../../src/knit/grid';
import { buildKnitProgram, type KnitProgram } from '../../src/knit/program';
import { defaultKnitSettings, withKey } from '../../src/knit/settings';
import { bmpBytes, grammarJson } from '../../src/knit/files';
import { knitReport } from '../../src/knit/report';
import { validateShapeOperations } from '../../src/knit/shape-validate';
import {
  executeSequence,
  fillCluster,
  lowerSequence,
  programSequence,
  sequenceJson,
  symbolProblem,
  symbolText,
  type KnitSequence,
  type SeqStep,
  type SeqSymbol,
} from '../../src/knit/sequence';
import { mappedChart } from './shape-fixtures';

// Test values (not lab measurements): 6 mm stitch width, 4 mm course height.
const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'pt' };
const saddle: SurfaceSpec = { kind: 'saddle', size: 0.1, curvature: 1, revision: 'pt' };
const narrowing = mappedChart((u, v) => [u * (0.08 + 0.04 * (1 - v)), 0.1 * v, 0], 1);
const sector = mappedChart((u, v) => {
  const r = 0.06 + 0.04 * u,
    a = 0.8 * v;
  return [r * Math.cos(a), r * Math.sin(a), 0];
}, 24);

function build(project: Parameters<typeof buildKnitProgram>[0]): KnitProgram {
  const r = buildKnitProgram(project);
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
const shapeProgram = (surface: SurfaceSpec, keyId = BASIC.id) =>
  build({
    surface,
    graph: null,
    swatches,
    knit: withKey({ ...defaultKnitSettings(), mode: 'shape' }, keyId).settings,
  });
const network = (() => {
  const input: GenerationInput = {
    surface: { kind: 'plane', size: 0.12, curvature: 0, revision: 'knit:1' },
    parameters: {
      strategy: 'patch-grid',
      spacing: 0.02,
      orientation: 0,
      guideStrength: 0.8,
      relaxation: 0,
      preset: 'regular',
      family: 'quad',
      seed: 7,
      patchSides: 4,
      boundaryCounts: [4, 4, 4, 4],
      variant: 0,
    },
    guides: [],
  };
  return { surface: input.surface, graph: generatePattern(input).graph };
})();
const typed = (needles: number, fill = 'jersey', change: Partial<KnitSettings> = {}) =>
  build({
    ...network,
    swatches: [],
    knit: {
      ...defaultKnitSettings(),
      size: { source: 'typed', needles, passes: 12 },
      cells: { fill, rule: { kind: 'uniform' }, overrides: {} },
      edges: { structure: null, width: 2, boundary: false },
      ...change,
    },
  });

// Hand-made sequences: `grid` lists symbol ids per pass, pass 1 first, needle 1 first.
const K = (bed: 'front' | 'back', guide = 1): SeqStep => ({ kind: 'knit', guide, bed });
function hand(symbols: SeqSymbol[], grid: string[][], guides = 1, firstDir: 1 | -1 = 1) {
  const w = grid[0]!.length,
    h = grid.length,
    index = new Map(symbols.map((s, i) => [s.id, i]));
  const rows = new Uint16Array(w * h);
  grid.forEach((pass, k) => pass.forEach((id, j) => (rows[k * w + j] = index.get(id)!)));
  return { w, h, guides, firstDir, symbols, rows, clusters: [], fills: [] } as KnitSequence;
}
const S: Record<string, SeqSymbol> = {
  m: { id: 'm', steps: [] },
  kf: { id: 'kf', steps: [K('front')] },
  kb: { id: 'kb', steps: [K('back')] },
  kfxb: { id: 'kfxb', steps: [K('front'), { kind: 'transfer', bed: 'front', offset: 0 }] },
  kfxr: { id: 'kfxr', steps: [K('front'), { kind: 'move', bed: 'front', offset: 1 }] },
  xr: { id: 'xr', steps: [{ kind: 'move', bed: 'front', offset: 1 }] },
  d1: { id: 'd1', steps: [{ kind: 'transfer', bed: 'front', offset: 1 }] },
  d0: { id: 'd0', steps: [{ kind: 'transfer', bed: 'front', offset: 0 }] },
  b1: { id: 'b1', steps: [{ kind: 'transfer', bed: 'back', offset: 1 }] },
  drop: { id: 'drop', steps: [{ kind: 'drop', bed: 'front' }] },
  // Fig. 7.34j and k (Popescu 2019, p. 152): knit front and back, then transfer front to back / drop the front stitch.
  j: {
    id: 'j',
    steps: [K('front', 1), K('back', 2), { kind: 'transfer', bed: 'front', offset: 0 }],
  },
  k: { id: 'k', steps: [K('front', 1), K('back', 2), { kind: 'drop', bed: 'front' }] },
  g: { id: 'g', steps: [K('front', 1), K('back', 2)] },
};
const all = Object.values(S);
const finding = (run: ReturnType<typeof executeSequence>, id: string) =>
  run.findings.find((f) => f.id === id);

describe('operation sequences (Popescu 2019, §6.4.1, pp. 113–114)', () => {
  it('converts class-key programs to sequences and back to the same cells in every mode', () => {
    const programs = [
      typed(60),
      typed(62, 'eyelet'),
      typed(30, 'dk-a', { keyId: TWO.id }),
      shapeProgram(plane),
      shapeProgram(saddle),
      shapeProgram(narrowing),
      shapeProgram(sector, TWO.id),
    ];
    for (const p of programs) {
      const seq = programSequence(p),
        back = lowerSequence(seq, p.key);
      expect(back.ok).toBe(true);
      if (back.ok) expect(back.cells).toEqual(p.cells);
      expect(seq.symbols.map((s) => s.op)).toEqual(p.key.ops.map((o) => o.id));
      if (!p.exportBlockers.length)
        expect(bmpBytes({ ...p, cells: back.ok ? back.cells : p.cells })).toEqual(bmpBytes(p));
    }
  });

  it('keeps each colour of a key with two colours for one meaning; another key gets the meaning', () => {
    const kf = BASIC.ops.find((o) => o.id === 'kf')!;
    const twin: Key = {
      ...BASIC,
      id: 'custom-twin',
      name: 'twin',
      preset: false,
      ops: [...BASIC.ops, { ...kf, id: 'kf2', colour: 'navy', rgb: [0, 0, 128] }],
    };
    const kf2 = twin.ops.length - 1,
      cells = Uint8Array.from([kf2, 1, kf2, 1]);
    const seq = programSequence({ w: 2, h: 2, cells, key: twin, firstDir: 1 });
    const same = lowerSequence(seq, twin),
      basic = lowerSequence(seq, BASIC);
    expect(same.ok && Array.from(same.cells)).toEqual([kf2, 1, kf2, 1]);
    expect(basic.ok && Array.from(basic.cells)).toEqual([1, 1, 1, 1]);
  });

  it('refuses to write symbols the key cannot say, naming pass and needle', () => {
    const two = lowerSequence(hand(all, [['g', 'j']], 2), TWO);
    expect(two.ok).toBe(false);
    if (!two.ok)
      expect(two.problems).toEqual([
        'Pass 1, needle 2: the key "4.S52 two yarn guides" has no operation for yarn guide 1 knit front, then yarn guide 2 knit back, then transfer front to back; the sequence cannot be written as this key\'s bitmap.',
      ]);
    const ok = lowerSequence(hand(all, [['g', 'm']], 2), TWO);
    expect(ok.ok && ok.cells[0]).toBe(TWO.ops.findIndex((o) => o.id === 'k2f'));
    const basic = lowerSequence(hand(all, [['kf', 'drop', 'd1', 'kfxb', 'xr']]), BASIC);
    expect(basic.ok).toBe(false);
    if (!basic.ok) {
      expect(basic.problems).toHaveLength(3);
      expect(basic.problems[0]).toContain(
        'needle 2: the key "4.S52 basic key" has no operation for drop front'
      );
      expect(basic.problems[1]).toContain(
        'needle 3: the key "4.S52 basic key" has no operation for transfer front to back, 1 needle right'
      );
      // The basic key's moves come after a knit; a move on its own is not in it.
      expect(basic.problems[2]).toContain(
        'needle 5: the key "4.S52 basic key" has no operation for move front right'
      );
    }
    // One guide on both beds in one symbol (Fig. 6.18) is not a class-key operation.
    const both = { id: 'both', steps: [K('front'), K('back')] };
    expect(lowerSequence(hand([both], [['both']], 2), TWO).ok).toBe(false);
    expect(symbolText(S.k!)).toBe(
      'yarn guide 1 knit front, then yarn guide 2 knit back, then drop front'
    );
    expect(symbolText(S.m!)).toBe('miss');
  });

  it('follows loops through stitches and transfers straight across', () => {
    const run = executeSequence(
      hand(all, [
        ['kf', 'kfxb', 'kf'],
        ['kf', 'kb', 'kf'],
      ]),
      {
        loops: true,
      }
    );
    expect(run.counts).toMatchObject({ knits: 6, transfers: 1, moves: 0, drops: 0, racked: 0 });
    expect(run.racking).toEqual([0, 0]);
    expect(run.blockers).toEqual([]);
    // Pass 2 knits on the loops of pass 1, the middle one on the back bed after its transfer.
    const loops = run.loops!;
    for (let j = 0; j < 3; j++) {
      const top = loops.find((l) => l.pass === 1 && l.needle === j)!;
      expect(top.parents.map((i) => [loops[i]!.pass, loops[i]!.needle])).toEqual([[0, j]]);
    }
    expect(loops.find((l) => l.pass === 1 && l.needle === 1)!.bed).toBe('back');
    expect(finding(run, 'empty-stitch')!.cells).toEqual([3, 4, 5]);
    expect(finding(run, 'left')!.cells.sort()).toEqual([0, 1, 2]);
    expect(run.findings.map((f) => f.id).sort()).toEqual(['empty-stitch', 'left']);
  });

  it('derives racking from diagonal transfers and blocks transfers that need two rackings', () => {
    const one = executeSequence(
      hand(all, [
        ['kf', 'kf', 'm'],
        ['d1', 'd1', 'm'],
      ]),
      { loops: true }
    );
    expect(one.racking).toEqual([0, 1]);
    expect(one.counts.racked).toBe(1);
    expect(one.blockers).toEqual([]);
    const back = executeSequence(
      hand(all, [
        ['kb', 'm'],
        ['b1', 'm'],
      ])
    );
    expect(back.racking).toEqual([0, -1]);
    // Pass 2 runs right to left: needle 2 asks for racking 1 first, then needle 1 for 0.
    const two = executeSequence(
      hand(all, [
        ['kf', 'kf', 'm'],
        ['d0', 'd1', 'm'],
      ])
    );
    expect(two.blockers).toEqual([
      'Pass 2: transfers in this pass need different rackings (1 at needle 2, 0 at needle 1); one racking per pass (project rule).',
    ]);
    expect(finding(two, 'racking')).toMatchObject({ blocking: true, cells: [0] });
  });

  it("blocks a transfer off the program's needles and reports loop state", () => {
    const off = executeSequence(hand(all, [['kf', 'kfxr']]));
    expect(off.blockers).toEqual([
      "Pass 1, needle 2: a transfer moves the loop to needle 3, outside the program's needles.",
    ]);
    expect(finding(off, 'off-needles')).toMatchObject({ blocking: true, cells: [1] });
    expect(finding(off, 'left')!.cells).toEqual([0]);

    const stack = executeSequence(
      hand(all, [
        ['kf', 'kf'],
        ['xr', 'm'],
      ])
    );
    expect(finding(stack, 'stacked')).toMatchObject({ blocking: false, cells: [0] });
    const empty = executeSequence(
      hand(all, [
        ['xr', 'm'],
        ['drop', 'm'],
      ])
    );
    expect(finding(empty, 'empty-transfer')!.cells).toEqual([2]);
    expect(finding(empty, 'empty-drop')!.cells).toEqual([0]);
    expect(empty.blockers).toEqual([]);
  });

  it('knits both layers and drops the front stitch (Fig. 7.34k): the back loop stays', () => {
    const run = executeSequence(hand(all, [['k'], ['g']], 2), { loops: true });
    expect(finding(run, 'drop')).toMatchObject({ blocking: false, cells: [1] });
    const loops = run.loops!;
    const front = loops.find((l) => l.pass === 1 && l.bed === 'front')!,
      back = loops.find((l) => l.pass === 1 && l.bed === 'back')!;
    expect(front.parents).toEqual([]);
    expect(back.parents).toHaveLength(1);
    expect(run.counts.drops).toBe(1);
  });

  it('tracks where each yarn guide stopped: jumps and the wrong side are reported, not blocking', () => {
    const run = executeSequence(
      hand(all, [
        ['kf', 'kf', 'kf', 'kf', 'kf', 'kf'],
        ['kf', 'kf', 'kf', 'm', 'm', 'm'],
        ['m', 'm', 'm', 'm', 'm', 'm'],
        ['kf', 'kf', 'kf', 'kf', 'kf', 'kf'],
      ])
    );
    const at = (j: number, k: number) => imageIndex(6, 4, j, k);
    expect(finding(run, 'guide-jump')!.cells).toEqual([at(2, 1), at(5, 3)]);
    expect(finding(run, 'guide-side')!.cells).toEqual([at(5, 3)]);
    expect(run.blockers).toEqual([]);
  });

  it('repeats a cluster over cells from its anchor and checks its symbols', () => {
    const base = hand(
      all,
      Array.from({ length: 4 }, () => ['kf', 'kf', 'kf', 'kf'])
    );
    const cluster = { id: 'C', w: 2, h: 2, symbols: [S.kf!, S.kfxb!, S.kb!, S.m!] };
    const cells: [number, number][] = [];
    for (let k = 0; k < 4; k++) for (let j = 1; j < 4; j++) cells.push([j, k]);
    const seq = fillCluster(base, cluster, cells, [1, 0]);
    const id = (j: number, k: number) => seq.symbols[seq.rows[k * 4 + j]!]!.id;
    expect([0, 1, 2, 3].map((j) => id(j, 0))).toEqual(['kf', 'kf', 'kfxb', 'kf']);
    expect([0, 1, 2, 3].map((j) => id(j, 1))).toEqual(['kf', 'kb', 'm', 'kb']);
    expect(seq.fills).toEqual([{ cluster: 'C', anchor: [1, 0], cells: 12 }]);
    expect(seq.clusters[0]).toMatchObject({ id: 'C', w: 2, h: 2 });
    expect(base.rows.every((s) => all[s]!.id === 'kf')).toBe(true);
    const bad = { id: 'bad', steps: [{ kind: 'drop', bed: 'front' }, K('front')] as SeqStep[] };
    expect(() => fillCluster(base, { id: 'B', w: 1, h: 1, symbols: [bad] }, [[0, 0]])).toThrow(
      'yarn-fed steps must come before yarn-free steps.'
    );
    expect(symbolProblem({ steps: [K('front', 1), K('front', 2)] }, 2)).toBe(
      'a symbol has at most one yarn-fed step per bed.'
    );
    expect(symbolProblem({ steps: [K('front', 2)] }, 1)).toBe('the yarn guide must be 1 to 1.');
  });

  it("agrees with the shaping check's loop parents on shape programs (consistency, not validation)", () => {
    for (const p of [
      shapeProgram(plane),
      shapeProgram(saddle),
      shapeProgram(narrowing),
      shapeProgram(sector, TWO.id),
    ]) {
      const shape = p.shape!;
      expect(validateShapeOperations(shape, p.cells, p.key)).toEqual([]);
      const { loops } = executeSequence(programSequence(p), { loops: true });
      const placement = (pass: number, needle: number) =>
        shape.needles.placements[shape.placementAt[imageIndex(p.w, p.h, needle, pass)]!]!;
      let checked = 0;
      for (const l of loops!) {
        if (l.kind !== 'knit') continue;
        const want = [...placement(l.pass, l.needle).parents].sort();
        const got = l.parents.map((i) => placement(loops![i]!.pass, loops![i]!.needle).loop.id);
        expect(got.sort()).toEqual(want);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('turns the eyelet transfer off the last needle from a warning into an export blocker', () => {
    const edge = typed(62, 'eyelet'),
      inside = typed(60, 'eyelet');
    const edgeCells = edge.findings.find((f) => f.id === 'edge')!.cells;
    expect(edgeCells.length).toBeGreaterThan(0);
    expect(finding(edge.sequence!, 'off-needles')!.cells.sort()).toEqual([...edgeCells].sort());
    expect(edge.exportBlockers).toHaveLength(edgeCells.length);
    expect(edge.exportBlockers[0]).toMatch(
      /^Pass \d+, needle 62: a transfer moves the loop to needle 63, outside the program's needles\.$/
    );
    expect(() => bmpBytes(edge)).toThrow('Knit export blocked');
    expect(() => grammarJson({ ...edge, name: 'e', note: '' })).toThrow('Knit export blocked');
    expect(inside.findings.some((f) => f.id === 'edge')).toBe(false);
    expect(inside.exportBlockers).toEqual([]);
    expect(typed(60).exportBlockers).toEqual([]);
  });

  it('writes the sequence JSON with findings and blockers, and a report section', () => {
    const p = typed(62, 'eyelet');
    const seq = programSequence(p);
    const json = JSON.parse(
      sequenceJson(seq, p.sequence!, { key: p.key, piece: null, blockers: p.exportBlockers })
    );
    expect(json).toMatchObject({ format: 'knit-sequence', version: 1, needles: 62, passCount: 12 });
    expect(json.note).toContain('Not a machine file');
    expect(json.passes).toHaveLength(12);
    expect(json.passes[0]).toMatchObject({ pass: 1, direction: 'left-to-right', racking: 0 });
    expect(json.passes[1].direction).toBe('right-to-left');
    expect(json.passes[3].symbols).toEqual(Array.from(seq.rows.subarray(3 * 62, 4 * 62)));
    expect(json.symbols.map((s: { op: string }) => s.op)).toEqual(BASIC.ops.map((o) => o.id));
    expect(json.symbols[BASIC.ops.findIndex((o) => o.id === 'kfxb')].steps).toEqual([
      { kind: 'knit', guide: 1, bed: 'front' },
      { kind: 'transfer', bed: 'front', offset: 0 },
    ]);
    const off = json.findings.find((f: { id: string }) => f.id === 'off-needles');
    expect(off.blocking).toBe(true);
    expect(off.cells.every((c: number[]) => c[0] === 62)).toBe(true);
    expect(json.blockers).toEqual(p.exportBlockers);
    const report = knitReport(p, 'eyelets', 0.12);
    expect(report).toContain(
      'Operation sequence (machine-neutral; Popescu 2019, §6.4.1, pp. 113–114; symbolic execution, not a machine simulation):'
    );
    expect(report).toContain("BLOCKS EXPORT: transfers off the program's needles");
    expect(report).toContain(
      'Converted from the class-key bitmap; converting back gives the same cells.'
    );
  });
});
