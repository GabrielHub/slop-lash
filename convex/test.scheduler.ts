// Scheduled Convex functions load their modules asynchronously. Advancing all
// timers while one is loading fires distant workpool watchdogs before the job
// has even entered its handler. Drain one timer at a time, including imports
// and promise callbacks, so virtual time follows completed work.
import { vi } from "vite-plus/test";

type ScheduledBackend = {
  finishInProgressScheduledFunctions(): Promise<void>;
};

export async function drainScheduled(t: ScheduledBackend, maxSteps = 1_000): Promise<void> {
  for (let step = 0; step < maxSteps; step += 1) {
    await vi.dynamicImportSettled();
    if (vi.getTimerCount() === 0) {
      await t.finishInProgressScheduledFunctions();
      if (vi.getTimerCount() === 0) return;
    }
    await vi.advanceTimersToNextTimerAsync();
  }
  throw new Error(`Scheduled work did not settle after ${maxSteps} timer steps`);
}
