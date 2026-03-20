import { describe, expect, it } from "vitest";
import {
  buildPersonaReplySystemPrompt,
  normalizePersonaReplyOutcome,
} from "./ai";

describe("buildPersonaReplySystemPrompt", () => {
  it("requires the opener round to continue after the initial vote", () => {
    const prompt = buildPersonaReplySystemPrompt("MAN", "WOMAN", true);

    expect(prompt).toContain("This is the opening exchange after a successful match");
    expect(prompt).toContain("Outcome must be CONTINUE for this turn");
    expect(prompt).toContain("Do not unmatch or seal the date yet");
  });

  it("keeps normal outcome choices for later rounds", () => {
    const prompt = buildPersonaReplySystemPrompt("MAN", "WOMAN", false);

    expect(prompt).toContain("DATE_SEALED means the conversation genuinely landed");
    expect(prompt).toContain("UNMATCHED means the players flopped or got too weird");
    expect(prompt).toContain("CONTINUE means there is enough spark for one more exchange");
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
