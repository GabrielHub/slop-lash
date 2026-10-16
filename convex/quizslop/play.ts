import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requirePlayer, requireViewer } from "../capabilities";
import { settle } from "../engine";
import { findGameByCode } from "../roster";
import {
  presentedQuestion,
  catalogTopic,
  findCall,
  findSeat,
  loadDeckRound,
  loadSeats,
  newSeat,
} from "./mode";
import { isShippableCatalogTopic } from "../../src/games/quizslop/catalog";
import { MAX_PLAYERS, QUIZSLOP_REACTIONS } from "../../src/games/quizslop/game-constants";

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
      if (seat.homeTopicId === topic.id) return;
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
    const existing = await findCall(ctx, game._id, game.round, player._id);
    if (existing) return;
    if (args.targetId !== null) {
      if (args.targetId === player._id) throw new ConvexError("You can't bet on yourself");
      const target = await ctx.db.get("players", args.targetId);
      if (!target || target.gameId !== game._id || target.kickedAt !== undefined) {
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
    const mine = await findCall(ctx, game._id, game.round, player._id);
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

/** Live reveal effects stay outside the full room view and its answer/score reads. */
export const reactions = query({
  args: {
    roomCode: v.string(),
    phaseGeneration: v.number(),
    capability: v.optional(v.string()),
  },
  returns: v.array(
    v.object({ id: v.id("quizSlopReactions"), emoji: v.string(), mine: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const viewer = args.capability ? await requireViewer(ctx, args.capability) : null;
    const game = viewer?.game ?? (await findGameByCode(ctx, args.roomCode));
    if (
      !game || game.roomCode !== args.roomCode || game.gameType !== "QUIZSLOP" ||
      game.status !== "PLAYING" || game.phase !== "REVEAL" ||
      game.phaseGeneration !== args.phaseGeneration
    ) return [];
    const rows = await ctx.db
      .query("quizSlopReactions")
      .withIndex("by_gameId_and_ordinal_and_step_and_playerId", (index) =>
        index.eq("gameId", game._id).eq("ordinal", game.round).eq("step", game.step),
      )
      .take(MAX_PLAYERS * QUIZSLOP_REACTIONS.length);
    return rows
      .toSorted((left, right) => left._creationTime - right._creationTime)
      .map((reaction) => ({
        id: reaction._id,
        emoji: reaction.emoji,
        mine: reaction.playerId === viewer?.player?._id,
      }));
  },
});

export const lockAnswer = mutation({
  args: { capability: v.string(), selectedIndex: v.number() },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    requireQuizslop(game.gameType);
    if (game.phase !== "ANSWER") throw new ConvexError("Answers are locked");
    const answer = await ctx.db
      .query("quizSlopAnswers")
      .withIndex("by_gameId_and_ordinal_and_playerId", (index) =>
        index.eq("gameId", game._id).eq("ordinal", game.round).eq("playerId", player._id),
      )
      .unique();
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
    const vote = await ctx.db
      .query("quizSlopHouseVotes")
      .withIndex("by_gameId_and_voterId", (index) =>
        index.eq("gameId", game._id).eq("voterId", player._id),
      )
      .unique();
    if (vote) return;
    await ctx.db.insert("quizSlopHouseVotes", {
      gameId: game._id,
      voterId: player._id,
      topicId: args.topicId,
    });
    await settle(ctx, game._id);
  },
});
