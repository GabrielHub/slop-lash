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
  generateAiResponses,
  generateAiVotes,
  promoteHost,
  MIN_PLAYERS,
  MAX_PLAYERS,
  HOST_STALE_MS,
} from "./game-logic";
import { MAX_SPECTATORS } from "./game-constants";

export const sloplashDefinition: GameDefinition = {
  id: "SLOPLASH",
  displayName: "Slop-Lash",
  capabilities: {
    supportsNarrator: true,
    supportsSfx: true,
    supportsChatFeed: false,
    supportsSpectators: true,
    retainsCompletedData: true,
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
