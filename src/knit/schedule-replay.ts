// Fresh logical schedule replay. No planner, transition target constructor, claimed snapshots or builder statistics.
import type { GenerationContext } from '../core/types';
import { MAX_SIDE, imageIndex } from './grid';
import { passDir, programSequence, type SeqStep } from './sequence';
import { checkTransferPhases, type TransferLoop, type TransferSlot } from './transfer-phases';
import type {
  PreparedSchedule,
  ScheduleEvent,
  ScheduleIssue,
  SchedulePassRun,
  ScheduleReference,
  ScheduleSource,
  ScheduleValidation,
} from './schedule-types';

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const bed = (v: unknown): v is 'front' | 'back' => v === 'front' || v === 'back';
const numericList = (v: unknown, length: number): v is ArrayLike<number> =>
  (Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView))) &&
  (v as ArrayLike<number>).length === length;
const cancelled = (context?: GenerationContext) => {
  if (context?.cancelled?.()) {
    const error = new Error('Schedule replay cancelled.');
    error.name = 'AbortError';
    throw error;
  }
};
interface Index {
  ids: Map<string, ScheduleReference>;
  leaves: Set<string>;
}
const indices = new WeakMap<PreparedSchedule, Index>();
function index(prepared: PreparedSchedule): Index {
  const cached = indices.get(prepared);
  if (cached) return cached;
  const ids = new Map(prepared.reference.map((r) => [r.id, r])),
    leaves = new Set(ids.keys());
  for (const r of prepared.reference) for (const parent of r.parents) leaves.delete(parent);
  const value = { ids, leaves };
  indices.set(prepared, value);
  return value;
}
const cellKey = (pass: number, side: 'front' | 'back', needle: number) =>
  `${pass}:${side}:${needle}`;
const slotNumber = (side: 'front' | 'back', needle: number, width: number) =>
  needle + (side === 'front' ? 0 : width);
const sorted = (ids: Iterable<string>) => [...ids].sort();
const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, n) => id === b[n]);

