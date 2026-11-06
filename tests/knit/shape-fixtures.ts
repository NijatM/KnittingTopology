import type { SurfaceSpec } from '../../src/core/types';
export function mappedChart(fn: (u: number, v: number) => number[], n = 16): SurfaceSpec {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let y = 0; y <= n; y++)
    for (let x = 0; x <= n; x++) {
      positions.push(...fn(x / n, y / n));
      uvs.push(x / n, y / n);
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = y * (n + 1) + x;
      indices.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
    }
  for (let k = 0; k < 3; k++) {
    const values = positions.filter((_, i) => i % 3 === k),
      mid = (Math.min(...values) + Math.max(...values)) / 2;
    for (let i = k; i < positions.length; i += 3) positions[i] -= mid;
  }
  const size = Math.max(
    ...[0, 1, 2].map((k) => {
      const a = positions.filter((_, i) => i % 3 === k);
      return Math.max(...a) - Math.min(...a);
    })
  );
  return {
    kind: 'mesh',
    size,
    curvature: 0,
    revision: 'mapped-shape',
    mapping: 'rectangular-obj-uv-v1',
    mesh: {
      positions,
      uvs,
      indices,
      source: {
        name: 'analytic-fixture.obj',
        format: 'obj',
        unit: 'm',
        scaleToMeters: 1,
        centerMeters: [0, 0, 0],
        indexing: 'obj-indices',
        notes: [],
      },
    },
  };
}
