import type { KnitInput } from '../knit/client';
import { buildKnitProgram } from '../knit/program';

self.onmessage = (event: MessageEvent<KnitInput>) => {
  try {
    const build = buildKnitProgram(event.data, false, {
      progress: (fraction, stage) => self.postMessage({ type: 'progress', fraction, stage }),
    });
    if (!build.ok) self.postMessage({ type: 'result', build });
    else {
      const { mapping: _mapping, ...program } = build.program;
      self.postMessage({ type: 'result', build: { ok: true, program } });
    }
  } catch (error) {
    self.postMessage({ type: 'error', reason: (error as Error).message });
  }
};
