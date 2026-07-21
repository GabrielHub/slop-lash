import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireCapability } from "./capabilities";
import {
  getQuizslopState,
  isEligible,
  isQuizslopGame,
  listEligibility,
  listGamePlayers,
  listOnlinePlayerIds,
  listQuizslopParticipants,
  listQuizslopTopics,
  listRoundAssignments,
  listRoundCalls,
  listRoundDisputes,
  listRoundHouseVotes,
  listDisputeVotes,
  listSourcesForQuestion,
  loadAssignmentForPlayer,
  loadQuizslopRoundByOrdinal,
} from "./quizslopData";
import { controllerViewValidator, stageViewValidator } from "./quizslopViewValidators";
import { availableCatalogTopics } from "../src/games/quizslop/catalog";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { computeAwards, rankFinalStandings } from "../src/games/quizslop/scoring";
import { compareDisputeRulingOrder } from "../src/games/quizslop/disputes";
import { stableHash } from "../src/games/quizslop/voice";
import {
  CATALOG_FALLBACK_OFFER_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  QUIZ_CORRECT_POINTS,
} from "../src/games/quizslop/game-constants";
import { QUIZSLOP_VOICE_LINES } from "../src/games/quizslop/config/voice-lines";

/**
 * Separate bounded stage and controller views with strict redaction:
 * - hidden tier is never returned to any player-facing client;
 * - the stage never receives prompts, choices, keys, explanations, or sources
 *   before a group's shared reveal;
 * - during ANSWER a controller receives only its own assigned prompt/choices;
 * - no client ever receives retained support excerpts or verifier output;
 * - Call Slop targets stay private until SLOP_CALL_REVEAL;
 * - future topics and the final slate stay server-only until their reveal.
 */

type ViewCtxData = {
  game: Doc<"games">;
  state: Doc<"quizSlopState">;
  players: Doc<"players">[];
  participants: Doc<"quizSlopParticipants">[];
  round: Doc<"quizSlopRounds"> | null;
  playerNames: Map<Id<"players">, string>;
  onlineSessionPlayerIds: Set<Id<"players">>;
};

const PLAYABLE_PACK_STATUSES = new Set(["CATALOG_READY", "READY", "FALLBACK"]);

async function loadViewData(ctx: QueryCtx, capability: string) {
  const authorized = await requireCapability(ctx, capability);
  if (!isQuizslopGame(authorized.game)) {
    throw new ConvexError("This room is not a QuizSlop game");
  }
  const state = await getQuizslopState(ctx, authorized.game._id);
  const [players, participants, round, onlineSessionPlayerIds] = await Promise.all([
    listGamePlayers(ctx, authorized.game._id),
    listQuizslopParticipants(ctx, authorized.game._id),
    loadQuizslopRoundByOrdinal(ctx, authorized.game._id, state.deckPosition),
    listOnlinePlayerIds(ctx, authorized.game._id),
  ]);
  const data: ViewCtxData = {
    game: authorized.game,
    state,
    players,
    participants,
    round,
    playerNames: new Map(players.map((player) => [player._id, player.name])),
    onlineSessionPlayerIds,
  };
  return { authorized, data };
}

/** True when the viewer is the host session that currently owns the room. */
function isViewerHost(authorized: Awaited<ReturnType<typeof requireCapability>>): boolean {
  return (
    authorized.session.role === "HOST" &&
    authorized.game.hostSessionId === authorized.session._id
  );
}

function publicTopic(topic: Doc<"quizSlopTopics">) {
  return { label: topic.label, scope: topic.scope, category: topic.category };
}

function voiceLinePayload(state: Doc<"quizSlopState">) {
  const line = state.selectedVoiceLineId
    ? QUIZSLOP_VOICE_LINES.find((entry) => entry.id === state.selectedVoiceLineId)
    : undefined;
  return line ? { text: line.text, accessibleLabel: line.accessibleLabel } : null;
}

