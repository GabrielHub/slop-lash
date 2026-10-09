import type {
  SloplashAnswer,
  SloplashPrompt,
  SloplashRound,
  SloplashVote,
} from "../../../convex/sloplash/view";
import type { PlayerType } from "./scoring";

export type AnswerResult = {
  answer: SloplashAnswer;
  votes: SloplashVote[];
  pct: number;
  points: number;
  isWinner: boolean;
};

export type MatchupResult = {
  answers: AnswerResult[];
  castVotes: number;
  isTie: boolean;
  isUnanimous: boolean;
  aiBeatsHuman: boolean;
  /** Every human voter passed or ran out of time, so the pass penalty applied. */
  allPassed: boolean;
  passed: SloplashVote[];
  timedOut: SloplashVote[];
};

/**
 * How a revealed matchup went, from the points the server scored for it. The
 * winner is whoever earned more.
 */
export function matchupResult(
  prompt: SloplashPrompt,
  typeOf: (playerId: string) => PlayerType | undefined,
): MatchupResult {
  const cast = prompt.votes.filter((vote) => vote.responseId !== null);
  const scored = prompt.answers.map((answer) => ({
    answer,
    points: answer.pointsEarned + answer.penalty,
  }));
  const best = Math.max(...scored.map((entry) => entry.points));
  const leaders = scored.filter((entry) => entry.points === best);
  const winner = leaders.length === 1 && scored.length > 1 ? leaders[0]!.answer : null;
  const loser = winner ? prompt.answers.find((answer) => answer.id !== winner.id) : undefined;
  const humanVotes = prompt.votes.filter((vote) => typeOf(vote.voterId) === "HUMAN");

  return {
    answers: scored.map(({ answer, points }) => {
      const votes = cast.filter((vote) => vote.responseId === answer.id);
      return {
        answer,
        votes,
        pct: cast.length > 0 ? Math.round((votes.length / cast.length) * 100) : 0,
        points,
        isWinner: answer.id === winner?.id,
      };
    }),
    castVotes: cast.length,
    isTie: winner === null && cast.length > 0,
    isUnanimous:
      winner !== null && cast.length >= 2 && cast.every((vote) => vote.responseId === winner.id),
    aiBeatsHuman:
      winner !== null &&
      typeOf(winner.playerId ?? "") === "AI" &&
      typeOf(loser?.playerId ?? "") === "HUMAN",
    allPassed: humanVotes.length > 0 && humanVotes.every((vote) => vote.responseId === null),
    passed: prompt.votes.filter((vote) => vote.responseId === null && !vote.timedOut),
    timedOut: prompt.votes.filter((vote) => vote.timedOut),
  };
}

export type BestAnswer = {
  promptText: string;
  text: string;
  playerId: string;
  pct: number;
  round: number;
};

/** The game's most decisive winning answers, best first. */
export function bestAnswers(rounds: readonly SloplashRound[], limit = 5): BestAnswer[] {
  const best: BestAnswer[] = [];
  for (const round of rounds) {
    for (const prompt of round.prompts) {
      const cast = prompt.votes.filter((vote) => vote.responseId !== null);
      if (!prompt.votable || cast.length === 0) continue;
      const tallies = prompt.answers.map((answer) => ({
        answer,
        count: cast.filter((vote) => vote.responseId === answer.id).length,
      }));
      const top = tallies.reduce((leader, entry) => (entry.count > leader.count ? entry : leader));
      if (!top.answer.playerId) continue;
      best.push({
        promptText: prompt.text,
        text: top.answer.text,
        playerId: top.answer.playerId,
        pct: Math.round((top.count / cast.length) * 100),
        round: round.number,
      });
    }
  }
  return best.toSorted((left, right) => right.pct - left.pct).slice(0, limit);
}
