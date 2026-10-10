import { describe, expect, it } from "vite-plus/test";
import { parseHostGameParam } from "./host-game-param";

describe("parseHostGameParam", () => {
  it("preselects each game by its type", () => {
    expect(parseHostGameParam("SLOPLASH")).toBe("SLOPLASH");
    expect(parseHostGameParam("MATCHSLOP")).toBe("MATCHSLOP");
    expect(parseHostGameParam("QUIZSLOP")).toBe("QUIZSLOP");
  });

  it("forgives case and whitespace", () => {
    expect(parseHostGameParam(" quizslop ")).toBe("QUIZSLOP");
  });

  it("takes the first of repeated params", () => {
    expect(parseHostGameParam(["MATCHSLOP", "QUIZSLOP"])).toBe("MATCHSLOP");
  });

  it("falls back to SlopLash for a missing or unknown game", () => {
    expect(parseHostGameParam(undefined)).toBe("SLOPLASH");
    expect(parseHostGameParam("")).toBe("SLOPLASH");
    expect(parseHostGameParam("JACKBOX")).toBe("SLOPLASH");
  });
});
