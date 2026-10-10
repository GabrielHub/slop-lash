// SlopFight points (spec section 3, "Scoring"): flat and legible. The owner of
// the winning champion scores the win (doubled in the Final) plus a bonus for
// a KO or a ring-out; every correct bet scores (doubled in the Final). House
// champions have no owner, so they score nothing and take nothing. Hype is
// worth nothing. Pure; the Convex mode applies the awards once per fight.

import {
  BET_POINTS,
  FINAL_BET_POINTS,
  FINAL_WIN_POINTS,
  FINISH_BONUS_POINTS,
  WIN_POINTS,
} from "./constants";

export type FightSide = "A" | "B";
export type FightMethod = "KO" | "RINGOUT" | "DECISION" | "SUDDEN_DEATH";

export type AwardReason = "WIN" | "FINISH" | "BET";

export interface Award<PlayerId extends string = string> {
  playerId: PlayerId;
  reason: AwardReason;
  points: number;
}

export interface FightScoreInput<PlayerId extends string = string> {
  isFinal: boolean;
  winner: FightSide;
  method: FightMethod;
  /** Each side's owner, or null for a house champion. */
  owners: Record<FightSide, PlayerId | null>;
  bets: readonly { playerId: PlayerId; side: FightSide }[];
}

/** Whether a method earns the owner's finish bonus. */
export function isFinish(method: FightMethod): boolean {
  return method === "KO" || method === "RINGOUT";
}

export function winPoints(isFinal: boolean): number {
  return isFinal ? FINAL_WIN_POINTS : WIN_POINTS;
}

export function betPoints(isFinal: boolean): number {
  return isFinal ? FINAL_BET_POINTS : BET_POINTS;
}

/** Every award one fight pays, in a stable order (win, finish, then bets). */
export function scoreFight<PlayerId extends string>(
  input: FightScoreInput<PlayerId>,
): Award<PlayerId>[] {
  const awards: Award<PlayerId>[] = [];
  const owner = input.owners[input.winner];
  if (owner !== null) {
    awards.push({ playerId: owner, reason: "WIN", points: winPoints(input.isFinal) });
    if (isFinish(input.method)) {
      awards.push({ playerId: owner, reason: "FINISH", points: FINISH_BONUS_POINTS });
    }
  }
  const seen = new Set<PlayerId>();
  for (const bet of input.bets) {
    // One bet per player; a duplicate row never pays twice.
    if (seen.has(bet.playerId)) continue;
    seen.add(bet.playerId);
    if (bet.side === input.winner) {
      awards.push({ playerId: bet.playerId, reason: "BET", points: betPoints(input.isFinal) });
    }
  }
  return awards;
}

/** Awards summed per player. */
export function totalsByPlayer<PlayerId extends string>(
  awards: readonly Award<PlayerId>[],
): Map<PlayerId, number> {
  const totals = new Map<PlayerId, number>();
  for (const award of awards) {
    totals.set(award.playerId, (totals.get(award.playerId) ?? 0) + award.points);
  }
  return totals;
}
