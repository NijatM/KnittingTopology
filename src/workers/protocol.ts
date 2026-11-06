import type { GenerationInput, GenerationResult } from '../core/types';
export interface GenerateRequest {
  type: 'generate';
  jobId: number;
  inputRevision: number;
  input: GenerationInput;
}
export type WorkerResponse =
  | { type: 'progress'; jobId: number; inputRevision: number; fraction: number; stage: string }
  | {
      type: 'result';
      jobId: number;
      inputRevision: number;
      result: GenerationResult;
      elapsedMs: number;
    }
  | { type: 'error'; jobId: number; inputRevision: number; message: string };
export function acceptsResult(
  activeJobId: number | null,
  currentRevision: number,
  message: Pick<WorkerResponse, 'jobId' | 'inputRevision'>
): boolean {
  return activeJobId === message.jobId && currentRevision === message.inputRevision;
}
