import { vResultValidator } from "@convex-dev/workpool";
import { vWorkflowId } from "@convex-dev/workflow";
import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  imagePipelineRef,
  type ImageContext,
  type PersistResult,
  type PostMortemContext,
  type ProfileContext,
  type ReplyContext,
  type ResponseContext,
  type VoteContext,
} from "./matchslopContracts";
import {
  canGenerateMatchSlopProfile,
  isActiveMatchSlopCompetitor,
  isMatchSlopGame,
  listMatchSlopPlayers,
  loadMatchSlopRound,
  loadMatchSlopState,
  loadMatchSlopTranscript,
} from "./matchslopData";
import {
  addMatchSlopUsage,
  cancelMatchSlopJob,
  claimMatchSlopJob,
  expectedMatchSlopGenerationKey,
  finishMatchSlopJob,
  getMatchSlopDeadline,
  getRemainingMatchSlopTimeout,
  loadMatchSlopJobAndGame,
  markMatchSlopClaimStale,
  queueAiResponseWorkflows,
  queueMatchSlopWorkflow,
  scheduleMatchSlopDeadline,
  staleMatchSlopContext,
} from "./matchslopJobs";
import { settleMatchSlopQuorum } from "./matchslopRoundEngine";
import {
  buildConversationContext,
  buildRoundPromptText,
  emptyPendingPersonaReply,
  readMatchSlopRuntimeState,
} from "./matchslopState";
import {
  matchSlopImageContextValidator,
  matchSlopPersistResultValidator,
  matchSlopPostMortemContextValidator,
  matchSlopPostMortemValidator,
  matchSlopProfileContextValidator,
  matchSlopProfileValidator,
  matchSlopReplyContextValidator,
  matchSlopResponseContextValidator,
  matchSlopUsageValidator,
  matchSlopVoteContextValidator,
} from "./matchslopValidators";
import { MATCHSLOP_PERSONA_EXAMPLES } from "../src/games/matchslop/config/persona-examples";
import {
  MATCHSLOP_PHOTO_PROMPT_ID,
  MATCHSLOP_PHOTO_PROMPT_TEXT,
  MATCHSLOP_WRITING_SECONDS,
} from "../src/games/matchslop/config/game-config";
import { FORFEIT_MARKER } from "../src/games/core/constants";
import { sanitize } from "../src/lib/sanitize";

const MAX_RESPONSE_LENGTH = 200;

export const claimProfile = internalMutation({
  args: { gameId: v.id("games"), jobId: v.id("generationJobs") },
  returns: matchSlopProfileContextValidator,
  handler: async (ctx, args): Promise<ProfileContext> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return staleMatchSlopContext("Profile job or game no longer exists");
    const { job, game } = loaded;
    if (job.kind !== "MATCHSLOP_PROFILE") {
      return markMatchSlopClaimStale(ctx, job, "Generation job kind changed");
    }
    const state = await loadMatchSlopState(ctx, game._id);
    const runtime = state ? readMatchSlopRuntimeState(state) : null;
    if (
      !isMatchSlopGame(game) ||
      !state ||
      !game.personaModelId ||
      !canGenerateMatchSlopProfile(game) ||
      runtime?.profile
    ) {
      return markMatchSlopClaimStale(ctx, job, "Profile target is no longer current");
    }
    if (!(await claimMatchSlopJob(ctx, job))) {
      return staleMatchSlopContext(`Profile job is already ${job.status.toLowerCase()}`);
    }
    const generationId = job._id;
    const now = Date.now();
    await ctx.db.patch("matchSlopState", state._id, {
      profileDraft: undefined,
      profileGeneration: {
        status: "STREAMING",
        updatedAt: new Date(now).toISOString(),
        generationId,
      },
      updatedAt: now,
    });
    const selected = new Set(state.selectedPersonaExampleIds);
    const personaExamples = MATCHSLOP_PERSONA_EXAMPLES.filter((example) =>
      selected.has(example.id),
    );
    return {
      kind: "ready",
      modelId: game.personaModelId,
      seekerIdentity: state.seekerIdentity,
      personaIdentity: state.personaIdentity,
      personaExamples:
        personaExamples.length > 0
          ? personaExamples
          : MATCHSLOP_PERSONA_EXAMPLES.filter(
              (example) => example.identity === state.personaIdentity,
            ).slice(0, 1),
    };
  },
});

