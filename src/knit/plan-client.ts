// One disposable worker per selected-transition analysis. Abort terminates the search itself.
import type { TransitionPlanResult, TransitionSource } from './transition-plan';
import type { PlanLimits } from './transfer-planner';

export interface TransitionPlanInput {
  source: TransitionSource;
  beforePass: number;
  limits: PlanLimits;
}
export type TransitionPlanMessage =
  | { type: 'progress'; fraction: number; stage: string }
  | { type: 'result'; result: TransitionPlanResult }
  | { type: 'error'; reason: string };

export function planTransitionInWorker(
  input: TransitionPlanInput,
  signal?: AbortSignal,
  onProgress?: (fraction: number, stage: string) => void
): Promise<TransitionPlanResult> {
  return new Promise((resolve, reject) => {
    const cancellation = () => new DOMException('Transfer planning cancelled.', 'AbortError');
    if (signal?.aborted) {
      reject(cancellation());
      return;
    }
    const worker = new Worker(new URL('../workers/transfer-plan.worker.ts', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const cleanup = () => {
      settled = true;
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const fail = (cause: unknown) => {
      if (settled) return;
      cleanup();
      reject(cause);
    };
    const abort = () => fail(cancellation());
    worker.onerror = (event) =>
      fail(new Error(event.message || 'Transfer planning worker failed.'));
    worker.onmessageerror = () =>
      fail(new Error('The transfer planning worker result could not be read.'));
    worker.onmessage = (event: MessageEvent<TransitionPlanMessage>) => {
      if (settled || signal?.aborted) return;
      try {
        const data = event.data;
        if (!data || typeof data !== 'object')
          throw new Error('The transfer planning worker returned an invalid message.');
        if (data.type === 'progress') {
          if (
            !Number.isFinite(data.fraction) ||
            data.fraction < 0 ||
            data.fraction > 1 ||
            typeof data.stage !== 'string'
          )
            throw new Error('The transfer planning worker returned invalid progress.');
          onProgress?.(data.fraction, data.stage);
        } else if (data.type === 'error') {
          fail(
            new Error(
              typeof data.reason === 'string' && data.reason
                ? data.reason
                : 'Transfer planning worker failed.'
            )
          );
        } else if (data.type === 'result') {
          if (
            !data.result ||
            typeof data.result !== 'object' ||
            !['found', 'unreachable', 'limit', 'invalid', 'unsupported'].includes(
              data.result.status
            )
          )
            throw new Error('The transfer planning worker returned an invalid result.');
          cleanup();
          resolve(data.result);
        } else throw new Error('The transfer planning worker returned an unknown message.');
      } catch (cause) {
        fail(cause);
      }
    };
    signal?.addEventListener('abort', abort, { once: true });
    // Also catch cancellation triggered during worker construction, before the listener existed.
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(input);
    } catch (cause) {
      fail(cause);
    }
  });
}
