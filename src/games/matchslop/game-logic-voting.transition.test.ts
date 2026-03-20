import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, coreMocks } = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    round: {
      findFirst: vi.fn(),
    },
    player: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    response: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  txMock: {
    game: {
      update: vi.fn(),
    },
    player: {
      update: vi.fn(),
    },
    response: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
  coreMocks: {
    buildResultsDeadline: vi.fn(),
    buildVotingDeadline: vi.fn(),
    getActivePlayerIds: vi.fn(),
    isComebackRound: vi.fn(),
    parseModeState: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("./game-logic-core", () => coreMocks);

import { calculateRoundScores } from "./game-logic-voting";

describe("calculateRoundScores transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    );
    txMock.game.update.mockResolvedValue({});
    txMock.player.update.mockResolvedValue({});
    txMock.response.updateMany.mockResolvedValue({});
    txMock.response.update.mockResolvedValue({});
    prismaMock.game.update.mockResolvedValue({});
    coreMocks.buildResultsDeadline.mockReturnValue(new Date("2026-03-20T05:00:00.000Z"));
    coreMocks.parseModeState.mockReturnValue({
      aiVoteWeight: 1,
      humanVoteWeight: 2,
    });
    coreMocks.isComebackRound.mockReturnValue(false);
  });

  it("clears votingRevealing when publishing round results", async () => {
    prismaMock.game.findUnique.mockResolvedValue({
      status: "VOTING",
      timersDisabled: false,
      modeState: {},
      currentRound: 1,
    });
    prismaMock.round.findFirst.mockResolvedValue({
      prompts: [
        {
          id: "prompt-1",
          responses: [
            {
              id: "resp-1",
              playerId: "player-1",
              text: "winning line",
              metadata: null,
              player: { name: "Gemini" },
            },
            {
              id: "resp-2",
              playerId: "player-2",
              text: "runner-up",
              metadata: null,
              player: { name: "GPT" },
            },
          ],
          votes: [
            { responseId: "resp-1", voter: { id: "human-1", type: "HUMAN" } },
          ],
        },
      ],
    });
    prismaMock.player.findMany.mockResolvedValue([
      { id: "human-1", type: "HUMAN" },
      { id: "player-1", type: "AI" },
      { id: "player-2", type: "AI" },
    ]);

    await calculateRoundScores("game-1");

    expect(txMock.game.update).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: expect.objectContaining({
        status: "ROUND_RESULTS",
        votingRevealing: false,
        phaseDeadline: new Date("2026-03-20T05:00:00.000Z"),
      }),
    });
  });

  it("clears votingRevealing when ending the game without a winner", async () => {
    prismaMock.game.findUnique.mockResolvedValue({
      status: "VOTING",
      timersDisabled: false,
      modeState: {},
      currentRound: 1,
    });
    prismaMock.round.findFirst.mockResolvedValue({
      prompts: [
        {
          id: "prompt-1",
          responses: [
            {
              id: "resp-1",
              playerId: "player-1",
              text: "line one",
              metadata: null,
              player: { name: "Gemini" },
            },
            {
              id: "resp-2",
              playerId: "player-2",
              text: "line two",
              metadata: null,
              player: { name: "GPT" },
            },
          ],
          votes: [],
        },
      ],
    });
    prismaMock.player.findMany.mockResolvedValue([
      { id: "player-1", type: "AI" },
      { id: "player-2", type: "AI" },
    ]);

    await calculateRoundScores("game-1");

    expect(prismaMock.game.update).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: expect.objectContaining({
        status: "FINAL_RESULTS",
        votingRevealing: false,
        phaseDeadline: null,
      }),
    });
  });
});
