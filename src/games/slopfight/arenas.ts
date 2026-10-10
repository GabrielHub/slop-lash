// The arena catalog. Play geometry is canonical here: the server sim never
// loads a GLB, so the Blender sets are built around these numbers. Hazards are
// data: trait and body-plan rules that resolveModifiers() folds into each
// fighter's modifiers, plus dynamic hazards the sim implements by id.
//
// Axes: y is up and the platform top is y = 0. +z is downstage (toward the
// default camera and the crowd), -z is upstage (the back wall), +x is stage
// right as the camera sees it. Fighter A spawns at -x facing +x.

import { mixedHash, seededShuffle } from "../../lib/hash";
import type { ModifierEffect } from "./modifiers";
import type { BodyPlan, ToyColor, Trait } from "./vocab";

export const ARENA_IDS = ["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"] as const;
export type ArenaId = (typeof ARENA_IDS)[number];

export type RingOutLanding = "splash" | "clang" | "thud";
export type Vec3 = readonly [x: number, y: number, z: number];
export interface Box {
  min: Vec3;
  max: Vec3;
}

/** A hole in the platform (the kitchen sink). Falling in is a ring-out like any other drop. */
export interface PitRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Depth of the basin floor below the platform top. */
  depth: number;
}

export const EDGE_SIDES = ["front", "back", "left", "right"] as const;
export type EdgeSide = (typeof EDGE_SIDES)[number];
/** open: a bare drop. lip: a low curb that marks the drop. wall: solid, no ring-out on that side. */
export type EdgeKind = "open" | "lip" | "wall";

export interface ArenaGeometry {
  /** The platform is 2 x halfSize square, centred on the origin. */
  halfSize: number;
  topY: number;
  thickness: number;
  edges: Readonly<Record<EdgeSide, EdgeKind>>;
  lip: { height: number; width: number };
  wall: { height: number; thickness: number };
  pits: readonly PitRect[];
  /** A torso below this height is rung out. */
  ringOutY: number;
  /** A torso outside this box is rung out too (swatted fliers, huge throws). */
  outOfBounds: { halfSize: number; ceilingY: number };
  /** What lies below the edges, for the renderer and the landing beat. */
  surround: { kind: "water" | "floor" | "street"; y: number };
  spawns: { A: Vec3; B: Vec3 };
}

export type HazardCondition = { trait: Trait } | { bodyPlan: BodyPlan } | { everyone: true };

export interface HazardRule {
  when: HazardCondition;
  effects: readonly ModifierEffect[];
}

export type DynamicHazardId = "wind" | "waterLanding" | "counterCrack";

export interface Hazard {
  id: string;
  title: string;
  /** Face-off card line, at most 70 characters. */
  card: string;
  rules: readonly HazardRule[];
  /** The dynamic hazard this card explains, if any. */
  dynamic: DynamicHazardId | null;
}

/** Gusts toward one edge. Timing and direction come from the fight seed (windFor). */
export interface WindHazard {
  id: "wind";
  appliesTo: HazardCondition;
  periodMinMs: number;
  periodStepMs: number;
  periodSteps: number;
  gustMs: number;
  rampMs: number;
  firstGustMinMs: number;
  firstGustStepMs: number;
  firstGustSteps: number;
  /** Horizontal acceleration at full gust, units/s^2. pushImmune fighters ignore it. */
  accel: number;
}

/** Hoppers land in water: a longer landing recovery and a slower next hop. */
export interface WaterLandingHazard {
  id: "waterLanding";
  appliesTo: HazardCondition;
  extraRecoveryMs: number;
  hopSpeedFactor: number;
}

/** Heavy fighters landing hard crack the counter and stagger themselves. */
export interface CounterCrackHazard {
  id: "counterCrack";
  appliesTo: HazardCondition;
  /** Downward speed at touchdown (units/s) that counts as a hard landing. */
  minImpactSpeed: number;
  staggerMs: number;
}

export type DynamicHazard = WindHazard | WaterLandingHazard | CounterCrackHazard;

export interface Arena {
  id: ArenaId;
  /** Title-case name for cards and the marquee. */
  name: string;
  /** How The Voice says it in a sentence. */
  spokenName: string;
  mood: string;
  accent: ToyColor;
  ringOutLanding: RingOutLanding;
  geometry: ArenaGeometry;
  hazards: readonly Hazard[];
  dynamic: readonly DynamicHazard[];
}

export const HAZARD_CARD_MAX = 70;

