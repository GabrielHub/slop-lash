import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { requireHost } from "./capabilities";
import { cancelGameJobs } from "./jobs";
import { getMode } from "./modes";
import type { RoomSettings } from "./rooms";
import {
  findGameByCode,
  HOST_FAILOVER_MS,
  loadActivePlayers,
  loadConnectedPlayers,
} from "./roster";

/** Where a phase goes next. `seconds: null` waits for players or the host. */
export type Transition = {
  phase: string;
  seconds: number | null;
  step?: number;
  round?: number;
  /** The deadline only bounds an AI wait; screens show no countdown for it. */
  watchdog?: boolean;
};

export type AdvanceReason = "complete" | "deadline" | "host";

/** What every game mode provides; the engine owns everything else. */
export interface GameMode {
  minPlayers: number;
  maxPlayers: number;
  /** Finished rooms stay for their recap page instead of being deleted after an hour. */
  keepsRecaps?: boolean;
  /** Creates the mode's own state for a new room. */
  createRoom?(ctx: MutationCtx, game: Doc<"games">, settings: RoomSettings): Promise<void>;
  /** Cleans up after a player leaves the lobby or is removed mid-game. */
  onPlayerRemoved?(ctx: MutationCtx, game: Doc<"games">, player: Doc<"players">): Promise<void>;
  /** Validates the lobby and returns the first phase. Throw to refuse. */
  start(ctx: MutationCtx, game: Doc<"games">, players: Doc<"players">[]): Promise<Transition>;
  /** Whether everyone the phase is waiting on has acted. `connected` excludes absent humans. */
  isComplete(ctx: MutationCtx, game: Doc<"games">, connected: Doc<"players">[]): Promise<boolean>;
  /** Closes the current phase (filling gaps such as forfeits) and picks the next one. */
  next(ctx: MutationCtx, game: Doc<"games">, reason: AdvanceReason): Promise<Transition | "FINISH">;
  /** Runs after a phase is entered, e.g. to queue AI work. */
  onEnter?(ctx: MutationCtx, game: Doc<"games">): Promise<void>;
  /** Runs once when the game ends early or naturally, before the status flips. */
  onFinish?(ctx: MutationCtx, game: Doc<"games">, early: boolean): Promise<void>;
  /**
   * Sets up the mode's own state for a "Play again" of `previous`. `next` is the
   * new LOBBY game under the same code, already holding the carried-over seats.
   * `previous` is FINISHED and must not be changed.
   */
  rematch?(ctx: MutationCtx, previous: Doc<"games">, next: Doc<"games">): Promise<void>;
}

/** A phase deadline that respects the room's "no timers" setting. */
export function timed(game: Doc<"games">, seconds: number): number | null {
  return game.timersDisabled ? null : seconds;
}

/** If a scheduled tick was lost, the sweep fires it this long after the deadline. */
const MISSED_DEADLINE_GRACE_MS = 10_000;
const SWEEP_BATCH = 50;
const MAINTENANCE_INTERVAL_MS = 15_000;

/**
 * How long after the end a finished game still hands host controls to someone
 * online, so "Play again" never dies with a host who walked off at the results.
 */
export const REMATCH_WINDOW_MS = 30 * 60_000;

async function reload(ctx: MutationCtx, gameId: Id<"games">): Promise<Doc<"games">> {
  const game = await ctx.db.get("games", gameId);
  if (!game) throw new ConvexError("Game not found");
  return game;
}

/** The only way a game moves to another phase. */
export async function enterPhase(
  ctx: MutationCtx,
  game: Doc<"games">,
  transition: Transition,
): Promise<void> {
  const now = Date.now();
  const phaseGeneration = game.phaseGeneration + 1;
  const phaseDeadline =
    transition.seconds === null ? undefined : now + Math.max(1, transition.seconds) * 1_000;
  await ctx.db.patch("games", game._id, {
    status: "PLAYING",
    phase: transition.phase,
    step: transition.step ?? 0,
    round: transition.round ?? game.round,
    phaseGeneration,
    phaseStartedAt: now,
    phaseDeadline,
    deadlineHidden: transition.watchdog || undefined,
    updatedAt: now,
  });
  if (phaseDeadline !== undefined) {
    await ctx.scheduler.runAt(phaseDeadline, internal.engine.tick, {
      gameId: game._id,
      phaseGeneration,
    });
  }
  await getMode(game.gameType).onEnter?.(ctx, await reload(ctx, game._id));
}

export async function finishGame(
  ctx: MutationCtx,
  game: Doc<"games">,
  early: boolean,
): Promise<void> {
  if (game.status === "FINISHED") return;
  try {
    await ctx.runMutation(internal.engine.runFinishHook, { gameId: game._id, early });
  } catch (error) {
    // A broken scoring hook must never keep a room from ending.
    console.error(`[engine] finish hook failed for ${game._id}`, error);
  }
  const now = Date.now();
  await ctx.db.patch("games", game._id, {
    status: "FINISHED",
    phase: "FINAL",
    step: 0,
    phaseGeneration: game.phaseGeneration + 1,
    phaseStartedAt: now,
    phaseDeadline: undefined,
    deadlineHidden: undefined,
    finishedAt: now,
    updatedAt: now,
  });
  await cancelGameJobs(ctx, game._id);
  try {
    await getMode(game.gameType).onEnter?.(ctx, await reload(ctx, game._id));
  } catch (error) {
    console.error(`[engine] final onEnter failed for ${game._id}`, error);
  }
}

