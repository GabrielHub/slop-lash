import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const CAPABILITY_SEPARATOR = ".";
const CAPABILITY_SECRET_BYTES = 32;

type DatabaseCtx = QueryCtx | MutationCtx;

export type AuthorizedSession = {
  game: Doc<"games">;
  player: Doc<"players"> | null;
  session: Doc<"playerSessions">;
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

export function decodeCapability(capability: string): {
  sessionId: string;
  secret: string;
} {
  const separatorIndex = capability.indexOf(CAPABILITY_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === capability.length - 1) {
    unauthorized();
  }
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

export async function requireCapabilityHash(
  ctx: DatabaseCtx,
  sessionId: string,
  capabilityHash: string,
): Promise<AuthorizedSession> {
  const normalizedSessionId = ctx.db.normalizeId("playerSessions", sessionId);
  if (!normalizedSessionId) unauthorized();

  const session = await ctx.db.get("playerSessions", normalizedSessionId);
  if (
    !session ||
    session.revokedAt !== undefined ||
    (session.expiresAt !== undefined && session.expiresAt <= Date.now()) ||
    !constantTimeEqual(session.capabilityHash, capabilityHash)
  ) {
    unauthorized();
  }

  const game = await ctx.db.get("games", session.gameId);
  if (!game) unauthorized();

  const player = session.playerId ? await ctx.db.get("players", session.playerId) : null;
  if (player && player.gameId !== game._id) unauthorized();
  if (!player && session.role !== "HOST") unauthorized();

  return { game, player, session };
}

export async function requireCapability(
  ctx: DatabaseCtx,
  capability: string,
): Promise<AuthorizedSession> {
  const decoded = decodeCapability(capability);
  const capabilityHash = await hashCapabilitySecret(decoded.secret);
  return requireCapabilityHash(ctx, decoded.sessionId, capabilityHash);
}

export async function requirePlayerCapability(
  ctx: DatabaseCtx,
  capability: string,
): Promise<AuthorizedSession & { player: Doc<"players"> }> {
  const authorized = await requireCapability(ctx, capability);
  if (!authorized.player) unauthorized();
  return { ...authorized, player: authorized.player };
}

export async function requireHostCapability(
  ctx: DatabaseCtx,
  capability: string,
): Promise<AuthorizedSession> {
  const authorized = await requireCapability(ctx, capability);
  if (
    authorized.session.role !== "HOST" ||
    authorized.game.hostSessionId !== authorized.session._id ||
    (authorized.player !== null && authorized.game.hostPlayerId !== authorized.player._id)
  ) {
    throw new ConvexError("Host capability required");
  }
  return authorized;
}
