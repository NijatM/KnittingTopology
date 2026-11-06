// Surface <-> program grid. Continuous grid coordinates (g0, g1) count needles and passes from the corner of
// needle 1 / pass 1: the cell of 0-based needle j and pass k has its centre at (j + 0.5, k + 0.5).
import type { KnitSettings, SurfaceSpec, SwatchEntry, Vec2, Vec3 } from '../core/types';
import { gaugeOf, GAUGE_REFERENCE, type Gauge } from './gauge';
import { MAX_SIDE } from './grid';
import { hasRectangularMapping } from '../import/uv-mapping';
import type { ShapeResult } from './shape-types';
import { evaluateSurface, projectToSurface } from '../core/surfaces';
import { originalShapeUV } from './shape-geometry';
import type { StartEdge } from './shape-types';

export interface KnitMapping {
  needles: number;
  passes: number;
  /** Method label for reports. */
  method: string;
  toGrid(p: Vec3): Vec2;
  toSurface(g: Vec2): Vec3;
}

/** Surfaces with a knit program in this version. */
export const knitSupported = (surface: SurfaceSpec) =>
  surface.kind === 'plane' || surface.kind === 'saddle' || hasRectangularMapping(surface);

/** Typed rectangular chart coordinates; no physical sizing or shaping claim. */
export function chartMapping(
  surface: SurfaceSpec,
  needles: number,
  passes: number,
  edge: StartEdge = 'v0'
): KnitMapping {
  return {
    needles,
    passes,
    method: 'typed-rectangular-chart-v1: normalized UV grid; physical shape not predicted',
    toSurface: ([x, y]) =>
      evaluateSurface(
        surface,
        0,
        ...originalShapeUV(
          Math.max(0, Math.min(1, x / needles)),
          Math.max(0, Math.min(1, y / passes)),
          edge
        )
      ),
    toGrid: (p) => {
      const [u, v] = projectToSurface(surface, p, 0).attachment.uv;
      const q =
        edge === 'v0'
          ? [u, v]
          : edge === 'u1'
            ? [v, 1 - u]
            : edge === 'v1'
              ? [1 - u, 1 - v]
              : [1 - v, u];
      return [q[0]! * needles, q[1]! * passes];
    },
  };
}

/** Loop centres on shaped programs. Holds have no surface point and return NaN coordinates. */
export function shapeMapping(shape: ShapeResult): KnitMapping {
  const { w: needles, h: passes, placements } = shape.needles;
  return {
    needles,
    passes,
    method: shape.geometry.method,
    toSurface: ([x, y]) => {
      const j = Math.floor(x),
        k = Math.floor(y);
      if (j < 0 || j >= needles || k < 0 || k >= passes) return [NaN, NaN, NaN];
      const p = shape.placementAt[(passes - 1 - k) * needles + j]!;
      return p < 0 ? [NaN, NaN, NaN] : placements[p]!.loop.position;
    },
    // Inspection-only nearest loop query. It is not a continuous surface flattening.
    toGrid: (point) => {
      let nearest = -1,
        distance = Infinity;
      placements.forEach((p, i) => {
        const q = p.loop.position;
        const d = (q[0] - point[0]) ** 2 + (q[1] - point[1]) ** 2 + (q[2] - point[2]) ** 2;
        if (d < distance) {
          distance = d;
          nearest = i;
        }
      });
      const p = placements[nearest];
      return p ? [p.needle + 0.5, p.course + 0.5] : [NaN, NaN];
    },
  };
}

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
