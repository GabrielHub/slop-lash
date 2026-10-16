/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";
import { room as roomQuery, watch as watchQuery } from "../views";
import { chooseTopic, reactions as reactionsQuery } from "./play";
import { revealOrder } from "../../src/games/quizslop/deck";

const modules = import.meta.glob("/convex/**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  workpoolTest.register(t, "aiGenerationWorkpool");
  workpoolTest.register(t, "aiCriticalWorkpool");
  return t;
}

type Backend = ReturnType<typeof setup>;
type Seat = { capability: string; playerId: Id<"players">; roomCode: string };

/** Run the real entrypoint with an instrumented database; Convex hides this runtime field in its public types. */
function invokeHandler<Args extends Record<string, unknown>, Result>(
  fn: RegisteredQuery<"public", Args, Result> | RegisteredMutation<"public", Args, Result>,
  ctx: MutationCtx,
  args: Args,
): Result {
  return (fn as unknown as { _handler: (ctx: MutationCtx, args: Args) => Result })._handler(ctx, args);
}

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** A QuizSlop lobby with Host plus the named guests. */
async function lobby(t: Backend, guests: string[], timersDisabled = true): Promise<Seat[]> {
  const host = await t.action(api.rooms.create, {
    gameType: "QUIZSLOP",
    hostSecret: "secret",
    hostName: "Host",
    timersDisabled,
  });
  const seats: Seat[] = [host as Seat];
  for (const name of guests) {
    seats.push((await t.action(api.rooms.join, { roomCode: host.roomCode, name })) as Seat);
  }
  return seats;
}

async function view(t: Backend, seat: Seat) {
  return t.query(api.views.room, { capability: seat.capability });
}

async function mode(t: Backend, seat: Seat) {
  const current = (await view(t, seat)).mode;
  if (current?.kind !== "QUIZSLOP") throw new Error("wrong mode");
  return current;
}

async function liveGame(t: Backend, seat: Seat): Promise<Doc<"games">> {
  const games = await t.run((ctx) =>
    ctx.db
      .query("games")
      .withIndex("by_roomCode_and_gameNumber", (index) => index.eq("roomCode", seat.roomCode))
      .order("desc")
      .take(1),
  );
  return games[0]!;
}

async function patchSeats(
  t: Backend,
  seat: Seat,
  patch: (row: Doc<"quizSlopSeats">) => Partial<Doc<"quizSlopSeats">> | null,
) {
  const game = await liveGame(t, seat);
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("quizSlopSeats")
      .withIndex("by_gameId_and_playerId", (index) => index.eq("gameId", game._id))
      .take(16);
    for (const row of rows) {
      const fields = patch(row);
      if (fields) await ctx.db.patch("quizSlopSeats", row._id, fields);
    }
  });
}

async function advance(t: Backend, host: Seat) {
  const room = (await view(t, host)).room;
  await t.mutation(api.engine.advanceByHost, {
    capability: host.capability,
    expectedPhaseGeneration: room.phaseGeneration,
  });
}

async function deckRounds(t: Backend, gameId: Id<"games">) {
  return t.run((ctx) =>
    ctx.db
      .query("quizSlopRounds")
      .withIndex("by_gameId_and_ordinal", (index) => index.eq("gameId", gameId))
      .take(16),
  );
}

/** Answer rows for one round, or for the whole game. */
async function roundAnswers(t: Backend, gameId: Id<"games">, ordinal?: number) {
  return t.run((ctx) =>
    ctx.db
      .query("quizSlopAnswers")
      .withIndex("by_gameId_and_ordinal_and_playerId", (index) =>
        ordinal === undefined
          ? index.eq("gameId", gameId)
          : index.eq("gameId", gameId).eq("ordinal", ordinal),
      )
      .take(200),
  );
}

async function roundCalls(t: Backend, gameId: Id<"games">, ordinal: number) {
  return t.run((ctx) =>
    ctx.db
      .query("quizSlopCalls")
      .withIndex("by_gameId_and_ordinal_and_callerId", (index) =>
        index.eq("gameId", gameId).eq("ordinal", ordinal),
      )
      .take(16),
  );
}

