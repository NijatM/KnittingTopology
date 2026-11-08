import type { ScheduleWorkerInput } from '../knit/schedule-client';
import { buildShapingSchedule } from '../knit/shaping-schedule';

self.onmessage = (event: MessageEvent<ScheduleWorkerInput>) => {
  let lastTime = -Infinity,
    lastStage = '';
  try {
    const result = buildShapingSchedule(event.data.source, event.data.limits, {
      progress: (fraction, stage) => {
        const now = performance.now();
        // Search counters change in every report; only a semantic stage change bypasses throttling.
        const stageKey = stage.replace(/\d+(?:\.\d+)?/g, '#');
        if (lastTime === -Infinity || stageKey !== lastStage || now - lastTime >= 50) {
          self.postMessage({ type: 'progress', fraction, stage });
          lastTime = now;
          lastStage = stageKey;
        }
      },
    });
    self.postMessage({ type: 'result', result });
  } catch (cause) {
    self.postMessage({
      type: 'error',
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
