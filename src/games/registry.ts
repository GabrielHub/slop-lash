import type { GameDefinition, GameType } from "@/games/core";
import { sloplashDefinition } from "@/games/sloplash/definition";
import { aiChatShowdownDefinition } from "@/games/ai-chat-showdown/definition";

const registry = new Map<GameType, GameDefinition>([
  [sloplashDefinition.id, sloplashDefinition],
  [aiChatShowdownDefinition.id, aiChatShowdownDefinition],
]);

/** Look up a game definition by type. Throws if not registered. */
export function getGameDefinition(gameType: GameType): GameDefinition {
  const definition = registry.get(gameType);
  if (!definition) {
    throw new Error(`Unknown game type: ${gameType}`);
  }
  return definition;
}

/** Return all registered game types. */
export function getAllGameTypes(): GameType[] {
  return Array.from(registry.keys());
}
