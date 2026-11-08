// One bounded, disposable worker per explicit request. Abort terminates all numerical work.
import type { ProjectState } from '../core/types';
import type { KnitBuild, KnitProgram } from './program';
import { chartMapping, planeMapping, shapeMapping } from './mapping';

export type KnitInput = Pick<ProjectState, 'surface' | 'graph' | 'knit' | 'swatches'>;
export type KnitWorkerBuild =
  { ok: true; program: Omit<KnitProgram, 'mapping'> } | { ok: false; reason: string };
/** Mappings hold functions, which cannot leave the worker; patch pieces carry their own. */
export function withoutMappings(build: KnitBuild): KnitWorkerBuild {
  if (!build.ok) return build;
  const { mapping: _mapping, ...program } = build.program;
  const patches = program.patches && {
    ...program.patches,
    pieces: program.patches.pieces.map((p) => ({
      ...p,
      build: withoutMappings(p.build) as KnitBuild,
    })),
  };
  return { ok: true, program: { ...program, ...(patches ? { patches } : {}) } };
}
/** Restore the mappings removed by `withoutMappings`. */
export function withMappings(build: KnitWorkerBuild, input: KnitInput): KnitBuild {
  if (!build.ok) return build;
  const p = build.program;
  const patches = p.patches && {
    ...p.patches,
    pieces: p.patches.pieces.map((piece) => ({
      ...piece,
      build: withMappings(piece.build as KnitWorkerBuild, input),
    })),
  };
  return {
    ok: true,
    program: {
      ...p,
      ...(patches ? { patches } : {}),
      mapping: p.shape
        ? shapeMapping(p.shape)
        : input.surface.kind !== 'plane' || (p.settings.startEdge && p.settings.startEdge !== 'v0')
          ? chartMapping(input.surface, p.w, p.h, p.settings.startEdge)
          : planeMapping(input.surface, p.w, p.h),
    },
  };
}
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
      try {
        resolve(withMappings(data.build, input));
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
