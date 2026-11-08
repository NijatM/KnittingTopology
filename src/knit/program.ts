// Knit program from the accepted network: size -> mapping -> structures per loop -> operations -> automatic
// transfers -> checks. Derived data; nothing here is stored in the project.
import type { GenerationContext, KnitSettings, ProjectState, SwatchEntry } from '../core/types';
import { defaultFill, settingsKey, type Key } from './keys';
import { isTwoLayer, tileOp } from './structures';
import {
  knitAvailable,
  knitSupported,
  planeMapping,
  programSize,
  type KnitMapping,
} from './mapping';
import { rasterizeNetwork, type Raster } from './rasterize';
import { insertTransfers, type SkippedTransfer, type TransferChange } from './transfers';
import { runChecks, type Finding } from './checks';
import { gaugeOf, type Gauge } from './gauge';
import { needleOf, passOf } from './grid';
import { defaultKnitSettings } from './settings';
import type { ShapeResult } from './shape-types';
import { buildShapeProgram } from './shape-program';
import { buildTypedSurfaceProgram } from './typed-program';
import { buildPatchedProgram, type PatchBuild } from './patches';
import { runProgramSequence, type SequenceRun } from './sequence';

export interface StructureUse {
  id: string;
  name: string;
  loops: number;
  gauge: Gauge | null;
}

export interface KnitProgram {
  w: number;
  h: number;
  key: Key;
  /** Op indices, image order (row 0 = last pass). */
  cells: Uint8Array;
  firstDir: 1 | -1;
  settings: KnitSettings;
  sizeSource: 'gauge' | 'typed';
  /** Reference fill measurement (or flagged jersey fallback) behind a gauge-derived layout. */
  sizeGauge: Gauge | null;
  mapping: KnitMapping;
  raster: Raster;
  transfers: TransferChange[];
  skippedTransfers: SkippedTransfer[];
  findings: Finding[];
  structures: StructureUse[];
  issues: string[];
  /** The network was generated from inputs that differ from the current ones. */
  staleNetwork: boolean;
  /** Required shaping or operation failures. Reports/preview remain available. */
  exportBlockers: string[];
  shape?: ShapeResult;
  /** Computational patches: every piece's build and the seams; this program is piece `patches.piece`. */
  patches?: PatchBuild;
  /** The operation sequence, executed symbolically; its blocking steps are in `exportBlockers`. */
  sequence?: SequenceRun;
  /** Network-only fills cells without reference-surface loops. */
  rectification?: { addedCells: number; maxAddedPasses: number; maxAddedCourseLengthM: number };
}

export type KnitBuild = { ok: true; program: KnitProgram } | { ok: false; reason: string };

export const knitSettingsOf = (p: Pick<ProjectState, 'knit'>): KnitSettings =>
  p.knit ?? defaultKnitSettings();
export const swatchesOf = (p: Pick<ProjectState, 'swatches'>): SwatchEntry[] => p.swatches ?? [];

export function buildKnitProgram(
  project: Pick<ProjectState, 'surface' | 'graph' | 'knit' | 'swatches'>,
  staleNetwork = false,
  context?: GenerationContext
): KnitBuild {
  const settings = knitSettingsOf(project),
    swatches = swatchesOf(project);
  if (!knitAvailable(project.surface))
    return {
      ok: false,
      reason:
        'Knit programs need a plane, saddle, supplied rectangular OBJ chart, a cube opened by a crease cut, or a sphere opened from pole to pole.',
    };
  if (
    (project.surface.kind === 'cube' || project.surface.kind === 'sphere') &&
    settings.mode === 'network' &&
    settings.size.source !== 'gauge'
  )
    return {
      ok: false,
      reason:
        project.surface.kind === 'cube'
          ? 'On a cube, the flat net is sized from your measurements; typed sizes are not used.'
          : 'On a sphere, the layout is sized from your measurements; typed sizes are not used.',
    };
  if (settings.patches && settings.mode === 'shape' && knitSupported(project.surface))
    return buildPatchedProgram(project, settings, swatches, context);
  if (settings.patches)
    return {
      ok: false,
      reason:
        'Computational patches apply to shape mode on open surfaces. Remove the splits or choose shape mode.',
    };
  if (settings.mode === 'shape') return buildShapeProgram(project, settings, swatches, context);
  if (!project.graph) return { ok: false, reason: 'Generate a network first.' };
  if (project.graph.provenance.surfaceRevision !== project.surface.revision)
    return {
      ok: false,
      reason: 'The network belongs to another surface revision. Regenerate it first.',
    };
  if (settings.mode === 'both' || settings.size.source === 'gauge') {
    if (settings.mode === 'network' && !gaugeOf('jersey', swatches))
      return {
        ok: false,
        reason:
          'No jersey measurement. Add one to the measurement table, or type the needles and passes.',
      };
    const result = buildShapeProgram(project, settings, swatches, context);
    if (result.ok) result.program.staleNetwork = staleNetwork;
    return result;
  }
  if (project.surface.kind !== 'plane' || (settings.startEdge && settings.startEdge !== 'v0'))
    return buildTypedSurfaceProgram(project, settings, swatches, staleNetwork, context);
  const size = programSize(project.surface, settings, swatches);
  if (!size.ok) return { ok: false, reason: size.reason };
  const key = settingsKey(settings);
  const mapping = planeMapping(project.surface, size.needles, size.passes);
  const raster = rasterizeNetwork(project.graph, project.surface, mapping, settings, key);
  const { w, h } = raster,
    issues = [...raster.issues];

  const opIndex = new Map(key.ops.map((o, i) => [o.id, i]));
  const fallback = defaultFill(key);
  const missingOps = new Set<string>();
  let cells: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < cells.length; i++) {
    const id = tileOp(raster.structures[raster.structure[i]!]!, needleOf(w, i), passOf(w, h, i));
    const op = opIndex.get(id);
    if (op === undefined) missingOps.add(id);
    cells[i] = op ?? fallback;
  }
  if (missingOps.size)
    issues.push(`Operations not in the key: ${[...missingOps].join(', ')}; written as the fill.`);

  let transfers: TransferChange[] = [],
    skippedTransfers: SkippedTransfer[] = [];
  if (settings.autoTransfers) {
    const layered = raster.structures.map((s) => isTwoLayer(s, key));
    const result = insertTransfers(w, h, cells, key, (i) => layered[raster.structure[i]!]!);
    cells = result.cells;
    transfers = result.changes;
    skippedTransfers = result.skipped;
  }

  const counts = new Uint32Array(raster.structures.length);
  for (const s of raster.structure) counts[s]!++;
  const structures = raster.structures
    .map((s, i) => ({ id: s.id, name: s.name, loops: counts[i]!, gauge: gaugeOf(s.id, swatches) }))
    .filter((s) => s.loops > 0);

  const firstDir = settings.lab.firstPass === 'left-to-right' ? 1 : -1,
    sequence = runProgramSequence({ w, h, cells, key, firstDir });
  return {
    ok: true,
    program: {
      w,
      h,
      key,
      cells,
      firstDir,
      settings,
      sizeSource: size.source,
      sizeGauge: size.gauge,
      mapping,
      raster,
      transfers,
      skippedTransfers,
      findings: runChecks({ w, h, cells, key }, settings.limits),
      structures,
      issues,
      staleNetwork,
      exportBlockers: sequence.blockers,
      sequence,
    },
  };
}
