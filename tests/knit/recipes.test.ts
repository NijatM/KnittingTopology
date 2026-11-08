import { describe, expect, it } from 'vitest';
import type {
  GenerationInput,
  KnitRecipe,
  KnitSettings,
  KnitZone,
  SurfaceSpec,
  Vec2,
} from '../../src/core/types';
import { generatePattern } from '../../src/core/generate';
import { buildKnitProgram, type KnitProgram } from '../../src/knit/program';
import { TWO, type Key } from '../../src/knit/keys';
import { defaultKnitSettings } from '../../src/knit/settings';
import { originalShapeUV } from '../../src/knit/shape-geometry';
import {
  executeSequence,
  lowerSequence,
  programSequence,
  type KnitSequence,
} from '../../src/knit/sequence';
import { bmpBytes } from '../../src/knit/files';
import {
  applyRecipes,
  recipeJsonData,
  recipeLines,
  validateRecipes,
  validateRecipeSequence,
  type RecipeSide,
} from '../../src/knit/recipes';

// Synthetic grid sizes and 10 mm stitch/course dimensions below are test values, not measured gauges.
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'recipe-test' };
const input: GenerationInput = {
  surface: plane,
  guides: [],
  parameters: {
    strategy: 'patch-grid',
    spacing: 0.025,
    orientation: 0,
    guideStrength: 0,
    relaxation: 0,
    preset: 'regular',
    family: 'quad',
    seed: 1,
    patchSides: 4,
    boundaryCounts: [2, 2, 2, 2],
    variant: 0,
  },
};
const graph = generatePattern(input).graph;
function base(extra: Partial<KnitSettings> = {}): KnitProgram {
  const knit: KnitSettings = {
    ...defaultKnitSettings(),
    keyId: TWO.id,
    size: { source: 'typed', needles: 10, passes: 10 },
    cells: { fill: 'dk-a', rule: { kind: 'uniform' }, overrides: {} },
    edges: { structure: null, width: 1, boundary: false },
    autoTransfers: false,
    ...extra,
  };
  const r = buildKnitProgram({
    surface: plane,
    graph,
    knit,
    swatches: [{ structure: 'jersey', stitchWidth: 0.01, courseHeight: 0.01 }],
  });
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
function region(
  bounds: [number, number, number, number],
  kind: 'channel' | 'pocket' = 'channel',
  id = 'Z1',
  edge: NonNullable<KnitSettings['startEdge']> = 'v0'
): KnitZone {
  const [l, f, r, t] = bounds;
  const frame: Vec2[] = [
    [l, f],
    [r, f],
    [r, t],
    [l, t],
  ];
  return {
    id,
    name: id,
    kind,
    rgb: [255, 0, 255],
    shape: { kind: 'region', points: frame.map((p) => originalShapeUV(...p, edge)) },
  };
}
const channel = (
  axis: 'needles' | 'passes' = 'needles',
  joinBand = 1,
  zone = 'Z1'
): KnitRecipe => ({ kind: 'channel', zone, axis, joinBand });
const pocket = (opening: RecipeSide = 'left', joinBand = 1): KnitRecipe => ({
  kind: 'pocket',
  zone: 'Z1',
  opening,
  joinBand,
});
function apply(p: KnitProgram, zones: KnitZone[], recipes: KnitRecipe[], surface = plane) {
  return applyRecipes({ ...p, settings: { ...p.settings, zones, recipes } }, surface);
}
function ready(p: KnitProgram) {
  expect(p.recipeResult?.applied).toBe(true);
  expect(p.recipeResult?.blockers).toEqual([]);
  expect(p.recipeResult?.patches).toHaveLength(1);
  expect(p.recipeResult?.patches[0]!.checks).toMatchObject({
    parents: true,
    separateBody: true,
    joinedSides: true,
    openAccess: true,
  });
  expect(p.recipeResult?.patches[0]!.checks.yarnLinks).toBeGreaterThan(0);
  expect(p.operations).toBeDefined();
  const lowered = lowerSequence(p.operations!, p.key);
  expect(lowered.ok).toBe(true);
  if (lowered.ok) expect(lowered.cells).toEqual(p.cells);
}

describe('bounded guide-swap channel and pocket recipes', () => {
  it('validates bounded assignment schemas independently of zone references', () => {
    const records = [channel(), pocket('last-pass')];
    records[1]!.zone = 'unknown';
    expect(validateRecipes(JSON.parse(JSON.stringify(records)))).toEqual(records);
    expect(() => validateRecipes([channel(), channel()])).toThrow(/unique/);
    for (const joinBand of [0, 17, 1.5, NaN])
      expect(() => validateRecipes([{ ...channel(), joinBand }])).toThrow(/1 to 16/);
    for (const value of [
      null,
      {},
      [null],
      [{ ...channel(), axis: 'diagonal' }],
      [{ ...pocket(), opening: 'inside' }],
    ])
      expect(() => validateRecipes(value)).toThrow();
    expect(() =>
      validateRecipes(Array.from({ length: 33 }, (_, i) => channel('needles', 1, `Z${i}`)))
    ).toThrow(/at most 32/);
    expect(apply(base(), [], [channel()]).exportBlockers.join(' ')).toContain('zone is missing');
  });

  it.each(['needles', 'passes'] as const)(
    'builds the %s channel with two real panel-boundary access ends',
    (axis) => {
      const p = base(),
        bounds: [number, number, number, number] =
          axis === 'needles' ? [0, 0.2, 1, 0.8] : [0.2, 0, 0.8, 1],
        out = apply(p, [region(bounds)], [channel(axis)]);
      ready(out);
      const patch = out.recipeResult!.patches[0]!;
      expect(patch.access.map((a) => a.side)).toEqual(
        axis === 'needles' ? ['left', 'right'] : ['first-pass', 'last-pass']
      );
      expect(patch.access.every((a) => a.cells.length >= 2)).toBe(true);
      expect(patch.body).toHaveLength(40);
      for (let i = 0; i < p.cells.length; i++)
        if (!out.recipeResult!.roles[i]) expect(out.cells[i]).toBe(p.cells[i]);
      expect(p.cells.every((v) => v === 1)).toBe(true);
      expect(out.cells.some((v) => v === 2)).toBe(true);
      expect(
        out
          .operations!.symbols.filter((s) => s.id.startsWith('recipe-'))
          .every((s) => s.cell === undefined && s.op === undefined)
      ).toBe(true);
      expect(out.operations!.clusters.length).toBeGreaterThan(0);
    }
  );

  it.each(['left', 'right', 'first-pass', 'last-pass'] as const)(
    'builds a pocket with one %s mouth and three joined sides',
    (opening) => {
      const bounds: Record<RecipeSide, [number, number, number, number]> = {
        left: [0, 0.1, 0.8, 0.9],
        right: [0.2, 0.1, 1, 0.9],
        'first-pass': [0.1, 0, 0.9, 0.8],
        'last-pass': [0.1, 0.2, 0.9, 1],
      };
      const out = apply(base(), [region(bounds[opening], 'pocket')], [pocket(opening)]);
      ready(out);
      const patch = out.recipeResult!.patches[0]!;
      expect(patch.access).toHaveLength(1);
      expect(patch.access[0]!.side).toBe(opening);
      expect(patch.joins.length).toBeGreaterThan(0);
      expect(patch.access[0]!.cells.every((i) => out.recipeResult!.roles[i] === 3)).toBe(true);
    }
  );

  it.each(['left-to-right', 'right-to-left'] as const)(
    'checks both carriage directions: %s',
    (firstPass) => {
      const out = apply(
        base({ lab: { ...defaultKnitSettings().lab, firstPass } }),
        [region([0.2, 0, 0.8, 1])],
        [channel('passes')]
      );
      ready(out);
      expect(
        out.sequence!.findings.some((f) => f.id === 'guide-jump' || f.id === 'guide-side')
      ).toBe(false);
    }
  );

  it.each(['v0', 'u1', 'v1', 'u0'] as const)(
    'keeps recipe sides in the program frame from start edge %s',
    (startEdge) => {
      const out = apply(
        base({ startEdge }),
        [region([0, 0.2, 1, 0.8], 'channel', 'Z1', startEdge)],
        [channel()]
      );
      ready(out);
      expect(out.recipeResult!.patches[0]!.bounds).toEqual([0, 2, 9, 7]);
    }
  );

  it('accepts wide bands only if they leave the minimum 2 × 2 clear body', () => {
    const out = apply(base(), [region([0, 0.1, 1, 0.9])], [channel('needles', 3)]);
    ready(out);
    expect(out.recipeResult!.patches[0]!.body).toHaveLength(20);
    const bad = apply(base(), [region([0, 0.1, 1, 0.9])], [channel('needles', 4)]);
    expect(bad.recipeResult!.applied).toBe(false);
    expect(bad.exportBlockers.join(' ')).toContain('at least two needles by two passes');
    const narrow = apply(base(), [region([0.4, 0, 0.5, 1])], [channel('passes')]);
    expect(narrow.recipeResult!.applied).toBe(false);
  });

  it('checks actual zone geometry rather than merely accepting an edge loop centre', () => {
    const p = base(),
      off = apply(p, [region([0.01, 0.2, 0.99, 0.8])], [channel()]);
    expect(off.recipeResult!.applied).toBe(false);
    expect(off.exportBlockers.join(' ')).toContain('actual panel boundary');
    expect(off.cells).toBe(p.cells);
    const bads: KnitZone['shape'][] = [
      {
        kind: 'stroke',
        points: [
          [0, 0.2],
          [1, 0.2],
        ],
        width: 0.01,
      },
      {
        kind: 'region',
        points: [
          [0, 0.2],
          [1, 0.2],
          [0, 0.8],
          [1, 0.8],
        ],
      },
      {
        kind: 'region',
        points: [
          [0, 0.2],
          [1, 0.2],
          [1, 0.8],
          [0, 0.2],
        ],
      },
      {
        kind: 'region',
        points: [
          [0, 0.2],
          [1, 0.3],
          [1, 0.8],
          [0, 0.8],
        ],
      },
      {
        kind: 'region',
        points: [
          [0, 0.2],
          [1, 0.2],
          [1, 0.8],
          [0.2, 0.8],
          [0, 0.6],
        ],
      },
    ];
    for (const shape of bads)
      expect(
        apply(p, [{ ...region([0, 0.2, 1, 0.8]), shape }], [channel()]).recipeResult!.applied
      ).toBe(false);
    expect(
      apply(p, [region([0, 0.2, 1, 0.8], 'pocket')], [channel()]).exportBlockers.join(' ')
    ).toContain('kind must match');
  });

  it('blocks incompatible whole-panel base operations, including ones outside the recipe footprint', () => {
    const p = base();
    for (const badSymbol of [
      { id: 'float', steps: [] },
      {
        id: 'same-bed',
        steps: [
          { kind: 'knit', guide: 1, bed: 'front' },
          { kind: 'knit', guide: 2, bed: 'front' },
        ],
      },
      {
        id: 'tuck',
        steps: [
          { kind: 'tuck', guide: 1, bed: 'front' },
          { kind: 'knit', guide: 2, bed: 'back' },
        ],
      },
      {
        id: 'move',
        steps: [
          { kind: 'knit', guide: 1, bed: 'front' },
          { kind: 'knit', guide: 2, bed: 'back' },
          { kind: 'transfer', bed: 'front', offset: 0 },
        ],
      },
    ] as KnitSequence['symbols']) {
      const operations = structuredClone(p.operations!);
      operations.rows[0] = operations.symbols.length;
      operations.symbols.push(badSymbol);
      const out = apply({ ...p, operations }, [region([0, 0.2, 1, 0.8])], [channel()]);
      expect(out.recipeResult!.applied).toBe(false);
      expect(out.cells).toBe(p.cells);
    }
    const incompatible = base({
      keyId: '4s52-basic',
      cells: { fill: 'jersey', rule: { kind: 'uniform' }, overrides: {} },
    });
    expect(apply(incompatible, [region([0, 0.2, 1, 0.8])], [channel()]).recipeResult!.applied).toBe(
      false
    );
    expect(
      apply(p, [region([0, 0.2, 1, 0.8])], [channel()], {
        ...plane,
        kind: 'saddle',
      }).exportBlockers.join(' ')
    ).toContain('constant-width plane');
    const patches = { kind: 'chart-grid' as const, u: [], v: [], patches: [] };
    expect(
      apply({ ...p, settings: { ...p.settings, patches } }, [region([0, 0.2, 1, 0.8])], [channel()])
        .recipeResult!.applied
    ).toBe(false);
  });

  it('rejects applied overlaps atomically while permitting unrelated intent-only overlap', () => {
    const p = base(),
      zones = [region([0, 0.1, 1, 0.5]), region([0, 0.4, 1, 0.9], 'channel', 'Z2')],
      out = apply(p, zones, [channel(), channel('needles', 1, 'Z2')]);
    expect(out.recipeResult!.applied).toBe(false);
    expect(out.recipeResult!.blockers.join(' ')).toContain('cannot overlap');
    expect(out.cells).toBe(p.cells);
    expect(out.operations).toBe(p.operations);
    expect(out.recipeResult!.roles.every((v) => v === 0)).toBe(true);
    const intent = apply(p, zones, [channel()]);
    ready(intent);
    const disjoint = apply(
      p,
      [zones[0]!, region([0, 0.6, 1, 1], 'channel', 'Z2')],
      [channel(), channel('needles', 1, 'Z2')]
    );
    expect(disjoint.recipeResult!.applied).toBe(true);
    expect(disjoint.recipeResult!.blockers).toEqual([]);
    expect(disjoint.recipeResult!.patches).toHaveLength(2);
    disjoint.recipeResult!.patches.forEach((patch, z) => {
      expect(patch.zone).toBe(disjoint.settings.recipes![z]!.zone);
      expect(patch.cells.every((i) => disjoint.recipeResult!.owner[i] === z)).toBe(true);
    });
    const invalidSecond = apply(
      p,
      [zones[0]!, region([0.01, 0.6, 1, 1], 'channel', 'Z2')],
      [channel(), channel('needles', 1, 'Z2')]
    );
    expect(invalidSecond.recipeResult!.applied).toBe(false);
    expect(invalidSecond.cells).toBe(p.cells);
  });

  it('keeps the actual expanded sequence when a custom colour key cannot express swapped guides', () => {
    const p = base(),
      key: Key = {
        ...TWO,
        id: 'custom-A-only',
        name: 'A only',
        preset: false,
        ops: TWO.ops.filter((o) => o.id !== 'k2b'),
      },
      baseA = { ...p, key, operations: programSequence({ ...p, key }) },
      out = apply(baseA, [region([0, 0.2, 1, 0.8])], [channel()]);
    expect(out.recipeResult!.applied).toBe(true);
    expect(out.recipeResult!.lowering.ok).toBe(false);
    expect(out.recipeResult!.lowering.problems.length).toBeGreaterThan(0);
    expect(out.cells).toBe(p.cells);
    expect(out.operations).not.toEqual(baseA.operations);
    expect(out.sequence!.counts.knits).toBe(200);
    expect(out.exportBlockers.join(' ')).toContain('has no operation');
    expect(() => bmpBytes(out)).toThrow('Knit export blocked');
    const provenance = recipeJsonData(out.recipeResult!, out.w, out.h);
    expect(JSON.parse(JSON.stringify(provenance)).patches[0].bounds).toEqual([1, 3, 10, 8]);
    expect(recipeLines(out.recipeResult!).join('\n')).toContain('actual sequence retained');
  });

  it('detects removed joins, corrupted body swaps and missing parent chains independently', () => {
    const out = apply(base(), [region([0, 0.2, 1, 0.8])], [channel()]),
      patches = out.recipeResult!.patches,
      original = out.operations!,
      a = original.symbols.findIndex((s) => s.id.startsWith('recipe-') && s.id.endsWith('-A')),
      b = original.symbols.findIndex((s) => s.id.startsWith('recipe-') && s.id.endsWith('-B'));
    const noJoin = structuredClone(original);
    for (const i of patches[0]!.joins)
      noJoin.rows[(out.h - 1 - Math.floor(i / out.w)) * out.w + (i % out.w)] = a;
    const removed = validateRecipeSequence(noJoin, patches);
    expect(removed.checks[0]!.joinedSides).toBe(false);
    expect(removed.blockers.join(' ')).toContain('join band/interface');
    const badBody = structuredClone(original),
      cell = patches[0]!.body[Math.floor(patches[0]!.body.length / 2)]!;
    badBody.rows[(out.h - 1 - Math.floor(cell / out.w)) * out.w + (cell % out.w)] = b;
    expect(validateRecipeSequence(badBody, patches).checks[0]!.separateBody).toBe(false);
    const missing = structuredClone(original),
      j = cell % out.w,
      k = out.h - 1 - Math.floor(cell / out.w);
    missing.symbols.push({ id: 'missing', steps: [] });
    missing.rows[k * out.w + j] = missing.symbols.length - 1;
    expect(validateRecipeSequence(missing, patches).checks[0]!.parents).toBe(false);
    const access = structuredClone(original),
      accessCell = patches[0]!.access[0]!.cells[0]!;
    access.rows[(out.h - 1 - Math.floor(accessCell / out.w)) * out.w + (accessCell % out.w)] = b;
    expect(validateRecipeSequence(access, patches).checks[0]!.openAccess).toBe(false);
  });

  it('preserves legacy output with no assignments and pre-existing blockers with assignments', () => {
    const p = base();
    expect(applyRecipes(p, plane)).toBe(p);
    const out = apply(
      { ...p, exportBlockers: ['baseline-failure'] },
      [region([0, 0.2, 1, 0.8])],
      [channel()]
    );
    expect(out.exportBlockers).toContain('baseline-failure');
    expect(() =>
      applyRecipes({ ...out, settings: { ...out.settings, recipes: [channel()] } }, plane, {
        cancelled: () => true,
      })
    ).toThrow(/cancelled/);
  });

  it('refuses inconsistent canonical dimensions, directions and source-cell provenance', () => {
    const p = base();
    const inconsistent = [
      { ...p.operations!, w: p.w - 1 },
      { ...p.operations!, rows: p.operations!.rows.slice(1) },
      { ...p.operations!, firstDir: -1 as const },
    ];
    const wrongCells = structuredClone(p.operations!);
    wrongCells.rows[0] = 2;
    inconsistent.push(wrongCells);
    for (const operations of inconsistent) {
      const out = apply({ ...p, operations }, [region([0, 0.2, 1, 0.8])], [channel()]);
      expect(out.recipeResult!.applied).toBe(false);
      expect(out.exportBlockers.join(' ')).toContain('canonical operations');
      expect(out.cells).toBe(p.cells);
    }
  });

  it('keeps flat measured shape parent checks and refuses changed-width or moved shape layouts', () => {
    const p = base({ mode: 'shape', size: { source: 'gauge' } }),
      out = apply(p, [region([0, 0.2, 1, 0.8])], [channel()]);
    ready(out);
    expect(out.exportBlockers).toEqual([]);
    expect(out.shape!.needles.moves).toEqual([]);
    const shape = structuredClone(p.shape!);
    shape.needles.placements[10]!.parents = [];
    expect(
      apply({ ...p, shape }, [region([0, 0.2, 1, 0.8])], [channel()]).recipeResult!.applied
    ).toBe(false);
  });

  it('retains unique generated IDs even when a base sequence already contains recipe-like IDs', () => {
    const p = base(),
      operations = structuredClone(p.operations!);
    operations.symbols.push({ id: 'recipe-Z1-A', steps: [] });
    const out = apply({ ...p, operations }, [region([0, 0.2, 1, 0.8])], [channel()]);
    ready(out);
    expect(new Set(out.operations!.symbols.map((s) => s.id)).size).toBe(
      out.operations!.symbols.length
    );
    expect(executeSequence(out.operations!).counts.knits).toBe(200);
  });

  it('preserves exact duplicate-meaning colours outside the footprint', () => {
    const p = base(),
      key: Key = {
        ...TWO,
        id: 'custom-twin-A',
        name: 'Twin A',
        preset: false,
        ops: [...TWO.ops, { ...TWO.ops[1]!, id: 'twin-A', rgb: [1, 2, 3] }],
      },
      cells = new Uint8Array(p.w * p.h).fill(key.ops.length - 1),
      old = { ...p, key, cells, operations: programSequence({ ...p, key, cells }) },
      out = apply(old, [region([0, 0.2, 1, 0.8])], [channel()]);
    ready(out);
    for (let i = 0; i < cells.length; i++)
      if (!out.recipeResult!.roles[i]) expect(out.cells[i]).toBe(cells[i]);
    expect(old.cells.every((v) => v === key.ops.length - 1)).toBe(true);
  });

  it('replays a maximum-size synthetic panel without retaining per-loop records', () => {
    const p = base({ size: { source: 'typed', needles: 600, passes: 600 } }),
      out = apply(p, [region([0, 0, 1, 1])], [channel()]);
    ready(out);
    expect(out.sequence!.counts.knits).toBe(720_000);
    expect(out.sequence!.loops).toBeUndefined();
    expect(out.recipeResult!.roles).toHaveLength(360_000);
    expect(out.recipeResult!.patches[0]!.body).toHaveLength(358_800);
  });
});
