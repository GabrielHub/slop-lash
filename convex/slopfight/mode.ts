import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { enqueueJob } from "../jobs";
import { enterPhase, settle, timed, type GameMode, type Transition } from "../engine";
import { pickArenaOrder } from "../../src/games/slopfight/arenas";
import {
  BUILD_SECONDS,
  COIN_RESULT_SECONDS,
  FACE_OFF_SECONDS,
  FIGHT_LEAD_MS,
  FIGHT_OUTRO_MS,
  FOUNDRY_WATCHDOG_SECONDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RESULT_SECONDS,
  ROSTER_SECONDS,
  STANDINGS_SECONDS,
  UPGRADE_SECONDS,
} from "../../src/games/slopfight/constants";
import {
  EMPTY_RECORD,
  fighterSeats,
  finalRound,
  gameSeedFrom,
  qualifierPairings,
  ROUNDS,
  TOTAL_FIGHTS,
} from "../../src/games/slopfight/tournament";
import {
  abandonMatchup,
  createRoundFights,
  currentFight,
  decideBySeed,
  faceOffOpensAt,
  findFight,
  findHype,
  forgeLeftovers,
  HOUSE_ADDITIONS,
  housePick,
  isDone,
  loadBets,
  loadFighters,
  loadRoundFights,
  loadState,
  retryForges,
  revealsEndAt,
  scoreFightOnce,
  settleAfterReveals,
  startForge,
  startSim,
  targetVersion,
  type Fight,
  type Fighter,
} from "./data";
import {
  HOUSE_KIND,
  MATCHUP_KIND,
  RECAP_KIND,
  slopfightJobHandlers,
  type SlopfightJobs,
} from "./jobs";

/**
 * SlopFight phases (build plan 3.6):
 *
 *   BUILD → FOUNDRY? → ROSTER → [FACE_OFF → FIGHT → RESULT] × 2 → STANDINGS →
 *   UPGRADE → FOUNDRY? → ROSTER → … → round 3: third place, then the Final → FINAL
 *
 * `round` is the bracket round (UPGRADE already belongs to the round it
 * prepares); `step` is the fight index within the round in the fight phases.
 */
export type SlopfightPhase =
  | "BUILD"
  | "FOUNDRY"
  | "ROSTER"
  | "FACE_OFF"
  | "FIGHT"
  | "RESULT"
  | "STANDINGS"
  | "UPGRADE";

/** FIGHT waits this long for a late sim before it retries (watchdog). */
export const FIGHT_WAIT_SECONDS = 30;

export { slopfightJobHandlers, type SlopfightJobs };

/** A FOUNDRY with no deadline is parked: a forge failed twice and the host must retry. */
export function isParked(game: Doc<"games">): boolean {
  return game.phase === "FOUNDRY" && game.phaseDeadline === undefined;
}

export const foundryWatchdog = (): Transition => ({
  phase: "FOUNDRY",
  seconds: FOUNDRY_WATCHDOG_SECONDS,
  watchdog: true,
});
const parkedFoundry = (): Transition => ({ phase: "FOUNDRY", seconds: null });

const roster = (game: Doc<"games">): Transition => ({
  phase: "ROSTER",
  seconds: timed(game, ROSTER_SECONDS),
});

const faceOff = (game: Doc<"games">, step: number): Transition => ({
  phase: "FACE_OFF",
  step,
  seconds: timed(game, FACE_OFF_SECONDS),
});

/**
 * FIGHT lasts the fight: a lead-in, the sim's own length, then the outro. With
 * no outcome yet it waits (watchdog) and is entered again when the sim lands.
 */
export function fightTransition(fight: Fight): Transition {
  const seconds = fight.outcome
    ? (FIGHT_LEAD_MS + fight.outcome.endMs + FIGHT_OUTRO_MS) / 1_000
    : FIGHT_WAIT_SECONDS;
  return { phase: "FIGHT", step: fight.step, seconds, watchdog: true };
}

/** RESULT replays the decisive moment; a seed decision has none, so its RESULT is shorter. */
const result = (game: Doc<"games">, fight: Fight): Transition => ({
  phase: "RESULT",
  step: fight.step,
  seconds: timed(game, fight.outcome?.decidedBySeed ? COIN_RESULT_SECONDS : RESULT_SECONDS),
});

/** Champions all done: on to the roster, else the Foundry waits for them. */
async function afterForges(ctx: MutationCtx, game: Doc<"games">, fighters?: Fighter[]) {
  const version = targetVersion(game);
  const all = fighters ?? (await loadFighters(ctx, game._id));
  return all.every((fighter) => isDone(fighter, version)) && Date.now() >= revealsEndAt(all)
    ? roster(game)
    : foundryWatchdog();
}