/** Gives each seat a different hidden tier, so each player gets their own question. */
async function spreadTiers(t: Backend, seats: Seat[]) {
  const tiers = ["EASY", "MEDIUM", "HARD", "INSANE"] as const;
  await patchSeats(t, seats[0]!, (row) => {
    const index = seats.findIndex((seat) => seat.playerId === row.playerId);
    return index === -1 ? null : { tier: tiers[index]! };
  });
}

/**
 * Plays phases (everyone passes bets, locks choice 0, the host advances the
 * rest) until `stop` says so. Returns the phases visited.
 */
async function playUntil(
  t: Backend,
  seats: Seat[],
  stop: (room: Awaited<ReturnType<typeof view>>["room"]) => boolean,
) {
  const host = seats[0]!;
  const visited: string[] = [];
  for (let guard = 0; guard < 80; guard += 1) {
    const room = (await view(t, host)).room;
    if (room.status !== "PLAYING" || stop(room)) return visited;
    visited.push(`${room.phase}:${room.round}`);
    if (room.phase === "CALL") {
      const eligible = (await mode(t, host)).calls.eligiblePlayerIds;
      for (const seat of seats) {
        if (!eligible.includes(seat.playerId)) continue;
        await t.mutation(api.quizslop.play.call, { capability: seat.capability, targetId: null });
      }
    } else if (room.phase === "ANSWER") {
      const assigned = (await mode(t, host)).answer!.assignedPlayerIds;
      for (const seat of seats) {
        if (!assigned.includes(seat.playerId)) continue;
        await t.mutation(api.quizslop.play.lockAnswer, {
          capability: seat.capability,
          selectedIndex: 0,
        });
      }
    } else if (room.phase === "HOUSE_VOTE") {
      const slate = (await mode(t, host)).houseVote!.slate;
      for (const seat of seats) {
        await t.mutation(api.quizslop.play.houseVote, {
          capability: seat.capability,
          topicId: slate[0]!.id,
        });
      }
    } else {
      await advance(t, host);
    }
  }
  throw new Error("game did not reach the stop condition");
}

