import {
  AI_MODELS,
  getModelByModelId,
  selectUniqueModelsByProvider,
  type AIModel,
} from "../src/lib/models";

export { AI_MODELS, selectUniqueModelsByProvider };
export type AiModel = AIModel;

export function getAiModel(modelId: string): AIModel | null {
  return getModelByModelId(modelId) ?? null;
}