async function advance(ctx: MutationCtx, game: Doc<"games">, reason: AdvanceReason) {
  const result = await getMode(game.gameType).next(ctx, game, reason);
  const current = await reload(ctx, game._id);
  if (result === "FINISH") await finishGame(ctx, current, false);
  else await enterPhase(ctx, current, result);
}

/**
 * Advances when everyone the phase is waiting on has acted. Call after any
 * player input or AI result; it is a cheap no-op otherwise.
 */
export async function settle(ctx: MutationCtx, gameId: Id<"games">): Promise<boolean> {
  const game = await ctx.db.get("games", gameId);
  if (!game || game.status !== "PLAYING") return false;
  return settleWithRoster(ctx, game, await loadConnectedPlayers(ctx, game, Date.now()));
}

type ConnectedRoster = Awaited<ReturnType<typeof loadConnectedPlayers>>;

async function settleWithRoster(
  ctx: MutationCtx,
  game: Doc<"games">,
  { players, connected }: ConnectedRoster,
): Promise<boolean> {
  // With every human away, nobody is watching: let the clock run instead of
  // racing through phases on AI input alone.
  const humansHere = connected.some((player) => player.type === "HUMAN");
  const humansExist = players.some((player) => player.type === "HUMAN");
  if (humansExist && !humansHere) return false;
  if (!(await getMode(game.gameType).isComplete(ctx, game, connected))) return false;
  await advance(ctx, game, "complete");
  return true;
}

/** Moves host controls to a connected human when the current host is gone. */
async function failOverHost(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
  { players, presence }: ConnectedRoster,
): Promise<Doc<"games">> {
  const hostPlayerActive = players.some((player) => player._id === game.hostPlayerId);
  const hostIds = [hostPlayerActive ? game.hostPlayerId : undefined, game.hostSessionId].filter(
    (id): id is NonNullable<typeof id> => id !== undefined,
  );
  if (hostIds.some((id) => presence.get(id)?.online)) return game;
  const hostLastSeen = Math.max(
    game.createdAt,
    ...hostIds.map((id) => presence.get(id)?.lastDisconnected ?? 0),
  );
  if (now - hostLastSeen < HOST_FAILOVER_MS) return game;
  const successor = players
    .filter((player) => player.type === "HUMAN" && presence.get(player._id)?.online)
    .toSorted((left, right) => left.joinedAt - right.joinedAt)[0];
  if (successor && successor._id !== game.hostPlayerId) {
    await ctx.db.patch("games", game._id, { hostPlayerId: successor._id, updatedAt: now });
    return { ...game, hostPlayerId: successor._id, updatedAt: now };
  }
  return game;
}

// ---------------------------------------------------------------------------
// Internal entry points
// ---------------------------------------------------------------------------

/** Runs a mode's `next` in a subtransaction so a failure rolls back cleanly. */
export const runAdvance = internalMutation({
  args: {
    gameId: v.id("games"),
    phaseGeneration: v.number(),
    reason: v.union(v.literal("complete"), v.literal("deadline"), v.literal("host")),
  },
  handler: async (ctx, args) => {
    const game = await reload(ctx, args.gameId);
    if (game.status !== "PLAYING" || game.phaseGeneration !== args.phaseGeneration) return;
    await advance(ctx, game, args.reason);
  },
});

export const runFinishHook = internalMutation({
  args: { gameId: v.id("games"), early: v.boolean() },
  handler: async (ctx, args) => {
    const game = await reload(ctx, args.gameId);
    await getMode(game.gameType).onFinish?.(ctx, game, args.early);
  },
});

/**
 * Advances a phase whose deadline passed. If the mode throws, the game ends
 * instead of freezing on a phase nobody can leave.
 */
async function advanceOrRescue(
  ctx: MutationCtx,
  game: Doc<"games">,
  reason: AdvanceReason,
): Promise<void> {
  try {
    await ctx.runMutation(internal.engine.runAdvance, {
      gameId: game._id,
      phaseGeneration: game.phaseGeneration,
      reason,
    });
  } catch (error) {
    console.error(`[engine] ${game.gameType} ${game.phase} failed to advance; ending game`, error);
    await finishGame(ctx, await reload(ctx, game._id), true);
  }
}

export const tick = internalMutation({
  args: { gameId: v.id("games"), phaseGeneration: v.number() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (!game || game.status !== "PLAYING" || game.phaseGeneration !== args.phaseGeneration) {
      return;
    }
    if (game.phaseDeadline === undefined || game.phaseDeadline > Date.now()) return;
    await advanceOrRescue(ctx, game, "deadline");
  },
});

