import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { aiWorkpools } from "../components";
import { mixedHash } from "../../src/lib/hash";
import {
  CHAMPIONS,
  FOUNDRY_WATCHDOG_SECONDS,
  STROKES_PER_DOODLE,
} from "../../src/games/slopfight/constants";
import {
  balanceChampion,
  ChampionSchema,
  maxHealth,
  type Champion,
} from "../../src/games/slopfight/sheet";
import { scoreFight, totalsByPlayer } from "../../src/games/slopfight/scoring";
import {
  addResult,
  fightLimitMs,
  fightSeed,
  FIGHTS_PER_ROUND,
  ROUNDS,
  roundArena,
} from "../../src/games/slopfight/tournament";
import type { ForgeKind, StoredOutcome } from "./tables";

// Reads and writes shared by the mode, the player mutations, the forge and the
// sim: bounded loaders, forge and sim launchers, and fight scoring.

type DatabaseCtx = QueryCtx | MutationCtx;
export type Fighter = Doc<"slopFightFighters">;
export type Fight = Doc<"slopFightFights">;

const MAX_FIGHTS = 12;
const MAX_BETS = 16;

export async function loadState(ctx: DatabaseCtx, gameId: Id<"games">) {
  return ctx.db
    .query("slopFightState")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .unique();
}

/** The four fighters in slot order. */
export async function loadFighters(ctx: DatabaseCtx, gameId: Id<"games">): Promise<Fighter[]> {
  return ctx.db
    .query("slopFightFighters")
    .withIndex("by_gameId_and_slot", (index) => index.eq("gameId", gameId))
    .take(CHAMPIONS);
}

/** Every fight created so far, by round then step. */
export async function loadFights(ctx: DatabaseCtx, gameId: Id<"games">): Promise<Fight[]> {
  return ctx.db
    .query("slopFightFights")
    .withIndex("by_gameId_and_round_and_step", (index) => index.eq("gameId", gameId))
    .take(MAX_FIGHTS);
}

export async function loadRoundFights(ctx: DatabaseCtx, gameId: Id<"games">, round: number) {
  return ctx.db
    .query("slopFightFights")
    .withIndex("by_gameId_and_round_and_step", (index) =>
      index.eq("gameId", gameId).eq("round", round),
    )
    .take(FIGHTS_PER_ROUND);
}

export async function findFight(
  ctx: DatabaseCtx,
  gameId: Id<"games">,
  round: number,
  step: number,
): Promise<Fight | null> {
  return ctx.db
    .query("slopFightFights")
    .withIndex("by_gameId_and_round_and_step", (index) =>
      index.eq("gameId", gameId).eq("round", round).eq("step", step),
    )
    .unique();
}

/** Phases that play one fight, `step` being its index in the round. */
export const FIGHT_PHASES: readonly string[] = ["FACE_OFF", "FIGHT", "RESULT"];

/** The fight on screen, or null outside the fight phases. */
export async function currentFight(ctx: DatabaseCtx, game: Doc<"games">) {
  if (game.status !== "PLAYING" || !FIGHT_PHASES.includes(game.phase)) return null;
  return findFight(ctx, game._id, game.round, game.step);
}

export async function loadBets(ctx: DatabaseCtx, fightId: Id<"slopFightFights">) {
  return ctx.db
    .query("slopFightBets")
    .withIndex("by_fightId_and_playerId", (index) => index.eq("fightId", fightId))
    .take(MAX_BETS);
}

// ---------------------------------------------------------------------------
// Strokes
// ---------------------------------------------------------------------------

/** Stroke layers one fighter can draw: Build (layer 0) and one per upgrade round (2..ROUNDS). */
export const STROKE_LAYERS = ROUNDS;

/**
 * Stroke rows one fighter can hold. Every row carries at least one stroke and
 * a layer holds at most STROKES_PER_DOODLE, so this reads every row even if
 * each stroke went up alone (real batches coalesce several).
 */
export const MAX_FIGHTER_STROKE_ROWS = STROKES_PER_DOODLE * STROKE_LAYERS;

