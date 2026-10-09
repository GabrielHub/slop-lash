import { describe, expect, it } from "vite-plus/test";
import { FREE_PLAY_JUDGE_MODEL_ID, FREE_PLAY_WRITER_MODEL_ID } from "../../../lib/free-play";
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

  it("accepts the Free Play verifier and rejects any verifier off the server list", () => {
    expect(
      resolveQuizSlopContentConfig({
        mode: "AI",
        generatorModelId: FREE_PLAY_WRITER_MODEL_ID,
        verifierModelId: FREE_PLAY_JUDGE_MODEL_ID,
      }),
    ).toMatchObject({
      generatorModelId: FREE_PLAY_WRITER_MODEL_ID,
      verifierModelId: "typesafe-ai/jev",
    });
    expect(() =>
      resolveQuizSlopContentConfig({
        mode: "AI",
        generatorModelId: FREE_PLAY_WRITER_MODEL_ID,
        verifierModelId: "google/gemini-3.5-flash-lite",
      }),
    ).toThrow("Unsupported QuizSlop verifier model");
  });

  it("rejects unknown generator IDs", () => {
    expect(() =>
      resolveQuizSlopContentConfig({ mode: "AI", generatorModelId: "somebody/free-mystery" }),
    ).toThrow(/Unsupported QuizSlop generator model/u);
  });

  it.each(["moonshotai/kimi-k2.5", "alibaba/qwen3.5-flash", "xai/grok-4.5"])(
    "rejects removed model %s as a generator",
    (generatorModelId) => {
      expect(() => resolveQuizSlopContentConfig({ mode: "AI", generatorModelId })).toThrow(
        /Unsupported QuizSlop generator model/u,
      );
    },
  );
});
