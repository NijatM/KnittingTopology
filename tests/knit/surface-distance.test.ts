import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../src/core/types';
import { surfaceDistance } from '../../src/knit/surface-distance';

// All dimensions below are test values, not measured gauges.
const grid = (n: number, f: (u: number, v: number) => Vec3) =>
  Array.from({ length: (n + 1) ** 2 }, (_, i) => f((i % (n + 1)) / n, Math.floor(i / (n + 1)) / n));

describe('sampled triangle distance', () => {
  it('has exact rectangular-plane distances, including continuous source-edge interiors', () => {
    const n = 16,
      r = surfaceDistance(
        grid(n, (u, v) => [0.18 * u, 0.09 * v, 0]),
        n
      );
    for (let y = 0; y <= n; y++)
      for (let x = 0; x <= n; x++)
        expect(r.values[y * (n + 1) + x]).toBeCloseTo((0.18 * x) / n, 12);
    expect(r.maxChange).toBeLessThanOrEqual(r.tolerance);
  });

  it.each([0.2, 3])(
    'converges to analytic segment distance on a skew plane (shear %s)',
    (shear) => {
      const errors: number[] = [];
      for (const n of [16, 32, 64, 128]) {
        const { values } = surfaceDistance(
          grid(n, (u, v) => [0.18 * (u + shear * v), 0.18 * v, 0]),
          n
        );
        let error = 0;
        for (let y = 0; y <= n; y++)
          for (let x = 0; x <= n; x++) {
            const u = x / n,
              v = y / n,
              foot = Math.max(0, Math.min(1, v + (shear * u) / (1 + shear * shear))),
              exact = 0.18 * Math.hypot(u + shear * (v - foot), v - foot);
            error = Math.max(error, Math.abs(values[y * (n + 1) + x] - exact));
          }
        errors.push(error);
      }
      // Includes endpoint-wave errors; obtuse triangles are revisited, never permanently accepted.
      expect(errors[1]).toBeLessThan(errors[0] * 0.8);
      expect(errors[2]).toBeLessThan(errors[1] * 0.8);
      expect(errors[3]).toBeLessThan(errors[2] * 0.8);
    }
  );

  it('approaches cylinder arc distance as the sampled surface is refined', () => {
    const errors: number[] = [];
    for (const n of [16, 32, 64]) {
      const radius = 0.09,
        angle = 1.5,
        { values } = surfaceDistance(
          grid(n, (u, v) => [radius * Math.cos(angle * u), radius * Math.sin(angle * u), 0.1 * v]),
          n
        );
      let error = 0;
      for (let y = 0; y <= n; y++)
        for (let x = 0; x <= n; x++)
          error = Math.max(error, Math.abs(values[y * (n + 1) + x] - (radius * angle * x) / n));
      errors.push(error);
    }
    // Faceted-cylinder chord error is second order; this is not a bound for arbitrary surfaces.
    expect(errors[1]).toBeLessThan(errors[0] * 0.26);
    expect(errors[2]).toBeLessThan(errors[1] * 0.26);
  });

  it('reduces the independent analytic-metric Eikonal residual on a saddle', () => {
    const residuals: number[] = [];
    for (const n of [32, 64, 128]) {
      const L = 0.18,
        c = 0.45,
        { values } = surfaceDistance(
          grid(n, (u, v) => [
            L * (u - 0.5),
            L * (v - 0.5),
            L * c * ((u - 0.5) ** 2 - (v - 0.5) ** 2),
          ]),
          n
        );
      let sum = 0,
        count = 0;
      for (let y = n / 8; y <= (7 * n) / 8; y++)
        for (let x = n / 8; x <= (7 * n) / 8; x++) {
          const i = y * (n + 1) + x,
            du = ((values[i + 1] - values[i - 1]) * n) / (2 * L),
            dv = ((values[i + n + 1] - values[i - n - 1]) * n) / (2 * L),
            fx = 2 * c * (x / n - 0.5),
            fy = -2 * c * (y / n - 0.5),
            E = 1 + fx * fx,
            F = fx * fy,
            G = 1 + fy * fy,
            norm = Math.sqrt((G * du * du - 2 * F * du * dv + E * dv * dv) / (E * G - F * F));
          sum += (norm - 1) ** 2;
          count++;
        }
      residuals.push(Math.sqrt(sum / count));
    }
    expect(residuals[1]).toBeLessThan(residuals[0] * 0.6);
    expect(residuals[2]).toBeLessThan(residuals[1] * 0.6);
    expect(residuals[2]).toBeLessThan(4e-5);
  });

  it('removes the fixed-stencil saddle counterexample without claiming an exact geodesic', () => {
    const n = 128,
      L = 0.18,
      c = 0.45,
      u = 0.8195357702749658,
      v = 0.875,
      alpha = 0.158471890517436,
      { values } = surfaceDistance(
        grid(n, (u, v) => [
          L * (u - 0.5),
          L * (v - 0.5),
          L * c * ((u - 0.5) ** 2 - (v - 0.5) ** 2),
        ]),
        n
      );
    // Independently integrate a feasible curved UV path; it gives an upper comparator,
    // not an exact shortest path and not a physical loop/material trajectory.
    const speed = (t: number) => {
      const U = u * t,
        V = v + alpha * ((U - 0.5) ** 2 - (u - 0.5) ** 2),
        dV = 2 * alpha * (U - 0.5) * u;
      expect(V).toBeGreaterThanOrEqual(0);
      expect(V).toBeLessThanOrEqual(1);
      return Math.hypot(L * u, L * dV, 2 * L * c * ((U - 0.5) * u - (V - 0.5) * dV));
    };
    let sum = speed(0) + speed(1);
    for (let i = 1; i < 512; i++) sum += (i % 2 ? 4 : 2) * speed(i / 512);
    const feasible = sum / (3 * 512),
      x = u * n,
      j = Math.floor(x),
      f = x - j,
      field = values[v * n * (n + 1) + j] * (1 - f) + values[v * n * (n + 1) + j + 1] * f;
    expect(feasible).toBeCloseTo(0.1508782787801651, 12);
    expect(0.15125 - feasible).toBeGreaterThan(0.0003); // Previous stencil result.
    expect(field).toBeLessThan(feasible + 1e-5);
    expect(Math.abs(field - feasible)).toBeLessThan(3e-5);
  });

  it('is translation invariant and scales with geometry', () => {
    const n = 8,
      points = grid(n, (u, v) => [u + 0.2 * v, v, 0.1 * u * v]),
      a = surfaceDistance(points, n),
      b = surfaceDistance(
        points.map((p) => p.map((x) => 7 * x + 12) as Vec3),
        n
      );
    a.values.forEach((v, i) => expect(b.values[i]).toBeCloseTo(7 * v, 10));
  });

  it('rejects invalid or degenerate grids and checks cancellation during sweeps', () => {
    expect(() => surfaceDistance([], 128)).toThrow(/grid/);
    expect(() =>
      surfaceDistance(
        grid(4, () => [0, 0, 0]),
        4
      )
    ).toThrow(/Degenerate/);
    expect(() =>
      surfaceDistance(
        grid(4, () => [NaN, 0, 0]),
        4
      )
    ).toThrow(/Nonfinite/);
    let checks = 0;
    expect(() =>
      surfaceDistance(
        grid(4, (u, v) => [u, v, 0]),
        4,
        () => {
          if (++checks === 8) throw new Error('cancelled in sweep');
        }
      )
    ).toThrow(/cancelled in sweep/);
  });
});
