import { describe, expect, test } from "vite-plus/test";
import {
  buildDeck,
  orderHomeTopics,
  resolveHouseVote,
  selectFinalSlate,
  selectWarmUpTopic,
  type HouseVoteSlateEntry,
  type RankedTopic,
} from "./deck";
import { FINAL_SLATE_SIZE } from "./game-constants";
import type { QuizslopCategory } from "./types";

function topic(topicId: string, category: QuizslopCategory, rank: number): RankedTopic {
  return { topicId, category, rank };
}

describe("selectWarmUpTopic", () => {
  test("the lowest-ranked eligible catalog topic opens the game as the warm-up", () => {
    const warmUp = selectWarmUpTopic([
      topic("t-history", "HISTORY", 5),
      topic("t-music", "MUSIC", 2),
      topic("t-sports", "SPORTS", 9),
    ]);
    expect(warmUp?.topicId).toBe("t-music");
  });

  test("an exact rank tie breaks by stable topic ID", () => {
    const warmUp = selectWarmUpTopic([
      topic("t-zebra", "HISTORY", 1),
      topic("t-apple", "MUSIC", 1),
    ]);
    expect(warmUp?.topicId).toBe("t-apple");
  });

  test("an empty topic list yields null", () => {
    expect(selectWarmUpTopic([])).toBeNull();
  });
});

describe("selectFinalSlate", () => {
  const mixedCategories = [
    topic("t-sports-1", "SPORTS", 1),
    topic("t-sports-2", "SPORTS", 2),
    topic("t-music-1", "MUSIC", 3),
    topic("t-music-2", "MUSIC", 4),
    topic("t-history-1", "HISTORY", 5),
    topic("t-geo-1", "GEOGRAPHY", 6),
  ];

  test("with three or more categories remaining, picks the lowest-ranked topic from three different categories", () => {
    const slate = selectFinalSlate(mixedCategories);
    expect(slate.map((entry) => entry.topicId)).toEqual(["t-sports-1", "t-music-1", "t-history-1"]);
    expect(new Set(slate.map((entry) => entry.category)).size).toBe(FINAL_SLATE_SIZE);
  });

  test("with fewer than three categories remaining, fills the slate by rank", () => {
    const slate = selectFinalSlate([
      topic("t-sports-1", "SPORTS", 1),
      topic("t-sports-2", "SPORTS", 2),
      topic("t-music-1", "MUSIC", 3),
      topic("t-sports-3", "SPORTS", 4),
    ]);
    expect(slate.map((entry) => entry.topicId)).toEqual(["t-sports-1", "t-sports-2", "t-music-1"]);
  });

  test("never duplicates a topic in the slate", () => {
    for (const topics of [mixedCategories, mixedCategories.slice(0, 4)]) {
      const slate = selectFinalSlate(topics);
      expect(new Set(slate.map((entry) => entry.topicId)).size).toBe(slate.length);
    }
  });

  test("returns fewer entries than the slate size when fewer topics remain", () => {
    const slate = selectFinalSlate([
      topic("t-sports-1", "SPORTS", 1),
      topic("t-sports-2", "SPORTS", 2),
    ]);
    expect(slate.map((entry) => entry.topicId)).toEqual(["t-sports-1", "t-sports-2"]);
  });

  test("respects a custom slate size", () => {
    const slate = selectFinalSlate(mixedCategories, 2);
    expect(slate.map((entry) => entry.topicId)).toEqual(["t-sports-1", "t-music-1"]);
  });
});

