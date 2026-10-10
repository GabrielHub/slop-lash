/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MATCHSLOP_INITIAL_MOOD } from "../src/games/matchslop/types";

const modules = import.meta.glob("./**/*.ts");
const HOUR_MS = 60 * 60_000;

function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  workpoolTest.register(t, "aiGenerationWorkpool");
  workpoolTest.register(t, "aiCriticalWorkpool");
  return t;
}

type Backend = ReturnType<typeof setup>;
type Seat = { capability: string; roomCode: string };

let tabCounter = 0;
/** A fresh presence tab id in the shape the heartbeat accepts. */
function newTab() {
  tabCounter += 1;
  return `00000000-0000-4000-8000-${tabCounter.toString(16).padStart(12, "0")}`;
}

async function beat(t: Backend, seat: Seat, tabId = newTab()) {
  return t.mutation(api.presence.heartbeat, {
    capability: seat.capability,
    tabId,
    interval: 5_000,
  });
}

async function view(t: Backend, seat: Seat) {
  return t.query(api.views.room, { capability: seat.capability });
}

async function roomOf(t: Backend, seat: Seat) {
  return (await view(t, seat)).room;
}

async function gamesFor(t: Backend, roomCode: string) {
  return t.run((ctx) =>
    ctx.db
      .query("games")
      .withIndex("by_roomCode_and_gameNumber", (index) => index.eq("roomCode", roomCode))
      .take(8),
  );
}

/** A SlopLash room with Host, Ana and Bo; every seat has a live tab. */
async function startedRoom(t: Backend, overrides: Record<string, unknown> = {}) {
  const host = await t.action(api.rooms.create, {
    gameType: "SLOPLASH",
    hostSecret: "secret",
    hostName: "Host",
    timersDisabled: true,
    totalRounds: 2,
    ...overrides,
  });
  const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
  const bo = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
  const tabs = [];
  for (const seat of [host, ana, bo]) tabs.push(await beat(t, seat));
  await t.mutation(api.engine.start, { capability: host.capability });
  return { host, ana, bo, boTab: tabs[2]! };
}

