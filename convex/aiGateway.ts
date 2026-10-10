import { env } from "./_generated/server";
import type { AiProviderKeys } from "../src/lib/ai-gateway";

/** Env values pasted from a terminal can carry a stray "\r"; it would poison the auth header. */
function cleanKey(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function requireAiGatewayApiKey(): string {
  const apiKey = cleanKey(env.AI_GATEWAY_API_KEY);
  if (!apiKey) throw new Error("Vercel AI Gateway is not configured");
  return apiKey;
}

/** Both keys are optional here; the model router rejects a missing one on use. */
export function getAiProviderKeys(): AiProviderKeys {
  return { gateway: cleanKey(env.AI_GATEWAY_API_KEY), anthropic: cleanKey(env.ANTHROPIC_API_KEY) };
}