/** Global reference/metadata preflight only. Later incompatible source actions are diagnosed at their own pass. */
export function prepareScheduleSource(
  source: ScheduleSource,
  context?: GenerationContext
): PreparedSchedule {
  cancelled(context);
  const result: PreparedSchedule = {
    status: 'invalid',
    issues: [],
    width: 0,
    height: 0,
    sequence: null,
    reference: [],
    byPass: [],
    byCell: new Map(),
  };
  const fail = (message: string, pass: number | null = null, needle?: number) =>
    result.issues.push({ message, pass, ...(needle === undefined ? {} : { needle }) });
  const raw: unknown = source;
  if (!record(raw) || !record(raw.program) || !record(raw.surface)) {
    fail('A schedule source needs a program and surface descriptor.');
    return result;
  }
  const p = source.program,
    surface = source.surface;
  if (!integer(p.w) || !integer(p.h) || p.w < 1 || p.h < 1 || p.w > MAX_SIDE || p.h > MAX_SIDE) {
    fail(`Schedule dimensions must be integers from 1 to ${MAX_SIDE} (project format limit).`);
    return result;
  }
  result.width = p.w;
  result.height = p.h;
  const open =
    surface.kind === 'plane' ||
    surface.kind === 'saddle' ||
    (surface.kind === 'mesh' && surface.mapping === 'rectangular-obj-uv-v1');
  if (
    !open ||
    !p.settings ||
    p.settings.layerModel !== 'shared-reference-v1' ||
    !['shape', 'both'].includes(p.settings.mode) ||
    p.settings.patches ||
    p.patches ||
    !p.shape ||
    p.key?.mode !== 2
  ) {
    result.status = 'unsupported';
    fail(
      'Schedule analysis requires an enabled shared-reference two-guide unpatched open Shape or combined program.'
    );
    return result;
  }
  const shape = p.shape;
  if (
    !record(shape.needles) ||
    !Array.isArray(shape.needles.placements) ||
    !shape.needles.placements.length ||
    !numericList(p.cells, p.w * p.h) ||
    !numericList(shape.placementAt, p.w * p.h)
  ) {
    fail(
      'Schedule source needs nonempty reference placements and matching cells/placementAt grid dimensions.'
    );
    return result;
  }
  let seq;
  try {
    seq = p.operations ?? programSequence(p);
  } catch {
    fail('The source canonical operation sequence cannot be read.');
    return result;
  }
  if (
    !seq ||
    seq.w !== p.w ||
    seq.h !== p.h ||
    seq.guides !== 2 ||
    ![1, -1].includes(p.firstDir) ||
    seq.firstDir !== p.firstDir ||
    !numericList(seq.rows, p.w * p.h) ||
    !Array.isArray(seq.symbols)
  ) {
    fail(
      'Canonical source sequence dimensions, two-guide count, first direction and row dimensions must match the program.'
    );
    return result;
  }
  for (let i = 0; i < p.w * p.h; i++) {
    if (!integer(seq.rows[i]) || seq.rows[i]! < 0 || !integer(p.cells[i]) || p.cells[i]! < 0) {
      fail('Source cells and canonical symbol rows must contain nonnegative integer indices.');
      return result;
    }
  }
  result.sequence = seq;
  const placements = shape.needles.placements,
    sources = new Map<string, (typeof placements)[number]>(),
    cells = new Set<string>();
  for (let n = 0; n < placements.length; n++) {
    if (n % 256 === 0) cancelled(context);
    const r = placements[n];
    if (
      !r ||
      !r.loop ||
      typeof r.loop.id !== 'string' ||
      !r.loop.id.length ||
      !integer(r.course) ||
      r.course < 0 ||
      r.course >= p.h ||
      !integer(r.needle) ||
      r.needle < 0 ||
      r.needle >= p.w ||
      !Array.isArray(r.parents) ||
      r.parents.some((id) => typeof id !== 'string' || !id.length)
    ) {
      fail('Reference placements need unique IDs, in-grid integer cells and parent ID arrays.');
      continue;
    }
    const key = `${r.course}:${r.needle}`;
    if (sources.has(r.loop.id)) fail('Reference loop IDs must be unique.', r.course, r.needle);
    if (cells.has(key))
      fail('Reference placements must occupy distinct source cells.', r.course, r.needle);
    sources.set(r.loop.id, r);
    cells.add(key);
  }
  if (result.issues.length) return result;
  const occurrences = new Uint8Array(placements.length);
  for (let i = 0; i < p.w * p.h; i++) {
    const n = shape.placementAt[i]!;
    if (!integer(n) || n < -1 || n >= placements.length) {
      fail('placementAt contains an invalid reference index.');
      continue;
    }
    if (n >= 0) {
      const r = placements[n]!;
      if (occurrences[n] || imageIndex(p.w, p.h, r.needle, r.course) !== i)
        fail(
          'placementAt must name each reference exactly once at its declared cell.',
          r.course,
          r.needle
        );
      occurrences[n] = 1;
    }
  }
  if (occurrences.some((n) => !n))
    fail('Every reference placement must be present in placementAt.');
  const consumed = new Set<string>();
  for (let n = 0; n < placements.length; n++) {
    if (n % 256 === 0) cancelled(context);
    const r = placements[n]!;
    for (const parent of r.parents) {
      const earlier = sources.get(parent);
      if (!earlier || earlier.course >= r.course)
        fail('Reference parents must exist on an earlier source pass.', r.course, r.needle);
      if (consumed.has(parent))
        fail(
          'A reference parent is repeated or consumed by more than one child.',
          r.course,
          r.needle
        );
      consumed.add(parent);
    }
  }
  if (result.issues.length) return result;
  result.byPass = Array.from({ length: p.h }, () => []);
  for (let n = 0; n < placements.length; n++) {
    if (n % 256 === 0) cancelled(context);
    const r = placements[n]!;
    for (const side of ['front', 'back'] as const) {
      const layer = side === 'front' ? 'front-layer' : 'back-layer',
        node: ScheduleReference = {
          id: `${layer}:${r.loop.id}`,
          source: r.loop.id,
          layer,
          bed: side,
          pass: r.course,
          needle: r.needle,
          parents: r.parents.map((parent) => `${layer}:${parent}`),
        };
      result.reference.push(node);
      result.byPass[r.course]!.push(node);
      result.byCell.set(cellKey(r.course, side, r.needle), node);
    }
  }
  const order = (a: ScheduleReference, b: ScheduleReference) =>
    a.pass - b.pass || a.needle - b.needle || (a.bed === b.bed ? 0 : a.bed === 'front' ? -1 : 1);
  result.reference.sort(order);
  for (const pass of result.byPass) pass.sort(order);
  index(result);
  result.status = 'ready';
  context?.progress?.(1, 'Schedule source and reference checked');
  return result;
}