function scoreboard(data: ViewCtxData) {
  return data.participants.map((participant) => ({
    playerId: participant.playerId,
    name: data.playerNames.get(participant.playerId) ?? "Player",
    seatOrder: participant.seatOrder,
    connected: data.onlineSessionPlayerIds.has(participant.playerId),
    total: participant.total,
    quizSubtotal: participant.quizSubtotal,
    callSubtotal: participant.callSubtotal,
    tokensRemaining: participant.callTokens,
    disputeAvailable: participant.disputeAvailable,
  }));
}

/** Groups revealed so far. Key material only for groups at or before the ordinal. */
async function buildRevealGroups(
  ctx: QueryCtx,
  data: ViewCtxData,
  options: { includeSourceUrls: boolean },
) {
  const round = data.round;
  if (!round || !round.revealQuestionIds) return [];
  const phase = data.state.phase;
  const revealedCount =
    phase === "QUESTION_REVEAL"
      ? Math.min(data.state.revealOrdinal + 1, round.revealQuestionIds.length)
      : phase === "DISPUTE_VOTE" ||
          phase === "ROUND_RESULTS" ||
          phase === "CONTINUITY_GRACE" ||
          phase === "FINAL_RESULTS" ||
          phase === "ABANDONED"
        ? round.revealQuestionIds.length
        : 0;
  if (revealedCount === 0) return [];

  const assignments = await listRoundAssignments(ctx, round._id);
  const systemVoid = new Set(round.systemVoidQuestionIds ?? []);
  const rulingByQuestion = new Map(
    (round.rulings ?? []).map((entry) => [entry.questionId, entry.ruling]),
  );
  return Promise.all(
    round.revealQuestionIds.slice(0, revealedCount).map(async (questionId) => {
      const voided = systemVoid.has(questionId);
      const [question, sourceRows] = await Promise.all([
        voided ? Promise.resolve(null) : ctx.db.get("quizSlopQuestions", questionId),
        voided ? Promise.resolve([]) : listSourcesForQuestion(ctx, questionId),
      ]);
      const sources =
        voided || !question
          ? []
          : sourceRows.map((source) => ({
              title: source.title,
              url: options.includeSourceUrls ? source.url : null,
            }));
      const assigned = assignments.filter((assignment) => assignment.questionId === questionId);
      return {
        questionId,
        systemVoid: voided,
        displayPrompt: question?.displayPrompt ?? null,
        choices: question ? [...question.choices] : null,
        correctIndex: voided ? null : (question?.correctIndex ?? null),
        explanation: voided ? null : (question?.explanation ?? null),
        sources,
        players: assigned.map((assignment) => {
          const selectedIndex =
            assignment.lockedAt !== undefined ? (assignment.selectedIndex ?? null) : null;
          const correct =
            !voided && question !== null && selectedIndex !== null
              ? selectedIndex === question.correctIndex
              : false;
          return {
            playerId: assignment.playerId,
            name: data.playerNames.get(assignment.playerId) ?? "Player",
            selectedIndex,
            correct,
            timedOut: assignment.timedOut === true,
            provisionalQuizDelta: voided ? 0 : correct ? (data.round?.pointValue ?? 0) : 0,
          };
        }),
        ruling: rulingByQuestion.get(questionId) ?? null,
      };
    }),
  );
}

async function buildBallots(ctx: QueryCtx, data: ViewCtxData) {
  const round = data.round;
  if (!round) {
    return {
      ballots: [],
      votesByDispute: new Map<Id<"quizSlopDisputes">, Doc<"quizSlopDisputeVotes">[]>(),
    };
  }
  const disputes = (await listRoundDisputes(ctx, round._id)).toSorted(compareDisputeRulingOrder);
  const entries = await Promise.all(
    disputes.map(async (dispute) => {
      const [question, votes] = await Promise.all([
        ctx.db.get("quizSlopQuestions", dispute.questionId),
        listDisputeVotes(ctx, dispute._id),
      ]);
      return {
        ballot: {
          disputeId: dispute._id,
          questionId: dispute.questionId,
          displayPrompt: question?.displayPrompt ?? "",
          reason: dispute.reason,
          initiatorName: data.playerNames.get(dispute.initiatorId) ?? "Player",
          votesResolved: votes.length,
          votersTotal: dispute.frozenVoterCount ?? 0,
          ruling: dispute.ruling ?? null,
        },
        votes,
      };
    }),
  );
  return {
    ballots: entries.map((entry) => entry.ballot),
    votesByDispute: new Map(entries.map((entry) => [entry.ballot.disputeId, entry.votes] as const)),
  };
}