export const persistProfile = internalMutation({
  args: {
    gameId: v.id("games"),
    jobId: v.id("generationJobs"),
    profile: matchSlopProfileValidator,
    usage: matchSlopUsageValidator,
  },
  returns: matchSlopPersistResultValidator,
  handler: async (ctx, args): Promise<PersistResult> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return { status: "CANCELED" };
    const { job, game } = loaded;
    const state = await loadMatchSlopState(ctx, game._id);
    if (!state) {
      await cancelMatchSlopJob(ctx, job, "MatchSlop state was deleted");
      return { status: "CANCELED" };
    }
    const runtime = readMatchSlopRuntimeState(state);
    if (job.status === "SUCCEEDED" && runtime.profile) return { status: "DUPLICATE" };
    if (
      job.status !== "RUNNING" ||
      job.kind !== "MATCHSLOP_PROFILE" ||
      !isMatchSlopGame(game) ||
      !canGenerateMatchSlopProfile(game) ||
      runtime.profileGeneration.generationId !== job._id
    ) {
      await cancelMatchSlopJob(ctx, job, "Profile result became stale before persistence");
      return { status: "CANCELED" };
    }
    const profile = readMatchSlopRuntimeState({ profile: args.profile }).profile;
    if (!profile) throw new ConvexError("Generated MatchSlop profile is invalid");
    const now = Date.now();
    const bundle = game.status === "WRITING" ? await loadMatchSlopRound(ctx, game._id, 1) : null;
    if (game.status === "WRITING" && !bundle) {
      await cancelMatchSlopJob(ctx, job, "Opening round was removed");
      return { status: "CANCELED" };
    }
    const phaseDeadline =
      game.status === "WRITING"
        ? getMatchSlopDeadline(game, now, MATCHSLOP_WRITING_SECONDS)
        : undefined;
    if (bundle) {
      await ctx.db.patch("prompts", bundle.prompt._id, {
        text: buildRoundPromptText(1, profile, []),
      });
    }
    await ctx.db.patch("matchSlopState", state._id, {
      profile,
      profileDraft: undefined,
      profileGeneration: {
        status: "READY",
        updatedAt: new Date(now).toISOString(),
        generationId: job._id,
      },
      personaImage: {
        status: "PENDING",
        imageUrl: null,
        updatedAt: new Date(now).toISOString(),
      },
      updatedAt: now,
    });
    await ctx.db.patch("games", game._id, {
      ...(game.status === "WRITING" ? { phaseDeadline } : {}),
      updatedAt: now,
    });
    if (phaseDeadline !== undefined) {
      await scheduleMatchSlopDeadline(ctx, {
        gameId: game._id,
        deadline: phaseDeadline,
        phaseGeneration: game.phaseGeneration,
      });
    }
    await addMatchSlopUsage(ctx, game, args.usage);
    await finishMatchSlopJob(ctx, job, "SUCCEEDED");
    await queueMatchSlopWorkflow(ctx, {
      gameId: game._id,
      generationKey: `matchslop:image:${job._id}`,
      kind: "MATCHSLOP_IMAGE",
      stage: "IMAGE",
      targetId: job._id,
      workflow: imagePipelineRef,
    });
    const refreshedGame = await ctx.db.get("games", game._id);
    if (refreshedGame?.status === "WRITING") await queueAiResponseWorkflows(ctx, refreshedGame);
    return { status: "SUCCEEDED" };
  },
});

