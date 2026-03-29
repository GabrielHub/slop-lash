import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, roundLogicMocks, votingMocks, coreMocks } = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    round: {
      findFirst: vi.fn(),
    },
    response: {
      createMany: vi.fn(),
    },
    vote: {
      createMany: vi.fn(),
    },
    prompt: {
      findUnique: vi.fn(),
    },
    player: {
      findFirst: vi.fn(),
    },
  },
  roundLogicMocks: {
    advanceGame: vi.fn(),
  },
  votingMocks: {
    getVotablePrompts: vi.fn(),
    revealCurrentPrompt: vi.fn(),
    startVoting: vi.fn(),
  },
  coreMocks: {
    getActivePlayerIds: vi.fn(),
    parseModeState: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("./game-logic-rounds", () => roundLogicMocks);
vi.mock("./game-logic-voting", () => votingMocks);
vi.mock("./game-logic-core", () => coreMocks);

import { forceAdvancePhase } from "./game-logic-deadlines-admin";

describe("forceAdvancePhase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports final results when round-results advancement already completed elsewhere", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        status: "ROUND_RESULTS",
        votingRevealing: false,
        currentRound: 2,
        modeState: {},
      })
      .mockResolvedValueOnce({
        status: "FINAL_RESULTS",
        currentRound: 2,
      });
    roundLogicMocks.advanceGame.mockResolvedValue(false);

    await expect(forceAdvancePhase("game-1")).resolves.toBe("FINAL_RESULTS");
  });

  it("reports writing when round-results advancement already moved into the next round", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        status: "ROUND_RESULTS",
        votingRevealing: false,
        currentRound: 2,
        modeState: {},
      })
      .mockResolvedValueOnce({
        status: "WRITING",
        currentRound: 3,
      });
    roundLogicMocks.advanceGame.mockResolvedValue(false);

    await expect(forceAdvancePhase("game-1")).resolves.toBe("WRITING");
  });

  it("returns null when round-results advancement did not actually move state", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        status: "ROUND_RESULTS",
        votingRevealing: false,
        currentRound: 2,
        modeState: {},
      })
      .mockResolvedValueOnce({
        status: "ROUND_RESULTS",
        currentRound: 2,
      });
    roundLogicMocks.advanceGame.mockResolvedValue(false);

    await expect(forceAdvancePhase("game-1")).resolves.toBeNull();
  });
});
