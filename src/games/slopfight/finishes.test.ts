import { describe, expect, test } from "vite-plus/test";
import {
  FINISH_EFFECTS,
  finishCoverage,
  finishGroups,
  finishScore,
  finishSpeed,
  isFinished,
  partBulk,
  partFinish,
} from "./finishes";
import { sampleById } from "./samples";
import type { Champion, Part } from "./sheet";
import { FINISHES, type Finish } from "./vocab";

const sample = (id: string): Champion => sampleById(id)!.champion;

const dress = (champion: Champion, finish: Finish, match: (part: Part) => boolean = () => true): Champion => ({
  ...champion,
  parts: champion.parts.map((part) => (match(part) ? { ...part, finish } : part)),
});

const arms = (part: Part) => part.role === "arm";

describe("FINISH_EFFECTS", () => {
  test("vinyl is exactly neutral, so an unfinished champion fights as before", () => {
    expect(FINISH_EFFECTS.vinyl).toEqual({
      hitDamage: 1,
      hitKnockback: 1,
      swing: 1,
      guardDamage: 1,
      guardKnockback: 1,
      weight: 0,
    });
    expect(finishScore("vinyl")).toBe(0);
  });

  test("every finish is a distinct, modest trade-off, and none dominates", () => {
    const signatures = new Set<string>();
    for (const finish of FINISHES) {
      const e = FINISH_EFFECTS[finish];
      for (const value of [e.hitDamage, e.hitKnockback, e.swing, e.guardDamage, e.guardKnockback]) {
        expect(value).toBeGreaterThanOrEqual(0.7);
        expect(value).toBeLessThanOrEqual(1.4);
      }
      expect(Math.abs(e.weight)).toBeLessThanOrEqual(30);
      // Same units and bound as traitScore: prose never buys power.
      expect(Math.abs(finishScore(finish))).toBeLessThanOrEqual(8);
      signatures.add(JSON.stringify(e));
      if (finish === "vinyl") continue;
      // A trade-off, not an upgrade: every finish gives something up.
      const worse = [e.hitDamage < 1, e.hitKnockback < 1, e.swing > 1, e.guardDamage > 1, e.guardKnockback > 1, e.weight < 0];
      expect(worse.some(Boolean), finish).toBe(true);
    }
    expect(signatures.size).toBe(FINISHES.length);
  });

  test("keeps each finish's identity", () => {
    const e = FINISH_EFFECTS;
    // Metal and stone hit hard and swing slow; stone shoves hardest.
    expect(e.metal.hitDamage).toBeGreaterThan(1);
    expect(e.metal.swing).toBeGreaterThan(1);
    expect(e.stone.hitKnockback).toBeGreaterThan(e.metal.hitKnockback);
    expect(e.stone.swing).toBeGreaterThan(e.metal.swing);
    // Crystal is hard but brittle: less damage taken, flies further.
    expect(e.crystal.guardDamage).toBeLessThan(1);
    expect(e.crystal.guardKnockback).toBeGreaterThan(1);
    // Gold is heavy and hard to shove.
    expect(e.gold.guardKnockback).toBeLessThan(1);
    expect(e.gold.weight).toBeLessThan(0);
    // Ice swings quick and sends foes sliding, and slides itself.
    expect(e.ice.swing).toBeLessThan(1);
    expect(e.ice.hitKnockback).toBeGreaterThan(1);
    expect(e.ice.guardKnockback).toBeGreaterThan(1);
    // Lava scorches and crumbles.
    expect(e.lava.hitDamage).toBeGreaterThan(1);
    expect(e.lava.guardDamage).toBeGreaterThan(1);
    // Slime soaks and splats: hard to launch, soft hits.
    expect(e.slime.guardKnockback).toBeLessThan(1);
    expect(e.slime.hitKnockback).toBeLessThan(1);
    // Glow is fast and flimsy.
    expect(e.glow.swing).toBeLessThan(1);
    expect(e.glow.weight).toBeGreaterThan(0);
    expect(e.glow.guardDamage).toBeGreaterThan(1);
  });
});

describe("coverage and speed", () => {
  test("absent means vinyl", () => {
    const cat = sample("cat");
    expect(partFinish(cat.parts[0]!)).toBe("vinyl");
    expect(isFinished(cat)).toBe(false);
    expect(isFinished(dress(cat, "metal", arms))).toBe(true);
    expect(finishSpeed(cat)).toBe(0);
    expect(finishGroups(cat)).toEqual([]);
  });

  test("shares sum to 1 and weigh the torso and mirrors more", () => {
    const cat = sample("cat");
    const coverage = finishCoverage(dress(cat, "gold", arms));
    expect(FINISHES.reduce((sum, finish) => sum + coverage[finish], 0)).toBeCloseTo(1, 9);
    expect(coverage.gold).toBeGreaterThan(0);
    expect(coverage.gold).toBeLessThan(0.5);
    const torso = finishCoverage(dress(cat, "gold", (part) => part.role === "torso")).gold;
    expect(torso).toBeGreaterThan(coverage.gold);
    const part = cat.parts[0]!;
    expect(partBulk({ ...part, mirror: true })).toBe(2 * partBulk({ ...part, mirror: false }));
    expect(finishCoverage({ parts: [] }).vinyl).toBe(1);
  });

  test("speed scales with coverage up to the whole-body weight", () => {
    const cat = sample("cat");
    for (const finish of FINISHES) {
      const whole = finishSpeed(dress(cat, finish));
      expect(whole).toBeCloseTo(FINISH_EFFECTS[finish].weight, 5);
      const partial = finishSpeed(dress(cat, finish, arms));
      expect(Math.abs(partial)).toBeLessThanOrEqual(Math.abs(whole));
      if (FINISH_EFFECTS[finish].weight !== 0) expect(Math.sign(partial)).toBe(Math.sign(whole));
    }
    // Two finishes add up by share.
    const mixed = dress(dress(cat, "glow"), "stone", arms);
    const share = finishCoverage(mixed);
    expect(finishSpeed(mixed)).toBeCloseTo(
      FINISH_EFFECTS.glow.weight * share.glow + FINISH_EFFECTS.stone.weight * share.stone,
      1,
    );
  });

  test("groups finishes for the card, biggest share first", () => {
    const cat = dress(dress(sample("cat"), "metal", arms), "crystal", (part) => part.role === "torso");
    expect(finishGroups(cat).map((group) => group.label)).toEqual(["Crystal body", "Metal arms"]);
    expect(finishGroups(dress(sample("cat"), "gold"))[0]!.label).toBe("Gold everything");
  });
});
