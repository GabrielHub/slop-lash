/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";
import { materializeCatalogTopic } from "./quizslopMaterialization";
import { QUIZSLOP_TOPIC_CATALOG } from "../src/games/quizslop/config/topic-catalog";
import {
  QUIZSLOP_HOST_SECRET,
  createPresenceController,
  createQuizslopRoom,
  enforceCurrentDeadline,
  enforceStaleDeadline,
  getAssignments,
  getGame,
  getParticipant,
  getParticipants,
  getQuizslopState,
  hostAdvance,
  playerIdOf,
  startQuizslop,
  submitDefenseAs,
  submitProxyAs,
  submitScratchAs,
} from "./quizslopTestKit";

const modules = import.meta.glob("./**/*.ts");
function backend() {
  const value = convexTest(schema, modules);
  presenceTest.register(value);
  return value;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T20:00:00.000Z"));
  vi.stubEnv("HOST_SECRET", QUIZSLOP_HOST_SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function readyGame(timersDisabled = true) {
  const testBackend = backend();
  const room = await createQuizslopRoom(testBackend, {
    joinerNames: ["Bea", "Cody"],
    timersDisabled,
  });
  const presence = createPresenceController(testBackend);
  await presence.heartbeatAll(room.players);
  return { testBackend, room, presence };
}

describe("QuizSlop v2 start and section engine", () => {
  test("fails closed below three connected candidates", async () => {
    const testBackend = backend();
    const room = await createQuizslopRoom(testBackend, { joinerNames: ["Bea"] });
    const presence = createPresenceController(testBackend);
    await presence.heartbeatAll(room.players);
    await expect(startQuizslop(testBackend, room.host)).rejects.toThrow(
      "QuizSlop needs 3-8 connected players",
    );
  });

  test("freezes a six-section roster with exactly one hidden Saboteur", async () => {
    const { testBackend, room } = await readyGame();
    await expect(startQuizslop(testBackend, room.host)).resolves.toEqual({
      started: true,
      totalRounds: 6,
    });
    const [state, game, participants, assignments] = await Promise.all([
      getQuizslopState(testBackend, room.host.gameId),
      getGame(testBackend, room.host.gameId),
      getParticipants(testBackend, room.host.gameId),
      getAssignments(testBackend, room.host.gameId),
    ]);
    expect(state).toMatchObject({
      phase: "SECTION_INTRO",
      sectionCount: 6,
      reviewAfterSection: 3,
      rawCorrect: 0,
      attempted: 0,
      sabotagePoints: 0,
    });
    expect(game).toMatchObject({ currentRound: 1, totalRounds: 6, playerCount: 3 });
    expect(participants.filter((participant) => participant.role === "SABOTEUR")).toHaveLength(1);
    expect(assignments).toHaveLength(3);
    expect(new Set(assignments.map((assignment) => assignment.topicId)).size).toBe(3);
    expect(new Set(assignments.map((assignment) => assignment.questionId)).size).toBe(3);
    expect(
      assignments.every((assignment) => assignment.candidatePlayerId !== assignment.proxyPlayerId),
    ).toBe(true);
  });

  test("scratch correctness drives hidden tier while proxy correctness drives the team score", async () => {
    const { testBackend, room } = await readyGame();
    await startQuizslop(testBackend, room.host);
    await hostAdvance(testBackend, room.host);
    for (const player of room.players) await submitScratchAs(testBackend, player, true);
    // Tutorial Mode stays host-paced even after every scratch sheet is locked.
    expect((await getQuizslopState(testBackend, room.host.gameId)).phase).toBe("SCRATCH");
    await hostAdvance(testBackend, room.host);
    for (const player of room.players) await submitProxyAs(testBackend, player, true);
    await hostAdvance(testBackend, room.host);

    const state = await getQuizslopState(testBackend, room.host.gameId);
    expect(state).toMatchObject({ phase: "SECTION_RESULTS", rawCorrect: 3, attempted: 3 });
    for (const player of room.players) {
      const participant = await getParticipant(testBackend, room.host.gameId, playerIdOf(player));
      expect(participant.hiddenTier).toBe("HARD");
    }
  });

  test("a Saboteur wrong proxy answer earns the override bonus without changing scratch adaptation", async () => {
    const { testBackend, room } = await readyGame();
    await startQuizslop(testBackend, room.host);
    const saboteur = (await getParticipants(testBackend, room.host.gameId)).find(
      (participant) => participant.role === "SABOTEUR",
    );
    if (!saboteur) throw new Error("Missing saboteur");
    const saboteurSession = room.players.find(
      (session) => playerIdOf(session) === saboteur.playerId,
    );
    if (!saboteurSession) throw new Error("Missing saboteur session");
    await hostAdvance(testBackend, room.host);
    for (const player of room.players) await submitScratchAs(testBackend, player, true);
    await hostAdvance(testBackend, room.host);
    for (const player of room.players) {
      await submitProxyAs(testBackend, player, player !== saboteurSession);
    }
    await hostAdvance(testBackend, room.host);
    const [state, updated] = await Promise.all([
      getQuizslopState(testBackend, room.host.gameId),
      getParticipant(testBackend, room.host.gameId, saboteur.playerId),
    ]);
    expect(state).toMatchObject({ rawCorrect: 2, attempted: 3, sabotagePoints: 2 });
    expect(updated.hiddenTier).toBe("HARD");
  });

  test("a missing scratch answer is neutral for adaptive difficulty", async () => {
    const { testBackend, room } = await readyGame();
    await startQuizslop(testBackend, room.host);
    await hostAdvance(testBackend, room.host);
    await submitScratchAs(testBackend, room.players[0]!, true);
    await submitScratchAs(testBackend, room.players[1]!, false);
    const timedOut = room.players[2]!;
    await hostAdvance(testBackend, room.host);
    const participant = await getParticipant(testBackend, room.host.gameId, playerIdOf(timedOut));
    const assignment = (await getAssignments(testBackend, room.host.gameId)).find(
      (entry) => entry.candidatePlayerId === playerIdOf(timedOut),
    );
    expect(participant.hiddenTier).toBe("MEDIUM");
    expect(assignment?.scratchLockedAt).toEqual(expect.any(Number));
    expect(assignment?.scratchSelectedIndex).toBeUndefined();
    expect(assignment?.scratchCorrect).toBeUndefined();
  });

  test("guarded deadlines advance once and stale scheduled work becomes a no-op", async () => {
    const { testBackend, room } = await readyGame(false);
    await startQuizslop(testBackend, room.host);
    const before = await getGame(testBackend, room.host.gameId);
    if (before.phaseDeadline === undefined) throw new Error("Expected intro deadline");
    const stale = { deadline: before.phaseDeadline, phaseGeneration: before.phaseGeneration };
    expect(
      await enforceCurrentDeadline(testBackend, room.host.gameId, (timestamp) =>
        vi.setSystemTime(timestamp),
      ),
    ).toEqual({ advanced: true });
    expect((await getQuizslopState(testBackend, room.host.gameId)).phase).toBe("SCRATCH");
    expect(await enforceStaleDeadline(testBackend, room.host.gameId, stale)).toEqual({
      advanced: false,
    });
  });

  test("server deadlines keep scratch timeouts neutral and settle missing official answers once", async () => {
    const { testBackend, room } = await readyGame(false);
    await startQuizslop(testBackend, room.host);
    await enforceCurrentDeadline(testBackend, room.host.gameId, (timestamp) =>
      vi.setSystemTime(timestamp),
    );
    const participants = await getParticipants(testBackend, room.host.gameId);
    const saboteur = participants.find((participant) => participant.role === "SABOTEUR");
    if (!saboteur) throw new Error("Missing saboteur");
    const assignments = await getAssignments(testBackend, room.host.gameId);
    const sabotagedAssignment = assignments.find(
      (assignment) => assignment.proxyPlayerId === saboteur.playerId,
    );
    if (!sabotagedAssignment) throw new Error("Missing Saboteur proxy assignment");
    for (const player of room.players) {
      if (playerIdOf(player) !== sabotagedAssignment.candidatePlayerId) {
        await submitScratchAs(testBackend, player, true);
      }
    }
    await enforceCurrentDeadline(testBackend, room.host.gameId, (timestamp) =>
      vi.setSystemTime(timestamp),
    );
    const timedOutCandidate = await getParticipant(
      testBackend,
      room.host.gameId,
      sabotagedAssignment.candidatePlayerId,
    );
    expect(timedOutCandidate.hiddenTier).toBe("MEDIUM");

    for (const player of room.players) {
      if (playerIdOf(player) !== saboteur.playerId) {
        await submitProxyAs(testBackend, player, true);
      }
    }
    await enforceCurrentDeadline(testBackend, room.host.gameId, (timestamp) =>
      vi.setSystemTime(timestamp),
    );
    const state = await getQuizslopState(testBackend, room.host.gameId);
    expect(state).toMatchObject({
      phase: "ORAL_DEFENSE",
      rawCorrect: 2,
      attempted: 3,
      sabotagePoints: 1,
    });
  });

  test("rejects start while an AI pack is not playable", async () => {
    const { testBackend, room } = await readyGame();
    await testBackend.run(async (ctx) => {
      const state = await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .unique();
      if (!state) throw new Error("Missing state");
      await ctx.db.patch("quizSlopState", state._id, {
        contentSource: "AI",
        packStatus: "GENERATING",
      });
    });
    await expect(startQuizslop(testBackend, room.host)).rejects.toThrow(
      "question pack is not ready",
    );
  });

  test("fails closed when a frozen pack cannot provide a globally unique topic per assignment", async () => {
    const { testBackend, room } = await readyGame();
    await testBackend.run(async (ctx) => {
      for (const topic of QUIZSLOP_TOPIC_CATALOG.slice(0, 17)) {
        await materializeCatalogTopic(ctx, room.host.gameId, topic);
      }
    });
    await expect(startQuizslop(testBackend, room.host)).rejects.toThrow("needs 18 unique topics");
  });

  test("answer locks are idempotent while open and stale after a phase transition", async () => {
    const { testBackend, room } = await readyGame();
    await startQuizslop(testBackend, room.host);
    await hostAdvance(testBackend, room.host);
    const player = room.players[0]!;
    const assignment = (await getAssignments(testBackend, room.host.gameId)).find(
      (entry) => entry.candidatePlayerId === playerIdOf(player),
    );
    if (!assignment) throw new Error("Missing candidate assignment");
    const question = await testBackend.run(async (ctx) =>
      ctx.db.get("quizSlopQuestions", assignment.questionId),
    );
    if (!question) throw new Error("Missing question");
    const game = await getGame(testBackend, room.host.gameId);
    const args = {
      capability: player.capability,
      selectedIndex: question.correctIndex,
      expectedPhaseGeneration: game.phaseGeneration,
    };
    await expect(testBackend.mutation(api.quizslop.submitScratch, args)).resolves.toEqual({
      phase: "SCRATCH",
    });
    await expect(testBackend.mutation(api.quizslop.submitScratch, args)).resolves.toEqual({
      phase: "SCRATCH",
    });
    await expect(
      testBackend.mutation(api.quizslop.submitScratch, {
        ...args,
        selectedIndex: (question.correctIndex + 1) % 4,
      }),
    ).rejects.toThrow("already locked");

    await hostAdvance(testBackend, room.host);
    await expect(testBackend.mutation(api.quizslop.submitScratch, args)).rejects.toThrow(
      "Game phase already advanced",
    );
    expect(
      (await getParticipant(testBackend, room.host.gameId, playerIdOf(player))).hiddenTier,
    ).toBe("HARD");
  });

  test("revalidates retained question evidence before answer-key settlement", async () => {
    const { testBackend, room } = await readyGame();
    await startQuizslop(testBackend, room.host);
    await hostAdvance(testBackend, room.host);
    const assignment = (await getAssignments(testBackend, room.host.gameId))[0];
    if (!assignment) throw new Error("Missing assignment");
    await testBackend.run(async (ctx) => {
      const sources = await ctx.db
        .query("quizSlopQuestionSources")
        .withIndex("by_questionId", (index) => index.eq("questionId", assignment.questionId))
        .collect();
      const primary = sources.find((source) => source.primary);
      if (!primary) throw new Error("Missing primary evidence");
      await ctx.db.patch("quizSlopQuestionSources", primary._id, { primary: false });
    });

    await expect(hostAdvance(testBackend, room.host)).rejects.toThrow(
      "frozen QuizSlop question failed its integrity check",
    );
  });

  test("a display-only host can pace the exam but cannot submit private answers", async () => {
    const testBackend = backend();
    const room = await createQuizslopRoom(testBackend, {
      displayOnlyHost: true,
      joinerNames: ["Bea", "Cody", "Dina"],
    });
    const presence = createPresenceController(testBackend);
    await presence.heartbeatAll(room.guests);
    await startQuizslop(testBackend, room.host);
    await hostAdvance(testBackend, room.host);
    const game = await getGame(testBackend, room.host.gameId);
    await expect(
      testBackend.mutation(api.quizslop.submitScratch, {
        capability: room.host.capability,
        selectedIndex: 0,
        expectedPhaseGeneration: game.phaseGeneration,
      }),
    ).rejects.toThrow("Invalid or expired room capability");
    await expect(hostAdvance(testBackend, room.host)).resolves.toBe("PROXY_ANSWER");
  });

  test("only the assigned Candidate or Proxy can file an oral defense", async () => {
    const { testBackend, room } = await readyGame();
    await startQuizslop(testBackend, room.host);
    await hostAdvance(testBackend, room.host);
    for (const player of room.players) await submitScratchAs(testBackend, player, true);
    await hostAdvance(testBackend, room.host);
    const wrongProxy = room.players[0]!;
    for (const player of room.players) {
      await submitProxyAs(testBackend, player, player !== wrongProxy);
    }
    await hostAdvance(testBackend, room.host);
    const wrongAssignment = (await getAssignments(testBackend, room.host.gameId)).find(
      (entry) => entry.proxyPlayerId === playerIdOf(wrongProxy),
    );
    if (!wrongAssignment) throw new Error("Missing wrong assignment");
    const unrelated = room.players.find(
      (player) =>
        playerIdOf(player) !== wrongAssignment.candidatePlayerId &&
        playerIdOf(player) !== wrongAssignment.proxyPlayerId,
    );
    const candidate = room.players.find(
      (player) => playerIdOf(player) === wrongAssignment.candidatePlayerId,
    );
    if (!unrelated || !candidate) throw new Error("Missing defense participants");
    const game = await getGame(testBackend, room.host.gameId);
    await expect(
      testBackend.mutation(api.quizslop.submitDefense, {
        capability: unrelated.capability,
        assignmentId: wrongAssignment._id,
        text: "I object to being assigned this objection.",
        expectedPhaseGeneration: game.phaseGeneration,
      }),
    ).rejects.toThrow("not assigned to this defense");

    await expect(submitDefenseAs(testBackend, candidate, wrongAssignment._id)).resolves.toEqual({
      phase: "ORAL_DEFENSE",
    });
    await expect(submitDefenseAs(testBackend, candidate, wrongAssignment._id)).resolves.toEqual({
      phase: "ORAL_DEFENSE",
    });
    await expect(
      testBackend.mutation(api.quizslop.submitDefense, {
        capability: candidate.capability,
        assignmentId: wrongAssignment._id,
        text: "I have revised my testimony after finding a better joke.",
        expectedPhaseGeneration: game.phaseGeneration,
      }),
    ).rejects.toThrow("already on the record");
  });

  test("generic prompt-mode start remains unavailable", async () => {
    const { testBackend, room } = await readyGame();
    await expect(
      testBackend.mutation(api.lobby.start, { capability: room.host.capability }),
    ).rejects.toThrow("QuizSlop games start from the QuizSlop lobby");
  });
});