/** Validate only symbols used by this pass. An unused legacy same-bed key entry is harmless. */
function sourceActions(
  prepared: PreparedSchedule,
  pass: number
): { actions: { needle: number; steps: SeqStep[] }[]; issues: ScheduleIssue[] } {
  const seq = prepared.sequence!,
    actions: { needle: number; steps: SeqStep[] }[] = [],
    issues: ScheduleIssue[] = [];
  let racking: number | undefined;
  const dir = passDir(seq.firstDir, pass);
  for (let n = 0; n < prepared.width; n++) {
    const needle = dir === 1 ? n : prepared.width - 1 - n,
      symbol = seq.symbols[seq.rows[pass * prepared.width + needle]!],
      fail = (message: string, side?: 'front' | 'back') =>
        issues.push({ message, pass, needle, ...(side ? { bed: side } : {}) });
    if (!symbol || !Array.isArray(symbol.steps)) {
      fail('This source cell has no readable canonical symbol.');
      continue;
    }
    const fed = new Set<string>();
    let free = false;
    for (const step of symbol.steps) {
      if (!step || !bed(step.bed)) {
        fail('A source step has an unknown physical bed.');
        continue;
      }
      if (step.kind === 'knit' || step.kind === 'tuck') {
        if (free || !integer(step.guide) || step.guide < 1 || step.guide > 2)
          fail(
            'Source yarn-fed steps need guide 1 or 2 and must precede yarn-free steps.',
            step.bed
          );
        if (fed.has(step.bed))
          fail('A used source symbol has more than one yarn-fed action on the same bed.', step.bed);
        fed.add(step.bed);
      } else {
        free = true;
        if (step.kind === 'drop') continue;
        if (step.kind !== 'move' && step.kind !== 'transfer') {
          fail('A source symbol has an unknown yarn-free step.', step.bed);
          continue;
        }
        if (!integer(step.offset) || (step.kind === 'move' && Math.abs(step.offset) !== 1)) {
          fail(
            'Source transfers need integer offsets; same-bed moves are one needle left or right.',
            step.bed
          );
          continue;
        }
        const destination = needle + step.offset;
        if (destination < 0 || destination >= prepared.width)
          fail('A source yarn-free step leaves the declared needle grid.', step.bed);
        if (step.kind === 'transfer') {
          const required = step.bed === 'front' ? step.offset : -step.offset;
          if (racking !== undefined && racking !== required)
            fail('Source transfers in this pass require conflicting project rackings.', step.bed);
          racking = required;
        }
      }
    }
    actions.push({ needle, steps: symbol.steps });
  }
  return { actions, issues };
}

const occupancy = (held: TransferLoop[][], width: number): TransferSlot[] => {
  const slots: TransferSlot[] = [];
  for (let n = 0; n < held.length; n++)
    if (held[n]!.length)
      slots.push({
        bed: n < width ? 'front' : 'back',
        needle: n % width,
        loops: held[n]!.map((loop) => ({ ...loop })).sort((a, b) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0
        ),
      });
  return slots;
};

