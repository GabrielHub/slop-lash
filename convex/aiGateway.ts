import { env } from "./_generated/server";

export function requireAiGatewayApiKey(): string {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("Vercel AI Gateway is not configured");
  return apiKey;
}