export const claimImage = internalMutation({
  args: { gameId: v.id("games"), jobId: v.id("generationJobs") },
  returns: matchSlopImageContextValidator,
  handler: async (ctx, args): Promise<ImageContext> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return staleMatchSlopContext("Image job or game no longer exists");
    const { job, game } = loaded;
    const state = await loadMatchSlopState(ctx, game._id);
    const runtime = state ? readMatchSlopRuntimeState(state) : null;
    if (
      job.kind !== "MATCHSLOP_IMAGE" ||
      !isMatchSlopGame(game) ||
      !game.personaModelId ||
      !state ||
      !runtime?.profile ||
      runtime.personaImage.status !== "PENDING"
    ) {
      return markMatchSlopClaimStale(ctx, job, "Persona image target is no longer current");
    }
    if (!(await claimMatchSlopJob(ctx, job))) {
      return staleMatchSlopContext(`Image job is already ${job.status.toLowerCase()}`);
    }
    const now = Date.now();
    await ctx.db.patch("matchSlopState", state._id, {
      personaImage: {
        status: "PROCESSING",
        imageUrl: null,
        updatedAt: new Date(now).toISOString(),
      },
      updatedAt: now,
    });
    const selected = new Set(state.selectedPersonaExampleIds);
    const examples = MATCHSLOP_PERSONA_EXAMPLES.filter((example) => selected.has(example.id));
    return {
      kind: "ready",
      modelId: game.personaModelId,
      personaIdentity: state.personaIdentity,
      profile: runtime.profile,
      personaExamples: examples,
    };
  },
});

export const persistImage = internalMutation({
  args: {
    gameId: v.id("games"),
    jobId: v.id("generationJobs"),
    imageUrl: v.string(),
    usage: matchSlopUsageValidator,
  },
  returns: matchSlopPersistResultValidator,
  handler: async (ctx, args): Promise<PersistResult> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return { status: "CANCELED" };
    const { job, game } = loaded;
    const state = await loadMatchSlopState(ctx, game._id);
    if (!state) {
      await cancelMatchSlopJob(ctx, job, "MatchSlop state was deleted");
      return { status: "CANCELED" };
    }
    const runtime = readMatchSlopRuntimeState(state);
    if (job.status === "SUCCEEDED" && runtime.personaImage.status === "READY") {
      return { status: "DUPLICATE" };
    }
    if (
      job.status !== "RUNNING" ||
      job.kind !== "MATCHSLOP_IMAGE" ||
      !isMatchSlopGame(game) ||
      runtime.personaImage.status !== "PROCESSING"
    ) {
      await cancelMatchSlopJob(ctx, job, "Persona image result became stale before persistence");
      return { status: "CANCELED" };
    }
    const imageUrl = args.imageUrl.trim();
    if (!imageUrl) throw new ConvexError("Persona image URL cannot be empty");
    const now = Date.now();
    await ctx.db.patch("matchSlopState", state._id, {
      personaImage: {
        status: "READY",
        imageUrl,
        updatedAt: new Date(now).toISOString(),
      },
      updatedAt: now,
    });
    await addMatchSlopUsage(ctx, game, args.usage);
    await finishMatchSlopJob(ctx, job, "SUCCEEDED");
    return { status: "SUCCEEDED" };
  },
});

export const claimResponse = internalMutation({
  args: { gameId: v.id("games"), jobId: v.id("generationJobs") },
  returns: matchSlopResponseContextValidator,
  handler: async (ctx, args): Promise<ResponseContext> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return staleMatchSlopContext("Response job or game no longer exists");
    const { job, game } = loaded;
    const playerId = job.targetId ? ctx.db.normalizeId("players", job.targetId) : null;
    const [player, state, bundle, transcript] = await Promise.all([
      playerId ? ctx.db.get("players", playerId) : null,
      loadMatchSlopState(ctx, game._id),
      loadMatchSlopRound(ctx, game._id, game.currentRound),
      loadMatchSlopTranscript(ctx, game._id),
    ]);
    const runtime = state ? readMatchSlopRuntimeState(state) : null;
    if (
      job.kind !== "RESPONSE" ||
      !isMatchSlopGame(game) ||
      game.status !== "WRITING" ||
      !player ||
      player.gameId !== game._id ||
      player.type !== "AI" ||
      player.participationStatus !== "ACTIVE" ||
      !player.modelId ||
      !state ||
      !runtime?.profile ||
      !bundle ||
      job.generationKey !== expectedMatchSlopGenerationKey("RESPONSE", game, player._id) ||
      !bundle.assignments.some((assignment) => assignment.playerId === player._id)
    ) {
      return markMatchSlopClaimStale(ctx, job, "AI response target is no longer current");
    }
    const existing = bundle.responses.find((response) => response.playerId === player._id);
    if (existing) {
      await finishMatchSlopJob(ctx, job, "SUCCEEDED");
      return staleMatchSlopContext("AI response already exists");
    }
    if (!(await claimMatchSlopJob(ctx, job))) {
      return staleMatchSlopContext(`AI response job is already ${job.status.toLowerCase()}`);
    }
    return {
      kind: "ready",
      modelId: player.modelId,
      currentRound: game.currentRound,
      profile: runtime.profile,
      examples: state.selectedPlayerExamples,
      conversationContext: buildConversationContext(
        runtime.profile,
        transcript,
        bundle.prompt.text,
      ),
      timeoutMs: getRemainingMatchSlopTimeout(game.phaseDeadline),
    };
  },
});

