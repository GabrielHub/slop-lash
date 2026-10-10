import { describe, expect, test } from "vite-plus/test";
import {
  ARENA_IDS,
  ARENAS,
  HAZARD_CARD_MAX,
  isOverFloor,
  isRingOut,
  pickArenaOrder,
  platformColliders,
  ringOutDistance,
  windFor,
  windStrengthAt,
  type Box,
} from "./arenas";
import { MODIFIER_KEYS } from "./modifiers";
import { TOY_COLORS } from "./vocab";

const area = (box: Box) => (box.max[0] - box.min[0]) * (box.max[2] - box.min[2]);
const overlapsXZ = (box: Box, pit: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  box.min[0] < pit.maxX && box.max[0] > pit.minX && box.min[2] < pit.maxZ && box.max[2] > pit.minZ;

describe("arena catalog", () => {
  test("three arenas with names, moods, accents and the spec's landing sounds", () => {
    expect(Object.keys(ARENAS)).toEqual([...ARENA_IDS]);
    expect(ARENAS.FLOODED_GARAGE.ringOutLanding).toBe("splash");
    expect(ARENAS.KITCHEN_COUNTER.ringOutLanding).toBe("clang");
    expect(ARENAS.ROOFTOP.ringOutLanding).toBe("thud");
    for (const id of ARENA_IDS) {
      const arena = ARENAS[id];
      expect(arena.id).toBe(id);
      expect(arena.name.length).toBeGreaterThan(0);
      expect(arena.spokenName.toLowerCase()).toContain(arena.name.toLowerCase());
      expect(arena.mood.length).toBeGreaterThan(10);
      expect(TOY_COLORS).toContain(arena.accent);
    }
  });

  test("two or three hazards each, short cards, valid effects, dynamic ids paired", () => {
    for (const arena of Object.values(ARENAS)) {
      expect(arena.hazards.length).toBeGreaterThanOrEqual(2);
      expect(arena.hazards.length).toBeLessThanOrEqual(3);
      for (const hazard of arena.hazards) {
        expect(hazard.card.length).toBeLessThanOrEqual(HAZARD_CARD_MAX);
        for (const rule of hazard.rules) {
          for (const effect of rule.effects) expect(MODIFIER_KEYS).toContain(effect.key);
        }
      }
      const carded = arena.hazards.flatMap((hazard) => (hazard.dynamic ? [hazard.dynamic] : []));
      expect(carded.sort()).toEqual(arena.dynamic.map((hazard) => hazard.id).sort());
    }
    expect(ARENAS.ROOFTOP.dynamic.map((hazard) => hazard.id)).toEqual(["wind"]);
    expect(ARENAS.FLOODED_GARAGE.dynamic.map((hazard) => hazard.id)).toEqual(["waterLanding"]);
    expect(ARENAS.KITCHEN_COUNTER.dynamic.map((hazard) => hazard.id)).toEqual(["counterCrack"]);
  });
});

describe("pickArenaOrder", () => {
  test("is a deterministic permutation that varies with the seed", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      const order = pickArenaOrder(seed);
      expect([...order].sort()).toEqual([...ARENA_IDS].sort());
      expect(pickArenaOrder(seed)).toEqual(order);
      seen.add(order.join());
    }
    expect(seen.size).toBe(6);
    expect(pickArenaOrder("game-42")).toEqual(pickArenaOrder("game-42"));
  });
});

