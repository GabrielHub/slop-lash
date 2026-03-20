import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, coreMocks } = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
    },
    round: {
      findFirst: vi.fn(),
    },
    vote: {
      createMany: vi.fn(),
    },
  },
  coreMocks: {
    getActivePlayerIds: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("./game-logic-core", async () => {
  const actual =
    await vi.importActual<typeof import("./game-logic-core")>("./game-logic-core");
  return {
    ...actual,
    getActivePlayerIds: coreMocks.getActivePlayerIds,
  };
});

import {
  checkAllVotesForCurrentPrompt,
  fillAbstainVotes,
} from "./game-logic-voting";

describe("Slop-Lash voting quorum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores disconnected eligible voters when checking reveal quorum", async () => {
    prismaMock.game.findUnique.mockResolvedValue({
      status: "VOTING",
      votingPromptIndex: 0,
    });
    prismaMock.round.findFirst.mockResolvedValue({
      prompts: [
        {
          id: "prompt-1",
          responses: [
            { id: "response-1", playerId: "author-1", text: "joke 1" },
            { id: "response-2", playerId: "author-2", text: "joke 2" },
          ],
          votes: [{ id: "vote-1", voterId: "active-voter" }],
        },
      ],
    });
    coreMocks.getActivePlayerIds.mockResolvedValue([
      "author-1",
      "author-2",
      "active-voter",
    ]);

    await expect(checkAllVotesForCurrentPrompt("game-1")).resolves.toBe(true);
  });

  it("only records abstain votes for active eligible voters", async () => {
    prismaMock.game.findUnique.mockResolvedValue({
      status: "VOTING",
      votingPromptIndex: 0,
    });
    prismaMock.round.findFirst.mockResolvedValue({
      prompts: [
        {
          id: "prompt-1",
          responses: [
            { id: "response-1", playerId: "author-1", text: "joke 1" },
            { id: "response-2", playerId: "author-2", text: "joke 2" },
          ],
          votes: [{ id: "vote-1", voterId: "active-voter" }],
        },
      ],
    });
    coreMocks.getActivePlayerIds.mockResolvedValue([
      "author-1",
      "author-2",
      "active-voter",
      "missing-active-voter",
    ]);
    prismaMock.vote.createMany.mockResolvedValue({ count: 1 });

    await fillAbstainVotes("game-1");

    expect(prismaMock.vote.createMany).toHaveBeenCalledWith({
      data: [
        {
          promptId: "prompt-1",
          voterId: "missing-active-voter",
        },
      ],
      skipDuplicates: true,
    });
  });
});
