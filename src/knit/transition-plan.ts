// Selected-transition preparation uses the actual replay prefix, never the expected targets as initial state.
import type { GenerationContext, SurfaceSpec } from '../core/types';
import type { KnitProgram } from './program';
import {
  inspectLayerGraph,
  type LayerProgram,
  type LayerSurface,
  type LayerFinding,
} from './layer-graph';
import type { TransferSlot, LogicalLayer } from './transfer-phases';
import { checkTransferPhases } from './transfer-phases';
import {
  planTransfers,
  validatePlanLimits,
  type PlanLimits,
  type TransferSearchResult,
} from './transfer-planner';

export interface TransitionSource {
  program: LayerProgram;
  surface: LayerSurface & { revision: string };
  signature: string;
  referenceMethod: string;
  blockers: string[];
}
export interface PreparedTransition {
  status: 'ready' | 'unsupported' | 'invalid';
  beforePass: number;
  width: number;
  height: number;
  initial: TransferSlot[] | null;
  expected: TransferSlot[] | null;
  issues: string[];
  prefixFindings: LayerFinding[];
  activeTargets: number;
  heldLoops: number;
}
export interface TransitionPlanResult {
  status: TransferSearchResult['status'] | 'unsupported';
  source: {
    signature: string;
    surfaceRevision: string;
    referenceMethod: string;
    programBlockers: string[];
  };
  request: PreparedTransition;
  search: TransferSearchResult | null;
  limits: PlanLimits;
  issues: string[];
}

