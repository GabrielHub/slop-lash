import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, handlerMocks, publishMocks } = vi.hoisted(() => ({
  prismaMock: {
    game: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  handlerMocks: {
    advanceGame: vi.fn(),
    forceAdvancePhase: vi.fn(),
  },
  publishMocks: {
    publishGameStateEvent: vi.fn(),
    runAiResponsesGeneration: vi.fn(),
    runAiVotesGeneration: vi.fn(),
    runGameStateMaintenance: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      }),
  },
  after: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/games/registry", () => ({
  getGameDefinition: vi.fn(() => ({
    capabilities: { retainsCompletedData: false },
    constants: { hostStaleMs: 30_000 },
    handlers: handlerMocks,
  })),
}));
vi.mock("@/lib/host-control-auth", () => ({
  readHostAuth: vi.fn((body: { playerId?: unknown; hostToken?: unknown }) => ({
    playerId: typeof body.playerId === "string" ? body.playerId : null,
    hostToken: typeof body.hostToken === "string" ? body.hostToken : null,
  })),
  isAuthorizedHostControl: vi.fn(async () => true),
}));
vi.mock("@/games/core/observability", () => ({ logGameEvent: vi.fn() }));
vi.mock("@/lib/leaderboard-aggregate", () => ({
  applyCompletedGameToLeaderboardAggregate: vi.fn(),
}));
vi.mock("@/games/core/runtime", () => ({
  runAiResponsesGeneration: publishMocks.runAiResponsesGeneration,
  runAiVotesGeneration: publishMocks.runAiVotesGeneration,
  runGameStateMaintenance: publishMocks.runGameStateMaintenance,
}));
vi.mock("@/lib/realtime-events", () => ({
  publishGameStateEvent: publishMocks.publishGameStateEvent,
}));

import { POST } from "./next/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://test/api/games/ROOM/next", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

describe("/api/games/[code]/next", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishMocks.runAiResponsesGeneration.mockResolvedValue(false);
    publishMocks.runAiVotesGeneration.mockResolvedValue(false);
    publishMocks.runGameStateMaintenance.mockResolvedValue(false);
    publishMocks.publishGameStateEvent.mockResolvedValue(undefined);
  });

  it("does not clear the writing deadline before a failed forced advance", async () => {
    prismaMock.game.findUnique.mockResolvedValueOnce({
      id: "game-1",
      gameType: "MATCHSLOP",
      status: "WRITING",
      currentRound: 1,
      hostPlayerId: "host-1",
      hostControlTokenHash: null,
      hostControlLastSeen: null,
      players: [],
    });
    handlerMocks.forceAdvancePhase.mockResolvedValue(null);

    const res = await POST(
      jsonRequest({ playerId: "host-1" }),
      { params: Promise.resolve({ code: "ROOM" }) },
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(409);
    expect(body.error).toMatch(/could not advance/i);
    expect(prismaMock.game.update).not.toHaveBeenCalled();
  });

  it("returns a conflict when round-results next does not move the state machine", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        id: "game-1",
        gameType: "MATCHSLOP",
        status: "ROUND_RESULTS",
        currentRound: 2,
        hostPlayerId: "host-1",
        hostControlTokenHash: null,
        hostControlLastSeen: null,
        players: [],
      })
      .mockResolvedValueOnce({
        status: "ROUND_RESULTS",
        currentRound: 2,
      });
    handlerMocks.advanceGame.mockResolvedValue(null);

    const res = await POST(
      jsonRequest({ playerId: "host-1" }),
      { params: Promise.resolve({ code: "ROOM" }) },
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(409);
    expect(body.error).toMatch(/could not advance/i);
  });

  it("treats a finalized match as a successful round-results advance", async () => {
    prismaMock.game.findUnique.mockResolvedValueOnce({
      id: "game-1",
      gameType: "MATCHSLOP",
      status: "ROUND_RESULTS",
      currentRound: 2,
      hostPlayerId: "host-1",
      hostControlTokenHash: null,
      hostControlLastSeen: null,
      players: [],
    });
    handlerMocks.advanceGame.mockResolvedValue("FINAL_RESULTS");

    const res = await POST(
      jsonRequest({ playerId: "host-1" }),
      { params: Promise.resolve({ code: "ROOM" }) },
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(publishMocks.publishGameStateEvent).toHaveBeenCalledWith("game-1");
  });

  it("treats a concurrently started next round as a successful round-results advance", async () => {
    prismaMock.game.findUnique.mockResolvedValueOnce({
      id: "game-1",
      gameType: "MATCHSLOP",
      status: "ROUND_RESULTS",
      currentRound: 2,
      hostPlayerId: "host-1",
      hostControlTokenHash: null,
      hostControlLastSeen: null,
      players: [],
    });
    handlerMocks.advanceGame.mockResolvedValue("WRITING");

    const res = await POST(
      jsonRequest({ playerId: "host-1" }),
      { params: Promise.resolve({ code: "ROOM" }) },
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(publishMocks.publishGameStateEvent).toHaveBeenCalledWith("game-1");
  });

  it("treats an explicit forced writing advance as successful", async () => {
    prismaMock.game.findUnique.mockResolvedValueOnce({
      id: "game-1",
      gameType: "MATCHSLOP",
      status: "WRITING",
      currentRound: 1,
      hostPlayerId: "host-1",
      hostControlTokenHash: null,
      hostControlLastSeen: null,
      players: [],
    });
    handlerMocks.forceAdvancePhase.mockResolvedValue("VOTING");

    const res = await POST(
      jsonRequest({ playerId: "host-1" }),
      { params: Promise.resolve({ code: "ROOM" }) },
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(publishMocks.publishGameStateEvent).toHaveBeenCalledWith("game-1");
  });

  it("treats a concurrently forced writing advance as successful instead of returning a conflict", async () => {
    prismaMock.game.findUnique
      .mockResolvedValueOnce({
        id: "game-1",
        gameType: "MATCHSLOP",
        status: "WRITING",
        currentRound: 1,
        hostPlayerId: "host-1",
        hostControlTokenHash: null,
        hostControlLastSeen: null,
        players: [],
      })
      .mockResolvedValueOnce({
        status: "VOTING",
        currentRound: 1,
      });
    handlerMocks.forceAdvancePhase.mockResolvedValue(null);

    const res = await POST(
      jsonRequest({ playerId: "host-1" }),
      { params: Promise.resolve({ code: "ROOM" }) },
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(publishMocks.publishGameStateEvent).toHaveBeenCalledWith("game-1");
  });
});
