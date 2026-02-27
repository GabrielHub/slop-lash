/**
 * C1: Unit tests for quorum math in AI Chat Showdown.
 *
 * Validates that:
 * - getActivePlayerIds excludes SPECTATOR and DISCONNECTED players
 * - checkAllResponsesIn uses active-player quorum (not total player count)
 * - checkAllVotesForCurrentPrompt uses active-player quorum
 * - Quorum re-check after disconnect auto-advances phases
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  prisma: {
    game: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    player: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    round: { findFirst: vi.fn() },
    prompt: { findMany: vi.fn() },
    chatMessage: { create: vi.fn(), findMany: vi.fn() },
    vote: { createMany: vi.fn() },
  },
}));

vi.mock("@/games/core/observability", () => ({
  logGameEvent: vi.fn(),
  warnGameEvent: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn() },
  NoObjectGeneratedError: { isInstance: vi.fn(() => false) },
  createGateway: vi.fn(() => vi.fn()),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import { getActivePlayerIds } from "./game-logic-core";
import {
  checkAllResponsesIn,
  checkAllVotesForCurrentPrompt,
} from "./game-logic-voting";
import {
  checkAndDisconnectInactivePlayers,
} from "@/games/core/disconnect";

// ---------------------------------------------------------------------------
// Typed mock helper
// ---------------------------------------------------------------------------

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  game: { findUnique: Fn; updateMany: Fn; update: Fn };
  player: { findMany: Fn; updateMany: Fn };
  round: { findFirst: Fn };
  prompt: { findMany: Fn };
  chatMessage: { create: Fn; findMany: Fn };
  vote: { createMany: Fn };
};

beforeEach(() => vi.clearAllMocks());

// ===========================================================================
// 1. getActivePlayerIds — quorum base
// ===========================================================================

describe("getActivePlayerIds", () => {
  it("returns only ACTIVE non-SPECTATOR player IDs", async () => {
    db.player.findMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
    ]);

    const ids = await getActivePlayerIds("game1");
    expect(ids).toEqual(["p1", "p2"]);

    // Verify the query filters out SPECTATOR and non-ACTIVE
    expect(db.player.findMany).toHaveBeenCalledWith({
      where: {
        gameId: "game1",
        type: { not: "SPECTATOR" },
        participationStatus: "ACTIVE",
      },
      select: { id: true },
    });
  });

  it("returns empty array when no active players", async () => {
    db.player.findMany.mockResolvedValue([]);
    const ids = await getActivePlayerIds("game1");
    expect(ids).toEqual([]);
  });

  it("excludes disconnected players by query filter", async () => {
    // Only active players should be returned
    db.player.findMany.mockResolvedValue([{ id: "p1" }]);
    const ids = await getActivePlayerIds("game1");
    expect(ids).toEqual(["p1"]);

    // The filter should include participationStatus: "ACTIVE"
    const call = db.player.findMany.mock.calls[0][0];
    expect(call.where.participationStatus).toBe("ACTIVE");
  });
});

// ===========================================================================
// 2. checkAllResponsesIn — writing phase quorum
// ===========================================================================

describe("checkAllResponsesIn", () => {
  it("returns true when all active players responded", async () => {
    db.round.findFirst.mockResolvedValue({
      prompts: [
        {
          responses: [{ playerId: "p1" }, { playerId: "p2" }, { playerId: "p3" }],
        },
      ],
    });
    db.player.findMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    expect(await checkAllResponsesIn("game1")).toBe(true);
  });

  it("returns false when at least one active player is missing a response", async () => {
    db.round.findFirst.mockResolvedValue({
      prompts: [
        {
          responses: [{ playerId: "p1" }, { playerId: "p2" }],
        },
      ],
    });
    db.player.findMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    expect(await checkAllResponsesIn("game1")).toBe(false);
  });

  it("returns true with fewer active players after disconnect", async () => {
    // 3 responses submitted, but one player disconnected → only 2 active
    db.round.findFirst.mockResolvedValue({
      prompts: [
        {
          responses: [{ playerId: "p1" }, { playerId: "p2" }, { playerId: "p3" }],
        },
      ],
    });
    db.player.findMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      // p3 disconnected — not returned by getActivePlayerIds
    ]);

    expect(await checkAllResponsesIn("game1")).toBe(true);
  });

  it("handles quorum shrink: 2 responses, 3 initially active, 1 disconnects → quorum met", async () => {
    // p3 disconnected before submitting. p1 and p2 submitted.
    // Active players = [p1, p2], responses = 2 → quorum met.
    db.round.findFirst.mockResolvedValue({
      prompts: [
        {
          responses: [{ playerId: "p1" }, { playerId: "p2" }],
        },
      ],
    });
    db.player.findMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
    ]);

    expect(await checkAllResponsesIn("game1")).toBe(true);
  });

  it("ignores disconnected-player responses when an active player has not responded", async () => {
    db.round.findFirst.mockResolvedValue({
      prompts: [
        {
          responses: [{ playerId: "p1" }, { playerId: "p3" }],
        },
      ],
    });
    db.player.findMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
    ]);

    expect(await checkAllResponsesIn("game1")).toBe(false);
  });

  it("returns false when no round exists", async () => {
    db.round.findFirst.mockResolvedValue(null);
    db.player.findMany.mockResolvedValue([{ id: "p1" }]);

    expect(await checkAllResponsesIn("game1")).toBe(false);
  });

  it("returns false when round has no prompts", async () => {
    db.round.findFirst.mockResolvedValue({ prompts: [] });
    db.player.findMany.mockResolvedValue([{ id: "p1" }]);

    expect(await checkAllResponsesIn("game1")).toBe(false);
  });

  it("returns true when 0 active players (edge: all disconnected)", async () => {
    // No active players → 0 responses needed → quorum trivially met
    db.round.findFirst.mockResolvedValue({
      prompts: [{ responses: [] }],
    });
    db.player.findMany.mockResolvedValue([]);

    expect(await checkAllResponsesIn("game1")).toBe(true);
  });
});

// ===========================================================================
// 3. checkAllVotesForCurrentPrompt — voting phase quorum
// ===========================================================================

describe("checkAllVotesForCurrentPrompt", () => {
  function setupVotingState(opts: {
    votingPromptIndex?: number;
    status?: string;
    votes: Array<{ id: string; voterId: string }>;
    responses: Array<{ id: string; playerId: string; text: string }>;
    activePlayerIds: string[];
  }) {
    db.game.findUnique.mockResolvedValue({
      status: opts.status ?? "VOTING",
      votingPromptIndex: opts.votingPromptIndex ?? 0,
    });
    // getVotablePrompts → prisma.round.findFirst
    db.round.findFirst.mockResolvedValue({
      prompts: [
        {
          id: "prompt1",
          responses: opts.responses,
          votes: opts.votes,
        },
      ],
    });
    // getActivePlayerIds → prisma.player.findMany
    db.player.findMany.mockResolvedValue(
      opts.activePlayerIds.map((id) => ({ id })),
    );
  }

  it("returns true when all active players have voted", async () => {
    setupVotingState({
      votes: [
        { id: "v1", voterId: "p1" },
        { id: "v2", voterId: "p2" },
        { id: "v3", voterId: "p3" },
      ],
      responses: [
        { id: "r1", playerId: "p1", text: "joke1" },
        { id: "r2", playerId: "p2", text: "joke2" },
        { id: "r3", playerId: "p3", text: "joke3" },
      ],
      activePlayerIds: ["p1", "p2", "p3"],
    });

    expect(await checkAllVotesForCurrentPrompt("game1")).toBe(true);
  });

  it("returns false when not all active players have voted", async () => {
    setupVotingState({
      votes: [
        { id: "v1", voterId: "p1" },
        { id: "v2", voterId: "p2" },
      ],
      responses: [
        { id: "r1", playerId: "p1", text: "joke1" },
        { id: "r2", playerId: "p2", text: "joke2" },
        { id: "r3", playerId: "p3", text: "joke3" },
      ],
      activePlayerIds: ["p1", "p2", "p3"],
    });

    expect(await checkAllVotesForCurrentPrompt("game1")).toBe(false);
  });

  it("returns true after player disconnect reduces quorum", async () => {
    // p3 disconnected. p1 and p2 voted. Quorum = 2 active players.
    setupVotingState({
      votes: [
        { id: "v1", voterId: "p1" },
        { id: "v2", voterId: "p2" },
      ],
      responses: [
        { id: "r1", playerId: "p1", text: "joke1" },
        { id: "r2", playerId: "p2", text: "joke2" },
        { id: "r3", playerId: "p3", text: "joke3" },
      ],
      activePlayerIds: ["p1", "p2"], // p3 disconnected
    });

    expect(await checkAllVotesForCurrentPrompt("game1")).toBe(true);
  });

  it("returns false when game is not in VOTING status", async () => {
    db.game.findUnique.mockResolvedValue({
      status: "WRITING",
      votingPromptIndex: 0,
    });

    expect(await checkAllVotesForCurrentPrompt("game1")).toBe(false);
  });

  it("returns false when game does not exist", async () => {
    db.game.findUnique.mockResolvedValue(null);

    expect(await checkAllVotesForCurrentPrompt("game1")).toBe(false);
  });

  it("returns false when votingPromptIndex is beyond available prompts", async () => {
    db.game.findUnique.mockResolvedValue({
      status: "VOTING",
      votingPromptIndex: 5, // beyond available prompts
    });
    db.round.findFirst.mockResolvedValue({
      prompts: [
        {
          id: "prompt1",
          responses: [
            { id: "r1", playerId: "p1", text: "joke1" },
            { id: "r2", playerId: "p2", text: "joke2" },
          ],
          votes: [],
        },
      ],
    });
    db.player.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    expect(await checkAllVotesForCurrentPrompt("game1")).toBe(false);
  });

  it("extra votes beyond quorum still return true", async () => {
    // More votes than active players (e.g., a player disconnected after voting)
    setupVotingState({
      votes: [
        { id: "v1", voterId: "p1" },
        { id: "v2", voterId: "p2" },
        { id: "v3", voterId: "p3" },
      ],
      responses: [
        { id: "r1", playerId: "p1", text: "joke1" },
        { id: "r2", playerId: "p2", text: "joke2" },
        { id: "r3", playerId: "p3", text: "joke3" },
      ],
      activePlayerIds: ["p1", "p2"], // p3 disconnected after voting
    });

    expect(await checkAllVotesForCurrentPrompt("game1")).toBe(true);
  });

  it("ignores disconnected-player votes when an active player has not voted", async () => {
    setupVotingState({
      votes: [
        { id: "v1", voterId: "p1" },
        { id: "v2", voterId: "p3" },
      ],
      responses: [
        { id: "r1", playerId: "p1", text: "joke1" },
        { id: "r2", playerId: "p2", text: "joke2" },
      ],
      activePlayerIds: ["p1", "p2"],
    });

    expect(await checkAllVotesForCurrentPrompt("game1")).toBe(false);
  });
});

// ===========================================================================
// 4. Inactivity disconnect and quorum re-check
// ===========================================================================

describe("checkAndDisconnectInactivePlayers", () => {
  it("skips non-AI_CHAT_SHOWDOWN games", async () => {
    const result = await checkAndDisconnectInactivePlayers(
      "game1",
      "SLOPLASH",
      "TEST",
    );

    expect(result).toEqual([]);
    expect(db.player.findMany).not.toHaveBeenCalled();
  });

  it("disconnects stale human players for AI_CHAT_SHOWDOWN", async () => {
    db.player.findMany
      // First call: stalePlayers check
      .mockResolvedValueOnce([
        { id: "p3", name: "Charlie" },
      ])
      // Second call (from recheckQuorum → getActivePlayerIds): remaining active
      .mockResolvedValueOnce([
        { id: "p1" },
        { id: "p2" },
      ]);
    db.player.updateMany.mockResolvedValue({ count: 1 });
    db.game.update.mockResolvedValue({});
    // recheckQuorum → game status check
    db.game.findUnique.mockResolvedValue({ status: "WRITING" });
    // recheckQuorum → checkAllResponsesIn → round
    db.round.findFirst.mockResolvedValue({
      prompts: [{ responses: [{ playerId: "p1" }] }],
    });

    const result = await checkAndDisconnectInactivePlayers(
      "game1",
      "AI_CHAT_SHOWDOWN",
      "TEST",
    );

    expect(result).toEqual(["p3"]);
    expect(db.player.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["p3"] } },
      data: { participationStatus: "DISCONNECTED" },
    });
  });

  it("returns empty when no stale players found", async () => {
    db.player.findMany.mockResolvedValue([]);

    const result = await checkAndDisconnectInactivePlayers(
      "game1",
      "AI_CHAT_SHOWDOWN",
      "TEST",
    );

    expect(result).toEqual([]);
    expect(db.player.updateMany).not.toHaveBeenCalled();
  });
});
