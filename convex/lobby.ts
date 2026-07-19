import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireHostCapability } from "./capabilities";
import { roomPresence } from "./components";
import { AI_MODELS, getAiModel } from "./modelCatalog";
import { scheduleSloplashDeadline } from "./sloplashEngine";
import { gameTypeValidator } from "./validators";
import { getRandomPrompts } from "../src/games/core/prompts";
import { MATCHSLOP_PERSONA_EXAMPLES } from "../src/games/matchslop/config/persona-examples";
import { MATCHSLOP_PLAYER_EXAMPLES } from "../src/games/matchslop/config/player-examples";
import { MATCHSLOP_WRITING_SECONDS } from "../src/games/matchslop/config/game-config";
import { WRITING_DURATION_SECONDS } from "../src/games/sloplash/game-constants";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { minPlayersByGameType } from "./gameLimits";
import { requireContinuingPlayers } from "./gamePhase";

const MAX_LOBBY_PLAYERS = 16;
const MAX_PLAYER_SESSIONS = 8;

const enqueueQueuedResponseJobsReference = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("aiGenerationData:enqueueQueuedResponseJobs");

const startMatchSlopPipelinesReference = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  { profileStarted: boolean; responseJobs: number }
>("matchslopWorkflow:startGamePipelines");

async function listPlayers(ctx: MutationCtx, gameId: Id<"games">): Promise<Doc<"players">[]> {
  return ctx.db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_LOBBY_PLAYERS);
}

async function deletePlayerSessions(
  ctx: MutationCtx,
  gameId: Id<"games">,
  playerId: Id<"players">,
): Promise<void> {
  const sessions = await ctx.db
    .query("playerSessions")
    .withIndex("by_gameId_and_playerId", (index) =>
      index.eq("gameId", gameId).eq("playerId", playerId),
    )
    .take(MAX_PLAYER_SESSIONS);
  for (const session of sessions) {
    await roomPresence.removeRoomUser(ctx, gameId, session._id);
    const leases = await ctx.db
      .query("roomPresenceSessions")
      .withIndex("by_roomSessionId", (index) => index.eq("roomSessionId", session._id))
      .take(MAX_PLAYER_SESSIONS);
    for (const lease of leases) await ctx.db.delete("roomPresenceSessions", lease._id);
    await ctx.db.delete("playerSessions", session._id);
  }
}

async function queueGenerationJob(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    generationKey: string;
    kind: "MATCHSLOP_PROFILE" | "RESPONSE";
    targetId?: string;
  },
): Promise<boolean> {
  const existing = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", args.gameId).eq("generationKey", args.generationKey),
    )
    .unique();
  if (existing) return false;

  const now = Date.now();
  await ctx.db.insert("generationJobs", {
    gameId: args.gameId,
    generationKey: args.generationKey,
    kind: args.kind,
    ...(args.targetId ? { targetId: args.targetId } : {}),
    status: "QUEUED",
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

async function createPrompt(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundId: Id<"rounds">,
  ordinal: number,
  text: string,
  playerIds: Id<"players">[],
): Promise<Id<"prompts">> {
  const promptId = await ctx.db.insert("prompts", {
    gameId,
    roundId,
    ordinal,
    text,
  });
  for (const playerId of playerIds) {
    await ctx.db.insert("promptAssignments", {
      gameId,
      roundId,
      promptId,
      playerId,
    });
  }
  return promptId;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sampleItems<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const selected: T[] = [];
  while (pool.length > 0 && selected.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    const [item] = pool.splice(index, 1);
    if (item !== undefined) selected.push(item);
  }
  return selected;
}

export const models = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      provider: v.string(),
      shortName: v.string(),
    }),
  ),
  handler: async () => [...AI_MODELS],
});

