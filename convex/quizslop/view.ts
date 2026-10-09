import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { loadActivePlayers } from "../roster";
import {
  callsOpen,
  catalogQuestion,
  catalogTopic,
  loadAnswers,
  loadCalls,
  loadDeckRound,
  loadHouseVotes,
  loadSeats,
  type QuizslopPhase,
} from "./mode";
import { availableCatalogTopics } from "../../src/games/quizslop/catalog";
import { getVoiceLinesForTag } from "../../src/games/quizslop/config/voice-lines";
import { finalResults, quizPointsForRound } from "../../src/games/quizslop/scoring";
import type { QuizslopCatalogTopic, QuizslopVoiceEventTag } from "../../src/games/quizslop/types";
import { pickStable } from "../../src/games/quizslop/voice";

type RoundKind = Doc<"quizSlopRounds">["kind"];

function publicTopic(topic: QuizslopCatalogTopic) {
  return { id: topic.id, label: topic.label, scope: topic.scope, category: topic.category };
}

function voiceTag(phase: QuizslopPhase | "LOBBY" | "FINAL", kind: RoundKind | undefined) {
  const tags: Record<QuizslopPhase | "LOBBY" | "FINAL", QuizslopVoiceEventTag> = {
    LOBBY: "LOBBY_SETUP",
    TOPIC:
      kind === "HOME_TURF"
        ? "TOPIC_REVEAL_HOME_TURF"
        : kind === "HOUSE_CHOICE"
          ? "TOPIC_REVEAL_HOUSE_CHOICE"
          : "TOPIC_REVEAL_WARM_UP",
    CALL: "SLOP_CALL",
    ANSWER: "ANSWER",
    REVEAL: "QUESTION_REVEAL",
    ROUND_RESULTS: "ROUND_RESULTS",
    HOUSE_VOTE: "HOUSE_VOTE",
    FINAL: "FINAL_RESULTS",
  };
  return tags[phase];
}

/** One line of game-show copy per phase, the same on every screen. */
function voiceLine(game: Doc<"games">, kind: RoundKind | undefined) {
  const lines = getVoiceLinesForTag(voiceTag(game.phase as QuizslopPhase, kind));
  const line = pickStable(lines, `${game._id}:${game.phaseGeneration}`);
  return line ? { text: line.text, accessibleLabel: line.accessibleLabel } : null;
}

/**
 * Everything a QuizSlop screen needs. Hidden tiers never leave the server;
 * each player sees only their own question until the shared reveal, and only
 * the questions revealed so far.
 */
