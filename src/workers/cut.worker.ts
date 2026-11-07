import type { CutInput } from '../knit/cut-types';
import { generateCutPlan } from '../knit/cut-presets';
self.onmessage = (event: MessageEvent<CutInput>) => {
  try {
    self.postMessage({
      type: 'result',
      build: generateCutPlan(event.data, {
        progress: (fraction, stage) => self.postMessage({ type: 'progress', fraction, stage }),
      }),
    });
  } catch (cause) {
    self.postMessage({ type: 'error', reason: (cause as Error).message });
  }
};
