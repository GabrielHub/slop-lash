import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requirePlayer } from "../capabilities";
import { settle } from "../engine";
import { loadActivePlayers } from "../roster";
import {
  catalogQuestion,
  catalogTopic,
  findSeat,
  loadAnswers,
  loadCalls,
  loadDeckRound,
  loadHouseVotes,
  loadSeats,
  newSeat,
} from "./mode";
import { isShippableCatalogTopic } from "../../src/games/quizslop/catalog";

function requireQuizslop(gameType: string) {
  if (gameType !== "QUIZSLOP") throw new ConvexError("This action is only available in QuizSlop");
}

/** Picks (or swaps) the Home Topic this player brings to the game. */
export const chooseTopic = mutation({
  args: { capability: v.string(), topicId: v.string() },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    requireQuizslop(game.gameType);
    if (game.status !== "LOBBY") throw new ConvexError("Topics are locked once the game starts");
    const topic = catalogTopic(args.topicId);
    if (!topic || !isShippableCatalogTopic(topic)) throw new ConvexError("Unknown topic");
    const seats = await loadSeats(ctx, game._id);
    if (seats.some((seat) => seat.homeTopicId === topic.id && seat.playerId !== player._id)) {
      throw new ConvexError(`Someone already picked ${topic.label}`);
    }
    const seat = seats.find((candidate) => candidate.playerId === player._id);
    if (seat) {
      await ctx.db.patch("quizSlopSeats", seat._id, { homeTopicId: topic.id });
    } else {
      await ctx.db.insert("quizSlopSeats", {
        ...newSeat(game._id, player._id),
        homeTopicId: topic.id,
      });
    }
  },
});

/** Calls Slop on another player (they will miss), or holds with a null target. */
export const call = mutation({
  args: { capability: v.string(), targetId: v.union(v.id("players"), v.null()) },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    requireQuizslop(game.gameType);
    if (game.phase !== "CALL") throw new ConvexError("Calls are closed");
    const calls = await loadCalls(ctx, game._id, game.round);
    if (calls.some((existing) => existing.callerId === player._id)) return;
    if (args.targetId !== null) {
      if (args.targetId === player._id) throw new ConvexError("You can't call yourself");
      const players = await loadActivePlayers(ctx, game._id);
      if (!players.some((candidate) => candidate._id === args.targetId)) {
        throw new ConvexError("That player is not in the game");
      }
      const seat = await findSeat(ctx, game._id, player._id);
      if (!seat || seat.callTokens <= 0) throw new ConvexError("You're out of Slop Calls");
      await ctx.db.patch("quizSlopSeats", seat._id, { callTokens: seat.callTokens - 1 });
    }
    await ctx.db.insert("quizSlopCalls", {
      gameId: game._id,
      ordinal: game.round,
      callerId: player._id,
      ...(args.targetId ? { targetId: args.targetId } : {}),
    });
    await settle(ctx, game._id);
  },
});

export const lockAnswer = mutation({
  args: { capability: v.string(), selectedIndex: v.number() },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    requireQuizslop(game.gameType);
    if (game.phase !== "ANSWER") throw new ConvexError("Answers are locked");
    const answer = (await loadAnswers(ctx, game._id, game.round)).find(
      (candidate) => candidate.playerId === player._id,
    );
    if (!answer) throw new ConvexError("You don't have a question this round");
    if (answer.lockedAt !== undefined) return;
    const question = catalogQuestion(answer.questionId);
    if (
      !question ||
      !Number.isInteger(args.selectedIndex) ||
      args.selectedIndex < 0 ||
      args.selectedIndex >= question.choices.length
    ) {
      throw new ConvexError("Pick one of the choices");
    }
    await ctx.db.patch("quizSlopAnswers", answer._id, {
      selectedIndex: args.selectedIndex,
      lockedAt: Date.now(),
    });
    await settle(ctx, game._id);
  },
});

export const houseVote = mutation({
  args: { capability: v.string(), topicId: v.string() },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    requireQuizslop(game.gameType);
    if (game.phase !== "HOUSE_VOTE") throw new ConvexError("The vote is closed");
    const round = await loadDeckRound(ctx, game._id, game.round);
    if (!round?.finalistTopicIds?.includes(args.topicId)) {
      throw new ConvexError("That topic is not on the ballot");
    }
    const votes = await loadHouseVotes(ctx, game._id);
    if (votes.some((vote) => vote.voterId === player._id)) return;
    await ctx.db.insert("quizSlopHouseVotes", {
      gameId: game._id,
      voterId: player._id,
      topicId: args.topicId,
    });
    await settle(ctx, game._id);
  },
});
