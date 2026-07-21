import type { TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type schema from "./schema";
import { CHOICES_PER_QUESTION } from "../src/games/quizslop/game-constants";
import { QUIZSLOP_TOPIC_CATALOG } from "../src/games/quizslop/config/topic-catalog";
import type {
  QuizslopDisputeReason,
  QuizslopDisputeVoteChoice,
  QuizslopPhase,
} from "../src/games/quizslop/types";

/**
 * Shared driver helpers for the QuizSlop Convex integration tests
 * (quizslop.test.ts, quizslopViews.test.ts, cleanup.test.ts). Everything here
 * takes the convex-test backend as an argument; the test files own timers,
 * env stubs, and assertions. The only convex-test dependency is type-level so
 * this module stays inert if it is ever bundled outside the test runner.
 */

export type QuizslopBackend = TestConvex<typeof schema>;

export type QuizslopSession = {
  capability: string;
  gameId: Id<"games">;
  playerId: Id<"players"> | null;
  roomCode: string;
  sessionId: Id<"playerSessions">;
};

export const QUIZSLOP_HOST_SECRET = "host-secret";

/** Stable reviewed catalog IDs used to hand out distinct Home Topics. */
export const CATALOG_TOPIC_IDS: readonly string[] = QUIZSLOP_TOPIC_CATALOG.map((topic) => topic.id);

export function playerIdOf(session: QuizslopSession): Id<"players"> {
  if (!session.playerId) throw new Error("Session has no player");
  return session.playerId;
}

export async function createQuizslopRoom(
  backend: QuizslopBackend,
  options?: {
    displayOnlyHost?: boolean;
    hostName?: string;
    joinerNames?: readonly string[];
    timersDisabled?: boolean;
  },
): Promise<{ host: QuizslopSession; guests: QuizslopSession[]; players: QuizslopSession[] }> {
  const host: QuizslopSession = await backend.action(api.rooms.create, {
    gameType: "QUIZSLOP",
    hostSecret: QUIZSLOP_HOST_SECRET,
    ...(options?.displayOnlyHost
      ? { hostParticipation: "DISPLAY_ONLY" as const }
      : {
          hostName: options?.hostName ?? "Hana",
          hostParticipation: "PLAYER" as const,
        }),
    timersDisabled: options?.timersDisabled ?? true,
  });
  const guests: QuizslopSession[] = [];
  for (const name of options?.joinerNames ?? []) {
    guests.push(await backend.action(api.rooms.join, { name, roomCode: host.roomCode }));
  }
  const players: QuizslopSession[] = [...(host.playerId ? [host] : []), ...guests];
  return { host, guests, players };
}

export type PresenceController = {
  heartbeat(session: QuizslopSession): Promise<void>;
  heartbeatAll(sessions: readonly QuizslopSession[]): Promise<void>;
  disconnect(session: QuizslopSession): Promise<void>;
};

/**
 * Presence simulator: one stable tab UUID per capability, plus the opaque
 * session token needed to simulate a disconnect. The presence component keeps
 * a session online until its scheduled timeout runs; in convex-test scheduled
 * work never runs implicitly, so an explicit `disconnect` is the deterministic
 * equivalent of letting the heartbeat go stale past the staleness window.
 */
export function createPresenceController(backend: QuizslopBackend): PresenceController {
  let counter = 0;
  const tabIds = new Map<string, string>();
  const sessionTokens = new Map<string, string>();
  const heartbeat = async (session: QuizslopSession): Promise<void> => {
    let tabId = tabIds.get(session.capability);
    if (!tabId) {
      counter += 1;
      tabId = `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
      tabIds.set(session.capability, tabId);
    }
    const result = await backend.mutation(api.presence.heartbeat, {
      capability: session.capability,
      interval: 5_000,
      sessionId: tabId,
    });
    sessionTokens.set(session.capability, result.sessionToken);
  };
  return {
    heartbeat,
    heartbeatAll: async (sessions) => {
      for (const session of sessions) await heartbeat(session);
    },
    disconnect: async (session) => {
      const token = sessionTokens.get(session.capability);
      if (!token) throw new Error("Session never sent a presence heartbeat");
      await backend.mutation(api.presence.disconnect, { sessionToken: token });
    },
  };
}

export async function getGame(
  backend: QuizslopBackend,
  gameId: Id<"games">,
): Promise<Doc<"games">> {
  const game = await backend.run(async (ctx) => ctx.db.get("games", gameId));
  if (!game) throw new Error("Missing game");
  return game;
}

export async function getQuizslopState(
  backend: QuizslopBackend,
  gameId: Id<"games">,
): Promise<Doc<"quizSlopState">> {
  const state = await backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .unique(),
  );
  if (!state) throw new Error("Missing QuizSlop state");
  return state;
}

export async function getRoundByOrdinal(
  backend: QuizslopBackend,
  gameId: Id<"games">,
  deckOrdinal: number,
): Promise<Doc<"quizSlopRounds">> {
  const round = await backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopRounds")
      .withIndex("by_gameId_and_deckOrdinal", (index) =>
        index.eq("gameId", gameId).eq("deckOrdinal", deckOrdinal),
      )
      .unique(),
  );
  if (!round) throw new Error(`Missing round at deck ordinal ${deckOrdinal}`);
  return round;
}

export async function getCurrentRound(
  backend: QuizslopBackend,
  gameId: Id<"games">,
): Promise<Doc<"quizSlopRounds">> {
  const state = await getQuizslopState(backend, gameId);
  return getRoundByOrdinal(backend, gameId, state.deckPosition);
}

export async function getParticipants(
  backend: QuizslopBackend,
  gameId: Id<"games">,
): Promise<Doc<"quizSlopParticipants">[]> {
  const rows = await backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopParticipants")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(16),
  );
  return rows.toSorted((left, right) => left.seatOrder - right.seatOrder);
}

export async function getParticipant(
  backend: QuizslopBackend,
  gameId: Id<"games">,
  playerId: Id<"players">,
): Promise<Doc<"quizSlopParticipants">> {
  const participant = await backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopParticipants")
      .withIndex("by_gameId_and_playerId", (index) =>
        index.eq("gameId", gameId).eq("playerId", playerId),
      )
      .unique(),
  );
  if (!participant) throw new Error("Missing participant");
  return participant;
}

export async function chooseTopic(
  backend: QuizslopBackend,
  session: QuizslopSession,
  catalogTopicId: string,
): Promise<{ kind: "CONFIRMED"; topicId: Id<"quizSlopTopics"> } | { kind: "TOPIC_TAKEN" }> {
  return backend.mutation(api.quizslop.chooseCatalogTopic, {
    capability: session.capability,
    catalogTopicId,
  });
}

/** Confirms CATALOG_TOPIC_IDS[i] for players[i]; throws on any lost claim. */
export async function chooseDistinctTopics(
  backend: QuizslopBackend,
  players: readonly QuizslopSession[],
): Promise<void> {
  for (const [index, player] of players.entries()) {
    const catalogTopicId = CATALOG_TOPIC_IDS[index];
    if (!catalogTopicId) throw new Error("Ran out of catalog topics");
    const result = await chooseTopic(backend, player, catalogTopicId);
    if (result.kind !== "CONFIRMED") {
      throw new Error(`Topic ${catalogTopicId} was not confirmed`);
    }
  }
}

export async function startQuizslop(
  backend: QuizslopBackend,
  host: QuizslopSession,
): Promise<{ started: boolean; totalRounds: number }> {
  return backend.mutation(api.quizslop.start, { capability: host.capability });
}

export async function hostAdvance(
  backend: QuizslopBackend,
  host: QuizslopSession,
): Promise<QuizslopPhase> {
  const game = await getGame(backend, host.gameId);
  const result = await backend.mutation(api.quizslop.advance, {
    capability: host.capability,
    expectedPhaseGeneration: game.phaseGeneration,
  });
  return result.phase;
}

export async function stageViewOf(backend: QuizslopBackend, session: QuizslopSession) {
  return backend.query(api.quizslopViews.stageView, { capability: session.capability });
}

export async function controllerViewOf(backend: QuizslopBackend, session: QuizslopSession) {
  return backend.query(api.quizslopViews.controllerView, { capability: session.capability });
}

/** Reads the stage view and host-advances until the target phase is showing. */
export async function advanceToPhase(
  backend: QuizslopBackend,
  host: QuizslopSession,
  target: QuizslopPhase,
  maxSteps = 48,
) {
  for (let step = 0; step < maxSteps; step += 1) {
    const view = await stageViewOf(backend, host);
    if (view.phase === target) return view;
    await backend.mutation(api.quizslop.advance, {
      capability: host.capability,
      expectedPhaseGeneration: view.version,
    });
  }
  throw new Error(`Game never reached phase ${target}`);
}

export async function submitCallAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  targetPlayerId: Id<"players"> | null,
): Promise<{ phase: QuizslopPhase }> {
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.submitCall, {
    capability: session.capability,
    targetPlayerId,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function readAssignmentQuestion(
  backend: QuizslopBackend,
  session: QuizslopSession,
): Promise<{ assignment: Doc<"quizSlopAssignments">; question: Doc<"quizSlopQuestions"> }> {
  const playerId = playerIdOf(session);
  const round = await getCurrentRound(backend, session.gameId);
  const result = await backend.run(async (ctx) => {
    const assignment = await ctx.db
      .query("quizSlopAssignments")
      .withIndex("by_roundId_and_playerId", (index) =>
        index.eq("roundId", round._id).eq("playerId", playerId),
      )
      .unique();
    if (!assignment) return null;
    const question = await ctx.db.get("quizSlopQuestions", assignment.questionId);
    if (!question) return null;
    return { assignment, question };
  });
  if (!result) throw new Error("Missing assignment or question");
  return result;
}

/** Locks the player's answer, choosing the frozen key or a deliberate miss. */
export async function lockAnswerAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  correct: boolean,
): Promise<{ phase: QuizslopPhase }> {
  const { question } = await readAssignmentQuestion(backend, session);
  const game = await getGame(backend, session.gameId);
  const selectedIndex = correct
    ? question.correctIndex
    : (question.correctIndex + 1) % CHOICES_PER_QUESTION;
  return backend.mutation(api.quizslop.lockAnswer, {
    capability: session.capability,
    selectedIndex,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function castHouseVoteAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  topicId: Id<"quizSlopTopics">,
): Promise<{ phase: QuizslopPhase }> {
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.castHouseVote, {
    capability: session.capability,
    topicId,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function initiateDisputeAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  questionId: Id<"quizSlopQuestions">,
  reason: QuizslopDisputeReason = "WRONG_ANSWER_KEY",
): Promise<{ kind: "OPENED"; disputeId: Id<"quizSlopDisputes"> } | { kind: "ALREADY_OPEN" }> {
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.initiateDispute, {
    capability: session.capability,
    questionId,
    reason,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function castDisputeVoteAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  disputeId: Id<"quizSlopDisputes">,
  choice: QuizslopDisputeVoteChoice,
): Promise<{ phase: QuizslopPhase }> {
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.castDisputeVote, {
    capability: session.capability,
    disputeId,
    choice,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export type RoundPlan = {
  /** Explicit calls; every other eligible player defaults to hold at close. */
  calls?: readonly { caller: QuizslopSession; target: Id<"players"> | null }[];
  /** Per-player correctness; defaults to a correct answer. */
  correct?: (session: QuizslopSession) => boolean;
  /** Players that never lock an answer (host close applies the timeout). */
  skipAnswer?: (session: QuizslopSession) => boolean;
};

/**
 * Plays one standard round from its TOPIC_REVEAL through settlement to
 * ROUND_RESULTS. Assumes every listed player is boundary-active and that any
 * challenged questions are handled by the caller before ROUND_RESULTS.
 */
export async function playStandardRound(
  backend: QuizslopBackend,
  host: QuizslopSession,
  players: readonly QuizslopSession[],
  plan?: RoundPlan,
): Promise<void> {
  await advanceToPhase(backend, host, "SLOP_CALL");
  for (const call of plan?.calls ?? []) {
    await submitCallAs(backend, call.caller, call.target);
  }
  await advanceToPhase(backend, host, "ANSWER");
  for (const player of players) {
    if (plan?.skipAnswer?.(player) === true) continue;
    await lockAnswerAs(backend, player, plan?.correct?.(player) ?? true);
  }
  await advanceToPhase(backend, host, "ROUND_RESULTS");
}

/**
 * Reads the shared phase deadline, moves the fake clock onto it through the
 * caller-provided setter, and runs the internal deadline enforcement with the
 * exact persisted tuple.
 */
export async function enforceCurrentDeadline(
  backend: QuizslopBackend,
  gameId: Id<"games">,
  setNow: (timestamp: number) => void,
): Promise<{ advanced: boolean }> {
  const game = await getGame(backend, gameId);
  if (game.phaseDeadline === undefined) {
    throw new Error("No phase deadline to enforce");
  }
  setNow(game.phaseDeadline);
  return backend.mutation(internal.quizslop.enforceDeadline, {
    gameId,
    deadline: game.phaseDeadline,
    phaseGeneration: game.phaseGeneration,
  });
}

export async function enforceStaleDeadline(
  backend: QuizslopBackend,
  gameId: Id<"games">,
  args: { deadline: number; phaseGeneration: number },
): Promise<{ advanced: boolean }> {
  return backend.mutation(internal.quizslop.enforceDeadline, {
    gameId,
    deadline: args.deadline,
    phaseGeneration: args.phaseGeneration,
  });
}

/** Every string value and object key reachable inside a view payload. */
export function collectStrings(value: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) {
        out.push(key);
        visit(item);
      }
    }
  };
  visit(value);
  return out;
}

export function viewContains(view: unknown, needle: string): boolean {
  return collectStrings(view).some((entry) => entry.includes(needle));
}

export const HIDDEN_TIER_TOKENS: readonly string[] = [
  "EASY",
  "MEDIUM",
  "HARD",
  "INSANE",
  "hiddenTier",
  "tierAtAssignment",
];

export type LedgerSnapshot = {
  entries: {
    playerId: Id<"players">;
    quizSubtotal: number;
    callSubtotal: number;
    total: number;
    mirroredScore: number;
    eventSum: number;
  }[];
  eventKeys: string[];
};

/** Scoring authority snapshot: subtotals, ledger sums, and the shared mirror. */
export async function readLedger(
  backend: QuizslopBackend,
  gameId: Id<"games">,
): Promise<LedgerSnapshot> {
  return backend.run(async (ctx) => {
    const participants = await ctx.db
      .query("quizSlopParticipants")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(16);
    const events = await ctx.db
      .query("quizSlopScoreEvents")
      .withIndex("by_gameId_and_key", (index) => index.eq("gameId", gameId))
      .take(256);
    const entries = [];
    for (const participant of participants) {
      const player = await ctx.db.get("players", participant.playerId);
      entries.push({
        playerId: participant.playerId,
        quizSubtotal: participant.quizSubtotal,
        callSubtotal: participant.callSubtotal,
        total: participant.total,
        mirroredScore: player?.score ?? Number.NaN,
        eventSum: events
          .filter((event) => event.playerId === participant.playerId)
          .reduce((sum, event) => sum + event.delta, 0),
      });
    }
    return { entries, eventKeys: events.map((event) => event.key) };
  });
}
