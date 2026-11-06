import { describe, expect, it } from 'vitest';
import type { ImportedMeshData, SurfaceSpec, Vec2, Vec3 } from '../../src/core/types';
import {
  checkRectangularUV,
  evaluateMappedSurface,
  hasRectangularMapping,
  mappedNormal,
  mappedResidual,
  mappedSurfaceArea,
  mappedUVAtTriangle,
  mappedUVPath,
  projectMappedSurface,
  requireRectangularUV,
} from '../../src/import/uv-mapping';
import {
  analyticSurfaceArea,
  buildSurfaceMesh,
  embeddedEdgeLength,
  evaluateSurface,
  projectToSurface,
  surfaceNormal,
  surfacePath,
  surfaceResidual,
  validateSurface,
} from '../../src/core/surfaces';
function mesh(
  positions = [-1, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, -1, 0.5, 0],
  uvs = [0, 0, 1, 0, 1, 1, 0, 1],
  indices = [0, 1, 2, 0, 2, 3]
): ImportedMeshData {
  return {
    positions,
    indices,
    uvs,
    source: {
      name: 'chart.obj',
      format: 'obj',
      unit: 'm',
      scaleToMeters: 1,
      centerMeters: [0, 0, 0],
      indexing: 'obj-indices',
      notes: [],
    },
  };
}
function surface(data = mesh()): SurfaceSpec {
  const extents = [0, 1, 2].map((k) => {
    const a = data.positions.filter((_, i) => i % 3 === k);
    return Math.max(...a) - Math.min(...a);
  });
  return {
    kind: 'mesh',
    size: Math.max(...extents),
    curvature: 0,
    revision: 'uv-test',
    mesh: data,
    mapping: 'rectangular-obj-uv-v1',
  };
}
function close(actual: number[], expected: number[], digits = 12): void {
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits));
}
function bent(): SurfaceSpec {
  return surface(mesh([-1, -0.5, -0.5, 1, -0.5, -0.5, 1, 0.5, -0.5, -1, 0.5, 0.5]));
}
function grid(n: number): ImportedMeshData {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      positions.push(i / n - 0.5, j / n - 0.5, 0);
      uvs.push(i / n, j / n);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i,
        b = a + 1,
        d = a + n + 1,
        c = d + 1;
      indices.push(a, b, c, a, c, d);
    }
  return mesh(positions, uvs, indices);
}
describe('supplied rectangular OBJ chart validation', () => {
  it('normalizes offset non-square UV bounds and measures world scale independently', () => {
    const data = mesh(undefined, [20, -7, 24, -7, 24, -4, 20, -4]);
    const report = checkRectangularUV(data);
    expect(report).toMatchObject({
      status: 'ready',
      boundsMin: [20, -7],
      boundsMax: [24, -4],
      uvArea: 1,
      minScaleM: 1,
      maxScaleM: 2,
      maxCondition: 2,
    });
    const s = surface(data);
    close(evaluateMappedSurface(s, 0.25, 0.75).position, [-0.5, 0.25, 0]);
    expect(buildSurfaceMesh(s).uvs).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(data.uvs).toEqual([20, -7, 24, -7, 24, -4, 20, -4]);
  });
  it('checks flags independently while every scientific use validates selected charts', () => {
    const s = surface();
    expect(hasRectangularMapping(s)).toBe(true);
    const inspection = { ...s, mapping: undefined };
    expect(hasRectangularMapping(inspection)).toBe(false);
    expect(() => evaluateSurface(inspection, 0, 0.5, 0.5)).toThrow(/inspection/);
    expect(buildSurfaceMesh(inspection).uvs.every((v) => v === 0)).toBe(true);
    expect(() =>
      validateSurface({ kind: 'plane', size: 1, curvature: 0, revision: 'x', mapping: s.mapping })
    ).toThrow(/mapping/);
    expect(() => validateSurface(surface(mesh(undefined, [0, 0, 0, 0, 0, 0, 0, 0])))).toThrow(
      /chart unavailable/
    );
  });
  it('rejects missing UVs, reversal, local flips and nonrectangular boundaries without repair', () => {
    const absent = mesh();
    delete absent.uvs;
    expect(checkRectangularUV(absent)).toMatchObject({ status: 'unavailable' });
    for (const uvs of [
      [0, 0, 0, 1, 1, 1, 1, 0],
      [0, 0, 1, 0, 0, 1, 1, 1],
      [0, 0, 1, 0, 0.8, 1, 0, 1],
      [0, 0, 1, 0, 1, 1, 1e-16, 1],
    ])
      expect(checkRectangularUV(mesh(undefined, uvs)).status).toBe('unavailable');
    expect(checkRectangularUV(mesh(undefined, [0, 0, 0, 1, 1, 1, 1, 0])).reason).toMatch(
      /globally reversed/
    );
  });
  it('rejects isolated, duplicated, degenerate, disconnected and nonmanifold geometry', () => {
    const fixtures = [
      mesh([...mesh().positions, 0, 0, 0], [...mesh().uvs!, 0.5, 0.5]),
      mesh(undefined, undefined, [0, 1, 2, 0, 2, 3, 0, 1, 2]),
      mesh(undefined, undefined, [0, 1, 2, 0, 2, 3, 0, 0, 1]),
      mesh([-1, -0.5, 0, 1, -0.5, 0, 0, -0.5, 0, -1, 0.5, 0]),
      mesh(undefined, undefined, [0, 1, 2]),
    ];
    fixtures.forEach((m) => expect(checkRectangularUV(m).status).toBe('unavailable'));
  });
  it('rejects a hole, overlapping interior chart, and a missing corner', () => {
    const ring = grid(3);
    // Remove the two center-cell triangles, retaining all vertices.
    ring.indices.splice((1 * 3 + 1) * 6, 6);
    expect(checkRectangularUV(ring).reason).toMatch(/Euler|disk|boundary/);
    const overlap = grid(2);
    overlap.uvs![8] = 1.1;
    expect(checkRectangularUV(overlap).status).toBe('unavailable');
    const triangle = mesh(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0],
      [0, 0, 1, 0, 0, 1],
      [0, 1, 2]
    );
    expect(checkRectangularUV(triangle).status).toBe('unavailable');
  });
  it('rejects split OBJ position identities at seams and nonmanifold fans/edges', () => {
    const seam = mesh(
      [-1, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, -1, -0.5, 0, 1, 0.5, 0, -1, 0.5, 0],
      [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1],
      [0, 1, 2, 3, 4, 5]
    );
    expect(checkRectangularUV(seam).reason).toMatch(/connected disk/);
    const bowtie = mesh(
      [-1, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0],
      [0, 0.5, 0.5, 0, 0.5, 0.5, 0.5, 1, 1, 0.5],
      [2, 0, 1, 2, 4, 3]
    );
    expect(checkRectangularUV(bowtie).reason).toMatch(/vertex links|vertex fans/);
    const edge = mesh(
      [-0.5, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, -0.5, 0, 0.25, 0.25, 0],
      [0, 0.5, 1, 0.5, 0.5, 1, 0.5, 0, 0.75, 0.75],
      [0, 1, 2, 1, 0, 3, 0, 1, 4]
    );
    expect(checkRectangularUV(edge).reason).toMatch(/manifold edges/);
  });
  it('reports unsupported runtime payloads without throwing a chart-validation error', () => {
    expect(checkRectangularUV(null as unknown as ImportedMeshData).status).toBe('unavailable');
  });
  it('accepts rectangle sides subdivided by exact collinear boundary vertices', () => {
    expect(checkRectangularUV(grid(3)).status).toBe('ready');
  });
  it('accepts the minimum valid meter scale and reports derivative scales in meters', () => {
    const m = mesh(mesh().positions.map((v) => v * 5e-7));
    const s = surface(m),
      report = checkRectangularUV(m);
    expect(report.status).toBe('ready');
    expect(report.minScaleM).toBeCloseTo(5e-7, 18);
    expect(mappedSurfaceArea(s)).toBeCloseTo(5e-13, 24);
    close(projectMappedSurface(s, [0, 0, 1e-6]).position, [0, 0, 0], 18);
  });
  it('cooperates with cancellation, including prepared-cache hits, and protects cached reports', () => {
    const m = mesh();
    expect(() => requireRectangularUV(m, { cancelled: () => true })).toThrowError(
      expect.objectContaining({ name: 'AbortError' })
    );
    const r = checkRectangularUV(m);
    r.boundsMin![0] = 99;
    r.diagnostics[0].message = 'changed';
    expect(checkRectangularUV(m).boundsMin).toEqual([0, 0]);
    expect(checkRectangularUV(m).diagnostics[0].message).not.toBe('changed');
    expect(() => requireRectangularUV(m, { cancelled: () => true })).toThrowError(
      expect.objectContaining({ name: 'AbortError' })
    );
  });
});
describe('piecewise linear evaluation, picking and physical paths', () => {
  it('evaluates plane geometry, attachments, area, normal and projection analytically', () => {
    const s = surface(),
      e = evaluateMappedSurface(s, 0.75, 0.25);
    close(e.position, [0.5, -0.25, 0]);
    expect(e.attachment).toMatchObject({
      surfaceRevision: s.revision,
      patch: 0,
      uv: [0.75, 0.25],
      faceId: 0,
    });
    close(mappedUVAtTriangle(s, e.attachment.faceId!, e.attachment.barycentric!), [0.75, 0.25]);
    close(projectMappedSurface(s, [2, 0.2, 3]).position, [1, 0.2, 0]);
    close(mappedNormal(s, [0, 0, 2]), [0, 0, 1]);
    expect(mappedResidual(s, [0, 0, 0.25])).toBeCloseTo(0.25, 14);
    expect(mappedSurfaceArea(s)).toBe(2);
    expect(analyticSurfaceArea(s)).toBe(2);
    close(evaluateSurface(s, 0, 0.75, 0.25), e.position);
    close(projectToSurface(s, [2, 0.2, 3]).position, [1, 0.2, 0]);
    close(surfaceNormal(s, [0, 0, 0]), [0, 0, 1]);
    expect(surfaceResidual(s, [0, 0, 0.25])).toBe(0.25);
  });
  it('picks the smallest face ID for shared-edge and shared-vertex ties', () => {
    const s = surface();
    for (const uv of [
      [0.5, 0.5],
      [0, 0],
      [1, 1],
    ] as Vec2[]) {
      const e = evaluateMappedSurface(s, ...uv);
      expect(e.attachment.faceId).toBe(0);
      expect(projectMappedSurface(s, e.position).attachment.faceId).toBe(0);
    }
  });
  it('splits a bent path at the triangle edge and measures its polyline length', () => {
    const s = bent(),
      a: Vec2 = [0.25, 0.75],
      b: Vec2 = [0.75, 0.25];
    const path = mappedUVPath(s, a, b);
    expect(path).toHaveLength(3);
    close(path[0], [-0.5, 0.25, 0]);
    close(path[1], [0, 0, -0.5]);
    close(path[2], [0.5, -0.25, -0.5]);
    const expected = 0.75 + Math.sqrt(0.3125);
    expect(embeddedEdgeLength(s, path[0], path[2], path)).toBeCloseTo(expected, 12);
    expect(embeddedEdgeLength(s, path[0], path[2])).toBeCloseTo(expected, 12);
    const chord = Math.hypot(1, -0.5, -0.5);
    expect(expected).toBeGreaterThan(chord);
    expect(surfacePath(s, path[0], path[2])).toEqual(path);
    expect(mappedSurfaceArea(s)).toBeCloseTo(1 + 1.5, 12);
    const n = mappedNormal(s, path[0]);
    close(n, [1 / 3, -2 / 3, 2 / 3]);
  });
  it('allows overlapping world support without claiming a global 3D certificate', () => {
    // Distinct UV triangles fold onto the same world triangle.
    const s = surface(mesh([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0]));
    expect(checkRectangularUV(s.mesh!).status).toBe('ready');
    const first = evaluateMappedSurface(s, 0.75, 0.25);
    const second = evaluateMappedSurface(s, 0.25, 0.75);
    close(first.position, second.position);
    expect(first.attachment.faceId).toBe(0);
    expect(second.attachment.faceId).toBe(1);
    expect(projectMappedSurface(s, first.position).attachment.faceId).toBe(0);
    expect(checkRectangularUV(s.mesh!).diagnostics[0].message).toMatch(/not.*global 3D/);
  });
  it('handles source-edge collinearity, source vertices, reversed paths and zero length', () => {
    const s = surface(grid(4));
    const diagonal = mappedUVPath(s, [0, 0], [1, 1]);
    expect(diagonal.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i <= 4; i++)
      expect(
        diagonal.some(
          (p) => Math.abs(p[0] - (i / 4 - 0.5)) < 1e-14 && Math.abs(p[1] - (i / 4 - 0.5)) < 1e-14
        )
      ).toBe(true);
    const reverse = mappedUVPath(s, [1, 1], [0, 0]);
    expect(reverse).toEqual([...diagonal].reverse());
    expect(mappedUVPath(s, [0.3, 0.3], [0.3, 0.3])).toEqual([
      [-0.2, -0.2, 0],
      [-0.2, -0.2, 0],
    ]);
    const boundary = mappedUVPath(s, [0, 0], [1, 0]);
    expect(boundary).toHaveLength(5);
  });
  it('rejects nonfinite/domain/triangle attachment inputs descriptively', () => {
    const s = surface();
    for (const uv of [
      [-0.01, 0],
      [1.01, 0],
      [NaN, 0],
      [Infinity, 0],
    ] as Vec2[]) {
      expect(() => evaluateMappedSurface(s, ...uv)).toThrow(/finite UV/);
      expect(() => mappedUVPath(s, uv, [0, 0])).toThrow(/finite UV/);
    }
    expect(() => projectMappedSurface(s, [NaN, 0, 0])).toThrow(/finite coordinates/);
    expect(() => mappedUVAtTriangle(s, 9, [1, 0, 0])).toThrow(/triangle/);
    expect(() => mappedUVAtTriangle(s, 0, [0.4, 0.4, 0.4])).toThrow(/barycentric/);
    expect(() => evaluateSurface(s, 1, 0, 0)).toThrow(/patch 0/);
  });
  it('keeps rational non-dyadic diagonal sweeps in span, monotone, and equal to their flat chord', () => {
    let checked = 0;
    for (const n of [3, 6, 7]) {
      const s = surface(grid(n)),
        denominator = n * 3;
      for (let offset = -n + 1; offset < n; offset++) {
        const first = Math.max(0, offset * 3),
          last = Math.min(denominator, denominator + offset * 3);
        for (let i = first; i < last; i++)
          for (let j = i + 1; j <= last; j++) {
            const a: Vec2 = [i / denominator, (i - offset * 3) / denominator];
            const b: Vec2 = [j / denominator, (j - offset * 3) / denominator];
            for (const [start, finish] of [
              [a, b],
              [b, a],
            ] as [Vec2, Vec2][]) {
              const path = mappedUVPath(s, start, finish),
                dx = finish[0] - start[0],
                dy = finish[1] - start[1],
                squared = dx * dx + dy * dy;
              let previous = -1e-12;
              for (const point of path) {
                const t =
                  ((point[0] + 0.5 - start[0]) * dx + (point[1] + 0.5 - start[1]) * dy) / squared;
                expect(t).toBeGreaterThanOrEqual(-1e-12);
                expect(t).toBeLessThanOrEqual(1 + 1e-12);
                expect(t).toBeGreaterThanOrEqual(previous - 1e-12);
                previous = t;
              }
              expect(embeddedEdgeLength(s, path[0], path[path.length - 1], path)).toBeCloseTo(
                Math.hypot(dx, dy),
                12
              );
              checked++;
            }
          }
      }
    }
    expect(checked).toBe(3846);
  });
  it('locates one-row sliver diagonal midpoints and small normal perturbations', () => {
    for (const columns of [100, 1000]) {
      const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
      for (let row = 0; row <= 1; row++)
        for (let col = 0; col <= columns; col++) {
          positions.push(col / columns - 0.5, row - 0.5, 0);
          uvs.push(col / columns, row);
        }
      for (let col = 0; col < columns; col++) {
        const a = col,
          b = col + 1,
          d = col + columns + 1,
          c = d + 1;
        indices.push(a, b, c, a, c, d);
      }
      const s = surface(mesh(positions, uvs, indices));
      expect(checkRectangularUV(s.mesh!).status).toBe('ready');
      for (let col = 0; col < columns; col++)
        for (const delta of [-1e-15, 0, 1e-15]) {
          const uv: Vec2 = [(col + 0.5) / columns + delta, 0.5 - delta / columns];
          close(evaluateMappedSurface(s, ...uv).position, [uv[0] - 0.5, uv[1] - 0.5, 0], 12);
        }
    }
  });
  it('normalizes attachment barycentrics inside 1e-8 but rejects larger errors', () => {
    const s = surface();
    close(mappedUVAtTriangle(s, 0, [0.5, 0.5 - 1e-12, 2e-12]), [0.5, 2e-12]);
    close(mappedUVAtTriangle(s, 0, [0.5, 0.5 + 1e-12, -1e-12]), [0.5, 0]);
    for (const bary of [
      [0.5, 0.5, -2e-8],
      [0.5, 0.5, 2e-8],
      [1.00000002, -0.00000002, 0],
    ] as Vec3[])
      expect(() => mappedUVAtTriangle(s, 0, bary)).toThrow(/barycentric/);
  });
  it('uses spatial indices across a larger grid and repeatable cached queries', () => {
    const s = surface(grid(80));
    expect(checkRectangularUV(s.mesh!).status).toBe('ready');
    for (let i = 0; i < 600; i++) {
      const u = ((i * 31) % 997) / 997,
        v = ((i * 97) % 991) / 991;
      close(evaluateMappedSurface(s, u, v).position, [u - 0.5, v - 0.5, 0]);
      close(projectMappedSurface(s, [u - 0.5, v - 0.5, 0.3]).position, [u - 0.5, v - 0.5, 0]);
    }
    const path = mappedUVPath(s, [0.01, 0.13], [0.97, 0.89]);
    expect(path.length).toBeGreaterThan(80);
    expect(embeddedEdgeLength(s, path[0], path[path.length - 1], path)).toBeCloseTo(
      Math.hypot(0.96, 0.76),
      11
    );
  });
});
