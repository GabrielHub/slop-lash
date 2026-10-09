import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, env, internalMutation, mutation, type MutationCtx } from "./_generated/server";
import {
  constantTimeEqual,
  createCapabilitySecret,
  encodeCapability,
  hashCapabilitySecret,
  requireHost,
} from "./capabilities";
import { roomPresence } from "./components";
import { settle } from "./engine";
import { claimFreePlaySlot, isFreePlayConfigured } from "./freePlay";
import { getMode } from "./modes";
import { createRoomCode, normalizePlayerName, normalizeRoomCode } from "./roomInput";
import { findGameByCode, insertPlayer, loadActivePlayers, loadPresence } from "./roster";
import { gameTypeValidator, matchSlopIdentityValidator, ttsModeValidator } from "./validators";
import type { GameType } from "../src/games/core/types";
import { FREE_PLAY_WRITER_MODEL_ID, getFreePlayAiPlayersError } from "../src/lib/free-play";
import { getModelByModelId, selectUniqueModelsByProvider } from "../src/lib/models";

const MAX_ROOM_CODE_ATTEMPTS = 10;
const MAX_SEAT_SESSIONS = 8;

/** Mode settings chosen on the host screen. */
export const roomSettingsValidator = v.object({
  matchslop: v.optional(
    v.object({
      seekerIdentity: matchSlopIdentityValidator,
      personaIdentity: matchSlopIdentityValidator,
      personaModelId: v.string(),
    }),
  ),
});

export type RoomSettings = typeof roomSettingsValidator.type;

/** What a browser stores to get back into its room. */
type RoomSession = {
  capability: string;
  roomCode: string;
  gameType: GameType;
  playerId: Id<"players"> | null;
};

async function requireHostPassword(candidate: string): Promise<void> {
  const configured = env.HOST_SECRET;
  if (!configured) throw new ConvexError("Room creation is not configured");
  const [expected, actual] = await Promise.all([
    hashCapabilitySecret(configured),
    hashCapabilitySecret(candidate),
  ]);
  if (!constantTimeEqual(expected, actual)) throw new ConvexError("Invalid host password");
}

/** Free Play rooms skip the password, so their limits are pinned here. */
function requireFreePlaySettings(
  gameType: GameType,
  aiModelIds: string[],
  args: {
    ttsMode?: "ON" | "OFF";
    settings: RoomSettings;
  },
) {
  if (!isFreePlayConfigured()) {
    throw new ConvexError("Free Play is not available right now. Enter the host password.");
  }
  if (args.ttsMode === "ON") throw new ConvexError("The narrator needs the host password");
  const aiError = getFreePlayAiPlayersError(gameType, aiModelIds);
  if (aiError) throw new ConvexError(aiError);
  const personaModelId = args.settings.matchslop?.personaModelId;
  if (personaModelId !== undefined && personaModelId !== FREE_PLAY_WRITER_MODEL_ID) {
    throw new ConvexError("Free Play personas use Claude Haiku");
  }
}

