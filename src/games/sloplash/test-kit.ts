import { FORFEIT_MARKER } from "@/games/core/constants";
import { fixtureId } from "@/dev/fixtures/base";
import type { SloplashPrompt } from "../../../convex/sloplash/view";
import { matchupKind } from "./scoring";

/** One answer in a matchup, written by the player with this fixture key. No text is a forfeit. */
export type AnswerSpec = {
  by: string;
  text?: string;
  points?: number;
  /** [emoji, reacting player's key] */
  reactions?: [string, string][];
};

/** [voter's key, picked answer index or null to abstain, timed out]. */
export type VoteSpec = [voter: string, pick: number | null, timedOut?: boolean];

/** The fixture key a prompt was built from (its id is `prompts_<key>`). */
export const promptKey = (prompt: { id: string }) => prompt.id.replace(/^prompts_/, "");

/** A reaction row's id, stable per prompt, answer and position. */
export const reactionId = (key: string, answerIndex: number, n: number) =>
  fixtureId("reactions", `${key}-${answerIndex}-${n}`);

/**
 * Builds a SlopLash matchup as the view sends it once revealed. Its `kind`
 * follows from how many answers are present; `order` is filled in later (see
 * `ordered` in the fixtures). Unrevealed matchups hide authors, choices,
 * points and reactions.
 */
export function sloplashPrompt(
  key: string,
  text: string,
  answers: AnswerSpec[],
  votes: VoteSpec[] = [],
  { revealed = true }: { revealed?: boolean } = {},
): SloplashPrompt {
  const answerId = (index: number) => fixtureId("responses", `${key}-${index}`);
  const present = answers.filter((answer) => answer.text !== undefined).length;
  return {
    id: fixtureId("prompts", key),
    text,
    assigneeIds: answers.map((answer) => fixtureId("players", answer.by)),
    kind: matchupKind(present),
    order: null,
    revealed,
    answers: answers.map((answer, index) => ({
      id: answerId(index),
      text: answer.text ?? FORFEIT_MARKER,
      forfeited: answer.text === undefined,
      playerId: revealed ? fixtureId("players", answer.by) : null,
      pointsEarned: revealed ? (answer.points ?? 0) : 0,
      reactions: revealed
        ? (answer.reactions ?? []).map(([emoji, by]) => ({
            emoji,
            playerId: fixtureId("players", by),
          }))
        : [],
    })),
    votes: votes.map(([voter, pick, timedOut = false]) => ({
      voterId: fixtureId("players", voter),
      responseId: revealed && pick !== null ? answerId(pick) : null,
      timedOut,
    })),
    liveReactions: [],
  };
}
