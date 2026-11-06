import { analyzeImportedMesh, parseMeshFile, validateImportedMesh } from '../import/mesh';
import type { MeshWorkerRequest, ImportResponse } from './import-protocol';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MeshWorkerRequest>) => void) | null;
  postMessage: (message: ImportResponse) => void;
};

scope.onmessage = ({ data: request }) => {
  const { jobId, inputRevision } = request;
  const progress = (fraction: number, stage: string) =>
    scope.postMessage({ type: 'progress', jobId, inputRevision, fraction, stage });
  try {
    if (request.type === 'analyze') {
      progress(0.1, 'Checking saved mesh data');
      const mesh = validateImportedMesh(request.mesh);
      progress(0.3, 'Checking triangle incidence and geometry');
      const report = analyzeImportedMesh(mesh);
      scope.postMessage({ type: 'analysis', jobId, inputRevision, report });
      return;
    }
    const { data, name, format, unit } = request;
    progress(0.02, 'Parsing surface file');
    const { mesh, size } = parseMeshFile(
      data,
      { name, format, unit },
      {
        progress: (fraction, stage) => progress(0.02 + 0.63 * fraction, stage),
      }
    );
    progress(0.68, 'Validating mesh data');
    validateImportedMesh(mesh);
    progress(0.75, 'Checking triangle incidence and geometry');
    const report = analyzeImportedMesh(mesh);
    const surface = {
      kind: 'mesh' as const,
      mesh,
      size,
      curvature: 0,
      revision: crypto.randomUUID(),
    };
    progress(1, 'Surface inspection ready');
    scope.postMessage({ type: 'result', jobId, inputRevision, surface, report });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      jobId,
      inputRevision,
      message: error instanceof Error ? error.message : 'Surface import failed.',
    });
  }
};
