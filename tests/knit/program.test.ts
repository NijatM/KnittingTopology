import { describe, expect, it } from 'vitest';
import { generatePattern } from '../../src/core/generate';
import { extraordinaryNodeIds } from '../../src/core/diagnostics';
import type {
  GenerationInput,
  KnitSettings,
  PatternFamily,
  ProjectState,
  TopologyPreset,
} from '../../src/core/types';
import { BASIC, TWO, otherBed, type Bed } from '../../src/knit/keys';
import { STRUCTURES_1, isTwoLayer, tileOp } from '../../src/knit/structures';
import { insertTransfers } from '../../src/knit/transfers';
import { imageIndex } from '../../src/knit/grid';
import { buildKnitProgram, type KnitProgram } from '../../src/knit/program';
import { defaultKnitSettings } from '../../src/knit/settings';
import { SOURCE } from '../../src/knit/rasterize';
import { knitReport } from '../../src/knit/report';

const op = (id: string) => BASIC.ops.findIndex((o) => o.id === id);
const struct = (id: string) => STRUCTURES_1.find((s) => s.id === id)!;

/** Program of w needles from structure ids per pass (pass 1 first). */
function bands(w: number, passes: string[]) {
  const h = passes.length,
    cells = new Uint8Array(w * h),
    layer: boolean[] = [];
  passes.forEach((id, k) => {
    for (let j = 0; j < w; j++) {
      const i = imageIndex(w, h, j, k);
      cells[i] = op(tileOp(struct(id), j, k));
      layer[i] = isTwoLayer(struct(id), BASIC);
    }
  });
  return { w, h, cells, layer };
}
const ids = (w: number, h: number, cells: Uint8Array, k: number) =>
  Array.from({ length: w }, (_, j) => BASIC.ops[cells[imageIndex(w, h, j, k)]!]!.id);

describe('automatic transfers', () => {
  it('moves loops across below and above a rib band (Accordion rows)', () => {
    const b = bands(4, ['jersey', 'jersey', 'jersey', 'rib11', 'rib11', 'rib11', 'jersey']);
    const r = insertTransfers(b.w, b.h, b.cells, BASIC, (i) => b.layer[i]!);
    expect(ids(b.w, b.h, r.cells, 2)).toEqual(['kf', 'kfxb', 'kf', 'kfxb']);
    expect(ids(b.w, b.h, r.cells, 5)).toEqual(['kf', 'kbxf', 'kf', 'kbxf']);
    expect(r.changes).toHaveLength(4);
    expect(r.changes[0]).toMatchObject({ needle: 1, pass: 2, from: 'kf', to: 'kfxb', forPass: 3 });
    expect(r.skipped).toEqual([]);
  });

  it('leaves consistent structures and two-layer structures alone', () => {
    for (const passes of [
      ['garter', 'garter', 'garter', 'garter'],
      ['seed', 'seed', 'seed'],
      ['jersey', 'jersey', 'tubular', 'tubular', 'tubular'],
      ['rib22', 'rib22', 'rib22'],
    ]) {
      const b = bands(4, passes);
      const r = insertTransfers(b.w, b.h, b.cells, BASIC, (i) => b.layer[i]!);
      expect(r.changes, passes.join()).toEqual([]);
      expect([...r.cells]).toEqual([...b.cells]);
    }
  });

  it('drops a transfer that would leave the loop on the wrong bed', () => {
    // one garter pass on pass 3 (kfxb moves every loop to the back), then jersey knits the front again
    const b = bands(3, ['jersey', 'jersey', 'garter', 'jersey']);
    expect(ids(b.w, b.h, b.cells, 2)).toEqual(['kfxb', 'kfxb', 'kfxb']);
    const r = insertTransfers(b.w, b.h, b.cells, BASIC, (i) => b.layer[i]!);
    expect(ids(b.w, b.h, r.cells, 2)).toEqual(['kf', 'kf', 'kf']);
    expect(r.changes).toHaveLength(3);
    expect(r.changes.every((c) => c.from === 'kfxb' && c.to === 'kf')).toBe(true);
  });

  it('reports bed changes it cannot fix and ignores two-guide keys', () => {
    const w = 1,
      h = 3,
      cells = new Uint8Array(3);
    cells[imageIndex(w, h, 0, 0)] = op('kf');
    cells[imageIndex(w, h, 0, 1)] = op('tf');
    cells[imageIndex(w, h, 0, 2)] = op('kb');
    const r = insertTransfers(w, h, cells, BASIC, () => false);
    expect(r.changes).toEqual([]);
    expect(r.skipped[0]).toMatchObject({ needle: 0, pass: 0 });
    expect(insertTransfers(w, h, new Uint8Array(3).fill(1), TWO, () => false).changes).toEqual([]);
  });
});

