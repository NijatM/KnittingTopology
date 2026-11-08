// Explicit whole-stack transfer phases on a declared logical grid. Project model only:
// phases are neither native carriage passes nor a certificate of machine feasibility.
import type { GenerationContext } from '../core/types';
import type { Bed } from './keys';
import { MAX_SIDE } from './grid';

export type LogicalLayer = 'front-layer' | 'back-layer';
export interface TransferLoop {
  id: string;
  layer: LogicalLayer;
}
export interface TransferSlot {
  bed: Bed;
  /** Zero-based index on the declared logical grid, not a native machine needle. */
  needle: number;
  loops: TransferLoop[];
}
export interface TransferPhase {
  racking: number;
  transfers: { bed: Bed; needle: number; offset: number }[];
}
export interface TransferPhaseResult {
  /** Valid input/execution and, when supplied, the expected final state matches. */
  ok: boolean;
  /** Slot/phase schemas are valid and every declared phase executed. Target inventory mismatches do not change this. */
  structurallyValid: boolean;
  targetMatches: boolean | null;
  completed: number;
  /** Occupied slots only, front before back, then needle, with loops sorted by ID. Indices remain zero-based. */
  final: TransferSlot[];
  /** Phase numbers are one-based; initial/target/input issues use null. */
  issues: { phase: number | null; message: string }[];
  mixedStacks: TransferSlot[];
  assumptions: readonly string[];
}

export const TRANSFER_PHASE_ASSUMPTIONS: readonly string[] = Object.freeze([
  'The declared width is a finite logical program grid, limited by the existing 600-position project format. No machine needle count, scratch needles or additional workspace are inferred.',
  'Each transfer moves the entire held source stack to the opposite bed at needle + offset. Loop IDs and logical-layer tags remain unchanged; selective unstacking is not modelled.',
  'One integer racking is used per phase: front-to-back offset o requires racking o; back-to-front offset o requires racking −o. This is the project sign convention, not a native machine value or a certified racking range.',
  'Sources are distinct, nonempty and disjoint from every destination in the same phase. A validated phase applies atomically; its arrivals are available to later phases.',
  'Occupied destinations retain their loops and receive the whole arriving stack. Mixed logical-layer stacks are reported; an explicit target can reject unintended mixing.',
  'Initial occupancy is declared held-loop state. No cast-on, cast-off, yarn travel, loop formation, physical geometry or machine safety is simulated. Ordered phases are not native carriage passes.',
]);

type Issue = TransferPhaseResult['issues'][number];
type State = Map<number, TransferLoop[]>;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isBed = (bed: unknown): bed is Bed => bed === 'front' || bed === 'back';
const isLayer = (layer: unknown): layer is LogicalLayer =>
  layer === 'front-layer' || layer === 'back-layer';
const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const slotIndex = (bed: Bed, needle: number, width: number) =>
  (bed === 'front' ? 0 : width) + needle;
const checkCancelled = (context?: GenerationContext) => {
  if (context?.cancelled?.()) {
    const error = new Error('Transfer phase check cancelled.');
    error.name = 'AbortError';
    throw error;
  }
};
const loopOrder = (a: TransferLoop, b: TransferLoop) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : 0;

