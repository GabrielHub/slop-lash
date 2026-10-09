import { describe, expect, test } from "vite-plus/test";
import { fixturePlayer } from "@/dev/fixtures/base";
import type { SloplashView } from "../../../convex/sloplash/view";
import {
  buildMatchupNarration,
  buildRoundOverNarration,
  buildVoteResultNarration,
  phaseNarration,
} from "./narrator-events";
import { sloplashPrompt } from "./test-kit";

const ana = fixturePlayer("ana", "Ana", { score: 100 });
const ben = fixturePlayer("ben", "Ben", { score: 20 });
const players = [ana, ben, fixturePlayer("voter", "Vi")];

const prompt = sloplashPrompt(
  "goose",
  "The worst thing to bring to ______",
  [
    { by: "ana", text: "a live goose" },
    { by: "ben", text: "your tax return" },
  ],
  [["voter", 0]],
);

function mode(phase: "VOTING" | "REVEAL"): SloplashView {
  const revealed = phase === "REVEAL";
  const current = revealed ? prompt : { ...prompt, revealed: false };
  return {
    kind: "SLOPLASH",
    tagline: null,
    round: { number: 1, prompts: [current] },
    rounds: [],
    writing: null,
    currentPromptId: prompt.id,
    matchupCount: 1,
  };
}

describe("narrator events", () => {
  test("keeps matchup scripts deterministic and verbatim", () => {
    expect(buildMatchupNarration(prompt)).toEqual({
      eventType: "matchup",
      fallbackText:
        "The prompt is: The worst thing to bring to ... First joke: a live goose. Second joke: your tax return.",
    });
  });

  test("provides safe fallbacks and factual context for generated host lines", () => {
    expect(buildVoteResultNarration(prompt, players)).toEqual({
      eventType: "vote_result",
      fallbackText: "Ana wins unanimously. No debate at all.",
      generationContext: JSON.stringify({
        outcome: "winner",
        winnerName: "Ana",
        margin: "unanimous",
      }),
    });
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

  test("announces voting and the first matchup when writing ends", () => {
    const room = { phase: "VOTING", round: 1, totalRounds: 3 } as const;
    expect(
      phaseNarration(room, mode("VOTING"), players, "WRITING").map((cue) => cue.eventType),
    ).toEqual(["voting_start", "matchup"]);
    expect(phaseNarration(room, mode("VOTING"), players, null)).toEqual([]);
  });

  test("reads the result when a matchup is revealed", () => {
    const room = { phase: "REVEAL", round: 1, totalRounds: 3 } as const;
    expect(
      phaseNarration(room, mode("REVEAL"), players, "VOTING").map((cue) => cue.eventType),
    ).toEqual(["vote_result"]);
  });
});
