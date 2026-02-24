import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    include: {
      players: {
        orderBy: { score: "desc" },
      },
      rounds: {
        orderBy: { roundNumber: "desc" },
        take: 1,
        include: {
          prompts: {
            include: {
              responses: {
                include: { player: { select: { id: true, name: true, type: true, modelId: true } } },
              },
              votes: true,
            },
          },
        },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json(game);
}
