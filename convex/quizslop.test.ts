/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";
import { QUESTION_REVEAL_SECONDS_PER_GROUP } from "../src/games/quizslop/game-constants";
import {
  CATALOG_TOPIC_IDS,
  HIDDEN_TIER_TOKENS,
  QUIZSLOP_HOST_SECRET,
  advanceToPhase,
  castDisputeVoteAs,
  chooseDistinctTopics,
  chooseTopic,
  controllerViewOf,
  createPresenceController,
  createQuizslopRoom,
  enforceCurrentDeadline,
  enforceStaleDeadline,
  getGame,
  getCurrentRound,
  getParticipant,
  getParticipants,
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
  submitCallAs,
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

/** The ledger and subtotals are scoring authority; the mirror must agree. */
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

describe("QuizSlop room and mode guards", () => {
  test("rejects AI rosters, narrator configuration, and explicit round counts at creation", async () => {
    const backend = createTestBackend();
    await expect(
      backend.action(api.rooms.create, {
        aiModelIds: ["google/gemini-3.5-flash-lite"],
        gameType: "QUIZSLOP",
        hostName: "Hana",
        hostSecret: QUIZSLOP_HOST_SECRET,
      }),
    ).rejects.toThrow("QuizSlop does not support AI players");
    await expect(
      backend.action(api.rooms.create, {
        gameType: "QUIZSLOP",
        hostName: "Hana",
        hostSecret: QUIZSLOP_HOST_SECRET,
        ttsMode: "ON",
      }),
    ).rejects.toThrow("QuizSlop does not support a narrator");
    await expect(
      backend.action(api.rooms.create, {
        gameType: "QUIZSLOP",
        hostName: "Hana",
        hostSecret: QUIZSLOP_HOST_SECRET,
        ttsVoice: "Nova",
      }),
    ).rejects.toThrow("QuizSlop does not support a narrator");
    await expect(
      backend.action(api.rooms.create, {
        gameType: "QUIZSLOP",
        hostName: "Hana",
        hostSecret: QUIZSLOP_HOST_SECRET,
        totalRounds: 5,
      }),
    ).rejects.toThrow("QuizSlop derives its round count from the frozen roster");
  });

  test("creates display-only and playing hosts with the unset round sentinel and a LOBBY_SETUP state row", async () => {
    const backend = createTestBackend();
    const displayRoom = await createQuizslopRoom(backend, { displayOnlyHost: true });
    expect(displayRoom.host.playerId).toBeNull();
    const displayGame = await getGame(backend, displayRoom.host.gameId);
    expect(displayGame).toMatchObject({
      gameType: "QUIZSLOP",
      status: "LOBBY",
      totalRounds: 0,
      currentRound: 0,
      ttsMode: "OFF",
      ttsVoice: "RANDOM",
    });
    const displayState = await getQuizslopState(backend, displayRoom.host.gameId);
    expect(displayState).toMatchObject({
      phase: "LOBBY_SETUP",
      deckPosition: 0,
      outcome: "IN_PROGRESS",
      customTopicsEnabled: false,
    });
    // A display-only host is not a participant and cannot own a Home Topic.
    await expect(chooseTopic(backend, displayRoom.host, CATALOG_TOPIC_IDS[0]!)).rejects.toThrow(
      "Invalid or expired room capability",
    );

    const playingRoom = await createQuizslopRoom(backend, { hostName: "Hana" });
    expect(playingRoom.host.playerId).not.toBeNull();
    const playingGame = await getGame(backend, playingRoom.host.gameId);
    expect(playingGame).toMatchObject({ totalRounds: 0, playerCount: 1, status: "LOBBY" });
  });

  test("rejects generic lobby start, AI players, reactions, and the generic recap", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea"] });

    await expect(
      backend.mutation(api.lobby.start, { capability: room.host.capability }),
    ).rejects.toThrow("QuizSlop games start from the QuizSlop lobby");
    await expect(
      backend.mutation(api.lobby.addAiPlayer, {
        capability: room.host.capability,
        modelId: "google/gemini-3.5-flash-lite",
      }),
    ).rejects.toThrow("QuizSlop does not support AI players");

    const hostPlayerId = playerIdOf(room.host);
    const responseId = await backend.run(async (ctx) => {
      const roundId = await ctx.db.insert("rounds", {
        gameId: room.host.gameId,
        roundNumber: 1,
        openedAt: Date.now(),
      });
      const promptId = await ctx.db.insert("prompts", {
        gameId: room.host.gameId,
        roundId,
        ordinal: 0,
        text: "seed",
      });
      return ctx.db.insert("responses", {
        gameId: room.host.gameId,
        roundId,
        promptId,
        playerId: hostPlayerId,
        text: "seed",
        pointsEarned: 0,
        submittedAt: Date.now(),
      });
    });
    await expect(
      backend.mutation(api.reactions.toggle, {
        capability: room.host.capability,
        emoji: "fire",
        responseId,
      }),
    ).rejects.toThrow("Reactions are not available in QuizSlop");

    await expect(
      backend.query(api.recaps.getByRoomCode, { roomCode: room.host.roomCode }),
    ).resolves.toEqual({ kind: "UNSUPPORTED_MODE", gameType: "QUIZSLOP" });
  });
});

