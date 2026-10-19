import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vite-plus/test";
import { ARENAS, dryHalfAt, finaleFor, windFor } from "../../arenas";
import {
  createStageFinale,
  floodDryHalf,
  floodRise,
  lightningAt,
  placeOnStage,
  publishFinale,
  relaxFinale,
  tiltBody,
  waterLevelAt,
} from "./finale";

const LIMIT_MS = 30_000;

describe("stage finale state", () => {
  it("holds the strength where it was when the fight ended, like the sim", () => {
    const finale = finaleFor("KITCHEN_COUNTER", 3, LIMIT_MS);
    const state = createStageFinale();
    const endMs = finale.startMs + 1_000;
    publishFinale(state, "KITCHEN_COUNTER", finale, null, endMs, endMs);
    const atEnd = state.strength;
    expect(atEnd).toBeGreaterThan(0);
    expect(atEnd).toBeLessThan(1);
    publishFinale(state, "KITCHEN_COUNTER", finale, null, endMs + 4_000, endMs);
    expect(state.strength).toBe(atEnd);
    expect(state.driven).toBe(true);
  });

  it("eases back to calm once no fight drives it", () => {
    const finale = finaleFor("FLOODED_GARAGE", 7, LIMIT_MS);
    const state = createStageFinale();
    publishFinale(state, "FLOODED_GARAGE", finale, null, finale.startMs + 8_000, null);
    expect(state.strength).toBe(1);
    relaxFinale(state, 1 / 60);
    expect(state.strength).toBe(1);
    state.driven = false;
    let previous = state.strength;
    for (let i = 0; i < 90 && state.spec; i += 1) {
      relaxFinale(state, 1 / 60);
      expect(state.strength).toBeLessThan(previous);
      previous = state.strength;
    }
    expect(state.spec).toBeNull();
    expect(state.strength).toBe(0);
  });

  it("drives the rooftop's wind with the storm", () => {
    const finale = finaleFor("ROOFTOP", 8, LIMIT_MS);
    const state = createStageFinale();
    publishFinale(state, "ROOFTOP", finale, windFor(8), finale.startMs + 5_000, null);
    // The storm's steady wind never drops below 0.4, even between gusts.
    expect(state.wind).toBeGreaterThanOrEqual(0.4);
    expect(Math.hypot(state.dirX, state.dirZ)).toBeCloseTo(1);
  });
});

describe("kitchen tilt", () => {
  const finale = finaleFor("KITCHEN_COUNTER", 3, LIMIT_MS);
  const state = createStageFinale();
  // Past the start's shudder: the tilt is the sim's angle exactly.
  publishFinale(state, "KITCHEN_COUNTER", finale, null, finale.startMs + 6_000, null);
  const [dx, dz] = finale.direction!;
  const half = ARENAS.KITCHEN_COUNTER.geometry.halfSize;

  it("takes the downhill edge down and lifts the uphill one", () => {
    const downhill = placeOnStage(state, new Vector3(dx * half, 0, dz * half));
    const uphill = placeOnStage(state, new Vector3(-dx * half, 0, -dz * half));
    const angle = finale.spec.id === "tilt" ? finale.spec.angle : 0;
    expect(downhill.y).toBeCloseTo(-Math.sin(angle) * half, 5);
    expect(uphill.y).toBeCloseTo(Math.sin(angle) * half, 5);
  });

  it("leaves a body that has fallen to the floor where the sim has it", () => {
    const fallen = new Vector3(dx * 4, -3, dz * 4);
    expect(placeOnStage(state, fallen.clone()).toArray()).toEqual(fallen.toArray());
  });

  it("tips a body's whole group the same way as its points", () => {
    const position = new Vector3();
    const quaternion = new Quaternion();
    tiltBody(state, 0.4, position, quaternion);
    const local = new Vector3(dx * 2.5, 0.4, dz * 2.5 + 0.3);
    const drawn = local.clone().applyQuaternion(quaternion).add(position);
    const placed = placeOnStage(state, local.clone());
    expect(drawn.distanceTo(placed)).toBeLessThan(1e-6);
  });
});

describe("garage flood", () => {
  const geometry = ARENAS.FLOODED_GARAGE.geometry;
  const spec = ARENAS.FLOODED_GARAGE.finale;
  const finale = finaleFor("FLOODED_GARAGE", 7, LIMIT_MS);

  it("draws the waterline exactly where the sim's dry floor ends", () => {
    const state = createStageFinale();
    for (const after of [0, 1_000, 2_500, 4_000, 9_000]) {
      publishFinale(state, "FLOODED_GARAGE", finale, null, finale.startMs + after, null);
      expect(spec.id).toBe("flood");
      if (spec.id !== "flood") return;
      expect(floodDryHalf(state, geometry)).toBe(dryHalfAt(geometry, spec, state.strength));
    }
  });

  it("puts a ring-out's splash on the water: the flood sheet over the pad, the risen surround past it", () => {
    const state = createStageFinale();
    expect(waterLevelAt(state, geometry, 4, 0)).toBe(geometry.surround.y);
    publishFinale(state, "FLOODED_GARAGE", finale, null, finale.startMs + 9_000, null);
    if (spec.id !== "flood") throw new Error("the garage floods");
    expect(waterLevelAt(state, geometry, 2.5, 0)).toBe(spec.waterY);
    expect(waterLevelAt(state, geometry, 4, 0)).toBeCloseTo(geometry.surround.y + floodRise(state));
    expect(floodRise(state)).toBeGreaterThan(0);
    expect(geometry.surround.y + floodRise(state)).toBeLessThan(geometry.topY);
  });
});

describe("storm lightning", () => {
  it("cracks at the storm's start and flickers out between strikes", () => {
    expect(lightningAt(-10)).toBe(0);
    expect(lightningAt(0)).toBe(1);
    expect(lightningAt(1_000)).toBe(0);
    expect(lightningAt(2_960)).toBeGreaterThan(0.3);
  });

  it("keeps striking through sudden death", () => {
    const strikes = [];
    for (let t = 10_000; t < 30_000; t += 10) if (lightningAt(t) > 0.3 && lightningAt(t - 10) <= 0.3) strikes.push(t);
    expect(strikes.length).toBeGreaterThanOrEqual(4);
  });
});
