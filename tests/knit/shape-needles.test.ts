import { describe, expect, it } from 'vitest';
import { placeShapeNeedles } from '../../src/knit/shape-needles';
import type { ShapeGeometry } from '../../src/knit/shape-types';
function geometry(rows: number[][], boundary = true): ShapeGeometry {
  return {
    courses: rows.map((row, index) => ({
      id: `c${index}`,
      index,
      points: row.map((across) => ({
        across,
        uv: [across, index] as [number, number],
        position: [across, index, 0] as [number, number, number],
      })),
      loops: row.map((across, j) => ({
        id: `l${index}-${j}`,
        across,
        uv: [across, index] as [number, number],
        position: [across, index, 0] as [number, number, number],
      })),
      extent: [Math.min(...row) - 0.1, Math.max(...row) + 0.1],
      leftBoundary: boundary,
      rightBoundary: boundary,
      turnStart: !boundary,
      turnEnd: !boundary,
      length: row.length,
    })),
    contours: [],
    courseHeight: 1,
    stitchWidth: 1,
    contourRounding: [],
    courseRounding: [],
    maxLinkOffset: 0,
    resolution: 8,
    method: 'test',
    issues: [],
  };
}
describe('needle placement', () => {
  it('keeps a rectangular plane unchanged and deterministic', () => {
    const g = geometry([
        [0, 1, 2],
        [0, 1, 2],
        [0, 1, 2],
      ]),
      r = placeShapeNeedles(g);
    expect(r.unresolved).toEqual([]);
    expect(r.moves).toEqual([]);
    expect(r.steps).toEqual([]);
    expect(r.w).toBe(3);
    expect(r.h).toBe(3);
    expect(r).toEqual(placeShapeNeedles(g));
    expect(r.placements.slice(3).every((p) => p.parents.length === 1)).toBe(true);
  });
  it('activates boundary needles without transfers', () => {
    const r = placeShapeNeedles(
      geometry([
        [0, 1],
        [0, 1, 2],
        [0, 1, 2, 3],
      ])
    );
    expect(r.unresolved).toEqual([]);
    expect(r.moves).toEqual([]);
    expect(r.steps.some((s) => s.role === 'edge increase')).toBe(true);
  });
  it('preserves held loops through incomplete rows', () => {
    const r = placeShapeNeedles(
      geometry(
        [
          [0, 1, 2, 3],
          [1, 2],
          [0, 1, 2, 3],
        ],
        false
      )
    );
    expect(r.unresolved).toEqual([]);
    expect(r.placements.at(-4)?.parents).toEqual(['l0-0']);
    expect(r.placements.at(-1)?.parents).toEqual(['l0-3']);
  });
  it('reports unplaceable interior growth instead of silently accepting it', () => {
    const r = placeShapeNeedles(
      geometry(
        [
          [0, 1, 2],
          [0, 0.3, 0.6, 1, 1.4, 1.7, 2],
        ],
        false
      )
    );
    expect(r.unresolved.length).toBeGreaterThan(0);
  });
  it('keeps transfers unit length and parent ownership explicit', () => {
    const r = placeShapeNeedles(
      geometry(
        [
          [0, 1, 2, 3],
          [0, 0.8, 1.6, 2.4, 3],
        ],
        false
      )
    );
    expect(r.moves.every((m) => Math.abs(m.to - m.needle) === 1 && m.pass < m.forPass)).toBe(true);
    expect(
      r.placements
        .filter((p) => p.course === 1)
        .flatMap((p) => p.parents)
        .sort()
    ).toEqual(['l0-0', 'l0-1', 'l0-2', 'l0-3']);
    expect(
      r.placements
        .filter((p) => p.course === 1 && p.role === 'increase')
        .every((p) => p.parents.length === 0)
    ).toBe(true);
  });
  it('checks the two-step interior consequence in both directions', () => {
    for (const rows of [
      [
        [0, 1, 2, 3],
        [0, 0.5, 1, 1.5, 2, 2.5, 3],
      ],
      [
        [0, 0.5, 1, 1.5, 2, 2.5, 3],
        [0, 1, 2, 3],
      ],
    ])
      expect(placeShapeNeedles(geometry(rows, false)).unresolved.length).toBeGreaterThan(0);
  });
  it('narrows by conserving every eligible parent in the child graph', () => {
    const r = placeShapeNeedles(
      geometry(
        [
          [0, 1, 2, 3],
          [0, 1.5, 3],
        ],
        false
      )
    );
    expect(r.unresolved).toEqual([]);
    expect(
      r.placements
        .filter((p) => p.course === 1)
        .flatMap((p) => p.parents)
        .sort()
    ).toEqual(['l0-0', 'l0-1', 'l0-2', 'l0-3']);
    expect(r.moves.every((m) => Math.abs(m.to - m.needle) <= 1)).toBe(true);
  });
  it('consumes outer parents when a piece boundary narrows', () => {
    const r = placeShapeNeedles(
      geometry([
        [0, 1, 2, 3],
        [0, 1, 2],
      ])
    );
    expect(r.unresolved).toEqual([]);
    expect(
      r.placements
        .filter((p) => p.course === 1)
        .flatMap((p) => p.parents)
        .sort()
    ).toEqual(['l0-0', 'l0-1', 'l0-2', 'l0-3']);
    expect(r.steps.some((p) => p.pass === 2 && p.role === 'decrease')).toBe(true);
    const mirrored = placeShapeNeedles(
      geometry([
        [0, 1, 2, 3],
        [1, 2, 3],
      ])
    );
    expect(mirrored.unresolved).toEqual([]);
    expect(mirrored.placements.filter((p) => p.course === 1).flatMap((p) => p.parents).length).toBe(
      4
    );
  });
  it('marks both physical turn endpoints independently of travel direction', () => {
    const g = geometry([[0, 1, 2]], false);
    const r = placeShapeNeedles(g, -1);
    expect(r.steps.filter((p) => p.role === 'turn').map((p) => p.needle)).toEqual([0, 2]);
  });
  it('preserves identity on repeated full-width courses', () => {
    const row = Array.from({ length: 600 }, (_, i) => i);
    const r = placeShapeNeedles(geometry([row, row, row]));
    expect(r.w).toBe(600);
    expect(r.moves).toEqual([]);
    expect(r.unresolved).toEqual([]);
    expect(r.placements).toHaveLength(1800);
    for (const p of r.placements) {
      expect(p.needle).toBe(p.loop.across);
      expect(p.parents).toEqual(p.course ? [`l${p.course - 1}-${p.needle}`] : []);
    }
  });
  it('rejects invalid dimensions, IDs, coordinates and order', () => {
    const g = geometry([[0, 1]]);
    g.courses[0].loops[0].across = NaN;
    expect(() => placeShapeNeedles(g)).toThrow();
    expect(() => placeShapeNeedles(geometry([Array.from({ length: 601 }, (_, i) => i)]))).toThrow();
    const h = geometry([
      [0, 1],
      [0, 1],
    ]);
    h.courses[1].index = 5;
    expect(() => placeShapeNeedles(h)).toThrow();
  });
});
