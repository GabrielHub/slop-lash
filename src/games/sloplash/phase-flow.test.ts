import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, aiMocks, votingLogicMocks } = vi.hoisted(() => ({
  prismaMock: {
    $executeRaw: vi.fn(),
    game: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    player: {
      findMany: vi.fn(),
    },
    reaction: {
      createMany: vi.fn(),
    },
    round: {
      findFirst: vi.fn(),
    },
    vote: {
      create: vi.fn(),
    },
  },
  aiMocks: {
    aiVote: vi.fn(),
    generateJoke: vi.fn(),
    FORFEIT_TEXT: "[forfeit]",
  },
  votingLogicMocks: {
    checkAllResponsesIn: vi.fn(),
    checkAllVotesForCurrentPrompt: vi.fn(),
    fillAbstainVotes: vi.fn(),
    getVotablePrompts: vi.fn(),
    revealCurrentPrompt: vi.fn(),
    startVoting: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("./ai", () => aiMocks);
vi.mock("./game-logic-rounds", () => ({ advanceGame: vi.fn() }));
vi.mock("./game-logic-voting", () => votingLogicMocks);

import { advanceToNextPrompt } from "./game-logic-deadlines-admin";
import { generateAiVotes } from "./game-logic-ai";

describe("Slop-Lash phase flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.game.update.mockResolvedValue({});
    prismaMock.game.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vote.create.mockResolvedValue({});
    prismaMock.reaction.createMany.mockResolvedValue({});
  });

  it("keeps the next prompt in the voting subphase even if AI already voted", async () => {
    prismaMock.game.findUnique.mockResolvedValue({
      status: "VOTING",
      votingPromptIndex: 0,
      votingRevealing: true,
      timersDisabled: false,
    });
    votingLogicMocks.getVotablePrompts.mockResolvedValue([
      { id: "prompt-1", responses: [], votes: [] },
      { id: "prompt-2", responses: [], votes: [{ id: "vote-1", voterId: "ai-1" }] },
    ]);

    const result = await advanceToNextPrompt("game-1");

    expect(result).toBe("VOTING_SUBPHASE");
    expect(prismaMock.game.updateMany).toHaveBeenCalledOnce();
    expect(votingLogicMocks.revealCurrentPrompt).not.toHaveBeenCalled();
  });

  it("does not auto-reveal the current prompt after AI votes finish", async () => {
    prismaMock.game.findUnique.mockResolvedValue({ votingPromptIndex: 0 });
    prismaMock.player.findMany.mockResolvedValue([
      { id: "human-1", type: "HUMAN", modelId: null, name: "A" },
      { id: "human-2", type: "HUMAN", modelId: null, name: "B" },
      { id: "ai-1", type: "AI", modelId: "gpt-test", name: "Bot" },
    ]);
    prismaMock.round.findFirst.mockResolvedValue({
      prompts: [{
        id: "prompt-1",
        text: "Bad mascot",
        responses: [
          { id: "response-1", playerId: "human-1", text: "Soup otter" },
          { id: "response-2", playerId: "human-2", text: "Tax ferret" },
        ],
      }],
    });
    aiMocks.aiVote.mockResolvedValue({
      choice: "A",
      reactionsA: [],
      reactionsB: [],
      usage: { modelId: null, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      failReason: null,
    });

    await generateAiVotes("game-1");

    expect(prismaMock.vote.create).toHaveBeenCalledOnce();
    expect(prismaMock.game.update).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: { version: { increment: 1 } },
    });
    expect(votingLogicMocks.checkAllVotesForCurrentPrompt).not.toHaveBeenCalled();
    expect(votingLogicMocks.revealCurrentPrompt).not.toHaveBeenCalled();
  });
});
