import type { SurfaceAttachment, SurfaceMesh, SurfaceSpec, Vec3 } from './types';
import {
  isModifiedSphere,
  sphereDomain,
  sphereDomainPoint,
  sphereDomainUV,
  surfacePatchCount,
} from './sphere-domain';
import { clamp, dot, finite3, lerp, mul, norm, unit } from './math';
import { importedMeshSize, validateImportedMesh } from '../import/mesh';
import {
  evaluateMappedSurface,
  hasRectangularMapping,
  mappedDisplayUVs,
  mappedNormal,
  mappedResidual,
  mappedSurfaceArea,
  mappedUVPath,
  projectMappedSurface,
  requireRectangularUV,
} from '../import/uv-mapping';

// Immutable scientific mesh inputs are checked once, rather than cloned on every query.
const validatedMeshes = new WeakMap<NonNullable<SurfaceSpec['mesh']>, number>();

export function validateSurface(s: SurfaceSpec): void {
  if (!s || !['plane', 'cube', 'sphere', 'saddle', 'mesh'].includes(s.kind))
    throw new Error('Unsupported surface kind.');
  if (!Number.isFinite(s.size) || s.size < 1e-6 || s.size > 1000)
    throw new Error('Surface size must be between 0.000001 and 1000 meters.');
  if (!Number.isFinite(s.curvature) || Math.abs(s.curvature) > 2)
    throw new Error('Saddle curvature must be finite and between -2 and 2.');
  if (typeof s.revision !== 'string' || s.revision.length === 0)
    throw new Error('Surface revision is required.');
  if (s.kind === 'sphere') sphereDomain(s);
  else if (s.poleOpeningDiameter !== undefined || s.sphereFraction !== undefined)
    throw new Error('Polar opening and angular coverage parameters are sphere-only.');
  if (s.kind === 'mesh') {
    if (!s.mesh) throw new Error('Imported surface requires mesh data.');
    let size = validatedMeshes.get(s.mesh);
    if (size === undefined) {
      const mesh = validateImportedMesh(s.mesh);
      size = importedMeshSize(mesh);
      validatedMeshes.set(s.mesh, size);
    }
    if (Math.abs(size - s.size) > s.size * 1e-10)
      throw new Error('Imported surface size must match its recorded mesh extent.');
    if (s.curvature !== 0) throw new Error('Imported surfaces have no analytic curvature setting.');
    if (s.mapping !== undefined) {
      if (s.mapping !== 'rectangular-obj-uv-v1') throw new Error('Unsupported imported mapping.');
      requireRectangularUV(s.mesh);
    }
  } else if (s.mesh !== undefined || s.mapping !== undefined) {
    throw new Error('Analytic surfaces cannot contain imported mesh data or mapping flags.');
  }
}
function requireAnalyticSurface(s: SurfaceSpec): void {
  if (s.kind !== 'mesh' && s.mapping !== undefined)
    throw new Error('Analytic surfaces cannot contain mapping flags.');
  if (s.kind === 'mesh')
    throw new Error(
      'Imported surfaces support inspection only; a verified surface mapping is required for generation and analytic projection.'
    );
}
/** Right-handed cube atlas, normalized UV [0,1]^2, all six charts outward. */
export function cubeCoordinates(patch: number, u: number, v: number): Vec3 {
  const a = 2 * u - 1,
    b = 2 * v - 1;
  switch (patch) {
    case 0:
      return [1, a, b];
    case 1:
      return [-1, -a, b];
    case 2:
      return [-a, 1, b];
    case 3:
      return [a, -1, b];
    case 4:
      return [a, b, 1];
    case 5:
      return [a, -b, -1];
    default:
      throw new Error('Cube/sphere patch must be an integer from 0 to 5.');
  }
}
export function evaluateSurface(s: SurfaceSpec, patch: number, u: number, v: number): Vec3 {
  validateSurface(s);
  if (hasRectangularMapping(s)) {
    if (patch !== 0) throw new Error('Supplied rectangular mappings have only patch 0.');
    return evaluateMappedSurface(s, u, v).position;
  }
  requireAnalyticSurface(s);
  if (
    !Number.isInteger(patch) ||
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    u < 0 ||
    u > 1 ||
    v < 0 ||
    v > 1
  )
    throw new Error('Surface coordinates require finite UV in [0,1] and an integer patch.');
  const h = s.size / 2;
  if (s.kind === 'plane' || s.kind === 'saddle') {
    if (patch !== 0) throw new Error('Plane and saddle have only patch 0.');
    const x = (u - 0.5) * s.size,
      y = (v - 0.5) * s.size;
    return [x, y, s.kind === 'saddle' ? (s.curvature * (x * x - y * y)) / s.size : 0];
  }
  if (isModifiedSphere(s)) {
    if (patch < 0 || patch >= 4)
      throw new Error('Modified sphere patch must be an integer from 0 to 3.');
    return sphereDomainPoint(s, (patch + u) / 4, v);
  }
  const c = cubeCoordinates(patch, u, v);
  return mul(s.kind === 'sphere' ? unit(c) : c, h);
}
export function projectToSurface(
  s: SurfaceSpec,
  p: Vec3,
  preferredPatch?: number
): { position: Vec3; attachment: SurfaceAttachment } {
  validateSurface(s);
  if (hasRectangularMapping(s)) {
    if (preferredPatch !== undefined && preferredPatch !== 0)
      throw new Error('Supplied rectangular mappings have only patch 0.');
    return projectMappedSurface(s, p);
  }
  requireAnalyticSurface(s);
  if (!finite3(p)) throw new Error('Projection requires three finite coordinates.');
  if (isModifiedSphere(s)) {
    const [globalU, v] = sphereDomainUV(s, p);
    const d = sphereDomain(s);
    let scaled = globalU * 4;
    if (!d.partial && preferredPatch === 3 && scaled < 1e-9) scaled = 4;
    const preferred =
      preferredPatch !== undefined &&
      Number.isInteger(preferredPatch) &&
      preferredPatch >= 0 &&
      preferredPatch < 4 &&
      scaled >= preferredPatch - 1e-9 &&
      scaled <= preferredPatch + 1 + 1e-9;
    const patch = preferred ? preferredPatch! : Math.min(3, Math.floor(scaled));
    const u = clamp(scaled - patch, 0, 1);
    return {
      position: evaluateSurface(s, patch, u, v),
      attachment: { surfaceRevision: s.revision, patch, uv: [u, v] },
    };
  }
  let patch = 0,
    u = 0.5,
    v = 0.5;
  if (s.kind === 'plane' || s.kind === 'saddle') {
    u = clamp(p[0] / s.size + 0.5, 0, 1);
    v = clamp(p[1] / s.size + 0.5, 0, 1);
  } else {
    if (norm(p) < s.size * 1e-14)
      throw new Error('Cannot project the center onto a cube or sphere.');
    const m = Math.max(...p.map(Math.abs)),
      c = mul(p, 1 / m);
    const valid =
      preferredPatch !== undefined &&
      Number.isInteger(preferredPatch) &&
      preferredPatch >= 0 &&
      preferredPatch < 6 &&
      Math.abs(dot(c, cubeCoordinates(preferredPatch, 0.5, 0.5)) - 1) < 1e-9;
    patch = valid
      ? preferredPatch!
      : Math.abs(c[0]) >= 1 - 1e-12
        ? c[0] > 0
          ? 0
          : 1
        : Math.abs(c[1]) >= 1 - 1e-12
          ? c[1] > 0
            ? 2
            : 3
          : c[2] > 0
            ? 4
            : 5;
    switch (patch) {
      case 0:
        u = (c[1] + 1) / 2;
        v = (c[2] + 1) / 2;
        break;
      case 1:
        u = (1 - c[1]) / 2;
        v = (c[2] + 1) / 2;
        break;
      case 2:
        u = (1 - c[0]) / 2;
        v = (c[2] + 1) / 2;
        break;
      case 3:
        u = (c[0] + 1) / 2;
        v = (c[2] + 1) / 2;
        break;
      case 4:
        u = (c[0] + 1) / 2;
        v = (c[1] + 1) / 2;
        break;
      case 5:
        u = (c[0] + 1) / 2;
        v = (1 - c[1]) / 2;
    }
  }
  u = clamp(u, 0, 1);
  v = clamp(v, 0, 1);
  return {
    position: evaluateSurface(s, patch, u, v),
    attachment: { surfaceRevision: s.revision, patch, uv: [u, v] },
  };
}
export function surfaceNormal(s: SurfaceSpec, p: Vec3, patch?: number): Vec3 {
  if (hasRectangularMapping(s)) {
    validateSurface(s);
    if (patch !== undefined && patch !== 0)
      throw new Error('Supplied rectangular mappings have only patch 0.');
    return mappedNormal(s, p);
  }
  requireAnalyticSurface(s);
  if (s.kind === 'sphere') return unit(p);
  if (s.kind === 'cube')
    return cubeCoordinates(patch ?? projectToSurface(s, p).attachment.patch, 0.5, 0.5);
  return s.kind === 'saddle'
    ? unit([(-2 * s.curvature * p[0]) / s.size, (2 * s.curvature * p[1]) / s.size, 1])
    : [0, 0, 1];
}
/** Analytic membership residual, meters. Cube and sphere use the centered implicit surface. */
export function surfaceResidual(s: SurfaceSpec, p: Vec3): number {
  if (hasRectangularMapping(s)) {
    validateSurface(s);
    return mappedResidual(s, p);
  }
  requireAnalyticSurface(s);
  if (isModifiedSphere(s)) {
    const [u, v] = sphereDomainUV(s, p),
      q = sphereDomainPoint(s, u, v);
    return norm([p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
  }
  if (s.kind === 'sphere') return Math.abs(norm(p) - s.size / 2);
  if (s.kind === 'cube') return Math.abs(Math.max(...p.map(Math.abs)) - s.size / 2);
  const z = s.kind === 'saddle' ? (s.curvature * (p[0] * p[0] - p[1] * p[1])) / s.size : 0;
  return Math.max(
    Math.abs(p[2] - z),
    Math.max(0, Math.abs(p[0]) - s.size / 2),
    Math.max(0, Math.abs(p[1]) - s.size / 2)
  );
}
export function analyticSurfaceArea(s: SurfaceSpec): number {
  if (hasRectangularMapping(s)) {
    validateSurface(s);
    return mappedSurfaceArea(s);
  }
  requireAnalyticSurface(s);
  if (isModifiedSphere(s)) return sphereDomain(s).area;
  if (s.kind === 'sphere') return Math.PI * s.size * s.size;
  if (s.kind === 'cube') return 6 * s.size * s.size;
  if (s.kind === 'plane') return s.size * s.size;
  // Composite midpoint integral; saddle area is explicitly numerical, 128×128 cells.
  let a = 0;
  const n = 128;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n - 0.5) * s.size,
        y = ((j + 0.5) / n - 0.5) * s.size;
      a += Math.sqrt(1 + (4 * s.curvature * s.curvature * (x * x + y * y)) / (s.size * s.size));
    }
  return (a * s.size * s.size) / (n * n);
}
/** Legacy spheres use great-circle length. Modified spheres integrate their admissible
 * affine azimuth/colatitude project path (not a shortest-geodesic claim). */
