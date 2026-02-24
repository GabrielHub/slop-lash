import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSpeechAudio } from "@/lib/tts";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const { promptId } = await request.json();

  if (!promptId) {
    return NextResponse.json(
      { error: "promptId is required" },
      { status: 400 },
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.ttsMode !== "AI_VOICE") {
    return NextResponse.json(
      { error: "AI voice is not enabled" },
      { status: 400 },
    );
  }

  if (game.status !== "VOTING") {
    return NextResponse.json(
      { error: "Speech only available during voting" },
      { status: 400 },
    );
  }

  const prompt = await prisma.prompt.findUnique({
    where: { id: promptId },
    include: {
      responses: { orderBy: { id: "asc" }, take: 2 },
      round: true,
    },
  });

  if (!prompt || prompt.responses.length < 2) {
    return NextResponse.json(
      { error: "Prompt not found or missing responses" },
      { status: 404 },
    );
  }

  // Verify the prompt belongs to this game
  if (prompt.round.gameId !== game.id) {
    return NextResponse.json(
      { error: "Prompt not found" },
      { status: 404 },
    );
  }

  // Return cached audio if already generated
  if (prompt.ttsAudio) {
    return NextResponse.json({ audio: prompt.ttsAudio });
  }

  const [respA, respB] = prompt.responses;
  const audio = await generateSpeechAudio(prompt.text, respA.text, respB.text, game.ttsVoice);

  if (!audio) {
    return NextResponse.json(
      { error: "TTS generation failed" },
      { status: 503 },
    );
  }

  const base64 = audio.toString("base64");

  // Optimistic write: only store if no other request already cached audio
  const { count } = await prisma.prompt.updateMany({
    where: { id: promptId, ttsAudio: null },
    data: { ttsAudio: base64 },
  });

  // If another request won the race, return their cached version
  if (count === 0) {
    const cached = await prisma.prompt.findUnique({
      where: { id: promptId },
      select: { ttsAudio: true },
    });
    if (cached?.ttsAudio) {
      return NextResponse.json({ audio: cached.ttsAudio });
    }
  }

  return NextResponse.json({ audio: base64 });
}
