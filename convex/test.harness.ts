// Shared convex-test setup for the backend tests. The second dot in the file
// name keeps it out of the Convex push.
import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** A fresh backend with the presence and AI workpool components registered. */
export function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  workpoolTest.register(t, "aiGenerationWorkpool");
  workpoolTest.register(t, "aiCriticalWorkpool");
  return t;
}

export type Backend = ReturnType<typeof setup>;

export async function view(t: Backend, capability: string) {
  return t.query(api.views.room, { capability });
}

/** Runs every scheduled function and job, jumping the clock as far as they need. */
export async function drainJobs(t: Backend) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** Runs what is due within `ms` without jumping to later timers (e.g. the watchdog). */
export async function runFor(t: Backend, ms: number, step = 100) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    vi.advanceTimersByTime(step);
    await t.finishInProgressScheduledFunctions();
  }
}

/** Marks seats as here; draining jobs jumps the clock past their presence. */
export async function heartbeat(t: Backend, capabilities: string[]) {
  for (const [index, capability] of capabilities.entries()) {
    await t.mutation(api.presence.heartbeat, {
      capability,
      tabId: `${index}`.padStart(16, "0"),
      interval: 5_000,
    });
  }
}
