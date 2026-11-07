// Read-only interpretation of a derived program; no geometry or operation changes.
import type { KnitProgram } from './program';
import { SOURCE } from './rasterize';

export function assignedLoopCoverage(kind: Uint8Array, placementAt?: Int32Array) {
  let assigned = 0,
    edges = 0;
  for (let i = 0; i < kind.length; i++) {
    if (placementAt?.[i] === -1) continue;
    if (kind[i] !== SOURCE.background) {
      assigned++;
      if (kind[i] === SOURCE.edge) edges++;
    }
  }
  return { assigned, edges, edgeShare: assigned ? edges / assigned : 0 };
}

export function inspectKnitProgram(p: KnitProgram) {
  const shaping = p.settings.mode !== 'network' && !!p.shape;
  const steps = p.shape?.needles.steps ?? [];
  const turnPasses = new Set(steps.filter((s) => s.role === 'turn').map((s) => s.pass)).size;
  const coverage = assignedLoopCoverage(p.raster.kind, shaping ? p.shape!.placementAt : undefined);
  const blockers = p.exportBlockers.length;
  const shapingBlockers = p.shape?.blockers.length ?? 0;
  const changes =
    turnPasses +
    steps.filter((s) => s.role !== 'loop' && s.role !== 'turn').length +
    (p.shape?.needles.moves.length ?? 0);
  return {
    shaping,
    title: !shaping
      ? 'Pattern only — shaping not applied'
      : shapingBlockers
        ? 'Shaping unresolved — preview only'
        : changes
          ? 'Shaping operations encoded'
          : 'No shaping changes in this layout',
    blockers,
    turnPasses,
    increases: steps.filter((s) => s.role === 'increase').length,
    edgeStarts: steps.filter((s) => s.role === 'edge increase').length,
    decreases: steps.filter((s) => s.role === 'decrease').length,
    requiredMoves: p.shape?.needles.moves.length ?? 0,
    operationWarnings: p.findings.length,
    modelNotes: p.issues.length,
    assumedStructures: p.structures.filter((s) => s.gauge?.assumed).map((s) => s.name),
    ...coverage,
  };
}
