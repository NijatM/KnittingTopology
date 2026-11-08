// Sequential schedule assembly uses actual checked state. It never edits the source program.
import { passDir } from './sequence';
import { prepareScheduleSource, replaySchedulePass, validateSchedule } from './schedule-replay';
import { PLAN_DEFAULTS, planTransfers, validatePlanLimits } from './transfer-planner';
import { checkTransferPhases, type TransferSlot } from './transfer-phases';
import type {
  PreparedSchedule,
  ScheduleContext,
  ScheduleIssue,
  ScheduleLimits,
  ScheduleLimitInput,
  ScheduleSource,
  ScheduleTransition,
  ShapingSchedule,
} from './schedule-types';

export const SCHEDULE_DEFAULTS: Readonly<ScheduleLimits> = Object.freeze({
  perTransition: PLAN_DEFAULTS,
  maxTotalMoves: 1_000_000,
  maxAddedPhases: 4096,
});
export const SCHEDULE_MAX = Object.freeze({ maxTotalMoves: 10_000_000, maxAddedPhases: 16_384 });
export function validateScheduleLimits(value: unknown = undefined): ScheduleLimits {
  if (value === undefined) return { ...SCHEDULE_DEFAULTS, perTransition: { ...PLAN_DEFAULTS } };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Schedule limits must be an object.');
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw))
    if (!['perTransition', 'maxTotalMoves', 'maxAddedPhases'].includes(key))
      throw new Error(`Unknown schedule limit "${key}".`);
  const limits = { ...SCHEDULE_DEFAULTS, perTransition: validatePlanLimits(raw.perTransition) };
  for (const key of ['maxTotalMoves', 'maxAddedPhases'] as const) {
    if (raw[key] === undefined) continue;
    const n = raw[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > SCHEDULE_MAX[key])
      throw new Error(
        `${key} must be an integer from 1 to ${SCHEDULE_MAX[key]} (project resource limit).`
      );
    limits[key] = n;
  }
  return limits;
}
const cancelled = (context?: ScheduleContext) => {
  if (context?.cancelled?.()) {
    const e = new Error('Schedule building cancelled.');
    e.name = 'AbortError';
    throw e;
  }
};
const keyOf = (bed: string, needle: number) => `${bed}:${needle}`;
const emptyStats = () => ({
  retainedStates: 0,
  expandedStates: 0,
  testedMoves: 0,
  depthCutoffs: 0,
});

/** Exact consumed-parent targets for knit; tuck retains held parents and creates a new loop. */
function targetForPass(
  prepared: PreparedSchedule,
  pass: number,
  initial: TransferSlot[]
): { expected: TransferSlot[]; held: number; issue: ScheduleIssue | null } {
  const target = new Map<string, TransferSlot>(),
    knitSlots = new Set<string>(),
    needed = new Set<string>();
  const tokens = new Map(initial.flatMap((s) => s.loops.map((l) => [l.id, l] as const)));
  const bad = (message: string, needle?: number, bed?: 'front' | 'back') => ({
    expected: [],
    held: 0,
    issue: { message, pass, ...(needle === undefined ? {} : { needle }), ...(bed ? { bed } : {}) },
  });
  for (const node of prepared.byPass[pass]!) {
    const symbol =
      prepared.sequence!.symbols[prepared.sequence!.rows[pass * prepared.width + node.needle]!]!;
    if (!symbol || !Array.isArray(symbol.steps))
      return bad(
        'A required target has no readable source symbol; the earlier verified prefix is retained.',
        node.needle,
        node.bed
      );
    const actions = symbol.steps.filter(
      (s) => (s?.kind === 'knit' || s?.kind === 'tuck') && s.bed === node.bed
    );
    if (actions.length !== 1)
      return bad(
        'A required layer target must have exactly one source stitch action on its bed; source operations were preserved.',
        node.needle,
        node.bed
      );
    const action = actions[0]!,
      key = keyOf(node.bed, node.needle);
    if (action.kind === 'tuck') {
      if (node.parents.length)
        return bad(
          'A retained tuck consumes no parents, but the reference requires consumed parents. The source action cannot be changed by this builder.',
          node.needle,
          node.bed
        );
      continue;
    }
    knitSlots.add(key);
    const slot: TransferSlot = { bed: node.bed, needle: node.needle, loops: [] };
    target.set(key, slot);
    for (const id of node.parents) {
      if (needed.has(id))
        return bad(
          `Reference parent ${id} is used by more than one target in this pass.`,
          node.needle,
          node.bed
        );
      const token = tokens.get(id);
      if (!token || token.layer !== node.layer)
        return bad(
          `Required parent ${id} is absent from the actual checked incoming state.`,
          node.needle,
          node.bed
        );
      needed.add(id);
      slot.loops.push({ ...token });
    }
  }
  let held = 0;
  for (const slot of initial)
    for (const loop of slot.loops)
      if (!needed.has(loop.id)) {
        held++;
        const key = keyOf(slot.bed, slot.needle);
        if (knitSlots.has(key))
          return bad(
            `Fixed-held target conflict: ${loop.id} must remain at ${slot.bed} needle ${slot.needle + 1}, which the next knit must use for a different parent stack. New parking targets are outside this request.`,
            slot.needle,
            slot.bed
          );
        if (!target.has(key)) target.set(key, { bed: slot.bed, needle: slot.needle, loops: [] });
        target.get(key)!.loops.push({ ...loop });
      }
  return { expected: [...target.values()].filter((s) => s.loops.length), held, issue: null };
}

