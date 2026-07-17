/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  HIDDEN_TIER_TOKENS,
  QUIZSLOP_HOST_SECRET,
  advanceToPhase,
  chooseDistinctTopics,
  controllerViewOf,
  createPresenceController,
  createQuizslopRoom,
  getCurrentRound,
  hostAdvance,
  lockAnswerAs,
  playStandardRound,
  readAssignmentQuestion,
  stageViewOf,
  startQuizslop,
  viewContains,
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

type PackContents = {
  questions: Doc<"quizSlopQuestions">[];
  excerpts: string[];
};

/** Every frozen question and retained excerpt for one round's topic. */
async function readRoundPack(backend: Backend, gameId: Id<"games">): Promise<PackContents> {
  const round = await getCurrentRound(backend, gameId);
  if (!round.topicId) throw new Error("Round has no topic");
  const topicId = round.topicId;
  return backend.run(async (ctx) => {
    const questions = await ctx.db
      .query("quizSlopQuestions")
      .withIndex("by_topicId_and_tier", (index) => index.eq("topicId", topicId))
      .take(5);
    const excerpts: string[] = [];
    for (const question of questions) {
      const sources = await ctx.db
        .query("quizSlopQuestionSources")
        .withIndex("by_questionId", (index) => index.eq("questionId", question._id))
        .take(4);
      for (const source of sources) excerpts.push(source.supportExcerpt);
    }
    return { questions, excerpts };
  });
}

function expectNoTierTokens(view: unknown): void {
  for (const token of HIDDEN_TIER_TOKENS) {
    expect(viewContains(view, token)).toBe(false);
  }
}

function expectNoServerOnlyContent(view: unknown, pack: PackContents): void {
  for (const question of pack.questions) {
    expect(viewContains(view, question.canonicalFact)).toBe(false);
    expect(viewContains(view, question.neutralQuestion)).toBe(false);
  }
  for (const excerpt of pack.excerpts) {
    expect(viewContains(view, excerpt)).toBe(false);
  }
}

