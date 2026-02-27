/**
 * Integration tests for C2: route dispatch by gameType, spectator rejection,
 * no-abstain enforcement, and transient game deletion lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import resolution
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  prisma: {
    game: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    player: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    round: { findFirst: vi.fn() },
    prompt: { findMany: vi.fn() },
    response: { findFirst: vi.fn(), create: vi.fn() },
    vote: { findFirst: vi.fn(), create: vi.fn() },
    leaderboardProcessedGame: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

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

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn() },
  NoObjectGeneratedError: { isInstance: vi.fn(() => false) },
  createGateway: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

vi.mock("@/lib/leaderboard-aggregate", () => ({
  applyCompletedGameToLeaderboardAggregate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — resolved against the mocks above
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import { deleteTransientGameData, cleanupOldGames } from "@/games/core/cleanup";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { POST as joinPOST } from "@/app/api/games/[code]/join/route";
import { POST as votePOST } from "@/app/api/games/[code]/vote/route";
import { GET as controllerGET } from "@/app/api/games/[code]/controller/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Typed mock access — Prisma's deep generics defeat vi.mocked, so we cast to
// a flat structure that mirrors the mock factory above.
type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  game: { findUnique: Fn; findMany: Fn; update: Fn; updateMany: Fn; create: Fn; delete: Fn; deleteMany: Fn };
  player: { findFirst: Fn; findUnique: Fn; findMany: Fn; updateMany: Fn; count: Fn; create: Fn; createMany: Fn };
  round: { findFirst: Fn };
  prompt: { findMany: Fn };
  response: { findFirst: Fn; create: Fn };
  vote: { findFirst: Fn; create: Fn };
  leaderboardProcessedGame: { deleteMany: Fn };
  $transaction: Fn;
};

function jsonRequest(body: unknown): Request {
  return new Request("http://test/api/games/TEST/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeParams(code = "TEST") {
  return { params: Promise.resolve({ code }) };
}

async function readJson(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

// ===========================================================================
// 1. AI_CHAT_SHOWDOWN spectator rejection (join route)
// ===========================================================================

describe("AI_CHAT_SHOWDOWN spectator rejection (join route)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects spectator join for AI_CHAT_SHOWDOWN", async () => {
    db.game.findUnique.mockResolvedValue({
      id: "g1",
      gameType: "AI_CHAT_SHOWDOWN",
      status: "LOBBY",
      players: [],
    } as never);

    const res = await joinPOST(
      jsonRequest({ name: "Alice", spectator: true }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/spectators/i);
  });

  it("allows normal player join to AI_CHAT_SHOWDOWN", async () => {
    db.game.findUnique.mockResolvedValue({
      id: "g1",
      gameType: "AI_CHAT_SHOWDOWN",
      status: "LOBBY",
      players: [],
    } as never);

    db.$transaction.mockImplementation(async (fn: (...args: never[]) => unknown) =>
      fn({
        player: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "p1",
            name: "Alice",
            type: "HUMAN",
            rejoinToken: "tok",
          }),
        },
      } as never),
    );
    db.game.update.mockResolvedValue({} as never);

    const res = await joinPOST(
      jsonRequest({ name: "Alice" }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.playerType).toBe("HUMAN");
  });

  it("allows spectator join to SLOPLASH", async () => {
    db.game.findUnique.mockResolvedValue({
      id: "g2",
      gameType: "SLOPLASH",
      status: "LOBBY",
      players: [],
    } as never);

    db.$transaction.mockImplementation(async (fn: (...args: never[]) => unknown) =>
      fn({
        player: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "s1",
            name: "Alice",
            type: "SPECTATOR",
            rejoinToken: "tok",
          }),
        },
      } as never),
    );
    db.game.update.mockResolvedValue({} as never);

    const res = await joinPOST(
      jsonRequest({ name: "Alice", spectator: true }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.playerType).toBe("SPECTATOR");
  });
});

// ===========================================================================
// 2. No-abstain enforcement (vote route)
// ===========================================================================

describe("AI_CHAT_SHOWDOWN no-abstain enforcement (vote route)", () => {
  beforeEach(() => vi.clearAllMocks());

  /** Shared mock setup for a game in VOTING phase with one votable prompt. */
  function setupVotingGame(gameType: string) {
    db.game.findUnique.mockResolvedValue({
      id: "g1",
      gameType,
      status: "VOTING",
      votingPromptIndex: 0,
      votingRevealing: false,
    } as never);

    // getVotablePrompts internal prisma call (same shape for both game types)
    db.round.findFirst.mockResolvedValue({
      prompts: [
        {
          id: "prompt1",
          responses: [
            { id: "r1", playerId: "p1", text: "joke one" },
            { id: "r2", playerId: "p2", text: "joke two" },
          ],
          votes: [],
        },
      ],
    } as never);

    // voter lookup
    db.player.findFirst.mockResolvedValue({
      id: "voter1",
      type: "HUMAN",
    } as never);
  }

  it("rejects abstain vote for AI_CHAT_SHOWDOWN", async () => {
    setupVotingGame("AI_CHAT_SHOWDOWN");

    const res = await votePOST(
      jsonRequest({
        voterId: "voter1",
        promptId: "prompt1",
        responseId: null,
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/abstain/i);
  });

  it("rejects self-vote for AI_CHAT_SHOWDOWN", async () => {
    setupVotingGame("AI_CHAT_SHOWDOWN");

    // Override voter lookup: voter is p1 who owns response r1
    db.player.findFirst.mockResolvedValue({
      id: "p1",
      type: "HUMAN",
    } as never);

    // response-belongs-to-prompt check (top-level prisma)
    db.response.findFirst.mockResolvedValue({ id: "r1" } as never);

    // transaction: self-vote detection — p1 owns r1
    db.$transaction.mockImplementation(async (fn: (...args: never[]) => unknown) =>
      fn({
        response: {
          findFirst: vi.fn().mockResolvedValue({ id: "r1" }), // p1 owns r1
        },
        vote: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        game: { update: vi.fn() },
      } as never),
    );

    const res = await votePOST(
      jsonRequest({
        voterId: "p1",       // p1 is the owner of r1 — genuine self-vote
        promptId: "prompt1",
        responseId: "r1",
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/own response/i);
  });

  it("allows abstain for SLOPLASH", async () => {
    setupVotingGame("SLOPLASH");

    // SLOPLASH transaction path: check respondent, check duplicate, create vote
    db.$transaction.mockImplementation(async (fn: (...args: never[]) => unknown) =>
      fn({
        response: {
          findFirst: vi.fn().mockResolvedValue(null), // voter is not a respondent
        },
        vote: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        game: { update: vi.fn() },
      } as never),
    );

    const res = await votePOST(
      jsonRequest({
        voterId: "voter1",
        promptId: "prompt1",
        responseId: null,
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("rejects vote from respondent in SLOPLASH", async () => {
    setupVotingGame("SLOPLASH");

    // response-belongs-to-prompt check (top-level prisma)
    db.response.findFirst.mockResolvedValue({ id: "r2" } as never);

    // SLOPLASH transaction: voter IS a respondent for this prompt
    db.$transaction.mockImplementation(async (fn: (...args: never[]) => unknown) =>
      fn({
        response: {
          findFirst: vi.fn().mockResolvedValue({ id: "r-voter" }), // voter has a response
        },
        vote: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        game: { update: vi.fn() },
      } as never),
    );

    const res = await votePOST(
      jsonRequest({
        voterId: "voter1",
        promptId: "prompt1",
        responseId: "r2",
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/responded to/i);
  });

  it("allows valid (non-self) vote for AI_CHAT_SHOWDOWN", async () => {
    setupVotingGame("AI_CHAT_SHOWDOWN");

    // response-belongs-to-prompt check
    db.response.findFirst.mockResolvedValue({ id: "r2" } as never);

    // transaction: not a self-vote, no duplicate, create succeeds
    db.$transaction.mockImplementation(async (fn: (...args: never[]) => unknown) =>
      fn({
        response: {
          findFirst: vi.fn().mockResolvedValue(null), // voter does NOT own r2
        },
        vote: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        game: { update: vi.fn() },
      } as never),
    );

    const res = await votePOST(
      jsonRequest({
        voterId: "voter1",
        promptId: "prompt1",
        responseId: "r2", // belongs to p2, not voter1
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  // --- R2 edge-case tests ---

  it("rejects vote during reveal sub-phase", async () => {
    // votingRevealing=true should block votes before any other checks
    db.game.findUnique.mockResolvedValue({
      id: "g1",
      gameType: "AI_CHAT_SHOWDOWN",
      status: "VOTING",
      votingPromptIndex: 0,
      votingRevealing: true,
    } as never);

    const res = await votePOST(
      jsonRequest({
        voterId: "voter1",
        promptId: "prompt1",
        responseId: "r1",
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/paused during reveal/i);
  });

  it("rejects spectator vote", async () => {
    setupVotingGame("SLOPLASH");

    // Override voter lookup to return a spectator
    db.player.findFirst.mockResolvedValue({
      id: "spec1",
      type: "SPECTATOR",
    } as never);

    const res = await votePOST(
      jsonRequest({
        voterId: "spec1",
        promptId: "prompt1",
        responseId: "r1",
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(403);
    expect(body.error).toMatch(/spectators cannot vote/i);
  });

  it("rejects vote from disconnected player", async () => {
    setupVotingGame("AI_CHAT_SHOWDOWN");

    db.player.findFirst.mockResolvedValue({
      id: "voter1",
      type: "HUMAN",
      participationStatus: "DISCONNECTED",
    } as never);

    const res = await votePOST(
      jsonRequest({
        voterId: "voter1",
        promptId: "prompt1",
        responseId: "r1",
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(403);
    expect(body.error).toMatch(/disconnected players cannot vote/i);
  });

  it("rejects duplicate vote for AI_CHAT_SHOWDOWN", async () => {
    setupVotingGame("AI_CHAT_SHOWDOWN");

    // response-belongs-to-prompt check
    db.response.findFirst.mockResolvedValue({ id: "r2" } as never);

    // transaction: not a self-vote, but already voted on this prompt
    db.$transaction.mockImplementation(async (fn: (...args: never[]) => unknown) =>
      fn({
        response: {
          findFirst: vi.fn().mockResolvedValue(null), // not a self-vote
        },
        vote: {
          findFirst: vi.fn().mockResolvedValue({ id: "existing-vote" }), // already voted!
          create: vi.fn(),
        },
        game: { update: vi.fn() },
      } as never),
    );

    const res = await votePOST(
      jsonRequest({
        voterId: "voter1",
        promptId: "prompt1",
        responseId: "r2",
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/already voted/i);
  });

  it("rejects vote for response not belonging to current prompt", async () => {
    setupVotingGame("AI_CHAT_SHOWDOWN");

    // top-level response.findFirst returns null → response doesn't match prompt
    db.response.findFirst.mockResolvedValue(null);

    const res = await votePOST(
      jsonRequest({
        voterId: "voter1",
        promptId: "prompt1",
        responseId: "r-nonexistent",
      }),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/response does not belong/i);
  });
});

// ===========================================================================
// 3. Controller payload sanity for AI_CHAT_SHOWDOWN voting options
// ===========================================================================

describe("AI_CHAT_SHOWDOWN controller voting payload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all voting responses (not just first two)", async () => {
    db.game.findUnique
      .mockResolvedValueOnce({
        id: "g1",
        gameType: "AI_CHAT_SHOWDOWN",
        status: "VOTING",
        version: 7,
        phaseDeadline: null,
        hostPlayerId: "host1",
        hostControlLastSeen: null,
      } as never)
      .mockResolvedValueOnce({
        id: "g1",
        roomCode: "TEST",
        gameType: "AI_CHAT_SHOWDOWN",
        status: "VOTING",
        currentRound: 1,
        totalRounds: 3,
        hostPlayerId: "host1",
        phaseDeadline: null,
        timersDisabled: false,
        votingPromptIndex: 0,
        votingRevealing: false,
        nextGameCode: null,
        version: 7,
        players: [
          { id: "p1", name: "A", type: "HUMAN", participationStatus: "ACTIVE" },
          { id: "p2", name: "B", type: "HUMAN", participationStatus: "ACTIVE" },
          { id: "p3", name: "C", type: "HUMAN", participationStatus: "ACTIVE" },
          { id: "p4", name: "D", type: "HUMAN", participationStatus: "ACTIVE" },
        ],
        rounds: [
          {
            roundNumber: 1,
            prompts: [
              {
                id: "prompt1",
                text: "Prompt",
                assignments: [{ playerId: "p1" }, { playerId: "p2" }, { playerId: "p3" }, { playerId: "p4" }],
                responses: [
                  { id: "r1", playerId: "p1", text: "one" },
                  { id: "r2", playerId: "p2", text: "two" },
                  { id: "r3", playerId: "p3", text: "three" },
                  { id: "r4", playerId: "p4", text: "four" },
                ],
                votes: [],
              },
            ],
          },
        ],
      } as never);

    const res = await controllerGET(
      new Request("http://test/api/games/TEST/controller?playerId=p1"),
      routeParams(),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    const voting = body.voting as { currentPrompt: { responses: Array<{ id: string; text: string }> } };
    expect(voting.currentPrompt.responses.map((r) => r.id)).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
    ]);
  });
});

// ===========================================================================
// 4. Transient game deletion lifecycle (B8 behavior)
// ===========================================================================

describe("Transient game deletion lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes AI_CHAT_SHOWDOWN game in FINAL_RESULTS", async () => {
    db.game.findUnique.mockResolvedValue({
      gameType: "AI_CHAT_SHOWDOWN",
      status: "FINAL_RESULTS",
    } as never);
    db.game.delete.mockResolvedValue({} as never);

    expect(await deleteTransientGameData("g1")).toBe(true);
    expect(db.game.delete).toHaveBeenCalledWith({ where: { id: "g1" } });
  });

  it("preserves SLOPLASH data (retainsCompletedData = true)", async () => {
    db.game.findUnique.mockResolvedValue({
      gameType: "SLOPLASH",
      status: "FINAL_RESULTS",
    } as never);

    expect(await deleteTransientGameData("g2")).toBe(false);
    expect(db.game.delete).not.toHaveBeenCalled();
  });

  it("skips games not in FINAL_RESULTS", async () => {
    db.game.findUnique.mockResolvedValue({
      gameType: "AI_CHAT_SHOWDOWN",
      status: "VOTING",
    } as never);

    expect(await deleteTransientGameData("g3")).toBe(false);
    expect(db.game.delete).not.toHaveBeenCalled();
  });

  it("returns false for missing games", async () => {
    db.game.findUnique.mockResolvedValue(null);
    expect(await deleteTransientGameData("missing")).toBe(false);
    expect(db.game.delete).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. Cleanup: leaderboard exclusion for abandoned transient games (R2)
// ===========================================================================

describe("cleanupOldGames leaderboard exclusion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not apply leaderboard aggregate for abandoned AI_CHAT_SHOWDOWN games", async () => {
    // 1. findMany for abandoned active games → one AI_CHAT_SHOWDOWN game
    db.game.findMany
      .mockResolvedValueOnce([{ id: "abandoned-acs", gameType: "AI_CHAT_SHOWDOWN" }])
      // 2. findMany for old games (past 7-day retention)
      .mockResolvedValueOnce([])
      // 3. findMany for incomplete games (past 1-day retention)
      .mockResolvedValueOnce([]);

    // endGameEarly will call game.findUnique → return FINAL_RESULTS so it's a no-op
    db.game.findUnique.mockResolvedValue({ status: "FINAL_RESULTS" } as never);

    // transient completed deleteMany
    db.game.deleteMany.mockResolvedValue({ count: 0 } as never);

    // leaderboardProcessedGame.deleteMany (inside $transaction)
    db.leaderboardProcessedGame.deleteMany.mockResolvedValue({ count: 0 } as never);

    // $transaction for batch old+incomplete deletion
    db.$transaction.mockResolvedValue([{ count: 0 }, { count: 0 }, { count: 0 }] as never);

    const summary = await cleanupOldGames();

    // Key assertion: leaderboard aggregate should NOT be called for AI_CHAT_SHOWDOWN
    expect(applyCompletedGameToLeaderboardAggregate).not.toHaveBeenCalled();

    // Verify the abandoned game was counted
    expect(summary.autoFinalizedAbandonedActive).toBe(1);
    expect(summary.abandonedByGameType).toEqual({ AI_CHAT_SHOWDOWN: 1 });
  });
});
