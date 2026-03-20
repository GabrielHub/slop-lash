import { revalidateTag } from "next/cache";
import type { GameStatus } from "@/generated/prisma/client";
import { getGameDefinition } from "@/games/registry";
import { LEADERBOARD_TAG } from "@/games/core/constants";
import type { GameType } from "@/games/core/types";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { withGameOperationLock } from "@/lib/game-operation-lock";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { prisma } from "@/lib/db";
import { ensurePersonaPostMortem } from "@/games/matchslop/persona-post-mortem";
import { ensureWinnerTagline } from "@/games/sloplash/winner-tagline";

type MaintenanceDecision = {
  meta: RuntimeMeta;
  shouldPublishState: boolean;
  shouldGenerateAiResponses: boolean;
  shouldGenerateAiVotes: boolean;
  shouldFinalizeLeaderboard: boolean;
};

type RuntimeMeta = {
  id: string;
  gameType: GameType;
  status: GameStatus;
  phaseDeadline: Date | null;
  votingRevealing: boolean;
};

async function findRuntimeMeta(gameId: string): Promise<RuntimeMeta | null> {
  return prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      gameType: true,
      status: true,
      phaseDeadline: true,
      votingRevealing: true,
    },
  });
}

export async function runAiResponsesGeneration(
  gameId: string,
  gameType: GameType,
): Promise<boolean> {
  const def = getGameDefinition(gameType);
  const { acquired } = await withGameOperationLock(gameId, "ai-responses", async () => {
    await def.handlers.generateAiResponses(gameId);
  });

  return acquired;
}

export async function runAiVotesGeneration(
  gameId: string,
  gameType: GameType,
): Promise<boolean> {
  const def = getGameDefinition(gameType);
  const { acquired } = await withGameOperationLock(gameId, "ai-votes", async () => {
    await def.handlers.generateAiVotes(gameId);
  });

  return acquired;
}

const NO_OP_DECISION: Omit<MaintenanceDecision, "meta"> = {
  shouldPublishState: false,
  shouldGenerateAiResponses: false,
  shouldGenerateAiVotes: false,
  shouldFinalizeLeaderboard: false,
};

async function decideMaintenance(gameId: string, gameType: GameType): Promise<MaintenanceDecision | null> {
  const meta = await findRuntimeMeta(gameId);
  if (!meta) return null;

  const def = getGameDefinition(gameType);

  if (meta.phaseDeadline && meta.phaseDeadline.getTime() <= Date.now()) {
    const advancedTo = await def.handlers.checkAndEnforceDeadline(gameId);
    if (!advancedTo) return { ...NO_OP_DECISION, meta };

    return {
      meta,
      shouldPublishState: true,
      shouldGenerateAiResponses: advancedTo === "WRITING",
      shouldGenerateAiVotes: advancedTo === "VOTING",
      shouldFinalizeLeaderboard:
        advancedTo === "FINAL_RESULTS" && def.capabilities.retainsCompletedData,
    };
  }

  if (meta.status === "WRITING") {
    const allResponsesIn = await def.handlers.checkAllResponsesIn(gameId);
    if (!allResponsesIn) return { ...NO_OP_DECISION, meta };

    const claimed = await def.handlers.startVoting(gameId);
    if (!claimed) return { ...NO_OP_DECISION, meta };

    return {
      meta,
      shouldPublishState: true,
      shouldGenerateAiResponses: false,
      shouldGenerateAiVotes: true,
      shouldFinalizeLeaderboard: false,
    };
  }

  if (meta.status === "VOTING" && !meta.votingRevealing) {
    const allVotesIn = await def.handlers.checkAllVotesForCurrentPrompt(gameId);
    if (!allVotesIn) return { ...NO_OP_DECISION, meta };

    const claimed = await def.handlers.revealCurrentPrompt(gameId);
    return {
      meta,
      shouldPublishState: claimed,
      shouldGenerateAiResponses: false,
      shouldGenerateAiVotes: false,
      shouldFinalizeLeaderboard: false,
    };
  }

  return { ...NO_OP_DECISION, meta };
}

async function runDerivedStateMaintenance(
  gameId: string,
  knownMeta?: RuntimeMeta | null,
): Promise<boolean> {
  const meta = knownMeta ?? (await findRuntimeMeta(gameId));
  if (!meta) return false;

  if (
    meta.gameType === "SLOPLASH" &&
    (meta.status === "ROUND_RESULTS" || meta.status === "FINAL_RESULTS")
  ) {
    return ensureWinnerTagline(gameId);
  }

  if (meta.gameType === "MATCHSLOP" && meta.status === "FINAL_RESULTS") {
    await ensurePersonaPostMortem(gameId);
  }

  return false;
}

export async function runGameStateMaintenance(
  gameId: string,
  gameType: GameType,
): Promise<boolean> {
  const { acquired, result } = await withGameOperationLock(
    gameId,
    "state-maintenance",
    async () => decideMaintenance(gameId, gameType),
  );

  if (!acquired || !result?.shouldPublishState) {
    // Re-use the meta fetched inside decideMaintenance to avoid a redundant DB query
    return runDerivedStateMaintenance(gameId, result?.meta);
  }

  await publishGameStateEvent(gameId);

  if (result.shouldGenerateAiResponses) {
    const ranResponses = await runAiResponsesGeneration(gameId, gameType);
    if (ranResponses) {
      await publishGameStateEvent(gameId);
    }
  }

  if (result.shouldGenerateAiVotes) {
    const ranVotes = await runAiVotesGeneration(gameId, gameType);
    if (ranVotes) {
      await publishGameStateEvent(gameId);
    }
  }

  if (result.shouldFinalizeLeaderboard) {
    await applyCompletedGameToLeaderboardAggregate(gameId);
    revalidateTag(LEADERBOARD_TAG, { expire: 0 });
  }

  // After state-changing maintenance, re-fetch meta since status may have changed
  const derivedChanged = await runDerivedStateMaintenance(gameId);
  return result.shouldPublishState || derivedChanged;
}