describe("QuizSlop rules", () => {
  test("a player with no bets left is never waited on, and passes when bets close", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const [host, ana, bo] = seats as [Seat, Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await patchSeats(t, host, (row) => (row.playerId === bo.playerId ? { callTokens: 0 } : null));

    const calls = (await mode(t, host)).calls;
    expect(calls.eligiblePlayerIds).toEqual([host.playerId, ana.playerId]);

    await t.mutation(api.quizslop.play.call, { capability: host.capability, targetId: null });
    expect((await view(t, host)).room.phase).toBe("CALL");
    await t.mutation(api.quizslop.play.call, { capability: ana.capability, targetId: null });
    expect((await view(t, host)).room.phase).toBe("ANSWER");

    const game = await liveGame(t, host);
    const boCall = await t.run((ctx) =>
      ctx.db
        .query("quizSlopCalls")
        .withIndex("by_gameId_and_ordinal_and_callerId", (index) =>
          index.eq("gameId", game._id).eq("ordinal", 1).eq("callerId", bo.playerId),
        )
        .unique(),
    );
    expect(boCall).not.toBeNull();
    expect(boCall?.targetId).toBeUndefined();
  });

  test("a bet can be taken back while betting is open, refunding the token", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const [host, ana, bo] = seats as [Seat, Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    const tokens = async () =>
      (await mode(t, host)).seats.find((seat) => seat.playerId === host.playerId)!.callTokens;
    const before = await tokens();

    await t.mutation(api.quizslop.play.call, { capability: host.capability, targetId: ana.playerId });
    expect(await tokens()).toBe(before - 1);
    expect((await mode(t, host)).calls.decidedPlayerIds).toContain(host.playerId);

    await t.mutation(api.quizslop.play.uncall, { capability: host.capability });
    expect(await tokens()).toBe(before);
    expect((await mode(t, host)).calls.decidedPlayerIds).not.toContain(host.playerId);
    expect((await mode(t, host)).calls.myCall).toBeNull();

    // A pass can be taken back too, and a fresh bet still closes the phase.
    await t.mutation(api.quizslop.play.call, { capability: host.capability, targetId: null });
    await t.mutation(api.quizslop.play.uncall, { capability: host.capability });
    await t.mutation(api.quizslop.play.call, { capability: host.capability, targetId: bo.playerId });
    await t.mutation(api.quizslop.play.call, { capability: ana.capability, targetId: null });
    await t.mutation(api.quizslop.play.call, { capability: bo.capability, targetId: null });
    expect((await view(t, host)).room.phase).toBe("ANSWER");
    await expect(
      t.mutation(api.quizslop.play.uncall, { capability: host.capability }),
    ).rejects.toThrow("Betting is closed");
  });

  test("a bet still rejects foreign or removed targets and duplicate submissions spend one token", async () => {
    const t = setup();
    const [host, ana, bo] = await lobby(t, ["Ana", "Bo"]) as [Seat, Seat, Seat];
    const [otherHost] = await lobby(t, ["Elsewhere"]) as [Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await expect(t.mutation(api.quizslop.play.call, {
      capability: host.capability,
      targetId: otherHost.playerId,
    })).rejects.toThrow("That player is not in the game");
    await t.mutation(api.rooms.kick, { capability: host.capability, playerId: bo.playerId });
    await expect(t.mutation(api.quizslop.play.call, {
      capability: host.capability,
      targetId: bo.playerId,
    })).rejects.toThrow("That player is not in the game");
    const tokens = (await mode(t, host)).seats.find((seat) => seat.playerId === host.playerId)!.callTokens;
    const args = { capability: host.capability, targetId: ana.playerId };
    await t.mutation(api.quizslop.play.call, args);
    await t.mutation(api.quizslop.play.call, args);
    const current = await mode(t, host);
    expect(current.seats.find((seat) => seat.playerId === host.playerId)!.callTokens).toBe(tokens - 1);
    expect((await roundCalls(t, (await liveGame(t, host))._id, 1))
      .filter((call) => call.callerId === host.playerId)).toHaveLength(1);
  });

  test("reactions open during a reveal step, once per emoji, and reset each step", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const [host, ana] = seats as [Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await expect(
      t.mutation(api.quizslop.play.react, { capability: ana.capability, emoji: "clap" }),
    ).rejects.toThrow("Reactions open during the reveal");
    await spreadTiers(t, seats);
    await playUntil(t, seats, (room) => room.phase === "REVEAL");
    expect((await view(t, host)).room.step).toBe(0);
    const before = await view(t, ana);
    const watching = await t.query(api.views.watch, { roomCode: host.roomCode });
    const reactionArgs = {
      roomCode: host.roomCode,
      phaseGeneration: before.room.phaseGeneration,
    };

    await t.mutation(api.quizslop.play.react, { capability: ana.capability, emoji: "clap" });
    await t.mutation(api.quizslop.play.react, { capability: ana.capability, emoji: "clap" });
    await t.mutation(api.quizslop.play.react, { capability: host.capability, emoji: "skull" });
    await expect(
      t.mutation(api.quizslop.play.react, { capability: ana.capability, emoji: "puke" }),
    ).rejects.toThrow("Unknown reaction");

    const seen = await t.query(api.quizslop.play.reactions, {
      ...reactionArgs,
      capability: ana.capability,
    });
    expect(seen.map((reaction) => [reaction.emoji, reaction.mine])).toEqual([
      ["clap", true],
      ["skull", false],
    ]);
    expect(await t.query(api.quizslop.play.reactions, reactionArgs)).toEqual(
      seen.map((reaction) => ({ ...reaction, mine: false })),
    );
    expect(await view(t, ana)).toEqual(before);
    expect(await t.query(api.views.watch, { roomCode: host.roomCode })).toEqual(watching);
    await expect(t.query(api.quizslop.play.reactions, {
      ...reactionArgs,
      capability: "invalid",
    })).rejects.toThrow();
    expect(await t.query(api.quizslop.play.reactions, {
      ...reactionArgs,
      roomCode: "OTHER",
      capability: ana.capability,
    })).toEqual([]);

    // Exercise both entrypoints with their real context: reactions must never
    // join the large reactive room read set again, even during a reveal.
    await t.run(async (ctx) => {
      const reads = vi.spyOn(ctx.db, "query");
      try {
        await invokeHandler(roomQuery, ctx, { capability: ana.capability });
        expect(reads.mock.calls.map(([table]) => table)).not.toContain("quizSlopReactions");
        reads.mockClear();
        await invokeHandler(watchQuery, ctx, { roomCode: host.roomCode });
        expect(reads.mock.calls.map(([table]) => table)).not.toContain("quizSlopReactions");
        reads.mockClear();
        await invokeHandler(reactionsQuery, ctx, reactionArgs);
        expect(reads.mock.calls.map(([table]) => table)).toEqual(["games", "quizSlopReactions"]);
      } finally {
        reads.mockRestore();
      }
    });

    await advance(t, host);
    const next = await view(t, host);
    expect(await t.query(api.quizslop.play.reactions, reactionArgs)).toEqual([]);
    expect(await t.query(api.quizslop.play.reactions, {
      ...reactionArgs,
      phaseGeneration: next.room.phaseGeneration,
    })).toEqual([]);
    if (next.room.phase === "REVEAL") {
      await t.mutation(api.quizslop.play.react, { capability: ana.capability, emoji: "clap" });
      expect(await t.query(api.quizslop.play.reactions, {
        ...reactionArgs,
        phaseGeneration: next.room.phaseGeneration,
      })).toHaveLength(1);
    }
    await t.mutation(api.engine.end, { capability: host.capability });
    expect(await t.query(api.quizslop.play.reactions, {
      ...reactionArgs,
      phaseGeneration: (await view(t, host)).room.phaseGeneration,
    })).toEqual([]);
  });

  test("choosing the same topic again does not rewrite the subscribed seat", async () => {
    const t = setup();
    const [host] = await lobby(t, ["Ana"]);
    const topicId = (await mode(t, host!)).lobby!.topics[0]!.id;
    await t.mutation(api.quizslop.play.chooseTopic, { capability: host!.capability, topicId });
    await t.run(async (ctx) => {
      const writes = vi.spyOn(ctx.db, "patch");
      try {
        await invokeHandler(chooseTopic, ctx, { capability: host!.capability, topicId });
        expect(writes).not.toHaveBeenCalled();
      } finally {
        writes.mockRestore();
      }
    });
  });

  test("a round where nobody has a bet left opens straight at answers", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana"]);
    const host = seats[0]!;
    await t.mutation(api.engine.start, { capability: host.capability });
    await playUntil(t, seats, (room) => room.phase === "ROUND_RESULTS");
    await patchSeats(t, host, () => ({ callTokens: 0 }));
    await advance(t, host);

    const room = (await view(t, host)).room;
    expect(room).toMatchObject({ phase: "ANSWER", round: 2 });
    expect((await mode(t, host)).calls.decidedPlayerIds).toEqual([]);
    const game = await liveGame(t, host);
    const answers = await t.run((ctx) =>
      ctx.db
        .query("quizSlopAnswers")
        .withIndex("by_gameId_and_ordinal_and_playerId", (index) =>
          index.eq("gameId", game._id).eq("ordinal", 2),
        )
        .take(8),
    );
    expect(answers).toHaveLength(2);
  });

  test("timed phases run 30s bets, 30s answers, 15s per reveal, 12s results", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana"], false);
    const host = seats[0]!;
    await t.mutation(api.engine.start, { capability: host.capability });
    const lengths = new Map<string, number>();
    for (let guard = 0; guard < 12 && !lengths.has("ROUND_RESULTS"); guard += 1) {
      const room = (await view(t, host)).room;
      lengths.set(room.phase, room.phaseDeadline! - room.phaseStartedAt);
      await playUntil(t, seats, (next) => next.phaseGeneration !== room.phaseGeneration);
    }
    expect(Object.fromEntries(lengths)).toEqual({
      CALL: 30_000,
      ANSWER: 30_000,
      REVEAL: 15_000,
      ROUND_RESULTS: 12_000,
    });

    await playUntil(t, seats, (room) => room.phase === "HOUSE_VOTE");
    const vote = (await view(t, host)).room;
    expect(vote.phaseDeadline! - vote.phaseStartedAt).toBe(30_000);
  });

  test("a locked answer can never change", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const host = seats[0]!;
    await t.mutation(api.engine.start, { capability: host.capability });
    await playUntil(t, seats, (room) => room.phase === "ANSWER");
    await t.mutation(api.quizslop.play.lockAnswer, {
      capability: host.capability,
      selectedIndex: 0,
    });
    await t.mutation(api.quizslop.play.lockAnswer, {
      capability: host.capability,
      selectedIndex: 2,
    });
    const answer = (await mode(t, host)).answer!;
    expect(answer.mine).toMatchObject({ selectedIndex: 0, locked: true });
    expect(answer.lockedPlayerIds).toEqual([host.playerId]);
  });

  test("choices are shuffled per game, and the phone, reveal and score agree on the order", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const host = seats[0]!;
    await t.mutation(api.engine.start, { capability: host.capability });
    await playUntil(t, seats, (room) => room.phase === "ANSWER");
    const shown = new Map<string, string[]>();
    for (const [index, seat] of seats.entries()) {
      const mine = (await mode(t, seat)).answer!.mine!;
      shown.set(seat.playerId, mine.choices);
      await t.mutation(api.quizslop.play.lockAnswer, {
        capability: seat.capability,
        selectedIndex: index % 4,
      });
    }
    let checked = 0;
    while ((await view(t, host)).room.phase === "REVEAL") {
      const groups = (await mode(t, host)).reveal;
      const group = groups[groups.length - 1]!;
      for (const player of group.players) {
        expect(group.choices).toEqual(shown.get(player.playerId));
        expect(player.correct).toBe(player.selectedIndex === group.correctIndex);
        checked += 1;
      }
      await advance(t, host);
    }
    expect(checked).toBe(3);
  });

  test("the last topic's vote result is hidden during the vote and shown after", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana"]);
    const [host, ana] = seats as [Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    const visited = await playUntil(t, seats, (room) => room.phase === "HOUSE_VOTE");
    expect(visited).not.toContain("ROUND_RESULTS:4");

    const voting = (await mode(t, host)).houseVote!;
    expect(voting.result).toBeNull();
    const slate = voting.slate;
    await t.mutation(api.quizslop.play.houseVote, {
      capability: host.capability,
      topicId: slate[1]!.id,
    });
    await t.mutation(api.quizslop.play.houseVote, {
      capability: ana.capability,
      topicId: slate[0]!.id,
    });

    const room = (await view(t, host)).room;
    expect(room).toMatchObject({ phase: "CALL", round: 4 });
    const current = await mode(t, host);
    // A 1-1 split resolves by slate order.
    expect(current.round?.topic?.id).toBe(slate[0]!.id);
    expect(current.houseVote?.result).toEqual({
      winnerTopicId: slate[0]!.id,
      votes: [
        { topicId: slate[0]!.id, voterIds: [ana.playerId] },
        { topicId: slate[1]!.id, voterIds: [host.playerId] },
        { topicId: slate[2]!.id, voterIds: [] },
      ],
    });

    const rest = await playUntil(t, seats, () => false);
    expect(rest).toContain("REVEAL:4");
    expect(rest).not.toContain("ROUND_RESULTS:4");
    expect((await view(t, host)).room.status).toBe("FINISHED");
  });

  test("kicked players leave seats and standings but keep their name", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const [host, , bo] = seats as [Seat, Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await t.mutation(api.rooms.kick, { capability: host.capability, playerId: bo.playerId });

    const current = await mode(t, host);
    expect(current.seats.map((seat) => seat.playerId)).not.toContain(bo.playerId);
    expect(current.calls.eligiblePlayerIds).not.toContain(bo.playerId);
    expect(current.names[bo.playerId]).toBe("Bo");

    await t.mutation(api.engine.end, { capability: host.capability });
    const final = (await mode(t, host)).final!;
    expect(final.standings.map((entry) => entry.playerId)).not.toContain(bo.playerId);
    expect(final.standings).toHaveLength(2);
  });

  test("a bet on a player kicked during answers settles as won", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const [host, ana, bo] = seats as [Seat, Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await t.mutation(api.quizslop.play.call, {
      capability: host.capability,
      targetId: bo.playerId,
    });
    await t.mutation(api.quizslop.play.call, { capability: ana.capability, targetId: null });
    await t.mutation(api.quizslop.play.call, { capability: bo.capability, targetId: null });
    expect((await view(t, host)).room.phase).toBe("ANSWER");

    await t.mutation(api.rooms.kick, { capability: host.capability, playerId: bo.playerId });
    expect((await mode(t, host)).answer?.assignedPlayerIds).not.toContain(bo.playerId);
    await playUntil(t, [host, ana], (room) => room.phase === "ROUND_RESULTS");

    const current = await mode(t, host);
    expect(current.calls.list).toEqual([
      { callerId: host.playerId, targetId: bo.playerId, outcome: "WON", delta: 150 },
    ]);
    const boGroup = current.reveal.find((group) =>
      group.players.some((player) => player.playerId === bo.playerId),
    );
    expect(boGroup?.players.find((player) => player.playerId === bo.playerId)?.timedOut).toBe(true);
  });

  test("on a player's topic, the owner's question is revealed last", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const host = seats[0]!;
    await t.mutation(api.engine.start, { capability: host.capability });
    const tiers = ["EASY", "MEDIUM", "HARD"] as const;
    let checked = 0;
    for (let round = 2; round <= 4; round += 1) {
      await playUntil(t, seats, (room) => room.phase === "CALL" && room.round === round);
      // Spread the hidden tiers so the round has one question per player.
      await patchSeats(t, host, (row) => ({
        tier: tiers[seats.findIndex((seat) => seat.playerId === row.playerId)]!,
      }));
      await playUntil(t, seats, (room) => room.phase === "REVEAL");
      const game = await liveGame(t, host);
      const deckRound = await t.run((ctx) =>
        ctx.db
          .query("quizSlopRounds")
          .withIndex("by_gameId_and_ordinal", (index) =>
            index.eq("gameId", game._id).eq("ordinal", round),
          )
          .unique(),
      );
      expect(deckRound?.kind).toBe("HOME_TURF");
      const ownerAnswer = await t.run((ctx) =>
        ctx.db
          .query("quizSlopAnswers")
          .withIndex("by_gameId_and_ordinal_and_playerId", (index) =>
            index
              .eq("gameId", game._id)
              .eq("ordinal", round)
              .eq("playerId", deckRound!.ownerPlayerId!),
          )
          .unique(),
      );
      expect(deckRound?.revealQuestionIds).toHaveLength(3);
      expect(deckRound?.revealQuestionIds?.at(-1)).toBe(ownerAnswer?.questionId);
      const owner = seats.find((seat) => seat.playerId === deckRound!.ownerPlayerId)!;
      expect((await mode(t, owner)).myRevealStep).toBe(2);
      checked += 1;
    }
    expect(checked).toBe(3);
  });
});

