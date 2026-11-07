import type { GenerationContext, KnitSettings, ProjectState, SwatchEntry } from '../core/types';
import type { KnitBuild } from './program';
import { chartMapping } from './mapping';
import { settingsKey } from './keys';
import { rasterizeSurfaceNetwork } from './rasterize-surface';
import type { ShapePlacement } from './shape-types';
import { originalShapeUV } from './shape-geometry';
import { isTwoLayer, tileOp } from './structures';
import { insertTransfers } from './transfers';
import { runChecks } from './checks';
import { gaugeOf } from './gauge';

/** Unmeasured network layout on a rectangular chart. Surface coordinates are registration only. */
export function buildTypedSurfaceProgram(
  project: Pick<ProjectState, 'surface' | 'graph'>,
  settings: KnitSettings,
  swatches: readonly SwatchEntry[],
  staleNetwork: boolean,
  context?: GenerationContext
): KnitBuild {
  if (!project.graph) return { ok: false, reason: 'Generate a network first.' };
  if (settings.size.source !== 'typed')
    return { ok: false, reason: 'Enter needles and passes for a typed chart layout.' };
  const { needles: w, passes: h } = settings.size;
  if (![w, h].every((x) => Number.isInteger(x) && x >= 1 && x <= 600))
    return { ok: false, reason: 'Typed needles and passes must be 1 to 600.' };
  try {
    const mapping = chartMapping(project.surface, w, h, settings.startEdge),
      placements: ShapePlacement[] = [];
    for (let k = 0; k < h; k++)
      for (let j = 0; j < w; j++)
        placements.push({
          course: k,
          needle: j,
          role: 'loop',
          parents: [],
          loop: {
            id: `typed:${k}:${j}`,
            uv: originalShapeUV((j + 0.5) / w, (k + 0.5) / h, settings.startEdge ?? 'v0'),
            position: mapping.toSurface([j + 0.5, k + 0.5]),
            across: 0,
          },
        });
    const key = settingsKey(settings),
      raster = rasterizeSurfaceNetwork(
        project.graph,
        project.surface,
        { w, h, placements },
        settings,
        key,
        null,
        context
      );
    const ops = new Map(key.ops.map((o, i) => [o.id, i]));
    let cells: Uint8Array = new Uint8Array(w * h);
    const counts = new Uint32Array(raster.structures.length);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = ops.get(
        tileOp(raster.structures[raster.structure[i]!]!, i % w, h - 1 - Math.floor(i / w))
      )!;
      counts[raster.structure[i]!]!++;
    }
    const transfers = settings.autoTransfers
      ? insertTransfers(w, h, cells, key, (i) =>
          isTwoLayer(raster.structures[raster.structure[i]!]!, key)
        )
      : { cells, changes: [], skipped: [] };
    cells = transfers.cells;
    return {
      ok: true,
      program: {
        w,
        h,
        cells,
        key,
        settings,
        firstDir: settings.lab.firstPass === 'left-to-right' ? 1 : -1,
        sizeSource: 'typed',
        sizeGauge: null,
        mapping,
        raster,
        transfers: transfers.changes,
        skippedTransfers: transfers.skipped,
        findings: runChecks({ w, h, cells, key }, settings.limits),
        structures: raster.structures
          .map((s, i) => ({
            id: s.id,
            name: s.name,
            loops: counts[i]!,
            gauge: gaugeOf(s.id, swatches),
          }))
          .filter((s) => s.loops > 0),
        issues: [
          ...raster.issues,
          'Typed rectangular UV layout: surface registration only; no measured physical size or shape prediction.',
        ],
        staleNetwork,
        exportBlockers: [],
      },
    };
  } catch (cause) {
    if ((cause as Error).name === 'AbortError') throw cause;
    return { ok: false, reason: `Network mapping: ${(cause as Error).message}` };
  }
}
