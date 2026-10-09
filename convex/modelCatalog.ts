import { getModelByModelId, selectUniqueModelsByProvider, type AIModel } from "../src/lib/models";

export { selectUniqueModelsByProvider };

export function getAiModel(modelId: string): AIModel | null {
  return getModelByModelId(modelId) ?? null;
}
