import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway, type GatewayModelId } from "ai";
import { getModelByModelId } from "./models";

/** Server-side credentials. Each model resolves the one its provider needs. */
export interface AiProviderKeys {
  gateway?: string;
  anthropic?: string;
}

function requireGateway(apiKey: string | undefined) {
  if (!apiKey?.trim()) throw new Error("Vercel AI Gateway is not configured");
  return createGateway({ apiKey });
}

/**
 * Claude models with an `anthropicModelId` bill the Claude Console account
 * directly; every other model goes through the Vercel AI Gateway.
 */
export function getLanguageModel(modelId: GatewayModelId, keys: AiProviderKeys) {
  const anthropicModelId = getModelByModelId(modelId)?.anthropicModelId;
  if (anthropicModelId) {
    if (!keys.anthropic?.trim()) throw new Error("Claude API is not configured");
    return createAnthropic({ apiKey: keys.anthropic })(anthropicModelId);
  }
  return requireGateway(keys.gateway)(modelId);
}

export function getDecisionModel(modelId: string, keys: AiProviderKeys) {
  return requireGateway(keys.gateway).decisionModel(modelId);
}

export function getGatewaySpeechModel(modelId: string, apiKey: string) {
  return requireGateway(apiKey).speechModel(modelId);
}
