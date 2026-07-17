import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./_generated/server";
import { requireHostCapability, requirePlayerCapability } from "./capabilities";
import { requireExpectedPhaseGeneration } from "./gamePhase";
import {
  getQuizslopParticipant,
  getQuizslopState,
  isEligible,
  listQuizslopTopics,
  loadAssignmentForPlayer,
  loadQuizslopRoundByOrdinal,
  loadQuizslopTopicForOwner,
  requireQuizslopGame,
} from "./quizslopData";
import { forceAdvanceQuizslop, settleQuizslopQuorum } from "./quizslopGameplay";
import { loadQuizslopBundle, type QuizslopEngineBundle } from "./quizslopLifecycle";
import { startQuizslopGame } from "./quizslopSetup";
import { deleteMaterializedTopic, materializeCatalogTopic } from "./quizslopMaterialization";
import {
  quizslopDisputeReasonValidator,
  quizslopDisputeVoteChoiceValidator,
  quizslopPhaseValidator,
} from "./quizslopValidators";
import { QUIZSLOP_TOPIC_CATALOG } from "../src/games/quizslop/config/topic-catalog";
import { CHOICES_PER_QUESTION } from "../src/games/quizslop/game-constants";
import { canHostAdvanceQuizslopPhase } from "../src/games/quizslop/quizslop-phase-policy";

/**
 * QuizSlop public mutations. Every gameplay mutation validates capability,
 * game type, frozen participation where required, the exact mode phase, and
 * the expected shared phase generation; scheduled deadline work re-validates
 * the same identifiers and becomes a stale no-op.
 */

const phaseResultValidator = v.object({ phase: quizslopPhaseValidator });

async function requireQuizslopBundle(
  ctx: MutationCtx,
  game: Doc<"games">,
): Promise<QuizslopEngineBundle> {
  requireQuizslopGame(game);
  const state = await getQuizslopState(ctx, game._id);
  return { game, state };
}

function requireOpenGame(bundle: QuizslopEngineBundle): void {
  if (bundle.game.finalizedAt !== undefined) {
    throw new ConvexError("This QuizSlop game has ended");
  }
}

async function loadCurrentRoundOrThrow(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
): Promise<Doc<"quizSlopRounds">> {
  const round = await loadQuizslopRoundByOrdinal(ctx, bundle.game._id, bundle.state.deckPosition);
  if (!round) throw new ConvexError("QuizSlop round is missing");
  return round;
}

export const start = mutation({
  args: { capability: v.string() },
  returns: v.object({ started: v.boolean(), totalRounds: v.number() }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    const bundle = await requireQuizslopBundle(ctx, authorized.game);
    if (bundle.game.status !== "LOBBY") {
      // Idempotent re-submit after a slow network: report the started game.
      return { started: false, totalRounds: bundle.game.totalRounds };
    }
    await startQuizslopGame(ctx, bundle, Date.now());
    return { started: true, totalRounds: bundle.game.totalRounds };
  },
});

/**
 * Confirms one reviewed catalog topic as the player's Home Topic. The first
 * version keeps custom topics disabled, so this is the entire setup surface.
 * Confirmation atomically claims the topic's canonical key; a lost race
 * returns TOPIC_TAKEN so the controller can refresh its offers.
 */
export const chooseCatalogTopic = mutation({
  args: { capability: v.string(), catalogTopicId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("CONFIRMED"), topicId: v.id("quizSlopTopics") }),
    v.object({ kind: v.literal("TOPIC_TAKEN") }),
  ),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireQuizslopBundle(ctx, authorized.game);
    if (bundle.game.status !== "LOBBY" || bundle.state.phase !== "LOBBY_SETUP") {
      throw new ConvexError("Topics can only be chosen in the lobby");
    }
    if (authorized.player.type !== "HUMAN" || authorized.player.participationStatus !== "ACTIVE") {
      throw new ConvexError("Only active players confirm a Home Topic");
    }

    const catalogTopic = QUIZSLOP_TOPIC_CATALOG.find(
      (topic) => topic.id === args.catalogTopicId && !topic.retired,
    );
    if (!catalogTopic) throw new ConvexError("Unknown catalog topic");

    const existing = await loadQuizslopTopicForOwner(ctx, bundle.game._id, authorized.player._id);
    if (existing?.catalogTopicId === catalogTopic.id && existing.setupState === "READY") {
      return { kind: "CONFIRMED" as const, topicId: existing._id };
    }

    // Atomic canonical-key claim against every other player's confirmed topic.
    const topics = await listQuizslopTopics(ctx, bundle.game._id);
    const claimedByOther = topics.some(
      (topic) =>
        topic.ownerPlayerId !== undefined &&
        topic.ownerPlayerId !== authorized.player._id &&
        topic.canonicalKey === catalogTopic.canonicalKey,
    );
    if (claimedByOther) return { kind: "TOPIC_TAKEN" as const };

    const now = Date.now();
    if (existing) await deleteMaterializedTopic(ctx, existing);
    const topicId = await materializeCatalogTopic(ctx, bundle.game._id, catalogTopic, {
      ownerPlayerId: authorized.player._id,
      setupState: "READY",
      now,
    });
    await ctx.db.patch("games", bundle.game._id, { updatedAt: now });
    return { kind: "CONFIRMED" as const, topicId };
  },
});

