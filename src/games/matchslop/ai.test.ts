import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORFEIT_MARKER } from "@/games/core/constants";
import type { MatchSlopPersonaSeed } from "./config/persona-examples";
import {
  buildPersonaReplySystemPrompt,
  deriveFallbackSignal,
  generatePersonaPortraitPrompt,
  generatePersonaProfile,
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

describe("persona generation prompts", () => {
  const personaSeed: MatchSlopPersonaSeed = {
    id: "seed-1",
    name: "Randa",
    identity: "WOMAN",
    backstory: "Dry surfer from SF who texts in lowercase.",
    textingStyle: "Lowercase and dry.",
    title: "Beach text menace",
    bio: "Surfs first, texts later.",
    details: {
      job: "Technical writer",
      school: "UC Santa Cruz",
      height: "5'7\"",
      languages: ["English", "Arabic"],
    },
    appearance: "Woman, late 20s, olive skin, long wavy dark hair, athletic build, white tank and wetsuit, foggy beach backdrop",
    imagePrompt:
      "Portrait of an adult woman in her late 20s with olive skin and long wavy dark hair, athletic build, white tank and wetsuit, on a foggy beach. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: ["I go crazy for", "Typical Sunday", "A hill I will die on"],
    toneTags: ["dry", "grounded"],
    redFlags: ["ghosts for waves"],
    greenFlags: ["always has snacks"],
  };

  it("uses seed examples as calibration without leaking example names into the prompt body", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        profile: {
          displayName: "Jules",
          backstory: "Backstory",
          appearance: "Appearance",
          age: 27,
          location: "San Francisco",
          bio: "Bio",
          tagline: null,
          prompts: [
            { id: "p1", prompt: "Prompt 1", answer: "Answer 1" },
            { id: "p2", prompt: "Prompt 2", answer: "Answer 2" },
            { id: "p3", prompt: "Prompt 3", answer: "Answer 3" },
          ],
          details: {
            job: "Designer",
            school: null,
            height: "5'8\"",
            languages: ["English"],
          },
        },
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await generatePersonaProfile("openai/test-model", "MAN", "WOMAN", [personaSeed]);

    const request = generateTextMock.mock.calls.at(-1)?.[0];
    expect(request.system).toContain("Invent a NEW first name");
    expect(request.prompt).toContain("<avoid-names>");
    expect(request.prompt).toContain("Randa");
    expect(request.prompt).not.toContain("<name>Randa</name>");
    expect(request.prompt).toContain("<appearance>");
  });

  it("includes profile appearance and portrait seeds when building the Fal prompt request", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        prompt: "portrait prompt",
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await generatePersonaPortraitPrompt(
      "openai/test-model",
      "WOMAN",
      {
        displayName: "Jules",
        backstory: "Backstory",
        appearance: "Woman, late 20s, short curly hair, leather jacket, amused half-smile, bar patio",
        age: 27,
        location: "Oakland",
        bio: "Bio",
        tagline: null,
        prompts: [
          { id: "p1", prompt: "Prompt 1", answer: "Answer 1" },
          { id: "p2", prompt: "Prompt 2", answer: "Answer 2" },
          { id: "p3", prompt: "Prompt 3", answer: "Answer 3" },
        ],
        details: {
          job: "Bartender",
          school: null,
          height: "5'6\"",
          languages: ["English"],
        },
      },
      [personaSeed],
    );

    const request = generateTextMock.mock.calls.at(-1)?.[0];
    expect(request.system).toContain("appearance field as the primary source of truth");
    expect(request.prompt).toContain("<portrait-seeds>");
    expect(request.prompt).toContain(personaSeed.imagePrompt);
    expect(request.prompt).toContain("short curly hair");
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
      signalCategory: null,
      sideComment: null,
      nextSignal: null,
    });
  });

  it("defaults partial persona JSON replies to continue", () => {
    expect(parsePersonaReplyResponse('{"reply":"that is the most suspiciously confident soup pitch i have ever heard"}')).toEqual({
      reply: "that is the most suspiciously confident soup pitch i have ever heard",
      outcome: "CONTINUE",
      moodDelta: 0,
      signalCategory: null,
      sideComment: null,
      nextSignal: null,
    });
  });

  it("parses persona signal fields when present", () => {
    expect(
      parsePersonaReplyResponse('{"reply":"lol okay","outcome":"CONTINUE","moodDelta":7,"signalCategory":"be specific","sideComment":"okay that was actually kind of funny","nextSignal":"ask about something real"}'),
    ).toEqual({
      reply: "lol okay",
      outcome: "CONTINUE",
      moodDelta: 7,
      signalCategory: "be specific",
      sideComment: "okay that was actually kind of funny",
      nextSignal: "ask about something real",
    });
  });

  it("rejects persona replies with an empty message", () => {
    expect(parsePersonaReplyResponse('{"reply":"   ","outcome":"DATE_SEALED"}')).toBeNull();
  });
});

describe("deriveFallbackSignal", () => {
  it("returns compact guidance for neutral rounds", () => {
    expect(deriveFallbackSignal(0, 50, "CONTINUE")).toEqual({
      signalCategory: "meh",
      nextSignal: "say something that feels real for once",
    });
  });

  it("returns critical guidance when mood is low", () => {
    expect(deriveFallbackSignal(-12, 25, "CONTINUE")).toEqual({
      signalCategory: "danger zone",
      nextSignal: "last chance, make it count",
    });
  });
});
