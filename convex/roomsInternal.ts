import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { maxPlayersByGameType } from "./gameLimits";
import {
  gameTypeValidator,
  matchSlopIdentityValidator,
  sessionRoleValidator,
  ttsModeValidator,
} from "./validators";

const createResultValidator = v.union(
  v.object({ kind: v.literal("ROOM_CODE_TAKEN") }),
  v.object({
    kind: v.literal("CREATED"),
    gameId: v.id("games"),
    sessionId: v.id("playerSessions"),
    playerId: v.union(v.id("players"), v.null()),
  }),
);

const sessionResultValidator = v.object({
  gameId: v.id("games"),
  gameType: gameTypeValidator,
  playerId: v.union(v.id("players"), v.null()),
  playerName: v.union(v.string(), v.null()),
  playerType: v.union(v.literal("HUMAN"), v.literal("AI"), v.literal("SPECTATOR"), v.null()),
  role: sessionRoleValidator,
  roomCode: v.string(),
  sessionId: v.id("playerSessions"),
});

const joinRoomResultValidator = v.union(
  v.object({ kind: v.literal("JOINED"), session: sessionResultValidator }),
  v.object({ kind: v.literal("REJECTED"), reason: v.string() }),
);

const JOIN_ATTEMPT_WINDOW_MS = 60_000;
const MAX_JOIN_ATTEMPTS_PER_WINDOW = 12;

export const createRoom = internalMutation({
  args: {
    aiPlayers: v.array(
      v.object({
        modelId: v.string(),
        name: v.string(),
        normalizedName: v.string(),
      }),
    ),
    capabilityHash: v.string(),
    gameType: gameTypeValidator,
    hostName: v.union(v.string(), v.null()),
    hostNormalizedName: v.union(v.string(), v.null()),
    hostParticipation: v.union(v.literal("PLAYER"), v.literal("DISPLAY_ONLY")),
    personaIdentity: matchSlopIdentityValidator,
    personaModelId: v.union(v.string(), v.null()),
    roomCode: v.string(),
    seekerIdentity: matchSlopIdentityValidator,
    timersDisabled: v.boolean(),
    totalRounds: v.number(),
    ttsMode: ttsModeValidator,
    ttsVoice: v.string(),
  },
  returns: createResultValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("games")
      .withIndex("by_roomCode", (query) => query.eq("roomCode", args.roomCode))
      .unique();
    if (existing) return { kind: "ROOM_CODE_TAKEN" as const };

    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      roomCode: args.roomCode,
      gameType: args.gameType,
      status: "LOBBY",
      currentRound: 0,
      totalRounds: args.totalRounds,
      maxPlayers: maxPlayersByGameType[args.gameType],
      playerCount: (args.hostParticipation === "PLAYER" ? 1 : 0) + args.aiPlayers.length,
      ...(args.personaModelId ? { personaModelId: args.personaModelId } : {}),
      phaseGeneration: 0,
      timersDisabled: args.timersDisabled,
      ttsMode: args.ttsMode,
      ttsVoice: args.ttsVoice,
      votingPromptIndex: 0,
      votingRevealing: false,
      aiInputTokens: 0,
      aiOutputTokens: 0,
      aiCostUsd: 0,
      createdAt: now,
      updatedAt: now,
    });

    const playerId =
      args.hostParticipation === "PLAYER" &&
      args.hostName !== null &&
      args.hostNormalizedName !== null
        ? await ctx.db.insert("players", {
            gameId,
            name: args.hostName,
            normalizedName: args.hostNormalizedName,
            type: "HUMAN",
            idleRounds: 0,
            score: 0,
            humorRating: 1,
            winStreak: 0,
            participationStatus: "ACTIVE",
            joinedAt: now,
          })
        : null;

    const sessionId = await ctx.db.insert("playerSessions", {
      gameId,
      ...(playerId ? { playerId } : {}),
      role: "HOST",
      capabilityHash: args.capabilityHash,
      createdAt: now,
      lastSeenAt: now,
    });

    for (const aiPlayer of args.aiPlayers) {
      await ctx.db.insert("players", {
        gameId,
        name: aiPlayer.name,
        normalizedName: aiPlayer.normalizedName,
        type: "AI",
        modelId: aiPlayer.modelId,
        idleRounds: 0,
        score: 0,
        humorRating: 1,
        winStreak: 0,
        participationStatus: "ACTIVE",
        joinedAt: now,
      });
    }

    await ctx.db.patch("games", gameId, {
      ...(playerId ? { hostPlayerId: playerId } : {}),
      hostSessionId: sessionId,
    });

    if (args.gameType === "MATCHSLOP") {
      await ctx.db.insert("matchSlopState", {
        gameId,
        seekerIdentity: args.seekerIdentity,
        personaIdentity: args.personaIdentity,
        outcome: "IN_PROGRESS",
        humanVoteWeight: 2,
        aiVoteWeight: 1,
        mood: 50,
        selectedPersonaExampleIds: [],
        selectedPlayerExamples: [],
        updatedAt: now,
      });
    }

    return { kind: "CREATED" as const, gameId, sessionId, playerId };
  },
});

