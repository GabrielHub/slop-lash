import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { drainScheduled } from "./test.scheduler";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("a cold scheduled action finishes before its distant watchdog fires", async () => {
  let value: string | null = null;
  let expired = false;
  let work = Promise.resolve();
  const watchdog = setTimeout(() => {
    expired = true;
  }, 30_000);
  setTimeout(() => {
    work = import("./test.scheduler.fixture").then((loaded) => {
      value = loaded.value;
      clearTimeout(watchdog);
    });
  }, 0);

  await drainScheduled({ finishInProgressScheduledFunctions: () => work });

  expect(value).toBe("loaded");
  expect(expired).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

test("drains timers created by the final in-progress action before returning", async () => {
  const completed: number[] = [];
  let joined = false;
  setTimeout(() => completed.push(1), 50);

  await drainScheduled({
    finishInProgressScheduledFunctions: async () => {
      if (joined) return;
      joined = true;
      setTimeout(() => completed.push(2), 50);
    },
  });

  expect(completed).toEqual([1, 2]);
  expect(vi.getTimerCount()).toBe(0);
});

test("fails with a bounded error for recursively scheduled work", async () => {
  let calls = 0;
  const repeat = () => {
    calls += 1;
    setTimeout(repeat, 10);
  };
  setTimeout(repeat, 10);

  await expect(
    drainScheduled({ finishInProgressScheduledFunctions: async () => {} }, 4),
  ).rejects.toThrow("Scheduled work did not settle after 4 timer steps");

  expect(calls).toBe(4);
});

test("propagates an in-progress action failure", async () => {
  await expect(
    drainScheduled({
      finishInProgressScheduledFunctions: async () => {
        throw new Error("action failed");
      },
    }),
  ).rejects.toThrow("action failed");
});
