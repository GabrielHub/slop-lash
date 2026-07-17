import { describe, expect, test } from "vite-plus/test";
import {
  canonicalizeTopicText,
  computeCanonicalTopicKey,
  isCanonicalTopicKey,
} from "./canonical-key";

describe("canonicalizeTopicText", () => {
  test("applies NFKC normalization: full-width characters fold to their ASCII forms", () => {
    expect(canonicalizeTopicText("Ｔａｙｌｏｒ　Ｓｗｉｆｔ")).toBe("taylor swift");
  });

  test("case folds with a locale-stable lowercase", () => {
    expect(canonicalizeTopicText("STUDIO Ghibli MOVIES")).toBe("studio ghibli movies");
  });

  test("normalizes punctuation runs to a single space", () => {
    expect(canonicalizeTopicText("rock'n'roll, y'all!")).toBe("rock n roll y all");
  });

  test("normalizes symbols to a space as well", () => {
    expect(canonicalizeTopicText("cats + dogs = friends")).toBe("cats dogs friends");
  });

  test("collapses whitespace runs and trims the ends", () => {
    expect(canonicalizeTopicText("  the   1990s \t NBA  ")).toBe("the 1990s nba");
  });
});

describe("computeCanonicalTopicKey", () => {
  const base = {
    label: "Studio Ghibli movies",
    scope: "Feature films released through 2024",
    exclusions: [] as readonly string[],
  };

  test("produces a 64-character lowercase hexadecimal key", async () => {
    const key = await computeCanonicalTopicKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(isCanonicalTopicKey(key)).toBe(true);
  });

  test("differently cased and punctuated but equivalent label and scope hash to the same key", async () => {
    const original = await computeCanonicalTopicKey(base);
    const shouted = await computeCanonicalTopicKey({
      label: "STUDIO   Ghibli movies!!!",
      scope: "feature FILMS, released through 2024.",
      exclusions: [],
    });
    expect(shouted).toBe(original);
  });

  test("a different scope produces a different key", async () => {
    const original = await computeCanonicalTopicKey(base);
    const rescoped = await computeCanonicalTopicKey({
      ...base,
      scope: "Short films released through 2024",
    });
    expect(rescoped).not.toBe(original);
  });

  test("exclusions are part of the canonical basis: adding one changes the key", async () => {
    const withoutExclusion = await computeCanonicalTopicKey(base);
    const withExclusion = await computeCanonicalTopicKey({
      ...base,
      exclusions: ["co-productions"],
    });
    expect(withExclusion).not.toBe(withoutExclusion);
  });

  test('empty exclusion entries are ignored: ["", "x"] hashes the same as ["x"]', async () => {
    const withEmptyEntry = await computeCanonicalTopicKey({
      ...base,
      exclusions: ["", "co-productions"],
    });
    const withoutEmptyEntry = await computeCanonicalTopicKey({
      ...base,
      exclusions: ["co-productions"],
    });
    expect(withEmptyEntry).toBe(withoutEmptyEntry);
  });
});

describe("isCanonicalTopicKey", () => {
  test("accepts a real computed key", async () => {
    const key = await computeCanonicalTopicKey({
      label: "1990s NBA",
      scope: "Teams, players, and championships from 1990 through 1999",
      exclusions: [],
    });
    expect(isCanonicalTopicKey(key)).toBe(true);
  });

  test("rejects keys of the wrong length", () => {
    expect(isCanonicalTopicKey("a".repeat(63))).toBe(false);
    expect(isCanonicalTopicKey("a".repeat(65))).toBe(false);
    expect(isCanonicalTopicKey("")).toBe(false);
  });

  test("rejects uppercase hexadecimal", () => {
    expect(isCanonicalTopicKey("A".repeat(64))).toBe(false);
    expect(isCanonicalTopicKey(`${"a".repeat(63)}F`)).toBe(false);
  });

  test("rejects non-hexadecimal characters", () => {
    expect(isCanonicalTopicKey("g".repeat(64))).toBe(false);
    expect(isCanonicalTopicKey(`${"0".repeat(63)}z`)).toBe(false);
  });
});