describe("QuizSlop topic setup and roster freeze", () => {
  test("kicking a lobby player deletes their pack and releases the catalog claim", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea"] });
    const kicked = room.guests[0]!;
    const topicId = CATALOG_TOPIC_IDS[0]!;

    await expect(chooseTopic(backend, kicked, topicId)).resolves.toMatchObject({
      kind: "CONFIRMED",
    });
    await backend.mutation(api.lobby.kickHuman, {
      capability: room.host.capability,
      targetPlayerId: playerIdOf(kicked),
    });

    const materializedRows = await backend.run(async (ctx) => {
      const topics = await ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .take(20);
      const questions = await ctx.db
        .query("quizSlopQuestions")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .take(50);
      const sources = await ctx.db
        .query("quizSlopQuestionSources")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .take(100);
      return { topics, questions, sources };
    });
    expect(materializedRows).toEqual({ topics: [], questions: [], sources: [] });

    const replacement = await backend.action(api.rooms.join, {
      name: "Cody",
      roomCode: room.host.roomCode,
    });
    await expect(chooseTopic(backend, replacement, topicId)).resolves.toMatchObject({
      kind: "CONFIRMED",
    });
  });

  test("claims catalog topics atomically and replaces a player's own re-choice", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea"] });
    const guest = room.guests[0]!;

    await expect(chooseTopic(backend, room.host, "cat-not-a-topic")).rejects.toThrow(
      "Unknown catalog topic",
    );
    const hostChoice = await chooseTopic(backend, room.host, CATALOG_TOPIC_IDS[0]!);
    expect(hostChoice.kind).toBe("CONFIRMED");

    // A topic already claimed by another active player cannot be confirmed.
    await expect(chooseTopic(backend, guest, CATALOG_TOPIC_IDS[0]!)).resolves.toEqual({
      kind: "TOPIC_TAKEN",
    });
    const guestPlayerId = playerIdOf(guest);
    const afterTaken = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId_and_ownerPlayerId", (index) =>
          index.eq("gameId", room.host.gameId).eq("ownerPlayerId", guestPlayerId),
        )
        .unique(),
    );
    expect(afterTaken).toBeNull();

    const first = await chooseTopic(backend, guest, CATALOG_TOPIC_IDS[1]!);
    expect(first.kind).toBe("CONFIRMED");
    // Re-choosing replaces the player's own topic and its materialized pack.
    const replaced = await chooseTopic(backend, guest, CATALOG_TOPIC_IDS[2]!);
    expect(replaced.kind).toBe("CONFIRMED");
    const persisted = await backend.run(async (ctx) => {
      const owned = await ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId_and_ownerPlayerId", (index) =>
          index.eq("gameId", room.host.gameId).eq("ownerPlayerId", guestPlayerId),
        )
        .unique();
      const questions = await ctx.db
        .query("quizSlopQuestions")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .take(64);
      const sources = await ctx.db
        .query("quizSlopQuestionSources")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .take(128);
      return { owned, questions, sources };
    });
    expect(persisted.owned).toMatchObject({
      catalogTopicId: CATALOG_TOPIC_IDS[2],
      setupState: "READY",
      sourceType: "CATALOG",
    });
    // Two players, one materialized four-question pack each.
    expect(persisted.questions).toHaveLength(8);
    expect(
      persisted.questions.every(
        (question) =>
          question.topicId === persisted.owned?._id ||
          question.provenance.catalogTopicId === CATALOG_TOPIC_IDS[0],
      ),
    ).toBe(true);
    expect(persisted.sources.length).toBeGreaterThan(0);

    // Re-confirming the same topic is idempotent.
    if (replaced.kind !== "CONFIRMED") throw new Error("expected confirmation");
    await expect(chooseTopic(backend, guest, CATALOG_TOPIC_IDS[2]!)).resolves.toEqual({
      kind: "CONFIRMED",
      topicId: replaced.topicId,
    });
  });

  test("refuses to start early, then freezes the roster, deck, and EASY participants", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, {
      joinerNames: ["Bea", "Cody"],
      timersDisabled: false,
    });
    const presence = createPresenceController(backend);
    const [guestB, guestC] = [room.guests[0]!, room.guests[1]!];

    await chooseDistinctTopics(backend, [room.host, guestB]);
    await presence.heartbeatAll(room.players);
    await expect(startQuizslop(backend, room.host)).rejects.toThrow(
      "does not have a confirmed topic yet",
    );
    await chooseTopic(backend, guestC, CATALOG_TOPIC_IDS[2]!);
    await expect(
      backend.mutation(api.quizslop.start, { capability: guestB.capability }),
    ).rejects.toThrow("Host capability required");

    const started = await startQuizslop(backend, room.host);
    expect(started).toEqual({ started: true, totalRounds: 5 });
    // Retried start is an idempotent no-op reporting the started game.
    await expect(startQuizslop(backend, room.host)).resolves.toEqual({
      started: false,
      totalRounds: 5,
    });

    const game = await getGame(backend, room.host.gameId);
    expect(game).toMatchObject({
      totalRounds: 5,
      currentRound: 1,
      playerCount: 3,
      status: "WRITING",
    });
    const state = await getQuizslopState(backend, room.host.gameId);
    expect(state).toMatchObject({ phase: "TOPIC_REVEAL", deckPosition: 0 });
    expect(game.phaseDeadline).toBeUndefined();
    expect(game.currentRound).toBe(state.deckPosition + 1);

    const deck = await backend.run(async (ctx) => {
      const rounds = await ctx.db
        .query("quizSlopRounds")
        .withIndex("by_gameId_and_deckOrdinal", (index) => index.eq("gameId", room.host.gameId))
        .take(11);
      const topics = await ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .take(20);
      return { rounds, topics };
    });
    expect(deck.rounds.map((round) => round.kind)).toEqual([
      "WARM_UP",
      "HOME_TURF",
      "HOME_TURF",
      "HOME_TURF",
      "HOUSE_CHOICE",
    ]);
    expect(deck.rounds.map((round) => round.deckOrdinal)).toEqual([0, 1, 2, 3, 4]);
    expect(deck.rounds.map((round) => round.pointValue)).toEqual([100, 100, 100, 100, 200]);
    const finale = deck.rounds[4]!;
    expect(finale.topicId).toBeUndefined();
    expect(finale.finalistTopicIds).toHaveLength(3);

    // Warm-up and finalists stay distinct from every Home Topic canonical key.
    const homeKeys = new Set(
      deck.topics
        .filter((topic) => topic.ownerPlayerId !== undefined)
        .map((topic) => topic.canonicalKey),
    );
    expect(homeKeys.size).toBe(3);
    const warmUpTopic = deck.topics.find((topic) => topic._id === deck.rounds[0]!.topicId);
    const finalistTopics = deck.topics.filter((topic) =>
      (finale.finalistTopicIds ?? []).includes(topic._id),
    );
    const neutralKeys = [warmUpTopic!, ...finalistTopics].map((topic) => topic.canonicalKey);
    expect(new Set(neutralKeys).size).toBe(4);
    for (const key of neutralKeys) expect(homeKeys.has(key)).toBe(false);
    const homeOrdinals = deck.topics
      .filter((topic) => topic.deckRole === "HOME_TURF")
      .map((topic) => topic.deckOrdinal)
      .toSorted((left, right) => (left ?? 0) - (right ?? 0));
    expect(homeOrdinals).toEqual([1, 2, 3]);

    const participants = await getParticipants(backend, room.host.gameId);
    expect(participants).toHaveLength(3);
    expect(participants.map((participant) => participant.seatOrder)).toEqual([0, 1, 2]);
    for (const participant of participants) {
      expect(participant).toMatchObject({
        hiddenTier: "EASY",
        callTokens: 2,
        disputeAvailable: true,
        quizSubtotal: 0,
        callSubtotal: 0,
        total: 0,
      });
    }

    // The hidden tier never reaches a stage or controller payload.
    const stage = await stageViewOf(backend, room.host);
    const controller = await controllerViewOf(backend, room.host);
    for (const token of HIDDEN_TIER_TOKENS) {
      expect(viewContains(stage, token)).toBe(false);
      expect(viewContains(controller, token)).toBe(false);
    }
  });

  test("requires online presence and excludes offline lobby players from the frozen roster", async () => {
    const backend = createTestBackend();
    const room = await createQuizslopRoom(backend, { joinerNames: ["Bea", "Cody"] });
    const presence = createPresenceController(backend);
    const [guestB, guestC] = [room.guests[0]!, room.guests[1]!];
    await chooseDistinctTopics(backend, room.players);

    // Every player is ready but nobody is online, so the boundary check fails.
    await expect(startQuizslop(backend, room.host)).rejects.toThrow("connected players to start");

    await presence.heartbeatAll([room.host, guestB]);
    const started = await startQuizslop(backend, room.host);
    expect(started).toEqual({ started: true, totalRounds: 4 });

    const participants = await getParticipants(backend, room.host.gameId);
    expect(participants).toHaveLength(2);
    const guestCPlayerId = playerIdOf(guestC);
    expect(participants.some((entry) => entry.playerId === guestCPlayerId)).toBe(false);

    const excludedTopic = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopTopics")
        .withIndex("by_gameId_and_ownerPlayerId", (index) =>
          index.eq("gameId", room.host.gameId).eq("ownerPlayerId", guestCPlayerId),
        )
        .unique(),
    );
    expect(excludedTopic?.deckOrdinal).toBeUndefined();
    expect(excludedTopic?.deckRole).toBeUndefined();
    const game = await getGame(backend, room.host.gameId);
    expect(game.playerCount).toBe(2);
  });
});

