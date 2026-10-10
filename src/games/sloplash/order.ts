import { mixedHash } from "../../lib/hash";

/**
 * The order a matchup's answers are shown in: a stable shuffle per prompt.
 * Storage keeps creation order, and AI answers are usually written first, so
 * showing creation order would put the bot on the left most of the time.
 */
export function presentationOrder<T extends { _id: string }>(promptId: string, answers: readonly T[]): T[] {
  return answers
    .map((answer) => ({ answer, rank: mixedHash(`${promptId}:${answer._id}`) }))
    .sort((a, b) => a.rank - b.rank || (a.answer._id < b.answer._id ? -1 : 1))
    .map(({ answer }) => answer);
}