export const create = action({
  args: {
    gameType: gameTypeValidator,
    /** Omit for a Free Play room: Claude Haiku writes, Jev judges. */
    hostSecret: v.optional(v.string()),
    /** Omit to host from a big screen without playing. */
    hostName: v.optional(v.string()),
    aiModelIds: v.optional(v.array(v.string())),
    totalRounds: v.optional(v.number()),
    timersDisabled: v.optional(v.boolean()),
    ttsMode: v.optional(ttsModeValidator),
    ttsVoice: v.optional(v.string()),
    settings: v.optional(roomSettingsValidator),
  },
  handler: async (ctx, args): Promise<RoomSession> => {
    const settings = args.settings ?? {};
    const aiModelIds = args.aiModelIds ?? [];
    const freePlay = args.hostSecret === undefined;
    if (freePlay) requireFreePlaySettings(args.gameType, aiModelIds, { ...args, settings });
    else await requireHostPassword(args.hostSecret!);

    if (args.gameType === "MATCHSLOP") {
      const personaModelId = settings.matchslop?.personaModelId;
      if (!personaModelId || !getModelByModelId(personaModelId)) {
        throw new ConvexError("Pick a model to play the MatchSlop persona");
      }
    }
    if (args.gameType === "QUIZSLOP" && aiModelIds.length > 0) {
      throw new ConvexError("QuizSlop does not have AI players");
    }
    if (
      args.totalRounds !== undefined &&
      (!Number.isInteger(args.totalRounds) || args.totalRounds < 1 || args.totalRounds > 10)
    ) {
      throw new ConvexError("Rounds must be between 1 and 10");
    }

    const host = args.hostName?.trim() ? normalizePlayerName(args.hostName) : null;
    const maxPlayers = getMode(args.gameType).maxPlayers;
    const personaModelId = settings.matchslop?.personaModelId;
    const aiPlayers = selectUniqueModelsByProvider(aiModelIds)
      // The MatchSlop persona never plays against itself.
      .filter((model) => model.id !== personaModelId)
      .slice(0, maxPlayers - (host ? 1 : 0))
      .map((model) => ({ modelId: model.id, ...normalizePlayerName(model.shortName) }));
    if (host && aiPlayers.some((ai) => ai.normalizedName === host.normalizedName)) {
      throw new ConvexError("Your name matches an AI player; pick another");
    }

    const secret = createCapabilitySecret();
    const capabilityHash = await hashCapabilitySecret(secret);
    const ttsMode = args.gameType === "SLOPLASH" ? (args.ttsMode ?? "OFF") : "OFF";
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
      const roomCode = createRoomCode();
      const result:
        | { gameId: Id<"games">; sessionId: Id<"playerSessions">; playerId: Id<"players"> | null }
        | "TAKEN"
        | "FREE_PLAY_LIMIT" = await ctx.runMutation(internal.rooms.insertRoom, {
        roomCode,
        gameType: args.gameType,
        freePlay,
        capabilityHash,
        host,
        aiPlayers,
        totalRounds: args.totalRounds ?? (args.gameType === "MATCHSLOP" ? 5 : 3),
        timersDisabled: args.timersDisabled ?? false,
        ttsMode,
        ttsVoice: ttsMode === "ON" ? args.ttsVoice?.trim() || "RANDOM" : "RANDOM",
        settings,
      });
      if (result === "TAKEN") continue;
      if (result === "FREE_PLAY_LIMIT") {
        throw new ConvexError(
          "Free Play is out of games for today. Try again tomorrow or use the host password.",
        );
      }
      return {
        capability: encodeCapability(result.sessionId, secret),
        roomCode,
        gameType: args.gameType,
        playerId: result.playerId,
      };
    }
    throw new ConvexError("Could not find a free room code, please try again");
  },
});

const nameValidator = v.object({ name: v.string(), normalizedName: v.string() });

export const insertRoom = internalMutation({
  args: {
    roomCode: v.string(),
    gameType: gameTypeValidator,
    freePlay: v.boolean(),
    capabilityHash: v.string(),
    host: v.union(nameValidator, v.null()),
    aiPlayers: v.array(
      v.object({ modelId: v.string(), name: v.string(), normalizedName: v.string() }),
    ),
    totalRounds: v.number(),
    timersDisabled: v.boolean(),
    ttsMode: ttsModeValidator,
    ttsVoice: v.string(),
    settings: roomSettingsValidator,
  },
  handler: async (ctx, args) => {
    if (await findGameByCode(ctx, args.roomCode)) return "TAKEN" as const;
    const now = Date.now();
    if (args.freePlay && !(await claimFreePlaySlot(ctx, now))) return "FREE_PLAY_LIMIT" as const;

    const gameId = await ctx.db.insert("games", {
      roomCode: args.roomCode,
      gameType: args.gameType,
      status: "LOBBY",
      phase: "LOBBY",
      step: 0,
      round: 0,
      totalRounds: args.totalRounds,
      displayHost: args.host === null,
      phaseGeneration: 0,
      phaseStartedAt: now,
      freePlay: args.freePlay,
      timersDisabled: args.timersDisabled,
      ttsMode: args.ttsMode,
      ttsVoice: args.ttsVoice,
      createdAt: now,
      updatedAt: now,
    });
    const playerId = args.host
      ? await insertPlayer(ctx, gameId, { ...args.host, type: "HUMAN" }, now)
      : null;
    for (const ai of args.aiPlayers) await insertPlayer(ctx, gameId, { ...ai, type: "AI" }, now);
    const sessionId = await ctx.db.insert("playerSessions", {
      gameId,
      ...(playerId ? { playerId } : {}),
      capabilityHash: args.capabilityHash,
      createdAt: now,
    });
    await ctx.db.patch("games", gameId, {
      hostSessionId: sessionId,
      ...(playerId ? { hostPlayerId: playerId } : {}),
    });
    const game = (await ctx.db.get("games", gameId))!;
    await getMode(args.gameType).createRoom?.(ctx, game, args.settings);
    return { gameId, sessionId, playerId };
  },
});

export const join = action({
  args: { roomCode: v.string(), name: v.string() },
  handler: async (ctx, args): Promise<RoomSession> => {
    const roomCode = normalizeRoomCode(args.roomCode);
    const name = normalizePlayerName(args.name);
    const secret = createCapabilitySecret();
    const result: { sessionId: Id<"playerSessions">; playerId: Id<"players">; gameType: GameType } =
      await ctx.runMutation(internal.rooms.takeSeat, {
        roomCode,
        ...name,
        capabilityHash: await hashCapabilitySecret(secret),
      });
    return {
      capability: encodeCapability(result.sessionId, secret),
      roomCode,
      gameType: result.gameType,
      playerId: result.playerId,
    };
  },
});

