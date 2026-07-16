import { createGateway, type GatewayModelId } from "ai";

function requireGateway(apiKey: string) {
  if (!apiKey.trim()) throw new Error("Vercel AI Gateway is not configured");
  return createGateway({ apiKey });
}

export function getGatewayModel(modelId: GatewayModelId, apiKey: string) {
  return requireGateway(apiKey)(modelId);
}

export function getGatewaySpeechModel(modelId: string, apiKey: string) {
  return requireGateway(apiKey).speechModel(modelId);
}