const graphFor = (family: PatternFamily = 'quad', preset: TopologyPreset = 'regular') => {
  const input: GenerationInput = {
    surface: { kind: 'plane', size: 0.12, curvature: 0, revision: 'knit:1' },
    parameters: {
      strategy: 'patch-grid',
      spacing: 0.02,
      orientation: 0,
      guideStrength: 0.8,
      relaxation: 0,
      preset,
      family,
      seed: 7,
      patchSides: 4,
      boundaryCounts: [4, 4, 4, 4],
      variant: 0,
    },
    guides: [],
  };
  return { surface: input.surface, graph: generatePattern(input).graph };
};
const settings = (change: Partial<KnitSettings> = {}): KnitSettings => ({
  ...defaultKnitSettings(),
  size: { source: 'typed', needles: 60, passes: 60 },
  edges: { structure: null, width: 2, boundary: false },
  ...change,
});
function build(
  knit: KnitSettings,
  g = graphFor(),
  swatches: ProjectState['swatches'] = []
): KnitProgram {
  const r = buildKnitProgram({ ...g, knit, swatches });
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
const loopsOf = (p: KnitProgram, kind: number) => p.raster.kind.filter((k) => k === kind).length;

/** Independent check: in single-layer structures, a needle never knits a bed while its loop waits on the other. */
function waitingLoops(p: KnitProgram): number {
  let bad = 0;
  for (let j = 0; j < p.w; j++) {
    const loop: Record<Bed, boolean> = { front: false, back: false };
    for (let k = 0; k < p.h; k++) {
      const i = imageIndex(p.w, p.h, j, k),
        o = p.key.ops[p.cells[i]!]!,
        s = o.steps[0]!;
      if (s.action !== 'knit') continue;
      if (!loop[s.bed] && loop[otherBed(s.bed)]) bad++;
      if (o.move === 'none') loop[s.bed] = true;
      else {
        loop[s.bed] = false;
        if (o.move === 'across') loop[otherBed(s.bed)] = true;
      }
    }
  }
  return bad;
}

describe('network to knit program (plane)', () => {
  it('fills every loop from a network cell with the fill structure', () => {
    const p = build(settings());
    expect([p.w, p.h]).toEqual([60, 60]);
    expect(p.cells.every((v) => v === op('kf'))).toBe(true);
    expect(loopsOf(p, SOURCE.cell)).toBe(3600);
    expect(p.issues).toEqual([]);
    expect(p.findings).toEqual([]);
  });

  it('draws edge lines `width` loops wide and moves loops across at bed changes', () => {
    for (const width of [1, 2, 3]) {
      const p = build(settings({ edges: { structure: 'reverse', width, boundary: false } }));
      // a pass away from horizontal lines and nodes crosses 5 vertical lines
      const k = 5,
        row = Array.from({ length: p.w }, (_, j) => p.raster.kind[imageIndex(p.w, p.h, j, k)]);
      expect(row.filter((x) => x === SOURCE.edge)).toHaveLength(5 * width);
      expect(p.transfers.length).toBeGreaterThan(0);
      expect(waitingLoops(p)).toBe(0);
    }
    const off = build(
      settings({ autoTransfers: false, edges: { structure: 'reverse', width: 2, boundary: false } })
    );
    expect(off.transfers).toEqual([]);
    expect(waitingLoops(off)).toBeGreaterThan(0);
  });

  it('includes boundary lines only when asked', () => {
    const inner = build(settings({ edges: { structure: 'rib11', width: 1, boundary: false } }));
    const all = build(settings({ edges: { structure: 'rib11', width: 1, boundary: true } }));
    expect(loopsOf(all, SOURCE.edge)).toBeGreaterThan(loopsOf(inner, SOURCE.edge));
  });

  it('marks nodes as squares and extraordinary nodes separately', () => {
    const p = build(settings({ nodes: { structure: 'seed', size: 3, extraordinary: null } }));
    expect(loopsOf(p, SOURCE.node)).toBe(25 * 9); // 5 x 5 interior nodes
    const g = graphFor('quad', 'inset');
    const odd = extraordinaryNodeIds(g.graph, g.surface);
    expect(odd.size).toBeGreaterThan(0);
    const q = build(
      settings({ nodes: { structure: null, size: 2, extraordinary: 'tuckmoss' } }),
      g
    );
    expect(loopsOf(q, SOURCE.node)).toBe(0);
    expect(loopsOf(q, SOURCE.extraordinary)).toBeGreaterThan(0);
    for (let i = 0; i < q.raster.kind.length; i++)
      if (q.raster.kind[i] === SOURCE.extraordinary)
        expect(odd.has(g.graph.nodes[q.raster.element[i]!]!.id)).toBe(true);
  });

  it('keeps provenance from every loop to its network element', () => {
    const g = graphFor('dual');
    const p = build(settings({ edges: { structure: 'reverse', width: 2, boundary: true } }), g);
    for (let i = 0; i < p.raster.kind.length; i++) {
      const kind = p.raster.kind[i]!,
        e = p.raster.element[i]!;
      if (kind === SOURCE.cell) expect(g.graph.cells[e]).toBeDefined();
      else if (kind === SOURCE.edge) expect(g.graph.edges[e]).toBeDefined();
      else expect(kind).not.toBe(SOURCE.background);
    }
    // loop centre -> surface point -> grid round trip
    const s = p.mapping.toSurface([12.5, 40.5]);
    expect(p.mapping.toGrid(s)).toEqual([12.5, 40.5]);
  });

  it('applies the cell rules and reports conflicts', () => {
    const alt = build(
      settings({
        cells: {
          fill: 'jersey',
          rule: { kind: 'alternating', palette: ['jersey', 'seed'] },
          overrides: {},
        },
      })
    );
    expect(alt.issues).toEqual([]);
    expect(new Set(alt.raster.cellStructure)).toEqual(new Set(['jersey', 'seed']));
    // two-colouring fails exactly when an interior vertex has odd degree (odd cycle of cells around it)
    let conflicted = 0;
    for (const family of ['kis', 'gyro', 'diagonal'] as const) {
      const g = graphFor(family);
      const degree = new Map<string, number>();
      for (const e of g.graph.edges)
        for (const n of [e.a, e.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
      const rim = new Set(
        g.graph.edges.filter((e) => e.cells.length < 2).flatMap((e) => [e.a, e.b])
      );
      const odd = [...degree].some(([n, d]) => !rim.has(n) && d % 2 === 1);
      const p = build(
        settings({
          cells: {
            fill: 'jersey',
            rule: { kind: 'alternating', palette: ['jersey', 'seed'] },
            overrides: {},
          },
        }),
        g
      );
      expect(
        p.issues.some((t) => t.startsWith('Alternating rule')),
        family
      ).toBe(odd);
      if (odd) conflicted++;
    }
    expect(conflicted).toBeGreaterThan(0);
    const g = graphFor('kis');
    const sides = build(
      settings({
        cells: {
          fill: 'jersey',
          rule: { kind: 'sides', bySides: { '3': 'garter' } },
          overrides: {},
        },
      }),
      g
    );
    g.graph.cells.forEach((c, i) =>
      expect(sides.raster.cellStructure[i]).toBe(c.nodes.length === 3 ? 'garter' : 'jersey')
    );
    const inset = graphFor('quad', 'inset');
    const coarse = build(
      settings({
        cells: {
          fill: 'jersey',
          rule: { kind: 'coarse', palette: ['jersey', 'seed', 'garter'] },
          overrides: {},
        },
      }),
      inset
    );
    expect(coarse.issues).toEqual([]);
    expect(new Set(coarse.raster.cellStructure).size).toBeGreaterThan(1);
  });

  it('applies manual overrides and reports missing cells and unknown structures', () => {
    const g = graphFor();
    const id = g.graph.cells[7]!.id;
    const p = build(
      settings({
        cells: {
          fill: 'jersey',
          rule: { kind: 'uniform' },
          overrides: { [id]: 'garter', gone: 'seed' },
        },
      }),
      g
    );
    expect(p.raster.cellStructure[7]).toBe('garter');
    expect(p.issues.some((t) => t.includes('1 manual cell overrides'))).toBe(true);
    const q = build(settings({ edges: { structure: 'dk-a', width: 1, boundary: false } }));
    expect(q.issues.some((t) => t.includes('dk-a'))).toBe(true);
  });

  it('sizes the program from the jersey swatch, never without one', () => {
    const g = graphFor();
    const knit = {
      ...defaultKnitSettings(),
      edges: { structure: null, width: 1, boundary: false },
    };
    const jersey = { structure: 'jersey', stitchWidth: 0.001, courseHeight: 0.0008 };
    const p = build(knit, g, [jersey]);
    expect([p.w, p.h]).toEqual([120, 150]);
    expect(p.sizeSource).toBe('gauge');
    const none = buildKnitProgram({ ...g, knit, swatches: [] });
    expect(none.ok).toBe(false);
    const big = buildKnitProgram({ ...g, knit, swatches: [{ ...jersey, courseHeight: 0.0001 }] });
    expect(big.ok ? '' : big.reason).toMatch(/at most 600/);
    // a structure without its own entry is flagged as assumed
    const rib = build({ ...knit, cells: { ...knit.cells, fill: 'rib11' } }, g, [jersey]);
    expect(rib.structures[0]).toMatchObject({ id: 'rib11', gauge: { assumed: true } });
  });

  it('refuses unsupported inputs with a reason', () => {
    const g = graphFor();
    expect(buildKnitProgram({ ...g, graph: null, knit: settings() })).toMatchObject({ ok: false });
    expect(
      buildKnitProgram({ ...g, surface: { ...g.surface, kind: 'sphere' }, knit: settings() })
    ).toMatchObject({ ok: false });
    expect(buildKnitProgram({ ...g, knit: settings({ mode: 'shape' }) })).toMatchObject({
      ok: false,
    });
  });

  it('writes a report with conventions, gauge status, lab rules and credit', () => {
    const p = build(settings({ edges: { structure: 'reverse', width: 2, boundary: false } }));
    const text = knitReport(p, 'demo', 0.12);
    for (const s of [
      '60 needles x 60 passes',
      'The bottom row of the BMP is pass 1',
      'Not machine-ready; not verified until knitted',
      'Size typed by the user',
      'no measurement',
      'Lab rules to confirm',
      'transfer timing: after-row',
      BASIC.credit!,
    ])
      expect(text).toContain(s);
  });
});
