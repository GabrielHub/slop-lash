/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { FORFEIT_MARKER } from "../src/games/core/constants";

const modules = import.meta.glob("./**/*.ts");
const TAB = "0123456789abcdef0123";

function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  workpoolTest.register(t, "aiGenerationWorkpool");
  return t;
}

type Backend = ReturnType<typeof setup>;

async function createRoom(t: Backend, overrides: Record<string, unknown> = {}) {
  return t.action(api.rooms.create, {
    gameType: "SLOPLASH",
    hostSecret: "secret",
    hostName: "Host",
    timersDisabled: true,
    ...overrides,
  });
}

async function view(t: Backend, capability: string) {
  return t.query(api.views.room, { capability });
}

async function room(t: Backend, capability: string) {
  return (await view(t, capability)).room;
}

async function gameId(t: Backend, capability: string) {
  return (await room(t, capability)).id as Id<"games">;
}

/** Plays a full SlopLash writing phase for every seat. */
async function answerEverything(t: Backend, capabilities: string[]) {
  for (const capability of capabilities) {
    const mode = (await view(t, capability)).mode;
    if (mode?.kind !== "SLOPLASH" || !mode.writing) throw new Error("not writing");
    for (const prompt of mode.writing.prompts) {
      await t.mutation(api.sloplash.play.submitResponse, {
        capability,
        promptId: prompt.id,
        text: `answer from ${capability.slice(-4)}`,
      });
    }
  }
}

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("rooms", () => {
  test("joins a lobby and refuses strangers once the game starts", async () => {
    const t = setup();
    const host = await createRoom(t);
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });

    const lobby = await view(t, host.capability);
    expect(lobby.players.map((player) => player.name)).toEqual(["Host", "Ana", "Bo"]);
    expect(lobby.me).toMatchObject({ isHost: true, name: "Host" });
    expect((await view(t, ana.capability)).me).toMatchObject({ isHost: false, name: "Ana" });

    await t.mutation(api.engine.start, { capability: host.capability });
    await expect(
      t.action(api.rooms.join, { roomCode: host.roomCode, name: "Late" }),
    ).rejects.toThrow("already started");
  });

  test("lets a TV watch by room code without seeing anyone's secrets", async () => {
    const t = setup();
    const host = await createRoom(t);
    for (const name of ["Ana", "Bo"]) {
      await t.action(api.rooms.join, { roomCode: host.roomCode, name });
    }
    await t.mutation(api.engine.start, { capability: host.capability });

    const tv = await t.query(api.views.watch, { roomCode: host.roomCode.toLowerCase() });
    expect(tv.me).toBeNull();
    expect(tv.room.phase).toBe("WRITING");
    expect(tv.mode.kind === "SLOPLASH" && tv.mode.writing?.prompts).toEqual([]);
    await expect(t.query(api.views.watch, { roomCode: "ZZZZ" })).rejects.toThrow("Room not found");
  });

  test("lets a player who lost their tab reclaim their seat by name", async () => {
    const t = setup();
    const host = await createRoom(t);
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    const { sessionToken } = await t.mutation(api.presence.heartbeat, {
      capability: ana.capability,
      tabId: TAB,
      interval: 5_000,
    });
    await t.mutation(api.engine.start, { capability: host.capability });

    // Still online: someone else typing the name can't take the seat.
    await expect(
      t.action(api.rooms.join, { roomCode: host.roomCode, name: "ana" }),
    ).rejects.toThrow("already in the room");

    // The tab closes; the seat can be reclaimed from another device.
    await t.mutation(api.presence.disconnect, { sessionToken });
    const again = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "ANA" });
    expect(again.playerId).toBe(ana.playerId);
    expect((await view(t, again.capability)).me!.name).toBe("Ana");
    await expect(view(t, ana.capability)).rejects.toThrow();
  });

  test("kicked players can't come back, and the round stops waiting on them", async () => {
    const t = setup();
    const host = await createRoom(t);
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    const bo = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    await t.mutation(api.engine.start, { capability: host.capability });

    await answerEverything(t, [host.capability, ana.capability]);
    expect((await room(t, host.capability)).phase).toBe("WRITING");
    await t.mutation(api.rooms.kick, { capability: host.capability, playerId: bo.playerId! });
    expect((await room(t, host.capability)).phase).toBe("VOTING");

    await expect(view(t, bo.capability)).rejects.toThrow();
    await expect(t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" })).rejects.toThrow(
      "removed",
    );
  });
});

