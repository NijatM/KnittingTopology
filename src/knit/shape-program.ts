// Integration of surface geometry, a design-level needle layout and Knit Grammar operations.
import type { GenerationContext, KnitSettings, ProjectState, SwatchEntry } from '../core/types';
import type { KnitBuild } from './program';
import type { ShapeStep, ShapeResult } from './shape-types';
import { buildShapeGeometry } from './shape-geometry';
import { placeShapeNeedles } from './shape-needles';
import { BASIC, floatIndex, keyById } from './keys';
import { structuresForKey, isTwoLayer, tileOp } from './structures';
import { gaugeOf, GAUGE_REFERENCE, SPACING_RANGE } from './gauge';
import { imageIndex } from './grid';
import { shapeMapping } from './mapping';
import { insertTransfers } from './transfers';
import { runChecks } from './checks';
import { validateShapeOperations } from './shape-validate';
import { rasterizeSurfaceNetwork } from './rasterize-surface';
import type { Raster } from './rasterize';

export function buildShapeProgram(
  project: Pick<ProjectState, 'surface' | 'graph'>,
  settings: KnitSettings,
  swatches: readonly SwatchEntry[],
  context?: GenerationContext
): KnitBuild {
  const jersey = gaugeOf(GAUGE_REFERENCE, swatches),
    gauge = gaugeOf(settings.cells.fill, swatches);
  if (!jersey || jersey.assumed || !gauge)
    return {
      ok: false,
      reason:
        'Shape mode needs a measured jersey swatch. Enter your stitch width and course height in the measurement table.',
    };
  if (
    ![gauge.stitchWidth, gauge.courseHeight].every(
      (x) => Number.isFinite(x) && x >= SPACING_RANGE[0] && x <= SPACING_RANGE[1]
    )
  )
    return {
      ok: false,
      reason: 'Shape mode needs finite measured stitch dimensions in the measurement-table range.',
    };
  const key = keyById(settings.keyId) ?? BASIC;
  if (key.mode !== 1)
    return { ok: false, reason: 'Shape mode currently supports the one-guide basic key.' };
  const structure = structuresForKey(key, settings.tiles).find((s) => s.id === settings.cells.fill);
  if (!structure)
    return { ok: false, reason: 'The shape fill structure is not available with this key.' };
  try {
    const geometry = buildShapeGeometry(
      project.surface,
      gauge.stitchWidth,
      gauge.courseHeight,
      settings.startEdge ?? 'v0',
      context
    );
    context?.progress?.(0.6, 'Placing shaping loops on needles');
    const firstDir = settings.lab.firstPass === 'left-to-right' ? 1 : -1;
    const needles = placeShapeNeedles(geometry, firstDir),
      { w, h } = needles;
    const shaping = settings.mode !== 'network';
    if (settings.mode !== 'shape' && !project.graph)
      return { ok: false, reason: 'Generate a network first.' };
    const raster: Raster =
      settings.mode === 'shape'
        ? {
            w,
            h,
            structure: new Uint16Array(w * h),
            kind: new Uint8Array(w * h),
            element: new Int32Array(w * h).fill(-1),
            structures: [structure],
            cellStructure: [],
            issues: [],
          }
        : rasterizeSurfaceNetwork(
            project.graph!,
            project.surface,
            { w, h, placements: needles.placements, courses: geometry.courses },
            settings,
            key,
            gauge,
            context
          );
    const placementAt = new Int32Array(w * h).fill(-1);
    let cells: Uint8Array = new Uint8Array(w * h).fill(floatIndex(key));
    const opIndex = new Map(key.ops.map((o, i) => [o.id, i]));
    if (!shaping)
      for (let i = 0; i < cells.length; i++)
        cells[i] = opIndex.get(
          tileOp(raster.structures[raster.structure[i]!]!, i % w, h - 1 - Math.floor(i / w))
        )!;
    for (let p = 0; p < needles.placements.length; p++) {
      const x = needles.placements[p]!,
        i = imageIndex(w, h, x.needle, x.course);
      if (placementAt[i] !== -1) throw new Error('Two shape loops occupy one needle in a pass.');
      placementAt[i] = p;
      const id = tileOp(raster.structures[raster.structure[i]!]!, x.needle, x.course);
      const op = opIndex.get(id);
      if (op === undefined) throw new Error(`The shape tile uses an unavailable operation: ${id}.`);
      cells[i] = op;
      // The first course is the cast-on boundary, not a shaping increase.
      if (shaping && x.course > 0 && !x.parents.length && settings.newLoop === 'tuck') {
        const bed = key.ops[op]!.steps[0]!.bed;
        cells[i] = opIndex.get(bed === 'front' ? 'tf' : 'tb')!;
      }
    }
    const transfers = settings.autoTransfers
      ? insertTransfers(w, h, cells, key, (i) =>
          isTwoLayer(raster.structures[raster.structure[i]!]!, key)
        )
      : { cells, changes: [], skipped: [] };
    cells = transfers.cells;
    const unresolved: ShapeStep[] = shaping ? [...needles.unresolved] : [];
    for (const move of shaping ? needles.moves : []) {
      // ShapeMove pass and forPass count from one; needle indices count from zero.
      const i = imageIndex(w, h, move.needle, move.pass - 1),
        old = key.ops[cells[i]!]!;
      let reason = '';
      if (Math.abs(move.to - move.needle) !== 1) reason = 'Required transfer exceeds one needle.';
      else if (isTwoLayer(raster.structures[raster.structure[i]!]!, key))
        reason = 'Required shaping transfer conflicts with a two-layer structure.';
      else if (old.steps[0]?.action !== 'knit' || old.move !== 'none')
        reason = `Required shaping transfer conflicts with ${old.id}.`;
      const target = imageIndex(w, h, move.to, move.forPass - 1),
        targetOp = key.ops[cells[target]!]!;
      if (!reason && targetOp.steps[0]?.bed !== old.steps[0]?.bed)
        reason = 'Required sideways transfer and bed change cannot share one operation.';
      if (reason)
        unresolved.push({ pass: move.pass, needle: move.needle, role: 'transfer', reason });
      else
        cells[i] = opIndex.get(
          `${old.steps[0]!.bed === 'front' ? 'kf' : 'kb'}x${move.to < move.needle ? 'l' : 'r'}`
        )!;
    }
    context?.progress?.(0.9, 'Checking shaping connectivity and operations');
    const shape: ShapeResult = {
      geometry,
      needles: { ...needles, unresolved: shaping ? unresolved : needles.unresolved },
      placementAt,
      blockers: [],
    };
    const violations = shaping ? validateShapeOperations(shape, cells, key) : [];
    const blockers = [
      ...new Set([
        ...unresolved.map(
          (s) =>
            `Pass ${s.pass}, needle ${s.needle + 1}: ${s.reason ?? 'Unresolved required shaping step.'}`
        ),
        ...violations,
      ]),
    ];
    shape.blockers = blockers;
    const counts = new Uint32Array(raster.structures.length);
    for (let i = 0; i < cells.length; i++)
      if (!shaping || placementAt[i] !== -1) counts[raster.structure[i]!]!++;
    const uses = raster.structures
      .map((s, i) => ({
        id: s.id,
        name: s.name,
        loops: counts[i]!,
        gauge: gaugeOf(s.id, swatches),
      }))
      .filter((s) => s.loops > 0);
    const addedPerNeedle = new Uint16Array(w);
    for (let i = 0; i < placementAt.length; i++)
      if (placementAt[i] === -1) addedPerNeedle[i % w]!++;
    const maxAddedPasses = Math.max(...addedPerNeedle);
    const issues = [
      ...geometry.issues,
      ...raster.issues,
      'Structure tiles stay anchored to needle and pass indices across shaping transfers.',
      'Short-row turns add no wrap or tuck; confirm this convention with the lab.',
      'Transfer scheduling uses operations after the pass; lab timing and travel settings are recorded, not machine instructions.',
      ...(gauge.assumed
        ? ['Shape dimensions for the fill are assumed = jersey (not measured for this structure).']
        : []),
      ...(settings.mode !== 'shape'
        ? [
            'All network structures use the fill measurement for reference geometry; different structure swatches do not deform or recalibrate this layout.',
          ]
        : []),
      ...(!shaping
        ? [
            'Network-only: shaping transfers are not applied. Unused reference cells are filled; this rectangular output does not predict the target physical shape.',
          ]
        : []),
    ];
    context?.progress?.(1, 'Shape program complete');
    return {
      ok: true,
      program: {
        w,
        h,
        key,
        cells,
        firstDir,
        settings,
        sizeSource: 'gauge',
        sizeGauge: gauge,
        mapping: shapeMapping(shape),
        raster,
        transfers: transfers.changes,
        skippedTransfers: transfers.skipped,
        findings: runChecks({ w, h, cells, key }, settings.limits),
        structures: uses,
        issues,
        staleNetwork: false,
        exportBlockers: blockers,
        shape,
        ...(!shaping
          ? {
              rectification: {
                addedCells: placementAt.reduce((n, x) => n + (x === -1 ? 1 : 0), 0),
                maxAddedPasses,
                maxAddedCourseLengthM: maxAddedPasses * gauge.courseHeight,
              },
            }
          : {}),
      },
    };
  } catch (cause) {
    if ((cause as Error).name === 'AbortError') throw cause;
    return { ok: false, reason: `Shape generation: ${(cause as Error).message}` };
  }
}
