import { FORFEIT_MARKER } from "@/games/core/constants";
import { fixtureId } from "@/dev/fixtures/base";
import type { SloplashPrompt } from "../../../convex/sloplash/view";

/** One answer in a matchup, written by the player with this fixture key. */
export type AnswerSpec = {
  by: string;
  text?: string;
  points?: number;
  /** Lost because every human passed (0 or negative). */
  penalty?: number;
  /** [emoji, reacting player's key] */
  reactions?: [string, string][];
};

/** [voter's key, picked answer index or null to pass, timed out]. */
export type VoteSpec = [voter: string, pick: number | null, timedOut?: boolean];

/**
 * Builds a SlopLash matchup as the view sends it. An answer without text is a
 * forfeit. Unrevealed matchups hide authors, choices, and points.
 */
export function sloplashPrompt(
  key: string,
  text: string,
  answers: AnswerSpec[],
  votes: VoteSpec[] = [],
  { revealed = true }: { revealed?: boolean } = {},
): SloplashPrompt {
  const answerId = (index: number) => fixtureId("responses", `${key}-${index}`);
  return {
    id: fixtureId("prompts", key),
    text,
    assigneeIds: answers.map((answer) => fixtureId("players", answer.by)),
    votable: answers.length >= 2 && answers.every((answer) => answer.text !== undefined),
    revealed,
    answers: answers.map((answer, index) => ({
      id: answerId(index),
      text: answer.text ?? FORFEIT_MARKER,
      forfeited: answer.text === undefined,
      playerId: revealed ? fixtureId("players", answer.by) : null,
      pointsEarned: revealed ? (answer.points ?? 0) : 0,
      penalty: revealed ? (answer.penalty ?? 0) : 0,
      reactions: (answer.reactions ?? []).map(([emoji, by]) => ({
        emoji,
        playerId: fixtureId("players", by),
      })),
    })),
    votes: votes.map(([voter, pick, timedOut = false]) => ({
      voterId: fixtureId("players", voter),
      responseId: revealed && pick !== null ? answerId(pick) : null,
      timedOut,
      penalty: 0,
    })),
  };
}
