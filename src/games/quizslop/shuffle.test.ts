import { describe, expect, test } from "vite-plus/test";
import { QUIZSLOP_TOPIC_CATALOG } from "./config/topic-catalog";
import { presentChoices } from "./shuffle";

const question = { choices: ["right", "w1", "w2", "w3"], correctIndex: 0 };

describe("presentChoices", () => {
  test("is stable for the same seed", () => {
    expect(presentChoices(question, "game-1:q1")).toEqual(presentChoices(question, "game-1:q1"));
  });

  test("keeps every choice and tracks the correct one", () => {
    for (let game = 0; game < 50; game += 1) {
      const presented = presentChoices(question, `game-${game}:q1`);
      expect([...presented.choices].sort()).toEqual([...question.choices].sort());
      expect(presented.choices[presented.correctIndex]).toBe("right");
    }
  });

  test("spreads the correct answer across all four positions", () => {
    const counts = [0, 0, 0, 0];
    for (let game = 0; game < 400; game += 1) {
      counts[presentChoices(question, `game-${game}:q1`).correctIndex]! += 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(60);
      expect(count).toBeLessThan(140);
    }
  });

  test("the shipped catalog does not always land on A in one game", () => {
    const questions = QUIZSLOP_TOPIC_CATALOG.flatMap((topic) => topic.questions);
    const positions = questions.map(
      (entry) => presentChoices(entry, `game-x:${entry.id}`).correctIndex,
    );
    const onA = positions.filter((position) => position === 0).length;
    expect(onA / questions.length).toBeLessThan(0.4);
    expect(new Set(positions).size).toBe(4);
  });
});
