import { describe, expect, it } from "vite-plus/test";
import { FORFEIT_MARKER } from "./constants";
import { isPromptVotable } from "./votability";

const real = { text: "a real opener" };
const forfeit = { text: FORFEIT_MARKER };

describe("isPromptVotable", () => {
  it("keeps QuizSlop out of the generic prompt voting path", () => {
    expect(isPromptVotable("QUIZSLOP", [real, real])).toBe(false);
  });

  it("keeps a MatchSlop prompt votable while any real response remains", () => {
    expect(isPromptVotable("MATCHSLOP", [real, forfeit])).toBe(true);
    expect(isPromptVotable("MATCHSLOP", [real, forfeit, forfeit])).toBe(true);
    // MatchSlop has no two-response floor: one guest still gets judged.
    expect(isPromptVotable("MATCHSLOP", [real])).toBe(true);
    expect(isPromptVotable("MATCHSLOP", [forfeit, forfeit])).toBe(false);
  });

  it("keeps a ChatSlop prompt votable while any real response remains, above the floor", () => {
    expect(isPromptVotable("AI_CHAT_SHOWDOWN", [real, forfeit])).toBe(true);
    expect(isPromptVotable("AI_CHAT_SHOWDOWN", [forfeit, forfeit])).toBe(false);
    expect(isPromptVotable("AI_CHAT_SHOWDOWN", [real])).toBe(false);
  });

  it("drops a Slop-Lash matchup as soon as either side forfeits", () => {
    expect(isPromptVotable("SLOPLASH", [real, real])).toBe(true);
    expect(isPromptVotable("SLOPLASH", [real, forfeit])).toBe(false);
    expect(isPromptVotable("SLOPLASH", [real])).toBe(false);
  });
});
