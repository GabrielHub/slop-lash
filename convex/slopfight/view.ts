import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { resolveModifiers } from "../../src/games/slopfight/modifiers";
import { PARTS_MAX } from "../../src/games/slopfight/constants";
import type { Champion } from "../../src/games/slopfight/sheet";
import type { BodyPlan } from "../../src/games/slopfight/vocab";
import { podium, seedOrder, TOTAL_FIGHTS } from "../../src/games/slopfight/tournament";
import {
  championOf,
  FIGHT_PHASES,
  isUpgradeKind,
  loadFighters,
  loadFights,
  loadGameStrokeRows,
  loadState,
  type Fight,
  type Fighter,
} from "./data";
import type { StoredOutcome } from "./tables";

// What one viewer sees of a SlopFight game. Kept small: no strokes and no
// streamed parts while the game runs (stage.ts serves those to the stage
// only). The seed and the outcome of a fight reach clients only once its
// FIGHT starts, after bets close. A rejection reaches only its owner.

const MAX_BETS = 128;

/** Phases where the old sheet sits beside the upgrade on the next pedestal. */
const UPGRADE_PHASES = new Set(["UPGRADE", "FOUNDRY"]);

/** Parts a forged champion of each body plan typically has (medians of real forges). */
export const TYPICAL_PARTS: Readonly<Record<BodyPlan, number>> = {
  BIPED: 8,
  QUADRUPED: 9,
  MULTIPED: 11,
  HOPPER: 4,
  SLITHER: 6,
  FLIER: 6,
};
/** Before the body plan has streamed. */
const DEFAULT_PART_TARGET = 8;
/** Parts an upgrade typically adds to the sheet it rebuilds. */
const UPGRADE_EXTRA_PARTS = 2;

/**
 * The phone's soft target for a forge's part count: the old sheet plus a
 * little for an upgrade, else typical for the streamed body plan. Always past
 * what has arrived, so progress keeps moving until the champion is READY.
 */
export function forgePartTarget(
  streamed: number,
  plan: BodyPlan | null,
  previousParts: number | null,
): number {
  const base = previousParts !== null
    ? previousParts + UPGRADE_EXTRA_PARTS
    : plan
      ? TYPICAL_PARTS[plan]
      : DEFAULT_PART_TARGET;
  return Math.min(PARTS_MAX, Math.max(base, streamed + 1));
}

/** Initial progress only; the owner's narrow query reads the live stream. */
function forgeParts(fighter: Fighter) {
  const previous = isUpgradeKind(fighter.forge?.kind) ? championOf(fighter) : null;
  return { streamed: 0, target: forgePartTarget(0, null, previous?.parts.length ?? null) };
}

function fighterView(fighter: Fighter, game: Doc<"games">, viewerId: Id<"players"> | null) {
  const mine = viewerId !== null && fighter.ownerId === viewerId;
  const showPrevious = game.round > 1 && UPGRADE_PHASES.has(game.phase);
  return {
    id: fighter._id,
    slot: fighter.slot,
    /** Null for a house champion. */
    ownerId: fighter.ownerId,
    status: fighter.status,
    inputKind: fighter.inputKind,
    /** Last keystroke (server time), for the typing shimmer. */
    typingAt: fighter.typingAt ?? null,
    /** The current sheet; during an upgrade forge it is still the old one. */
    champion: championOf(fighter),
    previous: showPrevious ? (fighter.previous ?? null) : null,
    /** What the description said, once it became a champion. */
    text: fighter.status === "READY" ? fighter.text : null,
    /** The latest forge: what it is for, the version it makes, when it started. */
    forge: fighter.forge ?? null,
    /** Why the last forge failed on both models; the stage says so honestly. */
    failure: fighter.status === "FAILED" ? (fighter.failure ?? "failed") : null,
    /**
     * Initial progress for the owner; play.myForgeProgress reads live counts
     * separately, so stream writes never invalidate this room query.
     */
    forgeParts: mine && fighter.status === "FORGING" ? forgeParts(fighter) : null,
    rejection: mine && fighter.status === "REJECTED" ? (fighter.rejection ?? null) : null,
    addition: mine ? (fighter.addition ?? null) : null,
    /** 0 at Build, the round number after an upgrade. */
    version: fighter.version,
    record: fighter.record,
  };
}

/** Each fighter's champion, for the modifiers on the face-off cards. */
function sheetsById(fighters: readonly Fighter[]) {
  return new Map(fighters.map((fighter) => [fighter._id, championOf(fighter)]));
}

/** The notes as they actually apply (capped), for the face-off cards. */
function appliedNotes(fight: Fight, sheets: Map<Id<"slopFightFighters">, Champion | null>) {
  const a = fight.sheets?.A ?? sheets.get(fight.a);
  const b = fight.sheets?.B ?? sheets.get(fight.b);
  if (!a || !b || !fight.notes || fight.notes.length === 0) return [];
  return resolveModifiers(a, b, fight.arena, fight.notes).notes.map((applied) => ({
    side: applied.note.side,
    modifies: applied.note.modifies,
    reason: applied.note.reason,
    value: applied.value,
    favors: applied.favors,
    capped: applied.capped,
    dropped: applied.dropped,
  }));
}

