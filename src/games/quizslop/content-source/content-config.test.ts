import { describe, expect, it } from "vite-plus/test";
import { AI_MODELS } from "../../../lib/models";
import {
  QUIZSLOP_AI_PROMPT_VERSION,
  QUIZSLOP_AI_SCHEMA_VERSION,
  QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
  resolveQuizSlopContentConfig,
} from "./content-config";

describe("QuizSlop content configuration", () => {
  it("keeps catalog mode model-free", () => {
    expect(resolveQuizSlopContentConfig({ mode: "CATALOG" })).toEqual({ mode: "CATALOG" });
  });

  it("allows every shared generator model but fixes verifier and contract versions server-side", () => {
    for (const model of AI_MODELS) {
      expect(resolveQuizSlopContentConfig({ mode: "AI", generatorModelId: model.id })).toEqual({
        mode: "AI",
        generatorModelId: model.id,
        verifierModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
        promptVersion: QUIZSLOP_AI_PROMPT_VERSION,
        schemaVersion: QUIZSLOP_AI_SCHEMA_VERSION,
      });
    }
  });

  it("rejects unknown generator IDs", () => {
    expect(() =>
      resolveQuizSlopContentConfig({ mode: "AI", generatorModelId: "somebody/free-mystery" }),
    ).toThrow(/Unsupported QuizSlop generator model/u);
  });
});