/** Read sparse occupancy without mutating it. Explicit empty slots are permitted but duplicate slot declarations are not. */
function readSlots(
  value: unknown,
  width: number,
  label: string,
  issues: Issue[],
  context?: GenerationContext
): { state: State; inventory: Map<string, LogicalLayer>; valid: boolean } {
  const state: State = new Map(),
    inventory = new Map<string, LogicalLayer>(),
    declared = new Set<number>(),
    before = issues.length;
  const fail = (message: string) => issues.push({ phase: null, message: `${label}: ${message}` });
  if (!Array.isArray(value)) {
    fail('slots must be an array.');
    return { state, inventory, valid: false };
  }
  for (let n = 0; n < value.length; n++) {
    checkCancelled(context);
    const raw: unknown = value[n];
    if (!isRecord(raw)) {
      fail(`slot ${n + 1} must be an object.`);
      continue;
    }
    if (!isBed(raw.bed) || !isInteger(raw.needle) || raw.needle < 0 || raw.needle >= width) {
      fail(
        `slot ${n + 1} needs a front/back bed and a zero-based needle inside the declared width.`
      );
      continue;
    }
    const index = slotIndex(raw.bed, raw.needle, width);
    if (declared.has(index)) fail(`slot ${raw.bed} ${raw.needle} is declared more than once.`);
    declared.add(index);
    if (!Array.isArray(raw.loops)) {
      fail(`slot ${raw.bed} ${raw.needle} loops must be an array.`);
      continue;
    }
    const loops: TransferLoop[] = [];
    for (let m = 0; m < raw.loops.length; m++) {
      if (m % 1024 === 0) checkCancelled(context);
      const loop: unknown = raw.loops[m];
      if (
        !isRecord(loop) ||
        typeof loop.id !== 'string' ||
        !loop.id.length ||
        !isLayer(loop.layer)
      ) {
        fail(
          `slot ${raw.bed} ${raw.needle}, loop ${m + 1} needs a nonempty ID and a front-layer/back-layer tag.`
        );
        continue;
      }
      if (inventory.has(loop.id))
        fail(`loop ID "${loop.id}" occurs more than once, including across logical layers.`);
      inventory.set(loop.id, loop.layer);
      loops.push({ id: loop.id, layer: loop.layer });
    }
    if (loops.length) state.set(index, loops);
  }
  return { state, inventory, valid: issues.length === before };
}

function canonical(state: State, width: number): TransferSlot[] {
  return [...state.entries()]
    .filter(([, loops]) => loops.length)
    .sort(([a], [b]) => a - b)
    .map(([slot, loops]) => ({
      bed: slot < width ? 'front' : 'back',
      needle: slot % width,
      loops: loops.map((loop) => ({ ...loop })).sort(loopOrder),
    }));
}

function sameOccupancy(
  actual: readonly TransferSlot[],
  expected: readonly TransferSlot[]
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((slot, i) => {
      const target = expected[i]!;
      return (
        slot.bed === target.bed &&
        slot.needle === target.needle &&
        slot.loops.length === target.loops.length &&
        slot.loops.every(
          (loop, j) => loop.id === target.loops[j]!.id && loop.layer === target.loops[j]!.layer
        )
      );
    })
  );
}

/**
 * Validate and execute explicitly supplied phases; no schedule search or selective stack splitting.
 * A malformed initial/target layout is rejected before execution. A well-formed but inventory-mismatched
 * target is reported separately, while phases still run so their actual final state remains inspectable.
 * An invalid phase stops at its prior state, without applying any transfer from that phase.
 */
