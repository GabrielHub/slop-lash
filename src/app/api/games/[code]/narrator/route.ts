import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { prisma } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";
import { VOICE_NAMES, pickRandomVoice } from "@/lib/voices";
import { NARRATOR_MODEL } from "@/lib/narrator-events";

function resolveVoice(voice: string): string {
  if (voice === "RANDOM" || !VOICE_NAMES.includes(voice)) return pickRandomVoice();
  return voice;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { playerId } = body;
  if (!playerId || typeof playerId !== "string") {
    return NextResponse.json({ error: "playerId is required" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (game.hostPlayerId !== playerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (game.ttsMode !== "ON") {
    return NextResponse.json({ error: "Narrator not enabled" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const voiceName = resolveVoice(game.ttsVoice);

  try {
    const client = new GoogleGenAI({ apiKey });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: NARRATOR_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        },
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    return NextResponse.json({ token: token.name, voiceName });
  } catch (err) {
    console.error("[narrator] Failed to create ephemeral token:", err);
    return NextResponse.json(
      { error: "Failed to create narrator token" },
      { status: 500 },
    );
  }
}
