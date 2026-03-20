import { describe, expect, it } from "vitest";
import {
  buildPersonaReplySystemPrompt,
  normalizePersonaReplyOutcome,
  parseAiFollowupResponse,
  parseAiOpenerResponse,
  parsePersonaReplyResponse,
} from "./ai";

describe("buildPersonaReplySystemPrompt", () => {
  it("requires the opener round to continue after the initial vote", () => {
    const prompt = buildPersonaReplySystemPrompt("MAN", "WOMAN", true);

    expect(prompt).toContain("Opening exchange");
    expect(prompt).toContain("outcome must be CONTINUE");
  });

  it("keeps normal outcome choices for later rounds", () => {
    const prompt = buildPersonaReplySystemPrompt("MAN", "WOMAN", false);

    expect(prompt).toContain("DATE_SEALED:");
    expect(prompt).toContain("UNMATCHED:");
    expect(prompt).toContain("CONTINUE:");
  });
});

describe("normalizePersonaReplyOutcome", () => {
  it("forces CONTINUE during the opener round", () => {
    expect(normalizePersonaReplyOutcome("UNMATCHED", true)).toBe("CONTINUE");
    expect(normalizePersonaReplyOutcome("DATE_SEALED", true)).toBe("CONTINUE");
  });

  it("preserves later-round outcomes", () => {
    expect(normalizePersonaReplyOutcome("UNMATCHED", false)).toBe("UNMATCHED");
    expect(normalizePersonaReplyOutcome("DATE_SEALED", false)).toBe("DATE_SEALED");
  });
});

describe("matchslop AI response parsing", () => {
  it("salvages opener JSON that uses alternate field names", () => {
    expect(
      parseAiOpenerResponse('```json\n{"prompt_id":"prompt-2","text":"i brought a spreadsheet for your red flags"}\n```'),
    ).toEqual({
      selectedPromptId: "prompt-2",
      line: "i brought a spreadsheet for your red flags",
    });
  });

  it("accepts plain-text followups when a provider skips JSON mode", () => {
    expect(parseAiFollowupResponse('"cool, but can your aura survive a costco sample gauntlet?"')).toEqual({
      line: "cool, but can your aura survive a costco sample gauntlet?",
    });
  });

  it("defaults plain-text persona replies to continue", () => {
    expect(parsePersonaReplyResponse("you are alarmingly confident for someone holding a rotisserie chicken")).toEqual({
      reply: "you are alarmingly confident for someone holding a rotisserie chicken",
      outcome: "CONTINUE",
      moodDelta: 0,
    });
  });

  it("defaults partial persona JSON replies to continue", () => {
    expect(parsePersonaReplyResponse('{"reply":"that is the most suspiciously confident soup pitch i have ever heard"}')).toEqual({
      reply: "that is the most suspiciously confident soup pitch i have ever heard",
      outcome: "CONTINUE",
      moodDelta: 0,
    });
  });

  it("rejects persona replies with an empty message", () => {
    expect(parsePersonaReplyResponse('{"reply":"   ","outcome":"DATE_SEALED"}')).toBeNull();
  });
});
