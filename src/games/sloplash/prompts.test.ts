import { describe, it, expect } from "vitest";
import { getRandomPrompts } from "@/games/core/prompts";

describe("getRandomPrompts", () => {
  it("returns the requested number of prompts", () => {
    const prompts = getRandomPrompts(5);
    expect(prompts).toHaveLength(5);
  });

  it("returns unique prompts (no duplicates)", () => {
    const prompts = getRandomPrompts(20);
    expect(new Set(prompts).size).toBe(20);
  });

  it("returns 0 prompts when count is 0", () => {
    expect(getRandomPrompts(0)).toHaveLength(0);
  });

  it("excludes prompts in the exclude set", () => {
    const first = getRandomPrompts(10);
    const exclude = new Set(first);
    const second = getRandomPrompts(10, exclude);

    for (const prompt of second) {
      expect(exclude.has(prompt)).toBe(false);
    }
  });

  it("returns different results on subsequent calls (randomness)", () => {
    const results = new Set<string>();
    // Run a few times and collect first prompts — at least 2 different values
    for (let i = 0; i < 10; i++) {
      results.add(getRandomPrompts(1)[0]);
    }
    expect(results.size).toBeGreaterThan(1);
  });
});
