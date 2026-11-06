import { describe, it, expect } from 'vitest';
import type { KnitSettings, SurfaceSpec } from '../../src/core/types';
import {
  createProject,
  parseProject,
  serializeProject,
  scientificSignature,
  historyReducer,
} from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings, validateKnitSettings } from '../../src/knit/settings';
import { SOURCE } from '../../src/knit/rasterize';
import { bmpBytes } from '../../src/knit/files';
import { validateTiles } from '../../src/knit/tiles';
import { structuresForKey } from '../../src/knit/structures';
import { BASIC } from '../../src/knit/keys';
import { gaugeOf } from '../../src/knit/gauge';
import { loopText, loopSelection, selectionLoops } from '../../src/app/knit/provenance';
import { knitReport } from '../../src/knit/report';
import { mappedChart } from './shape-fixtures';
const plane: SurfaceSpec = { kind: 'plane', size: 0.12, curvature: 0, revision: 'm3-test' };
function input(surface: SurfaceSpec = plane, change: Partial<KnitSettings> = {}) {
  const p = {
    ...createProject(),
    surface,
    knit: {
      ...defaultKnitSettings(),
      edges: { structure: null, width: 2, boundary: false },
      ...change,
    },
    swatches: [{ structure: 'jersey', stitchWidth: 0.002, courseHeight: 0.002 }],
  };
  p.parameters = { ...p.parameters, spacing: 0.02, relaxation: 0 };
  return { ...p, graph: generatePattern(p).graph };
}
function build(p: ReturnType<typeof input>) {
  const r = buildKnitProgram(p);
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
describe('network patterns on surface loop layouts', () => {
  it('preserves distinct chart boundaries where their 3D positions coincide', () => {
    const surface = mappedChart((u, v) => {
      const angle = (2 * Math.PI + 0.5 * (2 * v - 1) ** 2) * u;
      return [0.02 * Math.cos(angle), 0.02 * Math.sin(angle), 0.1 * v];
    }, 24);
    const p = input(surface, {
        size: { source: 'typed', needles: 60, passes: 21 },
        edges: { structure: 'reverse', width: 2, boundary: true },
      }),
      r = build(p);
    const nodes = new Map(p.graph.nodes.map((n) => [n.id, n]));
    for (const [j, u] of [
      [0, 0],
      [59, 1],
    ]) {
      const i = (r.h - 1 - 10) * r.w + j!;
      expect(r.raster.kind[i]).toBe(SOURCE.edge);
      const edge = p.graph.edges[r.raster.element[i]!]!;
      expect(nodes.get(edge.a)!.attachment.uv[0]).toBe(u);
      expect(nodes.get(edge.b)!.attachment.uv[0]).toBe(u);
    }
  });
  it.each(['plane', 'saddle'] as const)(
    'preserves reference registration across modes on %s',
    (kind) => {
      const s = { ...plane, kind, curvature: kind === 'saddle' ? 0.45 : 0 },
        p = input(s),
        network = build(p),
        both = build({ ...p, knit: { ...p.knit, mode: 'both' } });
      expect([network.w, network.h]).toEqual([both.w, both.h]);
      expect(network.shape!.needles.placements).toEqual(both.shape!.needles.placements);
      expect([...network.raster.kind]).toEqual([...both.raster.kind]);
      expect([...network.raster.element]).toEqual([...both.raster.element]);
      expect(both.exportBlockers).toEqual([]);
    }
  );
  it('matches analytic plane edge widths and node squares in loop units', () => {
    for (const width of [1, 2, 3]) {
      const p = build(input(plane, { edges: { structure: 'reverse', width, boundary: false } }));
      const row = Array.from({ length: p.w }, (_, j) => p.raster.kind[(p.h - 1 - 5) * p.w + j]);
      expect(row.filter((x) => x === SOURCE.edge)).toHaveLength(5 * width);
    }
    const p = build(
      input(plane, { nodes: { structure: 'reverse', size: 3, extraordinary: null } })
    );
    expect(p.raster.kind.filter((x) => x === SOURCE.node)).toHaveLength(25 * 9);
  });
  it('maps cells, edges, node marks and manual overrides back to the actual graph', () => {
    const s = { ...plane, kind: 'saddle' as const, curvature: 0.5 },
      p = input(s, {
        edges: { structure: 'reverse', width: 2, boundary: false },
        nodes: { structure: 'seed', size: 3, extraordinary: null },
      });
    p.knit.cells.overrides = { [p.graph.cells[0]!.id]: 'reverse' };
    const result = build(p);
    for (const kind of [SOURCE.cell, SOURCE.edge, SOURCE.node]) {
      const i = result.raster.kind.findIndex((x) => x === kind);
      expect(i).toBeGreaterThanOrEqual(0);
      const selected = loopSelection(result, p.graph, i);
      expect(selected).not.toBeNull();
      expect(selectionLoops(result, p.graph, selected)?.[i]).toBe(1);
      expect(loopText(result, p.graph, i)).toContain(selected!.id);
    }
    expect(result.raster.cellStructure[0]).toBe('reverse');
  });
  it('rectangular filling reports exact extra counts without moving pattern assignments', () => {
    const s = mappedChart((u, v) => {
        const r = 0.06 + 0.04 * u,
          a = 0.8 * v;
        return [r * Math.cos(a), r * Math.sin(a), 0];
      }, 24),
      p = input(s);
    p.swatches = [{ structure: 'jersey', stitchWidth: 0.005, courseHeight: 0.005 }];
    const n = build(p),
      b = build({ ...p, knit: { ...p.knit, mode: 'both' } });
    const added = n.shape!.placementAt.filter((i) => i === -1).length;
    expect(added).toBeGreaterThan(0);
    expect(n.rectification?.addedCells).toBe(added);
    expect(n.cells.every((i) => n.key.ops[i]!.id === 'kf')).toBe(true);
    expect(b.cells.filter((i) => b.key.ops[i]!.id === 'fl')).toHaveLength(added);
    expect(n.shape!.needles.placements).toEqual(b.shape!.needles.placements);
    expect([...n.raster.kind]).toEqual([...b.raster.kind]);
    expect(knitReport(n, 'sector', s.size)).toContain('Shaping transfers are not applied');
  });
  it('supports typed saddle and supplied-chart networks without inventing measurements', () => {
    const surfaces = [
      { ...plane, kind: 'saddle' as const, curvature: 0.45 },
      mappedChart((u, v) => [u * 0.12, v * 0.1, 0.01 * u * v], 2),
    ];
    for (const surface of surfaces) {
      const p = input(surface, {
        size: { source: 'typed', needles: 31, passes: 27 },
        startEdge: 'u1',
      });
      p.swatches = [];
      const r = build(p);
      expect([r.w, r.h]).toEqual([31, 27]);
      expect(r.sizeGauge).toBeNull();
      expect(r.shape).toBeUndefined();
      expect(r.mapping.toGrid(r.mapping.toSurface([10.5, 12.5]))[0]).toBeCloseTo(10.5, 6);
      expect(r.issues.join(' ')).toContain('no measured physical size');
    }
  });
  it('blocks combined operation export when the tile cannot realize its loop graph', () => {
    const p = input(plane, {
        mode: 'both',
        cells: { fill: 'hold', rule: { kind: 'uniform' }, overrides: {} },
      }),
      r = build(p);
    expect(r.exportBlockers.length).toBeGreaterThan(0);
    expect(() => bmpBytes(r)).toThrow(/blocked/);
    expect(
      buildKnitProgram({
        ...p,
        graph: { ...p.graph, provenance: { ...p.graph.provenance, surfaceRevision: 'old' } },
      })
    ).toMatchObject({ ok: false, reason: expect.stringContaining('revision') });
  });
});
describe('immutable user structure tiles', () => {
  const tile = {
    id: 'custom:test',
    name: 'Test tile',
    keyId: BASIC.id,
    w: 2,
    h: 2,
    rows: [
      ['kb', 'kf'],
      ['kf', 'kb'],
    ],
  };
  it('round-trips without changing the scientific signature and participates in assignments', () => {
    const p = input(plane, {
      size: { source: 'typed', needles: 60, passes: 60 },
      tiles: [tile],
      cells: { fill: tile.id, rule: { kind: 'uniform' }, overrides: {} },
    });
    const restored = parseProject(serializeProject(p));
    expect(restored.knit?.tiles).toEqual([tile]);
    const withoutKnit = { ...p, knit: undefined };
    expect(scientificSignature(withoutKnit)).toBe(scientificSignature(p));
    const r = build(p);
    expect(r.structures[0]).toMatchObject({ id: tile.id, gauge: { assumed: true } });
    expect([...new Set(r.cells)].length).toBeGreaterThan(1);
    let h = historyReducer(
      { past: [], present: { ...p, knit: { ...p.knit, tiles: [] } }, future: [] },
      { type: 'commit', next: p }
    );
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.knit?.tiles).toEqual([]);
  });
  it('does not replace built-ins or inherit measurements from another saved ID', () => {
    const before = JSON.stringify(structuresForKey(BASIC));
    const copy = validateTiles([tile]);
    copy[0]!.rows[0]![0] = 'fl';
    expect(JSON.stringify(structuresForKey(BASIC))).toBe(before);
    expect(tile.rows[0]![0]).toBe('kb');
    expect(
      gaugeOf('custom:new-id', [{ structure: tile.id, stitchWidth: 0.002, courseHeight: 0.002 }])
    ).toBeNull();
  });
  it.each([
    { ...tile, id: 'jersey' },
    { ...tile, w: 17 },
    {
      ...tile,
      rows: [
        ['unknown', 'kf'],
        ['kf', 'kb'],
      ],
    },
    { ...tile, keyId: 'unknown' },
    { ...tile, name: ' ' },
  ])('rejects malformed saved tiles', (bad) => {
    expect(() => validateKnitSettings({ ...defaultKnitSettings(), tiles: [bad] })).toThrow();
  });
  it('rejects duplicate IDs and excess tiles', () => {
    expect(() => validateTiles([tile, tile])).toThrow(/unique/);
    expect(() => validateTiles(Array(25).fill(tile))).toThrow(/24/);
  });
});