/** Scores the fight and shows it; a seed decision has nothing to play, so it lands here too. */
async function toResult(ctx: MutationCtx, game: Doc<"games">, fight: Fight): Promise<Transition> {
  await scoreFightOnce(ctx, fight);
  return result(game, fight);
}

/**
 * After a fight's result: the next fight, the standings (creating the next
 * round's fights: round 2 from the pairings, round 3 from the seeding), or the
 * end after the Final.
 */
async function afterResult(ctx: MutationCtx, game: Doc<"games">): Promise<Transition | "FINISH"> {
  if (await findFight(ctx, game._id, game.round, game.step + 1)) {
    return faceOff(game, game.step + 1);
  }
  if (game.round >= ROUNDS) return "FINISH";
  const state = await loadState(ctx, game._id);
  if (!state) return "FINISH";
  if (game.round === 1) {
    await createRoundFights(ctx, game, state, 2, state.pairings[1] ?? []);
  } else {
    const fighters = await loadFighters(ctx, game._id);
    const round = finalRound(
      fighters.map((fighter) => ({ id: fighter._id, slot: fighter.slot, record: fighter.record })),
      state.seed,
    );
    const pairs = [round.thirdPlace, round.final];
    await ctx.db.patch("slopFightState", state._id, {
      seeding: round.seeding,
      pairings: [...state.pairings.slice(0, 2), pairs],
    });
    await createRoundFights(ctx, game, state, 3, pairs);
  }
  return { phase: "STANDINGS", seconds: timed(game, STANDINGS_SECONDS) };
}

/**
 * A fight's outcome was just stored. If FIGHT is already waiting on it, FIGHT
 * starts over with its real length (or goes straight to the result for a seed
 * decision, which has nothing to show); otherwise a face-off may be waiting.
 */
export async function outcomeLanded(
  ctx: MutationCtx,
  gameId: Id<"games">,
  fightId: Id<"slopFightFights">,
): Promise<void> {
  const [game, fight] = await Promise.all([
    ctx.db.get("games", gameId),
    ctx.db.get("slopFightFights", fightId),
  ]);
  if (!game || !fight?.outcome || game.status !== "PLAYING") return;
  const waiting =
    game.phase === "FIGHT" &&
    game.round === fight.round &&
    game.step === fight.step &&
    fight.startsAt === undefined;
  if (!waiting) {
    await settle(ctx, game._id);
    return;
  }
  const transition = fight.outcome.decidedBySeed
    ? await toResult(ctx, game, fight)
    : fightTransition(fight);
  await enterPhase(ctx, game, transition);
}

/**
 * Queues the MATCHUP call, once, for every fight of the round whose two
 * champions are final for it. A forge landing calls this, so a fight's notes
 * and sim run while the rest of the room is still forging; ROSTER calls it
 * again for any fight left.
 */
export async function queueMatchups(ctx: MutationCtx, game: Doc<"games">): Promise<void> {
  const fights = (await loadRoundFights(ctx, game._id, game.round)).filter(
    (fight) => fight.matchup === "PENDING" && fight.matchupAttempt === 0 && !fight.outcome,
  );
  if (fights.length === 0) return;
  const version = targetVersion(game);
  const done = new Set(
    (await loadFighters(ctx, game._id))
      .filter((fighter) => isDone(fighter, version))
      .map((fighter) => fighter._id),
  );
  for (const fight of fights) {
    if (!done.has(fight.a) || !done.has(fight.b)) continue;
    const attempt = fight.matchupAttempt + 1;
    await ctx.db.patch("slopFightFights", fight._id, { matchupAttempt: attempt });
    await enqueueJob(ctx, game, MATCHUP_KIND, `matchup:${fight._id}:${attempt}`, {
      fightId: fight._id,
      attempt,
    });
  }
}

