import { describe, expect, it } from "vite-plus/test";
import { fixtureId, fixturePlayer } from "@/dev/fixtures/base";
import { bestAnswers, matchupResult } from "./outcomes";
import { sloplashPrompt } from "./test-kit";

const human = fixturePlayer("human", "Hana");
const ai = fixturePlayer("ai", "Bot", { type: "AI", modelId: "openai/gpt-6.1-sol" });
const otherAi = fixturePlayer("ai2", "Bit", { type: "AI" });
const voterA = fixturePlayer("va", "Vic");
const voterB = fixturePlayer("vb", "Val", { type: "AI" });
const players = [human, ai, otherAi, voterA, voterB];
const typeOf = (id: string) => players.find((player) => player.id === id)?.type;

const robotWins = sloplashPrompt(
  "robot",
  "A rejected cereal mascot:",
  [
    { by: "human", text: "Captain Crunchwrap" },
    { by: "ai", text: "Sergeant Soggy", points: 195 },
  ],
  [
    ["va", 1],
    ["vb", 1],
  ],
);

describe("matchupResult", () => {
  it("flags a unanimous AI win over a human as slopped", () => {
    const result = matchupResult(robotWins, typeOf);
    expect(result.answers.map((entry) => [entry.isWinner, entry.pct, entry.points])).toEqual([
      [false, 0, 0],
      [true, 100, 195],
    ]);
    expect(result).toMatchObject({ isUnanimous: true, aiBeatsHuman: true, isTie: false });
  });

  it("separates passes from timeouts and spots an all-human pass", () => {
    const passed = sloplashPrompt(
      "pass",
      "Prompt",
      [
        { by: "ai", text: "a", penalty: -100 },
        { by: "ai2", text: "b", penalty: -100 },
      ],
      [
        ["va", null],
        ["vb", null, true],
      ],
    );
    const result = matchupResult(passed, typeOf);
    expect(result.answers.map((entry) => entry.points)).toEqual([-100, -100]);
    expect(result.passed.map((vote) => vote.voterId)).toEqual([fixtureId("players", "va")]);
    expect(result.timedOut.map((vote) => vote.voterId)).toEqual([fixtureId("players", "vb")]);
    expect(result).toMatchObject({ allPassed: true, isTie: false, castVotes: 0 });
  });
});

describe("bestAnswers", () => {
  it("ranks winning answers by vote share", () => {
    expect(bestAnswers([{ number: 2, prompts: [robotWins] }])).toEqual([
      {
        promptText: "A rejected cereal mascot:",
        text: "Sergeant Soggy",
        playerId: ai.id,
        pct: 100,
        round: 2,
      },
    ]);
  });
});