export function checkTransferPhases(
  input: {
    width: number;
    initial: readonly TransferSlot[];
    phases: readonly TransferPhase[];
    expected?: readonly TransferSlot[];
  },
  context?: GenerationContext
): TransferPhaseResult {
  checkCancelled(context);
  const issues: Issue[] = [];
  let width = 0,
    state: State = new Map(),
    completed = 0,
    structurallyValid = true,
    targetMatches: boolean | null = null,
    finalSnapshot: TransferSlot[] | undefined;
  const finish = (): TransferPhaseResult => {
    const final = finalSnapshot ?? canonical(state, width || 1);
    return {
      ok: structurallyValid && targetMatches !== false,
      structurallyValid,
      targetMatches,
      completed,
      final,
      issues,
      mixedStacks: final.filter((s) => new Set(s.loops.map((loop) => loop.layer)).size > 1),
      assumptions: TRANSFER_PHASE_ASSUMPTIONS,
    };
  };
  const raw: unknown = input;
  if (!isRecord(raw)) {
    issues.push({ phase: null, message: 'Transfer phase input must be an object.' });
    structurallyValid = false;
    return finish();
  }
  const hasTarget = raw.expected !== undefined;
  targetMatches = hasTarget ? false : null;
  if (!isInteger(raw.width) || raw.width < 1 || raw.width > MAX_SIDE) {
    issues.push({
      phase: null,
      message: `Logical grid width must be an integer from 1 to ${MAX_SIDE} (project format limit).`,
    });
    structurallyValid = false;
    return finish();
  }
  width = raw.width;
  const initial = readSlots(raw.initial, width, 'Initial state', issues, context),
    expected = hasTarget
      ? readSlots(raw.expected, width, 'Expected target', issues, context)
      : null;
  if (initial.valid) state = initial.state;
  if (!initial.valid || (expected && !expected.valid) || !Array.isArray(raw.phases)) {
    if (!Array.isArray(raw.phases))
      issues.push({ phase: null, message: 'Transfer phases must be an array.' });
    structurallyValid = false;
    return finish();
  }
  let targetInventoryMatches = true;
  if (expected) {
    targetInventoryMatches = initial.inventory.size === expected.inventory.size;
    if (targetInventoryMatches)
      for (const [id, layer] of initial.inventory)
        if (expected.inventory.get(id) !== layer) {
          targetInventoryMatches = false;
          break;
        }
    if (!targetInventoryMatches)
      issues.push({
        phase: null,
        message:
          'Expected target loop inventory differs from the initial IDs or logical-layer tags; transfers cannot create, discard or relabel loops.',
      });
  }
  for (let n = 0; n < raw.phases.length; n++) {
    checkCancelled(context);
    const phase: unknown = raw.phases[n],
      number = n + 1,
      before = issues.length;
    const fail = (message: string) => issues.push({ phase: number, message });
    if (!isRecord(phase) || !isInteger(phase.racking) || !Array.isArray(phase.transfers)) {
      fail('A phase needs an integer project racking and a transfer array.');
      structurallyValid = false;
      break;
    }
    const sources = new Set<number>(),
      pending: { from: number; to: number; loops: TransferLoop[] }[] = [];
    for (let t = 0; t < phase.transfers.length; t++) {
      if (t % 1024 === 0) checkCancelled(context);
      const transfer: unknown = phase.transfers[t];
      if (
        !isRecord(transfer) ||
        !isBed(transfer.bed) ||
        !isInteger(transfer.needle) ||
        transfer.needle < 0 ||
        transfer.needle >= width ||
        !isInteger(transfer.offset)
      ) {
        fail(
          `Transfer ${t + 1} needs a front/back source bed, an in-grid integer source needle and an integer offset.`
        );
        continue;
      }
      const from = slotIndex(transfer.bed, transfer.needle, width),
        destination = transfer.needle + transfer.offset,
        required = transfer.bed === 'front' ? transfer.offset : -transfer.offset;
      if (sources.has(from))
        fail(`Transfer ${t + 1} repeats source ${transfer.bed} ${transfer.needle}.`);
      sources.add(from);
      if (phase.racking !== required)
        fail(
          `Transfer ${t + 1} requires project racking ${required}, but this phase declares ${phase.racking}.`
        );
      if (destination < 0 || destination >= width) {
        fail(
          `Transfer ${t + 1} destination needle ${destination} is outside the declared logical grid.`
        );
        continue;
      }
      const loops = state.get(from);
      if (!loops?.length)
        fail(`Transfer ${t + 1} source ${transfer.bed} ${transfer.needle} is empty.`);
      pending.push({
        from,
        to: slotIndex(transfer.bed === 'front' ? 'back' : 'front', destination, width),
        loops: loops ?? [],
      });
    }
    if (pending.some((transfer) => sources.has(transfer.to)))
      fail(
        'A phase destination is also a source in that phase; dependent transfers and exchanges need separate ordered phases.'
      );
    if (issues.length > before) {
      structurallyValid = false;
      break;
    }
    // All checks above read the pre-phase occupancy. Sources and destinations are disjoint.
    for (const transfer of pending) state.delete(transfer.from);
    for (const transfer of pending) {
      const held = state.get(transfer.to);
      if (held) for (const loop of transfer.loops) held.push(loop);
      else state.set(transfer.to, transfer.loops);
    }
    completed++;
    context?.progress?.(
      completed / raw.phases.length,
      `Checked transfer phase ${completed} of ${raw.phases.length}`
    );
  }
  finalSnapshot = canonical(state, width);
  if (expected) {
    const target = canonical(expected.state, width);
    targetMatches = targetInventoryMatches && sameOccupancy(finalSnapshot, target);
    if (!targetMatches && targetInventoryMatches)
      issues.push({
        phase: null,
        message:
          'Final occupancy differs from the expected target bed/needle loop identities or logical-layer tags.',
      });
  }
  return finish();
}