function fightView(
  fight: Fight,
  game: Doc<"games">,
  bets: readonly Doc<"slopFightBets">[],
  sheets: Map<Id<"slopFightFighters">, Champion | null>,
  viewerId: Id<"players"> | null,
) {
  const current =
    game.status === "PLAYING" &&
    FIGHT_PHASES.includes(game.phase) &&
    game.round === fight.round &&
    game.step === fight.step;
  // Bets close when FIGHT starts; only then (or once scored) do the seed and outcome go out.
  const revealed =
    game.status === "FINISHED" ||
    fight.scoredAt !== undefined ||
    (current && (game.phase === "FIGHT" || game.phase === "RESULT"));
  const outcome: StoredOutcome | null = revealed ? (fight.outcome ?? null) : null;
  return {
    id: fight._id,
    round: fight.round,
    step: fight.step,
    a: fight.a,
    b: fight.b,
    arena: fight.arena,
    limitMs: fight.limitMs,
    isFinal: fight.isFinal,
    isThirdPlace: fight.isThirdPlace,
    /** PENDING while the matchup call runs; FAILED means no notes. */
    matchup: fight.matchup,
    notes: fight.notes ?? [],
    applied: appliedNotes(fight, sheets),
    walkOn: fight.walkOn ?? null,
    /** Final snapshot; live crowd pulses come from stage.hype without invalidating this view. */
    hype: fight.hype,
    /** Bets are public: who backed which side (avatars fly to their pick). */
    bets: {
      A: bets.filter((bet) => bet.side === "A").map((bet) => bet.playerId),
      B: bets.filter((bet) => bet.side === "B").map((bet) => bet.playerId),
    },
    /** This viewer's bet. */
    mine: bets.find((bet) => bet.playerId === viewerId)?.side ?? null,
    revealed,
    seed: revealed ? fight.seed : null,
    /** Server time of the sim's t = 0, from FIGHT on. */
    startsAt: revealed ? (fight.startsAt ?? null) : null,
    outcome,
    /** The sim failed twice and the seed picked the winner. */
    decidedBySeed: outcome?.decidedBySeed === true,
    awards: revealed ? (fight.awards ?? null) : null,
    /**
     * Both champions as this fight's sim ran them, for the recap's re-sim
     * (with seed, arena, notes and limitMs). Only once the game is over: while
     * it runs, the fighters' current sheets are the ones in play.
     */
    sheets: game.status === "FINISHED" && fight.sheets ? fight.sheets : null,
    recapLine: revealed ? (fight.recapLine ?? null) : null,
  };
}

async function loadDoodles(ctx: QueryCtx, fighters: readonly Fighter[]) {
  const rows = await loadGameStrokeRows(ctx, fighters);
  return rows.map((row) => ({
    fighterId: row.fighterId,
    layer: row.layer,
    seq: row.seq,
    strokes: row.strokes,
  }));
}

export async function slopfightView(
  ctx: QueryCtx,
  game: Doc<"games">,
  viewerId: Id<"players"> | null,
) {
  const finished = game.status === "FINISHED";
  const [state, fighters, fights, bets] = await Promise.all([
    loadState(ctx, game._id),
    loadFighters(ctx, game._id),
    loadFights(ctx, game._id),
    ctx.db
      .query("slopFightBets")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(MAX_BETS),
  ]);
  // The recap re-draws every doodle; while playing the stage reads them from stage.strokes.
  const doodles = finished ? await loadDoodles(ctx, fighters) : null;
  const sheets = sheetsById(fighters);
  const fightViews = fights.map((fight) =>
    fightView(
      fight,
      game,
      bets.filter((bet) => bet.fightId === fight._id),
      sheets,
      viewerId,
    ),
  );
  const current = fightViews.find(
    (fight) =>
      game.status === "PLAYING" &&
      FIGHT_PHASES.includes(game.phase) &&
      fight.round === game.round &&
      fight.step === game.step,
  );
  const standings = state
    ? seedOrder(
        fighters.map((fighter) => ({
          id: fighter._id,
          slot: fighter.slot,
          record: fighter.record,
        })),
        state.seed,
      ).map((entry, index) => ({ fighterId: entry.id, rank: index + 1, record: entry.record }))
    : [];
  const third = fights.find((fight) => fight.isThirdPlace);
  const final = fights.find((fight) => fight.isFinal);
  const placed =
    third?.scoredAt !== undefined && final?.scoredAt !== undefined
      ? podium(
          { a: third.a, b: third.b, winner: third.outcome?.winner ?? null },
          { a: final.a, b: final.b, winner: final.outcome?.winner ?? null },
        )
      : null;

  return {
    kind: "SLOPFIGHT" as const,
    /** Tonight's arenas in play order; the Final round is the third. Empty in the lobby. */
    arenas: state?.arenas ?? [],
    round: game.round,
    totalFights: state?.totalFights ?? TOTAL_FIGHTS,
    myFighterId:
      fighters.find((fighter) => viewerId !== null && fighter.ownerId === viewerId)?._id ?? null,
    fighters: fighters.map((fighter) => fighterView(fighter, game, viewerId)),
    /** Every fight created so far (a round's fights appear at the standings before it). */
    fights: fightViews,
    currentFightId: current?.id ?? null,
    /** Fighters best first by record (wins, then health left), as the Final is seeded. */
    standings,
    /** Round 3's seeding once the qualifiers are over, best first. */
    seeding: state?.seeding ?? null,
    /** Final winner, runner-up, third, fourth, once round 3 is fought. */
    podium: placed,
    /** A forge failed on both models and the Foundry waits for the host's retry. */
    foundryParked:
      game.status === "PLAYING" && game.phase === "FOUNDRY" && game.phaseDeadline === undefined,
    /** Every stroke batch, for the recap only (null while the game runs). */
    doodles,
  };
}

export type SlopfightView = Awaited<ReturnType<typeof slopfightView>>;
