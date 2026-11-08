import type { KnitInput } from '../knit/client';
import { buildKnitProgram } from '../knit/program';
import { withoutMappings } from '../knit/client';

self.onmessage = (event: MessageEvent<KnitInput>) => {
  try {
    const build = buildKnitProgram(event.data, false, {
      progress: (fraction, stage) => self.postMessage({ type: 'progress', fraction, stage }),
    });
    self.postMessage({ type: 'result', build: withoutMappings(build) });
  } catch (error) {
    self.postMessage({ type: 'error', reason: (error as Error).message });
  }
};