export async function quizslopView(
  ctx: QueryCtx,
  game: Doc<"games">,
  viewerId: Id<"players"> | null,
) {
  const phase = game.phase as QuizslopPhase | "LOBBY" | "FINAL";
  const [seats, round, answers, calls, houseVotes, players] = await Promise.all([
    loadSeats(ctx, game._id),
    game.round > 0 ? loadDeckRound(ctx, game._id, game.round) : null,
    game.round > 0 ? loadAnswers(ctx, game._id, game.round) : [],
    game.round > 0 ? loadCalls(ctx, game._id, game.round) : [],
    phase === "HOUSE_VOTE" ? loadHouseVotes(ctx, game._id) : [],
    phase === "TOPIC" ? loadActivePlayers(ctx, game._id) : [],
  ]);

  const claimedBy = new Map(
    seats.flatMap((seat) => (seat.homeTopicId ? [[seat.homeTopicId, seat.playerId] as const] : [])),
  );
  const topic = catalogTopic(round?.topicId);
  const revealOrder = round?.revealQuestionIds ?? [];
  const revealedCount =
    phase === "REVEAL"
      ? game.step + 1
      : phase === "ROUND_RESULTS" || phase === "FINAL"
        ? revealOrder.length
        : 0;
  const settled = round?.settledAt !== undefined;
  const revealedIds = new Set(revealOrder.slice(0, revealedCount));
  // A call is decided once its target's question is on screen (refunds wait for the round).
  const callShown = (targetId: Id<"players">) => {
    const target = answers.find((answer) => answer.playerId === targetId);
    return settled || (target !== undefined && revealedIds.has(target.questionId));
  };
  const mine = answers.find((answer) => answer.playerId === viewerId);
  const myQuestion = mine ? catalogQuestion(mine.questionId) : null;
  const myCall = calls.find((entry) => entry.callerId === viewerId);

  return {
    kind: "QUIZSLOP" as const,
    voiceLine: voiceLine(game, round?.kind),
    lobby:
      game.status === "LOBBY"
        ? {
            topics: availableCatalogTopics().map((candidate) => ({
              ...publicTopic(candidate),
              claimedBy: claimedBy.get(candidate.id) ?? null,
            })),
          }
        : null,
    seats: seats.map((seat) => ({
      playerId: seat.playerId,
      homeTopic: catalogTopic(seat.homeTopicId)?.label ?? null,
      callTokens: seat.callTokens,
      quizPoints: seat.quizPoints,
      callPoints: seat.callPoints,
      correctAnswers: seat.correctAnswers,
      successfulCalls: seat.successfulCalls,
      incorrectCalls: seat.incorrectCalls,
    })),
    round: round
      ? {
          ordinal: round.ordinal,
          kind: round.kind,
          pointValue: quizPointsForRound(round.kind === "HOUSE_CHOICE"),
          topic: topic ? publicTopic(topic) : null,
          ownerPlayerId: round.ownerPlayerId ?? null,
          settled,
          /** What each seat gained this round, once it is settled. */
          scores: settled
            ? seats.map((seat) => ({
                playerId: seat.playerId,
                quiz: answers.find((answer) => answer.playerId === seat.playerId)?.points ?? 0,
                calls: calls
                  .filter((entry) => entry.callerId === seat.playerId)
                  .reduce((sum, entry) => sum + (entry.delta ?? 0), 0),
              }))
            : [],
        }
      : null,
    /** TOPIC only: whether Slop Calls open next (otherwise answers do). */
    callsNext: phase === "TOPIC" && callsOpen(seats, players),
    houseVote:
      phase === "HOUSE_VOTE" && round
        ? {
            slate: (round.finalistTopicIds ?? []).flatMap((id) => {
              const candidate = catalogTopic(id);
              return candidate ? [publicTopic(candidate)] : [];
            }),
            votedPlayerIds: houseVotes.map((vote) => vote.voterId),
            myVoteTopicId: houseVotes.find((vote) => vote.voterId === viewerId)?.topicId ?? null,
          }
        : null,
    calls: {
      /** Who has decided; targets stay secret until calls close. */
      decidedPlayerIds: calls.map((entry) => entry.callerId),
      myCall: myCall ? { targetId: myCall.targetId ?? null } : null,
      list:
        phase === "CALL"
          ? []
          : calls.flatMap((entry) =>
              entry.targetId
                ? [
                    {
                      callerId: entry.callerId,
                      targetId: entry.targetId,
                      outcome: callShown(entry.targetId) ? (entry.outcome ?? null) : null,
                      delta: callShown(entry.targetId) ? (entry.delta ?? 0) : 0,
                    },
                  ]
                : [],
            ),
    },
    answer:
      phase === "ANSWER"
        ? {
            lockedPlayerIds: answers
              .filter((answer) => answer.lockedAt !== undefined)
              .map((answer) => answer.playerId),
            mine:
              mine && myQuestion
                ? {
                    displayPrompt: myQuestion.displayPrompt,
                    choices: [...myQuestion.choices],
                    selectedIndex: mine.selectedIndex ?? null,
                    locked: mine.lockedAt !== undefined,
                  }
                : null,
          }
        : null,
    reveal: revealOrder.slice(0, revealedCount).flatMap((questionId) => {
      const question = catalogQuestion(questionId);
      if (!question) return [];
      return [
        {
          questionId,
          displayPrompt: question.displayPrompt,
          choices: [...question.choices],
          correctIndex: question.correctIndex,
          explanation: question.explanation,
          sources: question.sources.map((source) => ({ title: source.title, url: source.url })),
          players: answers
            .filter((answer) => answer.questionId === questionId)
            .map((answer) => {
              const locked = answer.lockedAt !== undefined;
              return {
                playerId: answer.playerId,
                selectedIndex: locked ? (answer.selectedIndex ?? null) : null,
                timedOut: !locked,
                correct: answer.correct ?? false,
                points: answer.points ?? 0,
              };
            }),
        },
      ];
    }),
    revealTotal: revealOrder.length,
    final: game.status === "FINISHED" ? finalResults(seats) : null,
  };
}

export type QuizslopView = Awaited<ReturnType<typeof quizslopView>>;
