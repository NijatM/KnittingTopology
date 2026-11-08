import { afterEach, describe, expect, it, vi } from 'vitest';
import { planTransitionInWorker, type TransitionPlanInput } from '../../src/knit/plan-client';
import type { TransitionPlanResult } from '../../src/knit/transition-plan';
import { PLAN_DEFAULTS } from '../../src/knit/transfer-planner';
import { TWO } from '../../src/knit/keys';

let workers: FakeWorker[] = [];
class FakeWorker {
  static cloneFailure = false;
  static constructorFailure = false;
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
    if (FakeWorker.constructorFailure) throw new Error('worker unavailable');
    workers.push(this);
    FakeWorker.onConstruct?.();
  }
  terminate() {
    this.terminated++;
  }
  postMessage(message: unknown) {
    if (FakeWorker.cloneFailure) throw new DOMException('not cloneable', 'DataCloneError');
    this.messages.push(message);
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  workers = [];
  FakeWorker.cloneFailure = FakeWorker.constructorFailure = false;
  FakeWorker.onConstruct = undefined;
});
function setup(signature = 'test-source'): TransitionPlanInput {
  vi.stubGlobal('Worker', FakeWorker);
  return {
    source: {
      program: {
        w: 2,
        h: 2,
        key: TWO,
        cells: new Uint8Array(4).fill(1),
        firstDir: 1,
        settings: { mode: 'shape', layerModel: 'shared-reference-v1' },
      },
      surface: { kind: 'plane', revision: 'test-plane' },
      signature,
      referenceMethod: 'test-reference',
      blockers: [],
    },
    beforePass: 2,
    limits: { ...PLAN_DEFAULTS },
  };
}
function result(input: TransitionPlanInput): TransitionPlanResult {
  return {
    status: 'unsupported',
    source: {
      signature: input.source.signature,
      surfaceRevision: input.source.surface.revision,
      referenceMethod: input.source.referenceMethod,
      programBlockers: [],
    },
    request: {
      status: 'unsupported',
      beforePass: input.beforePass,
      width: input.source.program.w,
      height: input.source.program.h,
      initial: null,
      expected: null,
      issues: ['synthetic transport fixture'],
      prefixFindings: [],
      activeTargets: 0,
      heldLoops: 0,
    },
    search: null,
    limits: { ...input.limits },
    issues: ['synthetic transport fixture'],
  };
}

