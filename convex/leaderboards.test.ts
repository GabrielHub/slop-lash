/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vite-plus/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const HAIKU = "anthropic/claude-haiku-5.5";
const OTHER_BOT = "openai/gpt-6.1-sol";

describe("leaderboard head-to-head", () => {
  test("only human ballots decide human vs AI matchups", async () => {
    const t = convexTest(schema, modules);
    const gameId = await t.run(async (ctx) => {
      const now = Date.now();
      const gameId = await ctx.db.insert("games", {
        roomCode: "ABCD",
        gameNumber: 1,
        gameType: "SLOPLASH",
        status: "FINISHED",
        phase: "FINAL",
        step: 0,
        round: 1,
        totalRounds: 1,
        phaseGeneration: 1,
        phaseStartedAt: now,
        displayHost: false,
        freePlay: false,
        timersDisabled: true,
        ttsMode: "OFF",
        ttsVoice: "default",
        finishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const seat = (name: string, type: "HUMAN" | "AI", modelId?: string) =>
        ctx.db.insert("players", {
          gameId,
          name,
          normalizedName: name.toLowerCase(),
          type,
          ...(modelId ? { modelId } : {}),
          score: 0,
          joinedAt: now,
        });
      const ana = await seat("Ana", "HUMAN");
      const bo = await seat("Bo", "HUMAN");
      const haiku = await seat("Haiku", "AI", HAIKU);
      const other = await seat("Sol", "AI", OTHER_BOT);
      const roundId = await ctx.db.insert("rounds", { gameId, roundNumber: 1, scoredAt: now });

      const matchup = async (
        ordinal: number,
        human: Id<"players">,
        ballots: { voterId: Id<"players">; forHuman: boolean }[],
      ) => {
        const promptId = await ctx.db.insert("prompts", {
          gameId,
          roundId,
          ordinal,
          text: `Prompt ${ordinal}`,
          assigneeIds: [human, haiku],
          scoredAt: now,
        });
        const answer = (playerId: Id<"players">, text: string) =>
          ctx.db.insert("responses", {
            gameId,
            roundId,
            promptId,
            playerId,
            text,
            pointsEarned: 0,
            submittedAt: now,
          });
        const humanAnswer = await answer(human, `human ${ordinal}`);
        const aiAnswer = await answer(haiku, `ai ${ordinal}`);
        for (const ballot of ballots) {
          await ctx.db.insert("votes", {
            gameId,
            roundId,
            promptId,
            voterId: ballot.voterId,
            responseId: ballot.forHuman ? humanAnswer : aiAnswer,
            timedOut: false,
            castAt: now,
          });
        }
      };
      // One person and one bot split the vote: the person's ballot decides it.
      await matchup(0, ana, [
        { voterId: bo, forHuman: true },
        { voterId: other, forHuman: false },
      ]);
      // Only a bot voted: no human verdict, so it is left out.
      await matchup(1, bo, [{ voterId: other, forHuman: false }]);
      return gameId;
    });

    await t.mutation(internal.leaderboards.projectGame, { gameId });
    const board = await t.query(api.leaderboards.get, {});

    expect(board.headToHead).toEqual([
      expect.objectContaining({ modelId: HAIKU, humanWins: 1, aiWins: 0, ties: 0, total: 1 }),
    ]);
    // Bot ballots still count toward vote totals.
    expect(board.stats.totalVotes).toBe(3);
  });
});