describe("orderHomeTopics", () => {
  test("greedy ordering avoids equal-category adjacency where naive rank order would not", () => {
    // Naive rank order would be [alpha(SPORTS), beta(SPORTS), gamma(MUSIC)],
    // putting two SPORTS topics back to back. The greedy pass defers beta.
    const topics = [
      topic("t-alpha", "SPORTS", 1),
      topic("t-beta", "SPORTS", 2),
      topic("t-gamma", "MUSIC", 3),
    ];
    const ordered = orderHomeTopics(topics);
    expect(ordered.map((entry) => entry.topicId)).toEqual(["t-alpha", "t-gamma", "t-beta"]);
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]?.category).not.toBe(ordered[index - 1]?.category);
    }
  });

  test("when avoidance is impossible (all one category), still returns every topic in rank order", () => {
    const ordered = orderHomeTopics([
      topic("t-b", "SPORTS", 2),
      topic("t-a", "SPORTS", 1),
      topic("t-c", "SPORTS", 3),
    ]);
    expect(ordered.map((entry) => entry.topicId)).toEqual(["t-a", "t-b", "t-c"]);
  });

  test("is deterministic across calls and does not mutate its input", () => {
    const topics = [
      topic("t-alpha", "SPORTS", 1),
      topic("t-beta", "SPORTS", 2),
      topic("t-gamma", "MUSIC", 3),
      topic("t-delta", "MUSIC", 4),
    ];
    const snapshot = topics.map((entry) => entry.topicId);
    const first = orderHomeTopics(topics);
    const second = orderHomeTopics(topics);
    expect(second).toEqual(first);
    expect(topics.map((entry) => entry.topicId)).toEqual(snapshot);
  });

  test("a rank tie breaks by stable topic ID", () => {
    const ordered = orderHomeTopics([topic("t-zebra", "MUSIC", 1), topic("t-apple", "SPORTS", 1)]);
    expect(ordered.map((entry) => entry.topicId)).toEqual(["t-apple", "t-zebra"]);
  });
});

describe("buildDeck", () => {
  const homeTopics = [
    { topicId: "t-home-1", ownerPlayerId: "p1" },
    { topicId: "t-home-2", ownerPlayerId: "p2" },
    { topicId: "t-home-3", ownerPlayerId: "p3" },
  ];

  test("the warm-up is first and the House Choice is last with a null topic", () => {
    const deck = buildDeck({ warmUpTopicId: "t-warm-up", homeTopics });
    expect(deck[0]).toEqual({ kind: "WARM_UP", topicId: "t-warm-up", ownerPlayerId: null });
    expect(deck.at(-1)).toEqual({ kind: "HOUSE_CHOICE", topicId: null, ownerPlayerId: null });
  });

  test("every Home Topic appears exactly once, in the given order, with its owner", () => {
    const deck = buildDeck({ warmUpTopicId: "t-warm-up", homeTopics });
    expect(deck.slice(1, -1)).toEqual([
      { kind: "HOME_TURF", topicId: "t-home-1", ownerPlayerId: "p1" },
      { kind: "HOME_TURF", topicId: "t-home-2", ownerPlayerId: "p2" },
      { kind: "HOME_TURF", topicId: "t-home-3", ownerPlayerId: "p3" },
    ]);
  });

  test("deck length is the frozen player count plus two (totalRounds relationship)", () => {
    const frozenPlayerCount = homeTopics.length;
    const deck = buildDeck({ warmUpTopicId: "t-warm-up", homeTopics });
    expect(deck).toHaveLength(frozenPlayerCount + 2);
  });
});

describe("resolveHouseVote", () => {
  const slate: HouseVoteSlateEntry[] = [
    { topicId: "t-a", tieBreakRank: 2 },
    { topicId: "t-b", tieBreakRank: 1 },
    { topicId: "t-c", tieBreakRank: 3 },
  ];

  test("the plurality winner becomes the final topic", () => {
    const winner = resolveHouseVote(slate, [
      { topicId: "t-a" },
      { topicId: "t-c" },
      { topicId: "t-a" },
    ]);
    expect(winner?.topicId).toBe("t-a");
  });

  test("missing votes are abstentions: one cast vote decides among silent voters", () => {
    const winner = resolveHouseVote(slate, [{ topicId: "t-c" }]);
    expect(winner?.topicId).toBe("t-c");
  });

  test("a two-way tie resolves to the tied topic with the lower pre-frozen tie-break rank", () => {
    const winner = resolveHouseVote(slate, [{ topicId: "t-a" }, { topicId: "t-b" }]);
    expect(winner?.topicId).toBe("t-b");
  });

  test("a zero-vote tie resolves to the topic with the lowest tie-break rank", () => {
    const winner = resolveHouseVote(slate, []);
    expect(winner?.topicId).toBe("t-b");
  });

  test("votes for topics outside the frozen slate are ignored", () => {
    const winner = resolveHouseVote(slate, [
      { topicId: "t-intruder" },
      { topicId: "t-intruder" },
      { topicId: "t-a" },
    ]);
    expect(winner?.topicId).toBe("t-a");
  });

  test("an empty slate yields null", () => {
    expect(resolveHouseVote([], [{ topicId: "t-a" }])).toBeNull();
  });
});