async function buildTopicPayloads(
  ctx: QueryCtx,
  data: ViewCtxData,
): Promise<{
  currentTopic: ({ topicId: Id<"quizSlopTopics"> } & ReturnType<typeof publicTopic>) | null;
  ownerName: string | null;
  slate: {
    topicId: Id<"quizSlopTopics">;
    label: string;
    scope: string;
    category: Doc<"quizSlopTopics">["category"];
  }[];
}> {
  const round = data.round;
  if (!round) return { currentTopic: null, ownerName: null, slate: [] };
  const phase = data.state.phase;

  // The finalist slate is public only once the final round's vote has opened.
  let slate: {
    topicId: Id<"quizSlopTopics">;
    label: string;
    scope: string;
    category: Doc<"quizSlopTopics">["category"];
  }[] = [];
  if (round.kind === "HOUSE_CHOICE" && (phase === "HOUSE_VOTE" || phase === "HOUSE_VOTE_REVEAL")) {
    const finalistTopics = await Promise.all(
      (round.finalistTopicIds ?? []).map(async (topicId) => ({
        topicId,
        topic: await ctx.db.get("quizSlopTopics", topicId),
      })),
    );
    slate = finalistTopics.flatMap(({ topicId, topic }) =>
      topic ? [{ topicId, ...publicTopic(topic) }] : [],
    );
  }

  // The current round's topic is public from TOPIC_REVEAL onward (for the
  // finale, only after the vote resolved it).
  const topicVisible =
    phase !== "LOBBY_SETUP" && phase !== "HOUSE_VOTE" && round.topicId !== undefined;
  const topic =
    topicVisible && round.topicId ? await ctx.db.get("quizSlopTopics", round.topicId) : null;
  const ownerName =
    topic?.ownerPlayerId !== undefined && topic !== null
      ? (data.playerNames.get(topic.ownerPlayerId) ?? null)
      : null;
  return {
    currentTopic: topic ? { topicId: topic._id, ...publicTopic(topic) } : null,
    ownerName,
    slate,
  };
}

function finalPayload(data: ViewCtxData) {
  const standings = data.participants.map((participant) => ({
    playerId: participant.playerId,
    total: participant.total,
    quizSubtotal: participant.quizSubtotal,
    successfulCalls: participant.successfulCalls,
  }));
  const { ordered, winnerIds } = rankFinalStandings(standings);
  // An abandoned game declares no winner and is never projected as a
  // completed competitive result; only settled scores remain visible.
  const winners = new Set(data.state.outcome === "ABANDONED" ? [] : winnerIds);
  const awards = computeAwards(
    data.participants.map((participant) => ({
      playerId: participant.playerId,
      name: data.playerNames.get(participant.playerId) ?? "Player",
      successfulCalls: participant.successfulCalls,
      incorrectCalls: participant.incorrectCalls,
      correctAnswers: participant.correctAnswers,
    })),
  );
  return {
    standings: ordered.map((entry) => ({
      playerId: entry.playerId,
      name: data.playerNames.get(entry.playerId) ?? "Player",
      total: entry.total,
      quizSubtotal: entry.quizSubtotal,
      successfulCalls: entry.successfulCalls,
      winner: winners.has(entry.playerId),
    })),
    awards: awards.map((award) => ({
      kind: award.kind,
      recipients: [...award.recipients],
      stat: award.stat,
    })),
  };
}