export const addAiPlayer = mutation({
  args: { capability: v.string(), modelId: v.string() },
  returns: v.object({
    playerId: v.id("players"),
    replacedPlayerId: v.union(v.id("players"), v.null()),
  }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    if (authorized.game.status !== "LOBBY") {
      throw new ConvexError("Can only manage AI players during lobby");
    }
    if (authorized.game.gameType === "QUIZSLOP") {
      throw new ConvexError("QuizSlop does not support AI players");
    }
    const model = getAiModel(args.modelId);
    if (!model) throw new ConvexError("Unknown model");

    const players = await listPlayers(ctx, authorized.game._id);
    const activePlayers = players.filter(isActiveCompetitor);
    const existingProviderPlayer = activePlayers.find((player) => {
      if (player.type !== "AI" || !player.modelId) return false;
      return getAiModel(player.modelId)?.provider === model.provider;
    });
    if (activePlayers.length >= authorized.game.maxPlayers && !existingProviderPlayer) {
      throw new ConvexError("Game is full");
    }

    const normalizedName = model.shortName.toLocaleLowerCase("en-US");
    const conflictingPlayer = players.find(
      (player) =>
        player.normalizedName === normalizedName && player._id !== existingProviderPlayer?._id,
    );
    if (conflictingPlayer) {
      throw new ConvexError("That AI player's name is already taken");
    }
    if (existingProviderPlayer?.modelId === model.id) {
      return { playerId: existingProviderPlayer._id, replacedPlayerId: null };
    }

    if (existingProviderPlayer) {
      await ctx.db.delete("players", existingProviderPlayer._id);
    }
    const now = Date.now();
    const playerId = await ctx.db.insert("players", {
      gameId: authorized.game._id,
      name: model.shortName,
      normalizedName,
      type: "AI",
      modelId: model.id,
      idleRounds: 0,
      score: 0,
      humorRating: 1,
      winStreak: 0,
      participationStatus: "ACTIVE",
      joinedAt: now,
    });
    await ctx.db.patch("games", authorized.game._id, {
      playerCount: activePlayers.length + (existingProviderPlayer ? 0 : 1),
      updatedAt: now,
    });
    return {
      playerId,
      replacedPlayerId: existingProviderPlayer?._id ?? null,
    };
  },
});

export const removeAiPlayer = mutation({
  args: { capability: v.string(), targetPlayerId: v.id("players") },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    if (authorized.game.status !== "LOBBY") {
      throw new ConvexError("Can only manage AI players during lobby");
    }
    const target = await ctx.db.get("players", args.targetPlayerId);
    if (!target || target.gameId !== authorized.game._id) {
      throw new ConvexError("Player not in this game");
    }
    if (target.type !== "AI") {
      throw new ConvexError("Can only remove AI players with this mutation");
    }

    const players = await listPlayers(ctx, authorized.game._id);
    await ctx.db.delete("players", target._id);
    await ctx.db.patch("games", authorized.game._id, {
      playerCount: players.filter(
        (player) => player._id !== target._id && isActiveCompetitor(player),
      ).length,
      updatedAt: Date.now(),
    });
    return { success: true as const };
  },
});

export const kickHuman = mutation({
  args: { capability: v.string(), targetPlayerId: v.id("players") },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    if (authorized.game.gameType === "QUIZSLOP" && authorized.game.status !== "LOBBY") {
      throw new ConvexError("QuizSlop roster is frozen after the game starts");
    }
    if (authorized.game.status !== "LOBBY" && authorized.game.status !== "ROUND_RESULTS") {
      throw new ConvexError("Can only kick players during lobby or between rounds");
    }
    if (authorized.player?._id === args.targetPlayerId) {
      throw new ConvexError("Cannot kick yourself");
    }
    const target = await ctx.db.get("players", args.targetPlayerId);
    if (!target || target.gameId !== authorized.game._id) {
      throw new ConvexError("Player not in this game");
    }
    if (target.type === "AI") throw new ConvexError("Cannot kick AI players");

    // A player is only ever DISCONNECTED because an earlier kick set it below,
    // which already deleted their sessions, so re-kicking is a no-op. Any future
    // path that disconnects a player without dropping sessions must not land here.
    if (
      authorized.game.status === "ROUND_RESULTS" &&
      target.participationStatus === "DISCONNECTED"
    ) {
      return { success: true as const };
    }

    const players = await listPlayers(ctx, authorized.game._id);
    const remainingPlayers = players.filter(
      (player) => player._id !== target._id && isActiveCompetitor(player),
    );
    if (authorized.game.status === "ROUND_RESULTS") {
      requireContinuingPlayers(remainingPlayers.length);
    }

    await deletePlayerSessions(ctx, authorized.game._id, target._id);
    if (authorized.game.status === "LOBBY") {
      await ctx.db.delete("players", target._id);
    } else {
      // Preserve historical response/vote authors for results and recaps while
      // excluding the kicked player from future-round quorum and assignments.
      await ctx.db.patch("players", target._id, {
        participationStatus: "DISCONNECTED",
      });
    }
    await ctx.db.patch("games", authorized.game._id, {
      playerCount: remainingPlayers.length,
      updatedAt: Date.now(),
    });
    return { success: true as const };
  },
});

