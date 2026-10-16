import type { GameType } from "./core/types";
import {
  MAX_PLAYERS as SLOPLASH_MAX_PLAYERS,
  MIN_PLAYERS as SLOPLASH_MIN_PLAYERS,
} from "./sloplash/game-constants";
import {
  MAX_PLAYERS as MATCHSLOP_MAX_PLAYERS,
  MIN_PLAYERS as MATCHSLOP_MIN_PLAYERS,
} from "./matchslop/game-constants";
import {
  MAX_PLAYERS as QUIZSLOP_MAX_PLAYERS,
  MIN_PLAYERS as QUIZSLOP_MIN_PLAYERS,
} from "./quizslop/game-constants";
import {
  MAX_PLAYERS as SLOPFIGHT_MAX_PLAYERS,
  MIN_PLAYERS as SLOPFIGHT_MIN_PLAYERS,
} from "./slopfight/constants";

/**
 * Each game's static facts, shared by its `GameUi` and the host setup page.
 * Imports no UI, so the host page can read it without the game screens.
 */
export interface GameMeta {
  name: string;
  /** A pitch of six words or fewer, e.g. "Out-funny the AI." Shown in the lobby and on the host page. */
  tagline: string;
  /** The `data-game` value whose CSS variables (palette) apply to the game. */
  theme: "sloplash" | "matchslop" | "quizslop" | "slopfight";
  /** The game's own action colour, read inside its `data-game` scope. */
  accent: string;
  supportsNarrator: boolean;
  supportsAiPlayers: boolean;
  /**
   * The mode's pacing switch, or null for modes without one. `onWhenDisabled`
   * says whether the switch reads "on" when `timersDisabled` is true.
   */
  timerToggle: { label: string; onWhenDisabled: boolean } | null;
  minPlayers: number;
  maxPlayers: number;
}

export const GAME_META = {
  SLOPLASH: {
    name: "SlopLash",
    tagline: "Out-funny the AI.",
    theme: "sloplash",
    accent: "var(--punch)",
    supportsNarrator: true,
    supportsAiPlayers: true,
    timerToggle: { label: "Timers", onWhenDisabled: false },
    minPlayers: SLOPLASH_MIN_PLAYERS,
    maxPlayers: SLOPLASH_MAX_PLAYERS,
  },
  MATCHSLOP: {
    name: "MatchSlop",
    tagline: "Charm an AI date, together.",
    theme: "matchslop",
    accent: "var(--punch)",
    supportsNarrator: false,
    supportsAiPlayers: true,
    timerToggle: null,
    minPlayers: MATCHSLOP_MIN_PLAYERS,
    maxPlayers: MATCHSLOP_MAX_PLAYERS,
  },
  QUIZSLOP: {
    name: "QuizSlop",
    tagline: "Trivia where you bet on friends.",
    theme: "quizslop",
    accent: "var(--gold)",
    supportsNarrator: false,
    supportsAiPlayers: false,
    // Untimed QuizSlop is its tutorial: it explains each beat and waits for the host.
    timerToggle: { label: "No timers", onWhenDisabled: true },
    minPlayers: QUIZSLOP_MIN_PLAYERS,
    maxPlayers: QUIZSLOP_MAX_PLAYERS,
  },
  SLOPFIGHT: {
    name: "SlopFight",
    tagline: "Doodle a fighter. Watch it brawl.",
    theme: "slopfight",
    accent: "var(--punch)",
    supportsNarrator: true,
    // House champions fill the bracket; they are fighters, not seats.
    supportsAiPlayers: false,
    timerToggle: { label: "Timers", onWhenDisabled: false },
    minPlayers: SLOPFIGHT_MIN_PLAYERS,
    maxPlayers: SLOPFIGHT_MAX_PLAYERS,
  },
} satisfies Record<GameType, GameMeta>;