export const persistResponse = internalMutation({
  args: {
    gameId: v.id("games"),
    jobId: v.id("generationJobs"),
    text: v.string(),
    selectedPromptId: v.union(v.string(), v.null()),
    failReason: v.union(v.string(), v.null()),
    usage: matchSlopUsageValidator,
  },
  returns: matchSlopPersistResultValidator,
  handler: async (ctx, args): Promise<PersistResult> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return { status: "CANCELED" };
    const { job, game } = loaded;
    const playerId = job.targetId ? ctx.db.normalizeId("players", job.targetId) : null;
    const [player, state, bundle] = await Promise.all([
      playerId ? ctx.db.get("players", playerId) : null,
      loadMatchSlopState(ctx, game._id),
      loadMatchSlopRound(ctx, game._id, game.currentRound),
    ]);
    if (!player || !state || !bundle) {
      await cancelMatchSlopJob(ctx, job, "AI response dependencies disappeared");
      return { status: "CANCELED" };
    }
    const runtime = readMatchSlopRuntimeState(state);
    const existing = bundle.responses.find((response) => response.playerId === player._id);
    if (existing) {
      if (job.status !== "SUCCEEDED") await finishMatchSlopJob(ctx, job, "SUCCEEDED");
      return { status: "DUPLICATE" };
    }
    if (
      job.status !== "RUNNING" ||
      job.kind !== "RESPONSE" ||
      !isMatchSlopGame(game) ||
      game.status !== "WRITING" ||
      player.gameId !== game._id ||
      player.type !== "AI" ||
      player.participationStatus !== "ACTIVE" ||
      job.generationKey !== expectedMatchSlopGenerationKey("RESPONSE", game, player._id) ||
      !bundle.assignments.some((assignment) => assignment.playerId === player._id)
    ) {
      await cancelMatchSlopJob(ctx, job, "AI response result became stale before persistence");
      return { status: "CANCELED" };
    }
    const text =
      args.text === FORFEIT_MARKER ? FORFEIT_MARKER : sanitize(args.text, MAX_RESPONSE_LENGTH);
    if (!text) throw new ConvexError("Generated MatchSlop response is empty");
    let metadata: Record<string, unknown> | undefined;
    if (game.currentRound === 1) {
      const selectedPrompt = runtime.profile?.prompts.find(
        (prompt) => prompt.id === args.selectedPromptId,
      );
      metadata = {
        selectedPromptId: selectedPrompt?.id ?? runtime.profile?.prompts[0]?.id ?? null,
        selectedPromptText:
          args.selectedPromptId === MATCHSLOP_PHOTO_PROMPT_ID
            ? MATCHSLOP_PHOTO_PROMPT_TEXT
            : (selectedPrompt?.prompt ?? runtime.profile?.prompts[0]?.prompt ?? null),
      };
    }
    await ctx.db.insert("responses", {
      gameId: game._id,
      roundId: bundle.round._id,
      promptId: bundle.prompt._id,
      playerId: player._id,
      text,
      ...(metadata ? { metadata } : {}),
      pointsEarned: 0,
      ...(args.failReason ? { failReason: args.failReason } : {}),
      submittedAt: Date.now(),
    });
    await addMatchSlopUsage(ctx, game, args.usage);
    await finishMatchSlopJob(ctx, job, "SUCCEEDED");
    const refreshedGame = await ctx.db.get("games", game._id);
    if (refreshedGame) await settleMatchSlopQuorum(ctx, refreshedGame, Date.now());
    return { status: "SUCCEEDED" };
  },
});

