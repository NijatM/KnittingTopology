import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScheduleInWorker, type ScheduleWorkerInput } from '../../src/knit/schedule-client';
import type { ShapingSchedule } from '../../src/knit/schedule-types';
import { buildShapingSchedule, SCHEDULE_DEFAULTS } from '../../src/knit/shaping-schedule';
import { TWO } from '../../src/knit/keys';

vi.mock('../../src/knit/shaping-schedule', async (original) => {
  const actual = await original<typeof import('../../src/knit/shaping-schedule')>();
  return { ...actual, buildShapingSchedule: vi.fn() };
});
let workers: FakeWorker[] = [];
class FakeWorker {
  static cloneFailure = false;
  static onConstruct: (() => void) | undefined;
  terminated = 0;
  messages: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor(
    readonly url: URL,
    readonly options: { type: string }
  ) {
    workers.push(this);
    FakeWorker.onConstruct?.();
  }
  terminate() {
    this.terminated++;
  }
  postMessage(value: unknown) {
    if (FakeWorker.cloneFailure) throw new DOMException('not cloneable', 'DataCloneError');
    this.messages.push(value);
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(buildShapingSchedule).mockReset();
  workers = [];
  FakeWorker.cloneFailure = false;
  FakeWorker.onConstruct = undefined;
});
function input(signature = 'synthetic'): ScheduleWorkerInput {
  vi.stubGlobal('Worker', FakeWorker);
  return {
    source: {
      program: {
        w: 1,
        h: 1,
        key: TWO,
        firstDir: 1,
        cells: new Uint8Array([1]),
        settings: { mode: 'shape', layerModel: 'shared-reference-v1' },
      },
      surface: { kind: 'plane', revision: 'synthetic-plane' },
      signature,
      referenceMethod: 'synthetic transport fixture',
      blockers: ['retained blocker'],
    },
    limits: { ...SCHEDULE_DEFAULTS, perTransition: { ...SCHEDULE_DEFAULTS.perTransition } },
  };
}
function output(
  request: ScheduleWorkerInput,
  status: ShapingSchedule['status'] = 'complete'
): ShapingSchedule {
  const complete = status === 'complete';
  return {
    status,
    complete,
    source: {
      signature: request.source.signature,
      surfaceRevision: request.source.surface.revision,
      referenceMethod: request.source.referenceMethod,
      programBlockers: [...request.source.blockers],
    },
    width: 1,
    height: 1,
    canonical: null,
    reference: [],
    events: [],
    transitions: [],
    limits: request.limits,
    stop: complete ? null : { pass: 0, message: 'synthetic partial result' },
    validation: {
      ok: true,
      complete,
      checkedEvents: 0,
      completedPasses: complete ? 1 : 0,
      matchedParents: 0,
      final: [],
      issues: [],
    },
    stats: { testedMoves: 0, retainedStates: 0, expandedStates: 0, addedPhases: 0 },
  };
}

