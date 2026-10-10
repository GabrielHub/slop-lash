import type { SloplashPrompt } from "../../../convex/sloplash/view";
import { scoreMatchup, type MatchupScore, type PlayerType } from "./scoring";

/**
 * The stamp a revealed matchup earns. SLOPPED is a unanimous AI sweep of a
 * human; FLAWLESS any other unanimous win (an AI-vs-AI sweep included).
 */
export type StampKind = "slopped" | "flawless" | "tie" | "noVotes";

export type MatchupOutcomeView = {
  score: MatchupScore;
  stamp: StampKind | null;
  winnerAnswerId: string | null;
  /** The winning answer (a contested win or a walkover) was written by an AI. */
  aiWon: boolean;
};

/**
 * How a revealed matchup went, from the view's answers and ballots through
 * the same `scoreMatchup` the server stores points with, so screens and the
 * scoreboard can't drift. Only meaningful once `prompt.revealed`.
 */
export function matchupOutcome(
  prompt: SloplashPrompt,
  round: number,
  typeOf: (playerId: string) => PlayerType | undefined,
): MatchupOutcomeView {
  const score = scoreMatchup(
    prompt.answers.map((answer) => ({ id: answer.id, forfeited: answer.forfeited })),
    prompt.votes.map((vote) => vote.responseId),
    round,
  );
  const winner = prompt.answers.find((answer) => answer.id === score.winnerId);
  const loser =
    score.outcome === "win" ? prompt.answers.find((answer) => answer.id !== winner?.id) : undefined;
  const authorType = (playerId: string | null | undefined) =>
    playerId ? typeOf(playerId) : undefined;
  const aiWon = authorType(winner?.playerId) === "AI";

  let stamp: StampKind | null = null;
  if (score.outcome === "win" && score.unanimous) {
    stamp = aiWon && authorType(loser?.playerId) === "HUMAN" ? "slopped" : "flawless";
  } else if (score.outcome === "tie") stamp = "tie";
  else if (score.outcome === "noVotes") stamp = "noVotes";

  return { score, stamp, winnerAnswerId: score.winnerId, aiWon };
}
