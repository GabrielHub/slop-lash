import { describe, expect, it } from "vitest";
import {
  comparePlayersByScore,
  pickTopScoringPlayer,
  sortPlayersByScore,
} from "./player-rankings";

describe("player rankings", () => {
  it("sorts by score descending with id as the tiebreaker", () => {
    const players = [
      { id: "b", score: 10 },
      { id: "a", score: 10 },
      { id: "c", score: 12 },
    ];

    expect(sortPlayersByScore(players).map((player) => player.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("picks the same player the comparator ranks first", () => {
    const players = [
      { id: "z", score: 5 },
      { id: "m", score: 8 },
      { id: "a", score: 8 },
    ];

    expect(pickTopScoringPlayer(players)).toEqual({ id: "a", score: 8 });
    expect([...players].sort(comparePlayersByScore)[0]).toEqual({
      id: "a",
      score: 8,
    });
  });
});
