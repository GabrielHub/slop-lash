import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { jsonByteLength, logDbTransfer, recordRouteHit } from "@/lib/db-transfer-debug";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const;

type ReactionRow = {
  id: string;
  responseId: string;
  playerId: string;
  emoji: string;
};

type PromptWithReactions = {
  id: string;
  responses: Array<{ id: string; text: string; reactions: ReactionRow[] }>;
};

function stripUnrevealedPromptReactions(
  prompts: PromptWithReactions[],
  votingPromptIndex: number,
  votingRevealing: boolean,
): void {
  const votable = [...prompts]
    .filter(
      (prompt) =>
        prompt.responses.length >= 2 &&
        !prompt.responses.some((response) => response.text === FORFEIT_MARKER),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < votable.length; i++) {
    const isFuture = i > votingPromptIndex;
    const isCurrentUnrevealed = i === votingPromptIndex && !votingRevealing;
    if (!isFuture && !isCurrentUnrevealed) continue;

    for (const response of votable[i].responses) {
      response.reactions = [];
    }
  }
}

function buildVotingEtag(game: {
  currentRound: number;
  votingPromptIndex: number;
  votingRevealing: boolean;
  reactionsVersion: number;
}): string {
  return `"rx-r${game.currentRound}-p${game.votingPromptIndex}-rev${game.votingRevealing ? 1 : 0}-v${game.reactionsVersion}"`;
}

type ReactionMeta = {
  id: string;
  status: "LOBBY" | "WRITING" | "VOTING" | "ROUND_RESULTS" | "FINAL_RESULTS";
  currentRound: number;
  votingPromptIndex: number;
  votingRevealing: boolean;
  reactionsVersion: number;
};

async function findReactionMeta(roomCode: string): Promise<ReactionMeta | null> {
  return prisma.game.findUnique({
    where: { roomCode },
    select: {
      id: true,
      status: true,
      currentRound: true,
      votingPromptIndex: true,
      votingRevealing: true,
      reactionsVersion: true,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  recordRouteHit("/api/games/[code]/reactions");
  const { code } = await params;
  const roomCode = code.toUpperCase();

  const game = await findReactionMeta(roomCode);

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }

  if (game.status !== "VOTING") {
    const etag = `"rx-none-r${game.currentRound}"`;
    if (request.headers.get("if-none-match") === etag) {
      logDbTransfer("/api/games/[code]/reactions", {
        result: "304-non-voting",
        roundNumber: game.currentRound,
      });
      return new Response(null, { status: 304, headers: { ...CACHE_HEADERS, ETag: etag } });
    }

    const payload = { roundNumber: game.currentRound, responses: [] as never[] };
    logDbTransfer("/api/games/[code]/reactions", {
      result: "200-non-voting",
      roundNumber: game.currentRound,
      bytes: jsonByteLength(payload),
    });
    return NextResponse.json(payload, { headers: { ...CACHE_HEADERS, ETag: etag } });
  }

  const etag = buildVotingEtag(game);

  if (request.headers.get("if-none-match") === etag) {
    logDbTransfer("/api/games/[code]/reactions", {
      result: "304-meta",
      roundNumber: game.currentRound,
      promptIndex: game.votingPromptIndex,
      revealing: game.votingRevealing ? 1 : 0,
      reactionsVersion: game.reactionsVersion,
    });
    return new Response(null, { status: 304, headers: { ...CACHE_HEADERS, ETag: etag } });
  }

  const round = await prisma.round.findFirst({
    where: { gameId: game.id, roundNumber: game.currentRound },
    select: {
      prompts: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          responses: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              text: true,
            },
          },
        },
      },
    },
  });

  const prompts = round?.prompts ?? [];

  const votable = [...prompts]
    .filter(
      (prompt) =>
        prompt.responses.length >= 2 &&
        !prompt.responses.some((response) => response.text === FORFEIT_MARKER),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  const visiblePromptIds = new Set<string>();
  for (let i = 0; i < votable.length; i++) {
    const isFuture = i > game.votingPromptIndex;
    const isCurrentUnrevealed = i === game.votingPromptIndex && !game.votingRevealing;
    if (!isFuture && !isCurrentUnrevealed) {
      visiblePromptIds.add(votable[i].id);
    }
  }

  const visibleResponseIds = prompts.flatMap((prompt) =>
    visiblePromptIds.has(prompt.id) ? prompt.responses.map((response) => response.id) : [],
  );

  const reactionRows = visibleResponseIds.length
    ? await prisma.reaction.findMany({
        where: { responseId: { in: visibleResponseIds } },
        orderBy: [{ emoji: "asc" }, { playerId: "asc" }, { id: "asc" }],
        select: {
          id: true,
          responseId: true,
          playerId: true,
          emoji: true,
        },
      })
    : [];

  const reactionsByResponseId = new Map<string, ReactionRow[]>();
  for (const reaction of reactionRows) {
    const existing = reactionsByResponseId.get(reaction.responseId);
    if (existing) existing.push(reaction);
    else reactionsByResponseId.set(reaction.responseId, [reaction]);
  }

  const promptsWithReactions: PromptWithReactions[] = prompts.map((prompt) => ({
    id: prompt.id,
    responses: prompt.responses.map((response) => ({
      id: response.id,
      text: response.text,
      reactions: reactionsByResponseId.get(response.id) ?? [],
    })),
  }));

  stripUnrevealedPromptReactions(promptsWithReactions, game.votingPromptIndex, game.votingRevealing);

  const responses = promptsWithReactions.flatMap((prompt) =>
    prompt.responses.map((response) => ({
      responseId: response.id,
      reactions: response.reactions,
    })),
  );

  const payload = { roundNumber: game.currentRound, responses };
  logDbTransfer("/api/games/[code]/reactions", {
    result: "200",
    roundNumber: game.currentRound,
    promptIndex: game.votingPromptIndex,
    revealing: game.votingRevealing ? 1 : 0,
    reactionsVersion: game.reactionsVersion,
    prompts: prompts.length,
    responses: prompts.reduce((sum, prompt) => sum + prompt.responses.length, 0),
    visibleResponses: visibleResponseIds.length,
    reactionsRead: reactionRows.length,
    bytes: jsonByteLength(payload),
  });

  return NextResponse.json(payload, {
    headers: { ...CACHE_HEADERS, ETag: etag },
  });
}