export function embeddedEdgeLength(s: SurfaceSpec, a: Vec3, b: Vec3, path?: Vec3[]): number {
  if (hasRectangularMapping(s)) {
    validateSurface(s);
    const pts = path ?? surfacePath(s, a, b);
    let length = 0;
    for (let i = 1; i < pts.length; i++)
      length += norm([
        pts[i][0] - pts[i - 1][0],
        pts[i][1] - pts[i - 1][1],
        pts[i][2] - pts[i - 1][2],
      ]);
    return length;
  }
  requireAnalyticSurface(s);
  if (isModifiedSphere(s)) {
    const pts = path ?? surfacePath(s, a, b),
      d = sphereDomain(s);
    let length = 0;
    for (let i = 1; i < pts.length; i++) {
      const x = sphereDomainUV(s, pts[i - 1]!),
        y = sphereDomainUV(s, pts[i]!);
      if (!d.opened) {
        if (Math.hypot(pts[i - 1]![0], pts[i - 1]![1]) < s.size * 1e-12) x[0] = y[0];
        if (Math.hypot(pts[i]![0], pts[i]![1]) < s.size * 1e-12) y[0] = x[0];
      }
      let du = y[0] - x[0];
      if (!d.partial) {
        if (du > 0.5) du -= 1;
        if (du < -0.5) du += 1;
      }
      const dt = (y[1] - x[1]) * d.thetaSpan,
        dp = du * d.longitudeSpan;
      // Composite midpoint quadrature of the affine chart path metric, never a geodesic claim.
      for (let k = 0; k < 16; k++) {
        const theta = d.thetaMax - (x[1] + ((y[1] - x[1]) * (k + 0.5)) / 16) * d.thetaSpan;
        length += (d.radius * Math.hypot(dt, Math.sin(theta) * dp)) / 16;
      }
    }
    return length;
  }
  if (s.kind === 'sphere') {
    const pts = path ?? [a, b];
    let length = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!,
        q = pts[i]!;
      length +=
        (s.size / 2) *
        Math.atan2(
          norm([p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]),
          dot(p, q)
        );
    }
    return length;
  }
  const pts = path ?? [a, b];
  let d = 0;
  for (let i = 1; i < pts.length; i++)
    d += norm([
      pts[i]![0] - pts[i - 1]![0],
      pts[i]![1] - pts[i - 1]![1],
      pts[i]![2] - pts[i - 1]![2],
    ]);
  return d;
}
/** Legacy projected-chord path; modified spheres use an admissible affine domain path.
 * Display samples approximate the curved path; latitude rims remain small circles. */
