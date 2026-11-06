// One bounded, disposable worker per explicit request. Abort terminates all numerical work.
import type { ProjectState } from '../core/types';
import type { KnitBuild, KnitProgram } from './program';
import { planeMapping, shapeMapping } from './mapping';

export type KnitInput = Pick<ProjectState, 'surface' | 'graph' | 'knit' | 'swatches'>;
export type KnitWorkerBuild =
  { ok: true; program: Omit<KnitProgram, 'mapping'> } | { ok: false; reason: string };
export function generateKnitInWorker(
  input: KnitInput,
  signal?: AbortSignal,
  onProgress?: (fraction: number, stage: string) => void
): Promise<KnitBuild> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Shaping cancelled.', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('../workers/knit.worker.ts', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Shaping cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Shaping worker failed.'));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error('The shaping worker result could not be read.'));
    };
    worker.onmessage = (
      event: MessageEvent<
        | { type: 'progress'; fraction: number; stage: string }
        | { type: 'result'; build: KnitWorkerBuild }
        | { type: 'error'; reason: string }
      >
    ) => {
      if (signal?.aborted || settled) return;
      const data = event.data;
      if (data.type === 'progress') {
        onProgress?.(data.fraction, data.stage);
        return;
      }
      cleanup();
      if (data.type === 'error') {
        reject(new Error(data.reason));
        return;
      }
      const build = data.build;
      if (!build.ok) {
        resolve(build);
        return;
      }
      try {
        const p = build.program;
        resolve({
          ok: true,
          program: {
            ...p,
            mapping: p.shape ? shapeMapping(p.shape) : planeMapping(input.surface, p.w, p.h),
          },
        });
      } catch (cause) {
        reject(cause);
      }
    };
    try {
      worker.postMessage(input);
    } catch (cause) {
      cleanup();
      reject(cause);
    }
  });
}
