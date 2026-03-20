import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORFEIT_MARKER } from "@/games/core/constants";
import {
  buildPersonaReplySystemPrompt,
  normalizePersonaReplyOutcome,
  parseAiFollowupResponse,
  parseAiOpenerResponse,
  parsePersonaReplyResponse,
} from "./ai";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
  streamText: vi.fn(),
  createGateway: vi.fn(() => vi.fn()),
  Output: {
    object: vi.fn(),
  },
  NoObjectGeneratedError: {
    isInstance: vi.fn(() => false),
  },
}));

import { generateAiOpener } from "./ai";

describe("generateAiOpener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns timeout failReason when the gateway reject was caused by our timeout", async () => {
    const timeoutError = new Error("MatchSlop opener for player-1 timed out after 20000ms");
    timeoutError.name = "TimeoutError";

    const gatewayError = new Error(
      "Invalid error response format: Gateway request failed: MatchSlop opener for player-1 timed out after 20000ms",
    );
    gatewayError.name = "GatewayResponseError";

    const controller = new AbortController();
    controller.abort(timeoutError);
    generateTextMock.mockRejectedValue(gatewayError);

    const result = await generateAiOpener(
      "alibaba/qwen3.5-flash",
      {
        displayName: "Alex",
        backstory: "Backstory",
        age: 27,
        location: "LA",
        bio: "Bio",
        tagline: null,
        prompts: [
          { id: "prompt-1", prompt: "Most irrational fear?", answer: "Escalators" },
          { id: "prompt-2", prompt: "Love language?", answer: "Soup" },
          { id: "prompt-3", prompt: "Weekend plan?", answer: "Birdwatching" },
        ],
        details: {
          job: "Designer",
          school: null,
          height: "5'9\"",
          languages: ["English"],
        },
      },
      ["example opener"],
      { abortSignal: controller.signal },
    );

    expect(result).toEqual({
      selectedPromptId: "prompt-1",
      text: FORFEIT_MARKER,
      usage: {
        modelId: "alibaba/qwen3.5-flash",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      },
      failReason: "timeout",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[matchslop:generateAiOpener] alibaba/qwen3.5-flash failed"),
      expect.objectContaining({
        failReason: "timeout",
        abortSignal: expect.objectContaining({
          aborted: true,
        }),
      }),
    );
  });
});

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
