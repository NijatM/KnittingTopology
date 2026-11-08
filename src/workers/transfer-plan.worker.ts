import type { TransitionPlanInput } from '../knit/plan-client';
import { planTransition } from '../knit/transition-plan';

self.onmessage = (event: MessageEvent<TransitionPlanInput>) => {
  try {
    const { source, beforePass, limits } = event.data;
    const result = planTransition(source, beforePass, limits, {
      progress: (fraction, stage) => self.postMessage({ type: 'progress', fraction, stage }),
    });
    self.postMessage({ type: 'result', result });
  } catch (cause) {
    self.postMessage({
      type: 'error',
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