export const claimVote = internalMutation({
  args: { gameId: v.id("games"), jobId: v.id("generationJobs") },
  returns: matchSlopVoteContextValidator,
  handler: async (ctx, args): Promise<VoteContext> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return staleMatchSlopContext("Vote job or game no longer exists");
    const { job, game } = loaded;
    const playerId = job.targetId ? ctx.db.normalizeId("players", job.targetId) : null;
    const [player, state, bundle, transcript] = await Promise.all([
      playerId ? ctx.db.get("players", playerId) : null,
      loadMatchSlopState(ctx, game._id),
      loadMatchSlopRound(ctx, game._id, game.currentRound),
      loadMatchSlopTranscript(ctx, game._id),
    ]);
    const runtime = state ? readMatchSlopRuntimeState(state) : null;
    if (
      job.kind !== "VOTE" ||
      !isMatchSlopGame(game) ||
      game.status !== "VOTING" ||
      game.votingRevealing ||
      !player ||
      player.gameId !== game._id ||
      player.type !== "AI" ||
      player.participationStatus !== "ACTIVE" ||
      !player.modelId ||
      !state ||
      !bundle ||
      job.generationKey !== expectedMatchSlopGenerationKey("VOTE", game, player._id) ||
      !bundle.assignments.some((assignment) => assignment.playerId === player._id)
    ) {
      return markMatchSlopClaimStale(ctx, job, "AI vote target is no longer current");
    }
    const existing = bundle.votes.find((vote) => vote.voterId === player._id);
    if (existing) {
      await finishMatchSlopJob(ctx, job, "SUCCEEDED");
      return staleMatchSlopContext("AI vote already exists");
    }
    if (!(await claimMatchSlopJob(ctx, job))) {
      return staleMatchSlopContext(`AI vote job is already ${job.status.toLowerCase()}`);
    }
    return {
      kind: "ready",
      modelId: player.modelId,
      conversationContext: buildConversationContext(
        runtime?.profile ?? null,
        transcript,
        bundle.prompt.text,
      ),
      seedKey: `${game._id}:${game.currentRound}:${player._id}`,
      timeoutMs: getRemainingMatchSlopTimeout(game.phaseDeadline),
      responses: bundle.responses
        .filter((response) => response.text !== FORFEIT_MARKER && response.playerId !== player._id)
        .map((response) => ({ id: response._id, text: response.text })),
    };
  },
});

export const persistVote = internalMutation({
  args: {
    gameId: v.id("games"),
    jobId: v.id("generationJobs"),
    responseId: v.union(v.string(), v.null()),
    failReason: v.union(v.string(), v.null()),
    usage: matchSlopUsageValidator,
  },
  returns: matchSlopPersistResultValidator,
  handler: async (ctx, args): Promise<PersistResult> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return { status: "CANCELED" };
    const { job, game } = loaded;
    const playerId = job.targetId ? ctx.db.normalizeId("players", job.targetId) : null;
    const [player, bundle] = await Promise.all([
      playerId ? ctx.db.get("players", playerId) : null,
      loadMatchSlopRound(ctx, game._id, game.currentRound),
    ]);
    if (!player || !bundle) {
      await cancelMatchSlopJob(ctx, job, "AI vote dependencies disappeared");
      return { status: "CANCELED" };
    }
    const existing = bundle.votes.find((vote) => vote.voterId === player._id);
    if (existing) {
      if (job.status !== "SUCCEEDED") await finishMatchSlopJob(ctx, job, "SUCCEEDED");
      return { status: "DUPLICATE" };
    }
    if (
      job.status !== "RUNNING" ||
      job.kind !== "VOTE" ||
      !isMatchSlopGame(game) ||
      game.status !== "VOTING" ||
      game.votingRevealing ||
      player.gameId !== game._id ||
      player.type !== "AI" ||
      player.participationStatus !== "ACTIVE" ||
      job.generationKey !== expectedMatchSlopGenerationKey("VOTE", game, player._id)
    ) {
      await cancelMatchSlopJob(ctx, job, "AI vote result became stale before persistence");
      return { status: "CANCELED" };
    }
    const selectedId = args.responseId ? ctx.db.normalizeId("responses", args.responseId) : null;
    const selected = selectedId
      ? bundle.responses.find(
          (response) => response._id === selectedId && response.playerId !== player._id,
        )
      : null;
    await ctx.db.insert("votes", {
      gameId: game._id,
      roundId: bundle.round._id,
      promptId: bundle.prompt._id,
      voterId: player._id,
      ...(selected ? { responseId: selected._id } : {}),
      ...(!selected && args.responseId
        ? { failReason: args.failReason ?? "invalid-response" }
        : args.failReason
          ? { failReason: args.failReason }
          : {}),
      castAt: Date.now(),
    });
    await addMatchSlopUsage(ctx, game, args.usage);
    await finishMatchSlopJob(ctx, job, "SUCCEEDED");
    const refreshedGame = await ctx.db.get("games", game._id);
    if (refreshedGame) await settleMatchSlopQuorum(ctx, refreshedGame, Date.now());
    return { status: "SUCCEEDED" };
  },
});

