import type { CutBuild, CutInput } from './cut-types';

export function generateCutInWorker(
  input: CutInput,
  signal?: AbortSignal,
  progress?: (fraction: number, stage: string) => void
): Promise<CutBuild> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Cut validation cancelled.', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('../workers/cut.worker.ts', import.meta.url), {
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
      reject(new DOMException('Cut validation cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || 'Cut worker failed.'));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error('The cut worker result could not be read.'));
    };
    worker.onmessage = (
      event: MessageEvent<
        | { type: 'progress'; fraction: number; stage: string }
        | { type: 'result'; build: CutBuild }
        | { type: 'error'; reason: string }
      >
    ) => {
      if (settled || signal?.aborted) return;
      const data = event.data;
      if (data.type === 'progress') {
        progress?.(data.fraction, data.stage);
        return;
      }
      cleanup();
      if (data.type === 'error') reject(new Error(data.reason));
      else resolve(data.build);
    };
    try {
      worker.postMessage(input);
    } catch (cause) {
      cleanup();
      reject(cause);
    }
  });
}
