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
  controllerViewOf,
  createPresenceController,
  createQuizslopRoom,
  getAssignments,
  getParticipants,
  hostAdvance,
  playerIdOf,
  stageViewOf,
  startQuizslop,
  submitProxyAs,
  submitScratchAs,
  viewContains,
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

async function readyGame() {
  const testBackend = backend();
  const room = await createQuizslopRoom(testBackend, { joinerNames: ["Bea", "Cody"] });
  const presence = createPresenceController(testBackend);
  await presence.heartbeatAll(room.players);
  await startQuizslop(testBackend, room.host);
  return { testBackend, room };
}

function expectNoHiddenTier(view: unknown): void {
  for (const token of HIDDEN_TIER_TOKENS) expect(viewContains(view, token)).toBe(false);
}

describe("QuizSlop v2 view redaction", () => {
  test("lobby exposes safe content readiness and blocks start below the minimum", async () => {
    const testBackend = backend();
    const room = await createQuizslopRoom(testBackend, { joinerNames: ["Bea"] });
    const presence = createPresenceController(testBackend);
    await presence.heartbeatAll(room.players);
    const [stage, controller] = await Promise.all([
      stageViewOf(testBackend, room.host),
      controllerViewOf(testBackend, room.host),
    ]);
    expect(stage.content).toEqual({
      source: "CATALOG",
      packStatus: "CATALOG_READY",
      generatorModelName: null,
    });
    expect(stage.lobby).toEqual({ canStart: false });
    expect(controller.content).toEqual(stage.content);
  });

  test("role is self-only at first SECTION_INTRO and hidden tiers never ship", async () => {
    const { testBackend, room } = await readyGame();
    const participants = await getParticipants(testBackend, room.host.gameId);
    const stage = await stageViewOf(testBackend, room.host);
    expect(stage.roster.every((entry) => !("role" in entry))).toBe(true);
    expect(viewContains(stage, "SABOTEUR")).toBe(false);
    for (const session of room.players) {
      const view = await controllerViewOf(testBackend, session);
      const own = participants.find((entry) => entry.playerId === playerIdOf(session));
      expect(view.me.role).toBe(own?.role);
      expect(view.roster.every((entry) => !("role" in entry))).toBe(true);
      expectNoHiddenTier(view);
    }
    expectNoHiddenTier(stage);
  });

  test("orders public assignments by frozen candidate seat", async () => {
    const { testBackend, room } = await readyGame();
    const [participants, stage] = await Promise.all([
      getParticipants(testBackend, room.host.gameId),
      stageViewOf(testBackend, room.host),
    ]);
    expect(stage.pairings.map((pairing) => pairing.candidate.playerId)).toEqual(
      participants.map((participant) => participant.playerId),
    );
  });

  test("reports the real aggregate ballot count after Proctor Review", async () => {
    const { testBackend, room } = await readyGame();
    const participants = await getParticipants(testBackend, room.host.gameId);
    await testBackend.run(async (ctx) => {
      const state = await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .unique();
      if (!state || participants.length < 3) throw new Error("Missing review fixture state");
      await ctx.db.patch("quizSlopState", state._id, {
        phase: "PROCTOR_REVIEW_RESULT",
        suspendedPlayerId: participants[1]!.playerId,
      });
      for (const participant of participants.slice(0, 2)) {
        await ctx.db.insert("quizSlopSuspensionVotes", {
          gameId: room.host.gameId,
          playerId: participant.playerId,
          targetPlayerId: participants[1]!.playerId,
          castAt: Date.now(),
        });
      }
    });

    expect((await stageViewOf(testBackend, room.host)).reviewResult).toMatchObject({
      votesCast: 2,
      votersTotal: 3,
      suspendedPlayer: { playerId: participants[1]!.playerId },
    });
  });

  test("SCRATCH gives each candidate only their own unique question", async () => {
    const { testBackend, room } = await readyGame();
    await hostAdvance(testBackend, room.host);
    const stage = await stageViewOf(testBackend, room.host);
    expect(stage.phase).toBe("SCRATCH");
    expect(stage.receipts).toEqual([]);
    expect(viewContains(stage, "correctIndex")).toBe(false);
    const prompts: string[] = [];
    for (const player of room.players) {
      const view = await controllerViewOf(testBackend, player);
      expect(view.candidateAssignment).not.toBeNull();
      expect(view.proxyAssignment).toBeNull();
      prompts.push(view.candidateAssignment?.displayPrompt ?? "");
    }
    expect(new Set(prompts).size).toBe(3);
  });

  test("PROXY_ANSWER exposes the target question but never the Candidate scratch selection", async () => {
    const { testBackend, room } = await readyGame();
    await hostAdvance(testBackend, room.host);
    for (const player of room.players) await submitScratchAs(testBackend, player, true);
    await hostAdvance(testBackend, room.host);
    const assignments = await getAssignments(testBackend, room.host.gameId);
    for (const player of room.players) {
      const view = await controllerViewOf(testBackend, player);
      const proxy = assignments.find(
        (assignment) => assignment.proxyPlayerId === playerIdOf(player),
      );
      expect(view.proxyAssignment?.assignmentId).toBe(proxy?._id);
      expect(view.proxyAssignment?.selectedIndex).toBeNull();
      expect(view.candidateAssignment?.locked).toBe(true);
      expect(view.candidateAssignment?.selectedIndex).not.toBeNull();
      expect(view.receipts).toEqual([]);
      expect(viewContains(view, "scratchSelectedIndex")).toBe(false);
    }
    const stage = await stageViewOf(testBackend, room.host);
    expect(stage.pairings).toHaveLength(3);
    expect(stage.receipts).toEqual([]);
    expect(viewContains(stage, "scratchSelectedIndex")).toBe(false);
  });

  test("a connected player outside the frozen roster receives no private group ballot", async () => {
    const testBackend = backend();
    const room = await createQuizslopRoom(testBackend, {
      joinerNames: ["Bea", "Cody", "Dina"],
    });
    const frozen = room.players.slice(0, 3);
    const latePlayer = room.players[3]!;
    const presence = createPresenceController(testBackend);
    await presence.heartbeatAll(frozen);
    await startQuizslop(testBackend, room.host);
    await presence.heartbeat(latePlayer);
    await hostAdvance(testBackend, room.host);
    for (const player of frozen) await submitScratchAs(testBackend, player, true);
    await hostAdvance(testBackend, room.host);
    const assignment = (await getAssignments(testBackend, room.host.gameId))[0];
    if (!assignment) throw new Error("Missing assignment");
    await testBackend.run(async (ctx) => {
      const state = await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .unique();
      if (!state) throw new Error("Missing state");
      await ctx.db.patch("quizSlopAssignments", assignment._id, {
        answerAuthority: "GROUP",
      });
      await ctx.db.patch("quizSlopState", state._id, {
        suspendedPlayerId: assignment.proxyPlayerId,
        suspensionAppliedSection: state.deckPosition,
      });
    });

    const view = await controllerViewOf(testBackend, latePlayer);
    expect(view.me.role).toBeNull();
    expect(view.candidateAssignment).toBeNull();
    expect(view.proxyAssignment).toBeNull();
    expect(view.groupVoteAssignment).toBeNull();
  });

  test("ORAL_DEFENSE publishes receipts but keeps sabotage accounting sealed", async () => {
    const { testBackend, room } = await readyGame();
    const participants = await getParticipants(testBackend, room.host.gameId);
    const saboteur = participants.find((participant) => participant.role === "SABOTEUR");
    if (!saboteur) throw new Error("Missing saboteur");
    await hostAdvance(testBackend, room.host);
    for (const player of room.players) await submitScratchAs(testBackend, player, true);
    await hostAdvance(testBackend, room.host);
    for (const player of room.players) {
      await submitProxyAs(testBackend, player, playerIdOf(player) !== saboteur.playerId);
    }
    await hostAdvance(testBackend, room.host);
    const [stage, saboteurController] = await Promise.all([
      stageViewOf(testBackend, room.host),
      controllerViewOf(
        testBackend,
        room.players.find((player) => playerIdOf(player) === saboteur.playerId)!,
      ),
    ]);
    expect(stage.receipts).toHaveLength(3);
    expect(stage.receipts.every((receipt) => Number.isInteger(receipt.correctIndex))).toBe(true);
    expect(stage.teamScore).toMatchObject({
      rawCorrect: 2,
      attempted: 3,
      integrityAdjustmentSealed: true,
    });
    expect(stage.final).toBeNull();
    expect(viewContains(stage, "sabotagePoints")).toBe(false);
    expect(viewContains(saboteurController, "sabotagePoints")).toBe(false);
    expect(saboteurController.me.role).toBe("SABOTEUR");
  });

  test("never exposes retained source excerpts or neutral/key audit fields", async () => {
    const { testBackend, room } = await readyGame();
    const serverOnly = await testBackend.run(async (ctx) => {
      const questions = await ctx.db
        .query("quizSlopQuestions")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .take(64);
      const sources = await ctx.db
        .query("quizSlopQuestionSources")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .take(128);
      return [
        ...questions.flatMap((question) => [question.neutralQuestion, question.canonicalFact]),
        ...sources.map((source) => source.supportExcerpt),
      ];
    });
    const views = await Promise.all([
      stageViewOf(testBackend, room.host),
      ...room.players.map((player) => controllerViewOf(testBackend, player)),
    ]);
    for (const view of views) {
      for (const secret of serverOnly) expect(viewContains(view, secret)).toBe(false);
    }
  });

  test("generic prompt-mode views reject QuizSlop capabilities", async () => {
    const testBackend = backend();
    const room = await createQuizslopRoom(testBackend);
    await expect(
      testBackend.query(api.gameViews.stage, { capability: room.host.capability }),
    ).rejects.toThrow("mode-specific stage and controller views");
  });
});