export function buildShapingSchedule(
  source: ScheduleSource,
  input: ScheduleLimitInput = {},
  context?: ScheduleContext
): ShapingSchedule {
  cancelled(context);
  const prepared = prepareScheduleSource(source, context);
  const result: ShapingSchedule = {
    status: 'invalid',
    complete: false,
    source: {
      signature: source.signature,
      surfaceRevision: source.surface.revision,
      referenceMethod: source.referenceMethod,
      programBlockers: [...source.blockers],
    },
    width: prepared.width,
    height: prepared.height,
    canonical: prepared.sequence,
    reference: prepared.reference,
    events: [],
    transitions: [],
    limits: validateScheduleLimits(),
    stop: null,
    validation: {
      ok: false,
      complete: false,
      checkedEvents: 0,
      completedPasses: 0,
      matchedParents: 0,
      final: [],
      issues: [],
    },
    stats: { testedMoves: 0, retainedStates: 0, expandedStates: 0, addedPhases: 0 },
  };
  try {
    result.limits = validateScheduleLimits(input);
  } catch (e) {
    result.stop = { pass: null, message: (e as Error).message };
    return result;
  }
  if (prepared.status !== 'ready') {
    result.status = prepared.status;
    result.stop = prepared.issues[0] ?? {
      pass: null,
      message: 'The schedule source is unsupported.',
    };
    result.validation.issues = [...prepared.issues];
    return result;
  }
  let current: TransferSlot[] = [];
  const finish = () => {
    // A fresh run ignores builder snapshots/statistics and never calls the search/target constructor.
    result.validation = validateSchedule(source, result.events, context);
    if (!result.validation.ok) {
      result.status = 'invalid';
      result.stop = result.validation.issues[0] ?? {
        pass: null,
        message: 'Independent replay failed.',
      };
    } else if (result.status === 'complete' && !result.validation.complete) {
      result.status = 'invalid';
      result.stop = {
        pass: null,
        message: 'Independent replay did not complete every source pass.',
      };
    }
    result.complete =
      result.status === 'complete' && result.validation.ok && result.validation.complete;
    return result;
  };
  for (let pass = 0; pass < prepared.height; pass++) {
    cancelled(context);
    context?.progress?.(
      pass / prepared.height,
      `Building schedule: source pass ${pass + 1} of ${prepared.height}`
    );
    if (pass > 0) {
      const { expected, held, issue } = targetForPass(prepared, pass, current);
      const movesLeft = result.limits.maxTotalMoves - result.stats.testedMoves;
      const phasesLeft = result.limits.maxAddedPhases - result.stats.addedPhases;
      const effective = {
        ...result.limits.perTransition,
        maxMoves: Math.max(1, Math.min(movesLeft, result.limits.perTransition.maxMoves)),
        maxPhases: Math.max(1, Math.min(phasesLeft, result.limits.perTransition.maxPhases)),
      };
      const transition: ScheduleTransition = {
        beforePass: pass,
        status: 'unsupported',
        reason: issue?.message ?? '',
        phases: 0,
        heldLoops: held,
        effectiveLimits: effective,
        stats: emptyStats(),
      };
      result.transitions.push(transition);
      if (issue) {
        result.status = 'unsupported';
        result.stop = { ...issue, event: result.events.length };
        return finish();
      }
      const already = checkTransferPhases(
        { width: prepared.width, initial: current, expected, phases: [] },
        context
      );
      if (!already.ok && (movesLeft === 0 || phasesLeft === 0)) {
        result.status = 'limit';
        transition.status = 'limit';
        transition.reason =
          movesLeft === 0
            ? 'Aggregate tested-move budget exhausted. A cutoff is not proof that no schedule exists.'
            : 'Aggregate added-phase budget exhausted. A cutoff is not proof that no schedule exists.';
        result.stop = { pass, event: result.events.length, message: transition.reason };
        return finish();
      }
      const search = planTransfers(
        { width: prepared.width, initial: current, expected, limits: effective },
        context
      );
      transition.status = search.status;
      transition.reason = search.reason;
      transition.proof = search.proof;
      transition.stats = { ...search.stats };
      transition.phases = search.phases.length;
      result.stats.testedMoves += search.stats.testedMoves;
      result.stats.retainedStates += search.stats.retainedStates;
      result.stats.expandedStates += search.stats.expandedStates;
      if (search.status !== 'found') {
        if (
          search.status === 'limit' &&
          search.stats.depthCutoffs &&
          phasesLeft < result.limits.perTransition.maxPhases
        )
          transition.reason =
            'Remaining aggregate added-phase budget limited this transition. ' + search.reason;
        if (search.status === 'limit' && search.stats.testedMoves === movesLeft)
          transition.reason = 'Aggregate tested-move budget reached. ' + search.reason;
        result.status = search.status;
        result.stop = { pass, event: result.events.length, message: transition.reason };
        return finish();
      }
      const replay = checkTransferPhases(
        { width: prepared.width, initial: current, expected, phases: search.phases },
        context
      );
      if (!replay.ok) {
        result.status = 'invalid';
        result.stop = {
          pass,
          event: result.events.length,
          message: 'Found phases failed independent transition replay; they were not retained.',
        };
        return finish();
      }
      for (const phase of search.phases)
        result.events.push({ kind: 'transfer-phase', beforePass: pass, phase });
      result.stats.addedPhases += search.phases.length;
      current = replay.final;
    }
    const run = replaySchedulePass(prepared, pass, current, context);
    if (!run.ok) {
      result.status = 'unsupported';
      result.stop = {
        ...(run.issues[0] ?? {
          pass,
          message: 'Retained source operations do not satisfy the reference.',
        }),
        event: result.events.length,
      };
      return finish();
    }
    current = run.final;
    result.events.push({ kind: 'source-pass', pass });
  }
  result.status = 'complete';
  return finish();
}