/**
 * One fighter's stroke rows in layer then seq order, every layer or only
 * those up to `maxLayer`. Read per fighter so a heavy doodler never pushes
 * anyone else's strokes out of a capped read.
 */
export async function loadFighterStrokeRows(
  ctx: DatabaseCtx,
  fighterId: Id<"slopFightFighters">,
  maxLayer?: number,
): Promise<Doc<"slopFightStrokes">[]> {
  return ctx.db
    .query("slopFightStrokes")
    .withIndex("by_fighterId_and_layer_and_seq", (index) =>
      maxLayer === undefined
        ? index.eq("fighterId", fighterId)
        : index.eq("fighterId", fighterId).lte("layer", maxLayer),
    )
    .take(MAX_FIGHTER_STROKE_ROWS);
}

/** Every fighter's stroke rows (slot order, then layer and seq), for the easels and the recap. */
export async function loadGameStrokeRows(ctx: DatabaseCtx, fighters: readonly Fighter[]) {
  const perFighter = await Promise.all(
    fighters.map((fighter) => loadFighterStrokeRows(ctx, fighter._id)),
  );
  return perFighter.flat();
}

/** A stored or model-written sheet, checked and balanced, or null if it is not a champion. */
export function parseChampion(raw: unknown): Champion | null {
  const parsed = ChampionSchema.safeParse(raw);
  return parsed.success ? balanceChampion(parsed.data) : null;
}

/** The sheet a fighter fights with. Stored sheets were parsed on the way in. */
export function championOf(fighter: Fighter): Champion | null {
  return fighter.champion ?? null;
}

// ---------------------------------------------------------------------------
// Forges
// ---------------------------------------------------------------------------

/** The champion version a forge in this round produces: 0 at Build, the round after an upgrade. */
export function targetVersion(game: Pick<Doc<"games">, "round">): number {
  return game.round <= 1 ? 0 : game.round;
}

/** A fighter whose champion for this round is done. */
export function isDone(fighter: Fighter, version: number): boolean {
  return fighter.status === "READY" && fighter.version >= version;
}

/**
 * How long the stage's reveal of a freshly forged champion runs after it
 * lands: the part queue catching up, the eyes, the name card drop; a drawn
 * champion's sketch then floats beside it and dissolves. BUILD, UPGRADE and
 * the Foundry hold for the last reveal instead of cutting it off.
 */
export const REVEAL_HOLD_MS = 4_500;
export const DRAWN_REVEAL_HOLD_MS = 7_500;

/** When a fighter's latest reveal ends (0 when it never landed). */
export function revealEndsAt(fighter: Pick<Fighter, "readyAt" | "inputKind">): number {
  if (fighter.readyAt === undefined) return 0;
  return fighter.readyAt + (fighter.inputKind === "DRAW" ? DRAWN_REVEAL_HOLD_MS : REVEAL_HOLD_MS);
}

/** When the last of these fighters' reveals ends. */
export function revealsEndAt(
  fighters: ReadonlyArray<Pick<Fighter, "readyAt" | "inputKind">>,
): number {
  return fighters.reduce((latest, fighter) => Math.max(latest, revealEndsAt(fighter)), 0);
}

/** A phase that shows forges landing: it waits on reveals and is re-checked when the last ends. */
const REVEAL_PHASES: ReadonlySet<string> = new Set(["BUILD", "UPGRADE", "FOUNDRY"]);

/** Re-checks the phase when the last reveal ends (a no-op once the phase moved on). */
export async function settleAfterReveals(
  ctx: MutationCtx,
  game: Doc<"games">,
  fighters: Fighter[],
): Promise<void> {
  const endsAt = revealsEndAt(fighters);
  if (!REVEAL_PHASES.has(game.phase) || endsAt <= Date.now()) return;
  await ctx.scheduler.runAt(endsAt, internal.slopfight.play.settlePing, {
    gameId: game._id,
    phaseGeneration: game.phaseGeneration,
  });
}

