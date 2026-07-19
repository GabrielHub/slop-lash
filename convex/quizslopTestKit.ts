import type { TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type schema from "./schema";
import type { QuizslopPhase } from "../src/games/quizslop/types";

type QuizslopBackend = TestConvex<typeof schema>;
type QuizslopSession = {
  capability: string;
  gameId: Id<"games">;
  playerId: Id<"players"> | null;
  roomCode: string;
  sessionId: Id<"playerSessions">;
};
export const QUIZSLOP_HOST_SECRET = "host-secret";

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
) {
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
  const players = [...(host.playerId ? [host] : []), ...guests];
  return { host, guests, players };
}

export function createPresenceController(backend: QuizslopBackend) {
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
    heartbeatAll: async (sessions: readonly QuizslopSession[]) => {
      for (const session of sessions) await heartbeat(session);
    },
    disconnect: async (session: QuizslopSession) => {
      const token = sessionTokens.get(session.capability);
      if (!token) throw new Error("Session never sent a presence heartbeat");
      await backend.mutation(api.presence.disconnect, { sessionToken: token });
    },
  };
}

export async function getGame(backend: QuizslopBackend, gameId: Id<"games">) {
  const game = await backend.run(async (ctx) => ctx.db.get("games", gameId));
  if (!game) throw new Error("Missing game");
  return game;
}

export async function getQuizslopState(backend: QuizslopBackend, gameId: Id<"games">) {
  const state = await backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .unique(),
  );
  if (!state) throw new Error("Missing QuizSlop state");
  return state;
}

async function getRoundBySection(
  backend: QuizslopBackend,
  gameId: Id<"games">,
  sectionIndex: number,
) {
  const round = await backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopRounds")
      .withIndex("by_gameId_and_sectionIndex", (index) =>
        index.eq("gameId", gameId).eq("sectionIndex", sectionIndex),
      )
      .unique(),
  );
  if (!round) throw new Error(`Missing section ${sectionIndex}`);
  return round;
}

async function getCurrentRound(backend: QuizslopBackend, gameId: Id<"games">) {
  const state = await getQuizslopState(backend, gameId);
  return getRoundBySection(backend, gameId, state.deckPosition);
}

export async function getParticipants(backend: QuizslopBackend, gameId: Id<"games">) {
  const rows = await backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopParticipants")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(9),
  );
  return rows.toSorted((left, right) => left.seatOrder - right.seatOrder);
}

export async function getParticipant(
  backend: QuizslopBackend,
  gameId: Id<"games">,
  playerId: Id<"players">,
) {
  const row = await backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopParticipants")
      .withIndex("by_gameId_and_playerId", (index) =>
        index.eq("gameId", gameId).eq("playerId", playerId),
      )
      .unique(),
  );
  if (!row) throw new Error("Missing participant");
  return row;
}

export async function getAssignments(backend: QuizslopBackend, gameId: Id<"games">) {
  const round = await getCurrentRound(backend, gameId);
  return backend.run(async (ctx) =>
    ctx.db
      .query("quizSlopAssignments")
      .withIndex("by_roundId_and_candidatePlayerId", (index) => index.eq("roundId", round._id))
      .take(9),
  );
}

async function questionFor(backend: QuizslopBackend, assignment: Doc<"quizSlopAssignments">) {
  const question = await backend.run(async (ctx) =>
    ctx.db.get("quizSlopQuestions", assignment.questionId),
  );
  if (!question) throw new Error("Missing assignment question");
  return question;
}

export async function startQuizslop(backend: QuizslopBackend, host: QuizslopSession) {
  return backend.mutation(api.quizslop.start, { capability: host.capability });
}

export async function hostAdvance(backend: QuizslopBackend, host: QuizslopSession) {
  const game = await getGame(backend, host.gameId);
  return (
    await backend.mutation(api.quizslop.advance, {
      capability: host.capability,
      expectedPhaseGeneration: game.phaseGeneration,
    })
  ).phase;
}

export async function stageViewOf(backend: QuizslopBackend, session: QuizslopSession) {
  return backend.query(api.quizslopViews.stageView, { capability: session.capability });
}

export async function controllerViewOf(backend: QuizslopBackend, session: QuizslopSession) {
  return backend.query(api.quizslopViews.controllerView, { capability: session.capability });
}

async function advanceToPhase(
  backend: QuizslopBackend,
  host: QuizslopSession,
  target: QuizslopPhase,
  maxSteps = 64,
) {
  for (let step = 0; step < maxSteps; step += 1) {
    const view = await stageViewOf(backend, host);
    if (view.phase === target) return view;
    await hostAdvance(backend, host);
  }
  throw new Error(`Game never reached ${target}`);
}