/** When a finished game ended, falling back to `updatedAt` where `finishedAt` is unset. */
export function finishedAtOf(game: Doc<"games">): number {
  return game.finishedAt ?? game.updatedAt;
}

/** Housekeeping shares one roster read for host failover and phase completion. */
async function maintainGame(ctx: MutationCtx, game: Doc<"games">, now: number): Promise<void> {
  if (game.status === "FINISHED") {
    // Only the room's live game can be played again, and only for a while.
    if (now - finishedAtOf(game) > REMATCH_WINDOW_MS) return;
    const live = await findGameByCode(ctx, game.roomCode);
    if (live?._id !== game._id) return;
  }
  const roster = await loadConnectedPlayers(ctx, game, now);
  const current = await failOverHost(ctx, game, now, roster);
  if (current.status !== "PLAYING") return;
  if (
    current.phaseDeadline !== undefined &&
    current.phaseDeadline + MISSED_DEADLINE_GRACE_MS < now
  ) {
    await advanceOrRescue(ctx, current, "deadline");
    return;
  }
  try {
    await settleWithRoster(ctx, current, roster);
  } catch (error) {
    console.error(`[engine] settle failed for ${current._id}`, error);
  }
}

/**
 * Occupied rooms maintain themselves through existing heartbeats, at most once
 * per interval across all tabs. The throttle lives outside games so it cannot
 * invalidate every room subscription. Closing all tabs leaves no timer chain.
 */
export async function maintainFromHeartbeat(
  ctx: MutationCtx,
  game: Doc<"games">,
  reconnecting: boolean,
): Promise<void> {
  const now = Date.now();
  if (game.status === "FINISHED" && now - finishedAtOf(game) > REMATCH_WINDOW_MS) return;
  const maintenance = await ctx.db
    .query("roomMaintenance")
    .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
    .unique();
  if (!reconnecting && maintenance && now - maintenance.checkedAt < MAINTENANCE_INTERVAL_MS) return;
  // A sleeping party resumes one tab at a time. Give the other seats one
  // maintenance interval to reconnect before treating them as absent. Actual
  // presence detects short absences even if a TV kept maintenance running.
  const resuming = !maintenance || reconnecting;
  if (maintenance) {
    await ctx.db.patch("roomMaintenance", maintenance._id, { checkedAt: now });
  } else {
    await ctx.db.insert("roomMaintenance", { gameId: game._id, checkedAt: now });
  }
  if (resuming) return;
  try {
    // Keep successful presence writes even if housekeeping fails. Its phase
    // changes run in a subtransaction and roll back independently on error.
    await ctx.runMutation(internal.engine.maintain, { gameId: game._id });
  } catch (error) {
    console.error(`[engine] heartbeat maintenance failed for ${game._id}`, error);
  }
}

/** Per-room housekeeping, also callable explicitly for diagnostics and recovery. */
export const maintain = internalMutation({
  args: { gameId: v.id("games") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (game) await maintainGame(ctx, game, Date.now());
    return null;
  },
});

/** Low-frequency safety net: only overdue deadlines need work without a heartbeat. */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const games = await ctx.db
      .query("games")
      .withIndex("by_status_and_phaseDeadline", (index) =>
        index
          .eq("status", "PLAYING")
          .gt("phaseDeadline", 0)
          .lt("phaseDeadline", Date.now() - MISSED_DEADLINE_GRACE_MS),
      )
      .take(SWEEP_BATCH);
    for (const game of games) {
      await ctx.scheduler.runAfter(0, internal.engine.tick, {
        gameId: game._id,
        phaseGeneration: game.phaseGeneration,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Host controls
// ---------------------------------------------------------------------------

export const start = mutation({
  args: { capability: v.string() },
  handler: async (ctx, args) => {
    const { game } = await requireHost(ctx, args.capability);
    if (game.status !== "LOBBY") throw new ConvexError("The game already started");
    const mode = getMode(game.gameType);
    const players = await loadActivePlayers(ctx, game._id);
    if (players.length < mode.minPlayers) {
      throw new ConvexError(`Need at least ${mode.minPlayers} players`);
    }
    const first = await mode.start(ctx, game, players);
    await enterPhase(ctx, await reload(ctx, game._id), { round: 1, ...first });
  },
});

/** Host "next" / "skip": closes the current phase now. */
export const advanceByHost = mutation({
  args: { capability: v.string(), expectedPhaseGeneration: v.number() },
  handler: async (ctx, args) => {
    const { game } = await requireHost(ctx, args.capability);
    if (game.status !== "PLAYING") throw new ConvexError("The game is not running");
    // A double tap or a timer that just fired already did the job.
    if (game.phaseGeneration !== args.expectedPhaseGeneration) return;
    await advance(ctx, game, "host");
  },
});

export const end = mutation({
  args: { capability: v.string() },
  handler: async (ctx, args) => {
    const { game } = await requireHost(ctx, args.capability);
    if (game.status === "LOBBY") throw new ConvexError("The game has not started");
    await finishGame(ctx, game, true);
  },
});
