import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./_generated/server";
import { requireHostCapability, requirePlayerCapability } from "./capabilities";
import { requireExpectedPhaseGeneration } from "./gamePhase";
import {
  getQuizslopParticipant,
  getQuizslopState,
  listQuizslopParticipants,
  listRoundAssignments,
  loadCandidateAssignment,
  loadProxyAssignment,
  loadQuizslopRoundBySection,
  requireQuizslopGame,
} from "./quizslopData";
import { forceAdvanceQuizslop, settleQuizslopQuorum } from "./quizslopGameplay";
import { loadQuizslopBundle, type QuizslopEngineBundle } from "./quizslopLifecycle";
import { startQuizslopGame } from "./quizslopSetup";
import { quizslopPhaseValidator } from "./quizslopValidators";
import { canHostAdvanceQuizslopPhase } from "../src/games/quizslop/quizslop-phase-policy";

const phaseResultValidator = v.object({ phase: quizslopPhaseValidator });
const MAX_DEFENSE_LENGTH = 280;

async function requireBundle(ctx: MutationCtx, game: Doc<"games">): Promise<QuizslopEngineBundle> {
  requireQuizslopGame(game);
  return { game, state: await getQuizslopState(ctx, game._id) };
}

function requireOpen(bundle: QuizslopEngineBundle): void {
  if (bundle.game.finalizedAt !== undefined) throw new ConvexError("This QuizSlop exam has ended");
}

async function currentRound(ctx: MutationCtx, bundle: QuizslopEngineBundle) {
  const round = await loadQuizslopRoundBySection(ctx, bundle.game._id, bundle.state.deckPosition);
  if (!round) throw new ConvexError("QuizSlop section is missing");
  return round;
}

function requireChoice(selectedIndex: number): void {
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= 4) {
    throw new ConvexError("Invalid answer choice");
  }
}

export const start = mutation({
  args: { capability: v.string() },
  returns: v.object({ started: v.boolean(), totalRounds: v.number() }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    const bundle = await requireBundle(ctx, authorized.game);
    if (bundle.game.status !== "LOBBY") {
      return { started: false, totalRounds: bundle.game.totalRounds };
    }
    await startQuizslopGame(ctx, bundle, Date.now());
    return { started: true, totalRounds: bundle.game.totalRounds };
  },
});