describe("QuizSlop bets", () => {
  test("bets close on the deadline and everyone undecided passes", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"], false);
    const [host, ana, bo] = seats as [Seat, Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await patchSeats(t, host, (row) => (row.playerId === bo.playerId ? { callTokens: 0 } : null));
    await t.mutation(api.quizslop.play.call, {
      capability: host.capability,
      targetId: ana.playerId,
    });

    const calling = (await view(t, host)).room;
    expect(calling.phase).toBe("CALL");
    const game = await liveGame(t, host);
    vi.setSystemTime(calling.phaseDeadline! + 1);
    await t.mutation(internal.engine.tick, {
      gameId: game._id,
      phaseGeneration: calling.phaseGeneration,
    });

    expect((await view(t, host)).room.phase).toBe("ANSWER");
    const calls = await roundCalls(t, game._id, 1);
    const byCaller = new Map(calls.map((entry) => [entry.callerId, entry.targetId ?? null]));
    expect(calls).toHaveLength(3);
    expect(byCaller.get(host.playerId)).toBe(ana.playerId);
    // Ana never decided, and Bo had no bets left: both pass.
    expect(byCaller.get(ana.playerId)).toBeNull();
    expect(byCaller.get(bo.playerId)).toBeNull();
  });

  test("bets and answer keys stay hidden until their reveal", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const [host, ana, bo] = seats as [Seat, Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await spreadTiers(t, seats);

    // During bets: no targets, and a spent bet shows only on the bettor's own phone.
    await t.mutation(api.quizslop.play.call, {
      capability: host.capability,
      targetId: ana.playerId,
    });
    for (const seat of seats) {
      const current = await mode(t, seat);
      expect(current.calls.list).toEqual([]);
      expect(current.calls.decidedPlayerIds).toEqual([host.playerId]);
      const hostSeat = current.seats.find((entry) => entry.playerId === host.playerId)!;
      expect(hostSeat.callTokens).toBe(seat === host ? 1 : 2);
    }
    expect((await mode(t, host)).calls.myCall).toEqual({ targetId: ana.playerId });
    await t.mutation(api.quizslop.play.call, { capability: ana.capability, targetId: bo.playerId });
    await t.mutation(api.quizslop.play.call, { capability: bo.capability, targetId: host.playerId });

    // During answers: each phone has its own question and no key.
    expect((await view(t, host)).room.phase).toBe("ANSWER");
    for (const seat of seats) {
      const current = await mode(t, seat);
      expect(current.answer!.mine).not.toBeNull();
      expect(current.answer!.mine).not.toHaveProperty("correctIndex");
      expect(current.reveal).toEqual([]);
      expect(current.calls.list.every((bet) => bet.outcome === null && bet.delta === 0)).toBe(true);
    }
    for (const seat of seats) {
      await t.mutation(api.quizslop.play.lockAnswer, {
        capability: seat.capability,
        selectedIndex: 0,
      });
    }

    // Each reveal step decides only the bets on players whose question is on screen.
    const game = await liveGame(t, host);
    const answers = await roundAnswers(t, game._id, 1);
    const questionOf = new Map<string, string>(
      answers.map((answer) => [answer.playerId, answer.questionId]),
    );
    for (let step = 0; step < 3; step += 1) {
      expect((await view(t, host)).room).toMatchObject({ phase: "REVEAL", step });
      const current = await mode(t, host);
      expect(current.reveal).toHaveLength(step + 1);
      const shown = new Set(current.reveal.map((group) => group.questionId));
      expect(current.calls.list).toHaveLength(3);
      for (const bet of current.calls.list) {
        if (shown.has(questionOf.get(bet.targetId)!)) {
          expect(bet.outcome).not.toBeNull();
          expect(Math.abs(bet.delta)).toBe(150);
        } else {
          expect(bet).toMatchObject({ outcome: null, delta: 0 });
        }
      }
      await advance(t, host);
    }
    expect((await view(t, host)).room.phase).toBe("ROUND_RESULTS");
  });

  test("bets are refused after bets close, on yourself, and with none left", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const [host, ana] = seats as [Seat, Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });

    await expect(
      t.mutation(api.quizslop.play.call, { capability: host.capability, targetId: host.playerId }),
    ).rejects.toThrow("You can't bet on yourself");
    await patchSeats(t, host, (row) => (row.playerId === ana.playerId ? { callTokens: 0 } : null));
    await expect(
      t.mutation(api.quizslop.play.call, { capability: ana.capability, targetId: host.playerId }),
    ).rejects.toThrow("No bets left");

    await playUntil(t, seats, (room) => room.phase === "ANSWER");
    await expect(
      t.mutation(api.quizslop.play.call, { capability: host.capability, targetId: ana.playerId }),
    ).rejects.toThrow("Betting is closed");
  });
});