export const joinRoom = internalMutation({
  args: {
    capabilityHash: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    roomCode: v.string(),
  },
  returns: joinRoomResultValidator,
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_roomCode", (query) => query.eq("roomCode", args.roomCode))
      .unique();
    if (!game) return { kind: "REJECTED" as const, reason: "Room not found" };
    if (game.status !== "LOBBY") {
      return { kind: "REJECTED" as const, reason: "Game already in progress" };
    }

    const now = Date.now();
    // Look the name up through its own index rather than scanning the roster:
    // the check must stay exact even if the roster ever outgrows maxPlayers.
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_gameId_and_normalizedName", (index) =>
        index.eq("gameId", game._id).eq("normalizedName", args.normalizedName),
      )
      .unique();
    if (existingPlayer) {
      const rateLimit = await ctx.db
        .query("roomJoinRateLimits")
        .withIndex("by_gameId_and_normalizedName", (index) =>
          index.eq("gameId", game._id).eq("normalizedName", args.normalizedName),
        )
        .unique();
      const windowExpired =
        !rateLimit || now - rateLimit.windowStartedAt >= JOIN_ATTEMPT_WINDOW_MS;
      if (rateLimit && !windowExpired && rateLimit.attempts >= MAX_JOIN_ATTEMPTS_PER_WINDOW) {
        return {
          kind: "REJECTED" as const,
          reason: "Too many join attempts for this player name. Wait a minute and try again",
        };
      }
      if (!rateLimit) {
        await ctx.db.insert("roomJoinRateLimits", {
          gameId: game._id,
          normalizedName: args.normalizedName,
          windowStartedAt: now,
          attempts: 1,
        });
      } else if (windowExpired) {
        await ctx.db.patch("roomJoinRateLimits", rateLimit._id, {
          windowStartedAt: now,
          attempts: 1,
        });
      } else {
        await ctx.db.patch("roomJoinRateLimits", rateLimit._id, {
          attempts: rateLimit.attempts + 1,
        });
      }
      return { kind: "REJECTED" as const, reason: "That name is already taken" };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(game.maxPlayers + 1);
    const activePlayerCount = players.filter(isActiveCompetitor).length;
    if (activePlayerCount >= game.maxPlayers) {
      return {
        kind: "REJECTED" as const,
        reason: `Game is full (max ${game.maxPlayers} players)`,
      };
    }

    const playerId = await ctx.db.insert("players", {
      gameId: game._id,
      name: args.name,
      normalizedName: args.normalizedName,
      type: "HUMAN",
      idleRounds: 0,
      score: 0,
      humorRating: 1,
      winStreak: 0,
      participationStatus: "ACTIVE",
      joinedAt: now,
    });
    const sessionId = await ctx.db.insert("playerSessions", {
      gameId: game._id,
      playerId,
      role: "PLAYER",
      capabilityHash: args.capabilityHash,
      createdAt: now,
      lastSeenAt: now,
    });
    await ctx.db.patch("games", game._id, {
      playerCount: activePlayerCount + 1,
      updatedAt: now,
    });

    return {
      kind: "JOINED" as const,
      session: {
        gameId: game._id,
        gameType: game.gameType,
        playerId,
        playerName: args.name,
        playerType: "HUMAN" as const,
        role: "PLAYER" as const,
        roomCode: game.roomCode,
        sessionId,
      },
    };
  },
});