export const isUpgradeKind = (kind: ForgeKind | undefined) =>
  kind === "UPGRADE" || kind === "LENIENT_UPGRADE" || kind === "HOUSE_UPGRADE";

/** The forge that must produce a champion no matter what: lenient, or the house's own. */
export function lenientKind(fighter: Fighter, version: number): ForgeKind {
  if (fighter.ownerId === null) return version > 0 ? "HOUSE_UPGRADE" : "HOUSE";
  return version > 0 ? "LENIENT_UPGRADE" : "LENIENT";
}

/**
 * Starts a forge: a fresh token supersedes any forge still in flight, and the
 * Node action joins the critical AI pool. The drawing is rasterized inside it.
 * `input` is the player's submit signature (see `forgeInput` in tables.ts).
 */
export async function startForge(
  ctx: MutationCtx,
  fighter: Fighter,
  kind: ForgeKind,
  version: number,
  input?: string,
): Promise<void> {
  if (kind === "LENIENT_UPGRADE" && !(await hasAddition(ctx, fighter, version))) {
    // Nothing added and nothing to read: the champion fights on as it is, no call.
    await keepChampion(ctx, fighter, version);
    return;
  }
  const attempt = fighter.attempt + 1;
  const forgeToken = `f${attempt}`;
  await ctx.db.patch("slopFightFighters", fighter._id, {
    status: "FORGING",
    attempt,
    forgeToken,
    forge: { kind, version, startedAt: Date.now() },
    forgeInput: input,
    partial: undefined,
    partialPlan: undefined,
    rejection: undefined,
    failure: undefined,
  });
  await aiWorkpools.critical.enqueueAction(
    ctx,
    internal.slopfight.forge.run,
    { fighterId: fighter._id, forgeToken },
    // The wrapper owns repair and provider fallback; never repeat a billed forge.
    { retry: false },
  );
}

/** Whether a fighter has anything for its upgrade to `version`: a submitted addition or strokes on that layer. */
async function hasAddition(ctx: MutationCtx, fighter: Fighter, version: number): Promise<boolean> {
  if (fighter.addition?.round === version) return true;
  const stroke = await ctx.db
    .query("slopFightStrokes")
    .withIndex("by_fighterId_and_layer_and_seq", (index) =>
      index.eq("fighterId", fighter._id).eq("layer", version),
    )
    .first();
  return stroke !== null;
}

/**
 * Finishes an upgrade with the champion unchanged (nothing added, or an
 * addition rejected after the clock ran out). It still counts as done.
 */
export async function keepChampion(
  ctx: MutationCtx,
  fighter: Fighter,
  version: number,
): Promise<void> {
  await ctx.db.patch("slopFightFighters", fighter._id, {
    status: fighter.champion === undefined ? "FAILED" : "READY",
    ...(fighter.champion === undefined ? { failure: "no-champion" } : { failure: undefined }),
    previous: fighter.champion,
    version: fighter.champion === undefined ? fighter.version : version,
    partial: undefined,
    rejection: undefined,
  });
}

/**
 * House champions when the HOUSE call fails: still a real description for the
 * forge, never a template champion.
 */
export const HOUSE_FALLBACK_DESCRIPTIONS = [
  "a retired traffic cone with a grudge against minivans",
  "a sourdough starter that has learned to walk on three crusty legs",
  "a very small knight made of a single wooden spoon",
  "a pigeon in a tiny business suit carrying a briefcase",
  "a lava lamp that throws punches when the music stops",
  "a garden gnome who escaped and now does parkour",
  "a sentient mop with a long wet tail and no regrets",
  "a goldfish in a hamster ball that only rolls forward",
] as const;

/** What the house adds to each of its champions at an upgrade (picked by seed, no call). */
export const HOUSE_ADDITIONS = [
  "a tiny jetpack",
  "a second head that disagrees with the first",
  "a traffic cone hat",
  "rocket-powered roller skates",
  "a giant foam finger",
  "two extra arms, both holding spatulas",
  "a cape that is slightly too long",
  "a rubber duck sidekick strapped to its back",
  "spikes made of birthday candles",
  "a big angry eyebrow",
  "springs instead of feet",
  "a frying pan shield",
] as const;

