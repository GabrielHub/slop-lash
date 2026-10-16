import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { timed, type GameMode, type Transition } from "../engine";
import { findGameByNumber, loadActivePlayers, loadConnectedPlayers } from "../roster";
import { availableCatalogTopics } from "../../src/games/quizslop/catalog";
import { QUIZSLOP_TOPIC_CATALOG } from "../../src/games/quizslop/config/topic-catalog";
import {
  orderHomeTopics,
  resolveHouseVote,
  revealOrder,
  selectFinalSlate,
  selectWarmUpTopic,
} from "../../src/games/quizslop/deck";
import { INITIAL_TIER, applyLadderResult, pickQuestion } from "../../src/games/quizslop/difficulty";
import {
  ANSWER_SECONDS,
  CALL_SLOP_TOKENS_PER_GAME,
  FINAL_SLATE_SIZE,
  HOUSE_VOTE_SECONDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  QUESTION_REVEAL_SECONDS_PER_GROUP,
  ROUND_RESULTS_SECONDS,
  SLOP_CALL_SECONDS,
} from "../../src/games/quizslop/game-constants";
import { callDecided, settleRound } from "../../src/games/quizslop/scoring";
import { presentChoices } from "../../src/games/quizslop/shuffle";
import type { QuizslopCatalogTopic, QuizslopQuestionContent } from "../../src/games/quizslop/types";

/**
 * QuizSlop phases, one round per topic in the deck:
 *   CALL → ANSWER → REVEAL(step)* → ROUND_RESULTS → CALL …
 * HOUSE_VOTE opens the last round by picking its topic, and the last round's
 * final REVEAL finishes the game (no ROUND_RESULTS, so nothing spoils the
 * winner). CALL ("bets") shows the round's topic on the TV while phones bet;
 * a round where no connected player has a bet left opens at ANSWER. `step`
 * indexes the round's distinct questions in reveal order.
 */
export type QuizslopPhase = "CALL" | "ANSWER" | "REVEAL" | "ROUND_RESULTS" | "HOUSE_VOTE";

type DatabaseCtx = QueryCtx | MutationCtx;

const topicsById = new Map(QUIZSLOP_TOPIC_CATALOG.map((topic) => [topic.id, topic]));
const questionsById = new Map(
  QUIZSLOP_TOPIC_CATALOG.flatMap((topic) =>
    topic.questions.map((question) => [question.id, question] as const),
  ),
);

const topicIdByQuestion = new Map(
  QUIZSLOP_TOPIC_CATALOG.flatMap((topic) =>
    topic.questions.map((question) => [question.id, topic.id] as const),
  ),
);

export function catalogTopic(topicId: string | undefined): QuizslopCatalogTopic | null {
  return (topicId && topicsById.get(topicId)) || null;
}

function catalogQuestion(questionId: string): QuizslopQuestionContent | null {
  return questionsById.get(questionId) ?? null;
}

/**
 * A catalog question with its choices in this game's order. The catalog writes
 * the correct answer first, so everything players see or score against goes
 * through here; `selectedIndex` is stored in this order.
 */
export function presentedQuestion(
  gameId: Id<"games">,
  questionId: string,
): QuizslopQuestionContent | null {
  const question = catalogQuestion(questionId);
  if (!question) return null;
  return { ...question, ...presentChoices(question, `${gameId}:${questionId}`) };
}

