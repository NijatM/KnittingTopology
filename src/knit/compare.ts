// Knit variants in the Compare tab: what a capture keeps of the current knit program, and how two captures differ.
// Snapshots are session-only and derived; the project file stores settings, never programs.
import type { KnitMode, PatternGraph, SurfaceSpec, SwatchEntry } from '../core/types';
import { keyById, sameMeaning, type Key } from './keys';
import type { KnitProgram } from './program';

export interface KnitSnapshot {
  mode: KnitMode;
  key: Key;
  custom: boolean;
  w: number;
  h: number;
  /** Op indices into `key`, image order (row zero is the last pass). */
  cells: Uint8Array;
  /** A structure without a gauge has no measurement and no jersey value (typed size). */
  structures: {
    name: string;
    loops: number;
    gauge: 'measured' | 'assumed = jersey' | 'not measured';
  }[];
  transfers: number;
  skippedTransfers: number;
  findings: number;
  blockers: number;
  unresolved: number;
  /** What the knit program depended on, for the "different inputs" note. */
  context: { surface: string; network: string | null; swatches: string };
}

export function knitSnapshot(
  p: KnitProgram,
  inputs: { surface: SurfaceSpec; graph: PatternGraph | null; swatches?: SwatchEntry[] }
): KnitSnapshot {
  return {
    mode: p.settings.mode,
    key: structuredClone(p.key),
    custom: !keyById(p.key.id),
    w: p.w,
    h: p.h,
    cells: p.cells.slice(),
    structures: p.structures.map((s) => ({
      name: s.name,
      loops: s.loops,
      gauge: !s.gauge ? 'not measured' : s.gauge.assumed ? 'assumed = jersey' : 'measured',
    })),
    transfers: p.transfers.length,
    skippedTransfers: p.skippedTransfers.length,
    findings: p.findings.length,
    blockers: p.exportBlockers.length,
    unresolved: p.shape?.needles.unresolved.length ?? 0,
    context: {
      surface: inputs.surface.revision,
      network:
        p.settings.mode === 'shape' || !inputs.graph
          ? null
          : (inputs.graph.provenance.inputSignature ?? JSON.stringify(inputs.graph.provenance)),
      swatches: JSON.stringify(inputs.swatches ?? []),
    },
  };
}

/**
 * Cells whose operations differ in meaning (steps per yarn guide and transfer), whatever the key colours.
 * Null when the needles x passes differ: such programs are not compared cell by cell.
 */
export function cellDifference(
  a: KnitSnapshot,
  b: KnitSnapshot
): { differ: number; total: number } | null {
  if (a.w !== b.w || a.h !== b.h) return null;
  let differ = 0;
  for (let i = 0; i < a.cells.length; i++) {
    const x = a.key.ops[a.cells[i]!],
      y = b.key.ops[b.cells[i]!];
    if (!x || !y || !sameMeaning(x, y)) differ++;
  }
  return { differ, total: a.cells.length };
}

/** True when the snapshots used different surfaces or measurements, or (both using one) different networks. */
export function inputsDiffer(a: KnitSnapshot, b: KnitSnapshot): boolean {
  return (
    a.context.surface !== b.context.surface ||
    a.context.swatches !== b.context.swatches ||
    (a.context.network !== null &&
      b.context.network !== null &&
      a.context.network !== b.context.network)
  );
}
