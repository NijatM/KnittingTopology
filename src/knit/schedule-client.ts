// Disposable whole-program analysis worker. Analysis never changes the source program.
import type { ScheduleLimits, ScheduleSource, ShapingSchedule } from './schedule-types';

export interface ScheduleWorkerInput {
  source: ScheduleSource;
  limits: ScheduleLimits;
}
export type ScheduleWorkerMessage =
  | { type: 'progress'; fraction: number; stage: string }
  | { type: 'result'; result: ShapingSchedule }
  | { type: 'error'; reason: string };

export function buildScheduleInWorker(
  input: ScheduleWorkerInput,
  signal?: AbortSignal,
  onProgress?: (fraction: number, stage: string) => void
): Promise<ShapingSchedule> {
  return new Promise((resolve, reject) => {
    const cancellation = () => new DOMException('Schedule building cancelled.', 'AbortError');
    if (signal?.aborted) {
      reject(cancellation());
      return;
    }
    const worker = new Worker(new URL('../workers/shaping-schedule.worker.ts', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const cleanup = () => {
      settled = true;
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const fail = (cause: unknown) => {
      if (!settled) {
        cleanup();
        reject(cause);
      }
    };
    const abort = () => fail(cancellation());
    worker.onerror = (event) => fail(new Error(event.message || 'Schedule worker failed.'));
    worker.onmessageerror = () => fail(new Error('The schedule worker result could not be read.'));
    worker.onmessage = (event: MessageEvent<ScheduleWorkerMessage>) => {
      if (settled || signal?.aborted) return;
      try {
        const data = event.data;
        if (!data || typeof data !== 'object')
          throw new Error('The schedule worker returned an invalid message.');
        if (data.type === 'progress') {
          if (
            !Number.isFinite(data.fraction) ||
            data.fraction < 0 ||
            data.fraction > 1 ||
            typeof data.stage !== 'string'
          )
            throw new Error('The schedule worker returned invalid progress.');
          onProgress?.(data.fraction, data.stage);
        } else if (data.type === 'error') {
          fail(
            new Error(
              typeof data.reason === 'string' && data.reason
                ? data.reason
                : 'Schedule worker failed.'
            )
          );
        } else if (data.type === 'result') {
          if (
            !data.result ||
            typeof data.result !== 'object' ||
            !['complete', 'unreachable', 'limit', 'invalid', 'unsupported'].includes(
              data.result.status
            ) ||
            typeof data.result.complete !== 'boolean' ||
            data.result.complete !== (data.result.status === 'complete') ||
            !Array.isArray(data.result.events) ||
            !Array.isArray(data.result.reference) ||
            !Array.isArray(data.result.transitions) ||
            !data.result.source ||
            data.result.source.signature !== input.source.signature ||
            !Array.isArray(data.result.source.programBlockers) ||
            !data.result.stats ||
            !data.result.limits ||
            !data.result.validation ||
            !Array.isArray(data.result.validation.final) ||
            !Array.isArray(data.result.validation.issues) ||
            (data.result.complete &&
              (!data.result.validation.ok || !data.result.validation.complete))
          )
            throw new Error('The schedule worker returned an invalid result.');
          cleanup();
          resolve(data.result);
        } else throw new Error('The schedule worker returned an unknown message.');
      } catch (cause) {
        fail(cause);
      }
    };
    signal?.addEventListener('abort', abort, { once: true });
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