/** A seeded pick for house fighter `slot` at `round`. */
export function housePick(
  list: readonly string[],
  gameSeed: number,
  slot: number,
  round: number,
): string {
  return list[(mixedHash(`slopfight-house:${gameSeed}:${slot}:${round}`) >>> 0) % list.length]!;
}

/** Forges every fighter that is not done and not forging, leniently. Returns the fresh fighters. */
export async function forgeLeftovers(ctx: MutationCtx, game: Doc<"games">): Promise<Fighter[]> {
  const version = targetVersion(game);
  for (const fighter of await loadFighters(ctx, game._id)) {
    if (isDone(fighter, version) || fighter.status === "FORGING") continue;
    await startForge(ctx, fighter, lenientKind(fighter, version), version);
  }
  return loadFighters(ctx, game._id);
}

/**
 * The host's retry: failed forges, plus forges that look stuck (or every
 * unfinished one in a parked Foundry) run again, leniently since the players'
 * clock is gone. Returns how many were restarted.
 */
export async function retryForges(
  ctx: MutationCtx,
  game: Doc<"games">,
  includeInFlight: boolean,
): Promise<number> {
  const version = targetVersion(game);
  const staleBefore = Date.now() - FOUNDRY_WATCHDOG_SECONDS * 1_000;
  let restarted = 0;
  for (const fighter of await loadFighters(ctx, game._id)) {
    if (isDone(fighter, version)) continue;
    const stuck =
      fighter.status === "FORGING" &&
      (includeInFlight || (fighter.forge?.startedAt ?? 0) < staleBefore);
    if (fighter.status === "FORGING" && !stuck) continue;
    if (fighter.status === "READY" && !includeInFlight) continue;
    await startForge(ctx, fighter, lenientKind(fighter, version), version);
    restarted += 1;
  }
  return restarted;
}

// ---------------------------------------------------------------------------
// Fights
// ---------------------------------------------------------------------------

/** Creates a round's fight rows from fighter pairs, once. */
export async function createRoundFights(
  ctx: MutationCtx,
  game: Doc<"games">,
  state: Doc<"slopFightState">,
  round: number,
  pairs: readonly { a: Id<"slopFightFighters">; b: Id<"slopFightFighters"> }[],
): Promise<void> {
  const fighters = new Map((await loadFighters(ctx, game._id)).map((f) => [f._id, f]));
  for (const [step, pair] of pairs.entries()) {
    if (await findFight(ctx, game._id, round, step)) continue;
    const aIsHouse = fighters.get(pair.a)?.ownerId === null;
    const bIsHouse = fighters.get(pair.b)?.ownerId === null;
    await ctx.db.insert("slopFightFights", {
      gameId: game._id,
      round,
      step,
      a: pair.a,
      b: pair.b,
      arena: roundArena(state.arenas, round),
      limitMs: fightLimitMs(aIsHouse, bIsHouse),
      seed: fightSeed(state.seed, round, step),
      isFinal: round === 3 && step === 1,
      isThirdPlace: round === 3 && step === 0,
      matchup: "PENDING",
      matchupAttempt: 0,
      sim: { status: "IDLE", attempt: 0 },
      hype: { A: 0, B: 0 },
    });
  }
}

/** Walk-on lines when the matchup call wrote none: each champion's own. */
export function fallbackWalkOn(a: Champion | null, b: Champion | null): string[] {
  return [a?.narration.walkOn[0] ?? "", b?.narration.walkOn[0] ?? ""];
}