export const slopfightMode: GameMode = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  keepsRecaps: true,

  async onFinish(ctx, game) {
    // A host stop or rescue can finish in FIGHT without scoring it. Preserve
    // the cheers already shown while leaving the score/awards untouched.
    if (game.phase === "FIGHT") {
      const crowd = await findHype(ctx, game._id, game.round, game.step);
      if (crowd) await ctx.db.patch("slopFightFights", crowd.fightId, { hype: crowd.hype });
    }
    // In-flight model callbacks must not revive a stream after the game ends.
    const streams = await ctx.db
      .query("slopFightForgeStreams")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(MAX_PLAYERS);
    for (const stream of streams) await ctx.db.delete("slopFightForgeStreams", stream._id);
  },

  async start(ctx, game, players) {
    const humans = players
      .filter((player) => player.type === "HUMAN")
      .toSorted((left, right) => left.joinedAt - right.joinedAt);
    if (humans.length < MIN_PLAYERS || humans.length > MAX_PLAYERS) {
      throw new ConvexError(`SlopFight needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
    }
    const seed = gameSeedFrom(`${game._id}:${game.gameNumber}:${Date.now()}`);
    const fighterIds: Id<"slopFightFighters">[] = [];
    for (const seat of fighterSeats(humans.length)) {
      fighterIds.push(
        await ctx.db.insert("slopFightFighters", {
          gameId: game._id,
          slot: seat.slot,
          ownerId: seat.human === null ? null : humans[seat.human]!._id,
          inputKind: null,
          text: "",
          status: "EMPTY",
          forgeToken: "f0",
          attempt: 0,
          version: 0,
          record: EMPTY_RECORD,
        }),
      );
    }
    const pairings = qualifierPairings(humans.length).map((round) =>
      round.map((pair) => ({ a: fighterIds[pair.a]!, b: fighterIds[pair.b]! })),
    );
    const stateId = await ctx.db.insert("slopFightState", {
      gameId: game._id,
      arenas: [...pickArenaOrder(seed)],
      seed,
      humanCount: humans.length,
      pairings,
      totalFights: TOTAL_FIGHTS,
    });
    const state = (await ctx.db.get("slopFightState", stateId))!;
    await createRoundFights(ctx, game, state, 1, pairings[0]!);
    return { phase: "BUILD", seconds: timed(game, BUILD_SECONDS) };
  },

  async onEnter(ctx, game) {
    switch (game.phase as SlopfightPhase | "FINAL") {
      case "BUILD": {
        const fighters = await loadFighters(ctx, game._id);
        if (fighters.some((fighter) => fighter.ownerId === null)) {
          // Round-bound: the house champions forge through BUILD and FOUNDRY.
          await enqueueJob(ctx, game, HOUSE_KIND, "house", {});
        }
        return;
      }
      case "FOUNDRY":
        // Entered with a reveal still playing (the clock ran out as a forge
        // landed): re-check when it ends, since that ping was for the old phase.
        await settleAfterReveals(ctx, game, await loadFighters(ctx, game._id));
        return;
      case "ROSTER":
        await queueMatchups(ctx, game);
        return;
      case "FACE_OFF": {
        // Face-off never closes before its minimum; this ping re-checks then.
        await ctx.scheduler.runAt(
          faceOffOpensAt(game),
          internal.slopfight.play.settlePing,
          { gameId: game._id, phaseGeneration: game.phaseGeneration },
        );
        const fight = await currentFight(ctx, game);
        // A matchup that resolved without its sim starting (never expected) still gets one.
        if (fight && fight.matchup !== "PENDING" && fight.sim.status === "IDLE") {
          await startSim(ctx, fight);
        }
        return;
      }
      case "FIGHT": {
        const fight = await currentFight(ctx, game);
        if (!fight) return;
        if (fight.outcome) {
          if (fight.startsAt === undefined) {
            await ctx.db.patch("slopFightFights", fight._id, {
              startsAt: game.phaseStartedAt + FIGHT_LEAD_MS,
            });
          }
          return;
        }
        // Bets are closed: a matchup still out is dropped so the sim can run now.
        if (fight.matchup === "PENDING") {
          await startSim(ctx, await abandonMatchup(ctx, fight));
        } else if (fight.sim.status === "IDLE") {
          await startSim(ctx, fight);
        }
        return;
      }
      case "RESULT": {
        const fight = await currentFight(ctx, game);
        if (fight?.outcome && !fight.outcome.decidedBySeed) {
          await enqueueJob(ctx, game, RECAP_KIND, `recap:${fight._id}`, { fightId: fight._id });
        }
        return;
      }
      case "UPGRADE": {
        // The house adds one invented thing to each of its champions, live.
        const version = targetVersion(game);
        const [fighters, state] = await Promise.all([
          loadFighters(ctx, game._id),
          loadState(ctx, game._id),
        ]);
        for (const fighter of fighters) {
          if (fighter.ownerId !== null || isDone(fighter, version)) continue;
          if (fighter.status === "FORGING") continue;
          const text = housePick(HOUSE_ADDITIONS, state?.seed ?? 0, fighter.slot, version);
          const addition = { round: version, kind: "DESCRIBE" as const, text };
          await ctx.db.patch("slopFightFighters", fighter._id, { addition });
          await startForge(ctx, { ...fighter, addition }, "HOUSE_UPGRADE", version);
        }
        return;
      }
      case "FINAL": {
        // Finishing cancels queued jobs, so recaps still missing get one more go.
        const fights = await ctx.db
          .query("slopFightFights")
          .withIndex("by_gameId_and_round_and_step", (index) => index.eq("gameId", game._id))
          .take(TOTAL_FIGHTS * 2);
        for (const fight of fights) {
          if (!fight.outcome || fight.outcome.decidedBySeed || fight.recapLine) continue;
          await enqueueJob(ctx, game, RECAP_KIND, `recap:${fight._id}:final`, {
            fightId: fight._id,
          });
        }
        return;
      }
      default:
        return;
    }
  },

  async isComplete(ctx, game, connected) {
    const here = new Set<string>(connected.map((player) => player._id));
    const away = (fighter: Fighter) => fighter.ownerId !== null && !here.has(fighter.ownerId);
    switch (game.phase as SlopfightPhase) {
      case "BUILD":
      case "UPGRADE": {
        // An absent player never holds the room; their champion is forged leniently.
        // The last champion's reveal plays out first (applyForge pings when it ends).
        const version = targetVersion(game);
        const fighters = await loadFighters(ctx, game._id);
        return (
          fighters.every((fighter) => isDone(fighter, version) || away(fighter)) &&
          Date.now() >= revealsEndAt(fighters)
        );
      }
      case "FOUNDRY": {
        const version = targetVersion(game);
        const fighters = await loadFighters(ctx, game._id);
        if (fighters.every((fighter) => isDone(fighter, version)))
          return Date.now() >= revealsEndAt(fighters);
        if (isParked(game)) return false;
        // Nothing left in flight and a forge failed twice: park for the host.
        return (
          fighters.some((fighter) => fighter.status === "FAILED") &&
          !fighters.some((fighter) => fighter.status === "FORGING")
        );
      }
      case "FACE_OFF": {
        // The clock first: before the minimum there is nothing to read.
        if (Date.now() < faceOffOpensAt(game)) return false;
        const fight = await currentFight(ctx, game);
        if (!fight?.outcome) return false;
        const bettors = new Set<string>(
          (await loadBets(ctx, fight._id)).map((bet) => bet.playerId),
        );
        return connected.every((player) => player.type !== "HUMAN" || bettors.has(player._id));
      }
      default:
        return false;
    }
  },

  async next(ctx, game, reason) {
    switch (game.phase as SlopfightPhase) {
      case "BUILD":
      case "UPGRADE":
        // Whatever each player last submitted or drew is forged leniently.
        return afterForges(ctx, game, await forgeLeftovers(ctx, game));
      case "FOUNDRY": {
        const fighters = await loadFighters(ctx, game._id);
        const transition = await afterForges(ctx, game, fighters);
        // A last-second forge can outlive this watchdog only by its reveal.
        // Keep that hold timed instead of falsely showing a jammed Foundry.
        if (fighters.every((fighter) => isDone(fighter, targetVersion(game)))) return transition;
        if (reason === "host") {
          // The host's Next is the retry: failed forges (and stuck ones) run again.
          await retryForges(ctx, game, isParked(game));
          return afterForges(ctx, game);
        }
        return parkedFoundry();
      }
      case "ROSTER":
        return faceOff(game, 0);
      case "FACE_OFF": {
        const fight = await currentFight(ctx, game);
        if (!fight) return afterResult(ctx, game);
        if (fight.outcome?.decidedBySeed) return toResult(ctx, game, fight);
        return fightTransition(fight);
      }
      case "FIGHT": {
        const fight = await currentFight(ctx, game);
        if (!fight) return afterResult(ctx, game);
        if (fight.outcome) return toResult(ctx, game, fight);
        // No outcome yet. The host skipping, or a sim that failed twice: the seed decides.
        if (reason === "host" || fight.sim.attempt >= 2 || fight.sim.status === "FAILED") {
          return toResult(ctx, game, await decideBySeed(ctx, fight));
        }
        await startSim(ctx, await abandonMatchup(ctx, fight));
        return fightTransition(fight);
      }
      case "RESULT":
        return afterResult(ctx, game);
      case "STANDINGS":
        return {
          phase: "UPGRADE",
          round: game.round + 1,
          seconds: timed(game, UPGRADE_SECONDS),
        };
      default:
        return "FINISH";
    }
  },
};