export const start = mutation({
  args: { capability: v.string() },
  returns: v.object({
    gameType: gameTypeValidator,
    queuedGenerationJobs: v.number(),
    roundId: v.id("rounds"),
    started: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    if (authorized.game.gameType === "QUIZSLOP") {
      // QuizSlop's atomic roster/deck freeze lives in its own start mutation;
      // letting it fall through here would treat it like a prompt-based mode.
      throw new ConvexError("QuizSlop games start from the QuizSlop lobby");
    }
    if (authorized.game.status !== "LOBBY") {
      if (authorized.game.currentRound === 1 && authorized.game.status === "WRITING") {
        const existingRound = await ctx.db
          .query("rounds")
          .withIndex("by_gameId_and_roundNumber", (index) =>
            index.eq("gameId", authorized.game._id).eq("roundNumber", 1),
          )
          .unique();
        if (existingRound) {
          return {
            gameType: authorized.game.gameType,
            queuedGenerationJobs: 0,
            roundId: existingRound._id,
            started: false,
          };
        }
      }
      throw new ConvexError("Game already started");
    }

    const players = (await listPlayers(ctx, authorized.game._id)).filter(isActiveCompetitor);
    const minimumPlayers = minPlayersByGameType[authorized.game.gameType];
    if (players.length < minimumPlayers) {
      throw new ConvexError(`Need at least ${minimumPlayers} players`);
    }

    const now = Date.now();
    const roundId = await ctx.db.insert("rounds", {
      gameId: authorized.game._id,
      roundNumber: 1,
      openedAt: now,
    });
    const playerIds = players.map((player) => player._id);
    let phaseDeadline: number | undefined;
    let queuedGenerationJobs = 0;

    if (authorized.game.gameType === "SLOPLASH") {
      const prompts = getRandomPrompts(playerIds.length);
      for (let index = 0; index < playerIds.length; index += 1) {
        const first = playerIds[index];
        const second = playerIds[(index + 1) % playerIds.length];
        if (!first || !second) continue;
        await createPrompt(
          ctx,
          authorized.game._id,
          roundId,
          index,
          prompts[index] ?? `Prompt #${index + 1}: Make us laugh!`,
          [first, second],
        );
      }
      phaseDeadline = authorized.game.timersDisabled
        ? undefined
        : now + WRITING_DURATION_SECONDS * 1_000;
    } else if (authorized.game.gameType === "AI_CHAT_SHOWDOWN") {
      const [promptText] = getRandomPrompts(1);
      await createPrompt(
        ctx,
        authorized.game._id,
        roundId,
        0,
        promptText ?? "Make us laugh!",
        playerIds,
      );
    } else {
      const matchState = await ctx.db
        .query("matchSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", authorized.game._id))
        .unique();
      if (!matchState || !authorized.game.personaModelId) {
        throw new ConvexError("MatchSlop room is missing persona configuration");
      }

      const generation = asRecord(matchState.profileGeneration);
      const profileReady = matchState.profile !== undefined || generation?.status === "READY";
      const personaPool = MATCHSLOP_PERSONA_EXAMPLES.filter(
        (example) => example.identity === matchState.personaIdentity,
      );
      const personaSource = personaPool.length > 0 ? personaPool : MATCHSLOP_PERSONA_EXAMPLES;
      const selectedPersonaExampleIds =
        matchState.selectedPersonaExampleIds.length > 0
          ? matchState.selectedPersonaExampleIds
          : sampleItems(personaSource, 1).map((example) => example.id);
      const selectedPlayerExamples =
        matchState.selectedPlayerExamples.length > 0
          ? matchState.selectedPlayerExamples
          : sampleItems(MATCHSLOP_PLAYER_EXAMPLES, 4);
      const profile = asRecord(matchState.profile);
      const displayName = typeof profile?.displayName === "string" ? profile.displayName : null;
      const promptText = displayName
        ? `Pick one of ${displayName}'s profile prompts and send the funniest opener.`
        : "Write the funniest opening line to this profile.";

      await ctx.db.patch("matchSlopState", matchState._id, {
        comebackRound: undefined,
        latestMoodDelta: undefined,
        latestNextSignal: undefined,
        latestSideComment: undefined,
        latestSignalCategory: undefined,
        lastRoundResult: undefined,
        outcome: "IN_PROGRESS",
        pendingPersonaReply: {
          status: "NOT_REQUESTED",
          reply: null,
          outcome: null,
          moodDelta: null,
          generationId: null,
          signalCategory: null,
          sideComment: null,
          nextSignal: null,
        },
        selectedPersonaExampleIds,
        selectedPlayerExamples,
        updatedAt: now,
        ...(!profileReady
          ? {
              profile: undefined,
              profileDraft: undefined,
              profileGeneration: {
                status: "NOT_REQUESTED",
                updatedAt: new Date(now).toISOString(),
                generationId: null,
              },
              personaImage: {
                status: "NOT_REQUESTED",
                imageUrl: null,
                updatedAt: new Date(now).toISOString(),
              },
            }
          : {}),
      });
      await createPrompt(ctx, authorized.game._id, roundId, 0, promptText, playerIds);
      phaseDeadline =
        profileReady && !authorized.game.timersDisabled
          ? now + MATCHSLOP_WRITING_SECONDS * 1_000
          : undefined;
      if (
        !profileReady &&
        (await queueGenerationJob(ctx, {
          gameId: authorized.game._id,
          generationKey: "matchslop-profile",
          kind: "MATCHSLOP_PROFILE",
        }))
      ) {
        queuedGenerationJobs += 1;
      }
    }

    if (authorized.game.gameType !== "MATCHSLOP") {
      for (const player of players) {
        if (
          player.type === "AI" &&
          (await queueGenerationJob(ctx, {
            gameId: authorized.game._id,
            generationKey: `response:1:${player._id}`,
            kind: "RESPONSE",
            targetId: player._id,
          }))
        ) {
          queuedGenerationJobs += 1;
        }
      }
    }

    await ctx.db.patch("games", authorized.game._id, {
      currentRound: 1,
      phaseDeadline,
      phaseGeneration: authorized.game.phaseGeneration + 1,
      status: "WRITING",
      updatedAt: now,
      votingPromptIndex: 0,
      votingRevealing: false,
    });
    if (authorized.game.gameType === "SLOPLASH" && phaseDeadline !== undefined) {
      await scheduleSloplashDeadline(ctx, {
        deadline: phaseDeadline,
        gameId: authorized.game._id,
        phaseGeneration: authorized.game.phaseGeneration + 1,
      });
    }
    if (authorized.game.gameType !== "MATCHSLOP" && queuedGenerationJobs > 0) {
      await ctx.scheduler.runAfter(0, enqueueQueuedResponseJobsReference, {
        gameId: authorized.game._id,
      });
    }
    if (authorized.game.gameType === "MATCHSLOP") {
      await ctx.scheduler.runAfter(0, startMatchSlopPipelinesReference, {
        gameId: authorized.game._id,
      });
    }

    return {
      gameType: authorized.game.gameType,
      queuedGenerationJobs,
      roundId,
      started: true,
    };
  },
});