export const claimReply = internalMutation({
  args: { gameId: v.id("games"), jobId: v.id("generationJobs") },
  returns: matchSlopReplyContextValidator,
  handler: async (ctx, args): Promise<ReplyContext> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return staleMatchSlopContext("Persona reply job or game no longer exists");
    const { job, game } = loaded;
    const [state, transcript] = await Promise.all([
      loadMatchSlopState(ctx, game._id),
      loadMatchSlopTranscript(ctx, game._id),
    ]);
    const runtime = state ? readMatchSlopRuntimeState(state) : null;
    if (
      job.kind !== "MATCHSLOP_PERSONA_REPLY" ||
      !isMatchSlopGame(game) ||
      game.status !== "ROUND_RESULTS" ||
      !game.personaModelId ||
      !state ||
      !runtime?.profile ||
      !runtime.lastRoundResult ||
      runtime.pendingPersonaReply.status !== "NOT_REQUESTED" ||
      job.generationKey !== `matchslop:reply:${game.currentRound}:${game.phaseGeneration}`
    ) {
      return markMatchSlopClaimStale(ctx, job, "Persona reply target is no longer current");
    }
    if (!(await claimMatchSlopJob(ctx, job))) {
      return staleMatchSlopContext(`Persona reply job is already ${job.status.toLowerCase()}`);
    }
    const generationId = job._id;
    await ctx.db.patch("matchSlopState", state._id, {
      pendingPersonaReply: {
        status: "GENERATING",
        reply: null,
        outcome: null,
        moodDelta: null,
        generationId,
        signalCategory: null,
        sideComment: null,
        nextSignal: null,
      },
      updatedAt: Date.now(),
    });
    return {
      kind: "ready",
      modelId: game.personaModelId,
      seekerIdentity: state.seekerIdentity,
      personaIdentity: state.personaIdentity,
      profile: runtime.profile,
      currentMood: state.mood,
      forceContinue: game.currentRound === 1,
      transcript: [
        ...transcript.map((entry) => ({
          speaker: entry.speaker,
          text: entry.text,
          authorName: entry.authorName ?? null,
        })),
        {
          speaker: "PLAYERS" as const,
          text: runtime.lastRoundResult.winnerText,
          authorName: runtime.lastRoundResult.authorName,
        },
      ],
    };
  },
});

