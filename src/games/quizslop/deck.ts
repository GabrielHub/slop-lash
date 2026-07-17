import { FINAL_SLATE_SIZE } from "./game-constants";
import type { QuizslopCategory } from "./types";

/**
 * Deterministic deck construction. Randomness enters exactly once: the server
 * assigns persisted random ranks at the atomic start transition (and persisted
 * tie-break ranks for the final slate). Every function here is a pure fold
 * over those persisted ranks so a retried transition or a test replay yields
 * the identical deck. Ties always break by stable topic ID.
 */

export interface RankedTopic<TopicId extends string = string> {
  topicId: TopicId;
  category: QuizslopCategory;
  rank: number;
}

function byRankThenId<TopicId extends string>(
  left: RankedTopic<TopicId>,
  right: RankedTopic<TopicId>,
): number {
  return left.rank - right.rank || left.topicId.localeCompare(right.topicId);
}

/** The lowest-ranked eligible catalog topic opens the game as the warm-up. */
export function selectWarmUpTopic<TopicId extends string>(
  topics: readonly RankedTopic<TopicId>[],
): RankedTopic<TopicId> | null {
  return [...topics].sort(byRankThenId)[0] ?? null;
}

/**
 * Chooses the final House Choice slate from the remaining ranked topics: the
 * lowest-ranked topic from three different parent categories when at least
 * three categories remain, otherwise filled by rank.
 */
export function selectFinalSlate<TopicId extends string>(
  topics: readonly RankedTopic<TopicId>[],
  slateSize: number = FINAL_SLATE_SIZE,
): readonly RankedTopic<TopicId>[] {
  const sorted = [...topics].sort(byRankThenId);
  const categoriesAvailable = new Set(sorted.map((topic) => topic.category)).size;
  const slate: RankedTopic<TopicId>[] = [];
  if (categoriesAvailable >= slateSize) {
    const usedCategories = new Set<QuizslopCategory>();
    for (const topic of sorted) {
      if (slate.length >= slateSize) break;
      if (usedCategories.has(topic.category)) continue;
      usedCategories.add(topic.category);
      slate.push(topic);
    }
  }
  for (const topic of sorted) {
    if (slate.length >= slateSize) break;
    if (slate.some((entry) => entry.topicId === topic.topicId)) continue;
    slate.push(topic);
  }
  return slate;
}

/**
 * Category-aware greedy ordering of Home Topics: at each slot choose the
 * lowest-ranked remaining topic whose category differs from the prior slot,
 * falling back to the lowest-ranked remaining topic. Equal-category adjacency
 * avoidance is deterministic and best effort, never a reshuffle.
 */
export function orderHomeTopics<TopicId extends string>(
  topics: readonly RankedTopic<TopicId>[],
): readonly RankedTopic<TopicId>[] {
  const remaining = [...topics].sort(byRankThenId);
  const ordered: RankedTopic<TopicId>[] = [];
  while (remaining.length > 0) {
    const priorCategory = ordered.at(-1)?.category ?? null;
    const preferredIndex = remaining.findIndex((topic) => topic.category !== priorCategory);
    const index = preferredIndex === -1 ? 0 : preferredIndex;
    const [chosen] = remaining.splice(index, 1);
    if (!chosen) break;
    ordered.push(chosen);
  }
  return ordered;
}

export interface HouseVoteSlateEntry<TopicId extends string = string> {
  topicId: TopicId;
  /** Server-generated tie-break rank frozen at deck construction. */
  tieBreakRank: number;
}

/**
 * Resolves the final topic vote: plurality wins, missing votes are
 * abstentions, and any tie (including a zero-vote tie) resolves to the tied
 * topic with the best (lowest) pre-frozen tie-break rank. Never a model call,
 * never client randomness.
 */
export function resolveHouseVote<TopicId extends string>(
  slate: readonly HouseVoteSlateEntry<TopicId>[],
  votes: readonly { topicId: TopicId }[],
): HouseVoteSlateEntry<TopicId> | null {
  if (slate.length === 0) return null;
  const counts = new Map<string, number>(slate.map((entry) => [entry.topicId, 0]));
  for (const vote of votes) {
    const current = counts.get(vote.topicId);
    if (current !== undefined) counts.set(vote.topicId, current + 1);
  }
  const best = [...slate].sort((left, right) => {
    const leftVotes = counts.get(left.topicId) ?? 0;
    const rightVotes = counts.get(right.topicId) ?? 0;
    return (
      rightVotes - leftVotes ||
      left.tieBreakRank - right.tieBreakRank ||
      left.topicId.localeCompare(right.topicId)
    );
  });
  return best[0] ?? null;
}

export interface DeckSlot<TopicId extends string = string, PlayerId extends string = string> {
  kind: "WARM_UP" | "HOME_TURF" | "HOUSE_CHOICE";
  /** Frozen topic for warm-up and Home Turf; null for the voted finale. */
  topicId: TopicId | null;
  /** Home Topic owner for HOME_TURF slots. */
  ownerPlayerId: PlayerId | null;
}

/**
 * The persisted deck: warm-up, every frozen Home Topic once in category-aware
 * shuffled order, then the final House Choice. `totalRounds` is always the
 * frozen player count plus two.
 */
export function buildDeck<TopicId extends string, PlayerId extends string>(input: {
  warmUpTopicId: TopicId;
  homeTopics: readonly { topicId: TopicId; ownerPlayerId: PlayerId }[];
}): readonly DeckSlot<TopicId, PlayerId>[] {
  return [
    { kind: "WARM_UP", topicId: input.warmUpTopicId, ownerPlayerId: null },
    ...input.homeTopics.map(
      (topic): DeckSlot<TopicId, PlayerId> => ({
        kind: "HOME_TURF",
        topicId: topic.topicId,
        ownerPlayerId: topic.ownerPlayerId,
      }),
    ),
    { kind: "HOUSE_CHOICE", topicId: null, ownerPlayerId: null },
  ];
}
