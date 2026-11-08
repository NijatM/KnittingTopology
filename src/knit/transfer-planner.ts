// Bounded deterministic search in the project's declared whole-stack transfer model.
// No native workspace, machine feasibility, or minimum carriage-pass count is inferred.
import type { GenerationContext } from '../core/types';
import {
  checkTransferPhases,
  type TransferPhase,
  type TransferPhaseResult,
  type TransferSlot,
} from './transfer-phases';

export interface PlanLimits {
  maxStates: number;
  maxMoves: number;
  maxPhases: number;
}
export const PLAN_DEFAULTS: Readonly<PlanLimits> = Object.freeze({
  maxStates: 5000,
  maxMoves: 100000,
  maxPhases: 64,
});
export const PLAN_MAX: Readonly<PlanLimits> = Object.freeze({
  maxStates: 50000,
  maxMoves: 1000000,
  maxPhases: 256,
});
export interface TransferSearchResult {
  status: 'found' | 'unreachable' | 'limit' | 'invalid';
  reason: string;
  width: number;
  initial: TransferSlot[];
  expected: TransferSlot[];
  limits: PlanLimits;
  phases: TransferPhase[];
  validation: TransferPhaseResult | null;
  stats: {
    /** All retained node versions, including obsolete records retained for path reconstruction. */
    retainedStates: number;
    expandedStates: number;
    /** Every occupied-source/opposite-bed-needle probe, including excluded merges and revisits. */
    testedMoves: number;
    /** Otherwise unvisited successors omitted by the phase-depth bound. */
    depthCutoffs: number;
  };
  proof?: string;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Partial resource limits merge with defaults. These are computational bounds, not machine parameters. */
export function validatePlanLimits(value: unknown): PlanLimits {
  if (value === undefined) return { ...PLAN_DEFAULTS };
  if (!record(value)) throw new Error('Transfer search limits must be an object.');
  const limits = { ...PLAN_DEFAULTS };
  for (const key of Object.keys(value)) {
    if (key !== 'maxStates' && key !== 'maxMoves' && key !== 'maxPhases')
      throw new Error(`Unknown transfer search limit "${key}".`);
    const n = value[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > PLAN_MAX[key])
      throw new Error(
        `${key} must be an integer from 1 to ${PLAN_MAX[key]} (project resource limit).`
      );
    limits[key] = n;
  }
  return limits;
}

const cancelled = (context?: GenerationContext) => {
  if (context?.cancelled?.()) {
    const error = new Error('Transfer planning cancelled.');
    error.name = 'AbortError';
    throw error;
  }
};
const slotNumber = (slot: TransferSlot, width: number) =>
  slot.needle + (slot.bed === 'front' ? 0 : width);
interface Node {
  /** One UTF-16 code unit per initial indivisible stack: its current slot (0..1199). */
  key: string;
  depth: number;
  h: number;
  parent: number;
  from: number;
  to: number;
}

/** Stable binary heap over immutable record indices. Older records remain counted when a better path is found. */
class Frontier {
  private heap: number[] = [];
  constructor(private readonly nodes: Node[]) {}
  private before(a: number, b: number) {
    const x = this.nodes[a]!,
      y = this.nodes[b]!;
    return (
      x.depth + x.h < y.depth + y.h ||
      (x.depth + x.h === y.depth + y.h && (x.h < y.h || (x.h === y.h && a < b)))
    );
  }
  push(index: number) {
    let at = this.heap.length;
    this.heap.push(index);
    while (at) {
      const parent = Math.floor((at - 1) / 2);
      if (!this.before(index, this.heap[parent]!)) break;
      this.heap[at] = this.heap[parent]!;
      at = parent;
    }
    this.heap[at] = index;
  }
  pop(): number | undefined {
    if (!this.heap.length) return undefined;
    const first = this.heap[0]!,
      last = this.heap.pop()!;
    if (this.heap.length) {
      let at = 0;
      while (2 * at + 1 < this.heap.length) {
        let child = 2 * at + 1;
        if (child + 1 < this.heap.length && this.before(this.heap[child + 1]!, this.heap[child]!))
          child++;
        if (!this.before(this.heap[child]!, last)) break;
        this.heap[at] = this.heap[child]!;
        at = child;
      }
      this.heap[at] = last;
    }
    return first;
  }
}

/**
 * Explore every whole occupied-stack transfer to an opposite-bed needle within the declared grid.
 * Initial stacks are indivisible atoms. Stacks with different final slots cannot merge on any
 * successful path, so excluding those merges preserves reachability. Already-correct stacks are
 * free to move temporarily. A disjoint multi-transfer phase can be serialized into these moves.
 */
export function planTransfers(
  input: {
    width: number;
    initial: TransferSlot[];
    expected: TransferSlot[];
    limits?: Partial<PlanLimits>;
  },
  context?: GenerationContext
): TransferSearchResult {
  cancelled(context);
  const result: TransferSearchResult = {
    status: 'invalid',
    reason: '',
    width: 0,
    initial: [],
    expected: [],
    limits: { ...PLAN_DEFAULTS },
    phases: [],
    validation: null,
    stats: { retainedStates: 0, expandedStates: 0, testedMoves: 0, depthCutoffs: 0 },
  };
  const raw: unknown = input;
  if (!record(raw)) {
    result.reason = 'Transfer planning input must be an object.';
    return result;
  }
  if (typeof raw.width === 'number' && Number.isFinite(raw.width)) result.width = raw.width;
  try {
    result.limits = validatePlanLimits(raw.limits);
  } catch (error) {
    result.reason = (error as Error).message;
    return result;
  }
  // The independent checker owns all occupancy schemas, ID/layer checks, width limits and canonicalization.
  const schema = checkTransferPhases(
    { width: raw.width, initial: raw.initial, expected: raw.expected, phases: [] } as Parameters<
      typeof checkTransferPhases
    >[0],
    context
  );
  if (!schema.structurallyValid || raw.expected === undefined) {
    result.reason =
      raw.expected === undefined
        ? 'Transfer planning requires an explicit expected occupancy.'
        : schema.issues.map((issue) => issue.message).join(' ');
    result.initial = schema.final;
    return result;
  }
  result.initial = schema.final;
  result.expected = checkTransferPhases(
    { width: result.width, initial: raw.expected, phases: [] } as unknown as Parameters<
      typeof checkTransferPhases
    >[0],
    context
  ).final;
  const width = result.width,
    limits = result.limits,
    destinations = new Map<string, { slot: number; layer: string }>();
  for (const slot of result.expected)
    for (const loop of slot.loops)
      destinations.set(loop.id, { slot: slotNumber(slot, width), layer: loop.layer });
  let tokens = 0,
    inventoryMatches = true;
  for (const slot of result.initial)
    for (const loop of slot.loops) {
      tokens++;
      if (destinations.get(loop.id)?.layer !== loop.layer) inventoryMatches = false;
    }
  if (tokens !== destinations.size) inventoryMatches = false;
  const unreachable = (proof: string) => {
    result.status = 'unreachable';
    result.reason = 'No transfer-only plan under the declared whole-stack model.';
    result.proof = proof;
    return result;
  };
  if (!inventoryMatches)
    return unreachable(
      'Transfers preserve every loop ID and logical-layer tag. The initial and expected inventories differ, so no transfer-only sequence can reach this target.'
    );
  const goals: number[] = [];
  for (const slot of result.initial) {
    const goal = destinations.get(slot.loops[0]!.id)!.slot;
    if (slot.loops.some((loop) => destinations.get(loop.id)!.slot !== goal))
      return unreachable(
        `The initial whole stack at ${slot.bed} needle ${slot.needle + 1} contains loops assigned to different final slots. Whole-stack transfers never split a stack, so this target is unreachable under the declared model.`
      );
    goals.push(goal);
  }
  const heuristic = (key: string) => {
    const maxima = new Map<number, number>();
    for (let a = 0; a < key.length; a++) {
      const at = key.charCodeAt(a),
        goal = goals[a]!,
        distance = at === goal ? 0 : at < width !== goal < width ? 1 : 2;
      maxima.set(goal, Math.max(maxima.get(goal) ?? 0, distance));
    }
    let sum = 0;
    for (const n of maxima.values()) sum += n;
    return sum;
  };
  const startKey = result.initial
      .map((slot) => String.fromCharCode(slotNumber(slot, width)))
      .join(''),
    nodes: Node[] = [
      { key: startKey, depth: 0, h: heuristic(startKey), parent: -1, from: -1, to: -1 },
    ],
    best = new Map<string, number>([[startKey, 0]]),
    frontier = new Frontier(nodes);
  frontier.push(0);
  result.stats.retainedStates = 1;
  const found = (index: number) => {
    const path: TransferPhase[] = [];
    for (let n = index; nodes[n]!.parent >= 0; n = nodes[n]!.parent) {
      const node = nodes[n]!,
        front = node.from < width,
        offset = (node.to % width) - (node.from % width);
      path.push({
        racking: front ? offset : -offset,
        transfers: [{ bed: front ? 'front' : 'back', needle: node.from % width, offset }],
      });
    }
    path.reverse();
    const validation = checkTransferPhases(
      { width, initial: result.initial, expected: result.expected, phases: path },
      context
    );
    result.validation = validation;
    if (!validation.ok) {
      result.status = 'invalid';
      result.reason = 'Search candidate failed independent phase replay; no candidate is accepted.';
      return result;
    }
    result.status = 'found';
    result.reason =
      'Candidate independently verified under the declared logical whole-stack model; no native pass optimality or machine feasibility is claimed.';
    result.phases = path;
    return result;
  };
  const limited = (reason: string) => {
    result.status = 'limit';
    result.reason = `${reason} A search cutoff is not proof that no plan exists.`;
    return result;
  };
  if (!nodes[0]!.h) return found(0);
  let next: number | undefined;
  while ((next = frontier.pop()) !== undefined) {
    cancelled(context);
    const node = nodes[next]!;
    if (best.get(node.key) !== next) continue;
    result.stats.expandedStates++;
    const occupancy = new Map<number, { goal: number; atoms: number[] }>();
    for (let a = 0; a < node.key.length; a++) {
      const slot = node.key.charCodeAt(a),
        old = occupancy.get(slot);
      if (old) old.atoms.push(a);
      else occupancy.set(slot, { goal: goals[a]!, atoms: [a] });
    }
    // Numeric source order and ascending destination needles make tie-breaking independent of input array order.
    const sources = [...occupancy.keys()].sort((a, b) => a - b);
    for (const from of sources) {
      const stack = occupancy.get(from)!,
        opposite = from < width ? width : 0;
      for (let needle = 0; needle < width; needle++) {
        if (result.stats.testedMoves >= limits.maxMoves)
          return limited('Tested-move resource limit reached.');
        result.stats.testedMoves++;
        if (result.stats.testedMoves % 128 === 0) cancelled(context);
        const to = opposite + needle,
          held = occupancy.get(to);
        if (held && held.goal !== stack.goal) continue;
        const chars = node.key.split(''),
          destination = String.fromCharCode(to);
        for (const atom of stack.atoms) chars[atom] = destination;
        const key = chars.join(''),
          depth = node.depth + 1,
          previous = best.get(key);
        if (previous !== undefined && nodes[previous]!.depth <= depth) continue;
        if (depth > limits.maxPhases) {
          result.stats.depthCutoffs++;
          continue;
        }
        if (nodes.length >= limits.maxStates)
          return limited('Retained-state resource limit reached.');
        const successor: Node = { key, depth, h: heuristic(key), parent: next, from, to },
          index = nodes.length;
        nodes.push(successor);
        best.set(key, index);
        frontier.push(index);
        result.stats.retainedStates = nodes.length;
        if (!successor.h) return found(index);
      }
    }
    context?.progress?.(
      Math.min(
        0.99,
        Math.max(
          result.stats.retainedStates / limits.maxStates,
          result.stats.testedMoves / limits.maxMoves
        )
      ),
      `Transfer search: ${result.stats.retainedStates} retained states, ${result.stats.testedMoves} tested moves`
    );
  }
  if (result.stats.depthCutoffs) return limited('Phase-depth resource limit pruned the search.');
  return unreachable(
    'Every reachable state in the declared finite whole-stack grid was exhausted. No depth cutoff occurred; merges of different-goal stacks were excluded because whole-stack transfers cannot later separate them.'
  );
}
