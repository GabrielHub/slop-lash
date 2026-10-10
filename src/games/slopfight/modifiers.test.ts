import { describe, expect, test } from "vite-plus/test";
import { ARENAS } from "./arenas";
import {
  BRAIN_FLAGS,
  MatchupNoteSchema,
  MODIFIER_KEYS,
  MODIFIER_SPECS,
  NOTE_FAVOR_CAP,
  TRAIT_EFFECTS,
  formatEffect,
  modifierScore,
  neutralModifiers,
  resolveModifiers,
  traitScore,
  type MatchupNote,
  type ModifierKey,
} from "./modifiers";
import type { BodyPlan, Champion, Trait } from "./sheet";
import { TRAITS } from "./vocab";

function fighter(traits: Trait[], bodyPlan: BodyPlan = "BIPED"): Champion {
  return {
    bodyPlan,
    palette: { primary: "lime", secondary: "moss", accent: "butter" },
    parts: [
      { id: "torso", role: "torso", shape: "sphere", size: "M", elongation: "normal", parent: null, anchor: null, color: "primary", mirror: false },
    ],
    face: { eyes: "round", mouth: "smile" },
    item: null,
    stats: { heft: 3, reach: 3, chaos: 3 },
    moves: [
      { name: "Bonk", type: "STRIKE", power: 3, delivery: "head" },
      { name: "Hug", type: "GRAPPLE", power: 3, delivery: "body" },
      { name: "Wiggle", type: "TRICK", power: 3, delivery: "body" },
    ],
    traits,
    temperament: { aggression: 0.5, caution: 0.5, showboating: 0.5 },
    name: "Blob",
    bio: "A blob.",
    narration: { walkOn: ["a", "b"], landHit: ["a", "b", "c"], takeHit: ["a", "b"], win: ["a", "b"], lose: ["a", "b"], ringOut: ["a", "b"] },
  };
}

const PLAIN = fighter(["loud", "sneaky"]);
const note = (side: "A" | "B", modifies: ModifierKey, value: number): MatchupNote => ({
  side,
  modifies,
  value,
  reason: "Because the arena said so.",
});

/** A tiny seeded generator for property tests (no Math.random). */
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("modifier specs", () => {
  test("every key has a sane range around its neutral value", () => {
    for (const key of MODIFIER_KEYS) {
      const spec = MODIFIER_SPECS[key];
      expect(spec.min).toBeLessThanOrEqual(spec.base);
      expect(spec.base).toBeLessThanOrEqual(spec.max);
      expect(spec.noteMin).toBeLessThanOrEqual(0);
      expect(spec.noteMax).toBeGreaterThan(0);
      expect(spec.weight).not.toBe(0);
    }
    expect(MODIFIER_SPECS.strikePower).toMatchObject({ kind: "additive", min: -2, max: 2 });
    expect(MODIFIER_SPECS.reach).toMatchObject({ kind: "additive", min: -1, max: 1 });
    expect(MODIFIER_SPECS.selfDamageOnHitTaken).toMatchObject({ kind: "flat", min: 0, max: 20 });
    expect(MODIFIER_SPECS.pushImmune.kind).toBe("flag");
  });
});

describe("trait effects", () => {
  test("every trait does something, and no trait dominates", () => {
    const signatures = new Set<string>();
    for (const trait of TRAITS) {
      const effect = TRAIT_EFFECTS[trait];
      expect(effect.effects.length + (effect.brain?.length ?? 0)).toBeGreaterThan(0);
      expect(Math.abs(traitScore(trait))).toBeLessThanOrEqual(8);
      signatures.add(JSON.stringify(effect));
      for (const flag of effect.brain ?? []) expect(BRAIN_FLAGS).toContain(flag);
    }
    expect(signatures.size).toBe(TRAITS.length);
  });

  test("format as short card text", () => {
    expect(formatEffect({ key: "strikePower", value: 1 })).toBe("Strike +1");
    expect(formatEffect({ key: "speed", value: -10 })).toBe("Speed -10%");
    expect(formatEffect({ key: "grapplePower", value: -1, target: "foe" })).toBe("Foe grapple -1");
    expect(formatEffect({ key: "pushImmune", value: 1 })).toBe("Can't be pushed");
    expect(formatEffect({ key: "selfDamageOnHitTaken", value: 15 })).toBe("Self-damage per hit taken +15");
  });
});

