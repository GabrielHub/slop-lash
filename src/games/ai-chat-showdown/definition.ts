import type { GameDefinition } from "@/games/core";
import {
  startRound,
  advanceGame,
  checkAllResponsesIn,
  startVoting,
  getVotablePrompts,
  checkAllVotesForCurrentPrompt,
  revealCurrentPrompt,
  forceAdvancePhase,
  checkAndEnforceDeadline,
  endGameEarly,
  promoteHost,
  MIN_PLAYERS,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  HOST_STALE_MS,
} from "./game-logic";
import { generateAiResponses, generateAiVotes } from "./game-logic-ai";

export const aiChatShowdownDefinition: GameDefinition = {
  id: "AI_CHAT_SHOWDOWN",
  displayName: "ChatSlop",
  capabilities: {
    supportsNarrator: false,
    supportsSfx: false,
    supportsChatFeed: true,
    supportsSpectators: false,
    retainsCompletedData: false,
  },
  handlers: {
    startGame: startRound,
    endGameEarly,
    advanceGame,
    forceAdvancePhase,
    checkAndEnforceDeadline,
    checkAllResponsesIn,
    startVoting,
    getVotablePrompts,
    checkAllVotesForCurrentPrompt,
    revealCurrentPrompt,
    generateAiResponses,
    generateAiVotes,
    promoteHost,
  },
  constants: {
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    maxSpectators: MAX_SPECTATORS,
    hostStaleMs: HOST_STALE_MS,
  },
};