const HALF = 3;
const SPAWNS = { A: [-1.6, 0, 0], B: [1.6, 0, 0] } as const satisfies ArenaGeometry["spawns"];
const BASE_GEOMETRY = {
  halfSize: HALF,
  topY: 0,
  thickness: 0.4,
  lip: { height: 0.1, width: 0.12 },
  wall: { height: 1.6, thickness: 0.2 },
  pits: [],
  ringOutY: -0.6,
  outOfBounds: { halfSize: 5, ceilingY: 8 },
  spawns: SPAWNS,
} as const satisfies Partial<ArenaGeometry>;

export const ARENAS: Readonly<Record<ArenaId, Arena>> = {
  FLOODED_GARAGE: {
    id: "FLOODED_GARAGE",
    name: "Flooded Garage",
    spokenName: "the Flooded Garage",
    mood: "Ankle-deep water, one flickering tube, and a sedan that gave up.",
    accent: "teal",
    ringOutLanding: "splash",
    geometry: {
      ...BASE_GEOMETRY,
      edges: { front: "lip", back: "lip", left: "lip", right: "lip" },
      surround: { kind: "water", y: -0.35 },
    },
    hazards: [
      {
        id: "liveWires",
        title: "Live Wires",
        card: "Electric fighters shock themselves for 15 on every hit they take.",
        rules: [{ when: { trait: "electric" }, effects: [{ key: "selfDamageOnHitTaken", value: 15 }] }],
        dynamic: null,
      },
      {
        id: "homeWaters",
        title: "Home Waters",
        card: "Aquatic fighters are right at home: +15% speed.",
        rules: [{ when: { trait: "aquatic" }, effects: [{ key: "speed", value: 15 }] }],
        dynamic: null,
      },
      {
        id: "deepPuddles",
        title: "Deep Puddles",
        card: "Hoppers land with a splash and take longer to recover.",
        rules: [],
        dynamic: "waterLanding",
      },
    ],
    dynamic: [
      {
        id: "waterLanding",
        appliesTo: { bodyPlan: "HOPPER" },
        extraRecoveryMs: 350,
        hopSpeedFactor: 0.75,
      },
    ],
  },
  KITCHEN_COUNTER: {
    id: "KITCHEN_COUNTER",
    name: "Kitchen Counter",
    spokenName: "the Kitchen Counter",
    mood: "Evening light, a giant toaster, and a sink that takes no prisoners.",
    accent: "tomato",
    ringOutLanding: "clang",
    geometry: {
      ...BASE_GEOMETRY,
      // The backsplash closes the back edge; the sink sits upstage, centred,
      // so neither spawn is closer to it.
      edges: { front: "open", back: "wall", left: "open", right: "open" },
      pits: [{ minX: -0.9, maxX: 0.9, minZ: -2.6, maxZ: -1.4, depth: 1 }],
      surround: { kind: "floor", y: -9 },
      spawns: { A: [-1.6, 0, 0.5], B: [1.6, 0, 0.5] },
    },
    hazards: [
      {
        id: "crumbCover",
        title: "Crumb Cover",
        card: "Tiny fighters hide among the crumbs: smaller hurtbox.",
        rules: [{ when: { trait: "tiny" }, effects: [{ key: "hurtbox", value: -20 }] }],
        dynamic: null,
      },
      {
        id: "cheapLaminate",
        title: "Cheap Laminate",
        card: "Heavy fighters crack the counter and stagger when they land.",
        rules: [],
        dynamic: "counterCrack",
      },
      {
        id: "theSink",
        title: "The Sink",
        card: "The sink is a pit. Fall in and you're rung out.",
        rules: [],
        dynamic: null,
      },
    ],
    dynamic: [
      { id: "counterCrack", appliesTo: { trait: "heavy" }, minImpactSpeed: 2.5, staggerMs: 600 },
    ],
  },
  ROOFTOP: {
    id: "ROOFTOP",
    name: "Rooftop",
    spokenName: "the Rooftop",
    mood: "Night wind, a water tower, and laundry that has seen things.",
    accent: "tangerine",
    ringOutLanding: "thud",
    geometry: {
      ...BASE_GEOMETRY,
      edges: { front: "open", back: "open", left: "open", right: "open" },
      surround: { kind: "street", y: -30 },
    },
    hazards: [
      {
        id: "gusts",
        title: "Gusts",
        card: "Wind gusts shove everyone toward one edge every few seconds.",
        rules: [],
        dynamic: "wind",
      },
      {
        id: "updraft",
        title: "Updraft",
        card: "Fliers ride the updraft: +1 Reach.",
        rules: [{ when: { bodyPlan: "FLIER" }, effects: [{ key: "reach", value: 1 }] }],
        dynamic: null,
      },
      {
        id: "rooted",
        title: "Rooted",
        card: "Heavy fighters can't be knocked back by Strikes.",
        rules: [{ when: { trait: "heavy" }, effects: [{ key: "strikeKnockbackImmune", value: 1 }] }],
        dynamic: null,
      },
    ],
    dynamic: [
      {
        id: "wind",
        appliesTo: { everyone: true },
        periodMinMs: 4_500,
        periodStepMs: 250,
        periodSteps: 9,
        gustMs: 1_800,
        rampMs: 400,
        firstGustMinMs: 2_000,
        firstGustStepMs: 250,
        firstGustSteps: 7,
        accel: 2.5,
      },
    ],
  },
};