/** Atomic source-pass replay from verified incoming occupancy, using the original source pass direction. */
export function replaySchedulePass(
  prepared: PreparedSchedule,
  pass: number,
  initial: TransferSlot[],
  context?: GenerationContext
): SchedulePassRun {
  cancelled(context);
  const checked = checkTransferPhases({ width: prepared.width, initial, phases: [] }, context),
    prior = checked.final,
    issues: ScheduleIssue[] = checked.issues.map((issue) => ({
      message: issue.message,
      pass: integer(pass) ? pass : null,
    }));
  const stop = (): SchedulePassRun => ({ ok: false, final: prior, issues, matchedParents: 0 });
  if (!checked.structurallyValid) return stop();
  if (prepared.status !== 'ready' || !prepared.sequence) {
    issues.push(...prepared.issues);
    return stop();
  }
  if (!integer(pass) || pass < 0 || pass >= prepared.height) {
    issues.push({ message: 'Source pass is outside the prepared program.', pass: null });
    return stop();
  }
  const known = index(prepared),
    held: TransferLoop[][] = Array.from({ length: 2 * prepared.width }, () => []),
    expectedInventory = new Map<string, TransferLoop['layer']>();
  for (const slot of prior) {
    held[slotNumber(slot.bed, slot.needle, prepared.width)] = slot.loops.map((loop) => ({
      ...loop,
    }));
    for (const loop of slot.loops) {
      const ref = known.ids.get(loop.id);
      if (!ref || ref.layer !== loop.layer || ref.pass >= pass)
        issues.push({
          message: 'Incoming occupancy has an unknown, wrong-layer or non-earlier loop identity.',
          pass,
          needle: slot.needle,
          bed: slot.bed,
          actual: [loop.id],
          expected: ref ? [ref.id] : [],
        });
      expectedInventory.set(loop.id, loop.layer);
    }
  }
  if (issues.length) return stop();
  const { actions, issues: actionIssues } = sourceActions(prepared, pass);
  issues.push(...actionIssues);
  if (issues.length) return stop();
  const seen = new Set<string>();
  let matchedParents = 0;
  for (const action of actions) {
    cancelled(context);
    for (const step of action.steps)
      if (step.kind === 'knit' || step.kind === 'tuck') {
        const ref = prepared.byCell.get(cellKey(pass, step.bed, action.needle)),
          at = slotNumber(step.bed, action.needle, prepared.width),
          stack = held[at]!;
        if (!ref) {
          issues.push({
            message: 'A source yarn-fed action has no declared reference target.',
            pass,
            needle: action.needle,
            bed: step.bed,
          });
          return stop();
        }
        seen.add(ref.id);
        const expected = sorted(ref.parents),
          actual = step.kind === 'knit' ? sorted(stack.map((loop) => loop.id)) : [];
        if (
          (step.kind === 'tuck' && expected.length) ||
          (step.kind === 'knit' && !sameIds(expected, actual))
        ) {
          issues.push({
            message:
              step.kind === 'tuck'
                ? 'A tuck consumes no parents, but this reference target requires parents.'
                : 'Actual source-knit parents differ from the exact reference parents.',
            pass,
            needle: action.needle,
            bed: step.bed,
            expected,
            actual,
          });
          return stop();
        }
        if (step.kind === 'knit') {
          for (const parent of ref.parents) expectedInventory.delete(parent);
          held[at] = [];
        }
        held[at]!.push({ id: ref.id, layer: ref.layer });
        expectedInventory.set(ref.id, ref.layer);
        matchedParents++;
      }
  }
  for (const ref of prepared.byPass[pass]!)
    if (!seen.has(ref.id)) {
      issues.push({
        message: 'A required reference target has no source knit or tuck action.',
        pass,
        needle: ref.needle,
        bed: ref.bed,
        expected: [ref.id],
        actual: [],
      });
      return stop();
    }
  const arrivals: { at: number; loops: TransferLoop[] }[] = [];
  for (const action of actions)
    for (const step of action.steps) {
      if (step.kind === 'knit' || step.kind === 'tuck') continue;
      const from = slotNumber(step.bed, action.needle, prepared.width),
        moving = held[from]!;
      held[from] = [];
      if (step.kind === 'drop') continue;
      if (step.kind !== 'move' && step.kind !== 'transfer') continue; // Already refused by sourceActions.
      const side = step.kind === 'transfer' ? (step.bed === 'front' ? 'back' : 'front') : step.bed;
      if (moving.length)
        arrivals.push({
          at: slotNumber(side, action.needle + step.offset, prepared.width),
          loops: moving,
        });
    }
  for (const arrival of arrivals) for (const loop of arrival.loops) held[arrival.at]!.push(loop);
  const actualInventory = new Map<string, TransferLoop['layer']>();
  for (const stack of held)
    for (const loop of stack) {
      if (actualInventory.has(loop.id))
        issues.push({
          message: 'The source pass repeats a live loop identity.',
          pass,
          actual: [loop.id],
        });
      actualInventory.set(loop.id, loop.layer);
    }
  if (
    actualInventory.size !== expectedInventory.size ||
    [...expectedInventory].some(([id, layer]) => actualInventory.get(id) !== layer)
  )
    issues.push({
      message:
        'Post-pass loop inventory differs from incoming loops minus consumed parents plus current reference IDs; live drops are not finishing.',
      pass,
      expected: sorted(expectedInventory.keys()),
      actual: sorted(actualInventory.keys()),
    });
  if (issues.length) return stop();
  context?.progress?.(1, `Replayed source pass ${pass + 1}`);
  return { ok: true, final: occupancy(held, prepared.width), issues: [], matchedParents };
}

