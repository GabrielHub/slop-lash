/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, expect, vi } from "vite-plus/test";
import { FACE_OFF_MIN_SECONDS } from "../../src/games/slopfight/constants";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { heartbeat, runFor, view, type Backend } from "../test.harness";
import { DRAWN_REVEAL_HOLD_MS } from "./data";
import type { ForgeChampionOptions, ForgeChampionResult, FightInput, FightOutcome } from "./ports";

/**
 * The Forge and Sim workstreams' modules are reached only through ports.ts,
 * mocked here. Each test sets how the forge, the house/matchup/recap calls
 * and the sim behave.
 */
const mocks = vi.hoisted(() => ({
  forge: null as
    | null
    | ((options: ForgeChampionOptions) => ForgeChampionResult | Promise<ForgeChampionResult>),
  forges: [] as ForgeChampionOptions[],
  matchupOk: true,
  sim: null as null | ((input: FightInput) => FightOutcome),
  sims: [] as FightInput[],
}));

vi.mock("./ports", async () => {
  const kit = await import("./test.kit");
  return {
    forgeChampion: async (options: ForgeChampionOptions) => {
      mocks.forges.push(options);
      // The body plan and two streamed parts first, as the real stream would.
      options.onPartial?.(
        { champion: { bodyPlan: "BIPED", parts: kit.sampleChampion().parts.slice(0, 2) } },
        { attempt: 0, stage: "forge", modelId: "anthropic/claude-haiku-5.5" },
      );
      if (mocks.forge) return mocks.forge(options);
      const name = options.text?.slice(0, 20) || `Champ ${mocks.forges.length}`;
      return {
        ok: true,
        result: kit.forgeResult(kit.sampleChampion(name)),
        calls: [kit.aiCall("anthropic/claude-haiku-5.5")],
      };
    },
    inventHouseChampions: async ({ count }: { count: number }) => ({
      ok: true,
      descriptions: Array.from({ length: count }, (_, index) => `House champion ${index + 1}`),
      calls: [kit.aiCall("anthropic/claude-haiku-5.5", true, "slopfight.house")],
    }),
    writeMatchup: async () =>
      mocks.matchupOk
        ? {
            ok: true,
            notes: [
              { side: "A", modifies: "speed", value: 15, reason: "Sticky feet on a wet floor" },
              { side: "B", modifies: "nonsense", value: 1, reason: "dropped: bad key" },
            ],
            walkOn: ["Here comes A", "Here comes B"],
            calls: [kit.aiCall("anthropic/claude-haiku-5.5", true, "slopfight.matchup")],
          }
        : { ok: false, failReason: "provider-error", calls: [] },
    writeRecapLine: async () => ({ ok: true, line: "A bonked B into next week.", calls: [] }),
    renderDoodlePng: () => new Uint8Array([137, 80, 78, 71]),
    loadFightSim: async () => ({
      run: (input: FightInput) => {
        mocks.sims.push(input);
        return mocks.sim ? mocks.sim(input) : kit.sampleOutcome();
      },
      smokeInput: () => {
        throw new Error("unused");
      },
      rapierInitMs: 0,
    }),
  };
});

export const mock = mocks;

export const kit = await import("./test.kit");

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.forge = null;
  mocks.forges = [];
  mocks.matchupOk = true;
  mocks.sim = null;
  mocks.sims = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type Room = { t: Backend; host: string; caps: string[]; gameId: Id<"games">; code: string };

const NAMES = ["Host", "Ana", "Bo", "Cy"];

export async function fightRoom(
  t: Backend,
  humans: number,
  options: { timers?: boolean; freePlay?: boolean } = {},
): Promise<Room> {
  const created = await t.action(api.rooms.create, {
    gameType: "SLOPFIGHT",
    ...(options.freePlay ? {} : { hostSecret: "secret" }),
    hostName: NAMES[0],
    timersDisabled: !options.timers,
  });
  const caps = [created.capability];
  for (const name of NAMES.slice(1, humans)) {
    caps.push((await t.action(api.rooms.join, { roomCode: created.roomCode, name })).capability);
  }
  await heartbeat(t, caps);
  const gameId = (await view(t, created.capability)).room.id as Id<"games">;
  return { t, host: created.capability, caps, gameId, code: created.roomCode };
}