describe('disposable transfer-planning worker lifecycle', () => {
  it('does not construct a worker for an already-aborted request', async () => {
    const input = setup(),
      controller = new AbortController();
    controller.abort();
    await expect(planTransitionInWorker(input, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(workers).toHaveLength(0);
  });

  it('handles cancellation during construction before posting any input', async () => {
    const input = setup(),
      controller = new AbortController();
    FakeWorker.onConstruct = () => controller.abort();
    await expect(planTransitionInWorker(input, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(workers[0]!.terminated).toBe(1);
    expect(workers[0]!.messages).toEqual([]);
  });

  it('hard-terminates on abort and ignores all subsequently delivered events', async () => {
    const input = setup(),
      controller = new AbortController(),
      progress = vi.fn(),
      remove = vi.spyOn(controller.signal, 'removeEventListener'),
      pending = planTransitionInWorker(input, controller.signal, progress),
      worker = workers[0]!;
    worker.emit({ type: 'progress', fraction: 0.2, stage: 'searching' });
    controller.abort();
    worker.emit({ type: 'progress', fraction: 0.9, stage: 'late' });
    worker.emit({ type: 'result', result: result(input) });
    worker.emit({ type: 'error', reason: 'late error' });
    worker.onerror?.({ message: 'late runtime error' });
    worker.onmessageerror?.();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).toHaveBeenCalledExactlyOnceWith(0.2, 'searching');
    expect(worker.terminated).toBe(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('forwards the request and progress, resolves the result, then ignores late deliveries', async () => {
    const input = setup(),
      expected = result(input),
      progress = vi.fn(),
      controller = new AbortController(),
      remove = vi.spyOn(controller.signal, 'removeEventListener'),
      pending = planTransitionInWorker(input, controller.signal, progress),
      worker = workers[0]!;
    expect(worker.url.pathname).toContain('/workers/transfer-plan.worker.ts');
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.messages).toEqual([input]);
    worker.emit({ type: 'progress', fraction: 0.5, stage: 'halfway' });
    worker.emit({ type: 'result', result: expected });
    await expect(pending).resolves.toBe(expected);
    worker.emit({ type: 'progress', fraction: 1, stage: 'late' });
    worker.emit({ type: 'error', reason: 'late' });
    worker.onerror?.({ message: 'late' });
    worker.onmessageerror?.();
    controller.abort();
    expect(progress).toHaveBeenCalledExactlyOnceWith(0.5, 'halfway');
    expect(worker.terminated).toBe(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('cleans up synchronous postMessage clone failure and ignores late messages', async () => {
    const input = setup(),
      controller = new AbortController(),
      progress = vi.fn(),
      remove = vi.spyOn(controller.signal, 'removeEventListener');
    FakeWorker.cloneFailure = true;
    const pending = planTransitionInWorker(input, controller.signal, progress),
      worker = workers[0]!;
    worker.emit({ type: 'progress', fraction: 0.5, stage: 'late' });
    worker.emit({ type: 'result', result: result(input) });
    await expect(pending).rejects.toMatchObject({ name: 'DataCloneError' });
    expect(worker.terminated).toBe(1);
    expect(progress).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('rejects worker construction errors without registering an abort listener', async () => {
    const input = setup(),
      controller = new AbortController(),
      add = vi.spyOn(controller.signal, 'addEventListener');
    FakeWorker.constructorFailure = true;
    await expect(planTransitionInWorker(input, controller.signal)).rejects.toThrow(
      'worker unavailable'
    );
    expect(workers).toHaveLength(0);
    expect(add).not.toHaveBeenCalled();
  });

  it.each(['message', 'runtime', 'decode'] as const)(
    'cleans up a %s error exactly once',
    async (kind) => {
      const input = setup(),
        pending = planTransitionInWorker(input),
        worker = workers[0]!;
      if (kind === 'message') worker.emit({ type: 'error', reason: 'search failed' });
      else if (kind === 'runtime') worker.onerror?.({ message: 'search failed' });
      else worker.onmessageerror?.();
      worker.emit({ type: 'result', result: result(input) });
      worker.onmessageerror?.();
      await expect(pending).rejects.toThrow(
        kind === 'decode' ? 'could not be read' : 'search failed'
      );
      expect(worker.terminated).toBe(1);
    }
  );

  it('cleans up a throwing progress callback instead of leaving a pending request', async () => {
    const input = setup(),
      pending = planTransitionInWorker(input, undefined, () => {
        throw new Error('callback failed');
      });
    workers[0]!.emit({ type: 'progress', fraction: 0.1, stage: 'searching' });
    await expect(pending).rejects.toThrow('callback failed');
    expect(workers[0]!.terminated).toBe(1);
  });

  it.each([
    null,
    {},
    { type: 'unknown' },
    { type: 'result', result: null },
    { type: 'result', result: {} },
    { type: 'progress', fraction: NaN, stage: 'invalid' },
    { type: 'progress', fraction: 2, stage: 'invalid' },
  ])('rejects malformed worker envelopes instead of hanging', async (message) => {
    const pending = planTransitionInWorker(setup());
    workers[0]!.emit(message);
    await expect(pending).rejects.toThrow(/invalid|unknown/);
    expect(workers[0]!.terminated).toBe(1);
  });

  it('keeps concurrent requests independent when one is cancelled', async () => {
    const firstInput = setup('first'),
      secondInput = setup('second'),
      controller = new AbortController(),
      firstProgress = vi.fn(),
      secondProgress = vi.fn(),
      first = planTransitionInWorker(firstInput, controller.signal, firstProgress),
      second = planTransitionInWorker(secondInput, undefined, secondProgress);
    expect(workers).toHaveLength(2);
    expect(workers[0]!.messages).toEqual([firstInput]);
    expect(workers[1]!.messages).toEqual([secondInput]);
    controller.abort();
    workers[0]!.emit({ type: 'progress', fraction: 0.9, stage: 'obsolete' });
    workers[0]!.emit({ type: 'result', result: result(firstInput) });
    workers[1]!.emit({ type: 'progress', fraction: 0.4, stage: 'active' });
    workers[1]!.emit({ type: 'result', result: result(secondInput) });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toEqual(result(secondInput));
    expect(firstProgress).not.toHaveBeenCalled();
    expect(secondProgress).toHaveBeenCalledExactlyOnceWith(0.4, 'active');
    expect(workers.map((worker) => worker.terminated)).toEqual([1, 1]);
  });
});
