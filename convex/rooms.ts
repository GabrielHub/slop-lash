import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, env, mutation, query } from "./_generated/server";
import {
  constantTimeEqual,
  createCapabilitySecret,
  encodeCapability,
  hashCapabilitySecret,
  requireCapability,
  requireHostCapability,
} from "./capabilities";
import { createRoomCode, normalizePlayerName, normalizeRoomCode } from "./roomInput";
import { maxPlayersByGameType } from "./gameLimits";
import { getAiModel, selectUniqueModelsByProvider } from "./modelCatalog";
import {
  gameStatusValidator,
  gameTypeValidator,
  matchSlopIdentityValidator,
  playerTypeValidator,
  sessionRoleValidator,
  ttsModeValidator,
} from "./validators";

const MAX_ROOM_CODE_ATTEMPTS = 10;
const MAX_ROOM_SUMMARY_PLAYERS = 16;

type CreatedRoom = {
  kind: "CREATED";
  gameId: Id<"games">;
  sessionId: Id<"playerSessions">;
  playerId: Id<"players"> | null;
};

type CreateRoomResult = CreatedRoom | { kind: "ROOM_CODE_TAKEN" };

type SessionResult = {
  gameId: Id<"games">;
  gameType: "SLOPLASH" | "AI_CHAT_SHOWDOWN" | "MATCHSLOP";
  playerId: Id<"players"> | null;
  playerName: string | null;
  playerType: "HUMAN" | "AI" | "SPECTATOR" | null;
  role: "HOST" | "PLAYER" | "SPECTATOR";
  roomCode: string;
  sessionId: Id<"playerSessions">;
};

type JoinRoomMutationResult =
  | { kind: "JOINED"; session: SessionResult }
  | { kind: "REJECTED"; reason: string };

const sessionResultValidator = v.object({
  capability: v.string(),
  gameId: v.id("games"),
  gameType: gameTypeValidator,
  playerId: v.union(v.id("players"), v.null()),
  playerName: v.union(v.string(), v.null()),
  playerType: v.union(playerTypeValidator, v.null()),
  role: sessionRoleValidator,
  roomCode: v.string(),
  sessionId: v.id("playerSessions"),
});

async function requireRoomCreationSecret(candidate: string): Promise<void> {
  const configuredSecret = env.HOST_SECRET;
  if (!configuredSecret) {
    throw new ConvexError("Room creation is not configured");
  }
  const [configuredHash, candidateHash] = await Promise.all([
    hashCapabilitySecret(configuredSecret),
    hashCapabilitySecret(candidate),
  ]);
  if (!constantTimeEqual(configuredHash, candidateHash)) {
    throw new ConvexError("Invalid host password");
  }
}

function validateTotalRounds(totalRounds: number): number {
  if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 10) {
    throw new ConvexError("totalRounds must be an integer between 1 and 10");
  }
  return totalRounds;
}

