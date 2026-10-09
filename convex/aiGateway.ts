import { env } from "./_generated/server";
import type { AiProviderKeys } from "../src/lib/ai-gateway";

export function requireAiGatewayApiKey(): string {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("Vercel AI Gateway is not configured");
  return apiKey;
}

/** Both keys are optional here; the model router rejects a missing one on use. */
export function getAiProviderKeys(): AiProviderKeys {
  return { gateway: env.AI_GATEWAY_API_KEY, anthropic: env.ANTHROPIC_API_KEY };
}
