import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { roomPresence } from "./components";
import { normalizeRoomCodeValue } from "../src/lib/room-code";

type DatabaseCtx = QueryCtx | MutationCtx;

const MAX_ROOM_PLAYERS = 16;
const MAX_PRESENCE_USERS = 32;

/**
 * A seat stays "connected" this long after its last tab disconnects, so
 * glancing at another app or a quick reload never costs a player their turn.
 */
export const AWAY_GRACE_MS = 15_000;

/** How long the host can be away before host controls move to someone else. */
export const HOST_FAILOVER_MS = 30_000;

export type Presence = Map<string, { online: boolean; lastDisconnected: number }>;

/** A room by its code, typed however the player typed it. */
export async function findGameByCode(ctx: DatabaseCtx, roomCode: string) {
  return ctx.db
    .query("games")
    .withIndex("by_roomCode", (index) => index.eq("roomCode", normalizeRoomCodeValue(roomCode)))
    .unique();
}

/** Seats a new human or AI player with a clean scorecard. */
export async function insertPlayer(
  ctx: MutationCtx,
  gameId: Id<"games">,
  fields: Pick<Doc<"players">, "name" | "normalizedName" | "type" | "modelId">,
  now = Date.now(),
): Promise<Id<"players">> {
  return ctx.db.insert("players", {
    gameId,
    ...fields,
    score: 0,
    humorRating: 1,
    winStreak: 0,
    joinedAt: now,
  });
}

export async function loadPlayers(ctx: DatabaseCtx, gameId: Id<"games">) {
  return ctx.db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_ROOM_PLAYERS);
}

/** Players still in the game: everyone except kicked seats. */
export async function loadActivePlayers(ctx: DatabaseCtx, gameId: Id<"games">) {
  return (await loadPlayers(ctx, gameId)).filter((player) => player.kickedAt === undefined);
}

export async function loadPresence(ctx: DatabaseCtx, gameId: Id<"games">): Promise<Presence> {
  const entries = await roomPresence.listRoom(ctx, gameId, false, MAX_PRESENCE_USERS);
  return new Map(entries.map((entry) => [entry.userId, entry]));
}

export function presenceUserId(
  session: Doc<"playerSessions">,
  player: Doc<"players"> | null,
): string {
  return player?._id ?? session._id;
}

/**
 * Whether a presence user counts as here. A seat with no presence record yet
 * gets the same grace from `sinceFallback` (usually when it joined).
 */
export function isConnected(
  presence: Presence,
  userId: string,
  now: number,
  sinceFallback: number,
): boolean {
  const entry = presence.get(userId);
  if (!entry) return now - sinceFallback < AWAY_GRACE_MS;
  return entry.online || now - entry.lastDisconnected < AWAY_GRACE_MS;
}

export function isPlayerConnected(presence: Presence, player: Doc<"players">, now: number) {
  return player.type === "AI" || isConnected(presence, player._id, now, player.joinedAt);
}

/**
 * The players the engine waits on: AI seats plus humans who are connected.
 * Humans who walked away stop holding up the room until they come back.
 */
export async function loadConnectedPlayers(ctx: DatabaseCtx, game: Doc<"games">, now: number) {
  const [players, presence] = await Promise.all([
    loadActivePlayers(ctx, game._id),
    loadPresence(ctx, game._id),
  ]);
  return {
    players,
    connected: players.filter((player) => isPlayerConnected(presence, player, now)),
    presence,
  };
}
