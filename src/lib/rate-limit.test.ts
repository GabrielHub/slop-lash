import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("test-allow", 5, 10_000)).toBe(true);
    }
  });

  it("rejects requests exceeding the limit", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("test-reject", 5, 10_000);
    }
    expect(checkRateLimit("test-reject", 5, 10_000)).toBe(false);
  });

  it("allows requests after window expires", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("test-expire", 5, 10_000);
    }
    expect(checkRateLimit("test-expire", 5, 10_000)).toBe(false);

    vi.advanceTimersByTime(10_001);
    expect(checkRateLimit("test-expire", 5, 10_000)).toBe(true);
  });

  it("tracks different keys independently", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("key-a", 5, 10_000);
    }
    expect(checkRateLimit("key-a", 5, 10_000)).toBe(false);
    expect(checkRateLimit("key-b", 5, 10_000)).toBe(true);
  });

  it("uses default values when not specified", () => {
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit("test-defaults")).toBe(true);
    }
    expect(checkRateLimit("test-defaults")).toBe(false);
  });
});