export async function start(room: Room) {
  await room.t.mutation(api.engine.start, { capability: room.host });
}

export async function sf(room: Room, capability = room.host) {
  const current = (await view(room.t, capability)).mode;
  if (current?.kind !== "SLOPFIGHT") throw new Error("wrong mode");
  return current;
}

export async function phase(room: Room) {
  return (await view(room.t, room.host)).room;
}

/**
 * Runs what is due over `ms` (forges, jobs, sims) without leaping to far timers; keeps humans here.
 * The default covers a forge plus the stage's reveal hold (`DRAWN_REVEAL_HOLD_MS`).
 */
export async function pump(room: Room, ms = 3_000 + DRAWN_REVEAL_HOLD_MS) {
  await runFor(room.t, ms);
  await heartbeat(room.t, room.caps);
}

export async function hostNext(room: Room) {
  const { phaseGeneration } = await phase(room);
  await room.t.mutation(api.engine.advanceByHost, {
    capability: room.host,
    expectedPhaseGeneration: phaseGeneration,
  });
}

export async function describeAll(room: Room, caps = room.caps) {
  for (const capability of caps) {
    await room.t.mutation(api.slopfight.play.submitChampion, {
      capability,
      kind: "DESCRIBE",
      text: `A very confident jellyfish ${capability.slice(-3)}`,
    });
  }
}

export async function fighters(room: Room) {
  return room.t.run((ctx) =>
    ctx.db
      .query("slopFightFighters")
      .withIndex("by_gameId_and_slot", (index) => index.eq("gameId", room.gameId))
      .take(4),
  );
}

export async function fights(room: Room) {
  return room.t.run((ctx) =>
    ctx.db
      .query("slopFightFights")
      .withIndex("by_gameId_and_round_and_step", (index) => index.eq("gameId", room.gameId))
      .take(12),
  );
}

export async function scores(room: Room) {
  const { players } = await view(room.t, room.host);
  return Object.fromEntries(players.map((player) => [player.name, player.score]));
}

/** Everyone present bets on side A of the fight in the face-off. */
export async function betAll(room: Room, side: "A" | "B" = "A", caps = room.caps) {
  const fightId = (await sf(room)).currentFightId!;
  for (const capability of caps) {
    await room.t.mutation(api.slopfight.play.placeBet, { capability, fightId, side });
  }
}

/** Build done: every human describes, the forges and the house run, the roster opens. */
export async function throughBuild(room: Room) {
  await start(room);
  await pump(room);
  await describeAll(room);
  await pump(room);
  expect((await phase(room)).phase).toBe("ROSTER");
}

/** Plays the fight on screen from FACE_OFF to RESULT with everyone betting `side`. */
export async function playFight(room: Room, side: "A" | "B" = "A") {
  expect((await phase(room)).phase).toBe("FACE_OFF");
  await pump(room, 1_000);
  await betAll(room, side);
  // The face-off minimum holds it, then the settle ping closes it.
  await pump(room, FACE_OFF_MIN_SECONDS * 1_000);
  expect((await phase(room)).phase).toBe("FIGHT");
  // FIGHT lasts lead + endMs + outro, then RESULT.
  await pump(room, 18_000);
  expect((await phase(room)).phase).toBe("RESULT");
}

/** Plays both fights of the current round from ROSTER, ending in STANDINGS (or FINAL). */
export async function playRound(room: Room) {
  expect((await phase(room)).phase).toBe("ROSTER");
  await hostNext(room);
  await playFight(room);
  await hostNext(room);
  await playFight(room);
  await hostNext(room);
}