/** Runs the server sim for a fight (again), unless it already has an outcome. */
export async function startSim(ctx: MutationCtx, fight: Fight): Promise<void> {
  if (fight.outcome) return;
  const attempt = fight.sim.attempt + 1;
  let sheets = fight.sheets;
  if (!sheets) {
    const [a, b] = await Promise.all([
      ctx.db.get("slopFightFighters", fight.a),
      ctx.db.get("slopFightFighters", fight.b),
    ]);
    const sheetA = a && championOf(a);
    const sheetB = b && championOf(b);
    // Frozen once both are forged; the sim reads these, the recap replays them.
    if (sheetA && sheetB) sheets = { A: sheetA, B: sheetB };
  }
  await ctx.db.patch("slopFightFights", fight._id, { sim: { status: "RUNNING", attempt }, sheets });
  await ctx.scheduler.runAfter(0, internal.slopfight.fightSim.run, { fightId: fight._id, attempt });
}

/** Gives up on a matchup that never came back, so the fight runs without notes. */
export async function abandonMatchup(ctx: MutationCtx, fight: Fight): Promise<Fight> {
  if (fight.matchup !== "PENDING") return fight;
  const [a, b] = await Promise.all([
    ctx.db.get("slopFightFighters", fight.a),
    ctx.db.get("slopFightFighters", fight.b),
  ]);
  const walkOn = fallbackWalkOn(a && championOf(a), b && championOf(b));
  await ctx.db.patch("slopFightFights", fight._id, { matchup: "FAILED", walkOn });
  return { ...fight, matchup: "FAILED", walkOn };
}

/**
 * When the sim failed twice the seed decides, honestly: no fight to show,
 * full health both sides, and the view says so.
 */
export function seedDecision(fight: Fight, a: Champion | null, b: Champion | null): StoredOutcome {
  const health = { A: a ? maxHealth(a) : 100, B: b ? maxHealth(b) : 100 };
  return {
    winner: mixedHash(`slopfight-decide:${fight.seed}`) % 2 === 0 ? "A" : "B",
    method: "DECISION",
    endMs: 0,
    health,
    maxHealth: health,
    events: [],
    healthTimeline: [],
    hash: `seed:${fight.seed}`,
    decidedBySeed: true,
  };
}

export async function decideBySeed(ctx: MutationCtx, fight: Fight): Promise<Fight> {
  if (fight.outcome) return fight;
  const [a, b] = await Promise.all([
    ctx.db.get("slopFightFighters", fight.a),
    ctx.db.get("slopFightFighters", fight.b),
  ]);
  const outcome = seedDecision(fight, a && championOf(a), b && championOf(b));
  await ctx.db.patch("slopFightFights", fight._id, {
    outcome,
    sim: { ...fight.sim, status: "FAILED" },
  });
  return { ...fight, outcome };
}

/**
 * Puts a fight on the scoreboard, exactly once: the owner's win and finish
 * bonus, correct bets, and both fighters' records.
 */
export async function scoreFightOnce(ctx: MutationCtx, fight: Fight): Promise<void> {
  if (fight.scoredAt !== undefined || !fight.outcome) return;
  const [a, b, bets] = await Promise.all([
    ctx.db.get("slopFightFighters", fight.a),
    ctx.db.get("slopFightFighters", fight.b),
    loadBets(ctx, fight._id),
  ]);
  if (!a || !b) return;
  const { winner, method, health } = fight.outcome;
  const awards = scoreFight({
    isFinal: fight.isFinal,
    winner,
    method,
    owners: { A: a.ownerId, B: b.ownerId },
    bets: bets.map((bet) => ({ playerId: bet.playerId, side: bet.side })),
  });
  for (const [playerId, points] of totalsByPlayer(awards)) {
    const player = await ctx.db.get("players", playerId);
    if (player && player.kickedAt === undefined) {
      await ctx.db.patch("players", playerId, { score: player.score + points });
    }
  }
  await ctx.db.patch("slopFightFighters", a._id, {
    record: addResult(a.record, winner === "A", health.A),
  });
  await ctx.db.patch("slopFightFighters", b._id, {
    record: addResult(b.record, winner === "B", health.B),
  });
  await ctx.db.patch("slopFightFights", fight._id, { awards, scoredAt: Date.now() });
}
