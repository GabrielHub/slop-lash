// The SlopFight bracket: four champions, three arenas, six fights, whatever
// the human count. Pure and headless; the Convex mode stores what it returns.
//
// Slots: humans take slots 0.. in join order, the house fills the rest.
// Rounds 1 and 2 are qualifiers with fixed pairings by human count (spec
// section 3, "Pairings by human count"): no human meets the same opponent twice
// before the Final. Round 3 is the third-place fight (step 0) and then the
// Final (step 1), seeded by fight record, never by player points.

import { mixedHash } from "../../lib/hash";
import type { ArenaId } from "./arenas";
import { CHAMPIONS, FIGHT_LIMIT_MS, HOUSE_FIGHT_LIMIT_MS, MAX_PLAYERS, MIN_PLAYERS } from "./constants";

/** Rounds in a game: two qualifiers and the Final round. */
export const ROUNDS = 3;
/** Fights per round. */
export const FIGHTS_PER_ROUND = 2;
export const TOTAL_FIGHTS = ROUNDS * FIGHTS_PER_ROUND;

/** A fight between two slots; `a` takes side A (spawns at -x). */
export interface SlotPairing {
  a: number;
  b: number;
}

export interface FighterSeat {
  slot: number;
  /** Index into the humans in join order, or null for a house champion. */
  human: number | null;
}

/** The four seats: humans in join order first, then the house. */
export function fighterSeats(humanCount: number): FighterSeat[] {
  assertHumanCount(humanCount);
  return Array.from({ length: CHAMPIONS }, (_, slot) => ({
    slot,
    human: slot < humanCount ? slot : null,
  }));
}

/** How many house champions fill the bracket. */
export function houseCount(humanCount: number): number {
  assertHumanCount(humanCount);
  return CHAMPIONS - humanCount;
}

/**
 * Rounds 1 and 2 in slot numbers, fights in play order. A-D are humans
 * (slots 0-3 in join order), X and Y the house:
 *
 * - 4 humans: A-B, C-D, then A-C, B-D.
 * - 3 humans: A-B, C-X, then A-C, B-X (the house champion fights twice).
 * - 2 humans: A-X, B-Y, then X-Y, A-B. The human fight is round 2's headline,
 *   so it plays last; the short house-versus-house fight opens the round.
 */
export function qualifierPairings(humanCount: number): [SlotPairing[], SlotPairing[]] {
  assertHumanCount(humanCount);
  const [A, B, C, D] = [0, 1, 2, 3];
  if (humanCount === 4) {
    return [
      [pair(A, B), pair(C, D)],
      [pair(A, C), pair(B, D)],
    ];
  }
  if (humanCount === 3) {
    const X = 3;
    return [
      [pair(A, B), pair(C, X)],
      [pair(A, C), pair(B, X)],
    ];
  }
  const [X, Y] = [2, 3];
  return [
    [pair(A, X), pair(B, Y)],
    [pair(X, Y), pair(A, B)],
  ];
}

const pair = (a: number, b: number): SlotPairing => ({ a, b });

function assertHumanCount(humanCount: number): void {
  if (!Number.isInteger(humanCount) || humanCount < MIN_PLAYERS || humanCount > MAX_PLAYERS) {
    throw new Error(`SlopFight needs ${MIN_PLAYERS}-${MAX_PLAYERS} humans, got ${humanCount}`);
  }
}

/** The arena a round is fought in: the seeded order, the Final round third. */
export function roundArena(arenas: readonly ArenaId[], round: number): ArenaId {
  const arena = arenas[round - 1];
  if (!arena) throw new Error(`No arena for round ${round}`);
  return arena;
}

/** The sim's time limit: house-versus-house fights are bets only and shorter. */
export function fightLimitMs(aIsHouse: boolean, bIsHouse: boolean): number {
  return aIsHouse && bIsHouse ? HOUSE_FIGHT_LIMIT_MS : FIGHT_LIMIT_MS;
}

/** Index of a fight across the game: 0-5. */
export function fightIndex(round: number, step: number): number {
  return (round - 1) * FIGHTS_PER_ROUND + step;
}

/** A fight's uint32 sim seed, derived from the game seed and the fight index. */
export function fightSeed(gameSeed: number, round: number, step: number): number {
  return mixedHash(`slopfight-fight:${gameSeed}:${fightIndex(round, step)}`);
}

/** A fresh uint32 game seed from anything unique to the game. */
export function gameSeedFrom(text: string): number {
  return mixedHash(`slopfight-game:${text}`);
}

// ---------------------------------------------------------------------------
// Records and seeding
// ---------------------------------------------------------------------------

export interface FightRecord {
  wins: number;
  losses: number;
  /** Total health remaining at the end of each fight fought. */
  healthLeft: number;
}

export const EMPTY_RECORD: FightRecord = { wins: 0, losses: 0, healthLeft: 0 };

/** A record after one more fight. */
export function addResult(record: FightRecord, won: boolean, healthLeft: number): FightRecord {
  return {
    wins: record.wins + (won ? 1 : 0),
    losses: record.losses + (won ? 0 : 1),
    healthLeft: record.healthLeft + Math.max(0, Math.round(healthLeft)),
  };
}

export interface SeedEntry<Id> {
  id: Id;
  slot: number;
  record: FightRecord;
}

/**
 * Fighters best first: wins, then total health remaining, then a fixed
 * tie-break drawn from the game seed (never slot order, so slot 0 has no edge).
 */
export function seedOrder<Id>(entries: readonly SeedEntry<Id>[], gameSeed: number): SeedEntry<Id>[] {
  const tieBreak = (slot: number) => mixedHash(`slopfight-seed:${gameSeed}:${slot}`);
  return [...entries].sort(
    (left, right) =>
      right.record.wins - left.record.wins ||
      right.record.healthLeft - left.record.healthLeft ||
      tieBreak(left.slot) - tieBreak(right.slot) ||
      left.slot - right.slot,
  );
}

/**
 * Round 3 from the seeding after the qualifiers: the third-place fight (seeds
 * 3 and 4) at step 0, then the Final (seeds 1 and 2) at step 1. The higher
 * seed takes side A.
 */
export function finalRound<Id>(
  entries: readonly SeedEntry<Id>[],
  gameSeed: number,
): { seeding: Id[]; thirdPlace: { a: Id; b: Id }; final: { a: Id; b: Id } } {
  if (entries.length !== CHAMPIONS) throw new Error(`Seeding needs ${CHAMPIONS} fighters`);
  const seeding = seedOrder(entries, gameSeed).map((entry) => entry.id);
  const [first, second, third, fourth] = seeding as [Id, Id, Id, Id];
  return { seeding, thirdPlace: { a: third, b: fourth }, final: { a: first, b: second } };
}

export interface DecidedFight<Id> {
  a: Id;
  b: Id;
  winner: "A" | "B" | null;
}

/**
 * The podium once round 3 is fought: Final winner, Final loser, third-place
 * winner, third-place loser. Null until both fights have a winner.
 */
export function podium<Id>(thirdPlace: DecidedFight<Id>, final: DecidedFight<Id>): Id[] | null {
  if (!thirdPlace.winner || !final.winner) return null;
  const split = (fight: DecidedFight<Id>) =>
    fight.winner === "A" ? [fight.a, fight.b] : [fight.b, fight.a];
  return [...split(final), ...split(thirdPlace)];
}
