import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireCapability } from "./capabilities";
import {
  getQuizslopState,
  isQuizslopGame,
  listAccusations,
  listAssignmentDefenses,
  listGamePlayers,
  listGroupAnswers,
  listOnlinePlayerIds,
  listQuizslopParticipants,
  listRoundAssignments,
  listSuspensionVotes,
  loadQuizslopRoundBySection,
} from "./quizslopData";
import { requiredDefensePlayers } from "./quizslopGameplay";
import { controllerViewValidator, stageViewValidator } from "./quizslopViewValidators";
import { getAiModel } from "./modelCatalog";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { MAX_PLAYERS, MIN_PLAYERS, PASS_PERCENT } from "../src/games/quizslop/game-constants";

const PLAYABLE_PACK_STATUSES = new Set(["CATALOG_READY", "READY", "FALLBACK"]);
const RECEIPT_PHASES = new Set([
  "ORAL_DEFENSE",
  "SECTION_RESULTS",
  "PROCTOR_REVIEW_VOTE",
  "PROCTOR_REVIEW_RESULT",
  "FINAL_ACCUSATION",
  "FINAL_RESULTS",
]);

type ViewData = {
  game: Doc<"games">;
  state: Doc<"quizSlopState">;
  players: Doc<"players">[];
  participants: Doc<"quizSlopParticipants">[];
  assignments: Doc<"quizSlopAssignments">[];
  contentByAssignment: Map<Id<"quizSlopAssignments">, AssignmentContent>;
  defensesByAssignment: Map<Id<"quizSlopAssignments">, Doc<"quizSlopDefenses">[]>;
  playerNames: Map<Id<"players">, string>;
  onlinePlayerIds: Set<Id<"players">>;
};

