/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  HIDDEN_TIER_TOKENS,
  QUIZSLOP_HOST_SECRET,
  advanceToPhase,
  castHouseVoteAs,
  chooseDistinctTopics,
  createPresenceController,
  createQuizslopRoom,
  enforceCurrentDeadline,
  enforceStaleDeadline,
  getCurrentRound,
  getGame,
  getParticipant,
  getQuizslopState,
  getRoundByOrdinal,
  hostAdvance,
  initiateDisputeAs,
  lockAnswerAs,
  playerIdOf,
  playStandardRound,
  readAssignmentQuestion,
  readLedger,
  stageViewOf,
  startQuizslop,
  viewContains,
  type LedgerSnapshot,
} from "./quizslopTestKit";

const modules = import.meta.glob("./**/*.ts");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  return backend;
}

type Backend = ReturnType<typeof createTestBackend>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T20:00:00.000Z"));
  vi.stubEnv("HOST_SECRET", QUIZSLOP_HOST_SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function expectLedgerConsistent(ledger: LedgerSnapshot): void {
  for (const entry of ledger.entries) {
    expect(entry.total).toBe(entry.quizSubtotal + entry.callSubtotal);
    expect(entry.mirroredScore).toBe(entry.total);
    expect(entry.eventSum).toBe(entry.total);
  }
  expect(new Set(ledger.eventKeys).size).toBe(ledger.eventKeys.length);
}

async function createReadyGame(
  backend: Backend,
  options?: { joinerNames?: readonly string[]; timersDisabled?: boolean },
) {
  const room = await createQuizslopRoom(backend, {
    joinerNames: options?.joinerNames ?? ["Bea", "Cody"],
    timersDisabled: options?.timersDisabled ?? true,
  });
  const presence = createPresenceController(backend);
  await chooseDistinctTopics(backend, room.players);
  await presence.heartbeatAll(room.players);
  const started = await startQuizslop(backend, room.host);
  expect(started.started).toBe(true);
  return { ...room, presence, started };
}

describe("QuizSlop house vote and finale", () => {
  test("system-voids a question group when its frozen assignment is corrupt", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend, { joinerNames: ["Bea"] });
    const guest = guests[0]!;

    await advanceToPhase(backend, host, "ANSWER");
    const assigned = await readAssignmentQuestion(backend, host);
    await lockAnswerAs(backend, host, true);
    await backend.run(async (ctx) => {
      await ctx.db.patch("quizSlopAssignments", assigned.assignment._id, {
        tierAtAssignment: assigned.question.tier === "EASY" ? "HARD" : "EASY",
      });
    });
    const closed = await lockAnswerAs(backend, guest, true);
    expect(closed.phase).toBe("ANSWER");
    expect(await hostAdvance(backend, host)).toBe("QUESTION_REVEAL");

    const stage = await stageViewOf(backend, host);
    expect(stage.revealGroups).toHaveLength(1);
    expect(stage.revealGroups[0]).toMatchObject({
      questionId: assigned.question._id,
      systemVoid: true,
      correctIndex: null,
    });
  });

  test("re-audits source integrity at settlement and restores a dispute token", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend, { joinerNames: ["Bea"] });
    const guest = guests[0]!;
    const gameId = host.gameId;

    await advanceToPhase(backend, host, "ANSWER");
    const assigned = await readAssignmentQuestion(backend, host);
    await lockAnswerAs(backend, host, true);
    await lockAnswerAs(backend, guest, true);
    await advanceToPhase(backend, host, "QUESTION_REVEAL");
    const opened = await initiateDisputeAs(backend, guest, assigned.question._id);
    expect(opened.kind).toBe("OPENED");
    expect(await getParticipant(backend, gameId, playerIdOf(guest))).toMatchObject({
      disputeAvailable: false,
    });

    await backend.run(async (ctx) => {
      const source = await ctx.db
        .query("quizSlopQuestionSources")
        .withIndex("by_questionId", (index) => index.eq("questionId", assigned.question._id))
        .first();
      if (!source) throw new Error("Expected an assigned question source");
      await ctx.db.patch("quizSlopQuestionSources", source._id, { title: " " });
    });

    expect(await hostAdvance(backend, host)).toBe("DISPUTE_VOTE");
    expect(await hostAdvance(backend, host)).toBe("ROUND_RESULTS");
    const round = await getCurrentRound(backend, gameId);
    expect(round.systemVoidQuestionIds).toContain(assigned.question._id);
    expect(round.rulings).toContainEqual({
      questionId: assigned.question._id,
      ruling: "SYSTEM_VOID",
    });
    expect(await getParticipant(backend, gameId, playerIdOf(guest))).toMatchObject({
      disputeAvailable: true,
    });
  });

  test("resolves the house vote by plurality and finalizes the double-point finale", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend);
    const [guestB, guestC] = [guests[0]!, guests[1]!];
    const gameId = host.gameId;

    await playStandardRound(backend, host, [host, guestB, guestC]);
    await playStandardRound(backend, host, [host, guestB, guestC]);
    await playStandardRound(backend, host, [host, guestB, guestC], {
      correct: (session) => session.playerId !== guestB.playerId,
    });
    await playStandardRound(backend, host, [host, guestB, guestC], {
      correct: (session) => session.playerId === host.playerId,
    });

    const votePhase = await hostAdvance(backend, host);
    expect(votePhase).toBe("HOUSE_VOTE");
    const game = await getGame(backend, gameId);
    expect(game.currentRound).toBe(5);
    const finaleRound = await getCurrentRound(backend, gameId);
    expect(finaleRound.kind).toBe("HOUSE_CHOICE");
    const finalists = finaleRound.finalistTopicIds ?? [];
    expect(finalists).toHaveLength(3);

    const warmUpRound = await getRoundByOrdinal(backend, gameId, 0);
    await expect(castHouseVoteAs(backend, host, warmUpRound.topicId!)).rejects.toThrow(
      "not on the final slate",
    );

    await castHouseVoteAs(backend, host, finalists[0]!);
    await castHouseVoteAs(backend, guestB, finalists[0]!);
    const lastVote = await castHouseVoteAs(backend, guestC, finalists[1]!);
    expect(lastVote.phase).toBe("HOUSE_VOTE");
    expect(await hostAdvance(backend, host)).toBe("HOUSE_VOTE_REVEAL");
    const revealStage = await stageViewOf(backend, host);
    expect(revealStage.houseVote?.voteCounts).toEqual([
      { topicId: finalists[0], votes: 2 },
      { topicId: finalists[1], votes: 1 },
      { topicId: finalists[2], votes: 0 },
    ]);
    const resolvedRound = await getCurrentRound(backend, gameId);
    expect(resolvedRound.topicId).toBe(finalists[0]);

    await hostAdvance(backend, host);
    const finaleStage = await stageViewOf(backend, host);
    expect(finaleStage.phase).toBe("TOPIC_REVEAL");
    expect(finaleStage.pointValue).toBe(200);
    const winnerTopic = await backend.run(async (ctx) =>
      ctx.db.get("quizSlopTopics", finalists[0]!),
    );
    expect(finaleStage.currentTopic?.label).toBe(winnerTopic?.label);

    await advanceToPhase(backend, host, "ANSWER");
    await lockAnswerAs(backend, host, true);
    await lockAnswerAs(backend, guestB, true);
    await lockAnswerAs(backend, guestC, false);
    await advanceToPhase(backend, host, "ROUND_RESULTS");
    const finalPhase = await hostAdvance(backend, host);
    expect(finalPhase).toBe("FINAL_RESULTS");

    const finalGame = await getGame(backend, gameId);
    expect(finalGame.status).toBe("FINAL_RESULTS");
    expect(finalGame.finalizedAt).toEqual(expect.any(Number));
    expect(finalGame.phaseDeadline).toBeUndefined();
    expect((await getQuizslopState(backend, gameId)).outcome).toBe("COMPLETED");

    const finalStage = await stageViewOf(backend, host);
    expect(
      finalStage.final?.standings.map((entry) => ({
        name: entry.name,
        total: entry.total,
        quizSubtotal: entry.quizSubtotal,
        winner: entry.winner,
      })),
    ).toEqual([
      { name: "Hana", total: 600, quizSubtotal: 600, winner: true },
      { name: "Bea", total: 400, quizSubtotal: 400, winner: false },
      { name: "Cody", total: 300, quizSubtotal: 300, winner: false },
    ]);
    expect(finalStage.final?.awards).toEqual([
      { kind: "SUSPICIOUSLY_WELL_READ", recipients: ["Hana"], stat: "5 correct answers" },
    ]);
    // Hidden difficulty stays absent from the final results surface too.
    for (const token of HIDDEN_TIER_TOKENS) {
      expect(viewContains(finalStage, token)).toBe(false);
    }
    expectLedgerConsistent(await readLedger(backend, gameId));

    // After finalization every gameplay mutation is a stale no-op or rejects.
    await expect(
      backend.mutation(api.quizslop.lockAnswer, {
        capability: host.capability,
        selectedIndex: 0,
        expectedPhaseGeneration: finalGame.phaseGeneration,
      }),
    ).rejects.toThrow("has ended");
    await expect(hostAdvance(backend, host)).rejects.toThrow("has ended");
    await expect(
      enforceStaleDeadline(backend, gameId, {
        deadline: finalGame.updatedAt,
        phaseGeneration: finalGame.phaseGeneration,
      }),
    ).resolves.toEqual({ advanced: false });
    expect((await getGame(backend, gameId)).finalizedAt).toBe(finalGame.finalizedAt);

    // Finalization schedules no winner-tagline or leaderboard generation work.
    const jobs = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) => index.eq("gameId", gameId))
        .take(8),
    );
    expect(jobs).toEqual([]);
  });

  test("resolves a zero-vote house tie by the frozen tie-break rank", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend, { joinerNames: ["Bea"] });
    const guestB = guests[0]!;
    const gameId = host.gameId;

    await playStandardRound(backend, host, [host, guestB]);
    await playStandardRound(backend, host, [host, guestB]);
    await playStandardRound(backend, host, [host, guestB]);
    expect(await hostAdvance(backend, host)).toBe("HOUSE_VOTE");

    // Nobody votes: every missing vote abstains and the frozen rank decides.
    expect(await hostAdvance(backend, host)).toBe("HOUSE_VOTE_REVEAL");
    const round = await getCurrentRound(backend, gameId);
    const finalistDocs = await backend.run(async (ctx) => {
      const docs = [];
      for (const topicId of round.finalistTopicIds ?? []) {
        const doc = await ctx.db.get("quizSlopTopics", topicId);
        if (doc) docs.push(doc);
      }
      return docs;
    });
    expect(finalistDocs).toHaveLength(3);
    const expected = finalistDocs.toSorted(
      (left, right) =>
        (left.tieBreakRank ?? 0) - (right.tieBreakRank ?? 0) || left._id.localeCompare(right._id),
    )[0]!;
    expect(round.topicId).toBe(expected._id);
    const stage = await stageViewOf(backend, host);
    expect(stage.houseVote?.voteCounts?.every((entry) => entry.votes === 0)).toBe(true);
  });
});

