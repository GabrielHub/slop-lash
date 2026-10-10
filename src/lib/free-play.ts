import type { GameType } from "../games/core/types";
import { getModelByModelId, JEV_MODEL, type AIModel } from "./models";

function requireWriterModel(modelId: string): AIModel {
  const model = getModelByModelId(modelId);
  if (!model) throw new Error(`Free Play writer ${modelId} is missing from the model catalog`);
  return model;
}

/**
 * Free Play rooms need no host password, and need only the Claude API key.
 * Claude Haiku writes every line on the owner's Claude Console credits and
 * plays the MatchSlop persona, which also judges the players' lines. SlopLash
 * AI ballots go to Jev first when the Vercel AI Gateway key is set; without
 * it, or when Jev fails, Haiku casts them (`castBallots` in
 * src/games/sloplash/ai.ts).
 */
export const FREE_PLAY_WRITER_MODEL = requireWriterModel("anthropic/claude-haiku-5.5");
export const FREE_PLAY_WRITER_MODEL_ID = FREE_PLAY_WRITER_MODEL.id;
/** Jev: the SlopLash ballot model while the Gateway key is configured. */
export const FREE_PLAY_JUDGE_MODEL_ID = JEV_MODEL.id;

/** Default rooms per UTC day, overridable with `FREE_PLAY_DAILY_GAME_LIMIT`. */
export const DEFAULT_FREE_PLAY_DAILY_GAME_LIMIT = 50;

/**
 * SlopLash allows one Haiku bot; MatchSlop's Haiku persona is its only bot.
 * QuizSlop and SlopFight have no AI seats (SlopFight's house champions are fighters, not seats).
 */
export function getFreePlayAiPlayerLimit(gameType: GameType): number {
  return gameType === "SLOPLASH" ? 1 : 0;
}

/** Why a Free Play roster of AI player models is not allowed, or null when it is. */
export function getFreePlayAiPlayersError(
  gameType: GameType,
  modelIds: readonly string[],
): string | null {
  if (modelIds.some((modelId) => modelId !== FREE_PLAY_WRITER_MODEL_ID)) {
    return "Free Play AI players use Claude Haiku";
  }
  const limit = getFreePlayAiPlayerLimit(gameType);
  if (modelIds.length <= limit) return null;
  return limit === 0
    ? "Free Play has no AI players in this mode"
    : `Free Play allows ${limit} AI player`;
}

/** The UTC calendar day a free room counts against. */
export function getFreePlayDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Reads the configured daily cap; a missing or malformed value uses the default. */
export function parseFreePlayDailyGameLimit(raw: string | undefined): number {
  const trimmed = raw?.trim() ?? "";
  if (!/^\d+$/u.test(trimmed)) return DEFAULT_FREE_PLAY_DAILY_GAME_LIMIT;
  return Number.parseInt(trimmed, 10);
}
