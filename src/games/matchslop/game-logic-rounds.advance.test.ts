import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, aiMocks, coreMocks, sloplashLogicMocks } = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    round: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  txMock: {
    game: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    round: {
      create: vi.fn(),
    },
  },
  aiMocks: {
    generatePersonaReply: vi.fn(),
    deriveFallbackSignal: vi.fn(() => ({
      signalCategory: "fallback",
      nextSignal: "fallback guidance",
    })),
  },
  coreMocks: {
    buildResultsDeadline: vi.fn(),
    buildRoundPromptText: vi.fn(),
    buildWritingDeadline: vi.fn(),
    createInitialPendingPersonaReply: vi.fn(() => ({
      status: "NOT_REQUESTED",
      reply: null,
      outcome: null,
      moodDelta: null,
      generationId: null,
      signalCategory: null,
      sideComment: null,
      nextSignal: null,
    })),
    getActivePlayerIds: vi.fn(),
    isComebackRound: vi.fn(),
    parseModeState: vi.fn(),
    resolvePersonaExamples: vi.fn(),
    selectPersonaExamples: vi.fn(),
    selectPlayerExamples: vi.fn(),
  },
  sloplashLogicMocks: {
    accumulateUsage: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/games/sloplash/game-logic-ai", () => sloplashLogicMocks);
vi.mock("./ai", () => aiMocks);
vi.mock("./game-logic-core", () => coreMocks);

import { advanceGame, startGame } from "./game-logic-rounds";

describe("advanceGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    );
    prismaMock.game.update.mockResolvedValue({});
    prismaMock.round.create.mockResolvedValue({});
    txMock.game.update.mockResolvedValue({});
    txMock.round.create.mockResolvedValue({});
    sloplashLogicMocks.accumulateUsage.mockResolvedValue(undefined);
    coreMocks.buildResultsDeadline.mockReturnValue(new Date("2026-03-19T12:00:00.000Z"));
    coreMocks.buildWritingDeadline.mockReturnValue(new Date("2026-03-19T12:01:00.000Z"));
    coreMocks.getActivePlayerIds.mockResolvedValue(["human-1", "ai-1"]);
    coreMocks.isComebackRound.mockReturnValue(false);
  });

  it("claims the round before generating the persona reply", async () => {
    prismaMock.game.findUnique.mockResolvedValue({
      status: "ROUND_RESULTS",
      currentRound: 2,
      totalRounds: 5,
      personaModelId: "persona-model",
      timersDisabled: false,
      votingRevealing: false,
      modeState: { ok: true },
      version: 7,
    });
    coreMocks.parseModeState.mockReturnValue({
      transcript: [],
      lastRoundResult: {
        winnerText: "winning line",
        authorName: "Casey",
        selectedPromptId: null,
        selectedPromptText: null,
      },
      profile: {
        displayName: "Riley",
      },
      seekerIdentity: "WOMAN",
      personaIdentity: "MAN",
      comebackRound: null,
      mood: 50,
    });
    prismaMock.game.updateMany.mockResolvedValue({ count: 0 });

    const advanced = await advanceGame("game-1");

    expect(advanced).toBe(false);
    expect(prismaMock.game.updateMany).toHaveBeenCalledWith({
      where: {
        id: "game-1",
        status: "ROUND_RESULTS",
        votingRevealing: false,
        version: 7,
      },
      data: {
        votingRevealing: true,
        phaseDeadline: null,
        version: 8,
      },
    });
    expect(aiMocks.generatePersonaReply).not.toHaveBeenCalled();
    expect(sloplashLogicMocks.accumulateUsage).not.toHaveBeenCalled();
  });

  it("creates the next round and publishes the transcript in one transaction", async () => {
    prismaMock.game.findUnique.mockResolvedValue({
      status: "ROUND_RESULTS",
      currentRound: 2,
      totalRounds: 5,
      personaModelId: "persona-model",
      timersDisabled: false,
      votingRevealing: false,
      modeState: { ok: true },
      version: 11,
    });
    coreMocks.parseModeState.mockReturnValue({
      transcript: [
        {
          id: "persona-turn-1",
          speaker: "PERSONA",
          text: "earlier reply",
          turn: 1,
          outcome: "CONTINUE",
          authorName: "Riley",
        },
      ],
      lastRoundResult: {
        winnerText: "winning line",
        authorName: "Casey",
        selectedPromptId: null,
        selectedPromptText: null,
      },
      profile: {
        displayName: "Riley",
      },
      seekerIdentity: "WOMAN",
      personaIdentity: "MAN",
      comebackRound: null,
      mood: 50,
      pendingPersonaReply: {
        status: "NOT_REQUESTED",
        reply: null,
        outcome: null,
        moodDelta: null,
        generationId: null,
      },
    });
    prismaMock.game.updateMany.mockResolvedValue({ count: 1 });
    aiMocks.generatePersonaReply.mockResolvedValue({
      reply: "persona follow-up",
      outcome: "CONTINUE",
      moodDelta: 5,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        modelId: "persona-model",
      },
    });
    txMock.game.findUnique.mockResolvedValue({
      status: "ROUND_RESULTS",
      votingRevealing: true,
    });

    const advanced = await advanceGame("game-1");

    expect(advanced).toBe(true);
    expect(aiMocks.generatePersonaReply).toHaveBeenCalledTimes(1);
    expect(prismaMock.game.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.round.create).toHaveBeenCalledWith({
      data: {
        gameId: "game-1",
        roundNumber: 3,
        prompts: {
          create: [
            {
              text: "persona follow-up",
              assignments: {
                create: [{ playerId: "human-1" }, { playerId: "ai-1" }],
              },
            },
          ],
        },
      },
    });
    expect(txMock.game.update).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: {
        currentRound: 3,
        status: "WRITING",
        votingPromptIndex: 0,
        votingRevealing: false,
        phaseDeadline: new Date("2026-03-19T12:01:00.000Z"),
        modeState: {
          transcript: [
            {
              id: "persona-turn-1",
              speaker: "PERSONA",
              text: "earlier reply",
              turn: 1,
              outcome: "CONTINUE",
              authorName: "Riley",
            },
            {
              id: "players-turn-2",
              speaker: "PLAYERS",
              text: "winning line",
              turn: 2,
              outcome: null,
              authorName: "Casey",
              selectedPromptText: null,
              selectedPromptId: null,
            },
            {
              id: "persona-turn-2",
              speaker: "PERSONA",
              text: "persona follow-up",
              turn: 2,
              outcome: "CONTINUE",
              authorName: "Riley",
              mood: 55,
            },
          ],
          lastRoundResult: null,
          outcome: "IN_PROGRESS",
          comebackRound: null,
          mood: 55,
          profile: {
            displayName: "Riley",
          },
          seekerIdentity: "WOMAN",
          personaIdentity: "MAN",
          pendingPersonaReply: {
            status: "NOT_REQUESTED",
            reply: null,
            outcome: null,
            moodDelta: null,
            generationId: null,
            signalCategory: null,
            sideComment: null,
            nextSignal: null,
          },
          latestSignalCategory: "fallback",
          latestSideComment: undefined,
          latestNextSignal: "fallback guidance",
          latestMoodDelta: 5,
        },
        version: { increment: 1 },
      },
    });
  });

  it("uses comeback-safe fallback guidance when an unmatch becomes a comeback round", async () => {
    prismaMock.game.findUnique.mockResolvedValue({
      status: "ROUND_RESULTS",
      currentRound: 2,
      totalRounds: 5,
      personaModelId: "persona-model",
      timersDisabled: false,
      votingRevealing: false,
      modeState: { ok: true },
      version: 21,
    });
    coreMocks.parseModeState.mockReturnValue({
      transcript: [],
      lastRoundResult: {
        winnerText: "winning line",
        authorName: "Casey",
        selectedPromptId: null,
        selectedPromptText: null,
      },
      profile: {
        displayName: "Riley",
      },
      seekerIdentity: "WOMAN",
      personaIdentity: "MAN",
      comebackRound: null,
      mood: 35,
      pendingPersonaReply: {
        status: "NOT_REQUESTED",
        reply: null,
        outcome: null,
        moodDelta: null,
        generationId: null,
        signalCategory: null,
        sideComment: null,
        nextSignal: null,
      },
    });
    prismaMock.game.updateMany.mockResolvedValue({ count: 1 });
    aiMocks.generatePersonaReply.mockResolvedValue({
      reply: "yeah no",
      outcome: "UNMATCHED",
      moodDelta: -15,
      signalCategory: null,
      sideComment: null,
      nextSignal: null,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        modelId: "persona-model",
      },
    });
    txMock.game.findUnique.mockResolvedValue({
      status: "ROUND_RESULTS",
      votingRevealing: true,
    });

    const advanced = await advanceGame("game-1");

    expect(advanced).toBe(true);
    expect(txMock.game.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modeState: expect.objectContaining({
            comebackRound: 3,
            latestSignalCategory: "danger zone",
            latestNextSignal: "last chance, make it count",
          }),
        }),
      }),
    );
  });

  it("resets pending persona reply state when starting a new game", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        personaModelId: "persona-model",
        modeState: { seeded: true },
        totalRounds: 0,
      })
      .mockResolvedValueOnce({
        modeState: { refreshed: true },
      })
      .mockResolvedValueOnce({
        timersDisabled: false,
        modeState: { round: true },
      });
    coreMocks.parseModeState
      .mockReturnValueOnce({
        selectedPersonaExampleIds: [],
        personaIdentity: "MAN",
        selectedPlayerExamples: [],
        profileGeneration: {
          status: "NOT_REQUESTED",
        },
        pendingPersonaReply: {
          status: "READY",
          reply: "old reply",
          outcome: "CONTINUE",
          moodDelta: 3,
          generationId: "gen-old",
        },
        transcript: [{ id: "persona-turn-2", speaker: "PERSONA", text: "old reply" }],
        lastRoundResult: { winnerText: "old winner" },
        comebackRound: 3,
        outcome: "COMEBACK",
      })
      .mockReturnValueOnce({
        profile: null,
        profileGeneration: {
          status: "NOT_REQUESTED",
        },
      })
      .mockReturnValueOnce({
        profile: { displayName: "Riley" },
        transcript: [],
      });
    coreMocks.selectPersonaExamples.mockReturnValue([{ id: "persona-seed-1" }]);
    coreMocks.selectPlayerExamples.mockReturnValue(["player-example"]);
    coreMocks.getActivePlayerIds.mockResolvedValue(["human-1", "ai-1"]);
    coreMocks.buildRoundPromptText.mockReturnValue("opening prompt");

    await startGame("game-1", 1);

    expect(prismaMock.game.update).toHaveBeenNthCalledWith(1, {
      where: { id: "game-1" },
      data: {
        totalRounds: 5,
        modeState: {
          selectedPersonaExampleIds: ["persona-seed-1"],
          personaIdentity: "MAN",
          selectedPlayerExamples: ["player-example"],
          profileDraft: null,
          profileGeneration: {
            status: "NOT_REQUESTED",
            updatedAt: expect.any(String),
            generationId: null,
          },
          profile: null,
          personaImage: {
            status: "NOT_REQUESTED",
            imageUrl: null,
            updatedAt: expect.any(String),
          },
          transcript: [],
          lastRoundResult: null,
          comebackRound: null,
          outcome: "IN_PROGRESS",
          pendingPersonaReply: {
            status: "NOT_REQUESTED",
            reply: null,
            outcome: null,
            moodDelta: null,
            generationId: null,
            signalCategory: null,
            sideComment: null,
            nextSignal: null,
          },
          latestSignalCategory: null,
          latestSideComment: null,
          latestNextSignal: null,
          latestMoodDelta: null,
        },
        version: { increment: 1 },
      },
    });
  });
});
