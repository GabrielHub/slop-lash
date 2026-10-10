import type { ModelMessage, SystemModelMessage } from "ai";
import type { ModelRoute } from "../ai-gateway";

/**
 * How stable an instruction block is. Prompts are laid out STATIC (house
 * brief, rubric, fixed examples: identical across rooms) then GAME (persona,
 * room settings) then per-call text (`false`), so every provider can reuse
 * the longest possible prefix. Never put timestamps, IDs, seeds or rotating
 * examples in a cached block.
 */
export type CacheTier = "static" | "game" | false;

export interface InstructionBlock {
  text: string;
  cache: CacheTier;
}

type ProviderOptions = NonNullable<SystemModelMessage["providerOptions"]>;

/** Anthropic accepts at most this many `cache_control` breakpoints per request. */
export const MAX_CACHE_BREAKPOINTS = 4;

const TIER_ORDER = { static: 0, game: 1, call: 2 } as const;

function tierOrder(cache: CacheTier): number {
  return cache === false ? TIER_ORDER.call : TIER_ORDER[cache];
}

function ephemeral(): ProviderOptions {
  return { anthropic: { cacheControl: { type: "ephemeral" } } };
}

function hasCacheMarker(providerOptions: ProviderOptions | undefined): boolean {
  const anthropic = providerOptions?.anthropic;
  return Boolean(anthropic && (anthropic.cacheControl || anthropic.cache_control));
}

/** Throws when blocks are out of static -> game -> call order, which would defeat caching. */
export function assertPromptLayout(blocks: readonly InstructionBlock[]): void {
  for (let index = 1; index < blocks.length; index += 1) {
    if (tierOrder(blocks[index]!.cache) < tierOrder(blocks[index - 1]!.cache)) {
      throw new Error(
        `Prompt block ${index} (${String(blocks[index]!.cache)}) comes after a less stable block (${String(blocks[index - 1]!.cache)}); order blocks static -> game -> call.`,
      );
    }
  }
}

/**
 * Instruction blocks as system messages. For Anthropic-direct models the last
 * block of each cached tier carries an ephemeral `cacheControl` breakpoint
 * (at most two). Gateway models get no markers here; `runStructured` turns on
 * `providerOptions.gateway.caching: 'auto'` for them instead.
 */
export function buildInstructions(
  instructions: string | readonly InstructionBlock[],
  route: ModelRoute,
): SystemModelMessage[] {
  const blocks: readonly InstructionBlock[] =
    typeof instructions === "string" ? [{ text: instructions, cache: false }] : instructions;
  assertPromptLayout(blocks);
  return blocks.map((block, index) => {
    const message: SystemModelMessage = { role: "system", content: block.text };
    const endsCachedTier = block.cache !== false && blocks[index + 1]?.cache !== block.cache;
    return route === "anthropic" && endsCachedTier
      ? { ...message, providerOptions: ephemeral() }
      : message;
  });
}

/** Breakpoints already placed on these system messages. */
export function countCacheBreakpoints(messages: readonly ModelMessage[]): number {
  return messages.filter((message) => hasCacheMarker(message.providerOptions)).length;
}

/**
 * Marks the end of a conversation prefix worth caching, e.g. the previous
 * turn of the MatchSlop persona chat. Anthropic-direct models honor it; other
 * routes ignore it. `runStructured` keeps only the latest marks that fit the
 * four-breakpoint limit.
 */
export function markCacheBreakpoint<Message extends ModelMessage>(message: Message): Message {
  return {
    ...message,
    providerOptions: {
      ...message.providerOptions,
      anthropic: { ...message.providerOptions?.anthropic, cacheControl: { type: "ephemeral" } },
    },
  };
}

function withoutCacheMarker<Message extends ModelMessage>(message: Message): Message {
  const anthropic = message.providerOptions?.anthropic;
  if (!anthropic) return message;
  const rest = Object.fromEntries(
    Object.entries(anthropic).filter(([key]) => key !== "cacheControl" && key !== "cache_control"),
  );
  return { ...message, providerOptions: { ...message.providerOptions, anthropic: rest } };
}

/** Keeps the last `budget` message breakpoints and drops older ones. */
export function limitMessageBreakpoints(
  messages: readonly ModelMessage[],
  budget: number,
): ModelMessage[] {
  let remaining = Math.max(0, budget);
  const kept: ModelMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (!hasCacheMarker(message.providerOptions)) kept.push(message);
    else if (remaining > 0) {
      remaining -= 1;
      kept.push(message);
    } else kept.push(withoutCacheMarker(message));
  }
  return kept.reverse();
}

/**
 * Fixed positional keys for a schema enum: `slotKeys("M", 3)` is
 * `["M1", "M2", "M3"]`. Providers cache the output schema along with the
 * prompt prefix (Anthropic renders it into the request), so a task's schema
 * must be byte-identical on every call. Size the enum for the task's maximum
 * (not this call's count), say in the prompt which keys apply, and check the
 * picks in code.
 */
export function slotKeys(prefix: string, count: number): [string, ...string[]] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`slotKeys needs a positive integer count, got ${count}`);
  }
  return Array.from({ length: count }, (_unused, index) => `${prefix}${index + 1}`) as [
    string,
    ...string[],
  ];
}

/** Call-level provider options that switch caching on for a route. */
export function cachingProviderOptions(route: ModelRoute): ProviderOptions | undefined {
  return route === "gateway" ? { gateway: { caching: "auto" } } : undefined;
}