describe("QuizSlop continuity and abandonment", () => {
  test("runs continuity grace, resumes on reconnect, then abandons without a winner", async () => {
    const backend = createTestBackend();
    const { host, guests, presence } = await createReadyGame(backend);
    const [guestB, guestC] = [guests[0]!, guests[1]!];
    const gameId = host.gameId;

    await playStandardRound(backend, host, [host, guestB, guestC]);
    await presence.disconnect(guestB);
    await presence.disconnect(guestC);

    // Closing results with <2 boundary-active players opens the grace window.
    expect(await hostAdvance(backend, host)).toBe("CONTINUITY_GRACE");
    const graceGame = await getGame(backend, gameId);
    // The grace deadline persists even though gameplay timers are disabled.
    expect(graceGame.timersDisabled).toBe(true);
    expect(graceGame.phaseDeadline).toBe(Date.now() + 15_000);
    expect(graceGame.status).toBe("ROUND_RESULTS");

    // A reconnect before the recheck resumes the game.
    await presence.heartbeat(guestB);
    await expect(
      enforceCurrentDeadline(backend, gameId, (timestamp) => vi.setSystemTime(timestamp)),
    ).resolves.toEqual({ advanced: true });
    expect((await getQuizslopState(backend, gameId)).phase).toBe("TOPIC_REVEAL");
    expect((await getGame(backend, gameId)).currentRound).toBe(2);

    await playStandardRound(backend, host, [host, guestB]);
    await presence.disconnect(guestB);
    expect(await hostAdvance(backend, host)).toBe("CONTINUITY_GRACE");
    const secondGrace = await getGame(backend, gameId);
    const graceTuple = {
      deadline: secondGrace.phaseDeadline!,
      phaseGeneration: secondGrace.phaseGeneration,
    };
    await expect(
      enforceCurrentDeadline(backend, gameId, (timestamp) => vi.setSystemTime(timestamp)),
    ).resolves.toEqual({ advanced: true });

    const state = await getQuizslopState(backend, gameId);
    expect(state.phase).toBe("ABANDONED");
    expect(state.outcome).toBe("ABANDONED");
    const abandonedGame = await getGame(backend, gameId);
    expect(abandonedGame.status).toBe("FINAL_RESULTS");
    expect(abandonedGame.finalizedAt).toEqual(expect.any(Number));
    expect(abandonedGame.phaseDeadline).toBeUndefined();

    // An abandoned game declares no winner on any results surface.
    const stage = await stageViewOf(backend, host);
    expect(stage.phase).toBe("ABANDONED");
    expect(stage.voiceLine).toBeNull();
    expect(stage.final?.standings.length).toBeGreaterThan(0);
    expect(stage.final?.standings.every((entry) => entry.winner === false)).toBe(true);

    // Abandonment happens exactly once; replays and gameplay are stale no-ops.
    await expect(enforceStaleDeadline(backend, gameId, graceTuple)).resolves.toEqual({
      advanced: false,
    });
    await expect(hostAdvance(backend, host)).rejects.toThrow("has ended");
    await expect(
      backend.mutation(api.quizslop.lockAnswer, {
        capability: host.capability,
        selectedIndex: 0,
        expectedPhaseGeneration: abandonedGame.phaseGeneration,
      }),
    ).rejects.toThrow("has ended");
    expect((await getGame(backend, gameId)).finalizedAt).toBe(abandonedGame.finalizedAt);
  });
});