export const persistReply = internalMutation({
  args: {
    gameId: v.id("games"),
    jobId: v.id("generationJobs"),
    reply: v.string(),
    outcome: v.union(v.literal("CONTINUE"), v.literal("DATE_SEALED"), v.literal("UNMATCHED")),
    moodDelta: v.number(),
    signalCategory: v.union(v.string(), v.null()),
    sideComment: v.union(v.string(), v.null()),
    nextSignal: v.union(v.string(), v.null()),
    usage: matchSlopUsageValidator,
  },
  returns: matchSlopPersistResultValidator,
  handler: async (ctx, args): Promise<PersistResult> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return { status: "CANCELED" };
    const { job, game } = loaded;
    const state = await loadMatchSlopState(ctx, game._id);
    if (!state) {
      await cancelMatchSlopJob(ctx, job, "MatchSlop state was deleted");
      return { status: "CANCELED" };
    }
    const runtime = readMatchSlopRuntimeState(state);
    if (job.status === "SUCCEEDED" && runtime.pendingPersonaReply.status === "READY") {
      return { status: "DUPLICATE" };
    }
    if (
      job.status !== "RUNNING" ||
      job.kind !== "MATCHSLOP_PERSONA_REPLY" ||
      !isMatchSlopGame(game) ||
      game.status !== "ROUND_RESULTS" ||
      job.generationKey !== `matchslop:reply:${game.currentRound}:${game.phaseGeneration}` ||
      runtime.pendingPersonaReply.status !== "GENERATING" ||
      runtime.pendingPersonaReply.generationId !== job._id
    ) {
      await cancelMatchSlopJob(ctx, job, "Persona reply result became stale before persistence");
      return { status: "CANCELED" };
    }
    const reply = sanitize(args.reply, 500);
    if (!reply) throw new ConvexError("Generated persona reply is empty");
    await ctx.db.patch("matchSlopState", state._id, {
      pendingPersonaReply: {
        status: "READY",
        reply,
        outcome: game.currentRound === 1 ? "CONTINUE" : args.outcome,
        moodDelta: Math.max(-50, Math.min(50, Math.round(args.moodDelta))),
        generationId: job._id,
        signalCategory: args.signalCategory,
        sideComment: args.sideComment,
        nextSignal: args.nextSignal,
      },
      updatedAt: Date.now(),
    });
    await addMatchSlopUsage(ctx, game, args.usage);
    await finishMatchSlopJob(ctx, job, "SUCCEEDED");
    return { status: "SUCCEEDED" };
  },
});

export const claimPostMortem = internalMutation({
  args: { gameId: v.id("games"), jobId: v.id("generationJobs") },
  returns: matchSlopPostMortemContextValidator,
  handler: async (ctx, args): Promise<PostMortemContext> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return staleMatchSlopContext("Postmortem job or game no longer exists");
    const { job, game } = loaded;
    const [state, transcript, players] = await Promise.all([
      loadMatchSlopState(ctx, game._id),
      loadMatchSlopTranscript(ctx, game._id),
      listMatchSlopPlayers(ctx, game._id),
    ]);
    const runtime = state ? readMatchSlopRuntimeState(state) : null;
    const playerNames = players
      .filter(isActiveMatchSlopCompetitor)
      .map((player) => player.name)
      .sort();
    if (
      job.kind !== "MATCHSLOP_POST_MORTEM" ||
      !isMatchSlopGame(game) ||
      game.status !== "FINAL_RESULTS" ||
      !game.personaModelId ||
      !state ||
      !runtime?.profile ||
      runtime.postMortem ||
      runtime.postMortemGeneration.status !== "NOT_REQUESTED" ||
      playerNames.length === 0
    ) {
      return markMatchSlopClaimStale(ctx, job, "Postmortem target is no longer current");
    }
    if (!(await claimMatchSlopJob(ctx, job))) {
      return staleMatchSlopContext(`Postmortem job is already ${job.status.toLowerCase()}`);
    }
    const now = Date.now();
    await ctx.db.patch("matchSlopState", state._id, {
      postMortemDraft: undefined,
      postMortemGeneration: {
        status: "STREAMING",
        updatedAt: new Date(now).toISOString(),
        generationId: job._id,
      },
      updatedAt: now,
    });
    return {
      kind: "ready",
      modelId: game.personaModelId,
      personaIdentity: state.personaIdentity,
      profile: runtime.profile,
      outcome: state.outcome,
      playerNames,
      transcript: transcript.map((entry) => ({
        speaker: entry.speaker,
        text: entry.text,
        authorName: entry.authorName ?? null,
      })),
    };
  },
});