describe("wind", () => {
  test("is derived from the seed alone: an axis direction and a period in range", () => {
    const edges = new Set<string>();
    for (let seed = 0; seed < 100; seed += 1) {
      const wind = windFor(seed);
      expect(windFor(seed)).toEqual(wind);
      expect(Math.abs(wind.direction[0]) + Math.abs(wind.direction[1])).toBe(1);
      expect(wind.periodMs).toBeGreaterThanOrEqual(4_500);
      expect(wind.periodMs).toBeLessThanOrEqual(6_500);
      expect(wind.firstGustMs).toBeGreaterThanOrEqual(2_000);
      expect(wind.firstGustMs).toBeLessThanOrEqual(3_500);
      edges.add(wind.edge);
    }
    expect(edges.size).toBe(4);
  });

  test("gusts ramp up, hold, ramp down and repeat every period", () => {
    const wind = { ...windFor(7), firstGustMs: 2_000, periodMs: 5_000, gustMs: 1_800, rampMs: 400 };
    expect(windStrengthAt(wind, 0)).toBe(0);
    expect(windStrengthAt(wind, 1_999)).toBe(0);
    expect(windStrengthAt(wind, 2_200)).toBe(0.5);
    expect(windStrengthAt(wind, 3_000)).toBe(1);
    expect(windStrengthAt(wind, 3_600)).toBe(0.5);
    expect(windStrengthAt(wind, 4_000)).toBe(0);
    expect(windStrengthAt(wind, 8_000)).toBe(1);
  });
});

describe("geometry", () => {
  test("spawns sit on the floor, mirrored, equally far from every drop", () => {
    for (const arena of Object.values(ARENAS)) {
      const { A, B } = arena.geometry.spawns;
      expect(A[0]).toBe(-B[0]);
      expect(A[2]).toBe(B[2]);
      expect(isOverFloor(arena.geometry, A[0], A[2])).toBe(true);
      expect(ringOutDistance(arena.geometry, A[0], A[2])).toBeCloseTo(
        ringOutDistance(arena.geometry, B[0], B[2]),
        9,
      );
    }
  });

  test("ring-out: below -0.6 or out of bounds", () => {
    const geometry = ARENAS.ROOFTOP.geometry;
    expect(isRingOut(geometry, [0, 0.5, 0])).toBe(false);
    expect(isRingOut(geometry, [3.4, 0.2, 0])).toBe(false);
    expect(isRingOut(geometry, [0, -0.61, 0])).toBe(true);
    expect(isRingOut(geometry, [5.1, 1, 0])).toBe(true);
    expect(isRingOut(geometry, [0, 9, 0])).toBe(true);
  });

  test("ringOutDistance ignores walls and counts the sink", () => {
    expect(ringOutDistance(ARENAS.FLOODED_GARAGE.geometry, 0, 0)).toBe(3);
    const kitchen = ARENAS.KITCHEN_COUNTER.geometry;
    expect(ringOutDistance(kitchen, 0, 0)).toBeCloseTo(1.4, 9);
    expect(ringOutDistance(kitchen, 2.5, -2.9)).toBeCloseTo(0.5, 9);
    expect(ringOutDistance(kitchen, 0, -2)).toBeLessThan(0);
    expect(isOverFloor(kitchen, 0, -2)).toBe(false);
    expect(ringOutDistance(ARENAS.ROOFTOP.geometry, 2.9, 0)).toBeCloseTo(0.1, 9);
  });

  test("colliders tile the platform around the sink and add lips and walls", () => {
    for (const arena of Object.values(ARENAS)) {
      const geometry = arena.geometry;
      const slab = platformColliders(geometry).filter(
        (box) => box.max[1] === geometry.topY && box.min[1] === geometry.topY - geometry.thickness,
      );
      const pitArea = geometry.pits.reduce(
        (sum, pit) => sum + (pit.maxX - pit.minX) * (pit.maxZ - pit.minZ),
        0,
      );
      expect(slab.reduce((sum, box) => sum + area(box), 0)).toBeCloseTo(36 - pitArea, 9);
      for (const box of slab) {
        for (const pit of geometry.pits) expect(overlapsXZ(box, pit)).toBe(false);
      }
      for (const box of platformColliders(geometry)) {
        for (let axis = 0; axis < 3; axis += 1) expect(box.min[axis]!).toBeLessThan(box.max[axis]!);
      }
    }
    expect(platformColliders(ARENAS.ROOFTOP.geometry)).toHaveLength(1);
    expect(platformColliders(ARENAS.FLOODED_GARAGE.geometry)).toHaveLength(5);
    const walls = platformColliders(ARENAS.KITCHEN_COUNTER.geometry).filter(
      (box) => box.max[1] > 1,
    );
    expect(walls).toHaveLength(1);
    expect(walls[0]!.max[2]).toBe(-3);
  });
});
