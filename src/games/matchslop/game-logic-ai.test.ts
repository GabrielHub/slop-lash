import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORFEIT_MARKER } from "@/games/core/constants";

const {
  prismaMock,
  aiMocks,
  coreMocks,
  votingLogicMocks,
  sloplashLogicMocks,
} = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    player: {
      findMany: vi.fn(),
    },
    round: {
      findFirst: vi.fn(),
    },
    response: {
      create: vi.fn(),
    },
    vote: {
      create: vi.fn(),
    },
  },
  aiMocks: {
    generateAiFollowup: vi.fn(),
    generateAiFunnyVote: vi.fn(),
    generateAiOpener: vi.fn(),
  },
  coreMocks: {
    buildVoteContext: vi.fn(),
    parseModeState: vi.fn(),
    selectPlayerExamples: vi.fn(),
  },
  votingLogicMocks: {
    checkAllResponsesIn: vi.fn(),
    checkAllVotesForCurrentPrompt: vi.fn(),
    revealCurrentPrompt: vi.fn(),
    startVoting: vi.fn(),
  },
  sloplashLogicMocks: {
    accumulateUsage: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/prisma-errors", () => ({
  hasPrismaErrorCode: vi.fn(() => false),
}));
vi.mock("./ai", () => aiMocks);
vi.mock("./game-logic-core", () => coreMocks);
vi.mock("./game-logic-voting", () => votingLogicMocks);
vi.mock("@/games/sloplash/game-logic-ai", () => sloplashLogicMocks);

import { generateAiResponses, generateAiVotes } from "./game-logic-ai";

describe("MatchSlop AI phase flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    prismaMock.response.create.mockResolvedValue({});
    prismaMock.vote.create.mockResolvedValue({});
    prismaMock.game.update.mockResolvedValue({});
    sloplashLogicMocks.accumulateUsage.mockResolvedValue(undefined);
    coreMocks.selectPlayerExamples.mockReturnValue(["example"]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("forfeits a timed-out AI response and still attempts to auto-advance", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        status: "WRITING",
        currentRound: 1,
        modeState: { profile: true },
      })
      .mockResolvedValueOnce({
        status: "WRITING",
        currentRound: 1,
      });
    prismaMock.player.findMany.mockResolvedValue([
      { id: "ai-1", type: "AI", modelId: "openai/test" },
    ]);
    prismaMock.round.findFirst.mockResolvedValue({
      roundNumber: 1,
      prompts: [
        {
          id: "prompt-1",
          text: "Write an opener",
          assignments: [{ playerId: "ai-1" }],
          responses: [],
        },
      ],
    });
    coreMocks.parseModeState.mockReturnValue({
      profile: {
        prompts: [{ id: "profile-1", prompt: "Most irrational fear" }],
      },
      selectedPlayerExamples: [],
      transcript: [],
    });
    coreMocks.buildVoteContext.mockReturnValue("context");
    aiMocks.generateAiOpener.mockImplementation(
      () => new Promise(() => undefined),
    );
    votingLogicMocks.checkAllResponsesIn.mockResolvedValue(true);
    votingLogicMocks.startVoting.mockResolvedValue(false);

    const task = generateAiResponses("game-1");
    await vi.advanceTimersByTimeAsync(20_000);
    await task;

    expect(prismaMock.response.create).toHaveBeenCalledWith({
      data: {
        promptId: "prompt-1",
        playerId: "ai-1",
        text: FORFEIT_MARKER,
        metadata: {
          selectedPromptId: "profile-1",
          selectedPromptText: "Most irrational fear",
        },
        failReason: "timeout",
      },
    });
    expect(votingLogicMocks.checkAllResponsesIn).toHaveBeenCalledWith("game-1");
    expect(votingLogicMocks.startVoting).toHaveBeenCalledWith("game-1");
  });

  it("records an abstain when an AI vote crashes so voting can keep moving", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        status: "VOTING",
        currentRound: 2,
        votingRevealing: false,
        modeState: { profile: true },
      })
      .mockResolvedValueOnce({
        status: "VOTING",
        currentRound: 2,
        votingRevealing: false,
      });
    prismaMock.player.findMany.mockResolvedValue([
      { id: "human-1", type: "HUMAN", modelId: null },
      { id: "human-2", type: "HUMAN", modelId: null },
      { id: "ai-1", type: "AI", modelId: "openai/test" },
    ]);
    prismaMock.round.findFirst.mockResolvedValue({
      roundNumber: 2,
      prompts: [
        {
          id: "prompt-1",
          text: "Best follow-up",
          responses: [
            { id: "response-1", playerId: "human-1", text: "A" },
            { id: "response-2", playerId: "human-2", text: "B" },
          ],
          votes: [],
        },
      ],
    });
    coreMocks.parseModeState.mockReturnValue({
      profile: { prompts: [] },
      selectedPlayerExamples: [],
      transcript: [],
    });
    coreMocks.buildVoteContext.mockReturnValue("context");
    aiMocks.generateAiFunnyVote.mockRejectedValue(new Error("boom"));
    votingLogicMocks.checkAllVotesForCurrentPrompt.mockResolvedValue(true);
    votingLogicMocks.revealCurrentPrompt.mockResolvedValue(true);

    await generateAiVotes("game-1");

    expect(prismaMock.vote.create).toHaveBeenCalledWith({
      data: {
        promptId: "prompt-1",
        voterId: "ai-1",
        responseId: null,
        failReason: "error",
      },
    });
    expect(votingLogicMocks.checkAllVotesForCurrentPrompt).toHaveBeenCalledWith("game-1");
    expect(votingLogicMocks.revealCurrentPrompt).toHaveBeenCalledWith("game-1");
  });
});
