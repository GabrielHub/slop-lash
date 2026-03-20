import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const handlers = {
    startGame: vi.fn(),
    endGameEarly: vi.fn(),
    advanceGame: vi.fn(),
    forceAdvancePhase: vi.fn(),
    checkAndEnforceDeadline: vi.fn(),
    checkAllResponsesIn: vi.fn(),
    startVoting: vi.fn(),
    getVotablePrompts: vi.fn(),
    checkAllVotesForCurrentPrompt: vi.fn(),
    revealCurrentPrompt: vi.fn(),
    generateAiResponses: vi.fn(),
    generateAiVotes: vi.fn(),
    promoteHost: vi.fn(),
  };

  return {
    prismaMock: {
      game: {
        findUnique: vi.fn(),
      },
    },
    registryMock: {
      getGameDefinition: vi.fn(() => ({
        id: "SLOPLASH",
        displayName: "Slop-Lash",
        capabilities: {
          supportsNarrator: false,
          supportsSfx: false,
          supportsChatFeed: false,
          supportsSpectators: false,
          retainsCompletedData: false,
        },
        handlers,
        constants: {
          minPlayers: 2,
          maxPlayers: 8,
          maxSpectators: 0,
          hostStaleMs: 60_000,
        },
      })),
    },
    handlers,
    realtimeMock: {
      publishGameStateEvent: vi.fn(),
    },
    leaderboardMock: {
      applyCompletedGameToLeaderboardAggregate: vi.fn(),
    },
    cacheMock: {
      revalidateTag: vi.fn(),
    },
    lockMock: {
      withGameOperationLock: vi.fn(),
    },
    winnerTaglineMock: {
      ensureWinnerTagline: vi.fn(),
    },
    postMortemMock: {
      ensurePersonaPostMortem: vi.fn(),
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: hoisted.prismaMock }));
vi.mock("@/games/registry", () => hoisted.registryMock);
vi.mock("@/lib/realtime-events", () => hoisted.realtimeMock);
vi.mock("@/lib/leaderboard-aggregate", () => hoisted.leaderboardMock);
vi.mock("next/cache", () => hoisted.cacheMock);
vi.mock("@/lib/game-operation-lock", () => hoisted.lockMock);
vi.mock("@/games/sloplash/winner-tagline", () => hoisted.winnerTaglineMock);
vi.mock("@/games/matchslop/persona-post-mortem", () => hoisted.postMortemMock);

import { runAiResponsesGeneration, runGameStateMaintenance } from "./runtime";

describe("game runtime maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.winnerTaglineMock.ensureWinnerTagline.mockResolvedValue(false);
    hoisted.postMortemMock.ensurePersonaPostMortem.mockResolvedValue(undefined);
    hoisted.lockMock.withGameOperationLock.mockImplementation(
      async (_gameId: string, _scope: string, operation: () => Promise<unknown>) => ({
        acquired: true,
        result: await operation(),
      }),
    );
  });

  it("advances writing to voting through the shared maintenance path and publishes around AI votes", async () => {
    hoisted.prismaMock.game.findUnique.mockResolvedValue({
      id: "game-1",
      gameType: "SLOPLASH",
      status: "WRITING",
      phaseDeadline: null,
      votingRevealing: false,
    });
    hoisted.handlers.checkAllResponsesIn.mockResolvedValue(true);
    hoisted.handlers.startVoting.mockResolvedValue(true);

    const changed = await runGameStateMaintenance("game-1", "SLOPLASH");

    expect(changed).toBe(true);
    expect(hoisted.handlers.startVoting).toHaveBeenCalledWith("game-1");
    expect(hoisted.handlers.generateAiVotes).toHaveBeenCalledWith("game-1");
    expect(hoisted.realtimeMock.publishGameStateEvent).toHaveBeenCalledTimes(2);
  });

  it("reveals completed voting through the shared maintenance path without scheduling AI", async () => {
    hoisted.prismaMock.game.findUnique.mockResolvedValue({
      id: "game-2",
      gameType: "SLOPLASH",
      status: "VOTING",
      phaseDeadline: null,
      votingRevealing: false,
    });
    hoisted.handlers.checkAllVotesForCurrentPrompt.mockResolvedValue(true);
    hoisted.handlers.revealCurrentPrompt.mockResolvedValue(true);

    const changed = await runGameStateMaintenance("game-2", "SLOPLASH");

    expect(changed).toBe(true);
    expect(hoisted.handlers.revealCurrentPrompt).toHaveBeenCalledWith("game-2");
    expect(hoisted.handlers.generateAiVotes).not.toHaveBeenCalled();
    expect(hoisted.realtimeMock.publishGameStateEvent).toHaveBeenCalledTimes(1);
  });

  it("applies leaderboard finalization when deadline maintenance reaches final results", async () => {
    hoisted.registryMock.getGameDefinition.mockReturnValue({
      id: "SLOPLASH",
      displayName: "Slop-Lash",
      capabilities: {
        supportsNarrator: false,
        supportsSfx: false,
        supportsChatFeed: false,
        supportsSpectators: false,
        retainsCompletedData: true,
      },
      handlers: hoisted.handlers,
      constants: {
        minPlayers: 2,
        maxPlayers: 8,
        maxSpectators: 0,
        hostStaleMs: 60_000,
      },
    });
    hoisted.prismaMock.game.findUnique.mockResolvedValue({
      id: "game-3",
      gameType: "SLOPLASH",
      status: "ROUND_RESULTS",
      phaseDeadline: new Date(Date.now() - 1_000),
      votingRevealing: false,
    });
    hoisted.handlers.checkAndEnforceDeadline.mockResolvedValue("FINAL_RESULTS");

    const changed = await runGameStateMaintenance("game-3", "SLOPLASH");

    expect(changed).toBe(true);
    expect(hoisted.leaderboardMock.applyCompletedGameToLeaderboardAggregate).toHaveBeenCalledWith("game-3");
    expect(hoisted.cacheMock.revalidateTag).toHaveBeenCalled();
  });

  it("skips AI response work when another worker already holds the distributed lock", async () => {
    hoisted.lockMock.withGameOperationLock.mockResolvedValue({ acquired: false });

    const ran = await runAiResponsesGeneration("game-4", "SLOPLASH");

    expect(ran).toBe(false);
    expect(hoisted.handlers.generateAiResponses).not.toHaveBeenCalled();
  });

  it("maintains sloplash winner taglines through the shared runtime path", async () => {
    hoisted.prismaMock.game.findUnique.mockResolvedValue({
      id: "game-5",
      gameType: "SLOPLASH",
      status: "ROUND_RESULTS",
      phaseDeadline: null,
      votingRevealing: false,
    });
    hoisted.winnerTaglineMock.ensureWinnerTagline.mockResolvedValue(true);

    const changed = await runGameStateMaintenance("game-5", "SLOPLASH");

    expect(changed).toBe(true);
    expect(hoisted.winnerTaglineMock.ensureWinnerTagline).toHaveBeenCalledWith("game-5");
  });

  it("maintains matchslop post-mortems through the shared runtime path", async () => {
    hoisted.prismaMock.game.findUnique.mockResolvedValue({
      id: "game-6",
      gameType: "MATCHSLOP",
      status: "FINAL_RESULTS",
      phaseDeadline: null,
      votingRevealing: false,
    });

    const changed = await runGameStateMaintenance("game-6", "MATCHSLOP");

    expect(changed).toBe(false);
    expect(hoisted.postMortemMock.ensurePersonaPostMortem).toHaveBeenCalledWith("game-6");
  });
});
