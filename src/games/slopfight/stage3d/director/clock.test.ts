import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_SLOW_MO, HIT_STOP_FRAMES, StageClock, slowMoLengthMs, slowMoScaleAt } from "./clock";

const FRAME = 1 / 60;

function fakeWall(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(seconds: number) {
      now += seconds * 1000;
    },
  };
}

/** Advance the wall and tick the clock by one frame. */
function step(clock: StageClock, wall: ReturnType<typeof fakeWall>, seconds = FRAME) {
  wall.advance(seconds);
  clock.tick(seconds);
}

describe("StageClock", () => {
  test("follows the server clock through the offset", () => {
    const wall = fakeWall();
    const clock = new StageClock({ offsetMs: 2_500, wallNow: wall.now });
    expect(clock.now).toBe(1_002_500);
    step(clock, wall, 0.5);
    expect(clock.now).toBe(1_003_000);
    expect(clock.serverNow()).toBe(1_003_000);
    expect(clock.debtMs).toBe(0);
    expect(clock.delta).toBeCloseTo(0.1);
  });

  test("a hit stop freezes exactly N frames, then time resumes", () => {
    const wall = fakeWall();
    const clock = new StageClock({ wallNow: wall.now });
    step(clock, wall);
    const before = clock.elapsed;
    clock.hitStop();
    for (let i = 0; i < HIT_STOP_FRAMES; i += 1) {
      step(clock, wall);
      expect(clock.frozen || i === HIT_STOP_FRAMES - 1).toBe(true);
      expect(clock.delta).toBe(0);
    }
    expect(clock.elapsed).toBe(before);
    expect(clock.frozen).toBe(false);
    step(clock, wall);
    expect(clock.delta).toBeCloseTo(FRAME);
    // Four frames of debt, which resync drops (and reports).
    expect(clock.debtMs).toBeCloseTo(HIT_STOP_FRAMES * FRAME * 1000);
    expect(clock.resync()).toBeCloseTo(HIT_STOP_FRAMES * FRAME * 1000);
    expect(clock.debtMs).toBe(0);
    expect(clock.now).toBe(clock.serverNow());
  });

  test("settled is false while a hit stop, slow motion or pause runs; resync reports what it drops", () => {
    const wall = fakeWall();
    const dropped: number[] = [];
    const clock = new StageClock({ wallNow: wall.now, onResync: (ms) => dropped.push(ms) });
    expect(clock.settled).toBe(true);
    expect(clock.resync()).toBe(0);
    expect(dropped).toEqual([]);
    clock.hitStop();
    expect(clock.settled).toBe(false);
    for (let i = 0; i < HIT_STOP_FRAMES; i += 1) step(clock, wall);
    expect(clock.settled).toBe(true);
    clock.slowMo();
    expect(clock.settled).toBe(false);
    for (let t = 0; t < slowMoLengthMs() + 50; t += FRAME * 1000) step(clock, wall);
    expect(clock.settled).toBe(true);
    clock.pause();
    expect(clock.settled).toBe(false);
    clock.resume();
    const debt = clock.debtMs;
    expect(clock.resync()).toBe(debt);
    expect(dropped).toEqual([debt]);
  });

  test("slow motion ramps down to the scale, holds, and ramps back to 1x", () => {
    const wall = fakeWall();
    const clock = new StageClock({ wallNow: wall.now });
    clock.slowMo();
    const scales: number[] = [];
    const total = slowMoLengthMs();
    for (let t = 0; t < total + 100; t += FRAME * 1000) {
      step(clock, wall);
      scales.push(clock.scale);
    }
    expect(Math.min(...scales)).toBeCloseTo(DEFAULT_SLOW_MO.scale);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1);
    expect(scales.at(-1)).toBe(1);
    expect(clock.slowMotion).toBe(false);
    // Never faster than real time, so the debt only grows.
    expect(clock.debtMs).toBeGreaterThan(DEFAULT_SLOW_MO.durationMs * (1 - DEFAULT_SLOW_MO.scale) * 0.9);
  });

  test("a slow-motion window requested during a hit stop starts after it", () => {
    const wall = fakeWall();
    const clock = new StageClock({ wallNow: wall.now });
    clock.hitStop(4);
    clock.slowMo();
    for (let i = 0; i < 4; i += 1) {
      step(clock, wall);
      expect(clock.scale).toBe(0);
    }
    step(clock, wall);
    expect(clock.scale).toBeLessThan(1);
    expect(clock.scale).toBeGreaterThan(0);
  });

  test("pausing stops scaled time; resuming continues it", () => {
    const wall = fakeWall();
    const clock = new StageClock({ wallNow: wall.now });
    clock.pause();
    step(clock, wall);
    expect(clock.delta).toBe(0);
    expect(clock.paused).toBe(true);
    clock.resume();
    step(clock, wall);
    expect(clock.delta).toBeCloseTo(FRAME);
  });

  test("a long frame is clamped for animation but not for the server lock", () => {
    const wall = fakeWall();
    const clock = new StageClock({ wallNow: wall.now });
    step(clock, wall, 2);
    expect(clock.delta).toBeCloseTo(0.1);
    expect(clock.now).toBe(clock.serverNow());
  });
});

describe("slowMoScaleAt", () => {
  test("is 1 before, scale in the middle, null after", () => {
    const window = { scale: 0.3, durationMs: 500, rampInMs: 100, rampOutMs: 200 };
    expect(slowMoScaleAt(window, 0)).toBe(1);
    expect(slowMoScaleAt(window, 50)).toBeCloseTo(0.65);
    expect(slowMoScaleAt(window, 300)).toBe(0.3);
    expect(slowMoScaleAt(window, 700)).toBeCloseTo(0.65);
    expect(slowMoScaleAt(window, 799)).toBeCloseTo(1, 1);
    expect(slowMoScaleAt(window, 801)).toBeNull();
  });
});
