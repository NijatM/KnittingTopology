import { useEffect, useReducer, useState } from 'react';
import type { ImportedMeshData, ImportedMeshReport, SurfaceSpec } from '../core/types';
import type { AnalyzeMeshRequest, ImportResponse } from '../workers/import-protocol';

// Immutable mesh objects are shared by history snapshots. Reuse only reports
// computed in this session; serialized reports are never trusted on restore.
const reports = new WeakMap<ImportedMeshData, ImportedMeshReport>();
export function seedMeshReport(mesh: ImportedMeshData, report: ImportedMeshReport) {
  reports.set(mesh, report);
}

export function useMeshReport(surface: SurfaceSpec) {
  const mesh = surface.kind === 'mesh' ? surface.mesh : undefined;
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [failure, setFailure] = useState<{ mesh: ImportedMeshData; message: string } | null>(null);
  useEffect(() => {
    if (!mesh || reports.has(mesh)) return;
    let worker: Worker;
    let active = true;
    const fail = (message: string) => {
      if (active) setFailure({ mesh, message });
    };
    try {
      worker = new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      fail('Mesh analysis worker could not start. Reload to retry.');
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<ImportResponse>) => {
      if (!active || data.jobId !== 1 || data.inputRevision !== 0) return;
      if (data.type === 'analysis') {
        seedMeshReport(mesh, data.report);
        worker.terminate();
        refresh();
      } else if (data.type === 'error') {
        worker.terminate();
        fail(data.message);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      fail('Mesh analysis failed. Reload to retry.');
    };
    worker.onmessageerror = () => {
      worker.terminate();
      fail('Mesh analysis response could not be read. Reload to retry.');
    };
    const request: AnalyzeMeshRequest = { type: 'analyze', jobId: 1, inputRevision: 0, mesh };
    worker.postMessage(request);
    return () => {
      active = false;
      worker.terminate();
    };
  }, [mesh]);
  const report = mesh ? (reports.get(mesh) ?? null) : null;
  const error = failure && failure.mesh === mesh ? failure.message : '';
  return { report, error, loading: !!mesh && !report && !error };
}