describe('disposable complete-schedule worker transport', () => {
  it('avoids pre-aborted work and closes a cancellation race during construction', async () => {
    const request = input(),
      controller = new AbortController();
    controller.abort();
    await expect(buildScheduleInWorker(request, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(workers).toHaveLength(0);
    const raced = new AbortController();
    FakeWorker.onConstruct = () => raced.abort();
    await expect(buildScheduleInWorker(request, raced.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(workers[0]!.messages).toEqual([]);
    expect(workers[0]!.terminated).toBe(1);
  });

  it('hard-terminates on abort, removes its listener and ignores late progress/results/errors', async () => {
    const request = input(),
      controller = new AbortController(),
      remove = vi.spyOn(controller.signal, 'removeEventListener'),
      progress = vi.fn(),
      pending = buildScheduleInWorker(request, controller.signal, progress),
      worker = workers[0]!;
    worker.emit({ type: 'progress', fraction: 0.2, stage: 'active' });
    controller.abort();
    worker.emit({ type: 'progress', fraction: 0.8, stage: 'obsolete' });
    worker.emit({ type: 'result', result: output(request) });
    worker.emit({ type: 'error', reason: 'obsolete' });
    worker.onerror?.({ message: 'obsolete' });
    worker.onmessageerror?.();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(1);
    expect(progress).toHaveBeenCalledExactlyOnceWith(0.2, 'active');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('delivers complete and partial outcomes, preserving source blockers and independent workers', async () => {
    const first = input('first'),
      second = input('second'),
      a = buildScheduleInWorker(first),
      b = buildScheduleInWorker(second),
      full = output(first),
      partial = output(second, 'limit');
    expect(workers[0]!.options).toEqual({ type: 'module' });
    expect(workers[0]!.url.pathname).toContain('shaping-schedule.worker.ts');
    expect(workers[0]!.messages).toEqual([first]);
    expect(workers[1]!.messages).toEqual([second]);
    workers[1]!.emit({ type: 'result', result: partial });
    await expect(b).resolves.toBe(partial);
    workers[1]!.emit({ type: 'result', result: full });
    workers[0]!.emit({ type: 'result', result: full });
    await expect(a).resolves.toBe(full);
    expect(full.source.programBlockers).toEqual(['retained blocker']);
    expect(workers.map((w) => w.terminated)).toEqual([1, 1]);
  });

  it('keeps an active job independent when another is cancelled', async () => {
    const first = input('cancelled'),
      second = input('active'),
      controller = new AbortController(),
      progress = vi.fn(),
      a = buildScheduleInWorker(first, controller.signal),
      b = buildScheduleInWorker(second, undefined, progress);
    controller.abort();
    workers[0]!.emit({ type: 'result', result: output(first) });
    workers[1]!.emit({ type: 'progress', fraction: 0.5, stage: 'active' });
    workers[1]!.emit({ type: 'result', result: output(second) });
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await expect(b).resolves.toMatchObject({ complete: true });
    expect(progress).toHaveBeenCalledExactlyOnceWith(0.5, 'active');
    expect(workers.map((w) => w.terminated)).toEqual([1, 1]);
  });

  it('cleans up clone failures, runtime errors and unreadable messages once', async () => {
    for (const kind of ['clone', 'runtime', 'decode', 'error'] as const) {
      const request = input(),
        controller = new AbortController(),
        remove = vi.spyOn(controller.signal, 'removeEventListener');
      FakeWorker.cloneFailure = kind === 'clone';
      const pending = buildScheduleInWorker(request, controller.signal),
        worker = workers[workers.length - 1]!;
      FakeWorker.cloneFailure = false;
      if (kind === 'runtime') worker.onerror?.({ message: 'runtime failure' });
      if (kind === 'decode') worker.onmessageerror?.();
      if (kind === 'error') worker.emit({ type: 'error', reason: 'analysis failure' });
      worker.emit({ type: 'result', result: output(request) });
      worker.onmessageerror?.();
      await expect(pending).rejects.toBeInstanceOf(Error);
      expect(worker.terminated).toBe(1);
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    }
  });

  it('rejects malformed status/progress and throwing callbacks instead of leaving pending work', async () => {
    const request = input();
    const unverified = output(request);
    unverified.validation.ok = false;
    for (const message of [
      { type: 'result', result: { status: 'found' } },
      { type: 'result', result: { status: 'complete' } },
      { type: 'result', result: unverified },
      {
        type: 'result',
        result: {
          ...output(request),
          source: { ...output(request).source, signature: 'superseded-source' },
        },
      },
      { type: 'result', result: null },
      { type: 'progress', fraction: NaN, stage: 'bad' },
      { type: 'progress', fraction: 1.1, stage: 'bad' },
      { type: 'unknown' },
    ]) {
      const pending = buildScheduleInWorker(input()),
        worker = workers[workers.length - 1]!;
      worker.emit(message);
      await expect(pending).rejects.toThrow(/invalid|unknown/);
      expect(worker.terminated).toBe(1);
    }
    const pending = buildScheduleInWorker(input(), undefined, () => {
        throw new Error('callback failure');
      }),
      worker = workers[workers.length - 1]!;
    worker.emit({ type: 'progress', fraction: 0.1, stage: 'active' });
    await expect(pending).rejects.toThrow('callback failure');
    expect(worker.terminated).toBe(1);
  });

  it('throttles actual worker progress by semantic stage and 50 ms without timing fields in results', async () => {
    const request = input(),
      result = output(request),
      postMessage = vi.fn(),
      surface: {
        onmessage: ((event: { data: ScheduleWorkerInput }) => void) | null;
        postMessage: typeof postMessage;
      } = { onmessage: null, postMessage };
    vi.stubGlobal('self', surface);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.mocked(buildShapingSchedule).mockImplementation((_source, _limits, context) => {
      context?.progress?.(0.1, 'Transfer search: 10 retained states, 20 tested moves');
      now = 10;
      context?.progress?.(0.2, 'Transfer search: 11 retained states, 30 tested moves');
      now = 30;
      context?.progress?.(0.3, 'Transfer search: 12 retained states, 40 tested moves');
      now = 51;
      context?.progress?.(0.4, 'Transfer search: 13 retained states, 50 tested moves');
      now = 52;
      context?.progress?.(0.5, 'Replayed source pass 1');
      now = 60;
      context?.progress?.(0.6, 'Replayed source pass 2');
      return result;
    });
    await import('../../src/workers/shaping-schedule.worker');
    surface.onmessage!({ data: request });
    expect(postMessage.mock.calls.map(([message]) => message.type)).toEqual([
      'progress',
      'progress',
      'progress',
      'result',
    ]);
    expect(postMessage.mock.calls.slice(0, 3).map(([message]) => message.fraction)).toEqual([
      0.1, 0.4, 0.5,
    ]);
    expect(postMessage.mock.calls[3]![0]).toEqual({ type: 'result', result });
    vi.mocked(buildShapingSchedule).mockImplementation((_source, _limits, context) => {
      context?.progress?.(0.1, 'Replayed source pass 2');
      throw new Error('worker-side failure');
    });
    surface.onmessage!({ data: request });
    expect(postMessage.mock.calls.slice(-2).map(([message]) => message.type)).toEqual([
      'progress',
      'error',
    ]);
    expect(postMessage.mock.calls.at(-1)![0]).toEqual({
      type: 'error',
      reason: 'worker-side failure',
    });
  });
});