export const create = action({
  args: {
    aiModelIds: v.optional(v.array(v.string())),
    gameType: gameTypeValidator,
    hostName: v.optional(v.string()),
    hostParticipation: v.optional(v.union(v.literal("PLAYER"), v.literal("DISPLAY_ONLY"))),
    hostSecret: v.string(),
    personaIdentity: v.optional(matchSlopIdentityValidator),
    personaModelId: v.optional(v.string()),
    seekerIdentity: v.optional(matchSlopIdentityValidator),
    timersDisabled: v.optional(v.boolean()),
    totalRounds: v.optional(v.number()),
    ttsMode: v.optional(ttsModeValidator),
    ttsVoice: v.optional(v.string()),
  },
  returns: sessionResultValidator,
  handler: async (ctx, args): Promise<SessionResult & { capability: string }> => {
    await requireRoomCreationSecret(args.hostSecret);

    if (args.gameType === "MATCHSLOP" && (!args.seekerIdentity || !args.personaIdentity)) {
      throw new ConvexError("MatchSlop requires seekerIdentity and personaIdentity");
    }
    const hostParticipation =
      args.gameType === "MATCHSLOP" ? "DISPLAY_ONLY" : (args.hostParticipation ?? "PLAYER");
    const host = hostParticipation === "PLAYER" ? normalizePlayerName(args.hostName ?? "") : null;
    const personaModelId = args.personaModelId?.trim() || null;
    if (args.gameType === "MATCHSLOP" && (!personaModelId || !getAiModel(personaModelId))) {
      throw new ConvexError("Persona model is required for MatchSlop");
    }

    const capabilitySecret = createCapabilitySecret();
    const capabilityHash = await hashCapabilitySecret(capabilitySecret);
    const totalRounds = validateTotalRounds(
      args.totalRounds ?? (args.gameType === "MATCHSLOP" ? 5 : 3),
    );
    const ttsMode = args.gameType === "SLOPLASH" ? (args.ttsMode ?? "OFF") : "OFF";
    const aiPlayers = selectUniqueModelsByProvider(args.aiModelIds ?? [])
      .filter((model) => args.gameType !== "MATCHSLOP" || model.id !== personaModelId)
      .slice(0, maxPlayersByGameType[args.gameType] - (hostParticipation === "PLAYER" ? 1 : 0))
      .map((model) => ({
        modelId: model.id,
        name: model.shortName,
        normalizedName: model.shortName.toLocaleLowerCase("en-US"),
      }));
    if (host && aiPlayers.some((player) => player.normalizedName === host.normalizedName)) {
      throw new ConvexError("Host name conflicts with a selected AI player");
    }

    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
      const roomCode = createRoomCode();
      const result: CreateRoomResult = await ctx.runMutation(internal.roomsInternal.createRoom, {
        aiPlayers,
        capabilityHash,
        gameType: args.gameType,
        hostName: host?.name ?? null,
        hostNormalizedName: host?.normalizedName ?? null,
        hostParticipation,
        personaIdentity: args.personaIdentity ?? "OTHER",
        personaModelId,
        roomCode,
        seekerIdentity: args.seekerIdentity ?? "OTHER",
        timersDisabled: args.timersDisabled ?? false,
        totalRounds,
        ttsMode,
        ttsVoice: ttsMode === "ON" ? args.ttsVoice?.trim() || "RANDOM" : "RANDOM",
      });
      if (result.kind === "ROOM_CODE_TAKEN") continue;

      return {
        capability: encodeCapability(result.sessionId, capabilitySecret),
        gameId: result.gameId,
        gameType: args.gameType,
        playerId: result.playerId,
        playerName: host?.name ?? null,
        playerType: result.playerId ? "HUMAN" : null,
        role: "HOST",
        roomCode,
        sessionId: result.sessionId,
      };
    }

    throw new ConvexError("Failed to allocate a room code, please try again");
  },
});

export const join = action({
  args: { name: v.string(), roomCode: v.string() },
  returns: sessionResultValidator,
  handler: async (ctx, args): Promise<SessionResult & { capability: string }> => {
    const roomCode = normalizeRoomCode(args.roomCode);
    const player = normalizePlayerName(args.name);
    const capabilitySecret = createCapabilitySecret();
    const capabilityHash = await hashCapabilitySecret(capabilitySecret);
    const result: JoinRoomMutationResult = await ctx.runMutation(internal.roomsInternal.joinRoom, {
      capabilityHash,
      name: player.name,
      normalizedName: player.normalizedName,
      roomCode,
    });
    if (result.kind === "REJECTED") throw new ConvexError(result.reason);
    return {
      ...result.session,
      capability: encodeCapability(result.session.sessionId, capabilitySecret),
    };
  },
});

