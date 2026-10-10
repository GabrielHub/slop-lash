import { describe, expect, it } from "vite-plus/test";
import { fitText } from "./fit-text";

describe("fitText", () => {
  it("leaves text that fits alone", () => {
    expect(fitText("  short and sweet ", 80)).toBe("short and sweet");
  });

  it("prefers the last whole sentence when it keeps most of the room", () => {
    const reply =
      "ok that's a real question and I respect it. I'm not telling you who I'd marry on the first crossword date though. name your album first and I'll tell you if you pass";
    const cut = fitText(reply, 160, true);
    expect(cut).toBe(
      "ok that's a real question and I respect it. I'm not telling you who I'd marry on the first crossword date though.",
    );
  });

  it("drops dangling function words at a word cut", () => {
    const answer =
      "Before: a healthy sourdough starter. After: a sourdough starter that now has a family";
    const cut = fitText(answer, 80);
    expect(cut.length).toBeLessThanOrEqual(80);
    expect(cut).toBe("Before: a healthy sourdough starter. After: a sourdough starter");
  });

  it("keeps the first sentence of a verdict that ran long", () => {
    const verdict =
      "Opened with a feet pic demand and a salary flex. Bold, bleak, very committed to the bit";
    expect(fitText(verdict, 70, true)).toBe("Opened with a feet pic demand and a salary flex.");
  });

  it("adds an ellipsis inside the budget on a word cut", () => {
    const verdict =
      "Silent through the whole crossword debate and honestly the most respectful man in the chat";
    const cut = fitText(verdict, 70, true);
    expect(cut.length).toBeLessThanOrEqual(70);
    expect(cut).toBe("Silent through the whole crossword debate and honestly the most…");
  });

  it("never strips below half the room", () => {
    const cut = fitText("the a the a the a the a the a the a the a the a", 20);
    expect(cut.length).toBeGreaterThanOrEqual(10);
  });

  it("hard-cuts a single long word", () => {
    expect(fitText("x".repeat(100), 80)).toBe("x".repeat(80));
    expect(fitText("x".repeat(100), 80, true)).toBe(`${"x".repeat(79)}…`);
  });
});