describe("QuizSlop reveal order", () => {
  test("a player's topic whose owner was kicked reveals in plain hash order", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana", "Bo"]);
    const host = seats[0]!;
    await t.mutation(api.engine.start, { capability: host.capability });
    const game = await liveGame(t, host);
    const owned = (await deckRounds(t, game._id)).find(
      (round) => round.kind === "HOME_TURF" && round.ownerPlayerId !== host.playerId,
    )!;
    const owner = seats.find((seat) => seat.playerId === owned.ownerPlayerId)!;

    await playUntil(t, seats, (room) => room.phase === "CALL" && room.round === owned.ordinal);
    await t.mutation(api.rooms.kick, { capability: host.capability, playerId: owner.playerId });
    const rest = seats.filter((seat) => seat !== owner);
    await spreadTiers(t, rest);
    await playUntil(t, rest, (room) => room.phase === "REVEAL");

    const answers = await roundAnswers(t, game._id, owned.ordinal);
    expect(answers.map((answer) => answer.playerId)).not.toContain(owner.playerId);
    const round = (await deckRounds(t, game._id)).find((entry) => entry._id === owned._id)!;
    expect(round.revealQuestionIds).toEqual(
      revealOrder(
        [...new Set(answers.map((answer) => answer.questionId))],
        `${game._id}:${owned.ordinal}`,
        null,
      ),
    );
  });
});

