import { beforeAll, describe, expect, it } from "vite-plus/test";
import { ARENAS, ARENA_IDS, type ArenaId } from "../arenas";
import { FINISH_EFFECTS } from "../finishes";
import { resolveModifiers } from "../modifiers";
import { sampleById } from "../samples";
import { stableStringify, type Champion, type Part } from "../sheet";
import type { Finish } from "../vocab";
import { readState } from "./collision";
import { createFighter, delivererFinish, strikeWindupMs, type Fighter } from "./fighter";
import { moveHit } from "./hits";
import { loadRapier, runFight, type FightEvent, type FightInput, type Rapier } from "./index";

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

const champion = (id: string): Champion => sampleById(id)!.champion;

const dress = (c: Champion, finish: Finish, match: (part: Part) => boolean = () => true): Champion => ({
  ...c,
  parts: c.parts.map((part) => (match(part) ? { ...part, finish } : part)),
});
const arms = (part: Part) => part.role === "arm";
const torso = (part: Part) => part.role === "torso";

const input = (a: Champion, b: Champion, arena: ArenaId, seed: number, limitMs = 30_000): FightInput => ({
  seed,
  arena,
  a,
  b,
  notes: [],
  limitMs,
});

/** Two fighters standing in a fresh world, states read, as a fight's step would see them. */
function standoff(a: Champion, b: Champion, seed = 9): { att: Fighter; def: Fighter; free: () => void } {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  const arena = ARENAS.ROOFTOP;
  const mods = resolveModifiers(a, b, "ROOFTOP", []);
  const att = createFighter(R, world, "A", a, mods.A, b, mods.B, arena, seed);
  const def = createFighter(R, world, "B", b, mods.B, a, mods.A, arena, seed);
  readState(att);
  readState(def);
  return { att, def, free: () => world.free() };
}

/** One strike resolved by the hit code, with a fresh (same-seeded) attacker each time. */
function strike(attackFinish: Finish, guardFinish: Finish) {
  const { att, def, free } = standoff(champion("cat"), champion("corgi"));
  try {
    att.move = { index: 0, type: "STRIKE", effPower: 4 } as unknown as Fighter["move"];
    return moveHit(att, def, "strike", 1, [0, 0.5, 0], attackFinish, guardFinish);
  } finally {
    free();
  }
}

const hits = (events: FightEvent[]) =>
  events.filter((event): event is Extract<FightEvent, { kind: "hit" }> => event.kind === "hit");

