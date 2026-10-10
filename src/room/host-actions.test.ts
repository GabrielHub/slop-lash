import { describe, expect, test } from "vite-plus/test";
import { isHostClocked } from "./host-actions";

const room = {
  status: "PLAYING",
  phaseDeadline: null,
  timersDisabled: true,
  awaitingAi: false,
};

describe("isHostClocked", () => {
  test("a clockless phase in a no-timers room waits on the host", () => {
    expect(isHostClocked(room)).toBe(true);
  });

  test("a phase waiting on the AI is never host-paced, even with timers off", () => {
    expect(isHostClocked({ ...room, awaitingAi: true })).toBe(false);
  });

  test("a running clock, timers on, or a room not playing is not host-paced", () => {
    expect(isHostClocked({ ...room, phaseDeadline: 1_000 })).toBe(false);
    expect(isHostClocked({ ...room, timersDisabled: false })).toBe(false);
    expect(isHostClocked({ ...room, status: "FINISHED" })).toBe(false);
  });
});