describe("resolveModifiers", () => {
  test("applies trait effects to self and foe", () => {
    const { A, B } = resolveModifiers(fighter(["spiky", "armed"]), PLAIN, "ROOFTOP", []);
    expect(A.strikePower).toBe(1);
    expect(A.grapplePower).toBe(-1);
    expect(A.speed).toBe(0.9);
    expect(B.grapplePower).toBe(-1);
  });

  test("folds in arena hazards keyed by trait and body plan", () => {
    const garage = resolveModifiers(fighter(["electric", "aquatic"]), fighter(["loud", "sneaky"], "HOPPER"), "FLOODED_GARAGE", []);
    expect(garage.A.selfDamageOnHitTaken).toBe(15);
    expect(garage.A.speed).toBeCloseTo(1.15 * 0.95, 2);
    expect(garage.A.hazards).toEqual([]);
    expect(garage.B.hazards).toEqual(["waterLanding"]);

    const kitchen = resolveModifiers(fighter(["tiny", "loud"]), fighter(["heavy", "loud"]), "KITCHEN_COUNTER", []);
    expect(kitchen.A.hurtbox).toBe(0.7); // 0.85 x 0.8 = 0.68, clamped
    expect(kitchen.B.hazards).toEqual(["counterCrack"]);
    expect(kitchen.A.hazards).toEqual([]);

    const roof = resolveModifiers(fighter(["heavy", "stubborn"]), fighter(["loud", "sneaky"], "FLIER"), ARENAS.ROOFTOP, []);
    expect(roof.A.strikeKnockbackImmune).toBe(true);
    expect(roof.A.pushImmune).toBe(true);
    expect(roof.A.hazards).toEqual([]);
    expect(roof.B.reach).toBe(1);
    expect(roof.B.hazards).toEqual(["wind"]);
  });

  test("clamps every key to its range", () => {
    const { A } = resolveModifiers(fighter(["electric", "explosive", "heavy", "armored"]), fighter(["frosty", "stinky"]), "FLOODED_GARAGE", []);
    expect(A.selfDamageOnHitTaken).toBe(20);
    expect(A.speed).toBe(0.6);
  });

  test("passes brain flags through, relentless over cowardly", () => {
    const { A, B } = resolveModifiers(fighter(["smug", "sleepy"]), fighter(["cowardly", "relentless"]), "ROOFTOP", []);
    expect(A.brain.showboatsAfterHit).toBe(true);
    expect(A.brain.slowStarter).toBe(true);
    expect(A.brain.erratic).toBe(false);
    expect(B.brain.neverRetreats).toBe(true);
    expect(B.brain.retreatsWhenLow).toBe(false);
  });

  test("applies a small note in full and clamps note values to their range", () => {
    const result = resolveModifiers(PLAIN, PLAIN, "ROOFTOP", [note("B", "strikePower", -1), note("A", "speed", 99)]);
    expect(result.B.strikePower).toBe(-2); // sneaky's -1, then the note's -1
    expect(result.notes[0]).toMatchObject({ value: -1, favors: "A", score: 8, capped: false, dropped: false });
    expect(result.notes[1]!.note.value).toBe(30);
    expect(result.notes[1]!.capped).toBe(true);
    expect(result.A.speed).toBeCloseTo(1 + 7 / 60, 3);
  });

  test("caps the advantage notes give one side, scaling numbers and dropping flags", () => {
    const result = resolveModifiers(PLAIN, PLAIN, "ROOFTOP", [
      note("A", "strikePower", 2),
      note("B", "grapplePower", -1),
      note("A", "grappleImmune", 1),
      note("B", "speed", 10),
    ]);
    expect(result.notes.map((n) => [n.favors, n.score, n.capped, n.dropped])).toEqual([
      ["A", 15, true, false],
      ["A", 0, false, true],
      ["A", 0, false, true],
      ["B", 6, false, false],
    ]);
    expect(result.A.strikePower).toBe(0.875); // sneaky's -1 plus the note scaled to 1.875
    expect(result.B.grapplePower).toBe(0);
    expect(result.A.grappleImmune).toBe(false);
    expect(result.B.speed).toBe(1.1);
  });

  test("never lets notes give either side more than the cap (property test)", () => {
    const random = lcg(1234);
    const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
    for (let round = 0; round < 300; round += 1) {
      const a = fighter([pick(TRAITS), pick(TRAITS)]);
      const b = fighter([pick(TRAITS), pick(TRAITS)]);
      const notes = Array.from({ length: 1 + Math.floor(random() * 6) }, () =>
        note(pick(["A", "B"] as const), pick(MODIFIER_KEYS), Math.round((random() * 80 - 40) * 10) / 10),
      );
      const arena = pick(["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"] as const);
      const withNotes = resolveModifiers(a, b, arena, notes);
      const without = resolveModifiers(a, b, arena, []);
      for (const side of ["A", "B"] as const) {
        const favor = withNotes.notes.filter((n) => n.favors === side).reduce((sum, n) => sum + n.score, 0);
        expect(favor).toBeLessThanOrEqual(NOTE_FAVOR_CAP + 0.01);
      }
      const tilt =
        modifierScore(withNotes.A) - modifierScore(without.A) - (modifierScore(withNotes.B) - modifierScore(without.B));
      expect(Math.abs(tilt)).toBeLessThanOrEqual(NOTE_FAVOR_CAP + 0.5); // final rounding
      expect(withNotes.notes.length).toBeLessThanOrEqual(4);
      expect(resolveModifiers(a, b, arena, notes)).toEqual(withNotes);
    }
  });

  test("is pure: same output every time, inputs untouched, junk notes ignored", () => {
    const a = fighter(["hungry", "slimy"]);
    const notes = [note("A", "damageDealt", 12), { ...note("B", "reach", Number.NaN) }];
    const before = JSON.stringify([a, notes]);
    const first = resolveModifiers(a, PLAIN, "KITCHEN_COUNTER", notes);
    expect(resolveModifiers(a, PLAIN, "KITCHEN_COUNTER", notes)).toEqual(first);
    expect(JSON.stringify([a, notes])).toBe(before);
    expect(first.B.reach).toBe(0);
    expect(first.A.damageDealt).toBe(1.12);
  });

  test("neutral modifiers score zero", () => {
    expect(modifierScore(neutralModifiers())).toBe(0);
  });
});

describe("MatchupNoteSchema", () => {
  test("parses a model note", () => {
    const parsed = MatchupNoteSchema.parse({
      side: "B",
      modifies: "grappleImmune",
      value: 1,
      reason: "Jellyfish cannot be grappled",
    });
    expect(parsed.modifies).toBe("grappleImmune");
    expect(Object.keys(MatchupNoteSchema.shape)).toEqual(["side", "modifies", "value", "reason"]);
  });
});