async function buildRoundDeltas(ctx: QueryCtx, data: ViewCtxData) {
  const round = data.round;
  if (!round || round.settledAt === undefined) {
    return { deltas: [], settledCalls: [] };
  }
  const [assignments, calls] = await Promise.all([
    listRoundAssignments(ctx, round._id),
    listRoundCalls(ctx, round._id),
  ]);
  const deltaByPlayer = new Map<Id<"players">, { quizDelta: number; callDelta: number }>();
  for (const assignment of assignments) {
    const entry = deltaByPlayer.get(assignment.playerId) ?? { quizDelta: 0, callDelta: 0 };
    entry.quizDelta += assignment.quizDelta ?? 0;
    deltaByPlayer.set(assignment.playerId, entry);
  }
  const settledCalls = [];
  for (const call of calls) {
    if (call.targetId === undefined || call.outcome === undefined) continue;
    const entry = deltaByPlayer.get(call.callerId) ?? { quizDelta: 0, callDelta: 0 };
    entry.callDelta += call.callDelta ?? 0;
    deltaByPlayer.set(call.callerId, entry);
    settledCalls.push({
      callerName: data.playerNames.get(call.callerId) ?? "Player",
      targetName: data.playerNames.get(call.targetId) ?? "Player",
      outcome: call.outcome,
      callDelta: call.callDelta ?? 0,
    });
  }
  return {
    deltas: [...deltaByPlayer.entries()].map(([playerId, entry]) => ({
      playerId,
      name: data.playerNames.get(playerId) ?? "Player",
      quizDelta: entry.quizDelta,
      callDelta: entry.callDelta,
    })),
    settledCalls,
  };
}

function lobbyStatuses(data: ViewCtxData, topics: Doc<"quizSlopTopics">[]) {
  const topicByOwner = new Map<Id<"players">, Doc<"quizSlopTopics">>();
  for (const topic of topics) {
    if (topic.ownerPlayerId) topicByOwner.set(topic.ownerPlayerId, topic);
  }
  const players = data.players.filter(
    (player) => isActiveCompetitor(player) && player.type === "HUMAN",
  );
  return players.map((player) => {
    const topic = topicByOwner.get(player._id);
    return {
      playerId: player._id,
      name: player.name,
      connected: data.onlineSessionPlayerIds.has(player._id),
      state: topic?.setupState ?? ("NEEDS_TOPIC" as const),
    };
  });
}

function connectedRosterReady(statuses: ReturnType<typeof lobbyStatuses>): boolean {
  const connected = statuses.filter((entry) => entry.connected);
  return (
    connected.length >= MIN_PLAYERS &&
    connected.length <= MAX_PLAYERS &&
    connected.every((entry) => entry.state === "READY")
  );
}

