/**
 * The shared AI task layer. Every model call goes through `runStructured`,
 * `runStructuredStream`, `runText` or `decideChoices`; see docs/ai-calls.md.
 *
 * `tasks`, `prompt`, `xml`, `usage` and `deadline` import no SDK runtime
 * code, so queries and mutations can import them directly by path
 * (`run`, `jev` and `attempts` do import the SDK).
 */
export {
  canUseJev,
  decideChoices,
  type AiDecideFailure,
  type AiDecideResult,
  type AiDecideSuccess,
  type ChoiceProbabilities,
  type ChoiceQuestion,
  type ChoiceQuestions,
  type DecideChoicesOptions,
  type DecidedChoices,
} from "./jev";
export {
  assertPromptLayout,
  buildInstructions,
  cachingProviderOptions,
  countCacheBreakpoints,
  limitMessageBreakpoints,
  markCacheBreakpoint,
  MAX_CACHE_BREAKPOINTS,
  slotKeys,
  type CacheTier,
  type InstructionBlock,
} from "./prompt";
export {
  runStructured,
  runStructuredStream,
  runText,
  type AiCallRecord,
  type AiFailReason,
  type AiRunFailure,
  type AiRunMeta,
  type AiRunOptions,
  type AiRunResult,
  type AiRunSuccess,
  type AiTextResult,
  type LanguageModelInstance,
  type PartialListener,
} from "./run";
export { AI_TASKS, getAiTask, type AiPool, type AiTaskId, type AiTaskSpec } from "./tasks";
export type { AiCallUsage, AiModelUsage } from "./usage";
export {
  decodeXmlEntities,
  escapeXml,
  escapeXmlText,
  PLAYER_TEXT_IS_DATA,
  singleLine,
  xml,
  xmlBlock,
} from "./xml";
