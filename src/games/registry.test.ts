import { describe, expect, it } from "vitest";

import type { GameType } from "@/games/core";
import { getAllGameTypes, getGameDefinition } from "@/games/registry";

describe("game registry", () => {
  it("resolves registered games and rejects unknown types", () => {
    expect(getGameDefinition("SLOPLASH").id).toBe("SLOPLASH");
    expect(getGameDefinition("AI_CHAT_SHOWDOWN").id).toBe("AI_CHAT_SHOWDOWN");
    expect(() => getGameDefinition("NOPE" as GameType)).toThrow(/unknown game type/i);
  });

  it("enumerates exactly the supported game types", () => {
    const types = getAllGameTypes().sort();
    expect(types).toEqual(["AI_CHAT_SHOWDOWN", "SLOPLASH"]);
    for (const type of types) {
      expect(() => getGameDefinition(type)).not.toThrow();
    }
  });

  it("exposes the full handler contract for every game", () => {
    const handlerNames = [
      "startGame",
      "endGameEarly",
      "advanceGame",
      "forceAdvancePhase",
      "checkAndEnforceDeadline",
      "checkAllResponsesIn",
      "startVoting",
      "getVotablePrompts",
      "checkAllVotesForCurrentPrompt",
      "revealCurrentPrompt",
      "generateAiResponses",
      "generateAiVotes",
      "promoteHost",
    ] as const;

    for (const type of getAllGameTypes()) {
      const handlers = getGameDefinition(type).handlers;
      for (const name of handlerNames) {
        expect(typeof handlers[name], `${type}.handlers.${name}`).toBe("function");
      }
    }
  });

  it("enforces capability and retention differences between game types", () => {
    const sloplash = getGameDefinition("SLOPLASH");
    expect(sloplash.capabilities).toMatchObject({
      supportsNarrator: true,
      supportsSfx: true,
      supportsChatFeed: false,
      supportsSpectators: true,
      retainsCompletedData: true,
    });
    expect(sloplash.constants.maxSpectators).toBeGreaterThan(0);
    expect(sloplash.displayName).toBe("Slop-Lash");

    const chatslop = getGameDefinition("AI_CHAT_SHOWDOWN");
    expect(chatslop.capabilities).toMatchObject({
      supportsNarrator: false,
      supportsSfx: false,
      supportsChatFeed: true,
      supportsSpectators: false,
      retainsCompletedData: false,
    });
    expect(chatslop.constants.maxSpectators).toBe(0);
    expect(chatslop.displayName).toBe("ChatSlop");
  });
});
