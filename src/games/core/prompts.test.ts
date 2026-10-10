import { describe, expect, test } from "vite-plus/test";
import { getRandomPrompts } from "./prompts";

describe("prompt bank", () => {
  test("every prompt is written in English, so the whole room can read it", () => {
    const bank = getRandomPrompts(10_000);
    expect(bank.length).toBeGreaterThan(500);
    // ASCII, typographic punctuation and Latin-1 letters (loanwords like "piñata").
    const otherScript = bank.filter((prompt) =>
      /[^\x20-\x7e\u00c0-\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/.test(prompt),
    );
    expect(otherScript).toEqual([]);
    // The removed easter-egg block also held Latin-script lines (Spanish, Dutch, Malay...).
    const nonEnglishOpeners = /^(lo|la|el|het|det|o|cel|ang|perkara|nejhorší|pahin|kötü)\s/i;
    expect(bank.filter((prompt) => nonEnglishOpeners.test(prompt))).toEqual([]);
  });
});

describe("getRandomPrompts", () => {
  test("returns the requested number of prompts", () => {
    const prompts = getRandomPrompts(5);
    expect(prompts).toHaveLength(5);
  });

  test("returns unique prompts (no duplicates)", () => {
    const prompts = getRandomPrompts(20);
    expect(new Set(prompts).size).toBe(20);
  });

  test("returns 0 prompts when count is 0", () => {
    expect(getRandomPrompts(0)).toHaveLength(0);
  });

  test("excludes prompts in the exclude set", () => {
    const first = getRandomPrompts(10);
    const exclude = new Set(first);
    const second = getRandomPrompts(10, exclude);

    for (const prompt of second) {
      expect(exclude.has(prompt)).toBe(false);
    }
  });

  test("returns different results on subsequent calls (randomness)", () => {
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      results.add(getRandomPrompts(1)[0]);
    }
    expect(results.size).toBeGreaterThan(1);
  });
});
