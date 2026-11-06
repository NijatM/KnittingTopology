import type { ImportedMeshData, ImportedMeshReport, MeshUnit, SurfaceSpec } from '../core/types';

export interface ImportRequest {
  type: 'import';
  jobId: number;
  inputRevision: number;
  data: ArrayBuffer;
  name: string;
  format: 'obj' | 'stl';
  unit: MeshUnit;
}

export interface AnalyzeMeshRequest {
  type: 'analyze';
  jobId: number;
  inputRevision: number;
  mesh: ImportedMeshData;
}

export type MeshWorkerRequest = ImportRequest | AnalyzeMeshRequest;

export type ImportResponse =
  | { type: 'progress'; jobId: number; inputRevision: number; fraction: number; stage: string }
  | {
      type: 'result';
      jobId: number;
      inputRevision: number;
      surface: SurfaceSpec;
      report: ImportedMeshReport;
    }
  | { type: 'analysis'; jobId: number; inputRevision: number; report: ImportedMeshReport }
  | { type: 'error'; jobId: number; inputRevision: number; message: string };

export function acceptsImportResult(
  activeJobId: number | null,
  currentRevision: number,
  message: Pick<ImportResponse, 'jobId' | 'inputRevision'>
): boolean {
  return activeJobId === message.jobId && currentRevision === message.inputRevision;
}
