"use node";

import { GoogleGenAI, Modality } from "@google/genai";
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, env } from "./_generated/server";
import { NARRATOR_MODEL } from "../src/games/sloplash/narrator-events";
import { VOICE_NAMES, pickRandomVoice } from "../src/games/sloplash/voices";

const authorizeToken = makeFunctionReference<"query", { capability: string }, { voice: string }>(
  "narratorData:authorizeToken",
);

function resolveVoice(voice: string): string {
  if (voice === "RANDOM" || !VOICE_NAMES.includes(voice)) return pickRandomVoice();
  return voice;
}

export const createToken = action({
  args: { capability: v.string() },
  returns: v.object({ token: v.string(), voiceName: v.string() }),
  handler: async (ctx, args) => {
    const { voice } = await ctx.runQuery(authorizeToken, args);
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) throw new ConvexError("Narrator is not configured");

    const voiceName = resolveVoice(voice);
    const client = new GoogleGenAI({ apiKey });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1_000).toISOString(),
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
    if (!token.name) throw new ConvexError("Failed to create narrator token");
    return { token: token.name, voiceName };
  },
});
