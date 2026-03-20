import { NextResponse, after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { sanitize } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/http";
import { logGameEvent } from "@/games/core/observability";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { parseModeState } from "@/games/matchslop/game-logic-core";
import { findAuthenticatedPlayer, readPlayerToken } from "@/lib/player-auth";
import { MATCHSLOP_PHOTO_PROMPT_ID, MATCHSLOP_PHOTO_PROMPT_TEXT } from "@/games/matchslop/config/game-config";

function buildMatchSlopResponseMetadata(
  currentRound: number,
  modeStateRaw: unknown,
  metadata: Record<string, unknown> | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull | { error: string } {
  if (currentRound !== 1) {
    return Prisma.DbNull;
  }

  const selectedPromptId =
    typeof metadata?.selectedPromptId === "string"
      ? metadata.selectedPromptId
      : null;
  if (!selectedPromptId) {
    return { error: "MatchSlop openers must pick a profile prompt" };
  }

  if (selectedPromptId === MATCHSLOP_PHOTO_PROMPT_ID) {
    return {
      selectedPromptId: MATCHSLOP_PHOTO_PROMPT_ID,
      selectedPromptText: MATCHSLOP_PHOTO_PROMPT_TEXT,
    } satisfies Prisma.InputJsonValue;
  }

  const profile = parseModeState(modeStateRaw).profile;
  if (!profile) {
    return { error: "The MatchSlop profile is still generating" };
  }
  const selectedPrompt = profile?.prompts.find((prompt) => prompt.id === selectedPromptId);
  if (!selectedPrompt) {
    return { error: "Selected MatchSlop prompt is invalid" };
  }

  return {
    selectedPromptId: selectedPrompt.id,
    selectedPromptText: selectedPrompt.prompt,
  } satisfies Prisma.InputJsonValue;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{
    playerToken?: unknown;
    promptId?: unknown;
    text?: unknown;
    metadata?: unknown;
  }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { playerToken, promptId, text, metadata } = body;
  const validPlayerToken = readPlayerToken(playerToken);
  const validPromptId = typeof promptId === "string" ? promptId : null;

  const validMetadata =
    metadata == null
      ? null
      : typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : undefined;

  if (!validPlayerToken || !validPromptId || !text || typeof text !== "string") {
    return NextResponse.json(
      { error: "playerToken, promptId, and text are required" },
      { status: 400 }
    );
  }
  if (validMetadata === undefined) {
    return NextResponse.json(
      { error: "metadata must be an object when provided" },
      { status: 400 }
    );
  }

  const trimmed = sanitize(text, 200);
  if (trimmed.length === 0) {
    return NextResponse.json(
      { error: "Response text cannot be empty" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: { id: true, gameType: true, status: true, currentRound: true, modeState: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "WRITING") {
    return NextResponse.json(
      { error: "Game not in writing phase" },
      { status: 400 }
    );
  }

  const player = await findAuthenticatedPlayer(game.id, validPlayerToken);
  if (!player) {
    return NextResponse.json(
      { error: "Invalid player session" },
      { status: 401 }
    );
  }

  if (player.type === "SPECTATOR") {
    return NextResponse.json(
      { error: "Spectators cannot submit responses" },
      { status: 403 }
    );
  }
  if (player.participationStatus === "DISCONNECTED") {
    return NextResponse.json(
      { error: "Disconnected players cannot submit responses" },
      { status: 403 }
    );
  }

  if (!checkRateLimit(`respond:${player.id}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429 }
    );
  }

  const assignment = await prisma.promptAssignment.findUnique({
    where: { promptId_playerId: { promptId: validPromptId, playerId: player.id } },
    select: { id: true },
  });

  if (!assignment) {
    return NextResponse.json(
      { error: "You are not assigned to this prompt" },
      { status: 403 }
    );
  }

  const responseMetadata =
    game.gameType === "MATCHSLOP"
      ? buildMatchSlopResponseMetadata(game.currentRound, game.modeState, validMetadata)
      : Prisma.DbNull;
  if (
    typeof responseMetadata === "object" &&
    responseMetadata != null &&
    "error" in responseMetadata
  ) {
    return NextResponse.json({ error: responseMetadata.error }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.response.findFirst({
        where: { promptId: validPromptId, playerId: player.id },
        select: { id: true },
      });

      if (existing) {
        throw new Error("ALREADY_RESPONDED");
      }

      await tx.response.create({
        data: {
          promptId: validPromptId,
          playerId: player.id,
          text: trimmed,
          metadata: responseMetadata,
        },
      });

      await tx.game.update({
        where: { id: game.id },
        data: { version: { increment: 1 } },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_RESPONDED") {
      return NextResponse.json(
        { error: "Already responded to this prompt" },
        { status: 400 }
      );
    }
    throw e;
  }

  const def = getGameDefinition(game.gameType);

  logGameEvent("responded", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
    playerId: player.id,
  });
  await publishGameStateEvent(game.id);

  after(async () => {
    const allIn = await def.handlers.checkAllResponsesIn(game.id);
    if (allIn) {
      const claimed = await def.handlers.startVoting(game.id);
      if (claimed) {
        await publishGameStateEvent(game.id);
        await def.handlers.generateAiVotes(game.id);
        await publishGameStateEvent(game.id);
      }
    }
  });

  return NextResponse.json({ success: true });
}
