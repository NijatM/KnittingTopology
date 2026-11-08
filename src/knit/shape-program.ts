// Integration of surface geometry, a design-level needle layout and Knit Grammar operations.
import type {
  GenerationContext,
  KnitGraphStages,
  KnitSettings,
  ProjectState,
  SwatchEntry,
} from '../core/types';
import type { KnitBuild } from './program';
import type {
  ChartWindow,
  ShapeGeometry,
  ShapeKnitGraph,
  ShapeNeedles,
  ShapeStep,
  ShapeResult,
} from './shape-types';
import { buildCutDisk } from './cuts';
import {
  cubeNetChart,
  cubeNetFromCut,
  cubeNetSeams,
  layoutCubeNet,
  type CubeNetLayout,
} from './cube-net';
import {
  layoutSphere,
  sphereChart,
  sphereCutPath,
  sphereSeam,
  type SphereKnitLayout,
} from './sphere-knit';
import type { NetworkChart } from './rasterize-surface';
import { buildShapeGeometry } from './shape-geometry';
import { placeShapeNeedles } from './shape-needles';
import { pairShortRowTurns, TURN_PAIRING_NOTE, yarnJumpList } from './turn-pairing';
import {
  checkBlockers,
  checkKnitGraph,
  courseMethodOf,
  courseStageFingerprint,
  courseStageFromGeometry,
  freshStages,
  geometryFromStages,
  knitGraphSignature,
  loopStageFingerprint,
  loopStageFromNeedles,
  popescuSettingsOf,
  stagePoint,
} from './knit-graph';
import { popescuCourseStage, popescuLoopStage } from './popescu-rules';
import { findOp, floatIndex, meaningName, settingsKey, type Step } from './keys';
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
  context?: GenerationContext,
  /** One computational patch of an open-surface chart (§6.3.2); absent for the whole chart. */
  window?: ChartWindow
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
  const key = settingsKey(settings);
  const structure = structuresForKey(key, settings.tiles, settings.keys).find(
    (s) => s.id === settings.cells.fill
  );
  if (!structure)
    return { ok: false, reason: 'The shape fill structure is not available with this key.' };
  const method = courseMethodOf(settings);
  if (
    method === 'popescu-2019-rules' &&
    (project.surface.kind === 'cube' || project.surface.kind === 'sphere')
  )
    return {
      ok: false,
      reason:
        'The Popescu 2019 rules method works on open surfaces only. Choose the project alignment method for a cube or sphere.',
    };
  // Fresh saved stages are authoritative; stale ones never reach a build (Generate leaves them out).
  const saved = freshStages(
      { surface: project.surface, knit: settings, swatches: [...swatches] },
      window
    ),
    expected = courseStageFingerprint(project.surface, settings, gauge, window),
    graphMismatch: string[] = [];
  let stages: KnitGraphStages | undefined;
  try {
    const firstDir = settings.lab.firstPass === 'left-to-right' ? 1 : -1;
    let geometry: ShapeGeometry,
      // The courses stage is recorded before short-row turn pairing removes any loops.
      courseGeometry: ShapeGeometry | undefined,
      paired = { removed: 0, maxPerWale: 0 },
      needles: ShapeNeedles,
      closed: CubeNetLayout | undefined,
      sphere: SphereKnitLayout | undefined,
      chart: NetworkChart | undefined;
    if (project.surface.kind === 'cube') {
      // Closed cube: rebuild and recheck the saved cut, then unfold it; never trust a stored plan.
      if (!project.graph || !settings.cut)
        return {
          ok: false,
          reason: 'A cube needs a network and a validated cut first. Use 04 Cuts and seams.',
        };
      const disk = buildCutDisk(project.surface, project.graph, settings.cut, context);
      if (!disk.ok) return { ok: false, reason: `Cut: ${disk.reason}` };
      const net = cubeNetFromCut(
        project.surface,
        project.graph,
        settings.cut.edgeIds,
        settings.startEdge ?? 'v0'
      );
      context?.progress?.(0.4, 'Laying out the flat cube net');
      const built = layoutCubeNet(
        project.surface,
        net,
        gauge.stitchWidth,
        gauge.courseHeight,
        firstDir
      );
      geometry = built.geometry;
      needles = built.needles;
      closed = {
        ...built.layout,
        seams: cubeNetSeams(project.surface, project.graph, disk.plan, built.layout, needles),
      };
      if (settings.mode !== 'shape')
        chart = cubeNetChart(project.surface, project.graph, built.layout);
    } else if (project.surface.kind === 'sphere') {
      // Closed sphere: rebuild and recheck the saved cut, which must run from pole to pole.
      if (!project.graph || !settings.cut)
        return {
          ok: false,
          reason: 'A sphere needs a network and a validated cut first. Use 04 Cuts and seams.',
        };
      const start = settings.startEdge ?? 'v0';
      if (start !== 'v0' && start !== 'v1')
        return { ok: false, reason: 'On a sphere, needle 1 starts at the bottom or the top pole.' };
      const disk = buildCutDisk(project.surface, project.graph, settings.cut, context);
      if (!disk.ok) return { ok: false, reason: `Cut: ${disk.reason}` };
      const cut = sphereCutPath(project.surface, project.graph, settings.cut.edgeIds);
      context?.progress?.(0.4, 'Spreading short rows around the sphere');
      const built = layoutSphere(
        project.surface,
        cut,
        gauge.stitchWidth,
        gauge.courseHeight,
        firstDir,
        start
      );
      geometry = built.geometry;
      needles = built.needles;
      sphere = {
        ...built.layout,
        seam: sphereSeam(project.surface, project.graph, disk.plan, cut, built.layout, needles),
      };
      if (settings.mode !== 'shape')
        chart = sphereChart(project.surface, project.graph, cut, built.layout);
    } else {
      const startEdge = settings.startEdge ?? 'v0';
      if (method === 'popescu-2019-rules') {
        const options = popescuSettingsOf(settings);
        context?.progress?.(0.3, 'Connecting contours by the Popescu 2019 rules');
        const courses =
          saved?.courses ??
          popescuCourseStage(
            project.surface,
            gauge.stitchWidth,
            gauge.courseHeight,
            startEdge,
            options,
            expected,
            context,
            window
          );
        context?.progress?.(0.5, 'Dividing courses into loops');
        const loops =
          saved?.loops ??
          popescuLoopStage(
            project.surface,
            courses,
            gauge.stitchWidth,
            startEdge,
            options,
            loopStageFingerprint(courses, settings),
            context,
            window
          );
        stages = { courseMethod: method, courses, loops };
      } else stages = saved;
      let fixedParents: Map<string, string[]> | undefined;
      if (stages)
        ({ geometry, fixedParents } = geometryFromStages(
          project.surface,
          stages.courses,
          stages.loops,
          gauge.stitchWidth,
          gauge.courseHeight
        ));
      else
        geometry = buildShapeGeometry(
          project.surface,
          gauge.stitchWidth,
          gauge.courseHeight,
          startEdge,
          context,
          undefined,
          window
        );
      context?.progress?.(0.6, 'Placing shaping loops on needles');
      if (method === 'project-alignment' && !stages?.loops) {
        courseGeometry = geometry;
        ({ geometry, needles, ...paired } = pairShortRowTurns(
          project.surface,
          geometry,
          firstDir,
          context
        ));
      } else needles = placeShapeNeedles(geometry, firstDir, fixedParents);
    }
    if (!stages?.loops) {
      const courses =
        stages?.courses ?? courseStageFromGeometry(expected, courseGeometry ?? geometry);
      const loops = loopStageFromNeedles(
        loopStageFingerprint(courses, settings),
        geometry,
        needles
      );
      // Paired turns shorten courses; the loops stage keeps the courses as knitted.
      if (paired.removed)
        loops.rows = geometry.courses.map((c) => ({
          vertices: [],
          points: c.points.map(stagePoint),
          leftBoundary: c.leftBoundary,
          rightBoundary: c.rightBoundary,
        }));
      const computed: KnitGraphStages = { courseMethod: method, courses, loops };
      // A cube or sphere is rebuilt from its cut and must reproduce any saved stages exactly.
      if (
        (closed || sphere) &&
        saved &&
        knitGraphSignature(saved) !==
          knitGraphSignature(saved.loops ? computed : { ...computed, loops: undefined })
      ) {
        graphMismatch.push(
          'Knit graph: the rebuilt layout differs from the saved stages, which are kept. Discard the saved stages to use the rebuilt layout.'
        );
        stages = saved;
      } else stages = computed;
    }
    const { w, h } = needles;
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
            context,
            chart
          );
    const placementAt = new Int32Array(w * h).fill(-1),
      newLoopGaps: ShapeStep[] = [];
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
      // The first course is the cast-on boundary, not a shaping increase. A new loop is tucked with the same
      // guides and beds as the stitch it replaces.
      if (shaping && x.course > 0 && !x.parents.length && settings.newLoop === 'tuck') {
        const steps = key.ops[op]!.steps.map((s): Step =>
          s.action === 'knit' ? { ...s, action: 'tuck' } : s
        );
        const tuck = findOp(key, steps);
        if (tuck >= 0) cells[i] = tuck;
        else
          newLoopGaps.push({
            pass: x.course + 1,
            needle: x.needle,
            role: 'increase',
            reason: `The key has no ${meaningName(steps, 'none')} operation for the new loop.`,
          });
      }
    }
    const transfers = settings.autoTransfers
      ? insertTransfers(w, h, cells, key, (i) =>
          isTwoLayer(raster.structures[raster.structure[i]!]!, key)
        )
      : { cells, changes: [], skipped: [] };
    cells = transfers.cells;
    const unresolved: ShapeStep[] = shaping ? [...needles.unresolved, ...newLoopGaps] : [];
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
      const side = move.to < move.needle ? 'left' : 'right',
        shift = reason ? -1 : findOp(key, old.steps, side);
      if (!reason && shift < 0)
        reason = `The key has no ${meaningName(old.steps, side)} operation.`;
      if (reason)
        unresolved.push({ pass: move.pass, needle: move.needle, role: 'transfer', reason });
      else cells[i] = shift;
    }
    context?.progress?.(0.9, 'Checking shaping connectivity and operations');
    const checks = checkKnitGraph(stages),
      knitGraph: ShapeKnitGraph = {
        stages,
        saved: { courses: !!saved, loops: !!saved?.loops },
        checks,
      };
    const shape: ShapeResult = {
      geometry,
      knitGraph,
      needles: { ...needles, unresolved: shaping ? unresolved : needles.unresolved },
      placementAt,
      blockers: [],
      ...(closed ? { closed } : {}),
      ...(sphere ? { sphere } : {}),
    };
    const violations = shaping ? validateShapeOperations(shape, cells, key) : [];
    const jumps = shaping ? yarnJumpList(needles, firstDir) : [];
    const blockers = [
      ...new Set([
        ...unresolved.map(
          (s) =>
            `Pass ${s.pass}, needle ${s.needle + 1}: ${s.reason ?? 'Unresolved required shaping step.'}`
        ),
        ...violations,
        ...jumps.map(
          (j) =>
            `Pass ${j.pass}: the yarn ends at needle ${j.from + 1} but this pass starts at needle ${j.to + 1}; short rows must turn where the yarn is.${
              j.pass === 2
                ? ' The cast-on course is never trimmed; a first pass in the other direction (Lab rules) may avoid this.'
                : ''
            }`
        ),
        ...graphMismatch,
        ...checkBlockers(checks),
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
      ...(method === 'project-alignment' && !closed && !sphere && stages.loops?.rows
        ? [
            `${TURN_PAIRING_NOTE}${paired.removed ? ` This layout: ${paired.removed} loop${paired.removed === 1 ? '' : 's'} removed, at most ${paired.maxPerWale} from one wale (${(paired.maxPerWale * gauge.courseHeight * 1000).toFixed(1)} mm).` : ''}`,
          ]
        : []),
      ...(closed || sphere
        ? []
        : [
            'Structure tiles stay anchored to needle and pass indices across shaping transfers.',
            'Short-row turns add no wrap or tuck; confirm this convention with the lab.',
            'Transfer scheduling uses operations after the pass; lab timing and travel settings are recorded, not machine instructions.',
          ]),
      ...(shaping && key.mode === 2
        ? [
            'Two yarn guides: short rows hold both yarns at the turns, and the key has no transfer; confirm this with the lab.',
          ]
        : []),
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
