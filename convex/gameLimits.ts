import {
  MAX_PLAYERS as CHATSLOP_MAX_PLAYERS,
  MIN_PLAYERS as CHATSLOP_MIN_PLAYERS,
} from "../src/games/ai-chat-showdown/game-constants";
import {
  MAX_PLAYERS as MATCHSLOP_MAX_PLAYERS,
  MIN_PLAYERS as MATCHSLOP_MIN_PLAYERS,
} from "../src/games/matchslop/game-constants";
import {
  MAX_PLAYERS as QUIZSLOP_MAX_PLAYERS,
  MIN_PLAYERS as QUIZSLOP_MIN_PLAYERS,
} from "../src/games/quizslop/game-constants";
import {
  MAX_PLAYERS as SLOPLASH_MAX_PLAYERS,
  MIN_PLAYERS as SLOPLASH_MIN_PLAYERS,
} from "../src/games/sloplash/game-constants";
import type { GameType } from "../src/games/core/types";

/**
 * Each mode's roster bounds, sourced from its own constants so the backend and
 * the host UI cannot disagree about how many players a room holds.
 */
export const minPlayersByGameType = {
  AI_CHAT_SHOWDOWN: CHATSLOP_MIN_PLAYERS,
  MATCHSLOP: MATCHSLOP_MIN_PLAYERS,
  QUIZSLOP: QUIZSLOP_MIN_PLAYERS,
  SLOPLASH: SLOPLASH_MIN_PLAYERS,
} as const satisfies Record<GameType, number>;

export const maxPlayersByGameType = {
  AI_CHAT_SHOWDOWN: CHATSLOP_MAX_PLAYERS,
  MATCHSLOP: MATCHSLOP_MAX_PLAYERS,
  QUIZSLOP: QUIZSLOP_MAX_PLAYERS,
  SLOPLASH: SLOPLASH_MAX_PLAYERS,
} as const satisfies Record<GameType, number>;
