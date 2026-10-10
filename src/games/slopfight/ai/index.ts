/**
 * SlopFight's AI calls (contract 3.5) on the shared task layer (`src/lib/ai`):
 * the forge (streamed), the house descriptions, the matchup notes and the
 * recap line. None throws for a model or provider problem; each returns
 * `{ ok: true, ...fields, calls }` or `{ ok: false, failReason, calls }`, with
 * every call made as an `aiCalls` row. See docs/ai-calls.md.
 */
export {
  FORGE_OUTPUT,
  finishForgeResult,
  forgeChampion,
  REFUSAL_REJECTION,
  BODY_PLAN_LEGS,
  replyProblems,
  type ForgeReplyProblem,
  type ForgeChampionOptions,
  type ForgeChampionResult,
  type ForgeMode,
  type ForgePartial,
  type ForgeStreamInfo,
} from "./forge";
export { FORGE_PROMPT_VERSION } from "./forge-prompt";
export { inventHouseChampions, type InventHouseOptions } from "./house";
export { HOUSE_PROMPT_VERSION } from "./house-prompt";
export { settleNotes, writeMatchup, type MatchupResult, type WriteMatchupOptions } from "./matchup";
export { MATCHUP_PROMPT_VERSION } from "./matchup-prompt";
export { writeRecapLine, type RecapEvent, type RecapOutcome, type WriteRecapOptions } from "./recap";
export { RECAP_LINE_MAX, RECAP_PROMPT_VERSION } from "./recap-prompt";
export {
  SLOPFIGHT_FALLBACK_MODEL_ID,
  SLOPFIGHT_MODEL_ID,
  type AiOutcome,
  type CallOptions,
  type ModelSource,
} from "./shared";
