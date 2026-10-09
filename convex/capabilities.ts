import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const CAPABILITY_SEPARATOR = ".";
const CAPABILITY_SECRET_BYTES = 32;

type DatabaseCtx = QueryCtx | MutationCtx;

export type Viewer = {
  game: Doc<"games">;
  session: Doc<"playerSessions">;
  /** The seat this browser plays, or null for a display-only host. */
  player: Doc<"players"> | null;
  isHost: boolean;
};

function unauthorized(): never {
  throw new ConvexError("Invalid or expired room capability");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function createCapabilitySecret(): string {
  const bytes = new Uint8Array(CAPABILITY_SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function encodeCapability(sessionId: string, secret: string): string {
  return `${sessionId}${CAPABILITY_SEPARATOR}${secret}`;
}

function decodeCapability(capability: string): { sessionId: string; secret: string } {
  const separatorIndex = capability.indexOf(CAPABILITY_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === capability.length - 1) unauthorized();
  return {
    sessionId: capability.slice(0, separatorIndex),
    secret: capability.slice(separatorIndex + 1),
  };
}

export async function hashCapabilitySecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function isHostViewer(
  game: Doc<"games">,
  session: Doc<"playerSessions">,
  player: Doc<"players"> | null,
): boolean {
  return (
    game.hostSessionId === session._id ||
    (player !== null && game.hostPlayerId !== undefined && game.hostPlayerId === player._id)
  );
}

/** Resolves a capability to its room, seat, and host status. */
export async function requireViewer(ctx: DatabaseCtx, capability: string): Promise<Viewer> {
  const decoded = decodeCapability(capability);
  const sessionId = ctx.db.normalizeId("playerSessions", decoded.sessionId);
  if (!sessionId) unauthorized();

  const session = await ctx.db.get("playerSessions", sessionId);
  if (!session) unauthorized();
  const capabilityHash = await hashCapabilitySecret(decoded.secret);
  if (!constantTimeEqual(session.capabilityHash, capabilityHash)) unauthorized();

  const [game, player] = await Promise.all([
    ctx.db.get("games", session.gameId),
    session.playerId ? ctx.db.get("players", session.playerId) : null,
  ]);
  if (!game) unauthorized();
  if (session.playerId && (!player || player.gameId !== game._id)) unauthorized();
  if (player?.kickedAt !== undefined) {
    throw new ConvexError("You were removed from this room");
  }
  return { game, session, player, isHost: isHostViewer(game, session, player) };
}

/** A seated, non-kicked player. */
export async function requirePlayer(
  ctx: DatabaseCtx,
  capability: string,
): Promise<Viewer & { player: Doc<"players"> }> {
  const viewer = await requireViewer(ctx, capability);
  if (!viewer.player) throw new ConvexError("Only players can do that");
  return { ...viewer, player: viewer.player };
}

export async function requireHost(ctx: DatabaseCtx, capability: string): Promise<Viewer> {
  const viewer = await requireViewer(ctx, capability);
  if (!viewer.isHost) throw new ConvexError("Only the host can do that");
  return viewer;
}