/** Fingerprint is a reproducibility/UI aid, not a cryptographic certificate. Object/job guards own freshness. */
export function transitionSource(p: KnitProgram, surface: SurfaceSpec): TransitionSource {
  const program: LayerProgram = {
    w: p.w,
    h: p.h,
    key: p.key,
    cells: p.cells,
    operations: p.operations,
    firstDir: p.firstDir,
    settings: {
      mode: p.settings.mode,
      layerModel: p.settings.layerModel,
      ...(p.settings.patches ? { patches: p.settings.patches } : {}),
    },
    ...(p.shape
      ? {
          shape: {
            placementAt: p.shape.placementAt,
            needles: { placements: p.shape.needles.placements, moves: p.shape.needles.moves },
          },
        }
      : {}),
    ...(p.patches ? { patches: true } : {}),
  };
  const descriptor = { kind: surface.kind, mapping: surface.mapping, revision: surface.revision };
  const referenceMethod = p.shape?.geometry.method ?? 'no-reference';
  const text = JSON.stringify([program, descriptor, referenceMethod]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return {
    program,
    surface: descriptor,
    referenceMethod,
    signature: `transition-source-v1-${hash.toString(16)}`,
    blockers: [...p.exportBlockers],
  };
}

export function prepareTransition(
  source: TransitionSource,
  beforePass: number,
  context?: GenerationContext
): PreparedTransition {
  const p = source.program;
  const r: PreparedTransition = {
    status: 'unsupported',
    beforePass,
    width: p.w,
    height: p.h,
    initial: null,
    expected: null,
    issues: [],
    prefixFindings: [],
    activeTargets: 0,
    heldLoops: 0,
  };
  if (
    !Number.isInteger(p.w) ||
    p.w < 1 ||
    p.w > 600 ||
    !Number.isInteger(p.h) ||
    p.h < 1 ||
    p.h > 600 ||
    p.cells.length !== p.w * p.h
  ) {
    r.status = 'invalid';
    r.issues.push('The source must have a valid logical grid of at most 600 × 600.');
    return r;
  }
  if (!Number.isInteger(beforePass) || beforePass < 2 || beforePass > p.h) {
    r.status = 'invalid';
    r.issues.push(`Choose a pass from 2 to ${p.h}.`);
    return r;
  }
  if (p.settings.layerModel !== 'shared-reference-v1') {
    r.issues.push('Enable and generate the shared two-layer reference first.');
    return r;
  }
  const graph = inspectLayerGraph(p, source.surface, context, beforePass);
  if (!graph.supported || !graph.prefix) {
    r.issues = graph.blockers.length
      ? [...graph.blockers]
      : ['No supported prefix snapshot could be reconstructed.'];
    return r;
  }
  r.prefixFindings = graph.prefix.findings;
  if (r.prefixFindings.length) {
    r.issues.push(
      'The preceding layer histories are invalid. Choose an earlier transition or repair the source program.'
    );
    return r;
  }
  const tokens = new Map<string, { id: string; layer: LogicalLayer }>();
  const initial: TransferSlot[] = [];
  for (const slot of graph.prefix.live) {
    const loops = [];
    for (const id of slot.loops) {
      const layer: LogicalLayer | null = id.startsWith('front-layer:')
        ? 'front-layer'
        : id.startsWith('back-layer:')
          ? 'back-layer'
          : null;
      if (!layer) {
        r.issues.push('An incoming loop has no declared logical-layer identity.');
        return r;
      }
      if (tokens.has(id)) {
        r.issues.push(`Incoming loop ${id} occurs in more than one slot.`);
        return r;
      }
      const token = { id, layer };
      tokens.set(id, token);
      loops.push(token);
    }
    initial.push({ bed: slot.bed, needle: slot.needle, loops });
  }
  r.initial = initial;
  const next = graph.nodes.filter((n) => n.pass === beforePass - 1);
  r.activeTargets = next.length;
  if (!next.length) {
    r.issues.push('The selected pass has no declared target loops.');
    return r;
  }
  const active = new Set<string>(),
    needed = new Set<string>(),
    target = new Map<string, TransferSlot>();
  for (const node of next) {
    const key = `${node.bed}:${node.needle}`;
    if (active.has(key)) {
      r.issues.push('The reference assigns two targets to the same needle and bed.');
      return r;
    }
    active.add(key);
    const slot: TransferSlot = { bed: node.bed, needle: node.needle, loops: [] };
    target.set(key, slot);
    for (const id of node.parents) {
      if (needed.has(id)) {
        r.issues.push(`Parent ${id} is required by more than one next-pass target.`);
        return r;
      }
      const token = tokens.get(id);
      if (!token) {
        r.issues.push(`Required parent ${id} is not present in the valid incoming state.`);
        return r;
      }
      needed.add(id);
      slot.loops.push({ ...token });
    }
  }
  for (const slot of initial)
    for (const token of slot.loops)
      if (!needed.has(token.id)) {
        r.heldLoops++;
        const key = `${slot.bed}:${slot.needle}`;
        if (active.has(key)) {
          r.issues.push(
            `Held loop ${token.id} at ${slot.bed} needle ${slot.needle + 1} conflicts with the next pass's required slot. The fixed-held target cannot be constructed; choosing new parking positions is outside this request.`
          );
          continue;
        }
        if (!target.has(key)) target.set(key, { bed: slot.bed, needle: slot.needle, loops: [] });
        target.get(key)!.loops.push({ ...token });
      }
  if (r.issues.length) return r;
  const expected = [...target.values()].filter((s) => s.loops.length);
  const checked = checkTransferPhases({ width: p.w, initial, expected, phases: [] }, context);
  if (
    !checked.structurallyValid ||
    checked.issues.some((i) => i.message.includes('inventory differs'))
  ) {
    r.status = 'invalid';
    r.issues = checked.issues.map((i) => i.message);
    return r;
  }
  r.expected = expected;
  r.status = 'ready';
  return r;
}

export function planTransition(
  source: TransitionSource,
  beforePass: number,
  limits: Partial<PlanLimits>,
  context?: GenerationContext
): TransitionPlanResult {
  const checkedLimits = validatePlanLimits(limits);
  const request = prepareTransition(source, beforePass, context);
  const result: TransitionPlanResult = {
    status: request.status === 'invalid' ? 'invalid' : 'unsupported',
    source: {
      signature: source.signature,
      surfaceRevision: source.surface.revision,
      referenceMethod: source.referenceMethod,
      programBlockers: [...source.blockers],
    },
    request,
    search: null,
    limits: checkedLimits,
    issues: [...request.issues],
  };
  if (request.status !== 'ready') return result;
  const search = planTransfers(
    {
      width: request.width,
      initial: request.initial!,
      expected: request.expected!,
      limits: checkedLimits,
    },
    context
  );
  return {
    ...result,
    status: search.status,
    search,
    issues: search.status === 'found' ? [] : [search.reason],
  };
}
export function transitionPlanJson(result: TransitionPlanResult, stale = false): string {
  const slots = (list: TransferSlot[] | null) =>
    list?.map((s) => ({ ...s, needle: s.needle + 1 })) ?? null;
  const search = result.search;
  return JSON.stringify(
    {
      format: 'knit-transfer-plan',
      version: 1,
      indexing: 'one-based needles, passes and phase labels; offsets unchanged',
      note: 'Logical-grid analysis only; candidate phases are not native carriage passes and are not applied to the program. Retain project JSON for complete provenance.',
      stale,
      ...result,
      request: {
        ...result.request,
        initial: slots(result.request.initial),
        expected: slots(result.request.expected),
        prefixFindings: result.request.prefixFindings.map((f) => ({
          ...f,
          cells: f.cells.map((i) => [
            (i % result.request.width) + 1,
            result.request.height - Math.floor(i / result.request.width),
          ]),
        })),
      },
      search: search
        ? {
            ...search,
            initial: slots(search.initial),
            expected: slots(search.expected),
            phases: search.phases.map((p) => ({
              ...p,
              transfers: p.transfers.map((t) => ({ ...t, needle: t.needle + 1 })),
            })),
            validation: search.validation
              ? {
                  ...search.validation,
                  final: slots(search.validation.final),
                  mixedStacks: slots(search.validation.mixedStacks),
                }
              : null,
          }
        : null,
    },
    null,
    2
  );
}