async function finishedRoom(t: Backend, overrides: Record<string, unknown> = {}) {
  const seats = await startedRoom(t, overrides);
  await t.mutation(api.engine.end, { capability: seats.host.capability });
  const previous = await roomOf(t, seats.host);
  expect(previous.status).toBe("FINISHED");
  return { ...seats, previous };
}

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Play again", () => {
  test("resets to a lobby with the same seats, settings and code; the old game keeps its recap", async () => {
    const t = setup();
    const { host, ana, previous } = await finishedRoom(t);

    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });

    const next = await view(t, host);
    expect(next.room.id).not.toBe(previous.id);
    expect(next.room).toMatchObject({
      code: previous.code,
      gameNumber: 2,
      next: null,
      status: "LOBBY",
      phase: "LOBBY",
      round: 0,
      totalRounds: previous.totalRounds,
      timersDisabled: previous.timersDisabled,
      ttsMode: previous.ttsMode,
      ttsVoice: previous.ttsVoice,
      freePlay: false,
    });
    expect(next.players.map((player) => [player.name, player.score])).toEqual([
      ["Host", 0],
      ["Ana", 0],
      ["Bo", 0],
    ]);
    expect(next.me?.isHost).toBe(true);
    expect(next.room.hostPlayerId).toBe(next.me?.playerId);

    // Every screen follows on its own: the same capability opens the new game.
    expect((await roomOf(t, ana)).id).toBe(next.room.id);
    expect((await view(t, ana)).me?.name).toBe("Ana");
    expect((await t.query(api.views.watch, { roomCode: host.roomCode })).room.id).toBe(
      next.room.id,
    );

    const first = await t.query(api.views.recap, { roomCode: host.roomCode });
    const byNumber = await t.query(api.views.recap, { roomCode: host.roomCode, gameNumber: 1 });
    expect(first.kind).toBe("READY");
    expect(byNumber.kind).toBe("READY");
    if (first.kind === "READY") {
      expect(first.view.room.id).toBe(previous.id);
      expect(first.view.room.next).toEqual({ gameNumber: 2, status: "LOBBY" });
    }
    expect((await t.query(api.views.recap, { roomCode: host.roomCode, gameNumber: 2 })).kind).toBe(
      "IN_PROGRESS",
    );
    expect((await t.query(api.views.recap, { roomCode: host.roomCode, gameNumber: 3 })).kind).toBe(
      "NOT_FOUND",
    );

    // The new game plays: the host can start it with the carried seats.
    await t.mutation(api.engine.start, { capability: host.capability });
    expect((await roomOf(t, ana)).status).toBe("PLAYING");
  });

  test("the TV and the phone pressing together make one rematch, after a failover in FINISHED", async () => {
    vi.useFakeTimers();
    const t = setup();
    const tv = await t.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostSecret: "secret",
      timersDisabled: true,
    });
    const ana = await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Bo" });
    await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Cy" });
    await t.mutation(api.engine.start, { capability: tv.capability });
    await t.mutation(api.engine.end, { capability: tv.capability });
    const previous = await roomOf(t, tv);

    // The TV goes quiet at the results; Ana is still here, so host controls move to her.
    vi.advanceTimersByTime(60_000);
    await beat(t, ana);
    await t.mutation(internal.engine.maintain, { gameId: previous.id });
    expect((await view(t, ana)).me?.isHost).toBe(true);

    await t.mutation(api.rooms.playAgain, { capability: tv.capability, gameId: previous.id });
    await t.mutation(api.rooms.playAgain, { capability: ana.capability, gameId: previous.id });

    expect(await gamesFor(t, tv.roomCode)).toHaveLength(2);
    const fromTv = await view(t, tv);
    const fromAna = await view(t, ana);
    expect(fromAna.room.id).toBe(fromTv.room.id);
    expect(fromTv.me?.isHost).toBe(true);
    expect(fromAna.me?.isHost).toBe(true);
    const next = (await gamesFor(t, tv.roomCode)).find((game) => game.gameNumber === 2)!;
    expect(next.hostSessionId).toBe(fromTv.me?.sessionId);
    expect(next.hostPlayerId).toBe(fromAna.me?.playerId);
    expect(next.displayHost).toBe(true);
  });

  test("a FINISHED game hands over the host only while it is live and recent", async () => {
    vi.useFakeTimers();
    const t = setup();
    const tv = await t.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostSecret: "secret",
      timersDisabled: true,
    });
    const ana = await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Bo" });
    await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Cy" });
    await t.mutation(api.engine.start, { capability: tv.capability });
    await t.mutation(api.engine.end, { capability: tv.capability });
    const previous = await roomOf(t, tv);

    vi.advanceTimersByTime(31 * 60_000);
    await beat(t, ana);
    await t.mutation(internal.engine.maintain, { gameId: previous.id });
    expect((await view(t, ana)).me?.isHost).toBe(false);
  });

  test("refuses mid-game and for guests", async () => {
    const t = setup();
    const { host, ana } = await startedRoom(t);
    const playing = await roomOf(t, host);
    await expect(
      t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: playing.id }),
    ).rejects.toThrow("Finish this game first");

    await t.mutation(api.engine.end, { capability: host.capability });
    await expect(
      t.mutation(api.rooms.playAgain, { capability: ana.capability, gameId: playing.id }),
    ).rejects.toThrow("Only the host");
    expect(await gamesFor(t, host.roomCode)).toHaveLength(1);
  });

  test("leavers stay behind and can hop back in", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { host, ana, bo, boTab } = await startedRoom(t);
    // Bo's tab closes two minutes before the end.
    await t.mutation(api.presence.disconnect, { sessionToken: boTab.sessionToken });
    vi.advanceTimersByTime(2 * 60_000);
    await beat(t, ana);
    await t.mutation(api.engine.end, { capability: host.capability });
    const previous = await roomOf(t, host);

    // Ana taps Done.
    await t.mutation(api.rooms.leave, { capability: ana.capability });
    await expect(view(t, ana)).rejects.toThrow("Invalid or expired room capability");

    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });
    const lobby = await view(t, host);
    expect(lobby.players.map((player) => player.name)).toEqual(["Host"]);

    // Bo's phone still opens the finished game, which points at the rematch.
    const left = await view(t, bo);
    expect(left.room.id).toBe(previous.id);
    expect(left.room.next).toEqual({ gameNumber: 2, status: "LOBBY" });
    const back = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    expect((await roomOf(t, back)).id).toBe(lobby.room.id);
    expect((await view(t, host)).players.map((player) => player.name)).toEqual(["Host", "Bo"]);

    // Once the rematch starts, the old game says so.
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Di" });
    await t.mutation(api.engine.start, { capability: host.capability });
    expect((await t.query(api.views.recap, { roomCode: host.roomCode })).kind).toBe("READY");
    const recap = await t.query(api.views.recap, { roomCode: host.roomCode });
    if (recap.kind === "READY") {
      expect(recap.view.room.next).toEqual({ gameNumber: 2, status: "PLAYING" });
    }
  });

  test("Done that loses the race to Play again takes the seat out of the rematch lobby", async () => {
    const t = setup();
    const { host, ana, previous } = await finishedRoom(t);
    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });

    // Ana's phone was already on its way home; its leave now lands on the new lobby.
    await t.mutation(api.rooms.leave, { capability: ana.capability });
    await expect(view(t, ana)).rejects.toThrow("Invalid or expired room capability");
    const lobby = await view(t, host);
    expect(lobby.players.map((player) => player.name)).toEqual(["Host", "Bo"]);
    expect(lobby.me?.isHost).toBe(true);
    // The finished game keeps her in its results.
    const recap = await t.query(api.views.recap, { roomCode: host.roomCode, gameNumber: 1 });
    expect(recap.kind).toBe("READY");
    if (recap.kind === "READY") {
      expect(recap.view.players.map((player) => player.name)).toContain("Ana");
    }
    // And she can come back under her name.
    const back = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    expect((await roomOf(t, back)).id).toBe(lobby.room.id);
  });

  test("a phone that dropped just before the end comes along", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { host, ana, boTab } = await startedRoom(t);
    // Bo's phone sleeps 30 seconds before the end, inside the away grace.
    await t.mutation(api.presence.disconnect, { sessionToken: boTab.sessionToken });
    vi.advanceTimersByTime(30_000);
    await beat(t, ana);
    await t.mutation(api.engine.end, { capability: host.capability });
    const previous = await roomOf(t, host);

    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });
    const lobby = await view(t, host);
    expect(lobby.players.map((player) => player.name)).toEqual(["Host", "Ana", "Bo"]);
  });

  test("an old game left behind by a rematch never hands over its host", async () => {
    vi.useFakeTimers();
    const t = setup();
    const tv = await t.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostSecret: "secret",
      timersDisabled: true,
    });
    const ana = await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Ana" });
    const bo = await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Bo" });
    await t.action(api.rooms.join, { roomCode: tv.roomCode, name: "Cy" });
    await beat(t, ana);
    await t.mutation(api.engine.start, { capability: tv.capability });
    await t.mutation(api.engine.end, { capability: tv.capability });
    const previous = await roomOf(t, tv);
    await t.mutation(api.rooms.playAgain, { capability: tv.capability, gameId: previous.id });

    // Bo never had a tab, so he stayed on the finished game. He is online there
    // well inside the rematch window, but that game is no longer the room's.
    vi.advanceTimersByTime(60_000);
    await beat(t, bo);
    await t.mutation(internal.engine.maintain, { gameId: previous.id });
    const left = await view(t, bo);
    expect(left.room.id).toBe(previous.id);
    expect(left.me?.isHost).toBe(false);
    const old = (await gamesFor(t, tv.roomCode)).find((game) => game.gameNumber === 1)!;
    expect(old.hostPlayerId).toBeUndefined();
  });

  test("a MatchSlop rematch dates a fresh persona and leaves the old date alone", async () => {
    const t = setup();
    const host = await t.action(api.rooms.create, {
      gameType: "MATCHSLOP",
      hostSecret: "secret",
      hostName: "Host",
      timersDisabled: true,
      totalRounds: 2,
      settings: {
        matchslop: {
          seekerIdentity: "MAN",
          personaIdentity: "WOMAN",
          personaModelId: "anthropic/claude-haiku-5.5",
        },
      },
    });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    const previous = await roomOf(t, host);
    const stateOf = (gameId: Id<"games">) =>
      t.run((ctx) =>
        ctx.db
          .query("matchSlopState")
          .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
          .unique(),
      );
    // Stand in for a played date: the mood moved and the game finished.
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("matchSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", previous.id))
        .unique();
      await ctx.db.patch("matchSlopState", state!._id, { mood: 80, outcome: "DATE_SEALED" });
      const now = Date.now();
      await ctx.db.patch("games", previous.id, {
        status: "FINISHED",
        phase: "FINAL",
        finishedAt: now,
        updatedAt: now,
      });
    });
    const before = await stateOf(previous.id);

    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });
    const next = await roomOf(t, host);
    expect(next.id).not.toBe(previous.id);
    const fresh = await stateOf(next.id);
    expect(fresh).not.toBeNull();
    expect(fresh!.personaSeedId).not.toBe(before!.personaSeedId);
    expect(fresh!.mood).toBe(MATCHSLOP_INITIAL_MOOD);
    expect(fresh!.outcome).toBe("IN_PROGRESS");
    expect(fresh!.seekerIdentity).toBe(before!.seekerIdentity);
    expect(fresh!.personaIdentity).toBe(before!.personaIdentity);
    expect(fresh!.personaModelId).toBe(before!.personaModelId);
    expect(await stateOf(previous.id)).toEqual(before);
  });

  test("leave only works on a finished game or a rematch lobby", async () => {
    const t = setup();
    const host = await t.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostSecret: "secret",
      hostName: "Host",
      timersDisabled: true,
    });
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await expect(t.mutation(api.rooms.leave, { capability: ana.capability })).rejects.toThrow(
      "Finish this game first",
    );
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    await t.mutation(api.engine.start, { capability: host.capability });
    await expect(t.mutation(api.rooms.leave, { capability: ana.capability })).rejects.toThrow(
      "Finish this game first",
    );
  });

  test("an old tab's heartbeat lands in the new room", async () => {
    const t = setup();
    const host = await t.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostSecret: "secret",
      hostName: "Host",
      timersDisabled: true,
    });
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
    const anaTab = newTab();
    await beat(t, ana, anaTab);
    await t.mutation(api.engine.start, { capability: host.capability });
    await t.mutation(api.engine.end, { capability: host.capability });
    const previous = await roomOf(t, host);

    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });
    // The same tab keeps beating: without clearing the old room this throws.
    await beat(t, ana, anaTab);
    const lobby = await view(t, host);
    expect(lobby.players.find((player) => player.name === "Ana")?.online).toBe(true);
    // Bo never had a tab, so he stayed behind.
    expect(lobby.players.map((player) => player.name)).toEqual(["Host", "Ana"]);
  });

  test("each game is projected to the leaderboard on its own", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { host, ana, bo, previous } = await finishedRoom(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });
    const flags = async () =>
      (await gamesFor(t, host.roomCode))
        .toSorted((left, right) => left.gameNumber - right.gameNumber)
        .map((game) => game.leaderboardProjected === true);
    expect(await flags()).toEqual([true, false]);

    for (const seat of [host, ana, bo]) await beat(t, seat);
    await t.mutation(api.engine.start, { capability: host.capability });
    await t.mutation(api.engine.end, { capability: host.capability });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await flags()).toEqual([true, true]);
  });

  test("a stale rematch lobby is swept and the code falls back to the kept game", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { host, previous } = await finishedRoom(t);
    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });
    expect((await t.query(api.views.watch, { roomCode: host.roomCode })).room.gameNumber).toBe(2);

    vi.advanceTimersByTime(2 * HOUR_MS + 60_000);
    await t.mutation(internal.cleanup.sweep, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const watched = await t.query(api.views.watch, { roomCode: host.roomCode });
    expect(watched.room).toMatchObject({
      id: previous.id,
      gameNumber: 1,
      status: "FINISHED",
      next: null,
    });
    await expect(view(t, host)).rejects.toThrow("Invalid or expired room capability");
  });

  test("a repeat press is a no-op and a game from another room is refused", async () => {
    const t = setup();
    const { host, previous } = await finishedRoom(t);
    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });
    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: previous.id });
    expect(await gamesFor(t, host.roomCode)).toHaveLength(2);

    const other = await finishedRoom(t);
    await expect(
      t.mutation(api.rooms.playAgain, {
        capability: host.capability,
        gameId: other.previous.id as Id<"games">,
      }),
    ).rejects.toThrow("This room has moved on");
  });
});