export async function loadSeats(ctx: DatabaseCtx, gameId: Id<"games">) {
  return ctx.db
    .query("quizSlopSeats")
    .withIndex("by_gameId_and_playerId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS * 2);
}

export async function findSeat(ctx: DatabaseCtx, gameId: Id<"games">, playerId: Id<"players">) {
  return ctx.db
    .query("quizSlopSeats")
    .withIndex("by_gameId_and_playerId", (index) =>
      index.eq("gameId", gameId).eq("playerId", playerId),
    )
    .unique();
}

export async function loadDeckRound(ctx: DatabaseCtx, gameId: Id<"games">, ordinal: number) {
  return ctx.db
    .query("quizSlopRounds")
    .withIndex("by_gameId_and_ordinal", (index) =>
      index.eq("gameId", gameId).eq("ordinal", ordinal),
    )
    .unique();
}

export async function loadAnswers(ctx: DatabaseCtx, gameId: Id<"games">, ordinal: number) {
  return ctx.db
    .query("quizSlopAnswers")
    .withIndex("by_gameId_and_ordinal_and_playerId", (index) =>
      index.eq("gameId", gameId).eq("ordinal", ordinal),
    )
    .take(MAX_PLAYERS * 2);
}

export async function loadCalls(ctx: DatabaseCtx, gameId: Id<"games">, ordinal: number) {
  return ctx.db
    .query("quizSlopCalls")
    .withIndex("by_gameId_and_ordinal_and_callerId", (index) =>
      index.eq("gameId", gameId).eq("ordinal", ordinal),
    )
    .take(MAX_PLAYERS * 2);
}

export async function findCall(
  ctx: DatabaseCtx,
  gameId: Id<"games">,
  ordinal: number,
  callerId: Id<"players">,
) {
  return ctx.db
    .query("quizSlopCalls")
    .withIndex("by_gameId_and_ordinal_and_callerId", (index) =>
      index.eq("gameId", gameId).eq("ordinal", ordinal).eq("callerId", callerId),
    )
    .unique();
}

export async function loadHouseVotes(ctx: DatabaseCtx, gameId: Id<"games">) {
  return ctx.db
    .query("quizSlopHouseVotes")
    .withIndex("by_gameId_and_voterId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS * 2);
}

/**
 * Question ids this room was asked in its previous game, so a "Play again"
 * deals fresh questions. Empty for a room's first game, or once the previous
 * game has been cleaned up. Each answered round froze its distinct questions
 * when answers locked; only a round the game ended inside of still needs its
 * answer rows read.
 */
export async function previousGameQuestionIds(
  ctx: DatabaseCtx,
  game: Doc<"games">,
): Promise<Set<string>> {
  if (game.gameNumber <= 1) return new Set();
  const previous = await findGameByNumber(ctx, game.roomCode, game.gameNumber - 1);
  if (!previous || previous.gameType !== game.gameType) return new Set();
  const rounds = await ctx.db
    .query("quizSlopRounds")
    .withIndex("by_gameId_and_ordinal", (index) => index.eq("gameId", previous._id))
    .take(MAX_PLAYERS + 2);
  const asked = new Set(rounds.flatMap((round) => round.revealQuestionIds ?? []));
  const unfrozen = await Promise.all(
    rounds
      .filter((round) => round.topicId !== undefined && round.revealQuestionIds === undefined)
      .map((round) => loadAnswers(ctx, previous._id, round.ordinal)),
  );
  for (const answer of unfrozen.flat()) asked.add(answer.questionId);
  return asked;
}

/** Topics holding any of these questions: the ones a rematch avoids dealing. */
export function staleTopicIds(askedQuestionIds: ReadonlySet<string>): Set<string> {
  const stale = new Set<string>();
  for (const questionId of askedQuestionIds) {
    const topicId = topicIdByQuestion.get(questionId);
    if (topicId) stale.add(topicId);
  }
  return stale;
}

async function requireDeckRound(ctx: DatabaseCtx, game: Doc<"games">) {
  const round = await loadDeckRound(ctx, game._id, game.round);
  if (!round) throw new ConvexError("QuizSlop round is missing");
  return round;
}

export function newSeat(gameId: Id<"games">, playerId: Id<"players">) {
  return {
    gameId,
    playerId,
    tier: INITIAL_TIER,
    callTokens: CALL_SLOP_TOKENS_PER_GAME,
    quizPoints: 0,
    callPoints: 0,
    correctAnswers: 0,
    successfulCalls: 0,
    incorrectCalls: 0,
  };
}

function rank(topic: QuizslopCatalogTopic) {
  return { topicId: topic.id, category: topic.category, rank: Math.random() };
}

/**
 * Freezes the deck: warm-up, every Home Topic, then a voted finale. In a
 * rematch the house deals only topics the room did not play last game, unless
 * that would leave too few to build a deck.
 */
async function buildDeck(ctx: MutationCtx, game: Doc<"games">, players: Doc<"players">[]) {
  const [seatList, asked] = await Promise.all([
    loadSeats(ctx, game._id),
    previousGameQuestionIds(ctx, game),
  ]);
  const seats = new Map(seatList.map((seat) => [seat.playerId, seat]));
  const stale = staleTopicIds(asked);
  const claimed = new Set<string>();
  for (const seat of seats.values()) if (seat.homeTopicId) claimed.add(seat.homeTopicId);
  const unclaimed = () => availableCatalogTopics(claimed);
  const preferFresh = <T extends { id: string }>(topics: T[], needed: number) => {
    const fresh = topics.filter((topic) => !stale.has(topic.id));
    return fresh.length >= needed ? fresh : topics;
  };

  const home: { playerId: Id<"players">; topic: QuizslopCatalogTopic }[] = [];
  for (const player of players) {
    let seat = seats.get(player._id);
    if (!seat) {
      const seatId = await ctx.db.insert("quizSlopSeats", newSeat(game._id, player._id));
      seat = (await ctx.db.get("quizSlopSeats", seatId))!;
    }
    let topic = catalogTopic(seat.homeTopicId);
    if (!topic) {
      // Anyone who never picked gets a random topic rather than blocking the start.
      const options = preferFresh(unclaimed(), 1);
      topic = options[Math.floor(Math.random() * options.length)] ?? null;
      if (!topic) throw new ConvexError("Not enough QuizSlop topics for this many players");
      claimed.add(topic.id);
      await ctx.db.patch("quizSlopSeats", seat._id, { homeTopicId: topic.id });
    }
    home.push({ playerId: player._id, topic });
  }

  const pool = preferFresh(unclaimed(), 1 + FINAL_SLATE_SIZE).map((topic) => rank(topic));
  const warmUp = selectWarmUpTopic(pool);
  const finalists = selectFinalSlate(pool.filter((topic) => topic.topicId !== warmUp?.topicId));
  if (!warmUp || finalists.length === 0) {
    throw new ConvexError("Not enough QuizSlop topics for this many players");
  }
  const ownerByTopic = new Map(home.map((entry) => [entry.topic.id, entry.playerId]));
  const homeOrder = orderHomeTopics(home.map((entry) => rank(entry.topic)));

  let ordinal = 1;
  await ctx.db.insert("quizSlopRounds", {
    gameId: game._id,
    ordinal: ordinal++,
    kind: "WARM_UP",
    topicId: warmUp.topicId,
  });
  for (const entry of homeOrder) {
    await ctx.db.insert("quizSlopRounds", {
      gameId: game._id,
      ordinal: ordinal++,
      kind: "HOME_TURF",
      topicId: entry.topicId,
      ownerPlayerId: ownerByTopic.get(entry.topicId)!,
    });
  }
  await ctx.db.insert("quizSlopRounds", {
    gameId: game._id,
    ordinal,
    kind: "HOUSE_CHOICE",
    finalistTopicIds: finalists.map((entry) => entry.topicId),
  });
  await ctx.db.patch("games", game._id, { totalRounds: ordinal });
}

/**
 * Deals each active player the question at their hidden tier and opens answers.
 * `loaded` reuses the players and seats a caller already read in this mutation.
 */
async function openAnswers(
  ctx: MutationCtx,
  game: Doc<"games">,
  ordinal: number,
  loaded?: { players: Doc<"players">[]; seats?: Doc<"quizSlopSeats">[] },
): Promise<Transition> {
  const [round, players, seatList, asked] = await Promise.all([
    loadDeckRound(ctx, game._id, ordinal),
    loaded?.players ?? loadActivePlayers(ctx, game._id),
    loaded?.seats ?? loadSeats(ctx, game._id),
    previousGameQuestionIds(ctx, game),
  ]);
  if (!round) throw new ConvexError("QuizSlop round is missing");
  const topic = catalogTopic(round.topicId);
  if (!topic) throw new ConvexError("QuizSlop round has no topic");
  const seats = new Map(seatList.map((seat) => [seat.playerId, seat]));
  for (const player of players) {
    const tier = seats.get(player._id)?.tier ?? INITIAL_TIER;
    const question = pickQuestion(topic.questions, tier, asked);
    if (!question) throw new ConvexError(`${topic.label} has no questions`);
    await ctx.db.insert("quizSlopAnswers", {
      gameId: game._id,
      ordinal,
      playerId: player._id,
      questionId: question.id,
    });
  }
  return { phase: "ANSWER", round: ordinal, seconds: timed(game, ANSWER_SECONDS) };
}

/**
 * A round opens on bets while someone can bet, otherwise straight at answers.
 * Bets open only when two or more players are in and a connected one still has a bet.
 */
async function openRound(
  ctx: MutationCtx,
  game: Doc<"games">,
  ordinal: number,
): Promise<Transition> {
  const [seats, { players, connected }] = await Promise.all([
    loadSeats(ctx, game._id),
    loadConnectedPlayers(ctx, game, Date.now()),
  ]);
  const connectedIds = new Set<string>(connected.map((player) => player._id));
  const callsOpen =
    players.length > 1 &&
    seats.some((seat) => connectedIds.has(seat.playerId) && seat.callTokens > 0);
  if (callsOpen) {
    return { phase: "CALL", round: ordinal, seconds: timed(game, SLOP_CALL_SECONDS) };
  }
  return openAnswers(ctx, game, ordinal, { players, seats });
}

async function loadSettlement(ctx: MutationCtx, game: Doc<"games">) {
  const [round, answers, calls] = await Promise.all([
    requireDeckRound(ctx, game),
    loadAnswers(ctx, game._id, game.round),
    loadCalls(ctx, game._id, game.round),
  ]);
  const result = settleRound({
    isFinalRound: round.kind === "HOUSE_CHOICE",
    assignments: answers.map((answer) => ({
      playerId: answer.playerId,
      questionId: answer.questionId,
      selectedIndex: answer.lockedAt !== undefined ? (answer.selectedIndex ?? null) : null,
      correctIndex: presentedQuestion(game._id, answer.questionId)?.correctIndex ?? -1,
    })),
    calls: calls.flatMap((call) =>
      call.targetId ? [{ callerId: call.callerId, targetId: call.targetId }] : [],
    ),
  });
  return { round, answers, calls, result };
}

/** Marks every answer and Slop Call when answers lock, so each reveal step shows its verdict. */
async function markAnswers(ctx: MutationCtx, game: Doc<"games">) {
  const { round, answers, calls, result } = await loadSettlement(ctx, game);
  for (const answer of answers) {
    const player = result.players.find((entry) => entry.playerId === answer.playerId);
    await ctx.db.patch("quizSlopAnswers", answer._id, {
      correct: player?.answeredCorrectly === true,
      points: player?.quizDelta ?? 0,
    });
  }
  for (const call of calls) {
    const settled = result.calls.find(
      (entry) => entry.callerId === call.callerId && entry.targetId === call.targetId,
    );
    if (settled) {
      await ctx.db.patch("quizSlopCalls", call._id, {
        outcome: settled.outcome,
        delta: settled.callDelta,
      });
    }
  }
  return { round, answers };
}

/** Moves the round onto the seats once: points, refunds, and hidden ladders. */
async function settle(ctx: MutationCtx, game: Doc<"games">) {
  const [{ round, result }, seats] = await Promise.all([
    loadSettlement(ctx, game),
    loadSeats(ctx, game._id),
  ]);
  if (round.settledAt !== undefined) return;
  for (const seat of seats) {
    const delta = result.players.find((entry) => entry.playerId === seat.playerId);
    if (!delta) continue;
    const wonCalls = result.calls.filter(
      (call) => call.callerId === seat.playerId && call.outcome === "WON",
    ).length;
    const lostCalls = result.calls.filter(
      (call) => call.callerId === seat.playerId && call.outcome === "LOST",
    ).length;
    const next = {
      tier: applyLadderResult(seat.tier, delta.ladderResult),
      callTokens: seat.callTokens + delta.tokensRefunded,
      quizPoints: seat.quizPoints + delta.quizDelta,
      callPoints: seat.callPoints + delta.callDelta,
      correctAnswers: seat.correctAnswers + (delta.answeredCorrectly ? 1 : 0),
      successfulCalls: seat.successfulCalls + wonCalls,
      incorrectCalls: seat.incorrectCalls + lostCalls,
    };
    await ctx.db.patch("quizSlopSeats", seat._id, next);
    await ctx.db.patch("players", seat.playerId, { score: next.quizPoints + next.callPoints });
  }
  await ctx.db.patch("quizSlopRounds", round._id, { settledAt: Date.now() });
}

function roundResults(game: Doc<"games">): Transition {
  return { phase: "ROUND_RESULTS", seconds: timed(game, ROUND_RESULTS_SECONDS) };
}

/** The last round's reveal goes straight to the final screen, so nothing spoils the winner. */
function afterRound(game: Doc<"games">): Transition | "FINISH" {
  return game.round >= game.totalRounds ? "FINISH" : roundResults(game);
}

function revealStep(game: Doc<"games">, step: number): Transition {
  return { phase: "REVEAL", step, seconds: timed(game, QUESTION_REVEAL_SECONDS_PER_GROUP) };
}

export const quizslopMode: GameMode = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  async onPlayerRemoved(ctx, game, player) {
    if (game.status !== "LOBBY") return;
    const seat = await findSeat(ctx, game._id, player._id);
    if (seat) await ctx.db.delete("quizSlopSeats", seat._id);
  },

  async start(ctx, game, players) {
    if (players.some((player) => player.type !== "HUMAN")) {
      throw new ConvexError("QuizSlop is humans only");
    }
    await buildDeck(ctx, game, players);
    return openRound(ctx, game, 1);
  },

  async isComplete(ctx, game, connected) {
    const here = connected.map((player) => player._id as Id<"players">);
    switch (game.phase as QuizslopPhase) {
      case "CALL": {
        // Players with no bets left are never asked, so never waited on.
        const [calls, seats] = await Promise.all([
          loadCalls(ctx, game._id, game.round),
          loadSeats(ctx, game._id),
        ]);
        const called = new Set<string>(calls.map((entry) => entry.callerId));
        const tokens = new Map<string, number>(
          seats.map((seat) => [seat.playerId, seat.callTokens]),
        );
        return here.every((id) => callDecided(called.has(id), tokens.get(id) ?? 0));
      }
      case "ANSWER": {
        const locked = new Set(
          (await loadAnswers(ctx, game._id, game.round))
            .filter((answer) => answer.lockedAt !== undefined)
            .map((answer) => answer.playerId),
        );
        return here.every((id) => locked.has(id));
      }
      case "HOUSE_VOTE": {
        const voted = new Set((await loadHouseVotes(ctx, game._id)).map((vote) => vote.voterId));
        return here.every((id) => voted.has(id));
      }
      default:
        return false;
    }
  },

  async next(ctx, game) {
    switch (game.phase as QuizslopPhase) {
      case "CALL": {
        // Anyone who did not bet passed, including players with no bets left.
        const [calls, players] = await Promise.all([
          loadCalls(ctx, game._id, game.round),
          loadActivePlayers(ctx, game._id),
        ]);
        const called = new Set(calls.map((entry) => entry.callerId));
        for (const player of players) {
          if (called.has(player._id)) continue;
          await ctx.db.insert("quizSlopCalls", {
            gameId: game._id,
            ordinal: game.round,
            callerId: player._id,
          });
        }
        return openAnswers(ctx, game, game.round, { players });
      }
      case "ANSWER": {
        const { round, answers } = await markAnswers(ctx, game);
        // On a player's topic, the owner's question closes the round.
        const ownerQuestionId =
          round.kind === "HOME_TURF" && round.ownerPlayerId
            ? (answers.find((answer) => answer.playerId === round.ownerPlayerId)?.questionId ??
              null)
            : null;
        const questionIds = revealOrder(
          [...new Set(answers.map((answer) => answer.questionId))],
          `${game._id}:${game.round}`,
          ownerQuestionId,
        );
        await ctx.db.patch("quizSlopRounds", round._id, { revealQuestionIds: questionIds });
        if (questionIds.length === 0) {
          await settle(ctx, game);
          return afterRound(game);
        }
        return revealStep(game, 0);
      }
      case "REVEAL": {
        const round = await requireDeckRound(ctx, game);
        if (game.step + 1 < (round.revealQuestionIds?.length ?? 0)) {
          return revealStep(game, game.step + 1);
        }
        await settle(ctx, game);
        return afterRound(game);
      }
      case "ROUND_RESULTS": {
        // afterRound never opens results after the last round; this is a safety net.
        if (game.round >= game.totalRounds) return "FINISH";
        if ((await loadActivePlayers(ctx, game._id)).length < MIN_PLAYERS) return "FINISH";
        const nextRound = await loadDeckRound(ctx, game._id, game.round + 1);
        if (nextRound && !nextRound.topicId) {
          return {
            phase: "HOUSE_VOTE",
            round: game.round + 1,
            seconds: timed(game, HOUSE_VOTE_SECONDS),
          };
        }
        return openRound(ctx, game, game.round + 1);
      }
      case "HOUSE_VOTE": {
        const round = await requireDeckRound(ctx, game);
        const slate = (round.finalistTopicIds ?? []).map((topicId, index) => ({
          topicId,
          tieBreakRank: index,
        }));
        const winner = resolveHouseVote(slate, await loadHouseVotes(ctx, game._id));
        if (!winner) return "FINISH";
        await ctx.db.patch("quizSlopRounds", round._id, { topicId: winner.topicId });
        return openRound(ctx, game, game.round);
      }
      default:
        return "FINISH";
    }
  },

  async onFinish(ctx, game, early) {
    // An answered round still counts if the host ends during its reveal.
    if (early && game.status === "PLAYING" && game.phase === "REVEAL") await settle(ctx, game);
  },
};