describe("SlopLash", () => {
  test("plays a whole game with host pacing and hides authors until the reveal", async () => {
    const t = setup();
    const host = await createRoom(t, { totalRounds: 1 });
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    const bo = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    const everyone = [host.capability, ana.capability, bo.capability];
    await t.mutation(api.engine.start, { capability: host.capability });

    await answerEverything(t, everyone);
    let current = await view(t, ana.capability);
    expect(current.room.phase).toBe("VOTING");
    const mode = current.mode;
    if (mode?.kind !== "SLOPLASH") throw new Error("wrong mode");
    const matchup = mode.round!.prompts.find((prompt) => prompt.id === mode.currentPromptId)!;
    // Nobody but the author knows who wrote what until the reveal.
    expect(
      matchup.answers.filter(
        (answer) => answer.playerId !== null && answer.playerId !== ana.playerId,
      ),
    ).toEqual([]);

    // Each matchup: the one player outside it votes, then the host moves past the reveal.
    for (let guard = 0; guard < 10; guard += 1) {
      current = await view(t, host.capability);
      if (current.room.phase === "ROUND_RESULTS") break;
      if (current.room.phase === "VOTING") {
        const sloplash = current.mode;
        if (sloplash?.kind !== "SLOPLASH") throw new Error("wrong mode");
        const prompt = sloplash.round!.prompts.find((p) => p.id === sloplash.currentPromptId)!;
        for (const capability of everyone) {
          const me = (await view(t, capability)).me!.playerId!;
          if (prompt.assigneeIds.includes(me)) continue;
          await t.mutation(api.sloplash.play.castVote, {
            capability,
            promptId: prompt.id,
            responseId: prompt.answers[0]!.id,
          });
        }
        expect((await room(t, host.capability)).phase).toBe("REVEAL");
      } else {
        await t.mutation(api.engine.advanceByHost, {
          capability: host.capability,
          expectedPhaseGeneration: current.room.phaseGeneration,
        });
      }
    }
    current = await view(t, host.capability);
    expect(current.room.phase).toBe("ROUND_RESULTS");
    expect(current.players.reduce((sum, player) => sum + player.score, 0)).toBeGreaterThan(0);

    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: current.room.phaseGeneration,
    });
    const final = await view(t, host.capability);
    expect(final.room.status).toBe("FINISHED");
    expect(final.usage).not.toBeNull();
    const recap = await t.query(api.views.recap, { roomCode: host.roomCode });
    expect(recap.kind).toBe("READY");

    // The finished game lands on the leaderboard exactly once.
    await t.finishInProgressScheduledFunctions();
    await t.mutation(internal.leaderboards.projectGame, { gameId: final.room.id });
    const board = await t.query(api.leaderboards.get, {});
    expect(board.stats.totalGames).toBe(1);
    expect(board.leaderboard.map((entry) => entry.key)).toEqual(["HUMAN"]);
  });

  test("a stale double-tap on next is ignored", async () => {
    const t = setup();
    const host = await createRoom(t);
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    await t.mutation(api.engine.start, { capability: host.capability });
    const { phaseGeneration } = await room(t, host.capability);
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: phaseGeneration,
    });
    const after = await room(t, host.capability);
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: phaseGeneration,
    });
    expect(await room(t, host.capability)).toEqual(after);
  });

  test("skips voting when every matchup forfeited", async () => {
    const t = setup();
    const host = await createRoom(t);
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    await t.mutation(api.engine.start, { capability: host.capability });
    const { phaseGeneration } = await room(t, host.capability);
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: phaseGeneration,
    });
    expect((await room(t, host.capability)).phase).toBe("ROUND_RESULTS");
    const responses = await t.run(async (ctx) => ctx.db.query("responses").take(20));
    expect(responses.every((response) => response.text === FORFEIT_MARKER)).toBe(true);
  });

  test("deadlines advance the game without the host", async () => {
    vi.useFakeTimers();
    const t = setup();
    const host = await createRoom(t, { timersDisabled: false });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    await t.mutation(api.engine.start, { capability: host.capability });
    const writing = await room(t, host.capability);
    expect(writing.phaseDeadline).not.toBeNull();

    vi.advanceTimersByTime(writing.phaseDeadline! - Date.now() + 1);
    await t.finishInProgressScheduledFunctions();
    expect((await room(t, host.capability)).phaseGeneration).toBeGreaterThan(
      writing.phaseGeneration,
    );
  });

  test("a lost tick is recovered by the sweep", async () => {
    vi.useFakeTimers();
    const t = setup();
    const host = await createRoom(t, { timersDisabled: false });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    await t.mutation(api.engine.start, { capability: host.capability });
    const id = await gameId(t, host.capability);
    const writing = await room(t, host.capability);

    // Simulate a deadline whose scheduled tick never ran.
    vi.setSystemTime(writing.phaseDeadline! + 60_000);
    await t.mutation(internal.engine.maintain, { gameId: id });
    expect((await room(t, host.capability)).phaseGeneration).toBeGreaterThan(
      writing.phaseGeneration,
    );
  });

  test("host controls pass to a connected player when the host leaves", async () => {
    vi.useFakeTimers();
    const t = setup();
    const host = await createRoom(t);
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    const id = await gameId(t, host.capability);

    vi.advanceTimersByTime(60_000);
    await t.mutation(api.presence.heartbeat, {
      capability: ana.capability,
      tabId: TAB,
      interval: 5_000,
    });
    await t.mutation(internal.engine.maintain, { gameId: id });
    expect((await view(t, ana.capability)).me!.isHost).toBe(true);
    // The original host keeps their powers too when they come back.
    expect((await view(t, host.capability)).me!.isHost).toBe(true);
    await t.mutation(api.engine.start, { capability: ana.capability });
    expect((await room(t, ana.capability)).status).toBe("PLAYING");
  });

  test("ending early finishes the game and scores the round in progress", async () => {
    const t = setup();
    const host = await createRoom(t);
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    const bo = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    await t.mutation(api.engine.start, { capability: host.capability });
    await answerEverything(t, [host.capability, ana.capability, bo.capability]);
    await t.mutation(api.engine.end, { capability: host.capability });
    const final = await view(t, host.capability);
    expect(final.room.status).toBe("FINISHED");
    const rounds = await t.run(async (ctx) => ctx.db.query("rounds").take(5));
    expect(rounds[0]?.scoredAt).toBeDefined();
  });
});