describe("QuizSlop standard round", () => {
  test("Tutorial Mode keeps submission phases host-paced after full quorum", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend, {
      joinerNames: ["Bea"],
      timersDisabled: true,
    });
    const players = [host, ...guests];
    const phases = [(await getQuizslopState(backend, host.gameId)).phase];

    phases.push(await hostAdvance(backend, host));
    for (const player of players) await submitCallAs(backend, player, null);
    expect((await getQuizslopState(backend, host.gameId)).phase).toBe("SLOP_CALL");

    phases.push(await hostAdvance(backend, host));
    phases.push(await hostAdvance(backend, host));
    for (const player of players) await lockAnswerAs(backend, player, true);
    expect((await getQuizslopState(backend, host.gameId)).phase).toBe("ANSWER");
    phases.push(await hostAdvance(backend, host));
    phases.push(await hostAdvance(backend, host));

    expect(phases).toEqual([
      "TOPIC_REVEAL",
      "SLOP_CALL",
      "SLOP_CALL_REVEAL",
      "ANSWER",
      "QUESTION_REVEAL",
      "ROUND_RESULTS",
    ]);
  });

  test("plays a warm-up round with calls, exact scoring mirrors, and the hidden ladder", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend);
    const [guestB, guestC] = [guests[0]!, guests[1]!];
    const gameId = host.gameId;

    await advanceToPhase(backend, host, "SLOP_CALL");
    // Every gameplay mutation checks the shared phase generation.
    const staleGeneration = (await getGame(backend, gameId)).phaseGeneration - 1;
    await expect(
      backend.mutation(api.quizslop.submitCall, {
        capability: host.capability,
        targetPlayerId: null,
        expectedPhaseGeneration: staleGeneration,
      }),
    ).rejects.toThrow("Game phase already advanced");
    await submitCallAs(backend, host, playerIdOf(guestB));
    // Duplicate with a different target throws; same target is idempotent.
    await expect(submitCallAs(backend, host, playerIdOf(guestC))).rejects.toThrow("already locked");
    await expect(submitCallAs(backend, host, playerIdOf(guestB))).resolves.toEqual({
      phase: "SLOP_CALL",
    });
    // The token is spent at submit, exactly once.
    await expect(getParticipant(backend, gameId, playerIdOf(host))).resolves.toMatchObject({
      callTokens: 1,
    });
    await expect(submitCallAs(backend, guestB, playerIdOf(guestB))).rejects.toThrow(
      "cannot call yourself",
    );
    await submitCallAs(backend, guestB, playerIdOf(guestC));
    const lastCall = await submitCallAs(backend, guestC, null);
    expect(lastCall.phase).toBe("SLOP_CALL");
    expect(await hostAdvance(backend, host)).toBe("SLOP_CALL_REVEAL");
    const revealStage = await stageViewOf(backend, host);
    expect(revealStage.callReveal).toHaveLength(2);

    await advanceToPhase(backend, host, "ANSWER");
    const round = await getCurrentRound(backend, gameId);
    const assignments = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopAssignments")
        .withIndex("by_roundId_and_playerId", (index) => index.eq("roundId", round._id))
        .take(9),
    );
    expect(assignments).toHaveLength(3);
    expect(new Set(assignments.map((entry) => entry.questionId)).size).toBe(1);
    expect(assignments.every((entry) => entry.tierAtAssignment === "EASY")).toBe(true);

    await lockAnswerAs(backend, host, true);
    await lockAnswerAs(backend, guestB, false);
    const lastLock = await lockAnswerAs(backend, guestC, true);
    expect(lastLock.phase).toBe("ANSWER");
    expect(await hostAdvance(backend, host)).toBe("QUESTION_REVEAL");

    await advanceToPhase(backend, host, "ROUND_RESULTS");
    const [hostRow, bRow, cRow] = [
      await getParticipant(backend, gameId, playerIdOf(host)),
      await getParticipant(backend, gameId, playerIdOf(guestB)),
      await getParticipant(backend, gameId, playerIdOf(guestC)),
    ];
    // Correct answer +100 and a won call +150; wrong answer 0 and a lost call -150.
    expect(hostRow).toMatchObject({
      quizSubtotal: 100,
      callSubtotal: 150,
      total: 250,
      callTokens: 1,
      hiddenTier: "MEDIUM",
      correctAnswers: 1,
      successfulCalls: 1,
      incorrectCalls: 0,
    });
    expect(bRow).toMatchObject({
      quizSubtotal: 0,
      callSubtotal: -150,
      total: -150,
      callTokens: 1,
      hiddenTier: "EASY",
      correctAnswers: 0,
      incorrectCalls: 1,
    });
    expect(cRow).toMatchObject({
      quizSubtotal: 100,
      callSubtotal: 0,
      total: 100,
      callTokens: 2,
      hiddenTier: "MEDIUM",
    });
    expectLedgerConsistent(await readLedger(backend, gameId));

    const resultsStage = await stageViewOf(backend, host);
    expect(resultsStage.phase).toBe("ROUND_RESULTS");
    const scoreboardOf = (playerId: string) =>
      resultsStage.scoreboard.find((entry) => entry.playerId === playerId);
    expect(scoreboardOf(playerIdOf(host))).toMatchObject({ total: 250, quizSubtotal: 100 });
    expect(scoreboardOf(playerIdOf(guestB))).toMatchObject({ total: -150, quizSubtotal: 0 });
    expect(scoreboardOf(playerIdOf(guestC))).toMatchObject({ total: 100, quizSubtotal: 100 });
    expect(resultsStage.settledCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: "WON", callDelta: 150 }),
        expect.objectContaining({ outcome: "LOST", callDelta: -150 }),
      ]),
    );

    // The next round serves each player their current hidden tier's question.
    await hostAdvance(backend, host);
    const roundTwoGame = await getGame(backend, gameId);
    const roundTwoState = await getQuizslopState(backend, gameId);
    expect(roundTwoGame.currentRound).toBe(2);
    expect(roundTwoGame.currentRound).toBe(roundTwoState.deckPosition + 1);
    await advanceToPhase(backend, host, "ANSWER");
    const hostQ = await readAssignmentQuestion(backend, host);
    const bQ = await readAssignmentQuestion(backend, guestB);
    const cQ = await readAssignmentQuestion(backend, guestC);
    expect(hostQ.question.tier).toBe("MEDIUM");
    expect(bQ.question.tier).toBe("EASY");
    expect(cQ.question.tier).toBe("MEDIUM");
    expect(hostQ.question._id).toBe(cQ.question._id);
    expect(bQ.question._id).not.toBe(hostQ.question._id);
  });

  test("refunds a call whose target missed the answer eligibility snapshot", async () => {
    const backend = createTestBackend();
    const { host, guests, presence } = await createReadyGame(backend);
    const [guestB, guestC] = [guests[0]!, guests[1]!];
    const gameId = host.gameId;

    await advanceToPhase(backend, host, "SLOP_CALL");
    await submitCallAs(backend, host, playerIdOf(guestC));
    await hostAdvance(backend, host); // Close calls (B and C default to hold).
    // The target drops before the answer phase snapshots eligibility.
    await presence.disconnect(guestC);
    const answerPhase = await hostAdvance(backend, host);
    expect(answerPhase).toBe("ANSWER");

    const round = await getCurrentRound(backend, gameId);
    const guestCPlayerId = playerIdOf(guestC);
    const snapshot = await backend.run(async (ctx) => {
      const assignments = await ctx.db
        .query("quizSlopAssignments")
        .withIndex("by_roundId_and_playerId", (index) => index.eq("roundId", round._id))
        .take(9);
      const answerEligibility = await ctx.db
        .query("quizSlopEligibility")
        .withIndex("by_roundId_and_kind_and_playerId", (index) =>
          index.eq("roundId", round._id).eq("kind", "ANSWER"),
        )
        .take(9);
      return { assignments, answerEligibility };
    });
    expect(snapshot.assignments).toHaveLength(2);
    expect(snapshot.assignments.some((entry) => entry.playerId === guestCPlayerId)).toBe(false);
    expect(snapshot.answerEligibility.some((entry) => entry.playerId === guestCPlayerId)).toBe(
      false,
    );

    // The exempt player has no assignment and cannot answer this round.
    const answerGame = await getGame(backend, gameId);
    await expect(
      backend.mutation(api.quizslop.lockAnswer, {
        capability: guestC.capability,
        selectedIndex: 0,
        expectedPhaseGeneration: answerGame.phaseGeneration,
      }),
    ).rejects.toThrow("You have no question this round");

    await lockAnswerAs(backend, host, true);
    await lockAnswerAs(backend, guestB, true);
    await advanceToPhase(backend, host, "ROUND_RESULTS");

    const hostPlayerId = playerIdOf(host);
    const call = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopCalls")
        .withIndex("by_roundId_and_callerId", (index) =>
          index.eq("roundId", round._id).eq("callerId", hostPlayerId),
        )
        .unique(),
    );
    expect(call).toMatchObject({ outcome: "REFUNDED", callDelta: 0, tokenRefunded: true });
    // Token restored, no call points either way, exempt target untouched.
    expect(await getParticipant(backend, gameId, hostPlayerId)).toMatchObject({
      callTokens: 2,
      callSubtotal: 0,
      quizSubtotal: 100,
      successfulCalls: 0,
      incorrectCalls: 0,
    });
    expect(await getParticipant(backend, gameId, guestCPlayerId)).toMatchObject({
      quizSubtotal: 0,
      callSubtotal: 0,
      total: 0,
      hiddenTier: "EASY",
    });
    expectLedgerConsistent(await readLedger(backend, gameId));
  });

  test("scores an accountable timeout by deadline and keeps settlement idempotent", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend, {
      joinerNames: ["Bea"],
      timersDisabled: false,
    });
    const guestB = guests[0]!;
    const gameId = host.gameId;

    expect(await hostAdvance(backend, host)).toBe("SLOP_CALL");
    const callPhase = await getGame(backend, gameId);
    await expect(
      backend.mutation(api.quizslop.advance, {
        capability: host.capability,
        expectedPhaseGeneration: callPhase.phaseGeneration,
      }),
    ).rejects.toThrow("This phase advances by player quorum or its server deadline");
    await submitCallAs(backend, host, null);
    await expect(submitCallAs(backend, guestB, null)).resolves.toEqual({
      phase: "SLOP_CALL_REVEAL",
    });
    expect(await hostAdvance(backend, host)).toBe("ANSWER");
    const answerOne = await getGame(backend, gameId);
    expect(answerOne.phaseDeadline).toEqual(expect.any(Number));
    const staleTuple = {
      deadline: answerOne.phaseDeadline!,
      phaseGeneration: answerOne.phaseGeneration,
    };

    await lockAnswerAs(backend, host, true);
    // Bea never locks; the deadline makes her accountable and incorrect.
    await expect(
      enforceCurrentDeadline(backend, gameId, (timestamp) => vi.setSystemTime(timestamp)),
    ).resolves.toEqual({ advanced: true });
    expect((await getQuizslopState(backend, gameId)).phase).toBe("QUESTION_REVEAL");
    expect((await getGame(backend, gameId)).phaseDeadline).toBeUndefined();
    const timedOut = await backend.run(async (ctx) => {
      const round = await ctx.db
        .query("quizSlopRounds")
        .withIndex("by_gameId_and_deckOrdinal", (index) =>
          index.eq("gameId", gameId).eq("deckOrdinal", 0),
        )
        .unique();
      if (!round) throw new Error("Missing round");
      return ctx.db
        .query("quizSlopAssignments")
        .withIndex("by_roundId_and_playerId", (index) =>
          index.eq("roundId", round._id).eq("playerId", playerIdOf(guestB)),
        )
        .unique();
    });
    expect(timedOut).toMatchObject({ timedOut: true });
    expect(timedOut?.lockedAt).toBeUndefined();

    expect(await hostAdvance(backend, host)).toBe("ROUND_RESULTS");
    // Accountable timeout scores zero and moves the ladder down (clamped at EASY).
    expect(await getParticipant(backend, gameId, playerIdOf(guestB))).toMatchObject({
      quizSubtotal: 0,
      hiddenTier: "EASY",
      correctAnswers: 0,
    });
    expect(await getParticipant(backend, gameId, playerIdOf(host))).toMatchObject({
      quizSubtotal: 100,
      hiddenTier: "MEDIUM",
    });
    // Replaying the already-consumed answer deadline is a stale no-op.
    await expect(enforceStaleDeadline(backend, gameId, staleTuple)).resolves.toEqual({
      advanced: false,
    });

    // A later valid correct answer moves the clamped tier up to MEDIUM.
    expect(await hostAdvance(backend, host)).toBe("TOPIC_REVEAL");
    expect(await hostAdvance(backend, host)).toBe("SLOP_CALL");
    await submitCallAs(backend, host, null);
    await submitCallAs(backend, guestB, null);
    expect(await hostAdvance(backend, host)).toBe("ANSWER");
    const answerTwo = await getGame(backend, gameId);
    const staleTupleTwo = {
      deadline: answerTwo.phaseDeadline!,
      phaseGeneration: answerTwo.phaseGeneration,
    };
    await lockAnswerAs(backend, host, true);
    await lockAnswerAs(backend, guestB, true);
    expect((await getGame(backend, gameId)).phaseDeadline).toBe(
      Date.now() + QUESTION_REVEAL_SECONDS_PER_GROUP * 1_000,
    );
    await advanceToPhase(backend, host, "ROUND_RESULTS");
    expect(await getParticipant(backend, gameId, playerIdOf(guestB))).toMatchObject({
      hiddenTier: "MEDIUM",
      quizSubtotal: 100,
    });

    const before = await readLedger(backend, gameId);
    expectLedgerConsistent(before);
    await expect(enforceStaleDeadline(backend, gameId, staleTupleTwo)).resolves.toEqual({
      advanced: false,
    });
    await expect(readLedger(backend, gameId)).resolves.toEqual(before);
  });
});

