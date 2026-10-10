/// <reference types="node" />
"use node";

// The one door from the SlopFight backend to the Forge and Sim workstreams'
// modules (contracts 3.4 and 3.5): the call wrappers in src/games/slopfight/ai/,
// the rasterizer in src/games/slopfight/raster.ts and the fight sim in
// src/games/slopfight/sim/. Node-only callers (forge.ts, fightSim.ts,
// runners.ts) import from here and nowhere else; tests mock this file.

import { deflateSync } from "node:zlib";
import { renderDoodlePng as rasterPng } from "../../src/games/slopfight/raster";
import type { FightInput, FightOutcome } from "../../src/games/slopfight/sim";
import type { StrokeBatch } from "../../src/games/slopfight/strokes";

// ---------------------------------------------------------------------------
// AI wrappers (contract 3.5)
// ---------------------------------------------------------------------------

export {
  forgeChampion,
  inventHouseChampions,
  writeMatchup,
  writeRecapLine,
  type AiOutcome,
  type ForgeChampionOptions,
  type ForgeChampionResult,
  type ForgeMode,
  type ForgePartial,
  type ForgeStreamInfo,
  type RecapEvent,
  type RecapOutcome,
} from "../../src/games/slopfight/ai";

// ---------------------------------------------------------------------------
// Rasterizer (Forge workstream): strokes -> PNG bytes, with Node's zlib
// ---------------------------------------------------------------------------

/**
 * The doodle a forge sees as PNG bytes: every layer up to `layer`, earlier
 * layers faded under it when `layer` > 0 (an upgrade's addition).
 */
export function renderDoodlePng(batches: readonly StrokeBatch[], layer: number): Uint8Array {
  return rasterPng(batches, layer, (data) => new Uint8Array(deflateSync(data)));
}

// ---------------------------------------------------------------------------
// Fight sim (contract 3.4)
// ---------------------------------------------------------------------------

export type { FightEvent, FightInput, FightOutcome, Rapier } from "../../src/games/slopfight/sim";

/** The sim, loaded on first use so the job runners that share this file stay light to import. */
export interface FightSimPort {
  run(input: FightInput): FightOutcome;
  /** The sample fight the dev smoke test and the local determinism check both run. */
  smokeInput(): FightInput;
  /** How long the Rapier init took on this load (0 once memoized). */
  rapierInitMs: number;
}

export async function loadFightSim(): Promise<FightSimPort> {
  const [sim, fixtures] = await Promise.all([
    import("../../src/games/slopfight/sim"),
    import("../../src/games/slopfight/sim/fixtures"),
  ]);
  const started = Date.now();
  const rapier = await sim.loadRapier();
  const rapierInitMs = Date.now() - started;
  return {
    run: (input) => sim.runFight(rapier, input),
    smokeInput: () => smokeFightInput(fixtures.SIM_FIXTURES),
    rapierInitMs,
  };
}

/** The first two sim fixtures on the kitchen counter, with a note each. */
export function smokeFightInput(fixtures: readonly { champion: FightInput["a"] }[]): FightInput {
  const [a, b] = fixtures;
  return {
    seed: 0x5eedf00d,
    arena: "KITCHEN_COUNTER",
    a: a!.champion,
    b: b!.champion,
    notes: [
      { side: "A", modifies: "speed", value: 10, reason: "Smoke test: light on its feet" },
      { side: "B", modifies: "staggerResist", value: 10, reason: "Smoke test: planted" },
    ],
    limitMs: 30_000,
  };
}