export function getArena(id: ArenaId): Arena {
  return ARENAS[id];
}

/** Tonight's three arenas in a fixed order for the seed; the Final is the third. */
export function pickArenaOrder(seed: number | string): readonly [ArenaId, ArenaId, ArenaId] {
  return seededShuffle(ARENA_IDS, `slopfight-arenas:${seed}`) as [ArenaId, ArenaId, ArenaId];
}

export function matchesCondition(
  condition: HazardCondition,
  fighter: { traits: readonly Trait[]; bodyPlan: BodyPlan },
): boolean {
  if ("trait" in condition) return fighter.traits.includes(condition.trait);
  if ("bodyPlan" in condition) return fighter.bodyPlan === condition.bodyPlan;
  return true;
}

// ---------------------------------------------------------------------------
// Wind (Rooftop)
// ---------------------------------------------------------------------------

export const EDGE_DIRECTIONS: Readonly<Record<EdgeSide, readonly [x: number, z: number]>> = {
  front: [0, 1],
  back: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

export interface Wind {
  /** The edge the gusts push toward. */
  edge: EdgeSide;
  /** Unit push direction on the floor plane, axis-aligned (no trig needed). */
  direction: readonly [x: number, z: number];
  firstGustMs: number;
  periodMs: number;
  gustMs: number;
  rampMs: number;
  accel: number;
}

const ROOFTOP_WIND = ARENAS.ROOFTOP.dynamic.find((hazard) => hazard.id === "wind") as WindHazard;

/** The fight's wind, derived from its seed alone, so the sim, the stage and the card agree. */
export function windFor(seed: number, params: WindHazard = ROOFTOP_WIND): Wind {
  const hash = mixedHash(`slopfight-wind:${seed >>> 0}`);
  const edge = EDGE_SIDES[hash % EDGE_SIDES.length]!;
  return {
    edge,
    direction: EDGE_DIRECTIONS[edge],
    firstGustMs:
      params.firstGustMinMs + ((hash >>> 8) % params.firstGustSteps) * params.firstGustStepMs,
    periodMs: params.periodMinMs + ((hash >>> 16) % params.periodSteps) * params.periodStepMs,
    gustMs: params.gustMs,
    rampMs: params.rampMs,
    accel: params.accel,
  };
}

/** Gust envelope in 0..1 at sim time tMs: linear ramp up, hold, linear ramp down. */
export function windStrengthAt(wind: Wind, tMs: number): number {
  if (tMs < wind.firstGustMs) return 0;
  const phase = (tMs - wind.firstGustMs) % wind.periodMs;
  if (phase >= wind.gustMs) return 0;
  if (phase < wind.rampMs) return phase / wind.rampMs;
  if (phase > wind.gustMs - wind.rampMs) return (wind.gustMs - phase) / wind.rampMs;
  return 1;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** True when a torso at `p` has left the stage: too low, or outside the out-of-bounds box. */
export function isRingOut(geometry: ArenaGeometry, p: Vec3): boolean {
  const [x, y, z] = p;
  const bound = geometry.outOfBounds.halfSize;
  return (
    y < geometry.ringOutY ||
    y > geometry.outOfBounds.ceilingY ||
    Math.abs(x) > bound ||
    Math.abs(z) > bound
  );
}

/** True when (x, z) is over solid floor: inside the platform and not over a pit. */
export function isOverFloor(geometry: ArenaGeometry, x: number, z: number): boolean {
  const half = geometry.halfSize;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  return !geometry.pits.some((pit) => x > pit.minX && x < pit.maxX && z > pit.minZ && z < pit.maxZ);
}

/**
 * Floor distance from (x, z) to the nearest drop: a non-wall edge or a pit.
 * Zero or less once past it. Drives "ON THE EDGE" and the brains' retreat.
 */
export function ringOutDistance(geometry: ArenaGeometry, x: number, z: number): number {
  const half = geometry.halfSize;
  const sides: Record<EdgeSide, number> = {
    front: half - z,
    back: half + z,
    left: half + x,
    right: half - x,
  };
  let nearest = Number.POSITIVE_INFINITY;
  for (const side of EDGE_SIDES) {
    if (geometry.edges[side] !== "wall") nearest = Math.min(nearest, sides[side]);
  }
  for (const pit of geometry.pits) {
    const dx = Math.max(pit.minX - x, 0, x - pit.maxX);
    const dz = Math.max(pit.minZ - z, 0, z - pit.maxZ);
    const inside = dx === 0 && dz === 0;
    const distance = inside
      ? -Math.min(x - pit.minX, pit.maxX - x, z - pit.minZ, pit.maxZ - z)
      : Math.sqrt(dx * dx + dz * dz);
    nearest = Math.min(nearest, distance);
  }
  return nearest;
}

/**
 * Static colliders as axis-aligned boxes: the platform slab tiled around any
 * pits, the pits' basins, the lips and the walls. The sim makes one fixed
 * cuboid per box; the Blender sets are modelled around the same boxes.
 */
export function platformColliders(geometry: ArenaGeometry): Box[] {
  const { halfSize: half, topY, thickness } = geometry;
  const bottom = topY - thickness;
  const boxes: Box[] = [];
  const clampToPlatform = (value: number) => Math.min(half, Math.max(-half, value));
  const breaks = (lo: "minX" | "minZ", hi: "maxX" | "maxZ") =>
    [
      ...new Set([
        -half,
        half,
        ...geometry.pits.flatMap((pit) => [clampToPlatform(pit[lo]), clampToPlatform(pit[hi])]),
      ]),
    ].sort((a, b) => a - b);
  const xs = breaks("minX", "maxX");
  const zs = breaks("minZ", "maxZ");

  for (let zi = 0; zi < zs.length - 1; zi += 1) {
    const z0 = zs[zi]!;
    const z1 = zs[zi + 1]!;
    let runStart: number | null = null;
    for (let xi = 0; xi < xs.length; xi += 1) {
      const x0 = xs[xi]!;
      const solid = xi < xs.length - 1 && isOverFloor(geometry, (x0 + xs[xi + 1]!) / 2, (z0 + z1) / 2);
      if (solid && runStart === null) runStart = x0;
      if (!solid && runStart !== null) {
        boxes.push({ min: [runStart, bottom, z0], max: [x0, topY, z1] });
        runStart = null;
      }
    }
  }

  const skin = 0.05;
  for (const pit of geometry.pits) {
    const floorY = topY - pit.depth;
    boxes.push({ min: [pit.minX, floorY - skin, pit.minZ], max: [pit.maxX, floorY, pit.maxZ] });
    if (floorY >= bottom) continue;
    boxes.push({ min: [pit.minX - skin, floorY, pit.minZ], max: [pit.minX, bottom, pit.maxZ] });
    boxes.push({ min: [pit.maxX, floorY, pit.minZ], max: [pit.maxX + skin, bottom, pit.maxZ] });
    boxes.push({ min: [pit.minX, floorY, pit.minZ - skin], max: [pit.maxX, bottom, pit.minZ] });
    boxes.push({ min: [pit.minX, floorY, pit.maxZ], max: [pit.maxX, bottom, pit.maxZ + skin] });
  }

  const { height: lipHeight, width: lipWidth } = geometry.lip;
  const { height: wallHeight, thickness: wallThickness } = geometry.wall;
  for (const side of EDGE_SIDES) {
    const kind = geometry.edges[side];
    if (kind === "open") continue;
    // A lip sits on the platform's rim; a wall stands just outside it.
    const top = topY + (kind === "lip" ? lipHeight : wallHeight);
    const inner = kind === "lip" ? half - lipWidth : half;
    const outer = kind === "lip" ? half : half + wallThickness;
    const lo = kind === "lip" ? topY : bottom;
    switch (side) {
      case "front":
        boxes.push({ min: [-half, lo, inner], max: [half, top, outer] });
        break;
      case "back":
        boxes.push({ min: [-half, lo, -outer], max: [half, top, -inner] });
        break;
      case "left":
        boxes.push({ min: [-outer, lo, -half], max: [-inner, top, half] });
        break;
      case "right":
        boxes.push({ min: [inner, lo, -half], max: [outer, top, half] });
        break;
    }
  }
  return boxes;
}