describe("QuizSlop disputes", () => {
  test("opens ordered ruling turns with a frozen denominator and settles voids exactly once", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend);
    const [guestB, guestC] = [guests[0]!, guests[1]!];
    const gameId = host.gameId;
    const hostId = playerIdOf(host);

    // Round 1 splits the tiers: the host climbs to MEDIUM, B and C stay EASY.
    await playStandardRound(backend, host, [host, guestB, guestC], {
      correct: (session) => session.playerId === hostId,
    });

    // Round 2: C calls the host, whose question will later be voided.
    await advanceToPhase(backend, host, "SLOP_CALL");
    await submitCallAs(backend, guestC, hostId);
    await advanceToPhase(backend, host, "ANSWER");
    const hostQ = await readAssignmentQuestion(backend, host);
    const bQ = await readAssignmentQuestion(backend, guestB);
    expect(hostQ.question.tier).toBe("MEDIUM");
    expect(bQ.question.tier).toBe("EASY");
    const mediumQuestionId = hostQ.question._id;
    const easyQuestionId = bQ.question._id;

    await lockAnswerAs(backend, host, true);
    await lockAnswerAs(backend, guestB, true);
    const reveal = await lockAnswerAs(backend, guestC, false);
    expect(reveal.phase).toBe("ANSWER");
    expect(await hostAdvance(backend, host)).toBe("QUESTION_REVEAL");

    const revealRound = await getCurrentRound(backend, gameId);
    const mediumOrdinal = revealRound.revealQuestionIds?.indexOf(mediumQuestionId) ?? -1;
    const easyOrdinal = revealRound.revealQuestionIds?.indexOf(easyQuestionId) ?? -1;
    if (mediumOrdinal < 0 || easyOrdinal < 0) throw new Error("Expected both reveal groups");
    if (mediumOrdinal > 0) {
      await expect(initiateDisputeAs(backend, guestB, mediumQuestionId)).rejects.toThrow(
        "Only revealed questions can be challenged",
      );
      expect(await hostAdvance(backend, host)).toBe("QUESTION_REVEAL");
    }

    const opened = await initiateDisputeAs(backend, guestB, mediumQuestionId);
    if (opened.kind !== "OPENED") throw new Error("Expected an opened dispute");
    await expect(getParticipant(backend, gameId, playerIdOf(guestB))).resolves.toMatchObject({
      disputeAvailable: false,
    });
    // A duplicate challenge returns ALREADY_OPEN without consuming a token.
    await expect(initiateDisputeAs(backend, guestC, mediumQuestionId)).resolves.toEqual({
      kind: "ALREADY_OPEN",
    });
    await expect(getParticipant(backend, gameId, playerIdOf(guestC))).resolves.toMatchObject({
      disputeAvailable: true,
    });
    if (easyOrdinal > mediumOrdinal) {
      expect(await hostAdvance(backend, host)).toBe("QUESTION_REVEAL");
    }
    const openedSecond = await initiateDisputeAs(
      backend,
      guestC,
      easyQuestionId,
      "SOURCE_DOES_NOT_SUPPORT",
    );
    if (openedSecond.kind !== "OPENED") throw new Error("Expected a second opened dispute");

    const votePhase = await hostAdvance(backend, host);
    expect(votePhase).toBe("DISPUTE_VOTE");
    const round = await getCurrentRound(backend, gameId);
    const frozen = await backend.run(async (ctx) => ({
      first: await ctx.db.get("quizSlopDisputes", opened.disputeId),
      second: await ctx.db.get("quizSlopDisputes", openedSecond.disputeId),
    }));
    // Both ordered rulings share one frozen voter denominator.
    expect(frozen.first?.frozenVoterCount).toBe(3);
    expect(frozen.second?.frozenVoterCount).toBe(3);

    await castDisputeVoteAs(backend, host, opened.disputeId, "VOID");
    await castDisputeVoteAs(backend, guestB, opened.disputeId, "VOID");
    await expect(castDisputeVoteAs(backend, host, opened.disputeId, "VOID")).resolves.toEqual({
      phase: "DISPUTE_VOTE",
    });
    await expect(castDisputeVoteAs(backend, host, opened.disputeId, "UPHOLD")).rejects.toThrow(
      "already locked",
    );
    await expect(castDisputeVoteAs(backend, host, openedSecond.disputeId, "VOID")).rejects.toThrow(
      "not up for ruling yet",
    );

    // Every challenged question gets its own ruling turn and fresh generation.
    const nextRuling = await hostAdvance(backend, host);
    expect(nextRuling).toBe("DISPUTE_VOTE");
    expect((await getQuizslopState(backend, gameId)).revealOrdinal).toBe(1);
    await castDisputeVoteAs(backend, host, openedSecond.disputeId, "VOID");

    // Host close applies abstentions; ties and minorities uphold.
    const settled = await hostAdvance(backend, host);
    expect(settled).toBe("ROUND_RESULTS");
    const rulings = await backend.run(async (ctx) => ({
      first: await ctx.db.get("quizSlopDisputes", opened.disputeId),
      second: await ctx.db.get("quizSlopDisputes", openedSecond.disputeId),
      round: await ctx.db.get("quizSlopRounds", round._id),
    }));
    expect(rulings.first?.ruling).toBe("PLAYER_VOIDED");
    expect(rulings.second?.ruling).toBe("UPHELD");
    expect(rulings.round?.settledAt).toEqual(expect.any(Number));
    expect(rulings.round?.rulings).toEqual(
      expect.arrayContaining([
        { questionId: mediumQuestionId, ruling: "PLAYER_VOIDED" },
        { questionId: easyQuestionId, ruling: "UPHELD" },
      ]),
    );

    // Voided question: no quiz points, no tier movement, related call refunded.
    expect(await getParticipant(backend, gameId, hostId)).toMatchObject({
      quizSubtotal: 100,
      hiddenTier: "MEDIUM",
      correctAnswers: 1,
    });
    expect(await getParticipant(backend, gameId, playerIdOf(guestB))).toMatchObject({
      quizSubtotal: 100,
      hiddenTier: "MEDIUM",
    });
    expect(await getParticipant(backend, gameId, playerIdOf(guestC))).toMatchObject({
      quizSubtotal: 0,
      hiddenTier: "EASY",
      callTokens: 2,
      callSubtotal: 0,
    });
    const guestCId = playerIdOf(guestC);
    const refundedCall = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopCalls")
        .withIndex("by_roundId_and_callerId", (index) =>
          index.eq("roundId", round._id).eq("callerId", guestCId),
        )
        .unique(),
    );
    expect(refundedCall).toMatchObject({
      outcome: "REFUNDED",
      callDelta: 0,
      tokenRefunded: true,
    });
    const voidedAssignment = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopAssignments")
        .withIndex("by_roundId_and_playerId", (index) =>
          index.eq("roundId", round._id).eq("playerId", hostId),
        )
        .unique(),
    );
    expect(voidedAssignment?.quizDelta).toBe(0);
    expect(voidedAssignment?.correct).toBeUndefined();
    expectLedgerConsistent(await readLedger(backend, gameId));

    // One successful initiation per game: the used token stays consumed.
    await hostAdvance(backend, host);
    await advanceToPhase(backend, host, "ANSWER");
    await lockAnswerAs(backend, host, true);
    await lockAnswerAs(backend, guestB, true);
    await lockAnswerAs(backend, guestC, true);
    await advanceToPhase(backend, host, "QUESTION_REVEAL");
    const roundThree = await getCurrentRound(backend, gameId);
    const challengeable = roundThree.revealQuestionIds?.[0];
    if (!challengeable) throw new Error("Expected a revealed question");
    await expect(initiateDisputeAs(backend, guestB, challengeable)).rejects.toThrow(
      "already used your dispute",
    );
    await expect(initiateDisputeAs(backend, host, challengeable)).resolves.toMatchObject({
      kind: "OPENED",
    });
  });

  test("system-voids a corrupt question before reveal and neutralizes its scoring", async () => {
    const backend = createTestBackend();
    const { host, guests } = await createReadyGame(backend, { joinerNames: ["Bea"] });
    const guestB = guests[0]!;
    const gameId = host.gameId;

    await advanceToPhase(backend, host, "SLOP_CALL");
    await submitCallAs(backend, guestB, playerIdOf(host));
    await advanceToPhase(backend, host, "ANSWER");
    const assigned = await readAssignmentQuestion(backend, host);
    await lockAnswerAs(backend, host, true);
    // Corrupt the shared frozen question before the answer phase closes.
    await backend.run(async (ctx) => {
      await ctx.db.patch("quizSlopQuestions", assigned.question._id, { displayPrompt: " " });
    });
    const closed = await lockAnswerAs(backend, guestB, true);
    expect(closed.phase).toBe("ANSWER");
    expect(await hostAdvance(backend, host)).toBe("QUESTION_REVEAL");

    // The voided group shows deterministic copy and never reveals the key.
    const stage = await stageViewOf(backend, host);
    expect(stage.revealGroups).toHaveLength(1);
    expect(stage.revealGroups[0]).toMatchObject({
      systemVoid: true,
      displayPrompt: null,
      choices: null,
      correctIndex: null,
      explanation: null,
      sources: [],
    });

    await expect(initiateDisputeAs(backend, guestB, assigned.question._id)).rejects.toThrow(
      "voided question cannot be challenged",
    );
    await advanceToPhase(backend, host, "ROUND_RESULTS");

    const round = await getRoundByOrdinal(backend, gameId, 0);
    expect(round.rulings).toEqual([{ questionId: assigned.question._id, ruling: "SYSTEM_VOID" }]);
    // No quiz points, no ladder movement, and the related call is refunded.
    expect(await getParticipant(backend, gameId, playerIdOf(host))).toMatchObject({
      quizSubtotal: 0,
      hiddenTier: "EASY",
      correctAnswers: 0,
    });
    expect(await getParticipant(backend, gameId, playerIdOf(guestB))).toMatchObject({
      quizSubtotal: 0,
      hiddenTier: "EASY",
      callTokens: 2,
      callSubtotal: 0,
    });
    const guestBId = playerIdOf(guestB);
    const refundedCall = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopCalls")
        .withIndex("by_roundId_and_callerId", (index) =>
          index.eq("roundId", round._id).eq("callerId", guestBId),
        )
        .unique(),
    );
    expect(refundedCall).toMatchObject({
      outcome: "REFUNDED",
      callDelta: 0,
      tokenRefunded: true,
    });
    expectLedgerConsistent(await readLedger(backend, gameId));
  });
});
