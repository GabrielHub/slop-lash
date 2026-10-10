import type { LanguageModelCallOptions } from "ai";

/**
 * AI SDK's portable reasoning levels. Each provider maps them to its own
 * controls: on Claude Haiku 5.5 `none` turns thinking off and `minimal` runs
 * adaptive thinking at effort `low`. Thinking tokens count against
 * `maxOutputTokens`, so a task's output cap must leave room for them.
 */
export type AiReasoning = NonNullable<LanguageModelCallOptions["reasoning"]>;

