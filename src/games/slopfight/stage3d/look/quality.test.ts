import { describe, expect, test } from "vite-plus/test";
import {
  FrameBudget,
  QUALITY_LADDER,
  QualityController,
  parseQualityParam,
  settingsForLevel,
} from "./quality";

describe("quality ladder", () => {
  test("gives things back in the spec's order: post, then shadows, then mesh", () => {
    const postRank = { full: 0, reduced: 1, minimal: 2 } as const;
    const meshRank = { high: 0, medium: 1, low: 2 } as const;
    let firstPostDrop = -1;
    let firstShadowDrop = -1;
    let firstMeshDrop = -1;
    for (let level = 1; level < QUALITY_LADDER.length; level += 1) {
      const prev = QUALITY_LADDER[level - 1]!;
      const next = QUALITY_LADDER[level]!;
      expect(postRank[next.post]).toBeGreaterThanOrEqual(postRank[prev.post]);
      expect(next.shadowMapSize).toBeLessThanOrEqual(prev.shadowMapSize);
      expect(meshRank[next.meshResolution]).toBeGreaterThanOrEqual(meshRank[prev.meshResolution]);
      if (firstPostDrop < 0 && next.post !== prev.post) firstPostDrop = level;
      if (firstShadowDrop < 0 && next.shadowMapSize !== prev.shadowMapSize) firstShadowDrop = level;
      if (firstMeshDrop < 0 && next.meshResolution !== prev.meshResolution) firstMeshDrop = level;
    }
    expect(firstPostDrop).toBe(1);
    expect(firstShadowDrop).toBeGreaterThan(firstPostDrop);
    expect(firstMeshDrop).toBeGreaterThan(firstShadowDrop);
  });

  test("tiers map to rungs and levels clamp", () => {
    expect(settingsForLevel(-3).tier).toBe("high");
    expect(settingsForLevel(99).tier).toBe("low");
    expect(QUALITY_LADDER.map((rung) => rung.level)).toEqual([0, 1, 2, 3]);
  });

  test("parses ?quality=", () => {
    expect(parseQualityParam("?quality=low")).toBe("low");
    expect(parseQualityParam("quality=medium&debug=1")).toBe("medium");
    expect(parseQualityParam("?quality=ultra")).toBeNull();
    expect(parseQualityParam("")).toBeNull();
    expect(parseQualityParam(null)).toBeNull();
  });
});

describe("FrameBudget", () => {
  const run = (budget: FrameBudget, frameMs: number, fromMs: number, toMs: number) => {
    let dropped = false;
    for (let t = fromMs; t < toMs; t += frameMs) dropped = budget.sample(frameMs, t) || dropped;
    return dropped;
  };

  test("never drops while frames are on budget", () => {
    const budget = new FrameBudget();
    expect(run(budget, 16.7, 0, 30_000)).toBe(false);
  });

  test("drops after sustained slow frames, past the warmup", () => {
    const budget = new FrameBudget({ warmupMs: 4_000, windowMs: 2_000, strikes: 2 });
    expect(run(budget, 33, 0, 4_000)).toBe(false);
    expect(run(budget, 33, 4_000, 7_900)).toBe(false);
    expect(run(budget, 33, 7_900, 9_000)).toBe(true);
  });

  test("ignores hitches (tab switches, shader compiles)", () => {
    const budget = new FrameBudget({ warmupMs: 0 });
    let dropped = false;
    for (let t = 0; t < 20_000; t += 16) {
      dropped = budget.sample(t % 1_000 < 16 ? 900 : 16, t) || dropped;
    }
    expect(dropped).toBe(false);
  });
});

describe("QualityController", () => {
  test("manual selection pins an automatic controller even on the same rung, and auto resumes", () => {
    const quality = new QualityController({ budget: { warmupMs: 0, windowMs: 500, strikes: 1 } });
    quality.set("high");
    expect(quality.auto).toBe(false);
    for (let t = 0; t < 2_000; t += 40) quality.sampleFrame(40, t);
    expect(quality.level).toBe(0);
    quality.set(null, 2_000);
    expect(quality.auto).toBe(true);
    for (let t = 2_000; t < 2_600; t += 40) quality.sampleFrame(40, t);
    expect(quality.level).toBe(1);
  });

  test("auto resumes a previously pinned controller without resetting its quality", () => {
    const quality = new QualityController({ tier: "medium", budget: { warmupMs: 0, windowMs: 500, strikes: 1 } });
    quality.set(null);
    expect(quality.auto).toBe(true);
    expect(quality.level).toBe(1);
    for (let t = 0; t < 600; t += 40) quality.sampleFrame(40, t);
    expect(quality.level).toBe(2);
  });

  test("auto mode steps down one rung at a time and stops at the bottom", () => {
    const quality = new QualityController({ budget: { warmupMs: 0, windowMs: 500, strikes: 1 } });
    let changes = 0;
    quality.subscribe(() => {
      changes += 1;
    });
    let t = 0;
    while (t < 60_000) {
      quality.sampleFrame(40, t);
      t += 40;
    }
    expect(quality.level).toBe(QUALITY_LADDER.length - 1);
    expect(quality.tier).toBe("low");
    expect(changes).toBe(QUALITY_LADDER.length - 1);
  });

  test("a pinned tier never auto-downgrades", () => {
    const quality = new QualityController({ tier: "medium", budget: { warmupMs: 0, windowMs: 500, strikes: 1 } });
    for (let t = 0; t < 10_000; t += 50) quality.sampleFrame(50, t);
    expect(quality.tier).toBe("medium");
    expect(quality.level).toBe(1);
    quality.set("low");
    expect(quality.settings.meshResolution).toBe("low");
  });
});
