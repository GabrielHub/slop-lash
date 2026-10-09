import { describe, expect, it } from "vite-plus/test";
import { fixturePlayer } from "@/dev/fixtures/base";
import { computeAchievements } from "./achievements";
import { sloplashPrompt, type AnswerSpec, type VoteSpec } from "./test-kit";

const alice = fixturePlayer("alice", "Alice");
const bob = fixturePlayer("bob", "Bob");
const carol = fixturePlayer("carol", "Carol");
const gpt = fixturePlayer("gpt", "GPT", { type: "AI", modelId: "openai/gpt-6.1-sol" });

function round(...prompts: [AnswerSpec[], VoteSpec[]][]) {
  return {
    number: 1,
    prompts: prompts.map(([answers, votes], index) =>
      sloplashPrompt(`p${index}`, `Prompt ${index}`, answers, votes),
    ),
  };
}

function awarded(achievements: ReturnType<typeof computeAchievements>, id: string) {
  return achievements
    .filter((entry) => entry.achievement.id === id)
    .map((entry) => entry.playerName);
}

describe("computeAchievements", () => {
  it("returns nothing for a game with no rounds and no points", () => {
    expect(computeAchievements([], [alice, bob])).toEqual([]);
  });

  it("awards MVP to a single top scorer only", () => {
    const leader = { ...alice, score: 500 };
    expect(awarded(computeAchievements([], [leader, { ...bob, score: 300 }]), "mvp")).toEqual([
      "Alice",
    ]);
    expect(awarded(computeAchievements([], [leader, { ...bob, score: 500 }]), "mvp")).toEqual([]);
  });

  it("awards Slop Master to the unanimous winner and Slopped to the loser", () => {
    const achievements = computeAchievements(
      [
        round([
          [
            { by: "alice", text: "Funny" },
            { by: "bob", text: "Meh" },
          ],
          [
            ["gpt", 0],
            ["carol", 0],
          ],
        ]),
      ],
      [alice, bob, gpt, carol],
    );
    expect(awarded(achievements, "slopMaster")).toEqual(["Alice"]);
    expect(awarded(achievements, "slopped")).toEqual(["Bob"]);
  });

  it("awards AI Slayer when a human beats an AI head-to-head", () => {
    const achievements = computeAchievements(
      [
        round([
          [
            { by: "alice", text: "Human joke" },
            { by: "gpt", text: "Robot joke" },
          ],
          [
            ["bob", 0],
            ["carol", 0],
          ],
        ]),
      ],
      [alice, bob, gpt, carol],
    );
    expect(awarded(achievements, "aiSlayer")).toEqual(["Alice"]);
  });

  it("awards Clutch for winning by exactly one vote", () => {
    const achievements = computeAchievements(
      [
        round([
          [
            { by: "alice", text: "A" },
            { by: "bob", text: "B" },
          ],
          [
            ["gpt", 0],
            ["carol", 0],
            ["dave", 1],
          ],
        ]),
      ],
      [alice, bob, gpt, carol],
    );
    expect(awarded(achievements, "clutch")).toEqual(["Alice"]);
  });

  it("awards Iron Will to humans who answered every prompt", () => {
    const achievements = computeAchievements(
      [
        round(
          [[{ by: "alice", text: "Answer 1" }, { by: "bob" }], []],
          [
            [
              { by: "alice", text: "Answer 2" },
              { by: "gpt", text: "AI answer" },
            ],
            [],
          ],
        ),
      ],
      [alice, bob, gpt],
    );
    expect(awarded(achievements, "ironWill")).toEqual(["Alice"]);
  });
});
