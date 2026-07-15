import { createGateway, type GatewayModelId } from "ai";

export function getGatewayModel(modelId: GatewayModelId, apiKey: string) {
  if (!apiKey.trim()) throw new Error("Vercel AI Gateway is not configured");
  return createGateway({ apiKey })(modelId);
}
