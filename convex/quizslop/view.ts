import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  presentedQuestion,
  catalogTopic,
  loadAnswers,
  loadCalls,
  loadDeckRound,
  loadHouseVotes,
  loadSeats,
  previousGameQuestionIds,
  staleTopicIds,
  type QuizslopPhase,
} from "./mode";
import { availableCatalogTopics } from "../../src/games/quizslop/catalog";
import { FINAL_SLATE_SIZE, MAX_PLAYERS } from "../../src/games/quizslop/game-constants";
import { callDecided, finalResults, quizPointsForRound } from "../../src/games/quizslop/scoring";
import type { QuizslopCatalogTopic } from "../../src/games/quizslop/types";

function publicTopic(topic: QuizslopCatalogTopic) {
  return { id: topic.id, label: topic.label };
}

/**
 * Topics a lobby may offer: every shippable topic, minus the ones this room
 * played in its previous game (a rematch deals fresh questions).
 */
async function lobbyTopics(ctx: QueryCtx, game: Doc<"games">) {
  const stale = staleTopicIds(await previousGameQuestionIds(ctx, game));
  const topics = availableCatalogTopics();
  const fresh = topics.filter((topic) => !stale.has(topic.id));
  // Never strand a lobby: fall back to the whole catalog if a full deck can't be fresh.
  return fresh.length >= MAX_PLAYERS + 1 + FINAL_SLATE_SIZE ? fresh : topics;
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
  /** Every player in the game, as the room view loaded them. */
  allPlayers: Promise<Doc<"players">[]>,
) {
  const phase = game.phase as QuizslopPhase | "LOBBY" | "FINAL";
  // The House Choice is always the deck's last round, so only it reads the votes.
  const lastRound = game.round > 0 && game.round === game.totalRounds;
  const [allSeats, round, answers, allCalls, players, offered, votes] =
    await Promise.all([
      loadSeats(ctx, game._id),
      game.round > 0 ? loadDeckRound(ctx, game._id, game.round) : null,
      game.round > 0 ? loadAnswers(ctx, game._id, game.round) : [],
      game.round > 0 ? loadCalls(ctx, game._id, game.round) : [],
      allPlayers,
      game.status === "LOBBY" ? lobbyTopics(ctx, game) : null,
      lastRound ? loadHouseVotes(ctx, game._id) : [],
    ]);
  const houseChoice = round?.kind === "HOUSE_CHOICE";
  const houseVotes = houseChoice ? votes : [];

  /** Every player in the game, kicked ones included, so old bets and reveals still name them. */
  const names: Record<string, string> = Object.fromEntries(
    players.map((player) => [player._id, player.name]),
  );
  const activeIds = new Set<string>(
    players.filter((player) => player.kickedAt === undefined).map((player) => player._id),
  );
  const seats = allSeats.filter((seat) => activeIds.has(seat.playerId));
  const calls = allCalls.filter((entry) => activeIds.has(entry.callerId));

  const claimedBy = new Map(
    allSeats.flatMap((seat) =>
      seat.homeTopicId ? [[seat.homeTopicId, seat.playerId] as const] : [],
    ),
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
  // A bet is decided once its target's question is on screen (refunds wait for the round).
  const callShown = (targetId: Id<"players">) => {
    const target = answers.find((answer) => answer.playerId === targetId);
    return settled || (target !== undefined && revealedIds.has(target.questionId));
  };
  const mine = answers.find((answer) => answer.playerId === viewerId);
  const myQuestion = mine ? presentedQuestion(game._id, mine.questionId) : null;
  const myCall = allCalls.find((entry) => entry.callerId === viewerId);
  const myRevealStep = mine ? revealOrder.indexOf(mine.questionId) : -1;
  const slate = houseChoice
    ? (round.finalistTopicIds ?? []).flatMap((id) => {
        const candidate = catalogTopic(id);
        return candidate ? [publicTopic(candidate)] : [];
      })
    : [];
  const calledIds = new Set<string>(calls.map((entry) => entry.callerId));
  // While bets are open, a spent token would tell a bettor from a passer: show everyone
  // else's count from before this round's bet (the viewer still sees their own).
  const betThisRound = new Set<string>(
    phase === "CALL" ? allCalls.flatMap((entry) => (entry.targetId ? [entry.callerId] : [])) : [],
  );
  const publicTokens = (seat: Doc<"quizSlopSeats">) =>
    seat.callTokens + (seat.playerId !== viewerId && betThisRound.has(seat.playerId) ? 1 : 0);
  const tokensByPlayer = new Map<string, number>(
    seats.map((seat) => [seat.playerId, seat.callTokens]),
  );
  // The bet phase asks whoever it would wait on, and keeps showing them once they decide.
  const callEligible = (playerId: string) =>
    calledIds.has(playerId) || !callDecided(false, tokensByPlayer.get(playerId) ?? 0);

  return {
    kind: "QUIZSLOP" as const,
    names,
    lobby: offered
      ? {
          topics: offered.map((candidate) => ({
            ...publicTopic(candidate),
            claimedBy: claimedBy.get(candidate.id) ?? null,
          })),
        }
      : null,
    seats: seats.map((seat) => ({
      playerId: seat.playerId,
      callTokens: publicTokens(seat),
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
          pointValue: quizPointsForRound(houseChoice),
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
    houseVote: houseChoice
      ? {
          slate,
          votedPlayerIds: houseVotes.map((vote) => vote.voterId),
          myVoteTopicId: houseVotes.find((vote) => vote.voterId === viewerId)?.topicId ?? null,
          /** Who voted for what, once the vote closes; ties resolve by slate order. */
          result:
            phase === "HOUSE_VOTE"
              ? null
              : {
                  winnerTopicId: round.topicId ?? null,
                  votes: slate.map((entry) => ({
                    topicId: entry.id,
                    voterIds: houseVotes
                      .filter((vote) => vote.topicId === entry.id)
                      .map((vote) => vote.voterId),
                  })),
                },
        }
      : null,
    calls: {
      /** Who the bet phase asks: players with a bet left, or who already bet this round. */
      eligiblePlayerIds: players
        .filter((player) => activeIds.has(player._id) && callEligible(player._id))
        .map((player) => player._id),
      /** Who has decided; targets stay secret until bets close. */
      decidedPlayerIds: calls.map((entry) => entry.callerId),
      myCall: myCall ? { targetId: myCall.targetId ?? null } : null,
      /** Bets only (passes are left out); a kicked target still resolves through `names`. */
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
            assignedPlayerIds: answers
              .filter((answer) => activeIds.has(answer.playerId))
              .map((answer) => answer.playerId),
            lockedPlayerIds: answers
              .filter((answer) => answer.lockedAt !== undefined && activeIds.has(answer.playerId))
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
      const question = presentedQuestion(game._id, questionId);
      if (!question) return [];
      return [
        {
          questionId,
          displayPrompt: question.displayPrompt,
          choices: [...question.choices],
          correctIndex: question.correctIndex,
          explanation: question.explanation,
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
    /** Fixtures can supply effects; live reactions use their own narrow subscription. */
    reactions: [] as { id: Id<"quizSlopReactions">; emoji: string; mine: boolean }[],
    /** Which reveal step holds the viewer's question, or null if they had none. */
    myRevealStep: myRevealStep === -1 ? null : myRevealStep,
    final: game.status === "FINISHED" ? finalResults(seats) : null,
  };
}

export type QuizslopView = Awaited<ReturnType<typeof quizslopView>>;