export const persistPostMortem = internalMutation({
  args: {
    gameId: v.id("games"),
    jobId: v.id("generationJobs"),
    postMortem: matchSlopPostMortemValidator,
    usage: matchSlopUsageValidator,
  },
  returns: matchSlopPersistResultValidator,
  handler: async (ctx, args): Promise<PersistResult> => {
    const loaded = await loadMatchSlopJobAndGame(ctx, args);
    if (!loaded) return { status: "CANCELED" };
    const { job, game } = loaded;
    const state = await loadMatchSlopState(ctx, game._id);
    if (!state) {
      await cancelMatchSlopJob(ctx, job, "MatchSlop state was deleted");
      return { status: "CANCELED" };
    }
    const runtime = readMatchSlopRuntimeState(state);
    if (job.status === "SUCCEEDED" && runtime.postMortem) return { status: "DUPLICATE" };
    if (
      job.status !== "RUNNING" ||
      job.kind !== "MATCHSLOP_POST_MORTEM" ||
      !isMatchSlopGame(game) ||
      game.status !== "FINAL_RESULTS" ||
      runtime.postMortemGeneration.status !== "STREAMING" ||
      runtime.postMortemGeneration.generationId !== job._id
    ) {
      await cancelMatchSlopJob(ctx, job, "Postmortem result became stale before persistence");
      return { status: "CANCELED" };
    }
    const postMortem = readMatchSlopRuntimeState({ postMortem: args.postMortem }).postMortem;
    if (!postMortem) throw new ConvexError("Generated MatchSlop postmortem is invalid");
    const now = Date.now();
    await ctx.db.patch("matchSlopState", state._id, {
      postMortem,
      postMortemDraft: undefined,
      postMortemGeneration: {
        status: "READY",
        updatedAt: new Date(now).toISOString(),
        generationId: job._id,
      },
      updatedAt: now,
    });
    await addMatchSlopUsage(ctx, game, args.usage);
    await finishMatchSlopJob(ctx, job, "SUCCEEDED");
    return { status: "SUCCEEDED" };
  },
});

export const completeWorkflow = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({
      gameId: v.id("games"),
      jobId: v.id("generationJobs"),
      stage: v.union(
        v.literal("PROFILE"),
        v.literal("IMAGE"),
        v.literal("RESPONSE"),
        v.literal("VOTE"),
        v.literal("REPLY"),
        v.literal("POST_MORTEM"),
      ),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.context.jobId);
    if (
      !job ||
      job.gameId !== args.context.gameId ||
      (job.workflowId !== undefined && job.workflowId !== args.workflowId) ||
      job.status === "SUCCEEDED" ||
      job.status === "CANCELED" ||
      job.status === "FAILED"
    ) {
      return null;
    }
    const error =
      args.result.kind === "failed"
        ? args.result.error
        : args.result.kind === "canceled"
          ? "Workflow was canceled"
          : "Workflow completed without persisting its result";
    const status = args.result.kind === "canceled" ? "CANCELED" : "FAILED";
    const now = Date.now();
    await ctx.db.patch("generationJobs", job._id, {
      status,
      error,
      completedAt: now,
      updatedAt: now,
    });

    const state = await loadMatchSlopState(ctx, job.gameId);
    if (!state) return null;
    const runtime = readMatchSlopRuntimeState(state);
    const generationId = job._id;
    if (
      args.context.stage === "PROFILE" &&
      !runtime.profile &&
      (runtime.profileGeneration.generationId === generationId ||
        runtime.profileGeneration.status === "NOT_REQUESTED")
    ) {
      await ctx.db.patch("matchSlopState", state._id, {
        profileGeneration: {
          status: "FAILED",
          updatedAt: new Date(now).toISOString(),
          generationId,
        },
        updatedAt: now,
      });
    } else if (
      args.context.stage === "IMAGE" &&
      (runtime.personaImage.status === "PENDING" || runtime.personaImage.status === "PROCESSING")
    ) {
      await ctx.db.patch("matchSlopState", state._id, {
        personaImage: {
          status: "FAILED",
          imageUrl: null,
          updatedAt: new Date(now).toISOString(),
        },
        updatedAt: now,
      });
    } else if (
      args.context.stage === "REPLY" &&
      (runtime.pendingPersonaReply.generationId === generationId ||
        runtime.pendingPersonaReply.status === "NOT_REQUESTED")
    ) {
      await ctx.db.patch("matchSlopState", state._id, {
        pendingPersonaReply: {
          ...emptyPendingPersonaReply(),
          status: "FAILED",
          generationId,
        },
        updatedAt: now,
      });
    } else if (
      args.context.stage === "POST_MORTEM" &&
      !runtime.postMortem &&
      (runtime.postMortemGeneration.generationId === generationId ||
        runtime.postMortemGeneration.status === "NOT_REQUESTED")
    ) {
      await ctx.db.patch("matchSlopState", state._id, {
        postMortemGeneration: {
          status: "FAILED",
          updatedAt: new Date(now).toISOString(),
          generationId,
        },
        updatedAt: now,
      });
    }
    return null;
  },
});
