import { prisma } from "@/lib/db";
import { withGameOperationLock } from "@/lib/game-operation-lock";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { FORFEIT_TEXT, generateWinnerTagline } from "./ai";
import { accumulateUsage } from "./game-logic-ai";

export const WINNER_TAGLINE_GENERATING = "__generating__";

export function normalizeWinnerTagline(value: string | null | undefined): string | null {
  if (value == null || value === WINNER_TAGLINE_GENERATING) {
    return null;
  }

  return value;
}

export async function ensureWinnerTagline(gameId: string): Promise<boolean> {
  const { acquired, result } = await withGameOperationLock(gameId, "winner-tagline", async () => {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        gameType: true,
        status: true,
        winnerTagline: true,
        players: {
          orderBy: { score: "desc" },
          select: {
            id: true,
            name: true,
            type: true,
            modelId: true,
            score: true,
          },
        },
        rounds: {
          orderBy: { roundNumber: "asc" },
          select: {
            roundNumber: true,
            prompts: {
              select: {
                text: true,
                responses: {
                  select: {
                    text: true,
                    player: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        modelId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!game || game.gameType !== "SLOPLASH") return false;
    if (game.status !== "ROUND_RESULTS" && game.status !== "FINAL_RESULTS") return false;
    if (game.winnerTagline && game.winnerTagline !== WINNER_TAGLINE_GENERATING) return false;

    const leader = game.players[0];
    if (!leader || leader.type !== "AI" || !leader.modelId) return false;

    const isFinal = game.status === "FINAL_RESULTS";
    const latestRoundNumber = game.rounds.at(-1)?.roundNumber ?? null;

    if (game.winnerTagline !== WINNER_TAGLINE_GENERATING) {
      await prisma.game.update({
        where: { id: game.id },
        data: {
          winnerTagline: WINNER_TAGLINE_GENERATING,
          version: { increment: 1 },
        },
      });
    }

    const scoreBoard = game.players
      .map((player, index) => `${index + 1}. ${player.name} (${player.type}) - ${player.score} pts`)
      .join("\n");

    const aiJokes = game.rounds
      .filter((round) => isFinal || round.roundNumber === latestRoundNumber)
      .flatMap((round) => round.prompts)
      .flatMap((prompt) =>
        prompt.responses
          .filter((response) => response.player.id === leader.id && response.text !== FORFEIT_TEXT)
          .map((response) => `Prompt: "${prompt.text}" -> Your answer: "${response.text}"`),
      )
      .join("\n");

    const context = `Scores:\n${scoreBoard}\n\nYour jokes this ${isFinal ? "game" : "round"}:\n${aiJokes || "(none)"}`;

    try {
      const result = generateWinnerTagline(
        leader.modelId,
        leader.name,
        isFinal,
        context,
        async (usage) => {
          await accumulateUsage(game.id, [usage]);
        },
      );

      const text = await result.text;
      await prisma.game.update({
        where: { id: game.id },
        data: {
          winnerTagline: text,
          version: { increment: 1 },
        },
      });

      return true;
    } catch (error) {
      console.error("[winner-tagline] Generation failed:", error);
      await prisma.game
        .update({
          where: { id: game.id },
          data: {
            winnerTagline: null,
            version: { increment: 1 },
          },
        })
        .catch((resetError) => {
          console.error("[winner-tagline] Failed to clear generating sentinel:", resetError);
        });
      return false;
    }
  });

  if (!acquired || !result) {
    return false;
  }

  await publishGameStateEvent(gameId);
  return true;
}
