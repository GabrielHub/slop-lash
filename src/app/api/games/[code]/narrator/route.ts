import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { prisma } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";
import { VOICE_NAMES, pickRandomVoice } from "@/lib/voices";
import { NARRATOR_MODEL } from "@/lib/narrator-events";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";

function resolveVoice(voice: string): string {
  if (voice === "RANDOM" || !VOICE_NAMES.includes(voice)) return pickRandomVoice();
  return voice;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown; hostToken?: unknown }>(request);
  if (!body) {
    console.warn("[narrator] Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const auth = readHostAuth(body);
  if (!auth.playerId && !auth.hostToken) {
    console.warn("[narrator] Missing host auth");
    return NextResponse.json({ error: "playerId or hostToken is required" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: {
      id: true,
      hostPlayerId: true,
      hostControlTokenHash: true,
      ttsMode: true,
      ttsVoice: true,
    },
  });

  if (!game) {
    console.warn("[narrator] Game not found:", code);
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (!(await isAuthorizedHostControl(game, auth))) {
    console.warn("[narrator] Forbidden token request for non-host:", code);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (game.ttsMode !== "ON") {
    console.warn("[narrator] Narrator disabled for game:", code, game.ttsMode);
    return NextResponse.json({ error: "Narrator not enabled" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[narrator] GEMINI_API_KEY is not configured");
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

    if (!token.name) {
      console.error("[narrator] Ephemeral token response missing token name");
      return NextResponse.json(
        { error: "Failed to create narrator token" },
        { status: 500 },
      );
    }

    return NextResponse.json({ token: token.name, voiceName });
  } catch (err) {
    console.error("[narrator] Failed to create ephemeral token:", err);
    return NextResponse.json(
      { error: "Failed to create narrator token" },
      { status: 500 },
    );
  }
}
