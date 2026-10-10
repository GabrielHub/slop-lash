import { describe, expect, it } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SloplashPrompt } from "../../../convex/sloplash/view";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { matchupOutcome } from "./outcomes";

const TYPES: Record<string, "HUMAN" | "AI"> = { ana: "HUMAN", ben: "HUMAN", bot: "AI", bot2: "AI" };
const typeOf = (playerId: string) => TYPES[playerId];

/** A revealed matchup: `authors` (null text = no answer) and picks by answer index. */
function matchup(
  authors: [string, string | null][],
  picks: (number | null)[],
  points: number[] = [],
): SloplashPrompt {
  const answerId = (index: number) => `answer-${index}` as Id<"responses">;
  const present = authors.filter(([, text]) => text !== null).length;
  return {
    id: "prompt" as Id<"prompts">,
    text: "The worst thing to hear from your dentist",
    assigneeIds: authors.map(([by]) => by as Id<"players">),
    kind: present >= 2 ? "vote" : present === 1 ? "walkover" : "void",
    order: present === 0 ? null : 0,
    revealed: true,
    answers: authors.map(([by, text], index) => ({
      id: answerId(index),
      text: text ?? FORFEIT_MARKER,
      forfeited: text === null,
      playerId: by as Id<"players">,
      pointsEarned: points[index] ?? 0,
      reactions: [],
    })),
    votes: picks.map((pick, index) => ({
      voterId: `voter-${index}` as Id<"players">,
      responseId: pick === null ? null : answerId(pick),
      timedOut: false,
    })),
    liveReactions: [],
  };
}

describe("matchupOutcome", () => {
  it("stamps a unanimous AI win over a human as slopped", () => {
    const result = matchupOutcome(
      matchup(
        [
          ["ana", "We drill after dark"],
          ["bot", "Pain is temporary"],
        ],
        [1, 1, 1],
      ),
      1,
      typeOf,
    );
    expect(result.stamp).toBe("slopped");
    expect(result.aiWon).toBe(true);
    expect(result.winnerAnswerId).toBe("answer-1");
  });

  it("a non-unanimous AI win gets no stamp", () => {
    const result = matchupOutcome(
      matchup(
        [
          ["ana", "a"],
          ["bot", "b"],
        ],
        [1, 1, 0],
      ),
      1,
      typeOf,
    );
    expect(result.stamp).toBeNull();
    expect(result.aiWon).toBe(true);
  });

  it("stamps an AI-vs-AI sweep as flawless", () => {
    const sweep = matchup(
      [
        ["bot", "a"],
        ["bot2", "b"],
      ],
      [0, 0],
    );
    expect(matchupOutcome(sweep, 1, typeOf).stamp).toBe("flawless");
    const human = matchup(
      [
        ["ana", "a"],
        ["bot", "b"],
      ],
      [0, 0, 0],
    );
    expect(matchupOutcome(human, 1, typeOf).stamp).toBe("flawless");
  });

  it("stamps ties and no-vote matchups", () => {
    const pair: [string, string][] = [
      ["ana", "a"],
      ["ben", "b"],
    ];
    expect(matchupOutcome(matchup(pair, [0, 1]), 1, typeOf).stamp).toBe("tie");
    expect(matchupOutcome(matchup(pair, [null, null]), 1, typeOf).stamp).toBe("noVotes");
    // A single vote is a plain win, never unanimous.
    expect(matchupOutcome(matchup(pair, [0]), 1, typeOf).stamp).toBeNull();
  });

  it("a walkover has no stamp", () => {
    const result = matchupOutcome(
      matchup(
        [
          ["ana", "a"],
          ["bot", null],
        ],
        [],
      ),
      2,
      typeOf,
    );
    expect(result.stamp).toBeNull();
    expect(result.score.outcome).toBe("walkover");
    expect(result.score.points["answer-0"]).toBe(200);
  });

  it("agrees with the points the server stored", () => {
    // Round 3 (×4): a 4–2 split pays 1,600 / 800; a 6–0 sweep pays 6 × 400 × 1.5.
    const split = matchup(
      [
        ["ana", "a"],
        ["ben", "b"],
      ],
      [0, 0, 1, 0, 1, 0],
      [1_600, 800],
    );
    const sweep = matchup(
      [
        ["ana", "a"],
        ["ben", "b"],
      ],
      [0, 0, 0, 0, 0, 0],
      [3_600, 0],
    );
    for (const prompt of [split, sweep]) {
      const { score } = matchupOutcome(prompt, 3, typeOf);
      for (const answer of prompt.answers) {
        expect(score.points[answer.id]).toBe(answer.pointsEarned);
      }
    }
  });
});
