// Knit program from the accepted network: size -> mapping -> structures per loop -> operations -> automatic
// transfers -> checks. Derived data; nothing here is stored in the project.
import type { GenerationContext, KnitSettings, ProjectState, SwatchEntry } from '../core/types';
import { defaultFill, keyById, BASIC, type Key } from './keys';
import { isTwoLayer, tileOp } from './structures';
import { knitSupported, planeMapping, programSize, type KnitMapping } from './mapping';
import { rasterizeNetwork, type Raster } from './rasterize';
import { insertTransfers, type SkippedTransfer, type TransferChange } from './transfers';
import { runChecks, type Finding } from './checks';
import { gaugeOf, type Gauge } from './gauge';
import { needleOf, passOf } from './grid';
import { defaultKnitSettings } from './settings';
import type { ShapeResult } from './shape-types';
import { buildShapeProgram } from './shape-program';
import { buildTypedSurfaceProgram } from './typed-program';

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
  if (!knitSupported(project.surface))
    return {
      ok: false,
      reason: 'Knit programs need a plane, saddle or supplied rectangular OBJ chart.',
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
  const key = keyById(settings.keyId) ?? BASIC;
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

  return {
    ok: true,
    program: {
      w,
      h,
      key,
      cells,
      firstDir: settings.lab.firstPass === 'left-to-right' ? 1 : -1,
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
      exportBlockers: [],
    },
  };
}
