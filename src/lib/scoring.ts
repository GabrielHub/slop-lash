/**
 * Comedy Heat scoring engine — pure functions, no Prisma.
 * Shared by server (game-logic.ts) and client (achievements.ts).
 */

import type { PlayerType } from "./types";

// --------------- Constants ---------------

const BASE_COEFF = 50;
const HUMAN_VOTE_MULT = 1.5;
const AI_VOTE_MULT = 1.0;
const HR_WIN_DELTA = 0.2;
const HR_LOSE_DELTA = -0.1;
const HR_FLOOR = 0.5;
const FLAWLESS_BONUS = 0.25;
const UPSET_PCT = 0.10;
const UPSET_CAP_PER_ROUND = 500;

export const FORFEIT_MARKER = "[forfeit]";

// --------------- Multipliers ---------------

export function roundMultiplier(n: number): number {
  return Math.pow(2, n - 1);
}

export function streakMultiplier(streak: number): number {
  if (streak <= 1) return 1.0;
  if (streak === 2) return 1.3;
  if (streak === 3) return 1.7;
  return 2.0;
}

// --------------- Types ---------------

export interface PlayerState {
  score: number;
  humorRating: number;
  winStreak: number;
}

export interface PromptResponse {
  id: string;
  playerId: string;
  text: string;
}

export interface PromptVoter {
  id: string;
  type: PlayerType;
  responseId: string | null;
}

export interface ScorePromptResult {
  points: Record<string, number>;
  hrUpdates: Record<string, number>;
  streakUpdates: Record<string, number>;
  /** Set of response IDs that triggered an upset bonus */
  upsetResponseIds: Set<string>;
}

// --------------- Helpers ---------------

function emptyResult(responses: PromptResponse[]): ScorePromptResult {
  const points: Record<string, number> = {};
  for (const r of responses) {
    points[r.id] = 0;
  }
  return { points, hrUpdates: {}, streakUpdates: {}, upsetResponseIds: new Set() };
}

function clampHR(value: number): number {
  return Math.max(HR_FLOOR, value);
}

function applyWinLoss(
  result: ScorePromptResult,
  winnerId: string,
  loserId: string,
  playerStates: ReadonlyMap<string, PlayerState>,
): void {
  const winnerState = playerStates.get(winnerId);
  const loserState = playerStates.get(loserId);

  result.hrUpdates[winnerId] = clampHR((winnerState?.humorRating ?? 1.0) + HR_WIN_DELTA);
  result.hrUpdates[loserId] = clampHR((loserState?.humorRating ?? 1.0) + HR_LOSE_DELTA);
  result.streakUpdates[winnerId] = (winnerState?.winStreak ?? 0) + 1;
  result.streakUpdates[loserId] = 0;
}

// --------------- Core ---------------

/**
 * Score a single prompt matchup.
 *
 * @param responses   The 2 responses for this prompt
 * @param voters      Voters who cast (or abstained) on this prompt, with their type and chosen responseId
 * @param playerStates  Current player states (score, HR, streak) -- read-only, caller updates after
 * @param roundNumber   Current round number (1-based)
 * @param eligibleVoterCount  Total eligible voters for this prompt (used for forfeit path)
 */
export function scorePrompt(
  responses: PromptResponse[],
  voters: PromptVoter[],
  playerStates: ReadonlyMap<string, PlayerState>,
  roundNumber: number,
  eligibleVoterCount: number,
): ScorePromptResult {
  const result = emptyResult(responses);
  const roundMult = roundMultiplier(roundNumber);

  if (responses.some((r) => r.text === FORFEIT_MARKER)) {
    return scoreForfeit(responses, playerStates, roundMult, eligibleVoterCount, result);
  }

  // Compute vote power per response
  const votePowerByResponse = new Map<string, number>(
    responses.map((r) => [r.id, 0]),
  );

  const castVoters = voters.filter((v) => v.responseId != null);

  for (const voter of castVoters) {
    const voterHR = playerStates.get(voter.id)?.humorRating ?? 1.0;
    const mult = voter.type === "HUMAN" ? HUMAN_VOTE_MULT : AI_VOTE_MULT;
    const power = voterHR * mult;
    const current = votePowerByResponse.get(voter.responseId!) ?? 0;
    votePowerByResponse.set(voter.responseId!, current + power);
  }

  // Rank by vote power
  const ranked = responses
    .map((r) => ({ response: r, votePower: votePowerByResponse.get(r.id) ?? 0 }))
    .sort((a, b) => b.votePower - a.votePower);

  const isTie = ranked.length >= 2 && ranked[0].votePower === ranked[1].votePower;
  const winner = !isTie ? ranked[0] : null;
  const loser = !isTie && ranked.length >= 2 ? ranked[ranked.length - 1] : null;

  const isUnanimous = winner != null && castVoters.length >= 1 &&
    castVoters.every((v) => v.responseId === winner.response.id);

  // Calculate points for each response
  for (const entry of ranked) {
    const state = playerStates.get(entry.response.playerId);
    const streakMult = entry === winner ? streakMultiplier(state?.winStreak ?? 0) : 1.0;

    let pts = Math.floor(entry.votePower * entry.votePower * BASE_COEFF * roundMult * streakMult);

    if (entry === winner && isUnanimous) {
      pts += Math.floor(pts * FLAWLESS_BONUS);
    }

    if (entry === winner && loser) {
      const winnerScore = state?.score ?? 0;
      const loserScore = playerStates.get(loser.response.playerId)?.score ?? 0;
      if (loserScore > winnerScore) {
        const upsetBonus = Math.min(Math.floor((loserScore - winnerScore) * UPSET_PCT), UPSET_CAP_PER_ROUND * roundMult);
        pts += upsetBonus;
        result.upsetResponseIds.add(entry.response.id);
      }
    }

    result.points[entry.response.id] = pts;
  }

  if (winner && loser) {
    applyWinLoss(result, winner.response.playerId, loser.response.playerId, playerStates);
  }

  return result;
}

function scoreForfeit(
  responses: PromptResponse[],
  playerStates: ReadonlyMap<string, PlayerState>,
  roundMult: number,
  eligibleVoterCount: number,
  result: ScorePromptResult,
): ScorePromptResult {
  const winner = responses.find((r) => r.text !== FORFEIT_MARKER);
  if (!winner) return result;

  const loser = responses.find((r) => r.text === FORFEIT_MARKER);

  // Synthetic vote power: all eligible voters at neutral HR (1.0) x human mult
  const syntheticVotePower = eligibleVoterCount * HUMAN_VOTE_MULT;
  const state = playerStates.get(winner.playerId);
  const streakMult = streakMultiplier(state?.winStreak ?? 0);

  let pts = Math.floor(syntheticVotePower * syntheticVotePower * BASE_COEFF * roundMult * streakMult);
  pts += Math.floor(pts * FLAWLESS_BONUS);

  result.points[winner.id] = pts;

  if (loser) {
    applyWinLoss(result, winner.playerId, loser.playerId, playerStates);
  } else {
    // Only winner present (no loser record) -- update winner only
    result.hrUpdates[winner.playerId] = clampHR((state?.humorRating ?? 1.0) + HR_WIN_DELTA);
    result.streakUpdates[winner.playerId] = (state?.winStreak ?? 0) + 1;
  }

  return result;
}
