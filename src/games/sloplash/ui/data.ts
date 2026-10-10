import type { ModeView, RoomPlayer } from "@/room/context";
import { rankBy, type Ranked } from "@/games/core/player-rankings";
import { formatPoints } from "@/lib/format";

/** Pure helpers shared by the SlopLash stage and phone screens. */

export type SloplashMode = ModeView<"SLOPLASH">;
export type SlRound = NonNullable<SloplashMode["round"]>;
export type SlPrompt = SlRound["prompts"][number];
export type SlAnswer = SlPrompt["answers"][number];

/** "+3,600". Zero reads "+0". */
export const plus = (n: number) => `+${formatPoints(n)}`;

/** "1 vote" / "3 votes". */
export const votesLabel = (n: number) => `${formatPoints(n)} ${n === 1 ? "vote" : "votes"}`;

/** The matchup on screen during VOTING and REVEAL. */
export function currentPrompt(
  mode: Pick<SloplashMode, "round" | "currentPromptId">,
): SlPrompt | undefined {
  if (!mode.currentPromptId) return undefined;
  return mode.round?.prompts.find((prompt) => prompt.id === mode.currentPromptId);
}

/** One-sided matchups go first each round, so the first vote is this step. */
export function walkoverCount(mode: Pick<SloplashMode, "round">): number {
  return mode.round?.prompts.filter((prompt) => prompt.kind === "walkover").length ?? 0;
}

/** Looks up whether a seat is HUMAN or AI; unknown ids read as HUMAN. */
export function typeOfPlayer(players: readonly RoomPlayer[]) {
  const types = new Map(players.map((player) => [player.id as string, player.type]));
  return (playerId: string): "HUMAN" | "AI" => types.get(playerId) ?? "HUMAN";
}

export interface Podium {
  ranked: Ranked<RoomPlayer>[];
  /** Positions 1-3 (by score, ties in seat order). */
  positions: Ranked<RoomPlayer>[];
  /** Exactly one rank-1 player, and an AI. */
  soleAiWinner: boolean;
  /** Everyone at rank 1. */
  winners: RoomPlayer[];
}

export function podiumOf(players: readonly RoomPlayer[]): Podium {
  const ranked = rankBy(players, (player) => player.score);
  const winners = ranked.filter((entry) => entry.rank === 1).map((entry) => entry.player);
  return {
    ranked,
    positions: ranked.slice(0, 3),
    soleAiWinner: winners.length === 1 && winners[0]!.type === "AI",
    winners,
  };
}

/** The final headline once first place is known. */
export function winnerLine(podium: Podium): string {
  const { winners, soleAiWinner } = podium;
  if (soleAiWinner) return "The machine wins.";
  if (winners.length === 1) return `${winners[0]!.name} wins!`;
  if (winners.length === 2) return `${winners[0]!.name} and ${winners[1]!.name} tie!`;
  return "It's a tie!";
}

/** What each player earned in this round's revealed matchups. */
export function roundGains(round: SlRound | null | undefined): Map<string, number> {
  const gains = new Map<string, number>();
  for (const prompt of round?.prompts ?? []) {
    for (const answer of prompt.answers) {
      if (!answer.playerId) continue;
      gains.set(answer.playerId, (gains.get(answer.playerId) ?? 0) + answer.pointsEarned);
    }
  }
  return gains;
}

/**
 * This round's gains with the standings before and after them. "Before"
 * subtracts the round's gains from each total.
 */
export function roundStandings<T extends { id: string; score: number }>(
  players: readonly T[],
  round: SlRound | null | undefined,
) {
  const gains = roundGains(round);
  const gainOf = (player: T) => gains.get(player.id) ?? 0;
  return {
    gainOf,
    before: rankBy(players, (player) => player.score - gainOf(player)),
    after: rankBy(players, (player) => player.score),
  };
}

/*
 * Matchup type sizes: couch-size on the artboard, one Tailwind step smaller
 * in a narrow column.
 */

/** Shorter prompts read bigger. */
export const promptSize = (text: string) =>
  text.length <= 60 ? "text-4xl @4xl:text-5xl" : "text-3xl @4xl:text-4xl";

/** One size for both answers of a matchup, chosen by the longer one. */
export function answerSize(answers: readonly { text: string }[]): string {
  const longest = Math.max(0, ...answers.map((answer) => answer.text.length));
  if (longest <= 24) return "text-5xl @4xl:text-6xl";
  if (longest <= 52) return "text-4xl @4xl:text-5xl";
  if (longest <= 68) return "text-3xl @4xl:text-4xl";
  return "text-2xl @4xl:text-3xl";
}
