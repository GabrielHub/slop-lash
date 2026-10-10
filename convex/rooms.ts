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
  requirePlayer,
  requireViewer,
} from "./capabilities";
import { roomPresence } from "./components";
import { finishedAtOf, settle } from "./engine";
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
const MAX_ROOM_SESSIONS = 64;
/** A phone that dropped this long before the end still counts as at the table. */
const REMATCH_AWAY_GRACE_MS = 60_000;

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
    // SlopFight's house champions are fighters the mode creates, not seats.
    if (args.gameType === "SLOPFIGHT" && aiModelIds.length > 0) {
      throw new ConvexError("SlopFight does not have AI players");
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
    const narrated = args.gameType === "SLOPLASH" || args.gameType === "SLOPFIGHT";
    const ttsMode = narrated ? (args.ttsMode ?? "OFF") : "OFF";
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

/** What a new lobby takes from its room; the rest starts fresh. */
type LobbyGameFields = Pick<
  Doc<"games">,
  | "roomCode"
  | "gameNumber"
  | "gameType"
  | "totalRounds"
  | "displayHost"
  | "freePlay"
  | "timersDisabled"
  | "ttsMode"
  | "ttsVoice"
>;

/** Inserts a room's next game as an empty lobby: a new room, or a "Play again". */
function insertLobbyGame(ctx: MutationCtx, fields: LobbyGameFields, now: number) {
  return ctx.db.insert("games", {
    ...fields,
    status: "LOBBY",
    phase: "LOBBY",
    step: 0,
    round: 0,
    phaseGeneration: 0,
    phaseStartedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

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

    const gameId = await insertLobbyGame(
      ctx,
      {
        roomCode: args.roomCode,
        gameNumber: 1,
        gameType: args.gameType,
        totalRounds: args.totalRounds,
        displayHost: args.host === null,
        freePlay: args.freePlay,
        timersDisabled: args.timersDisabled,
        ttsMode: args.ttsMode,
        ttsVoice: args.ttsVoice,
      },
      now,
    );
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

/**
 * "Play again": the same code starts a fresh lobby with the same settings and
 * the players still at the table, scores at 0. The finished game is left as it
 * is for its recap; every moved session follows on its own, because the
 * capability strings don't change.
 */
export const playAgain = mutation({
  args: { capability: v.string(), gameId: v.id("games") },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx, args.capability);
    const previous = viewer.game;
    if (previous._id !== args.gameId) {
      // An earlier press (the TV and the host's phone both tapped) already moved this session.
      const asked = await ctx.db.get("games", args.gameId);
      if (asked && asked.roomCode === previous.roomCode && asked.gameNumber < previous.gameNumber) {
        return;
      }
      throw new ConvexError("This room has moved on");
    }
    if (!viewer.isHost) throw new ConvexError("Only the host can do that");
    if (previous.status !== "FINISHED") throw new ConvexError("Finish this game first");
    const live = await findGameByCode(ctx, previous.roomCode);
    if (live?._id !== previous._id) return;

    const now = Date.now();
    if (previous.freePlay) {
      // Throwing rolls the whole transaction back, so no slot is spent on a refusal.
      if (!isFreePlayConfigured()) {
        throw new ConvexError("Free Play is off right now. Use the host password to keep playing.");
      }
      if (!(await claimFreePlaySlot(ctx, now))) {
        throw new ConvexError(
          "Free Play is out of games for today. Use the host password to keep playing.",
        );
      }
    }

    const [players, presence, sessions] = await Promise.all([
      loadActivePlayers(ctx, previous._id),
      loadPresence(ctx, previous._id),
      ctx.db
        .query("playerSessions")
        .withIndex("by_gameId", (index) => index.eq("gameId", previous._id))
        .take(MAX_ROOM_SESSIONS),
    ]);
    const seated = new Set(sessions.map((session) => session.playerId));
    const finishedAt = finishedAtOf(previous);
    const carried = players.filter((player) => {
      if (player.type === "AI")
        return player.modelId !== undefined && !!getModelByModelId(player.modelId);
      if (player._id === viewer.player?._id) return true;
      // Phones that slept through the results come along; tabs closed mid-game don't.
      const entry = presence.get(player._id);
      return (
        seated.has(player._id) &&
        entry !== undefined &&
        (entry.online || entry.lastDisconnected >= finishedAt - REMATCH_AWAY_GRACE_MS)
      );
    });

    const nextId = await insertLobbyGame(
      ctx,
      {
        roomCode: previous.roomCode,
        gameNumber: previous.gameNumber + 1,
        gameType: previous.gameType,
        totalRounds: previous.totalRounds,
        displayHost: previous.displayHost,
        freePlay: previous.freePlay,
        timersDisabled: previous.timersDisabled,
        ttsMode: previous.ttsMode,
        ttsVoice: previous.ttsVoice,
      },
      now,
    );
    const seats = new Map<Id<"players">, Id<"players">>();
    for (const player of carried) {
      const fields = {
        name: player.name,
        normalizedName: player.normalizedName,
        type: player.type,
        ...(player.modelId !== undefined ? { modelId: player.modelId } : {}),
      };
      seats.set(player._id, await insertPlayer(ctx, nextId, fields, now));
    }

    let hostSessionMoved = false;
    for (const session of sessions) {
      if (session.playerId === undefined) {
        await ctx.db.patch("playerSessions", session._id, { gameId: nextId });
      } else {
        const playerId = seats.get(session.playerId);
        // A seat that was left behind keeps its session on the finished game.
        if (playerId === undefined) continue;
        await ctx.db.patch("playerSessions", session._id, { gameId: nextId, playerId });
      }
      if (session._id === previous.hostSessionId) hostSessionMoved = true;
    }
    const hostPlayerId =
      (previous.hostPlayerId && seats.get(previous.hostPlayerId)) ??
      (viewer.player ? seats.get(viewer.player._id) : undefined);
    await ctx.db.patch("games", nextId, {
      ...(hostSessionMoved ? { hostSessionId: previous.hostSessionId } : {}),
      ...(hostPlayerId ? { hostPlayerId } : {}),
    });

    // Tabs keep their presence id, and the presence component refuses a tab
    // that beats into a second room. Clearing the old room frees every tab.
    await roomPresence.removeRoom(ctx, previous._id);
    const next = (await ctx.db.get("games", nextId))!;
    await getMode(previous.gameType).rematch?.(ctx, previous, next);
  },
});

/**
 * "Done" on a finished game: this seat drops out of the room, so a later
 * "Play again" leaves it behind. The seat stays in the results. If "Play
 * again" won the race and already carried the seat into the rematch lobby,
 * the seat is removed from that lobby instead, so it never sits there
 * ownerless after the phone has forgotten the room.
 */
export const leave = mutation({
  args: { capability: v.string() },
  handler: async (ctx, args) => {
    const { game, player } = await requirePlayer(ctx, args.capability);
    const rematchLobby = game.status === "LOBBY" && game.gameNumber > 1;
    if (game.status !== "FINISHED" && !rematchLobby) {
      throw new ConvexError("Finish this game first");
    }
    await deleteSeatSessions(ctx, game, player._id);
    await roomPresence.removeRoomUser(ctx, game._id, player._id);
    if (rematchLobby) {
      await getMode(game.gameType).onPlayerRemoved?.(ctx, game, player);
      await ctx.db.delete("players", player._id);
      await ctx.db.patch("games", game._id, { updatedAt: Date.now() });
    }
    if (game.hostPlayerId === player._id) {
      await ctx.db.patch("games", game._id, { hostPlayerId: undefined });
    }
  },
});
