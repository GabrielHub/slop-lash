import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requirePlayer } from "../capabilities";
import { settle } from "../engine";
import { loadActivePlayers } from "../roster";
import {
  presentedQuestion,
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
import { QUIZSLOP_REACTIONS } from "../../src/games/quizslop/game-constants";

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

/** Bets another player will miss their question, or passes with a null target. */
export const call = mutation({
  args: { capability: v.string(), targetId: v.union(v.id("players"), v.null()) },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    requireQuizslop(game.gameType);
    if (game.phase !== "CALL") throw new ConvexError("Betting is closed");
    const calls = await loadCalls(ctx, game._id, game.round);
    if (calls.some((existing) => existing.callerId === player._id)) return;
    if (args.targetId !== null) {
      if (args.targetId === player._id) throw new ConvexError("You can't bet on yourself");
      const players = await loadActivePlayers(ctx, game._id);
      if (!players.some((candidate) => candidate._id === args.targetId)) {
        throw new ConvexError("That player is not in the game");
      }
      const seat = await findSeat(ctx, game._id, player._id);
      if (!seat || seat.callTokens <= 0) throw new ConvexError("No bets left");
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

/** Takes back this round's bet (or pass) while betting is still open, refunding the token. */
export const uncall = mutation({
  args: { capability: v.string() },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    requireQuizslop(game.gameType);
    if (game.phase !== "CALL") throw new ConvexError("Betting is closed");
    const mine = (await loadCalls(ctx, game._id, game.round)).find(
      (existing) => existing.callerId === player._id,
    );
    if (!mine) return;
    if (mine.targetId !== undefined) {
      const seat = await findSeat(ctx, game._id, player._id);
      if (seat) await ctx.db.patch("quizSlopSeats", seat._id, { callTokens: seat.callTokens + 1 });
    }
    await ctx.db.delete("quizSlopCalls", mine._id);
  },
});

/** Sends one emoji to the TV during a reveal step; each emoji once per player per step. */
export const react = mutation({
  args: { capability: v.string(), emoji: v.string() },
  handler: async (ctx, args) => {
    if (!(QUIZSLOP_REACTIONS as readonly string[]).includes(args.emoji)) {
      throw new ConvexError("Unknown reaction");
    }
    const { game, player } = await requirePlayer(ctx, args.capability);
    requireQuizslop(game.gameType);
    if (game.phase !== "REVEAL") throw new ConvexError("Reactions open during the reveal");
    const sent = await ctx.db
      .query("quizSlopReactions")
      .withIndex("by_gameId_and_ordinal_and_step_and_playerId", (index) =>
        index
          .eq("gameId", game._id)
          .eq("ordinal", game.round)
          .eq("step", game.step)
          .eq("playerId", player._id),
      )
      .take(QUIZSLOP_REACTIONS.length);
    if (sent.some((row) => row.emoji === args.emoji)) return;
    await ctx.db.insert("quizSlopReactions", {
      gameId: game._id,
      ordinal: game.round,
      step: game.step,
      playerId: player._id,
      emoji: args.emoji,
    });
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
    const question = presentedQuestion(game._id, answer.questionId);
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