export const rejoin = mutation({
  args: { capability: v.string(), roomCode: v.string() },
  returns: sessionResultValidator,
  handler: async (ctx, args): Promise<SessionResult & { capability: string }> => {
    const roomCode = normalizeRoomCode(args.roomCode);
    const authorized = await requireCapability(ctx, args.capability);
    if (authorized.game.roomCode !== roomCode) {
      throw new ConvexError("Invalid room capability");
    }

    const now = Date.now();
    await ctx.db.patch("playerSessions", authorized.session._id, { lastSeenAt: now });
    if (authorized.player?.participationStatus === "DISCONNECTED") {
      await ctx.db.patch("players", authorized.player._id, { participationStatus: "ACTIVE" });
    }

    return {
      capability: args.capability,
      gameId: authorized.game._id,
      gameType: authorized.game.gameType,
      playerId: authorized.player?._id ?? null,
      playerName: authorized.player?.name ?? null,
      playerType: authorized.player?.type ?? null,
      role: authorized.session.role,
      roomCode: authorized.game.roomCode,
      sessionId: authorized.session._id,
    };
  },
});

export const summary = query({
  args: { capability: v.string() },
  returns: v.object({
    game: v.object({
      _id: v.id("games"),
      currentRound: v.number(),
      gameType: gameTypeValidator,
      hostPlayerId: v.union(v.id("players"), v.null()),
      maxPlayers: v.number(),
      phaseDeadline: v.union(v.number(), v.null()),
      playerCount: v.number(),
      roomCode: v.string(),
      status: gameStatusValidator,
      timersDisabled: v.boolean(),
      totalRounds: v.number(),
    }),
    me: v.object({
      isHost: v.boolean(),
      playerId: v.union(v.id("players"), v.null()),
      role: sessionRoleValidator,
      sessionId: v.id("playerSessions"),
    }),
    players: v.array(
      v.object({
        _id: v.id("players"),
        humorRating: v.number(),
        idleRounds: v.number(),
        modelId: v.union(v.string(), v.null()),
        name: v.string(),
        participationStatus: v.union(v.literal("ACTIVE"), v.literal("DISCONNECTED")),
        score: v.number(),
        type: playerTypeValidator,
        winStreak: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const authorized = await requireCapability(ctx, args.capability);
    const players = await ctx.db
      .query("players")
      .withIndex("by_gameId", (index) => index.eq("gameId", authorized.game._id))
      .take(MAX_ROOM_SUMMARY_PLAYERS);

    return {
      game: {
        _id: authorized.game._id,
        currentRound: authorized.game.currentRound,
        gameType: authorized.game.gameType,
        hostPlayerId: authorized.game.hostPlayerId ?? null,
        maxPlayers: authorized.game.maxPlayers,
        phaseDeadline: authorized.game.phaseDeadline ?? null,
        playerCount: authorized.game.playerCount,
        roomCode: authorized.game.roomCode,
        status: authorized.game.status,
        timersDisabled: authorized.game.timersDisabled,
        totalRounds: authorized.game.totalRounds,
      },
      me: {
        isHost:
          authorized.session.role === "HOST" &&
          authorized.game.hostSessionId === authorized.session._id,
        playerId: authorized.player?._id ?? null,
        role: authorized.session.role,
        sessionId: authorized.session._id,
      },
      players: players.map((player) => ({
        _id: player._id,
        humorRating: player.humorRating,
        idleRounds: player.idleRounds,
        modelId: player.modelId ?? null,
        name: player.name,
        participationStatus: player.participationStatus,
        score: player.score,
        type: player.type,
        winStreak: player.winStreak,
      })),
    };
  },
});

export const hostAuthority = query({
  args: { capability: v.string() },
  returns: v.object({
    gameId: v.id("games"),
    playerId: v.union(v.id("players"), v.null()),
    roomCode: v.string(),
    sessionId: v.id("playerSessions"),
  }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    return {
      gameId: authorized.game._id,
      playerId: authorized.player?._id ?? null,
      roomCode: authorized.game.roomCode,
      sessionId: authorized.session._id,
    };
  },
});
