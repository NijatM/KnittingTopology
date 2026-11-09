import type { SurfaceSpec } from '../core/types';

/** A full angular revolution needs a longitudinal seam, including an opened polar band. */
export function requiresKnitCut(surface: Pick<SurfaceSpec, 'kind' | 'sphereFraction'>): boolean {
  return (
    surface.kind === 'cube' || (surface.kind === 'sphere' && (surface.sphereFraction ?? 1) === 1)
  );
}
export function isSphereSector(surface: Pick<SurfaceSpec, 'kind' | 'sphereFraction'>): boolean {
  return surface.kind === 'sphere' && (surface.sphereFraction ?? 1) < 1;
}