describe("finishes in the hit code", () => {
  it("makes a metal strike hit harder than the same vinyl strike", () => {
    const vinyl = strike("vinyl", "vinyl");
    const metal = strike("metal", "vinyl");
    expect(vinyl.miracle).toBe(metal.miracle);
    expect(metal.damage).toBeGreaterThan(vinyl.damage);
    expect(metal.dv).toBeGreaterThan(vinyl.dv);
    expect(metal.attackFinish).toBe("metal");
    expect(metal.guardFinish).toBe("vinyl");
  });

  it("makes a hit on crystal do less damage and more knockback", () => {
    const vinyl = strike("vinyl", "vinyl");
    const crystal = strike("vinyl", "crystal");
    expect(crystal.damage).toBeLessThan(vinyl.damage);
    expect(crystal.dv).toBeGreaterThan(vinyl.dv);
    expect(crystal.guardFinish).toBe("crystal");
  });

  it("multiplies the attacker's and the struck part's finishes", () => {
    const vinyl = strike("vinyl", "vinyl");
    const both = strike("stone", "slime");
    expect(both.dv / vinyl.dv).toBeCloseTo(
      FINISH_EFFECTS.stone.hitKnockback * FINISH_EFFECTS.slime.guardKnockback,
      9,
    );
  });

  it("makes a metal arm swing slower and a glow arm quicker than vinyl", () => {
    const cat = champion("cat");
    const { att, free } = standoff(dress(cat, "metal", arms), champion("corgi"));
    try {
      const vinyl = strikeWindupMs(att, 4, 1, "vinyl");
      expect(strikeWindupMs(att, 4, 1, "metal")).toBeGreaterThan(vinyl);
      expect(strikeWindupMs(att, 4, 1, "glow")).toBeLessThan(vinyl);
    } finally {
      free();
    }
  });

  it("knows what each move is delivered with", () => {
    const cat = dress(dress(champion("cat"), "metal", arms), "crystal", torso);
    const { att, free } = standoff(cat, champion("corgi"));
    try {
      const armRoot = att.def.bodies.findIndex((body, index) => index > 0 && body.role === "arm");
      expect(delivererFinish(att, armRoot, "arm")).toBe("metal");
      expect(delivererFinish(att, 0, "body")).toBe("crystal");
      // The proxy keeps every shape's finish, welded parts included.
      for (const body of att.def.bodies) expect(body.finishes).toHaveLength(body.shapes.length);
      expect(att.shapes.filter((shape) => shape.body === 0)[0]!.finish).toBe("crystal");
    } finally {
      free();
    }
    const raccoon = dress(champion("raccoon-lawyer"), "gold", (part) => part.role === "item");
    const held = standoff(raccoon, champion("corgi"));
    try {
      expect(held.att.itemFinish).toBe("gold");
      expect(delivererFinish(held.att, held.att.itemRoot, "item")).toBe("gold");
      // The arm holding it is still vinyl for its other moves.
      expect(delivererFinish(held.att, held.att.itemRoot, "arm")).toBe("vinyl");
    } finally {
      held.free();
    }
  });
});

describe("finishes in a fight", () => {
  it("tags hit events with non-vinyl finishes only, never with an undefined key", () => {
    const metalCat = dress(champion("cat"), "metal", arms);
    const crystalCorgi = dress(champion("corgi"), "crystal", torso);
    let attack = 0;
    let guard = 0;
    for (const arena of ARENA_IDS) {
      for (const seed of [3, 4]) {
        const { events } = runFight(R, input(metalCat, crystalCorgi, arena, seed));
        for (const hit of hits(events)) {
          for (const key of ["attackFinish", "guardFinish"] as const) {
            if (key in hit) expect(hit[key]).not.toBe("vinyl");
            if (key in hit) expect(hit[key]).toBeDefined();
          }
          if (hit.side === "A" && hit.attackFinish === "metal") attack += 1;
          if (hit.side === "A" && hit.guardFinish === "crystal") guard += 1;
          // The corgi's only finish is its torso; the cat's are its arms (struck ones too).
          if (hit.side === "A") expect([undefined, "metal"]).toContain(hit.attackFinish);
          if (hit.side === "A") expect([undefined, "crystal"]).toContain(hit.guardFinish);
          if (hit.side === "B") expect([undefined, "crystal"]).toContain(hit.attackFinish);
          if (hit.side === "B") expect([undefined, "metal"]).toContain(hit.guardFinish);
        }
      }
    }
    expect(attack).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(0);
  });

  it("leaves an all-vinyl fight's events without finish keys", () => {
    const { events } = runFight(R, input(champion("cat"), champion("crab"), "ROOFTOP", 11));
    expect(hits(events).length).toBeGreaterThan(0);
    for (const event of events) {
      expect("attackFinish" in event).toBe(false);
      expect("guardFinish" in event).toBe(false);
    }
  });

  it("is deterministic with finished champions", () => {
    const a = dress(dress(champion("robot"), "metal", arms), "gold", torso);
    const b = dress(champion("octopus"), "slime");
    for (const arena of ARENA_IDS) {
      const fight = input(a, b, arena, 20261016, 20_000);
      const first = runFight(R, fight);
      const second = runFight(R, fight);
      expect(second).toEqual(first);
      expect(stableStringify(second.events)).toBe(stableStringify(first.events));
      expect(second.hash).toBe(first.hash);
    }
  });
});
