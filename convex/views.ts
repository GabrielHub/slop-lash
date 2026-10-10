import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireViewer, type Viewer } from "./capabilities";
import { getMode } from "./modes";
import { findGameByCode, findGameByNumber, loadPlayers, loadPresence } from "./roster";
import { matchslopView } from "./matchslop/view";
import { quizslopView } from "./quizslop/view";
import { slopfightView } from "./slopfight/view";
import { sloplashView } from "./sloplash/view";

const MAX_MODEL_USAGES = 32;

/** `players` is the room view's own read of every player (kicked ones included), shared, not repeated. */
async function modeView(
  ctx: QueryCtx,
  game: Doc<"games">,
  viewerId: Id<"players"> | null,
  players: Promise<Doc<"players">[]>,
) {
  switch (game.gameType) {
    case "SLOPLASH":
      return sloplashView(ctx, game, viewerId, players);
    case "MATCHSLOP":
      return matchslopView(ctx, game, viewerId);
    case "QUIZSLOP":
      return quizslopView(ctx, game, viewerId, players);
    case "SLOPFIGHT":
      return slopfightView(ctx, game, viewerId);
  }
}

async function loadUsage(ctx: QueryCtx, game: Doc<"games">) {
  const byModel = await ctx.db
    .query("gameModelUsage")
    .withIndex("by_gameId_and_modelId", (index) => index.eq("gameId", game._id))
    .take(MAX_MODEL_USAGES);
  const sum = (field: "inputTokens" | "outputTokens" | "costUsd") =>
    byModel.reduce((total, entry) => total + entry[field], 0);
  return {
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    costUsd: sum("costUsd"),
    byModel: byModel
      .map(({ modelId, inputTokens, outputTokens, costUsd }) => ({
        modelId,
        inputTokens,
        outputTokens,
        costUsd,
      }))
      .toSorted((left, right) => right.costUsd - left.costUsd),
  };
}

/** What one viewer sees of a room. A null viewer is an outside spectator. */
async function buildRoomView(ctx: QueryCtx, game: Doc<"games">, viewer: Viewer | null) {
  const viewerId = viewer?.player?._id ?? null;
  const finished = game.status === "FINISHED";
  const allPlayers = loadPlayers(ctx, game._id);
  const [players, presence, mode, usage, live] = await Promise.all([
    allPlayers,
    loadPresence(ctx, game._id),
    modeView(ctx, game, viewerId, allPlayers),
    finished ? loadUsage(ctx, game) : Promise.resolve(null),
    // A finished game may have been followed by a "Play again" under the same code.
    finished ? findGameByCode(ctx, game.roomCode) : Promise.resolve(null),
  ]);
  const { minPlayers, maxPlayers } = getMode(game.gameType);
  return {
    room: {
      id: game._id,
      code: game.roomCode,
      /** 1 for the room's first game, +1 for each "Play again". */
      gameNumber: game.gameNumber,
      /** The rematch that followed this finished game, for a seat that was left behind. */
      next:
        live && live._id !== game._id ? { gameNumber: live.gameNumber, status: live.status } : null,
      gameType: game.gameType,
      status: game.status,
      phase: game.phase,
      step: game.step,
      round: game.round,
      totalRounds: game.totalRounds,
      minPlayers,
      maxPlayers,
      phaseGeneration: game.phaseGeneration,
      phaseStartedAt: game.phaseStartedAt,
      phaseDeadline: game.deadlineHidden ? null : (game.phaseDeadline ?? null),
      /** The phase waits on an AI call (its deadline is a hidden watchdog), so it has no clock but is not host-paced. */
      awaitingAi: game.deadlineHidden === true,
      timersDisabled: game.timersDisabled,
      freePlay: game.freePlay,
      ttsMode: game.ttsMode,
      ttsVoice: game.ttsVoice,
      hostPlayerId: game.hostPlayerId ?? null,
      /** A big screen created the room rather than one of the players. */
      hasDisplayHost: game.displayHost,
    },
    me: viewer
      ? {
          sessionId: viewer.session._id,
          playerId: viewerId,
          name: viewer.player?.name ?? null,
          isHost: viewer.isHost,
        }
      : null,
    players: players
      .filter((candidate) => candidate.kickedAt === undefined)
      .map((candidate) => ({
        id: candidate._id,
        name: candidate.name,
        type: candidate.type,
        modelId: candidate.modelId ?? null,
        score: candidate.score,
        online: candidate.type === "AI" || presence.get(candidate._id)?.online === true,
        joinedAt: candidate.joinedAt,
      })),
    usage,
    mode,
  };
}

export type RoomView = Awaited<ReturnType<typeof buildRoomView>>;

/**
 * The one live subscription every screen uses: the room, its players, who is
 * here, and the mode's own view of the current phase for this viewer.
 */
export const room = query({
  args: { capability: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx, args.capability);
    return buildRoomView(ctx, viewer.game, viewer);
  },
});

/**
 * A room as a TV or onlooker sees it: only what the shared screen shows, so a
 * stage can be opened from the room code alone.
 */
export const watch = query({
  args: { roomCode: v.string() },
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.roomCode);
    if (!game) throw new ConvexError("Room not found. Check the code and try again.");
    return buildRoomView(ctx, game, null);
  },
});

/** A finished game of a room, as anyone with the code sees it. Game 1 by default. */
export const recap = query({
  args: { roomCode: v.string(), gameNumber: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const gameNumber = args.gameNumber ?? 1;
    if (!Number.isInteger(gameNumber) || gameNumber < 1) return { kind: "NOT_FOUND" as const };
    const game = await findGameByNumber(ctx, args.roomCode, gameNumber);
    if (!game) return { kind: "NOT_FOUND" as const };
    if (game.status !== "FINISHED") return { kind: "IN_PROGRESS" as const };
    return { kind: "READY" as const, view: await buildRoomView(ctx, game, null) };
  },
});