export async function submitScratchAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  correct: boolean,
) {
  const assignment = (await getAssignments(backend, session.gameId)).find(
    (entry) => entry.candidatePlayerId === playerIdOf(session),
  );
  if (!assignment) throw new Error("Missing candidate assignment");
  const question = await questionFor(backend, assignment);
  const selectedIndex = correct ? question.correctIndex : (question.correctIndex + 1) % 4;
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.submitScratch, {
    capability: session.capability,
    selectedIndex,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function submitProxyAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  correct: boolean,
) {
  const assignment = (await getAssignments(backend, session.gameId)).find(
    (entry) => entry.proxyPlayerId === playerIdOf(session) && entry.answerAuthority === "PROXY",
  );
  if (!assignment) throw new Error("Missing direct proxy assignment");
  const question = await questionFor(backend, assignment);
  const selectedIndex = correct ? question.correctIndex : (question.correctIndex + 1) % 4;
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.submitProxyAnswer, {
    capability: session.capability,
    selectedIndex,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function submitGroupAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  correct: boolean,
) {
  const assignment = (await getAssignments(backend, session.gameId)).find(
    (entry) => entry.answerAuthority === "GROUP",
  );
  if (!assignment) throw new Error("Missing group assignment");
  const question = await questionFor(backend, assignment);
  const selectedIndex = correct ? question.correctIndex : (question.correctIndex + 1) % 4;
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.submitGroupAnswer, {
    capability: session.capability,
    selectedIndex,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function submitDefenseAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  assignmentId: Id<"quizSlopAssignments">,
) {
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.submitDefense, {
    capability: session.capability,
    assignmentId,
    text: "The answer sheet and I have agreed to see other people.",
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function castSuspensionVoteAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  targetPlayerId: Id<"players"> | null,
) {
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.castSuspensionVote, {
    capability: session.capability,
    targetPlayerId,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function castFinalAccusationAs(
  backend: QuizslopBackend,
  session: QuizslopSession,
  targetPlayerId: Id<"players">,
) {
  const game = await getGame(backend, session.gameId);
  return backend.mutation(api.quizslop.castFinalAccusation, {
    capability: session.capability,
    targetPlayerId,
    expectedPhaseGeneration: game.phaseGeneration,
  });
}

export async function playSectionToResults(
  backend: QuizslopBackend,
  host: QuizslopSession,
  players: readonly QuizslopSession[],
  options?: {
    scratchCorrect?: (session: QuizslopSession) => boolean;
    proxyCorrect?: (session: QuizslopSession) => boolean;
    submitDefenses?: boolean;
  },
) {
  await advanceToPhase(backend, host, "SCRATCH");
  for (const player of players) {
    await submitScratchAs(backend, player, options?.scratchCorrect?.(player) ?? true);
  }
  await hostAdvance(backend, host);
  const assignments = await getAssignments(backend, host.gameId);
  for (const player of players) {
    if (
      assignments.some(
        (assignment) =>
          assignment.proxyPlayerId === playerIdOf(player) && assignment.answerAuthority === "PROXY",
      )
    ) {
      await submitProxyAs(backend, player, options?.proxyCorrect?.(player) ?? true);
    }
  }
  const group = assignments.find((assignment) => assignment.answerAuthority === "GROUP");
  if (group) {
    const state = await getQuizslopState(backend, host.gameId);
    for (const player of players) {
      if (playerIdOf(player) !== state.suspendedPlayerId) {
        await submitGroupAs(backend, player, true);
      }
    }
  }
  await hostAdvance(backend, host);
  if (options?.submitDefenses) {
    const settled = await getAssignments(backend, host.gameId);
    for (const assignment of settled.filter((entry) => entry.officialCorrect === false)) {
      const candidate = players.find(
        (player) => playerIdOf(player) === assignment.candidatePlayerId,
      );
      if (candidate) await submitDefenseAs(backend, candidate, assignment._id);
      if (assignment.answerAuthority === "PROXY") {
        const proxy = players.find((player) => playerIdOf(player) === assignment.proxyPlayerId);
        if (proxy) await submitDefenseAs(backend, proxy, assignment._id);
      }
    }
  }
  if ((await getQuizslopState(backend, host.gameId)).phase === "ORAL_DEFENSE") {
    await hostAdvance(backend, host);
  }
}

export async function enforceCurrentDeadline(
  backend: QuizslopBackend,
  gameId: Id<"games">,
  setNow: (timestamp: number) => void,
) {
  const game = await getGame(backend, gameId);
  if (game.phaseDeadline === undefined) throw new Error("No phase deadline");
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
) {
  return backend.mutation(internal.quizslop.enforceDeadline, { gameId, ...args });
}

function collectStrings(value: unknown): string[] {
  const output: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node === "string") output.push(node);
    else if (Array.isArray(node)) for (const item of node) visit(item);
    else if (node !== null && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) {
        output.push(key);
        visit(item);
      }
    }
  };
  visit(value);
  return output;
}

export function viewContains(view: unknown, needle: string): boolean {
  return collectStrings(view).some((entry) => entry.includes(needle));
}

export const HIDDEN_TIER_TOKENS = [
  "EASY",
  "MEDIUM",
  "HARD",
  "INSANE",
  "hiddenTier",
  "tierAtAssignment",
] as const;
