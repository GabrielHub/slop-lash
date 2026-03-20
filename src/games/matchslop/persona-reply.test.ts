import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, realtimeMocks, sloplashLogicMocks, aiMocks, coreMocks } = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  realtimeMocks: {
    publishGameStateEvent: vi.fn(),
  },
  sloplashLogicMocks: {
    accumulateUsage: vi.fn(),
  },
  aiMocks: {
    generatePersonaReply: vi.fn(),
  },
  coreMocks: {
    parseModeState: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/realtime-events", () => realtimeMocks);
vi.mock("@/games/sloplash/game-logic-ai", () => sloplashLogicMocks);
vi.mock("./ai", () => aiMocks);
vi.mock("./game-logic-core", () => coreMocks);

import { ensurePersonaReply } from "./persona-reply";

describe("ensurePersonaReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    realtimeMocks.publishGameStateEvent.mockResolvedValue(undefined);
    sloplashLogicMocks.accumulateUsage.mockResolvedValue(undefined);
  });

  it("does not overwrite a reset next-round state when a stale background generation fails", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        version: 3,
        status: "ROUND_RESULTS",
        currentRound: 2,
        totalRounds: 5,
        personaModelId: "persona-model",
        modeState: { claimed: true },
      })
      .mockResolvedValueOnce({
        version: 4,
        modeState: { reset: true },
      });
    prismaMock.game.updateMany.mockResolvedValueOnce({ count: 1 });
    coreMocks.parseModeState
      .mockReturnValueOnce({
        profile: {
          displayName: "Riley",
        },
        lastRoundResult: {
          winnerText: "winning line",
          authorName: "Casey",
          selectedPromptText: null,
          selectedPromptId: null,
        },
        transcript: [],
        seekerIdentity: "WOMAN",
        personaIdentity: "MAN",
        mood: 50,
        pendingPersonaReply: {
          status: "NOT_REQUESTED",
          reply: null,
          outcome: null,
          moodDelta: null,
          generationId: null,
        },
      })
      .mockReturnValueOnce({
        pendingPersonaReply: {
          status: "NOT_REQUESTED",
          reply: null,
          outcome: null,
          moodDelta: null,
          generationId: null,
        },
      });
    aiMocks.generatePersonaReply.mockRejectedValue(new Error("generation failed"));

    await ensurePersonaReply("game-1");

    expect(prismaMock.game.updateMany).toHaveBeenCalledTimes(1);
    expect(realtimeMocks.publishGameStateEvent).toHaveBeenCalledTimes(1);
    expect(sloplashLogicMocks.accumulateUsage).not.toHaveBeenCalled();
  });
});
