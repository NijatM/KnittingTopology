import type { Vec3 } from '../core/types';

interface Update {
  a: number;
  b: number;
  edge: number;
  ca: number;
  cb: number;
  along: number;
  height: number;
}

/** Distance from the entire u=0 edge of a sampled rectangular chart.
 * Project first-order Bellman discretization, not a one-pass fast-marching method.
 * At C, minimize linear edge data plus straight travel inside each incident triangle:
 *   min(0<=t<=1) (1-t)*d(A) + t*d(B) + |C - ((1-t)*A+t*B)|.
 * Four-direction label correction revisits vertices, including on obtuse triangles.
 * Residual convergence is an algebraic check, not a surface-distance error bound.
 */
export function surfaceDistance(
  points: readonly Vec3[],
  n: number,
  check: () => void = () => {}
): { values: Float64Array; cycles: number; maxChange: number; tolerance: number } {
  if (!Number.isInteger(n) || n < 2 || n > 256 || points.length !== (n + 1) ** 2)
    throw new Error('Invalid surface-distance grid.');
  if (points.some((p) => p.length !== 3 || !p.every(Number.isFinite)))
    throw new Error('Nonfinite surface-distance point.');
  check();
  const side = n + 1,
    adjacent: Update[][] = Array.from({ length: points.length }, () => []);
  let scale = 0;
  const triangle = (a: number, b: number, c: number) => {
    for (const [i, j, k] of [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ]) {
      const A = points[j],
        B = points[k],
        C = points[i],
        ex = B[0] - A[0],
        ey = B[1] - A[1],
        ez = B[2] - A[2],
        qx = C[0] - A[0],
        qy = C[1] - A[1],
        qz = C[2] - A[2],
        edge = Math.hypot(ex, ey, ez),
        ca = Math.hypot(qx, qy, qz),
        cb = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]),
        along = (qx * ex + qy * ey + qz * ez) / edge,
        // Cross product is more stable than subtracting almost equal squared lengths.
        height = Math.hypot(qy * ez - qz * ey, qz * ex - qx * ez, qx * ey - qy * ex) / edge;
      if (
        ![edge, ca, cb, along, height].every(Number.isFinite) ||
        height <= 1e-12 * Math.max(edge, ca, cb)
      )
        throw new Error('Degenerate sampled distance triangle; split or refine the chart.');
      scale = Math.max(scale, edge, ca, cb);
      adjacent[i].push({ a: j, b: k, edge, ca, cb, along, height });
    }
  };
  for (let y = 0; y < n; y++) {
    check();
    for (let x = 0; x < n; x++) {
      const a = y * side + x,
        b = a + 1,
        c = a + side,
        d = c + 1;
      // Alternating diagonals avoid privileging one chart diagonal globally.
      if ((x + y) % 2) {
        triangle(a, b, c);
        triangle(b, d, c);
      } else {
        triangle(a, b, d);
        triangle(a, d, c);
      }
    }
  }
  const values = new Float64Array(points.length).fill(Infinity),
    tolerance = 1e-10 * scale * n;
  for (let y = 0; y <= n; y++) values[y * side] = 0;
  const update = (i: number) => {
    let value = values[i];
    for (const t of adjacent[i]) {
      const da = values[t.a],
        db = values[t.b];
      value = Math.min(value, da + t.ca, db + t.cb);
      if (!Number.isFinite(da) || !Number.isFinite(db)) continue;
      const slope = (db - da) / t.edge;
      if (Math.abs(slope) < 1) {
        const z = t.along - (slope * t.height) / Math.sqrt(1 - slope * slope);
        if (z > 0 && z < t.edge)
          value = Math.min(value, da + slope * z + Math.hypot(z - t.along, t.height));
      }
    }
    const change = value === values[i] ? 0 : values[i] - value;
    values[i] = value;
    return change;
  };
  for (let cycle = 1; cycle <= 128; cycle++) {
    let maxChange = 0;
    for (const sy of [1, -1])
      for (const sx of [1, -1])
        for (let iy = 0; iy <= n; iy++) {
          check();
          const y = sy === 1 ? iy : n - iy;
          for (let ix = 0; ix <= n; ix++) {
            const x = sx === 1 ? ix : n - ix;
            if (x) maxChange = Math.max(maxChange, update(y * side + x));
          }
        }
    if (maxChange <= tolerance && values.every(Number.isFinite))
      return { values, cycles: cycle, maxChange, tolerance };
  }
  throw new Error('Surface-distance relaxation did not converge; split or refine the chart.');
}
