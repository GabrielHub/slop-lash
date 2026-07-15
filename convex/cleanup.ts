import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { WorkId } from "@convex-dev/workpool";
import type { WorkflowId } from "@convex-dev/workflow";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { aiGenerationWorkpool, gameWorkflow, roomPresence } from "./components";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export const STALE_LOBBY_IDLE_MS = 2 * HOUR_MS;
export const ABANDONED_GAME_IDLE_MS = DAY_MS;
export const TRANSIENT_FINAL_RETENTION_MS = HOUR_MS;

const MAX_CANDIDATES_PER_POLICY = 8;
const MAX_SESSIONS_PER_SWEEP = 64;
const MAX_ACTIVE_PRESENCE_TABS_PER_SESSION = 8;
const MAX_PRESENCE_USERS = 16;
const MAX_SESSIONS_PER_ACTIVITY_CHECK = 32;
const DELETE_BATCH_SIZE = 32;
const STALE_PRESENCE_SESSION_MS = 2 * 60 * 1_000;
const MAX_STALE_PRESENCE_SESSIONS_PER_SWEEP = 64;

type CleanupPolicy = "STALE_LOBBY" | "ABANDONED_GAME" | "TRANSIENT_FINAL";

const deleteGameReference = makeFunctionReference<
  "mutation",
  {
    cutoff: number;
    expectedUpdatedAt: number;
    gameId: Id<"games">;
    policy: CleanupPolicy;
  },
  { status: "CONTINUING" | "DELETED" | "SKIPPED" }
>("cleanup:deleteGameIfStale");

const cleanupStalePresenceSessionsReference = makeFunctionReference<
  "mutation",
  { now?: number },
  { deleted: number; status: "CONTINUING" | "DONE" }
>("cleanup:cleanupStalePresenceSessions");

function isLiveSession(session: Doc<"playerSessions">, cutoff: number, now: number): boolean {
  return (
    session.revokedAt === undefined &&
    (session.expiresAt === undefined || session.expiresAt > now) &&
    session.lastSeenAt >= cutoff
  );
}

function matchesPolicy(game: Doc<"games">, policy: CleanupPolicy, cutoff: number): boolean {
  if (policy === "STALE_LOBBY") {
    return game.status === "LOBBY" && game.updatedAt <= cutoff;
  }
  if (policy === "ABANDONED_GAME") {
    return game.status !== "LOBBY" && game.status !== "FINAL_RESULTS" && game.updatedAt <= cutoff;
  }
  return (
    game.status === "FINAL_RESULTS" &&
    game.gameType !== "SLOPLASH" &&
    (game.finalizedAt ?? game.updatedAt) <= cutoff
  );
}

async function roomIsActive(
  ctx: MutationCtx,
  gameId: Id<"games">,
  cutoff: number,
  now: number,
): Promise<boolean> {
  const [online, sessions, queuedJobs, runningJobs] = await Promise.all([
    roomPresence.listRoom(ctx, gameId, true, MAX_PRESENCE_USERS),
    ctx.db
      .query("playerSessions")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(MAX_SESSIONS_PER_ACTIVITY_CHECK),
    ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_status_and_updatedAt", (index) =>
        index.eq("gameId", gameId).eq("status", "QUEUED").gte("updatedAt", cutoff),
      )
      .take(1),
    ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_status_and_updatedAt", (index) =>
        index.eq("gameId", gameId).eq("status", "RUNNING").gte("updatedAt", cutoff),
      )
      .take(1),
  ]);
  return (
    online.length > 0 ||
    sessions.some((session) => isLiveSession(session, cutoff, now)) ||
    queuedJobs.length > 0 ||
    runningJobs.length > 0
  );
}

function isMissingWorkflowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Workflow not found:");
}

async function cancelAndCleanupWorkflow(ctx: MutationCtx, workflowId: WorkflowId): Promise<void> {
  try {
    const status = await gameWorkflow.status(ctx, workflowId);
    if (status.type === "inProgress") {
      await gameWorkflow.cancel(ctx, workflowId);
    }
  } catch (error) {
    if (!isMissingWorkflowError(error)) throw error;
  }
  await gameWorkflow.cleanup(ctx, workflowId);
}

async function cleanupGenerationJobComponents(
  ctx: MutationCtx,
  jobs: Doc<"generationJobs">[],
): Promise<void> {
  const workflowIds = new Set<WorkflowId>();
  for (const job of jobs) {
    if ((job.status === "QUEUED" || job.status === "RUNNING") && job.workId) {
      await aiGenerationWorkpool.cancel(ctx, job.workId as WorkId);
    }
    if (job.workflowId) workflowIds.add(job.workflowId as WorkflowId);
  }
  for (const workflowId of workflowIds) {
    await cancelAndCleanupWorkflow(ctx, workflowId);
  }
}