async function deleteSeatSessions(ctx: MutationCtx, game: Doc<"games">, playerId: Id<"players">) {
  const sessions = await ctx.db
    .query("playerSessions")
    .withIndex("by_playerId", (index) => index.eq("playerId", playerId))
    .take(MAX_SEAT_SESSIONS);
  for (const session of sessions) {
    if (game.hostSessionId === session._id) {
      await ctx.db.patch("games", game._id, { hostSessionId: undefined });
    }
    await ctx.db.delete("playerSessions", session._id);
  }
}

/**
 * Joins a lobby, or reclaims a seat by name. A seat can be reclaimed as soon
 * as no tab is holding it, which is how a player gets back in after losing
 * their tab, switching phones, or clearing the browser.
 */
export const takeSeat = internalMutation({
  args: {
    roomCode: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    capabilityHash: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.roomCode);
    if (!game) throw new ConvexError("Room not found. Check the code and try again.");
    const now = Date.now();

    const existing = await ctx.db
      .query("players")
      .withIndex("by_gameId_and_normalizedName", (index) =>
        index.eq("gameId", game._id).eq("normalizedName", args.normalizedName),
      )
      .unique();
    if (existing) {
      if (existing.type !== "HUMAN") throw new ConvexError("That name belongs to an AI player");
      if (existing.kickedAt !== undefined)
        throw new ConvexError("That player was removed from this room");
      // Only a tab that is live right now holds the seat; a closed or
      // crashed one lets its owner straight back in from another device.
      const presence = await loadPresence(ctx, game._id);
      if (presence.get(existing._id)?.online) {
        throw new ConvexError(
          `${existing.name} is already in the room. If that's you, close the other tab and try again in a few seconds.`,
        );
      }
      await deleteSeatSessions(ctx, game, existing._id);
      const sessionId = await ctx.db.insert("playerSessions", {
        gameId: game._id,
        playerId: existing._id,
        capabilityHash: args.capabilityHash,
        createdAt: now,
      });
      return { sessionId, playerId: existing._id, gameType: game.gameType };
    }

    if (game.status !== "LOBBY") {
      throw new ConvexError(
        "This game already started. To rejoin, enter the exact name you played with.",
      );
    }
    const players = await loadActivePlayers(ctx, game._id);
    const { maxPlayers } = getMode(game.gameType);
    if (players.length >= maxPlayers) {
      throw new ConvexError(`The room is full (${maxPlayers} players)`);
    }
    const playerId = await insertPlayer(
      ctx,
      game._id,
      { name: args.name, normalizedName: args.normalizedName, type: "HUMAN" },
      now,
    );
    const sessionId = await ctx.db.insert("playerSessions", {
      gameId: game._id,
      playerId,
      capabilityHash: args.capabilityHash,
      createdAt: now,
    });
    await ctx.db.patch("games", game._id, { updatedAt: now });
    return { sessionId, playerId, gameType: game.gameType };
  },
});

/**
 * Removes a player. In the lobby the seat disappears; mid-game it is retired
 * so the history stays intact and the round stops waiting on them.
 */
export const kick = mutation({
  args: { capability: v.string(), playerId: v.id("players") },
  handler: async (ctx, args) => {
    const { game, player: me } = await requireHost(ctx, args.capability);
    const target = await ctx.db.get("players", args.playerId);
    if (!target || target.gameId !== game._id || target.kickedAt !== undefined) return;
    if (target._id === me?._id) throw new ConvexError("You can't remove yourself");
    if (target.type === "AI" && game.status !== "LOBBY") {
      throw new ConvexError("AI players can only be removed in the lobby");
    }
    if (game.status === "PLAYING" && (await loadActivePlayers(ctx, game._id)).length <= 2) {
      throw new ConvexError("A game needs at least two players");
    }

    await deleteSeatSessions(ctx, game, target._id);
    await roomPresence.removeRoomUser(ctx, game._id, target._id);
    await getMode(game.gameType).onPlayerRemoved?.(ctx, game, target);
    if (game.status === "LOBBY") {
      await ctx.db.delete("players", target._id);
    } else {
      await ctx.db.patch("players", target._id, { kickedAt: Date.now() });
    }
    if (game.hostPlayerId === target._id) {
      await ctx.db.patch("games", game._id, { hostPlayerId: undefined });
    }
    await ctx.db.patch("games", game._id, { updatedAt: Date.now() });
    if (game.status === "PLAYING") await settle(ctx, game._id);
  },
});