export const stageView = query({
  args: { capability: v.string() },
  returns: stageViewValidator,
  handler: async (ctx, args) => {
    const { authorized, data } = await loadViewData(ctx, args.capability);
    const phase = data.state.phase;
    const round = data.round;
    const topics = await buildTopicPayloads(ctx, data);

    let lobby = null;
    if (phase === "LOBBY_SETUP") {
      const statuses = lobbyStatuses(data, await listQuizslopTopics(ctx, data.game._id));
      lobby = {
        packStatus: data.state.packStatus,
        statuses,
        canStart:
          PLAYABLE_PACK_STATUSES.has(data.state.packStatus) && connectedRosterReady(statuses),
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
      };
    }

    let houseVote = null;
    if (round && (phase === "HOUSE_VOTE" || phase === "HOUSE_VOTE_REVEAL")) {
      const [eligibility, votes] = await Promise.all([
        listEligibility(ctx, round._id, "HOUSE_VOTE"),
        listRoundHouseVotes(ctx, round._id),
      ]);
      houseVote = {
        resolvedCount: votes.length,
        eligibleCount: eligibility.length,
        // Counts appear only after closure.
        voteCounts:
          phase === "HOUSE_VOTE_REVEAL"
            ? (round.finalistTopicIds ?? []).map((topicId) => ({
                topicId,
                votes: votes.filter((vote) => vote.topicId === topicId).length,
              }))
            : null,
      };
    }

    let callProgress = null;
    let callReveal = null;
    if (round && phase === "SLOP_CALL") {
      const [eligibility, calls] = await Promise.all([
        listEligibility(ctx, round._id, "CALL"),
        listRoundCalls(ctx, round._id),
      ]);
      callProgress = { resolvedCount: calls.length, eligibleCount: eligibility.length };
    }
    if (round && phase === "SLOP_CALL_REVEAL") {
      const calls = await listRoundCalls(ctx, round._id);
      callReveal = calls
        .filter(
          (call): call is typeof call & { targetId: Id<"players"> } => call.targetId !== undefined,
        )
        .map((call) => ({
          callerId: call.callerId,
          callerName: data.playerNames.get(call.callerId) ?? "Player",
          targetId: call.targetId,
          targetName: data.playerNames.get(call.targetId) ?? "Player",
        }));
    }

    let answerProgress = null;
    if (round && phase === "ANSWER") {
      const assignments = await listRoundAssignments(ctx, round._id);
      answerProgress = {
        lockedCount: assignments.filter((assignment) => assignment.lockedAt !== undefined).length,
        assignedCount: assignments.length,
      };
    }

    const [revealGroups, ballotData, roundResults] = await Promise.all([
      // The stage shows source labels, never links.
      buildRevealGroups(ctx, data, { includeSourceUrls: false }),
      phase === "QUESTION_REVEAL" ||
      phase === "DISPUTE_VOTE" ||
      phase === "ROUND_RESULTS" ||
      phase === "CONTINUITY_GRACE"
        ? buildBallots(ctx, data)
        : Promise.resolve({ ballots: [] }),
      buildRoundDeltas(ctx, data),
    ]);
    const ballots = ballotData.ballots;
    const { deltas, settledCalls } = roundResults;

    return {
      id: data.game._id,
      roomCode: data.game.roomCode,
      phase,
      version: data.game.phaseGeneration,
      phaseDeadline: data.game.phaseDeadline
        ? new Date(data.game.phaseDeadline).toISOString()
        : null,
      serverNow: new Date().toISOString(),
      timersDisabled: data.game.timersDisabled,
      currentRound: data.game.currentRound,
      totalRounds: data.game.totalRounds,
      roundKind: round?.kind ?? null,
      pointValue: round?.pointValue ?? QUIZ_CORRECT_POINTS,
      me: {
        isHost: isViewerHost(authorized),
        playerId: authorized.player?._id ?? null,
        sessionId: authorized.session._id,
      },
      voiceLine: voiceLinePayload(data.state),
      scoreboard: scoreboard(data),
      lobby,
      currentTopic: topics.currentTopic,
      topicOwnerName: topics.ownerName,
      slate: topics.slate,
      houseVote,
      callProgress,
      callReveal,
      answerProgress,
      revealGroups,
      revealOrdinal: data.state.revealOrdinal,
      revealTotal:
        phase === "DISPUTE_VOTE" ? ballots.length : (round?.revealQuestionIds?.length ?? 0),
      ballots,
      roundDeltas: phase === "ROUND_RESULTS" || phase === "CONTINUITY_GRACE" ? deltas : [],
      settledCalls: phase === "ROUND_RESULTS" || phase === "CONTINUITY_GRACE" ? settledCalls : [],
      final: phase === "FINAL_RESULTS" || phase === "ABANDONED" ? finalPayload(data) : null,
    };
  },
});