export const submitScratch = mutation({
  args: {
    capability: v.string(),
    selectedIndex: v.number(),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    requireChoice(args.selectedIndex);
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireBundle(ctx, authorized.game);
    requireOpen(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "SCRATCH") throw new ConvexError("Scratch sheets are closed");
    const round = await currentRound(ctx, bundle);
    const assignment = await loadCandidateAssignment(ctx, round._id, authorized.player._id);
    if (!assignment) throw new ConvexError("You are not a candidate in this section");
    if (assignment.scratchLockedAt !== undefined) {
      if (assignment.scratchSelectedIndex === args.selectedIndex) {
        return { phase: bundle.state.phase };
      }
      throw new ConvexError("Your scratch answer is already locked");
    }
    const now = Date.now();
    await ctx.db.patch("quizSlopAssignments", assignment._id, {
      scratchSelectedIndex: args.selectedIndex,
      scratchLockedAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

export const submitProxyAnswer = mutation({
  args: {
    capability: v.string(),
    selectedIndex: v.number(),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    requireChoice(args.selectedIndex);
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireBundle(ctx, authorized.game);
    requireOpen(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "PROXY_ANSWER") {
      throw new ConvexError("Official answer sheets are closed");
    }
    const round = await currentRound(ctx, bundle);
    const assignment = await loadProxyAssignment(ctx, round._id, authorized.player._id);
    if (!assignment) throw new ConvexError("You have no proxy assignment this section");
    if (assignment.answerAuthority !== "PROXY") {
      throw new ConvexError("The proctor suspended you from proxy duty this section");
    }
    if (assignment.officialLockedAt !== undefined) {
      if (assignment.officialSelectedIndex === args.selectedIndex) {
        return { phase: bundle.state.phase };
      }
      throw new ConvexError("Your official answer is already locked");
    }
    const now = Date.now();
    await ctx.db.patch("quizSlopAssignments", assignment._id, {
      officialSelectedIndex: args.selectedIndex,
      officialLockedAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

/** One private ballot toward the orphaned GROUP answer, in addition to normal proxy duty. */
export const submitGroupAnswer = mutation({
  args: {
    capability: v.string(),
    selectedIndex: v.number(),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    requireChoice(args.selectedIndex);
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireBundle(ctx, authorized.game);
    requireOpen(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "PROXY_ANSWER") throw new ConvexError("Group ballots are closed");
    const participant = await getQuizslopParticipant(ctx, bundle.game._id, authorized.player._id);
    if (!participant) throw new ConvexError("You are not in the frozen roster");
    if (bundle.state.suspendedPlayerId === authorized.player._id) {
      throw new ConvexError("The suspended player cannot join the group ballot");
    }
    const round = await currentRound(ctx, bundle);
    const groupAssignment = (await listRoundAssignments(ctx, round._id)).find(
      (assignment) => assignment.answerAuthority === "GROUP",
    );
    if (!groupAssignment) throw new ConvexError("There is no group answer this section");
    const existing = await ctx.db
      .query("quizSlopGroupAnswers")
      .withIndex("by_assignmentId_and_voterId", (index) =>
        index.eq("assignmentId", groupAssignment._id).eq("voterId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if (existing.selectedIndex === args.selectedIndex) return { phase: bundle.state.phase };
      throw new ConvexError("Your group ballot is already locked");
    }
    const now = Date.now();
    await ctx.db.insert("quizSlopGroupAnswers", {
      gameId: bundle.game._id,
      roundId: round._id,
      assignmentId: groupAssignment._id,
      voterId: authorized.player._id,
      selectedIndex: args.selectedIndex,
      lockedAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

export const submitDefense = mutation({
  args: {
    capability: v.string(),
    assignmentId: v.id("quizSlopAssignments"),
    text: v.string(),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireBundle(ctx, authorized.game);
    requireOpen(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "ORAL_DEFENSE") throw new ConvexError("Oral defense is closed");
    const text = args.text.trim();
    if (!text || text.length > MAX_DEFENSE_LENGTH) {
      throw new ConvexError(`Defense must be 1-${MAX_DEFENSE_LENGTH} characters`);
    }
    const round = await currentRound(ctx, bundle);
    const assignment = await ctx.db.get("quizSlopAssignments", args.assignmentId);
    if (!assignment || assignment.roundId !== round._id || assignment.officialCorrect !== false) {
      throw new ConvexError("That assignment does not require an oral defense");
    }
    const isCandidate = assignment.candidatePlayerId === authorized.player._id;
    const isProxy =
      assignment.answerAuthority === "PROXY" && assignment.proxyPlayerId === authorized.player._id;
    if (!isCandidate && !isProxy) throw new ConvexError("You are not assigned to this defense");
    const existing = await ctx.db
      .query("quizSlopDefenses")
      .withIndex("by_assignmentId_and_playerId", (index) =>
        index.eq("assignmentId", assignment._id).eq("playerId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if (existing.text === text) return { phase: bundle.state.phase };
      throw new ConvexError("Your oral defense is already on the record");
    }
    const now = Date.now();
    await ctx.db.insert("quizSlopDefenses", {
      gameId: bundle.game._id,
      roundId: round._id,
      assignmentId: assignment._id,
      playerId: authorized.player._id,
      kind: isCandidate ? "CANDIDATE" : "PROXY",
      text,
      submittedAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

export const castSuspensionVote = mutation({
  args: {
    capability: v.string(),
    targetPlayerId: v.union(v.id("players"), v.null()),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireBundle(ctx, authorized.game);
    requireOpen(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "PROCTOR_REVIEW_VOTE") {
      throw new ConvexError("The Proctor Review ballot is closed");
    }
    const participants = await listQuizslopParticipants(ctx, bundle.game._id);
    if (!participants.some((participant) => participant.playerId === authorized.player._id)) {
      throw new ConvexError("You are not in the frozen roster");
    }
    if (
      args.targetPlayerId !== null &&
      !participants.some((participant) => participant.playerId === args.targetPlayerId)
    ) {
      throw new ConvexError("That player is not on the exam roster");
    }
    const existing = await ctx.db
      .query("quizSlopSuspensionVotes")
      .withIndex("by_gameId_and_playerId", (index) =>
        index.eq("gameId", bundle.game._id).eq("playerId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if ((existing.targetPlayerId ?? null) === args.targetPlayerId) {
        return { phase: bundle.state.phase };
      }
      throw new ConvexError("Your suspension ballot is already locked");
    }
    const now = Date.now();
    await ctx.db.insert("quizSlopSuspensionVotes", {
      gameId: bundle.game._id,
      playerId: authorized.player._id,
      ...(args.targetPlayerId ? { targetPlayerId: args.targetPlayerId } : {}),
      castAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

export const castFinalAccusation = mutation({
  args: {
    capability: v.string(),
    targetPlayerId: v.id("players"),
    expectedPhaseGeneration: v.number(),
  },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    const bundle = await requireBundle(ctx, authorized.game);
    requireOpen(bundle);
    requireExpectedPhaseGeneration(bundle.game.phaseGeneration, args.expectedPhaseGeneration);
    if (bundle.state.phase !== "FINAL_ACCUSATION") {
      throw new ConvexError("The Academic Integrity Hearing is closed");
    }
    const participants = await listQuizslopParticipants(ctx, bundle.game._id);
    if (!participants.some((participant) => participant.playerId === authorized.player._id)) {
      throw new ConvexError("You are not in the frozen roster");
    }
    if (!participants.some((participant) => participant.playerId === args.targetPlayerId)) {
      throw new ConvexError("That player is not on the exam roster");
    }
    const existing = await ctx.db
      .query("quizSlopAccusations")
      .withIndex("by_gameId_and_playerId", (index) =>
        index.eq("gameId", bundle.game._id).eq("playerId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if (existing.targetPlayerId === args.targetPlayerId) return { phase: bundle.state.phase };
      throw new ConvexError("Your accusation is already locked");
    }
    const now = Date.now();
    await ctx.db.insert("quizSlopAccusations", {
      gameId: bundle.game._id,
      playerId: authorized.player._id,
      targetPlayerId: args.targetPlayerId,
      castAt: now,
    });
    const advanced = await settleQuizslopQuorum(ctx, bundle, now);
    return { phase: advanced ?? bundle.state.phase };
  },
});

export const advance = mutation({
  args: { capability: v.string(), expectedPhaseGeneration: v.number() },
  returns: phaseResultValidator,
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    const bundle = await requireBundle(ctx, authorized.game);
    requireOpen(bundle);
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
  args: { gameId: v.id("games"), deadline: v.number(), phaseGeneration: v.number() },
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
    return { advanced: (await forceAdvanceQuizslop(ctx, bundle, now)) !== null };
  },
});
