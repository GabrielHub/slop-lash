import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_FREE_PLAY_DAILY_GAME_LIMIT,
  FREE_PLAY_JUDGE_MODEL_ID,
  FREE_PLAY_WRITER_MODEL_ID,
  getFreePlayAiPlayerLimit,
  getFreePlayDay,
  parseFreePlayDailyGameLimit,
} from "./free-play";
import { getModelByModelId, getModelInfo } from "./models";

describe("Free Play", () => {
  it("writes with a direct Claude model and judges with Jev", () => {
    expect(getModelByModelId(FREE_PLAY_WRITER_MODEL_ID)?.anthropicModelId).toBe("claude-haiku-5-5");
    expect(getModelInfo(FREE_PLAY_JUDGE_MODEL_ID)?.name).toBe("Jev");
    expect(getModelByModelId(FREE_PLAY_JUDGE_MODEL_ID)).toBeUndefined();
  });

  it("allows one SlopLash bot and none elsewhere", () => {
    expect(getFreePlayAiPlayerLimit("SLOPLASH")).toBe(1);
    expect(getFreePlayAiPlayerLimit("MATCHSLOP")).toBe(0);
    expect(getFreePlayAiPlayerLimit("QUIZSLOP")).toBe(0);
  });

  it("counts rooms against the UTC day", () => {
    expect(getFreePlayDay(Date.UTC(2026, 9, 9, 23, 59, 59))).toBe("2026-10-09");
    expect(getFreePlayDay(Date.UTC(2026, 9, 10, 0, 0, 0))).toBe("2026-10-10");
  });

  it("reads the daily cap and falls back on missing or malformed values", () => {
    expect(parseFreePlayDailyGameLimit(undefined)).toBe(DEFAULT_FREE_PLAY_DAILY_GAME_LIMIT);
    expect(parseFreePlayDailyGameLimit(" 12 ")).toBe(12);
    expect(parseFreePlayDailyGameLimit("0")).toBe(0);
    for (const malformed of ["", "-5", "1.5", "ten", "1e3"]) {
      expect(parseFreePlayDailyGameLimit(malformed)).toBe(DEFAULT_FREE_PLAY_DAILY_GAME_LIMIT);
    }
  });
});