export const castHouseVote = mutation({
  args: {
    capability: v.string(),
    topicId: v.id("quizSlopTopics"),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireQuizslopBundle(ctx, authorized.game);
    requireOpenGame(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "HOUSE_VOTE") {
      throw new ConvexError("The final topic vote is not open");
    }
    const round = await loadCurrentRoundOrThrow(ctx, bundle);
    if (!(await isEligible(ctx, round._id, "HOUSE_VOTE", authorized.player._id))) {
      throw new ConvexError("You are not in this vote's roster");
    }
    if (!(round.finalistTopicIds ?? []).includes(args.topicId)) {
      throw new ConvexError("That topic is not on the final slate");
    }
    const existing = await ctx.db
      .query("quizSlopHouseVotes")
      .withIndex("by_roundId_and_playerId", (index) =>
        index.eq("roundId", round._id).eq("playerId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if (existing.topicId === args.topicId) {
        return { phase: bundle.state.phase };
      }
      throw new ConvexError("Your vote is already locked");
    }
    const now = Date.now();
    await ctx.db.insert("quizSlopHouseVotes", {
      gameId: bundle.game._id,
      roundId: round._id,
      playerId: authorized.player._id,
      topicId: args.topicId,
      castAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

export const submitCall = mutation({
  args: {
    capability: v.string(),
    /** Null records an explicit hold. */
    targetPlayerId: v.union(v.id("players"), v.null()),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireQuizslopBundle(ctx, authorized.game);
    requireOpenGame(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "SLOP_CALL") {
      throw new ConvexError("Call Slop is not open");
    }
    const round = await loadCurrentRoundOrThrow(ctx, bundle);
    if (!(await isEligible(ctx, round._id, "CALL", authorized.player._id))) {
      throw new ConvexError("You are not in this round's call roster");
    }
    const existing = await ctx.db
      .query("quizSlopCalls")
      .withIndex("by_roundId_and_callerId", (index) =>
        index.eq("roundId", round._id).eq("callerId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if ((existing.targetId ?? null) === args.targetPlayerId) {
        return { phase: bundle.state.phase };
      }
      throw new ConvexError("Your Call Slop choice is already locked");
    }

    const now = Date.now();
    if (args.targetPlayerId !== null) {
      if (args.targetPlayerId === authorized.player._id) {
        throw new ConvexError("You cannot call yourself");
      }
      if (!(await isEligible(ctx, round._id, "CALL", args.targetPlayerId))) {
        throw new ConvexError("That player is not call-eligible this round");
      }
      const participant = await getQuizslopParticipant(ctx, bundle.game._id, authorized.player._id);
      if (!participant || participant.callTokens < 1) {
        throw new ConvexError("You have no Call Slop tokens left");
      }
      await ctx.db.patch("quizSlopParticipants", participant._id, {
        callTokens: participant.callTokens - 1,
      });
    }
    await ctx.db.insert("quizSlopCalls", {
      gameId: bundle.game._id,
      roundId: round._id,
      callerId: authorized.player._id,
      ...(args.targetPlayerId !== null ? { targetId: args.targetPlayerId } : {}),
      lockedAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

export const lockAnswer = mutation({
  args: {
    capability: v.string(),
    selectedIndex: v.number(),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireQuizslopBundle(ctx, authorized.game);
    requireOpenGame(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "ANSWER") {
      throw new ConvexError("The answer phase is not open");
    }
    if (
      !Number.isInteger(args.selectedIndex) ||
      args.selectedIndex < 0 ||
      args.selectedIndex >= CHOICES_PER_QUESTION
    ) {
      throw new ConvexError("Invalid answer choice");
    }
    const round = await loadCurrentRoundOrThrow(ctx, bundle);
    const assignment = await loadAssignmentForPlayer(ctx, round._id, authorized.player._id);
    if (!assignment) {
      throw new ConvexError("You have no question this round");
    }
    if (assignment.lockedAt !== undefined) {
      if (assignment.selectedIndex === args.selectedIndex) {
        return { phase: bundle.state.phase };
      }
      throw new ConvexError("Your answer is already locked");
    }
    const now = Date.now();
    await ctx.db.patch("quizSlopAssignments", assignment._id, {
      selectedIndex: args.selectedIndex,
      lockedAt: now,
      timedOut: false,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

export const initiateDispute = mutation({
  args: {
    capability: v.string(),
    questionId: v.id("quizSlopQuestions"),
    reason: quizslopDisputeReasonValidator,
    expectedPhaseGeneration: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal("OPENED"), disputeId: v.id("quizSlopDisputes") }),
    v.object({ kind: v.literal("ALREADY_OPEN") }),
  ),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireQuizslopBundle(ctx, authorized.game);
    requireOpenGame(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "DISPUTE_WINDOW") {
      throw new ConvexError("The dispute window is not open");
    }
    const round = await loadCurrentRoundOrThrow(ctx, bundle);
    if (!(await isEligible(ctx, round._id, "DISPUTE_WINDOW", authorized.player._id))) {
      throw new ConvexError("You are not in this round's dispute roster");
    }
    if (!(round.revealQuestionIds ?? []).includes(args.questionId)) {
      throw new ConvexError("Only revealed questions can be challenged");
    }
    if ((round.systemVoidQuestionIds ?? []).includes(args.questionId)) {
      throw new ConvexError("A voided question cannot be challenged");
    }
    const existing = await ctx.db
      .query("quizSlopDisputes")
      .withIndex("by_roundId_and_questionId", (index) =>
        index.eq("roundId", round._id).eq("questionId", args.questionId),
      )
      .unique();
    if (existing) return { kind: "ALREADY_OPEN" as const };

    const participant = await getQuizslopParticipant(ctx, bundle.game._id, authorized.player._id);
    if (!participant || !participant.disputeAvailable) {
      throw new ConvexError("You have already used your dispute this game");
    }
    const now = Date.now();
    await ctx.db.patch("quizSlopParticipants", participant._id, { disputeAvailable: false });
    const disputeId = await ctx.db.insert("quizSlopDisputes", {
      gameId: bundle.game._id,
      roundId: round._id,
      questionId: args.questionId,
      initiatorId: authorized.player._id,
      reason: args.reason,
      createdAt: now,
    });
    return { kind: "OPENED" as const, disputeId };
  },
});

export const castDisputeVote = mutation({
  args: {
    capability: v.string(),
    disputeId: v.id("quizSlopDisputes"),
    choice: quizslopDisputeVoteChoiceValidator,
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireQuizslopBundle(ctx, authorized.game);
    requireOpenGame(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "DISPUTE_VOTE") {
      throw new ConvexError("The dispute vote is not open");
    }
    const round = await loadCurrentRoundOrThrow(ctx, bundle);
    if (!(await isEligible(ctx, round._id, "DISPUTE_VOTE", authorized.player._id))) {
      throw new ConvexError("You are not in this vote's roster");
    }
    const dispute = await ctx.db.get("quizSlopDisputes", args.disputeId);
    if (!dispute || dispute.roundId !== round._id || dispute.ruling !== undefined) {
      throw new ConvexError("That dispute is not open for voting");
    }
    const existing = await ctx.db
      .query("quizSlopDisputeVotes")
      .withIndex("by_disputeId_and_voterId", (index) =>
        index.eq("disputeId", dispute._id).eq("voterId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if (existing.choice === args.choice) return { phase: bundle.state.phase };
      throw new ConvexError("Your dispute vote is already locked");
    }
    const now = Date.now();
    await ctx.db.insert("quizSlopDisputeVotes", {
      gameId: bundle.game._id,
      roundId: round._id,
      disputeId: dispute._id,
      voterId: authorized.player._id,
      choice: args.choice,
      castAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

/**
 * Host advancement: closes a submission phase applying documented defaults,
 * or continues past a passive reveal/results phase. With timers disabled this
 * is the host's `Close phase`/`Continue` control.
 */
export const advance = mutation({
  args: { capability: v.string(), expectedPhaseGeneration: v.number() },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    const bundle = await requireQuizslopBundle(ctx, authorized.game);
    requireOpenGame(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (!canHostAdvanceQuizslopPhase(bundle.state.phase, bundle.game.timersDisabled)) {
      throw new ConvexError("This phase advances by player quorum or its server deadline");
    }
    const phase = await forceAdvanceQuizslop(ctx, bundle, Date.now());
    if (!phase) throw new ConvexError("Cannot advance from the current phase");
    return { phase };
  },
});

export const enforceDeadline = internalMutation({
  args: {
    gameId: v.id("games"),
    deadline: v.number(),
    phaseGeneration: v.number(),
  },
  returns: v.object({ advanced: v.boolean() }),
  handler: async (ctx, args) => {
    const bundle = await loadQuizslopBundle(ctx, args.gameId);
    const now = Date.now();
    if (
      !bundle ||
      bundle.game.finalizedAt !== undefined ||
      bundle.game.phaseGeneration !== args.phaseGeneration ||
      bundle.game.phaseDeadline !== args.deadline ||
      now < args.deadline
    ) {
      return { advanced: false };
    }
    const phase = await forceAdvanceQuizslop(ctx, bundle, now);
    return { advanced: phase !== null };
  },
});
