import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/http";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { logGameEvent } from "@/games/core/observability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ voterId?: unknown; promptId?: unknown; responseId?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { voterId, promptId, responseId } = body;
  const validVoterId = typeof voterId === "string" ? voterId : null;
  const validPromptId = typeof promptId === "string" ? promptId : null;

  const validResponseId =
    responseId == null ? null :
    typeof responseId === "string" ? responseId :
    undefined;

  if (!validVoterId || !validPromptId || validResponseId === undefined) {
    return NextResponse.json(
      { error: "voterId and promptId are required" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: { id: true, gameType: true, status: true, votingPromptIndex: true, votingRevealing: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "VOTING") {
    return NextResponse.json(
      { error: "Game not in voting phase" },
      { status: 400 }
    );
  }

  if (game.votingRevealing) {
    return NextResponse.json(
      { error: "Voting is paused during reveal" },
      { status: 400 }
    );
  }

  const def = getGameDefinition(game.gameType);

  const votablePrompts = await def.handlers.getVotablePrompts(game.id);
  const currentPrompt = votablePrompts[game.votingPromptIndex];

  if (!currentPrompt || currentPrompt.id !== validPromptId) {
    return NextResponse.json(
      { error: "Not the current prompt" },
      { status: 400 }
    );
  }

  const voter = await prisma.player.findFirst({
    where: { id: validVoterId, gameId: game.id },
    select: { id: true, type: true, participationStatus: true },
  });
  if (!voter) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 403 }
    );
  }
  if (voter.type === "SPECTATOR") {
    return NextResponse.json(
      { error: "Spectators cannot vote" },
      { status: 403 }
    );
  }
  if (voter.participationStatus === "DISCONNECTED") {
    return NextResponse.json(
      { error: "Disconnected players cannot vote" },
      { status: 403 }
    );
  }

  if (!checkRateLimit(`vote:${validVoterId}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429 }
    );
  }

  if (validResponseId) {
    const response = await prisma.response.findFirst({
      where: { id: validResponseId, promptId: validPromptId },
      select: { id: true },
    });
    if (!response) {
      return NextResponse.json(
        { error: "Response does not belong to this prompt" },
        { status: 400 }
      );
    }
  }

  // AI_CHAT_SHOWDOWN: all players respond AND vote (no abstains, self-vote disallowed)
  // SLOPLASH: respondents cannot vote on their own prompt (abstains allowed)
  const isAllPlayerVoting = game.gameType === "AI_CHAT_SHOWDOWN";

  if (isAllPlayerVoting && !validResponseId) {
    return NextResponse.json(
      { error: "Abstaining is not allowed in this game mode" },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (isAllPlayerVoting) {
        // Self-vote check: cannot vote for your own response
        if (validResponseId) {
          const selfResponse = await tx.response.findFirst({
            where: { id: validResponseId, playerId: validVoterId },
            select: { id: true },
          });
          if (selfResponse) {
            throw new Error("SELF_VOTE");
          }
        }
      } else {
        // SLOPLASH: respondents cannot vote on their prompt at all
        const voterResponse = await tx.response.findFirst({
          where: { promptId: validPromptId, playerId: validVoterId },
          select: { id: true },
        });
        if (voterResponse) {
          throw new Error("RESPONDENT");
        }
      }

      const existingVote = await tx.vote.findFirst({
        where: { promptId: validPromptId, voterId: validVoterId },
        select: { id: true },
      });
      if (existingVote) {
        throw new Error("ALREADY_VOTED");
      }

      await tx.vote.create({
        data: { promptId: validPromptId, voterId: validVoterId, responseId: validResponseId },
      });

      // Bump version so pollers pick up the new vote
      await tx.game.update({
        where: { id: game.id },
        data: { version: { increment: 1 } },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SELF_VOTE") {
      return NextResponse.json(
        { error: "Cannot vote for your own response" },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "RESPONDENT") {
      return NextResponse.json(
        { error: "Cannot vote on a prompt you responded to" },
        { status: 400 }
      );
    }
    // ALREADY_VOTED (explicit check) or P2002 (unique constraint race with forfeit pre-creation)
    if (
      (e instanceof Error && e.message === "ALREADY_VOTED") ||
      hasPrismaErrorCode(e, "P2002")
    ) {
      return NextResponse.json(
        { error: "Already voted on this prompt" },
        { status: 400 }
      );
    }
    throw e;
  }

  logGameEvent("voted", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
    voterId: validVoterId,
    abstain: !validResponseId,
  });

  after(async () => {
    const allIn = await def.handlers.checkAllVotesForCurrentPrompt(game.id);
    if (allIn) {
      await def.handlers.revealCurrentPrompt(game.id);
    }
  });

  return NextResponse.json({ success: true });
}