export function surfacePath(s: SurfaceSpec, a: Vec3, b: Vec3): Vec3[] {
  if (hasRectangularMapping(s)) {
    validateSurface(s);
    return mappedUVPath(
      s,
      projectMappedSurface(s, a).attachment.uv,
      projectMappedSurface(s, b).attachment.uv
    );
  }
  requireAnalyticSurface(s);
  if (isModifiedSphere(s)) {
    const d = sphereDomain(s),
      x = sphereDomainUV(s, a),
      y = sphereDomainUV(s, b);
    if (!d.partial) {
      if (y[0] - x[0] > 0.5) y[0] -= 1;
      if (y[0] - x[0] < -0.5) y[0] += 1;
    }
    if (!d.opened) {
      if (Math.hypot(a[0], a[1]) < s.size * 1e-12) x[0] = y[0];
      if (Math.hypot(b[0], b[1]) < s.size * 1e-12) y[0] = x[0];
    }
    const n = Math.max(8, Math.ceil(Math.abs(y[0] - x[0]) * d.longitudeSpan * 16));
    return Array.from({ length: n + 1 }, (_, i) =>
      i === 0
        ? a
        : i === n
          ? b
          : sphereDomainPoint(s, x[0] + ((y[0] - x[0]) * i) / n, x[1] + ((y[1] - x[1]) * i) / n)
    );
  }
  if (s.kind === 'plane') return [a, b];
  if (s.kind === 'cube') {
    const ts = [0, 1];
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        for (const sign of [-1, 1]) {
          const d = b[i]! - a[i]! - sign * (b[j]! - a[j]!);
          if (Math.abs(d) > 1e-15) {
            const t = (sign * a[j]! - a[i]!) / d;
            if (t > 1e-12 && t < 1 - 1e-12) ts.push(t);
          }
        }
    return [...new Set(ts)]
      .sort((x, y) => x - y)
      .map((t) => projectToSurface(s, lerp(a, b, t)).position);
  }
  return Array.from({ length: 9 }, (_, i) =>
    i === 0 ? a : i === 8 ? b : projectToSurface(s, lerp(a, b, i / 8)).position
  );
}
export function buildSurfaceMesh(s: SurfaceSpec, resolution = 24): SurfaceMesh {
  validateSurface(s);
  if (s.kind === 'mesh') {
    return {
      positions: s.mesh!.positions,
      indices: s.mesh!.indices,
      trianglePatches: new Array(s.mesh!.indices.length / 3).fill(0),
      // Unselected imports retain display placeholders; selected charts use normalized UV.
      uvs: hasRectangularMapping(s)
        ? mappedDisplayUVs(s)
        : new Array((s.mesh!.positions.length / 3) * 2).fill(0),
    };
  }
  if (!Number.isInteger(resolution) || resolution < 1 || resolution > 256)
    throw new Error('Surface mesh resolution must be an integer from 1 to 256.');
  const out: SurfaceMesh = { positions: [], indices: [], trianglePatches: [], uvs: [] },
    // Pole fans need an interior latitude row even at the lowest requested resolution.
    n = isModifiedSphere(s) && !sphereDomain(s).opened ? Math.max(2, resolution) : resolution;
  for (let p = 0; p < surfacePatchCount(s); p++) {
    const offset = out.positions.length / 3;
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        out.positions.push(...evaluateSurface(s, p, i / n, j / n));
        out.uvs.push(i / n, j / n);
      }
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = offset + j * (n + 1) + i,
          b = a + 1,
          d = a + n + 1,
          c = d + 1;
        // A retained pole has one triangle per angular cell, without collapsed pole faces.
        if (!(isModifiedSphere(s) && !sphereDomain(s).opened && j === 0)) {
          out.indices.push(a, b, c);
          out.trianglePatches.push(p);
        }
        if (!(isModifiedSphere(s) && !sphereDomain(s).opened && j === n - 1)) {
          out.indices.push(a, c, d);
          out.trianglePatches.push(p);
        }
      }
  }
  return out;
}
