import { describe, expect, test } from "vite-plus/test";
import { stableHash } from "./hash";

describe("stableHash", () => {
  test("is deterministic: the same seed always hashes to the same value", () => {
    const seed = "game-42:7:ROUND_RESULTS";
    expect(stableHash(seed)).toBe(stableHash(seed));
  });

  test("matches the FNV-1a 32-bit offset basis for the empty string", () => {
    expect(stableHash("")).toBe(0x811c9dc5);
  });

  test("differs for different seeds (spot check)", () => {
    expect(stableHash("game-42:1:TOPIC_REVEAL")).not.toBe(stableHash("game-42:2:TOPIC_REVEAL"));
    expect(stableHash("a")).not.toBe(stableHash("b"));
    expect(stableHash("game-1:1:ANSWER")).not.toBe(stableHash("game-2:1:ANSWER"));
  });

  test("returns an unsigned 32-bit integer", () => {
    for (const seed of ["", "a", "game-42:7:ROUND_RESULTS"]) {
      const hash = stableHash(seed);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
  });
});
