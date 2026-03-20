import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, aiMocks, coreMocks, sloplashLogicMocks } = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
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
  },
  coreMocks: {
    buildResultsDeadline: vi.fn(),
    buildRoundPromptText: vi.fn(),
    buildWritingDeadline: vi.fn(),
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

import { advanceGame } from "./game-logic-rounds";

describe("advanceGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    );
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
    });
    prismaMock.game.updateMany.mockResolvedValue({ count: 1 });
    aiMocks.generatePersonaReply.mockResolvedValue({
      reply: "persona follow-up",
      outcome: "CONTINUE",
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
            },
          ],
          lastRoundResult: null,
          outcome: "IN_PROGRESS",
          comebackRound: null,
          profile: {
            displayName: "Riley",
          },
          seekerIdentity: "WOMAN",
          personaIdentity: "MAN",
        },
        version: { increment: 1 },
      },
    });
  });
});
