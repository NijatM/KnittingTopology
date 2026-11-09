import type { SurfaceSpec, Vec2, Vec3 } from './types';

/** Analytic retained spherical shell; lengths in meters, angles in radians. */
export function sphereDomain(s: SurfaceSpec) {
  if (s.kind !== 'sphere') throw new Error('Sphere domain requires a sphere.');
  const radius = s.size / 2,
    openingDiameter = s.poleOpeningDiameter ?? 0,
    fraction = s.sphereFraction ?? 1;
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(openingDiameter) ||
    openingDiameter < 0 ||
    openingDiameter >= s.size
  )
    throw new Error(
      'Sphere polar opening diameter must be finite, nonnegative and smaller than the sphere diameter.'
    );
  if (!Number.isFinite(fraction) || fraction < 0.01 || fraction > 1)
    throw new Error('Sphere angular coverage fraction must be finite and between 0.01 and 1.');
  const longitudeSpan = 2 * Math.PI * fraction,
    thetaMin = Math.asin(openingDiameter / s.size),
    thetaMax = Math.PI - thetaMin,
    thetaSpan = thetaMax - thetaMin,
    partial = fraction < 1,
    opened = openingDiameter > 0;
  // Conservative resolution floor relative to the graph weld (1e-11) and cell-area (1e-13) tolerances.
  if (
    (opened && openingDiameter / s.size < 1e-7) ||
    (partial && 2 * Math.PI - longitudeSpan < 1e-7) ||
    thetaSpan < 1e-6
  )
    throw new Error(
      'Sphere opening, angular gap or retained band is numerically unresolved; increase its separation from the full-sphere or collapsed-band limit.'
    );
  const zMax = radius * Math.cos(thetaMin);
  return {
    radius,
    openingDiameter,
    fraction,
    longitudeSpan,
    thetaMin,
    thetaMax,
    thetaSpan,
    zMax,
    meridianLength: radius * thetaSpan,
    area: 2 * radius * zMax * longitudeSpan,
    partial,
    opened,
    modified: partial || opened,
  };
}
export function isModifiedSphere(s: SurfaceSpec): boolean {
  return (
    s.kind === 'sphere' && ((s.poleOpeningDiameter ?? 0) !== 0 || (s.sphereFraction ?? 1) !== 1)
  );
}
export function surfacePatchCount(s: SurfaceSpec): number {
  return isModifiedSphere(s) ? 4 : s.kind === 'sphere' || s.kind === 'cube' ? 6 : 1;
}
export function sphereDomainPoint(s: SurfaceSpec, u: number, v: number): Vec3 {
  const d = sphereDomain(s);
  if (
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    v < 0 ||
    v > 1 ||
    (d.partial && (u < 0 || u > 1))
  )
    throw new Error(
      'Sphere domain requires normalized latitude and finite azimuth (normalized on partial sectors).'
    );
  const theta = d.thetaMax - v * d.thetaSpan,
    radial = d.radius * Math.sin(theta),
    phi = u * d.longitudeSpan;
  return [radial * Math.cos(phi), radial * Math.sin(phi), d.radius * Math.cos(theta)];
}
/** Radial projection with clamping to the retained latitude and nearest natural meridian. */
export function sphereDomainUV(s: SurfaceSpec, p: Vec3): Vec2 {
  const d = sphereDomain(s),
    length = Math.hypot(...p);
  if (!p.every(Number.isFinite) || length < s.size * 1e-14)
    throw new Error('Cannot project nonfinite coordinates or the sphere center.');
  let phi = Math.atan2(p[1], p[0]);
  if (phi < 0) phi += 2 * Math.PI;
  if (Math.hypot(p[0], p[1]) < length * 1e-14) phi = 0;
  if (d.partial && phi > d.longitudeSpan)
    phi = phi - d.longitudeSpan < 2 * Math.PI - phi ? d.longitudeSpan : 0;
  const theta = Math.acos(Math.max(-1, Math.min(1, p[2] / length)));
  return [phi / d.longitudeSpan, Math.max(0, Math.min(1, (d.thetaMax - theta) / d.thetaSpan))];
}
/** Local affine azimuth/colatitude construction, used only for nonzero polar openings.
 * Full-revolution seams unwrap the short chart branch; partial sectors never wrap. */
export function sphereDomainBlend(s: SurfaceSpec, points: Vec3[], weights: number[]): Vec3 {
  const d = sphereDomain(s),
    uv = points.map((p) => sphereDomainUV(s, p)),
    anchor = uv[0]![0];
  let u = 0,
    v = 0;
  uv.forEach((p, i) => {
    let a = p[0];
    if (!d.partial) {
      while (a - anchor > 0.5) a -= 1;
      while (a - anchor < -0.5) a += 1;
    }
    u += a * weights[i]!;
    v += p[1] * weights[i]!;
  });
  return sphereDomainPoint(
    s,
    Math.max(d.partial ? 0 : -Infinity, Math.min(d.partial ? 1 : Infinity, u)),
    Math.max(0, Math.min(1, v))
  );
}