/** One-based artifact; zero-based symbol table lookup indices and relative offsets remain unchanged. */
export function shapingScheduleJson(result: ShapingSchedule, stale = false): string {
  const slots = (list: TransferSlot[]) => list.map((s) => ({ ...s, needle: s.needle + 1 }));
  const issue = (i: ScheduleIssue) => ({
    ...i,
    pass: i.pass === null ? null : i.pass + 1,
    ...(i.needle === undefined ? {} : { needle: i.needle + 1 }),
    ...(i.event === undefined ? {} : { event: i.event + 1 }),
  });
  const canonical = result.canonical;
  return JSON.stringify(
    {
      format: 'knit-shaping-schedule',
      version: 1,
      units: 'logical grid; reference coordinates retained in the full project',
      indexing:
        'one-based needles, source passes and events; symbol table lookup indices remain zero-based; relative offsets and project racking signs unchanged',
      note: 'Separate symbolic schedule analysis, not applied to the source program and not native carriage instructions. Preserve the full project JSON for geometry and calibration provenance.',
      stale,
      ...result,
      canonical: canonical
        ? {
            ...canonical,
            rows: Array.from(canonical.rows),
            fills: canonical.fills.map((f) => ({
              ...f,
              anchor: [f.anchor[0] + 1, f.anchor[1] + 1],
            })),
            passes: Array.from({ length: canonical.h }, (_, k) => ({
              pass: k + 1,
              direction: passDir(canonical.firstDir, k),
            })),
          }
        : null,
      reference: result.reference.map((n) => ({ ...n, pass: n.pass + 1, needle: n.needle + 1 })),
      events: result.events.map((e, i) =>
        e.kind === 'source-pass'
          ? { ...e, event: i + 1, pass: e.pass + 1 }
          : {
              ...e,
              event: i + 1,
              beforePass: e.beforePass + 1,
              phase: {
                ...e.phase,
                transfers: e.phase.transfers.map((t) => ({ ...t, needle: t.needle + 1 })),
              },
            }
      ),
      transitions: result.transitions.map((t) => ({ ...t, beforePass: t.beforePass + 1 })),
      stop: result.stop ? issue(result.stop) : null,
      validation: {
        ...result.validation,
        final: slots(result.validation.final),
        issues: result.validation.issues.map(issue),
      },
    },
    null,
    2
  );
}
