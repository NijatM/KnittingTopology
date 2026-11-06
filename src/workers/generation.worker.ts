import { generatePattern } from '../core/generate';
import { scientificSignature, validateGraphRecord } from '../app/project';
import { MAX_PROJECT_CHARACTERS } from '../core/limits';
import type { GenerateRequest, WorkerResponse } from './protocol';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<GenerateRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};
scope.onmessage = ({ data }) => {
  if (data.type !== 'generate') return;
  const { jobId, inputRevision, input } = data;
  const start = performance.now();
  try {
    const result = generatePattern(input, {
      progress: (fraction, stage) =>
        scope.postMessage({ type: 'progress', jobId, inputRevision, fraction, stage }),
    });
    result.graph.provenance.inputSignature = scientificSignature(input);
    validateGraphRecord(result.graph, input.surface.revision);
    // Reject a result that the supported project reader cannot recover. The reserve
    // covers wrapper/name/diagnostic metadata without duplicating the graph in RAM.
    const persistedSize = JSON.stringify({
      ...input,
      graph: result.graph,
      diagnostics: result.diagnostics,
      statistics: result.statistics,
    }).length;
    if (persistedSize > MAX_PROJECT_CHARACTERS - 4096)
      throw new Error(
        'This result exceeds the 64 MB project budget. Increase spacing or simplify the pattern so it can be saved and reloaded.'
      );
    scope.postMessage({
      type: 'result',
      jobId,
      inputRevision,
      result,
      elapsedMs: performance.now() - start,
    });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      jobId,
      inputRevision,
      message: error instanceof Error ? error.message : 'Generation failed.',
    });
  }
};