describe("QuizSlop view redaction", () => {
  test("rejects QuizSlop capabilities from every generic prompt-mode view", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea"] });

    await expect(
      backend.query(api.gameViews.lobby, { capability: room.host.capability }),
    ).rejects.toThrow("mode-specific stage and controller views");
    await expect(
      backend.query(api.gameViews.stage, { capability: room.host.capability }),
    ).rejects.toThrow("mode-specific stage and controller views");
    await expect(
      backend.query(api.gameViews.controller, { capability: room.host.capability }),
    ).rejects.toThrow("mode-specific stage and controller views");
  });

  test("derives connected status from live Presence instead of durable lease rows", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea"] });
    const guest = room.guests[0]!;

    await backend.run(async (ctx) => {
      await ctx.db.insert("roomPresenceSessions", {
        gameId: room.host.gameId,
        roomSessionId: guest.sessionId,
        tabSessionId: "00000000-0000-4000-8000-000000000099",
        sessionToken: "stale-component-session",
        lastHeartbeatAt: Date.now(),
      });
    });

    const stage = await stageViewOf(backend, room.host);
    expect(
      stage.lobby?.statuses.find((status) => status.playerId === guest.playerId),
    ).toMatchObject({
      connected: false,
    });
  });

  test("redacts questions, keys, and tiers before reveal and shares sources safely after", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea", "Cody"] });
    const presence = createPresenceController(backend);
    const [guestB, guestC] = [room.guests[0]!, room.guests[1]!];
    await chooseDistinctTopics(backend, room.players);
    await presence.heartbeatAll(room.players);
    await startQuizslop(backend, room.host);
    const gameId = room.host.gameId;

    // Warm-up ANSWER: everyone holds by default and shares the EASY question.
    await advanceToPhase(backend, room.host, "ANSWER");
    const pack = await readRoundPack(backend, gameId);
    const assigned = await readAssignmentQuestion(backend, room.host);
    const unassignedPrompts = pack.questions
      .filter((question) => question._id !== assigned.question._id)
      .map((question) => question.displayPrompt);

    const stage = await stageViewOf(backend, room.host);
    expect(stage.phase).toBe("ANSWER");
    // The stage shows progress only: no prompt, choices, key, or explanation.
    for (const key of ["displayPrompt", "choices", "correctIndex", "explanation"]) {
      expect(viewContains(stage, key)).toBe(false);
    }
    for (const question of pack.questions) {
      expect(viewContains(stage, question.displayPrompt)).toBe(false);
      expect(viewContains(stage, question.explanation)).toBe(false);
    }
    expectNoServerOnlyContent(stage, pack);
    expectNoTierTokens(stage);

    // A controller sees only its own frozen prompt and choices, never the key.
    const controller = await controllerViewOf(backend, room.host);
    expect(controller.answer).toMatchObject({ assigned: true, locked: false });
    expect(controller.answer?.displayPrompt).toBe(assigned.question.displayPrompt);
    expect(controller.answer?.choices).toEqual([...assigned.question.choices]);
    expect(viewContains(controller, "correctIndex")).toBe(false);
    expect(viewContains(controller, "explanation")).toBe(false);
    for (const prompt of unassignedPrompts) {
      expect(viewContains(controller, prompt)).toBe(false);
    }
    expectNoServerOnlyContent(controller, pack);
    expectNoTierTokens(controller);

    // Reveal the group, then check the source-link asymmetry.
    await lockAnswerAs(backend, room.host, true);
    await lockAnswerAs(backend, guestB, false);
    const lastLock = await lockAnswerAs(backend, guestC, false);
    expect(lastLock.phase).toBe("QUESTION_REVEAL");

    const revealStage = await stageViewOf(backend, room.host);
    expect(revealStage.revealGroups).toHaveLength(1);
    const stageGroup = revealStage.revealGroups[0]!;
    expect(stageGroup.displayPrompt).toBe(assigned.question.displayPrompt);
    expect(stageGroup.correctIndex).toBe(assigned.question.correctIndex);
    expect(stageGroup.sources.length).toBeGreaterThan(0);
    // Stage receives source labels only; controllers receive the real links.
    expect(stageGroup.sources.every((source) => source.url === null)).toBe(true);
    const revealController = await controllerViewOf(backend, guestB);
    const controllerGroup = revealController.revealGroups[0]!;
    expect(controllerGroup.sources.length).toBeGreaterThan(0);
    expect(
      controllerGroup.sources.every(
        (source) => typeof source.url === "string" && source.url.startsWith("https://"),
      ),
    ).toBe(true);
    // Retained support excerpts never reach any client, even after reveal.
    expectNoServerOnlyContent(revealStage, pack);
    expectNoServerOnlyContent(revealController, pack);
    expectNoTierTokens(revealStage);
    expectNoTierTokens(revealController);
  });

  test("keeps differently-tiered questions private to their own controllers", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea", "Cody"] });
    const presence = createPresenceController(backend);
    const [guestB, guestC] = [room.guests[0]!, room.guests[1]!];
    await chooseDistinctTopics(backend, room.players);
    await presence.heartbeatAll(room.players);
    await startQuizslop(backend, room.host);
    const hostId = room.host.playerId;

    // Round 1 splits the hidden ladder: host climbs to MEDIUM, B and C stay EASY.
    await playStandardRound(backend, room.host, room.players, {
      correct: (session) => session.playerId === hostId,
    });
    await hostAdvance(backend, room.host);
    await advanceToPhase(backend, room.host, "ANSWER");

    const hostAssigned = await readAssignmentQuestion(backend, room.host);
    const guestAssigned = await readAssignmentQuestion(backend, guestB);
    expect(hostAssigned.question.tier).toBe("MEDIUM");
    expect(guestAssigned.question.tier).toBe("EASY");
    expect(hostAssigned.question._id).not.toBe(guestAssigned.question._id);

    const hostController = await controllerViewOf(backend, room.host);
    const guestController = await controllerViewOf(backend, guestB);
    expect(hostController.answer?.displayPrompt).toBe(hostAssigned.question.displayPrompt);
    expect(guestController.answer?.displayPrompt).toBe(guestAssigned.question.displayPrompt);
    // One controller can never read another player's assigned question.
    expect(viewContains(hostController, guestAssigned.question.displayPrompt)).toBe(false);
    expect(viewContains(guestController, hostAssigned.question.displayPrompt)).toBe(false);
    const stage = await stageViewOf(backend, room.host);
    expect(viewContains(stage, hostAssigned.question.displayPrompt)).toBe(false);
    expect(viewContains(stage, guestAssigned.question.displayPrompt)).toBe(false);
    // Different questions per hidden tier never leak the tier itself.
    expectNoTierTokens(hostController);
    expectNoTierTokens(guestController);
    expectNoTierTokens(stage);
    const thirdController = await controllerViewOf(backend, guestC);
    expect(thirdController.answer?.displayPrompt).toBe(guestAssigned.question.displayPrompt);
  });

  test("keeps the finalist slate server-only until the house vote opens", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea"] });
    const presence = createPresenceController(backend);
    const guestB = room.guests[0]!;
    await chooseDistinctTopics(backend, room.players);
    await presence.heartbeatAll(room.players);
    await startQuizslop(backend, room.host);
    const gameId = room.host.gameId;

    await playStandardRound(backend, room.host, room.players);
    await playStandardRound(backend, room.host, room.players);
    await playStandardRound(backend, room.host, room.players);

    // Last home-turf ROUND_RESULTS: the finale slate must still be server-only.
    const finalists = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(20)
        .then((topics) => topics.filter((topic) => topic.deckRole === "FINALIST")),
    );
    expect(finalists).toHaveLength(3);
    const stageBefore = await stageViewOf(backend, room.host);
    expect(stageBefore.phase).toBe("ROUND_RESULTS");
    const controllerBefore = await controllerViewOf(backend, guestB);
    for (const finalist of finalists) {
      expect(viewContains(stageBefore, finalist.label)).toBe(false);
      expect(viewContains(stageBefore, finalist.scope)).toBe(false);
      expect(viewContains(controllerBefore, finalist.label)).toBe(false);
      expect(viewContains(controllerBefore, finalist.scope)).toBe(false);
    }

    // Opening the vote reveals the pre-frozen slate of three topics.
    expect(await hostAdvance(backend, room.host)).toBe("HOUSE_VOTE");
    const stageAfter = await stageViewOf(backend, room.host);
    expect(stageAfter.slate).toHaveLength(3);
    for (const finalist of finalists) {
      expect(viewContains(stageAfter, finalist.label)).toBe(true);
    }
    const controllerAfter = await controllerViewOf(backend, guestB);
    expect(controllerAfter.houseVote).toMatchObject({ eligible: true, myVoteTopicId: null });
    expect(controllerAfter.slate).toHaveLength(3);
  });
});
