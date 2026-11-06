// Surface <-> program grid. Continuous grid coordinates (g0, g1) count needles and passes from the corner of
// needle 1 / pass 1: the cell of 0-based needle j and pass k has its centre at (j + 0.5, k + 0.5).
import type { KnitSettings, SurfaceSpec, SwatchEntry, Vec2, Vec3 } from '../core/types';
import { gaugeOf, GAUGE_REFERENCE, type Gauge } from './gauge';
import { MAX_SIDE } from './grid';

export interface KnitMapping {
  needles: number;
  passes: number;
  /** Method label for reports. */
  method: string;
  toGrid(p: Vec3): Vec2;
  toSurface(g: Vec2): Vec3;
}

/** Surfaces with a knit program in this version. */
export const knitSupported = (surface: SurfaceSpec) => surface.kind === 'plane';

/** Plane: needles along +x, passes along +y; pass 1 starts at the edge y = -size/2. */
export function planeMapping(surface: SurfaceSpec, needles: number, passes: number): KnitMapping {
  if (surface.kind !== 'plane') throw new Error('The plane mapping needs a plane surface.');
  const s = surface.size,
    h = s / 2;
  return {
    needles,
    passes,
    method: 'plane-axis-aligned-v1: needles along x, passes along y, pass 1 at y = -size/2',
    toGrid: (p) => [((p[0] + h) / s) * needles, ((p[1] + h) / s) * passes],
    toSurface: (g) => [(g[0] / needles) * s - h, (g[1] / passes) * s - h, 0],
  };
}

export type ProgramSize =
  | { ok: true; needles: number; passes: number; source: 'gauge' | 'typed'; gauge: Gauge | null }
  | { ok: false; reason: string };

/** Needles x passes for the plane: the jersey swatch over the surface size, or the typed size. */
export function programSize(
  surface: SurfaceSpec,
  settings: KnitSettings,
  swatches: readonly SwatchEntry[]
): ProgramSize {
  const gauge = gaugeOf(GAUGE_REFERENCE, swatches);
  if (settings.size.source === 'typed')
    return {
      ok: true,
      needles: settings.size.needles,
      passes: settings.size.passes,
      source: 'typed',
      gauge,
    };
  if (!gauge || gauge.assumed)
    return {
      ok: false,
      reason:
        'No jersey measurement. Add one to the measurement table, or type the needles and passes.',
    };
  const needles = Math.round(surface.size / gauge.stitchWidth),
    passes = Math.round(surface.size / gauge.courseHeight);
  if (needles < 1 || passes < 1)
    return { ok: false, reason: 'The surface is smaller than one measured stitch.' };
  if (needles > MAX_SIDE || passes > MAX_SIDE)
    return {
      ok: false,
      reason: `The measured gauge gives ${needles} × ${passes}; Knit Grammar opens at most ${MAX_SIDE} × ${MAX_SIDE}. Use a smaller surface or type the size.`,
    };
  return { ok: true, needles, passes, source: 'gauge', gauge };
}