describe("QuizSlop rematch", () => {
  test("Play again deals topics the room did not play last game", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana"]);
    const [host, ana] = seats as [Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await playUntil(t, seats, (room) => room.phase === "REVEAL");
    const firstWarmUp = (await mode(t, host)).round!.topic!.id;
    await t.mutation(api.engine.end, { capability: host.capability });

    for (const [index, seat] of seats.entries()) {
      await t.mutation(api.presence.heartbeat, {
        capability: seat.capability,
        tabId: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
        interval: 5_000,
      });
    }
    const first = await liveGame(t, host);
    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: first._id });
    const second = await liveGame(t, host);
    expect(second.gameNumber).toBe(2);

    const offered = (await mode(t, host)).lobby!.topics.map((topic) => topic.id);
    expect(offered).not.toContain(firstWarmUp);
    expect(offered.length).toBeGreaterThan(0);

    // Nobody picks, so the house deals every topic in game 2.
    await t.mutation(api.engine.start, { capability: host.capability });
    expect((await view(t, ana)).room.status).toBe("PLAYING");
    const rounds = await t.run((ctx) =>
      ctx.db
        .query("quizSlopRounds")
        .withIndex("by_gameId_and_ordinal", (index) => index.eq("gameId", second._id))
        .take(16),
    );
    const dealt = rounds.flatMap((round) => [
      ...(round.topicId ? [round.topicId] : []),
      ...(round.finalistTopicIds ?? []),
    ]);
    expect(dealt.length).toBeGreaterThan(0);
    expect(dealt).not.toContain(firstWarmUp);
  });

  test("after a full game, Play again avoids every asked question and swaps tiers on a stale topic", async () => {
    const t = setup();
    const seats = await lobby(t, ["Ana"]);
    const [host, ana] = seats as [Seat, Seat];
    await t.mutation(api.engine.start, { capability: host.capability });
    await playUntil(t, seats, () => false);
    expect((await view(t, host)).room.status).toBe("FINISHED");
    const first = await liveGame(t, host);
    const asked = new Set((await roundAnswers(t, first._id)).map((answer) => answer.questionId));
    const firstTopics = new Set(
      (await deckRounds(t, first._id)).flatMap((round) => (round.topicId ? [round.topicId] : [])),
    );
    expect(firstTopics.size).toBe(4);

    for (const [index, seat] of seats.entries()) {
      await t.mutation(api.presence.heartbeat, {
        capability: seat.capability,
        tabId: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
        interval: 5_000,
      });
    }
    await t.mutation(api.rooms.playAgain, { capability: host.capability, gameId: first._id });
    const second = await liveGame(t, host);
    await t.mutation(api.engine.start, { capability: host.capability });
    expect((await view(t, ana)).room.status).toBe("PLAYING");

    // No topic from game 1 is dealt again.
    const rounds = await deckRounds(t, second._id);
    for (const round of rounds) {
      expect(firstTopics.has(round.topicId ?? "")).toBe(false);
      for (const finalist of round.finalistTopicIds ?? []) {
        expect(firstTopics.has(finalist)).toBe(false);
      }
    }

    // Force game 1's warm-up topic back in: both players sit at the tier they saw
    // it at, so the server must hand out a fresh tier's question instead.
    const warmUp = (await deckRounds(t, first._id)).find((round) => round.kind === "WARM_UP")!;
    await t.run((ctx) =>
      ctx.db.patch("quizSlopRounds", rounds.find((round) => round.ordinal === 1)!._id, {
        topicId: warmUp.topicId,
      }),
    );
    // Play again seats everyone as new player rows.
    const again: Seat[] = [];
    for (const seat of seats) {
      again.push({ ...seat, playerId: (await view(t, seat)).me!.playerId as Id<"players"> });
    }
    await playUntil(t, again, (room) => room.phase === "ANSWER");
    const dealt = await roundAnswers(t, second._id, 1);
    expect(dealt).toHaveLength(2);
    for (const answer of dealt) expect(asked.has(answer.questionId)).toBe(false);
  });
});