/** Independent witness validation: fresh empty start, explicit events only, with no search or desired-state substitution. */
export function validateSchedule(
  source: ScheduleSource,
  events: readonly ScheduleEvent[],
  context?: GenerationContext
): ScheduleValidation {
  cancelled(context);
  const prepared = prepareScheduleSource(source, {
      cancelled: context?.cancelled,
      progress: (fraction, stage) => context?.progress?.(fraction * 0.1, stage),
    }),
    result: ScheduleValidation = {
      ok: false,
      complete: false,
      checkedEvents: 0,
      completedPasses: 0,
      matchedParents: 0,
      final: [],
      issues: [...prepared.issues],
    };
  if (prepared.status !== 'ready') return result;
  if (!Array.isArray(events)) {
    result.issues.push({ message: 'Schedule events must be an array.', pass: null });
    return result;
  }
  const eventContext = (n: number): GenerationContext => ({
    cancelled: context?.cancelled,
    progress: (fraction, stage) =>
      context?.progress?.(0.1 + (0.9 * (n + fraction)) / Math.max(1, events.length), stage),
  });
  // Snapshot actual occupancy after each source pass, including its preserved yarn-free actions.
  // Added phases may temporarily relocate these loops, but unused loops must return before the next pass.
  let baseline = new Map<string, { bed: 'front' | 'back'; needle: number }>();
  for (let n = 0; n < events.length; n++) {
    cancelled(context);
    const event: unknown = events[n],
      next = result.completedPasses;
    const fail = (message: string) =>
      result.issues.push({ message, pass: next < prepared.height ? next : null, event: n });
    if (!record(event)) {
      fail('A schedule event must be an object.');
      return result;
    }
    if (event.kind === 'source-pass') {
      if (!integer(event.pass) || event.pass !== next || next >= prepared.height) {
        fail('Source passes must occur exactly once in original order, starting at pass zero.');
        return result;
      }
      if (next > 0) {
        const consumed = new Set(prepared.byPass[next]!.flatMap((ref) => ref.parents)),
          current = new Map<string, { bed: 'front' | 'back'; needle: number }>(),
          atSlot = new Map<string, string[]>();
        for (const slot of result.final) {
          atSlot.set(
            `${slot.bed}:${slot.needle}`,
            slot.loops.map((loop) => loop.id)
          );
          for (const loop of slot.loops)
            current.set(loop.id, { bed: slot.bed, needle: slot.needle });
        }
        for (const [id, fixed] of baseline)
          if (!consumed.has(id)) {
            const actual = current.get(id);
            if (!actual || actual.bed !== fixed.bed || actual.needle !== fixed.needle) {
              result.issues.push({
                message: `Unused held loop ${id} must retain its fixed final ${fixed.bed} needle ${fixed.needle + 1} before source pass ${next + 1}; ${actual ? `it is at ${actual.bed} needle ${actual.needle + 1}` : 'it is missing'}.`,
                pass: next,
                needle: fixed.needle,
                bed: fixed.bed,
                event: n,
                expected: [id],
                actual: sorted(atSlot.get(`${fixed.bed}:${fixed.needle}`) ?? []),
              });
              return result;
            }
          }
      }
      const run = replaySchedulePass(prepared, next, result.final, eventContext(n));
      if (!run.ok) {
        result.issues.push(...run.issues.map((issue) => ({ ...issue, event: n })));
        return result;
      }
      result.final = run.final;
      baseline = new Map();
      for (const slot of run.final)
        for (const loop of slot.loops)
          baseline.set(loop.id, { bed: slot.bed, needle: slot.needle });
      result.completedPasses++;
      result.matchedParents += run.matchedParents;
    } else if (event.kind === 'transfer-phase') {
      if (
        !integer(event.beforePass) ||
        event.beforePass !== next ||
        next < 1 ||
        next >= prepared.height
      ) {
        fail(
          'Added transfer phases belong only before the next unexecuted source pass, after the first and before the last has run.'
        );
        return result;
      }
      const checked = checkTransferPhases(
        { width: prepared.width, initial: result.final, phases: [event.phase] } as Parameters<
          typeof checkTransferPhases
        >[0],
        eventContext(n)
      );
      if (!checked.ok) {
        result.issues.push(
          ...checked.issues.map((issue) => ({ message: issue.message, pass: next, event: n }))
        );
        return result;
      }
      result.final = checked.final;
    } else {
      fail('Unknown schedule event kind.');
      return result;
    }
    result.checkedEvents++;
    context?.progress?.(
      0.1 + (0.9 * (n + 1)) / Math.max(1, events.length),
      `Checked schedule event ${n + 1} of ${events.length}`
    );
  }
  if (result.completedPasses === prepared.height) {
    const expected = sorted(index(prepared).leaves),
      actual = sorted(result.final.flatMap((slot) => slot.loops.map((loop) => loop.id)));
    if (!sameIds(expected, actual)) {
      result.issues.push({
        message: 'Completed schedule does not retain exactly the unconsumed reference leaves.',
        pass: null,
        expected,
        actual,
      });
      return result;
    }
    result.complete = true;
  }
  result.ok = true;
  return result;
}
