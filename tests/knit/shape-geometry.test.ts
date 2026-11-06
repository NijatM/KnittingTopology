import { mappedChart } from './shape-fixtures';
import { describe, expect, it } from 'vitest';
import type { SurfaceSpec } from '../../src/core/types';
import { evaluateSurface } from '../../src/core/surfaces';
import { buildShapeGeometry, originalShapeUV } from '../../src/knit/shape-geometry';
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'shape-test' };
describe('shaping geometry', () => {
  it('aligns a larger analytic plane without introducing turns or offsets', () => {
    const result = buildShapeGeometry(plane, 0.1 / 120, 0.1 / 100, 'u1');
    expect(result.courses).toHaveLength(100);
    expect(result.courses.every((c) => c.loops.length === 120 && !c.turnStart && !c.turnEnd)).toBe(
      true
    );
    expect(result.maxLinkOffset).toBe(0);
  });
  it.each(['v0', 'u1', 'v1', 'u0'] as const)(
    'has analytic plane counts and original UV for %s',
    (edge) => {
      const r = buildShapeGeometry(plane, 0.006, 0.004, edge);
      expect(r.courses).toHaveLength(25);
      expect(r.contours).toHaveLength(17);
      for (const c of r.courses) {
        expect(c.loops).toHaveLength(17);
        expect(
          c.turnStart || c.turnEnd,
          JSON.stringify({ extent: c.extent, points: [c.points[0], c.points.at(-1)] })
        ).toBe(false);
        expect(c.extent[0]).toBe(0);
        expect(c.extent[1]).toBeCloseTo(0.1, 10);
        for (const p of [...c.points, ...c.loops])
          expect(p.position).toEqual(evaluateSurface(plane, 0, ...p.uv));
      }
    }
  );
  it('keeps exact integral ratios from spurious ceiling', () => {
    const r = buildShapeGeometry(plane, 0.005, 0.005);
    expect(r.courses).toHaveLength(20);
    expect(r.courses.every((c) => c.loops.length === 20)).toBe(true);
  });
  it('retains one contour for a finite positive width larger than the entire patch', () => {
    const r = buildShapeGeometry(plane, 1e10, 0.005);
    expect(r.contours).toHaveLength(1);
    expect(r.courses.length).toBeGreaterThan(0);
    expect(r.courses.every((c) => c.loops.length === 1)).toBe(true);
  });
  it('rotates without reflecting', () => {
    expect(originalShapeUV(0.2, 0.3, 'u1')).toEqual([0.7, 0.2]);
    expect(originalShapeUV(0.2, 0.3, 'u0')).toEqual([0.3, 0.8]);
  });
  it('saddle produces finite ordered curves and bounded loops', () => {
    const s = { ...plane, kind: 'saddle' as const, curvature: 0.5 };
    const r = buildShapeGeometry(s, 0.008, 0.006);
    expect(r.courses.length).toBeGreaterThan(10);
    for (const c of r.courses) {
      expect(c.extent[1]).toBeGreaterThan(c.extent[0]);
      expect(c.loops.length).toBeLessThanOrEqual(600);
      for (const p of c.loops) {
        expect(p.position).toEqual(evaluateSurface(s, 0, ...p.uv));
        expect(p.across).toBeGreaterThanOrEqual(c.extent[0]);
        expect(p.across).toBeLessThanOrEqual(c.extent[1] + 1e-12);
      }
    }
    expect(r.issues.join(' ')).toContain('not bounded');
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid measurement %s', (x) =>
    expect(() => buildShapeGeometry(plane, x, 0.005)).toThrow(/finite and positive/)
  );
  it('bounds needles and passes before producing a result', () => {
    expect(() => buildShapeGeometry(plane, 0.00001, 0.005)).toThrow(/600 needle/);
    expect(() => buildShapeGeometry(plane, 0.005, 0.00001)).toThrow(/600 pass/);
  });
  it('honours cancellation', () =>
    expect(() =>
      buildShapeGeometry(plane, 0.005, 0.005, 'v0', { cancelled: () => true })
    ).toThrowError(expect.objectContaining({ name: 'AbortError' })));
  it('rejects closed surfaces explicitly', () =>
    expect(() => buildShapeGeometry({ ...plane, kind: 'sphere' }, 0.005, 0.005)).toThrow(
      /requires/
    ));
});

describe('mapped analytic fixture comparisons', () => {
  it('right trapezoid widths follow the analytic outer boundary', () => {
    const s = mappedChart((u, v) => [u * (0.08 + 0.04 * v) - 0.06, 0.1 * v - 0.05, 0], 1),
      r = buildShapeGeometry(s, 0.006, 0.005);
    expect(r.courses.length).toBeGreaterThanOrEqual(19);
    for (const c of r.courses) {
      const v = c.loops.reduce((sum, p) => sum + p.uv[1], 0) / c.loops.length;
      expect(Math.abs(c.loops.length - Math.ceil((0.08 + 0.04 * v) / 0.006))).toBeLessThanOrEqual(
        1
      );
      expect(
        c.turnStart || c.turnEnd,
        JSON.stringify({ extent: c.extent, points: [c.points[0], c.points.at(-1)] })
      ).toBe(false);
    }
  });
  it('annular sector has the analytically predicted excess outer samples', () => {
    const s = mappedChart((u, v) => {
        const radius = 0.06 + 0.04 * u,
          angle = 0.8 * v;
        return [radius * Math.cos(angle) - 0.07, radius * Math.sin(angle) - 0.035, 0];
      }, 24),
      r = buildShapeGeometry(s, 0.005, 0.005);
    const sampleCounts = r.contours.map((p, i) =>
      Math.round(
        (p
          .slice(1)
          .reduce(
            (sum, q, k) => sum + Math.hypot(...q.position.map((x, j) => x - p[k].position[j])),
            0
          ) -
          r.contourRounding[i]) /
          0.005
      )
    );
    expect(sampleCounts.at(-1)! - sampleCounts[0]).toBe(6);
    expect(r.courses.filter((c) => c.turnStart || c.turnEnd)).toHaveLength(6);
    for (const c of r.courses) {
      if (c.turnStart)
        expect(
          Math.hypot(...c.points[0].position.map((x, k) => x - c.points[1].position[k]))
        ).toBeGreaterThan(0);
      if (c.turnEnd)
        expect(
          Math.hypot(...c.points.at(-1)!.position.map((x, k) => x - c.points.at(-2)!.position[k]))
        ).toBeGreaterThan(0);
    }
  });
});