type AssignmentContent = {
  candidate: ReturnType<typeof playerRefFromNames>;
  proxy: ReturnType<typeof playerRefFromNames>;
  topic: { label: string };
  displayPrompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

async function loadViewData(ctx: QueryCtx, capability: string) {
  const authorized = await requireCapability(ctx, capability);
  if (!isQuizslopGame(authorized.game)) throw new ConvexError("This room is not QuizSlop");
  const state = await getQuizslopState(ctx, authorized.game._id);
  const [players, participants, round, onlinePlayerIds] = await Promise.all([
    listGamePlayers(ctx, authorized.game._id),
    listQuizslopParticipants(ctx, authorized.game._id),
    loadQuizslopRoundBySection(ctx, authorized.game._id, state.deckPosition),
    listOnlinePlayerIds(ctx, authorized.game._id),
  ]);
  const assignmentRows = round ? await listRoundAssignments(ctx, round._id) : [];
  const seatByPlayer = new Map(
    participants.map((participant) => [participant.playerId, participant.seatOrder]),
  );
  const assignments = assignmentRows.toSorted(
    (left, right) =>
      (seatByPlayer.get(left.candidatePlayerId) ?? Number.MAX_SAFE_INTEGER) -
      (seatByPlayer.get(right.candidatePlayerId) ?? Number.MAX_SAFE_INTEGER),
  );
  const playerNames = new Map(players.map((player) => [player._id, player.name]));
  const contentEntries = await Promise.all(
    assignments.map(
      async (assignment) =>
        [
          assignment._id,
          await loadAssignmentContent(ctx, authorized.game._id, playerNames, assignment),
        ] as const,
    ),
  );
  const defenseEntries = RECEIPT_PHASES.has(state.phase)
    ? await Promise.all(
        assignments.map(
          async (assignment) =>
            [assignment._id, await listAssignmentDefenses(ctx, assignment._id)] as const,
        ),
      )
    : [];
  return {
    authorized,
    data: {
      game: authorized.game,
      state,
      players,
      participants,
      assignments,
      contentByAssignment: new Map(contentEntries),
      defensesByAssignment: new Map(defenseEntries),
      playerNames,
      onlinePlayerIds,
    } satisfies ViewData,
  };
}

function playerRefFromNames(playerNames: Map<Id<"players">, string>, playerId: Id<"players">) {
  return { playerId, name: playerNames.get(playerId) ?? "Candidate" };
}

function playerRef(data: ViewData, playerId: Id<"players">) {
  return playerRefFromNames(data.playerNames, playerId);
}

async function loadAssignmentContent(
  ctx: QueryCtx,
  gameId: Id<"games">,
  playerNames: Map<Id<"players">, string>,
  assignment: Doc<"quizSlopAssignments">,
): Promise<AssignmentContent> {
  const [topic, question] = await Promise.all([
    ctx.db.get("quizSlopTopics", assignment.topicId),
    ctx.db.get("quizSlopQuestions", assignment.questionId),
  ]);
  if (
    assignment.gameId !== gameId ||
    !topic ||
    !question ||
    topic.gameId !== gameId ||
    question.gameId !== gameId ||
    question.topicId !== topic._id
  ) {
    throw new ConvexError("Frozen QuizSlop assignment content is missing");
  }
  return {
    candidate: playerRefFromNames(playerNames, assignment.candidatePlayerId),
    proxy: playerRefFromNames(playerNames, assignment.proxyPlayerId),
    topic: { label: topic.label },
    displayPrompt: question.displayPrompt,
    choices: [...question.choices],
    correctIndex: question.correctIndex,
    explanation: question.explanation,
  };
}

function assignmentContent(data: ViewData, assignment: Doc<"quizSlopAssignments">) {
  const content = data.contentByAssignment.get(assignment._id);
  if (!content) throw new ConvexError("Frozen QuizSlop assignment content is missing");
  return content;
}

function assignmentDefenses(data: ViewData, assignmentId: Id<"quizSlopAssignments">) {
  return data.defensesByAssignment.get(assignmentId) ?? [];
}

function pairings(data: ViewData) {
  return data.assignments.map((assignment) => {
    const content = assignmentContent(data, assignment);
    return {
      assignmentId: assignment._id,
      candidate: content.candidate,
      proxy: content.proxy,
      authority: assignment.answerAuthority,
      topic: content.topic,
      scratchLocked: assignment.scratchLockedAt !== undefined,
      officialLocked: assignment.officialLockedAt !== undefined,
    };
  });
}

function receipts(data: ViewData) {
  if (!RECEIPT_PHASES.has(data.state.phase)) return [];
  return data.assignments.map((assignment) => {
    const content = assignmentContent(data, assignment);
    const defenseRows = assignmentDefenses(data, assignment._id);
    return {
      assignmentId: assignment._id,
      candidate: content.candidate,
      proxy: content.proxy,
      authority: assignment.answerAuthority,
      topic: content.topic,
      displayPrompt: content.displayPrompt,
      choices: content.choices,
      scratchSelectedIndex: assignment.scratchSelectedIndex ?? null,
      officialSelectedIndex: assignment.officialSelectedIndex ?? null,
      correctIndex: content.correctIndex,
      scratchCorrect: assignment.scratchCorrect === true,
      officialCorrect: assignment.officialCorrect === true,
      explanation: content.explanation,
      defenses: defenseRows.map((defense) => ({
        player: playerRef(data, defense.playerId),
        kind: defense.kind,
        text: defense.text,
      })),
    };
  });
}

async function submissionProgress(ctx: QueryCtx, data: ViewData) {
  if (data.state.phase === "SCRATCH") {
    return {
      resolved: data.assignments.filter((assignment) => assignment.scratchLockedAt !== undefined)
        .length,
      total: data.assignments.length,
    };
  }
  if (data.state.phase === "PROXY_ANSWER") {
    const direct = data.assignments.filter((assignment) => assignment.answerAuthority === "PROXY");
    const group = data.assignments.find((assignment) => assignment.answerAuthority === "GROUP");
    const ballots = group ? await listGroupAnswers(ctx, group._id) : [];
    return {
      resolved:
        direct.filter((assignment) => assignment.officialLockedAt !== undefined).length +
        ballots.length,
      total: direct.length + (group ? Math.max(0, data.participants.length - 1) : 0),
    };
  }
  if (data.state.phase === "ORAL_DEFENSE") {
    const required = requiredDefensePlayers(data.assignments);
    const resolved = required.filter((entry) =>
      assignmentDefenses(data, entry.assignmentId).some(
        (defense) => defense.playerId === entry.playerId,
      ),
    ).length;
    return { resolved, total: required.length };
  }
  if (data.state.phase === "PROCTOR_REVIEW_VOTE") {
    return {
      resolved: (await listSuspensionVotes(ctx, data.game._id)).length,
      total: data.participants.length,
    };
  }
  if (data.state.phase === "FINAL_ACCUSATION") {
    return {
      resolved: (await listAccusations(ctx, data.game._id)).length,
      total: data.participants.length,
    };
  }
  return null;
}

function roster(data: ViewData) {
  if (data.participants.length > 0) {
    return data.participants.map((participant) => ({
      playerId: participant.playerId,
      name: data.playerNames.get(participant.playerId) ?? "Candidate",
      seatOrder: participant.seatOrder,
      connected: data.onlinePlayerIds.has(participant.playerId),
      suspendedThisSection:
        data.state.suspensionAppliedSection === data.state.deckPosition &&
        data.state.suspendedPlayerId === participant.playerId,
    }));
  }
  return data.players
    .filter((player) => player.type === "HUMAN" && isActiveCompetitor(player))
    .toSorted((left, right) => left.joinedAt - right.joinedAt || left._id.localeCompare(right._id))
    .map((player, seatOrder) => ({
      playerId: player._id,
      name: player.name,
      seatOrder,
      connected: data.onlinePlayerIds.has(player._id),
      suspendedThisSection: false,
    }));
}

function finalPayload(data: ViewData) {
  if (data.state.phase !== "FINAL_RESULTS") return null;
  const saboteur = data.participants.find((participant) => participant.role === "SABOTEUR");
  if (
    !saboteur ||
    data.state.adjustedCorrect === undefined ||
    data.state.gradePercent === undefined ||
    data.state.passed === undefined ||
    data.state.saboteurIdentified === undefined
  ) {
    throw new ConvexError("QuizSlop final result is incomplete");
  }
  return {
    rawCorrect: data.state.rawCorrect,
    sabotagePoints: data.state.sabotagePoints,
    adjustedCorrect: data.state.adjustedCorrect,
    passed: data.state.passed,
    saboteur: playerRef(data, saboteur.playerId),
    saboteurIdentified: data.state.saboteurIdentified,
  };
}

async function commonPayload(ctx: QueryCtx, data: ViewData) {
  const model = data.state.generatorModelId ? getAiModel(data.state.generatorModelId) : null;
  const pairingRows = pairings(data);
  const receiptRows = receipts(data);
  const [progress, reviewVotes] = await Promise.all([
    submissionProgress(ctx, data),
    data.state.phase === "PROCTOR_REVIEW_RESULT"
      ? listSuspensionVotes(ctx, data.game._id)
      : Promise.resolve([]),
  ]);
  return {
    roomCode: data.game.roomCode,
    phase: data.state.phase,
    version: data.game.phaseGeneration,
    phaseDeadline: data.game.phaseDeadline ? new Date(data.game.phaseDeadline).toISOString() : null,
    serverNow: new Date().toISOString(),
    timersDisabled: data.game.timersDisabled,
    sectionNumber: data.game.currentRound,
    totalSections: data.state.sectionCount ?? data.game.totalRounds,
    passPercent: PASS_PERCENT,
    content: {
      source: data.state.contentSource,
      packStatus: data.state.packStatus,
      generatorModelName: model?.name ?? null,
    },
    teamScore: {
      rawCorrect: data.state.rawCorrect,
      attempted: data.state.attempted,
      totalQuestions: data.participants.length * (data.state.sectionCount ?? data.game.totalRounds),
      integrityAdjustmentSealed: data.state.phase !== "FINAL_RESULTS",
    },
    roster: roster(data),
    pairings: pairingRows,
    receipts: receiptRows,
    submissionProgress: progress,
    reviewResult:
      data.state.phase === "PROCTOR_REVIEW_RESULT"
        ? {
            suspendedPlayer: data.state.suspendedPlayerId
              ? playerRef(data, data.state.suspendedPlayerId)
              : null,
            votesCast: reviewVotes.length,
            votersTotal: data.participants.length,
          }
        : null,
    final: finalPayload(data),
  };
}

function lobbyPayload(data: ViewData) {
  if (data.state.phase !== "LOBBY_SETUP") return null;
  const connectedPlayers = data.players.filter(
    (player) =>
      player.type === "HUMAN" && isActiveCompetitor(player) && data.onlinePlayerIds.has(player._id),
  ).length;
  return {
    canStart:
      connectedPlayers >= MIN_PLAYERS &&
      connectedPlayers <= MAX_PLAYERS &&
      PLAYABLE_PACK_STATUSES.has(data.state.packStatus),
  };
}

function isAuthorizedHost(
  data: ViewData,
  session: Doc<"playerSessions">,
  player: Doc<"players"> | null,
): boolean {
  return (
    session.role === "HOST" &&
    data.game.hostSessionId === session._id &&
    (player === null || data.game.hostPlayerId === player._id)
  );
}

function privateAssignment(
  data: ViewData,
  assignment: Doc<"quizSlopAssignments"> | undefined,
  selection: number | undefined,
  lockedAt: number | undefined,
) {
  if (!assignment) return null;
  const content = assignmentContent(data, assignment);
  return {
    assignmentId: assignment._id,
    candidate: content.candidate,
    topic: content.topic,
    displayPrompt: content.displayPrompt,
    choices: content.choices,
    selectedIndex: selection ?? null,
    locked: lockedAt !== undefined,
  };
}

async function controllerPrivatePayload(
  ctx: QueryCtx,
  data: ViewData,
  playerId: Id<"players"> | null,
) {
  if (!playerId || !data.participants.some((participant) => participant.playerId === playerId)) {
    return {
      candidateAssignment: null,
      proxyAssignment: null,
      groupVoteAssignment: null,
      defenses: [],
      suspensionVote: null,
      finalAccusation: null,
    };
  }
  const candidate = data.assignments.find(
    (assignment) => assignment.candidatePlayerId === playerId,
  );
  const proxy = data.assignments.find(
    (assignment) => assignment.proxyPlayerId === playerId && assignment.answerAuthority === "PROXY",
  );
  const group = data.assignments.find((assignment) => assignment.answerAuthority === "GROUP");
  const canGroupVote =
    group !== undefined &&
    data.state.suspendedPlayerId !== playerId &&
    data.state.phase === "PROXY_ANSWER";
  const groupBallot = canGroupVote
    ? await ctx.db
        .query("quizSlopGroupAnswers")
        .withIndex("by_assignmentId_and_voterId", (index) =>
          index.eq("assignmentId", group._id).eq("voterId", playerId),
        )
        .unique()
    : null;

  const defenses = [];
  if (data.state.phase === "ORAL_DEFENSE") {
    for (const assignment of data.assignments) {
      if (assignment.officialCorrect !== false) continue;
      const kind =
        assignment.candidatePlayerId === playerId
          ? ("CANDIDATE" as const)
          : assignment.answerAuthority === "PROXY" && assignment.proxyPlayerId === playerId
            ? ("PROXY" as const)
            : null;
      if (!kind) continue;
      const content = assignmentContent(data, assignment);
      const defenseRows = assignmentDefenses(data, assignment._id);
      const mine = defenseRows.find((defense) => defense.playerId === playerId);
      defenses.push({
        assignmentId: assignment._id,
        kind,
        candidate: content.candidate,
        proxy: content.proxy,
        displayPrompt: content.displayPrompt,
        submittedText: mine?.text ?? null,
        locked: mine !== undefined,
      });
    }
  }

  const suspensionRow =
    data.state.phase === "PROCTOR_REVIEW_VOTE"
      ? await ctx.db
          .query("quizSlopSuspensionVotes")
          .withIndex("by_gameId_and_playerId", (index) =>
            index.eq("gameId", data.game._id).eq("playerId", playerId),
          )
          .unique()
      : null;
  const accusationRow =
    data.state.phase === "FINAL_ACCUSATION"
      ? await ctx.db
          .query("quizSlopAccusations")
          .withIndex("by_gameId_and_playerId", (index) =>
            index.eq("gameId", data.game._id).eq("playerId", playerId),
          )
          .unique()
      : null;
  const targets = data.participants.map((participant) => playerRef(data, participant.playerId));

  return {
    candidateAssignment:
      data.state.phase === "SCRATCH" || data.state.phase === "PROXY_ANSWER"
        ? privateAssignment(
            data,
            candidate,
            candidate?.scratchSelectedIndex,
            candidate?.scratchLockedAt,
          )
        : null,
    proxyAssignment:
      data.state.phase === "PROXY_ANSWER"
        ? privateAssignment(data, proxy, proxy?.officialSelectedIndex, proxy?.officialLockedAt)
        : null,
    groupVoteAssignment: canGroupVote
      ? privateAssignment(data, group, groupBallot?.selectedIndex, groupBallot?.lockedAt)
      : null,
    defenses,
    suspensionVote:
      data.state.phase === "PROCTOR_REVIEW_VOTE"
        ? {
            targets,
            selectedTargetId: suspensionRow?.targetPlayerId ?? null,
            abstained: suspensionRow !== null && suspensionRow.targetPlayerId === undefined,
            locked: suspensionRow !== null,
          }
        : null,
    finalAccusation:
      data.state.phase === "FINAL_ACCUSATION"
        ? {
            targets,
            selectedTargetId: accusationRow?.targetPlayerId ?? null,
            locked: accusationRow !== null,
          }
        : null,
  };
}

export const stageView = query({
  args: { capability: v.string() },
  returns: stageViewValidator,
  handler: async (ctx, args) => {
    const { authorized, data } = await loadViewData(ctx, args.capability);
    return {
      ...(await commonPayload(ctx, data)),
      me: {
        isHost: isAuthorizedHost(data, authorized.session, authorized.player),
        playerId: authorized.player?._id ?? null,
      },
      lobby: lobbyPayload(data),
    };
  },
});

export const controllerView = query({
  args: { capability: v.string() },
  returns: controllerViewValidator,
  handler: async (ctx, args) => {
    const { authorized, data } = await loadViewData(ctx, args.capability);
    const participant = authorized.player
      ? data.participants.find((entry) => entry.playerId === authorized.player?._id)
      : undefined;
    return {
      ...(await commonPayload(ctx, data)),
      me: {
        isHost: isAuthorizedHost(data, authorized.session, authorized.player),
        playerId: authorized.player?._id ?? null,
        name: authorized.player?.name ?? null,
        role: participant?.role ?? null,
      },
      lobby: lobbyPayload(data),
      ...(await controllerPrivatePayload(ctx, data, authorized.player?._id ?? null)),
    };
  },
});
