import { describe, expect, test } from "vite-plus/test";
import { fixturePlayer } from "@/dev/fixtures/base";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SloplashPrompt, SloplashView } from "../../../convex/sloplash/view";
import { FORFEIT_MARKER } from "@/games/core/constants";
import {
  buildMatchupNarration,
  buildRoundOverNarration,
  buildVoteResultNarration,
  phaseNarration,
} from "./narrator-events";

const ana = fixturePlayer("ana", "Ana", { score: 100 });
const ben = fixturePlayer("ben", "Ben", { score: 20 });
const vi = fixturePlayer("voter", "Vi");
const players = [ana, ben, vi];

/** A revealed matchup between `answers` (null = no answer), with picks by answer index. */
function matchup(
  key: string,
  answers: [typeof ana, string | null][],
  picks: (number | null)[],
  order = 0,
): SloplashPrompt {
  const answerId = (index: number) => `${key}-${index}` as Id<"responses">;
  const present = answers.filter(([, text]) => text !== null).length;
  return {
    id: key as Id<"prompts">,
    text: "The worst thing to bring to ______",
    assigneeIds: answers.map(([player]) => player.id),
    kind: present >= 2 ? "vote" : present === 1 ? "walkover" : "void",
    order,
    revealed: true,
    answers: answers.map(([player, text], index) => ({
      id: answerId(index),
      text: text ?? FORFEIT_MARKER,
      forfeited: text === null,
      playerId: player.id,
      pointsEarned: 0,
      reactions: [],
    })),
    votes: picks.map((pick) => ({
      voterId: vi.id,
      responseId: pick === null ? null : answerId(pick),
      timedOut: false,
    })),
    liveReactions: [],
  };
}

const goose = matchup(
  "goose",
  [
    [ana, "a live goose"],
    [ben, "your tax return"],
  ],
  [0],
  1,
);
const walkover = matchup(
  "walk",
  [
    [ana, null],
    [ben, "a ham"],
  ],
  [],
  0,
);

function mode(current: SloplashPrompt, revealed: boolean): SloplashView {
  return {
    kind: "SLOPLASH",
    tagline: null,
    round: { number: 1, prompts: [walkover, revealed ? current : { ...current, revealed: false }] },
    rounds: [],
    writing: null,
    currentPromptId: current.id,
    matchupCount: 2,
  };
}

describe("narrator events", () => {
  test("keeps matchup scripts deterministic and verbatim", () => {
    expect(buildMatchupNarration(goose)).toEqual({
      eventType: "matchup",
      fallbackText:
        "The prompt is: The worst thing to bring to ... First joke: a live goose. Second joke: your tax return.",
    });
  });

  test("calls a single vote a win, not unanimous", () => {
    expect(buildVoteResultNarration(goose, players)).toEqual({
      eventType: "vote_result",
      fallbackText: "Ana steals it by a hair.",
      generationContext: JSON.stringify({
        outcome: "winner",
        winnerName: "Ana",
        margin: "razor close",
      }),
    });
    const sweep = matchup(
      "sweep",
      [
        [ana, "a"],
        [ben, "b"],
      ],
      [1, 1],
    );
    expect(buildVoteResultNarration(sweep, players)?.fallbackText).toBe(
      "Ben wins unanimously. No debate at all.",
    );
  });

  test("announces a walkover as a win by default", () => {
    expect(buildVoteResultNarration(walkover, players)).toEqual({
      eventType: "vote_result",
      fallbackText: "No answer. Ben wins by default.",
      generationContext: JSON.stringify({ outcome: "walkover", winnerName: "Ben" }),
    });
  });

  test("says nobody voted for a 0-0 matchup", () => {
    const silent = matchup(
      "silent",
      [
        [ana, "a"],
        [ben, "b"],
      ],
      [null, null],
    );
    expect(buildVoteResultNarration(silent, players)).toEqual({
      eventType: "vote_result",
      fallbackText: "Nobody voted. Nobody scores.",
      generationContext: JSON.stringify({ outcome: "no_votes" }),
    });
  });

  test("provides safe fallbacks for the round-over line", () => {
    expect(buildRoundOverNarration({ round: 1, totalRounds: 1 }, players)).toEqual({
      eventType: "round_over",
      fallbackText: "Game over. Ana wins Slop-Lash.",
      generationContext: JSON.stringify({
        final: true,
        winnerName: "Ana",
        round: 1,
        totalRounds: 1,
      }),
    });
  });

  test("voting starts after leading walkovers", () => {
    const first = { phase: "VOTING", round: 1, totalRounds: 3, step: 1 } as const;
    expect(
      phaseNarration(first, mode(goose, false), players, "REVEAL").map((cue) => cue.eventType),
    ).toEqual(["voting_start", "matchup"]);
    expect(phaseNarration(first, mode(goose, false), players, null)).toEqual([]);
    const later = { ...first, step: 2 } as const;
    expect(
      phaseNarration(later, mode(goose, false), players, "REVEAL").map((cue) => cue.eventType),
    ).toEqual(["matchup"]);
  });

  test("reads the result when a matchup is revealed", () => {
    const room = { phase: "REVEAL", round: 1, totalRounds: 3, step: 1 } as const;
    expect(
      phaseNarration(room, mode(goose, true), players, "VOTING").map((cue) => cue.eventType),
    ).toEqual(["vote_result"]);
  });
});