async function cancelActiveGenerationJobs(ctx: MutationCtx, gameId: Id<"games">): Promise<boolean> {
  const [queued, running] = await Promise.all([
    ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_status", (index) =>
        index.eq("gameId", gameId).eq("status", "QUEUED"),
      )
      .take(DELETE_BATCH_SIZE + 1),
    ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_status", (index) =>
        index.eq("gameId", gameId).eq("status", "RUNNING"),
      )
      .take(DELETE_BATCH_SIZE + 1),
  ]);
  const jobs = [...queued, ...running].slice(0, DELETE_BATCH_SIZE);
  if (jobs.length === 0) return false;

  await cleanupGenerationJobComponents(ctx, jobs);
  for (const job of jobs) await ctx.db.delete("generationJobs", job._id);
  return true;
}

async function deleteGameData(
  ctx: MutationCtx,
  game: Doc<"games">,
): Promise<"CONTINUING" | "DELETED"> {
  if (await cancelActiveGenerationJobs(ctx, game._id)) return "CONTINUING";

  const limit = DELETE_BATCH_SIZE + 1;
  const [
    presenceSessions,
    joinRateLimits,
    sessions,
    players,
    rounds,
    prompts,
    assignments,
    responses,
    votes,
    reactions,
    messages,
    modelUsages,
    jobs,
    states,
    transcript,
  ] = await Promise.all([
    ctx.db
      .query("roomPresenceSessions")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("roomJoinRateLimits")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("playerSessions")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("players")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("rounds")
      .withIndex("by_gameId_and_roundNumber", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("promptAssignments")
      .withIndex("by_gameId_and_roundId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("responses")
      .withIndex("by_gameId_and_roundId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("votes")
      .withIndex("by_gameId_and_roundId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("reactions")
      .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("chatMessages")
      .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_status", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("matchSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(limit),
    ctx.db
      .query("matchSlopTranscriptEntries")
      .withIndex("by_gameId_and_turn_and_ordinal", (index) => index.eq("gameId", game._id))
      .take(limit),
  ]);

  const groups = [
    presenceSessions,
    joinRateLimits,
    sessions,
    players,
    rounds,
    prompts,
    assignments,
    responses,
    votes,
    reactions,
    messages,
    modelUsages,
    jobs,
    states,
    transcript,
  ];
  const hasMore = groups.some((rows) => rows.length > DELETE_BATCH_SIZE);
  await roomPresence.removeRoom(ctx, game._id);
  await cleanupGenerationJobComponents(ctx, jobs.slice(0, DELETE_BATCH_SIZE));
  for (const row of presenceSessions.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("roomPresenceSessions", row._id);
  for (const row of joinRateLimits.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("roomJoinRateLimits", row._id);
  for (const row of assignments.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("promptAssignments", row._id);
  for (const row of votes.slice(0, DELETE_BATCH_SIZE)) await ctx.db.delete("votes", row._id);
  for (const row of reactions.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("reactions", row._id);
  for (const row of responses.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("responses", row._id);
  for (const row of prompts.slice(0, DELETE_BATCH_SIZE)) await ctx.db.delete("prompts", row._id);
  for (const row of messages.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("chatMessages", row._id);
  for (const row of modelUsages.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("gameModelUsage", row._id);
  for (const row of jobs.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("generationJobs", row._id);
  for (const row of transcript.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("matchSlopTranscriptEntries", row._id);
  for (const row of states.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("matchSlopState", row._id);
  for (const row of rounds.slice(0, DELETE_BATCH_SIZE)) await ctx.db.delete("rounds", row._id);
  for (const row of sessions.slice(0, DELETE_BATCH_SIZE))
    await ctx.db.delete("playerSessions", row._id);
  for (const row of players.slice(0, DELETE_BATCH_SIZE)) await ctx.db.delete("players", row._id);
  if (hasMore) return "CONTINUING";
  await ctx.db.delete("games", game._id);
  return "DELETED";
}

export const cleanupExpiredSessions = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const [expired, revoked] = await Promise.all([
      ctx.db
        .query("playerSessions")
        .withIndex("by_expiresAt", (index) => index.gt("expiresAt", 0).lte("expiresAt", now))
        .take(MAX_SESSIONS_PER_SWEEP),
      ctx.db
        .query("playerSessions")
        .withIndex("by_revokedAt", (index) => index.gt("revokedAt", 0).lte("revokedAt", now))
        .take(MAX_SESSIONS_PER_SWEEP),
    ]);
    const ids = new Set<Id<"playerSessions">>([
      ...expired.map((session) => session._id),
      ...revoked.map((session) => session._id),
    ]);
    for (const id of ids) {
      const leases = await ctx.db
        .query("roomPresenceSessions")
        .withIndex("by_roomSessionId", (index) => index.eq("roomSessionId", id))
        .take(MAX_ACTIVE_PRESENCE_TABS_PER_SESSION);
      for (const lease of leases) await ctx.db.delete("roomPresenceSessions", lease._id);
      await ctx.db.delete("playerSessions", id);
    }
    return { deleted: ids.size };
  },
});

export const cleanupStalePresenceSessions = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({
    deleted: v.number(),
    status: v.union(v.literal("CONTINUING"), v.literal("DONE")),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const stale = await ctx.db
      .query("roomPresenceSessions")
      .withIndex("by_lastHeartbeatAt", (index) =>
        index.lte("lastHeartbeatAt", now - STALE_PRESENCE_SESSION_MS),
      )
      .take(MAX_STALE_PRESENCE_SESSIONS_PER_SWEEP + 1);
    const batch = stale.slice(0, MAX_STALE_PRESENCE_SESSIONS_PER_SWEEP);
    for (const lease of batch) await ctx.db.delete("roomPresenceSessions", lease._id);

    const status: "CONTINUING" | "DONE" = stale.length > batch.length ? "CONTINUING" : "DONE";
    if (status === "CONTINUING") {
      await ctx.scheduler.runAfter(0, cleanupStalePresenceSessionsReference, { now });
    }
    return { deleted: batch.length, status };
  },
});

export const scheduleStaleRoomCleanup = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const lobbyCutoff = now - STALE_LOBBY_IDLE_MS;
    const abandonedCutoff = now - ABANDONED_GAME_IDLE_MS;
    const transientFinalCutoff = now - TRANSIENT_FINAL_RETENTION_MS;
    const [lobbies, writing, voting, roundResults, chatFinals, matchFinals] = await Promise.all([
      ctx.db
        .query("games")
        .withIndex("by_status_and_updatedAt", (index) =>
          index.eq("status", "LOBBY").lte("updatedAt", lobbyCutoff),
        )
        .take(MAX_CANDIDATES_PER_POLICY),
      ctx.db
        .query("games")
        .withIndex("by_status_and_updatedAt", (index) =>
          index.eq("status", "WRITING").lte("updatedAt", abandonedCutoff),
        )
        .take(MAX_CANDIDATES_PER_POLICY),
      ctx.db
        .query("games")
        .withIndex("by_status_and_updatedAt", (index) =>
          index.eq("status", "VOTING").lte("updatedAt", abandonedCutoff),
        )
        .take(MAX_CANDIDATES_PER_POLICY),
      ctx.db
        .query("games")
        .withIndex("by_status_and_updatedAt", (index) =>
          index.eq("status", "ROUND_RESULTS").lte("updatedAt", abandonedCutoff),
        )
        .take(MAX_CANDIDATES_PER_POLICY),
      ctx.db
        .query("games")
        .withIndex("by_gameType_and_status_and_finalizedAt", (index) =>
          index
            .eq("gameType", "AI_CHAT_SHOWDOWN")
            .eq("status", "FINAL_RESULTS")
            .lte("finalizedAt", transientFinalCutoff),
        )
        .take(MAX_CANDIDATES_PER_POLICY),
      ctx.db
        .query("games")
        .withIndex("by_gameType_and_status_and_finalizedAt", (index) =>
          index
            .eq("gameType", "MATCHSLOP")
            .eq("status", "FINAL_RESULTS")
            .lte("finalizedAt", transientFinalCutoff),
        )
        .take(MAX_CANDIDATES_PER_POLICY),
    ]);
    const candidates = [
      ...lobbies.map((game) => ({ game, cutoff: lobbyCutoff, policy: "STALE_LOBBY" as const })),
      ...[...writing, ...voting, ...roundResults].map((game) => ({
        game,
        cutoff: abandonedCutoff,
        policy: "ABANDONED_GAME" as const,
      })),
      ...[...chatFinals, ...matchFinals].map((game) => ({
        game,
        cutoff: transientFinalCutoff,
        policy: "TRANSIENT_FINAL" as const,
      })),
    ];
    for (const candidate of candidates) {
      await ctx.scheduler.runAfter(0, deleteGameReference, {
        cutoff: candidate.cutoff,
        expectedUpdatedAt: candidate.game.updatedAt,
        gameId: candidate.game._id,
        policy: candidate.policy,
      });
    }
    return { scheduled: candidates.length };
  },
});

export const deleteGameIfStale = internalMutation({
  args: {
    cutoff: v.number(),
    expectedUpdatedAt: v.number(),
    gameId: v.id("games"),
    policy: v.union(
      v.literal("STALE_LOBBY"),
      v.literal("ABANDONED_GAME"),
      v.literal("TRANSIENT_FINAL"),
    ),
  },
  returns: v.object({
    status: v.union(v.literal("CONTINUING"), v.literal("DELETED"), v.literal("SKIPPED")),
  }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (
      !game ||
      game.updatedAt !== args.expectedUpdatedAt ||
      !matchesPolicy(game, args.policy, args.cutoff)
    ) {
      return { status: "SKIPPED" as const };
    }
    if (await roomIsActive(ctx, game._id, args.cutoff, Date.now())) {
      return { status: "SKIPPED" as const };
    }
    const status = await deleteGameData(ctx, game);
    if (status === "CONTINUING") {
      await ctx.scheduler.runAfter(0, deleteGameReference, args);
    }
    return { status };
  },
});