export const controllerView = query({
  args: { capability: v.string() },
  returns: controllerViewValidator,
  handler: async (ctx, args) => {
    const { authorized, data } = await loadViewData(ctx, args.capability);
    const phase = data.state.phase;
    const round = data.round;
    const me = authorized.player;
    const participant = me
      ? (data.participants.find((entry) => entry.playerId === me._id) ?? null)
      : null;
    const topics = await buildTopicPayloads(ctx, data);

    let lobby = null;
    if (phase === "LOBBY_SETUP" && me) {
      const allTopics = await listQuizslopTopics(ctx, data.game._id);
      const myTopic = allTopics.find((topic) => topic.ownerPlayerId === me._id) ?? null;
      const activePlayerIds = new Set(
        data.players.filter(isActiveCompetitor).map((player) => player._id),
      );
      const claimedKeys = new Set<string>();
      const claimedIds = new Set<string>();
      for (const topic of allTopics) {
        if (
          topic.ownerPlayerId !== undefined &&
          topic.ownerPlayerId !== me._id &&
          activePlayerIds.has(topic.ownerPlayerId)
        ) {
          claimedKeys.add(topic.canonicalKey);
          if (topic.catalogTopicId) claimedIds.add(topic.catalogTopicId);
        }
      }
      const packReady = PLAYABLE_PACK_STATUSES.has(data.state.packStatus);
      const available = packReady
        ? data.state.contentSource === "AI"
          ? allTopics
              .filter(
                (topic) =>
                  topic.catalogTopicId !== undefined &&
                  (topic.ownerPlayerId === undefined || topic.ownerPlayerId === me._id),
              )
              .map((topic) => ({
                id: topic.catalogTopicId!,
                label: topic.label,
                scope: topic.scope,
                category: topic.category,
              }))
          : availableCatalogTopics({
              canonicalKeys: claimedKeys,
              catalogTopicIds: claimedIds,
            })
        : [];
      // Deterministic rotation of three offers; a lost claim changes the
      // claimed count, which reactively rotates the offers.
      const seed = stableHash(`${data.game._id}:${me._id}:${claimedKeys.size}`);
      const offers = available
        .map((topic, index) => ({ topic, order: stableHash(`${seed}:${index}:${topic.id}`) }))
        .toSorted(
          (left, right) => left.order - right.order || left.topic.id.localeCompare(right.topic.id),
        )
        .slice(0, CATALOG_FALLBACK_OFFER_SIZE)
        .map((entry) => ({
          catalogTopicId: entry.topic.id,
          label: entry.topic.label,
          scope: entry.topic.scope,
          category: entry.topic.category,
        }));
      const statuses = lobbyStatuses(data, allTopics);
      const everyoneReady = connectedRosterReady(statuses);
      lobby = {
        packStatus: data.state.packStatus,
        myTopicState: myTopic?.setupState ?? ("NEEDS_TOPIC" as const),
        myTopic: myTopic ? publicTopic(myTopic) : null,
        myCatalogTopicId: myTopic?.catalogTopicId ?? null,
        offers,
        everyoneReady,
        canStart: everyoneReady && packReady && isViewerHost(authorized),
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
      };
    }

    let houseVote = null;
    if (round && phase === "HOUSE_VOTE" && me) {
      const [eligible, votes] = await Promise.all([
        isEligible(ctx, round._id, "HOUSE_VOTE", me._id),
        listRoundHouseVotes(ctx, round._id),
      ]);
      const myVote = votes.find((vote) => vote.playerId === me._id);
      houseVote = { eligible, myVoteTopicId: myVote?.topicId ?? null };
    }

    let call = null;
    if (round && phase === "SLOP_CALL" && me) {
      const [eligible, eligibility, calls] = await Promise.all([
        isEligible(ctx, round._id, "CALL", me._id),
        listEligibility(ctx, round._id, "CALL"),
        listRoundCalls(ctx, round._id),
      ]);
      const myCall = calls.find((entry) => entry.callerId === me._id);
      call = {
        eligible,
        targets: eligibility
          .filter((entry) => entry.playerId !== me._id)
          .map((entry) => ({
            playerId: entry.playerId,
            name: data.playerNames.get(entry.playerId) ?? "Player",
          })),
        resolved: myCall !== undefined,
        myTargetId: myCall?.targetId ?? null,
        held: myCall !== undefined && myCall.targetId === undefined,
      };
    }

    let answer = null;
    if (round && phase === "ANSWER" && me) {
      const assignment = await loadAssignmentForPlayer(ctx, round._id, me._id);
      if (assignment) {
        // Only this player's own frozen prompt and choices; never the key.
        const question = await ctx.db.get("quizSlopQuestions", assignment.questionId);
        answer = {
          assigned: true,
          displayPrompt: question?.displayPrompt ?? null,
          choices: question ? [...question.choices] : null,
          selectedIndex: assignment.selectedIndex ?? null,
          locked: assignment.lockedAt !== undefined,
        };
      } else {
        answer = {
          assigned: false,
          displayPrompt: null,
          choices: null,
          selectedIndex: null,
          locked: false,
        };
      }
    }

    const [revealGroups, ballotData, roundResults] = await Promise.all([
      // Controllers get source links after reveal.
      buildRevealGroups(ctx, data, { includeSourceUrls: true }),
      phase === "QUESTION_REVEAL" || phase === "DISPUTE_VOTE" || phase === "ROUND_RESULTS"
        ? buildBallots(ctx, data)
        : Promise.resolve({
            ballots: [],
            votesByDispute: new Map<Id<"quizSlopDisputes">, Doc<"quizSlopDisputeVotes">[]>(),
          }),
      buildRoundDeltas(ctx, data),
    ]);
    const ballots = ballotData.ballots;

    let dispute = null;
    if (round && phase === "QUESTION_REVEAL" && me) {
      const eligible = await isEligible(ctx, round._id, "DISPUTE_WINDOW", me._id);
      const systemVoid = new Set(round.systemVoidQuestionIds ?? []);
      const challenged = new Set(ballots.map((ballot) => ballot.questionId));
      const revealedQuestionIds = (round.revealQuestionIds ?? []).slice(
        0,
        data.state.revealOrdinal + 1,
      );
      const challengeableQuestionIds = revealedQuestionIds.filter(
        (questionId) => !systemVoid.has(questionId) && !challenged.has(questionId),
      );
      dispute = {
        canInitiate:
          eligible &&
          (participant?.disputeAvailable ?? false) &&
          challengeableQuestionIds.length > 0,
        challengeableQuestionIds,
      };
    }

    let disputeVoteEligible = false;
    const myDisputeVotes: { disputeId: Id<"quizSlopDisputes">; choice: "UPHOLD" | "VOID" }[] = [];
    if (round && phase === "DISPUTE_VOTE" && me) {
      disputeVoteEligible = await isEligible(ctx, round._id, "DISPUTE_VOTE", me._id);
      for (const ballot of ballots) {
        const votes = ballotData.votesByDispute.get(ballot.disputeId) ?? [];
        const mine = votes.find((vote) => vote.voterId === me._id);
        if (mine) myDisputeVotes.push({ disputeId: ballot.disputeId, choice: mine.choice });
      }
    }

    const { deltas, settledCalls } = roundResults;

    return {
      id: data.game._id,
      roomCode: data.game.roomCode,
      phase,
      version: data.game.phaseGeneration,
      phaseDeadline: data.game.phaseDeadline
        ? new Date(data.game.phaseDeadline).toISOString()
        : null,
      serverNow: new Date().toISOString(),
      timersDisabled: data.game.timersDisabled,
      currentRound: data.game.currentRound,
      totalRounds: data.game.totalRounds,
      roundKind: round?.kind ?? null,
      pointValue: round?.pointValue ?? QUIZ_CORRECT_POINTS,
      me: {
        isHost: isViewerHost(authorized),
        playerId: me?._id ?? null,
        name: me?.name ?? null,
        isParticipant: participant !== null,
        tokensRemaining: participant?.callTokens ?? 0,
        disputeAvailable: participant?.disputeAvailable ?? false,
        total: participant?.total ?? 0,
        quizSubtotal: participant?.quizSubtotal ?? 0,
        callSubtotal: participant?.callSubtotal ?? 0,
      },
      voiceLine: voiceLinePayload(data.state),
      scoreboard: scoreboard(data),
      lobby,
      currentTopic: topics.currentTopic,
      topicOwnerName: topics.ownerName,
      slate: topics.slate,
      houseVote,
      call,
      answer,
      revealGroups,
      revealOrdinal: data.state.revealOrdinal,
      revealTotal:
        phase === "DISPUTE_VOTE" ? ballots.length : (round?.revealQuestionIds?.length ?? 0),
      dispute,
      ballots,
      disputeVoteEligible,
      myDisputeVotes,
      roundDeltas: phase === "ROUND_RESULTS" ? deltas : [],
      settledCalls: phase === "ROUND_RESULTS" ? settledCalls : [],
      final: phase === "FINAL_RESULTS" || phase === "ABANDONED" ? finalPayload(data) : null,
    };
  },
});
