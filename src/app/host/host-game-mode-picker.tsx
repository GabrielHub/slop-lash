import { AnimatePresence, motion } from "motion/react";
import { GAME_TYPES, type GameType } from "@/games/core";
import {
  MAX_PLAYERS as SLOPLASH_MAX_PLAYERS,
  MIN_PLAYERS as SLOPLASH_MIN_PLAYERS,
} from "@/games/sloplash/game-constants";
import {
  MAX_PLAYERS as CHATSLOP_MAX_PLAYERS,
  MIN_PLAYERS as CHATSLOP_MIN_PLAYERS,
} from "@/games/ai-chat-showdown/game-constants";
import {
  MAX_PLAYERS as MATCHSLOP_MAX_PLAYERS,
  MIN_PLAYERS as MATCHSLOP_MIN_PLAYERS,
} from "@/games/matchslop/game-constants";
import {
  MAX_PLAYERS as QUIZSLOP_MAX_PLAYERS,
  MIN_PLAYERS as QUIZSLOP_MIN_PLAYERS,
} from "@/games/quizslop/game-constants";
import { buttonTap } from "@/lib/animations";

export type HostParticipation = "PLAYER" | "DISPLAY_ONLY";

type GameTypeOption = {
  displayName: string;
  description: string;
  supportsNarrator: boolean;
  supportsAiPlayers: boolean;
  /** Mode-specific pacing control, or null for modes without one. */
  timerToggle: { label: string; description: string } | null;
  hostPlaysDescription: Record<HostParticipation, string>;
  minPlayers: number;
  maxPlayers: number;
};

const DEFAULT_HOST_PLAYS_DESCRIPTION: Record<HostParticipation, string> = {
  PLAYER: "Host joins as a player (great for remote games)",
  DISPLAY_ONLY: "Host runs the game as a display/controller only (TV mode)",
};

export const GAME_TYPE_OPTIONS_BY_ID = {
  SLOPLASH: {
    displayName: "Slop-Lash",
    description: "Quiplash-style comedy game with AI opponents and a game narrator",
    supportsNarrator: true,
    supportsAiPlayers: true,
    timerToggle: {
      label: "Disable Timers",
      description: "Phases only advance when all players submit or host skips",
    },
    hostPlaysDescription: DEFAULT_HOST_PLAYS_DESCRIPTION,
    minPlayers: SLOPLASH_MIN_PLAYERS,
    maxPlayers: SLOPLASH_MAX_PLAYERS,
  },
  AI_CHAT_SHOWDOWN: {
    displayName: "ChatSlop",
    description: "AI group chat game — one prompt, everyone competes, no spectators",
    supportsNarrator: false,
    supportsAiPlayers: true,
    timerToggle: null,
    hostPlaysDescription: DEFAULT_HOST_PLAYS_DESCRIPTION,
    minPlayers: CHATSLOP_MIN_PLAYERS,
    maxPlayers: CHATSLOP_MAX_PLAYERS,
  },
  MATCHSLOP: {
    displayName: "MatchSlop",
    description: "A shared AI dating profile sprint — funniest line wins the persona over",
    supportsNarrator: false,
    supportsAiPlayers: true,
    timerToggle: null,
    hostPlaysDescription: DEFAULT_HOST_PLAYS_DESCRIPTION,
    minPlayers: MATCHSLOP_MIN_PLAYERS,
    maxPlayers: MATCHSLOP_MAX_PLAYERS,
  },
  QUIZSLOP: {
    displayName: "QuizSlop",
    description: "Adaptive party trivia: know your niche, predict your friends, share the reveal",
    supportsNarrator: false,
    supportsAiPlayers: false,
    timerToggle: {
      label: "Tutorial Mode",
      description: "Explains each beat and waits for the host throughout the game",
    },
    hostPlaysDescription: {
      PLAYER: "Host answers here and opens the shared stage in a separate tab",
      DISPLAY_ONLY: "Host opens the shared stage and does not answer (TV mode)",
    },
    minPlayers: QUIZSLOP_MIN_PLAYERS,
    maxPlayers: QUIZSLOP_MAX_PLAYERS,
  },
} satisfies Record<GameType, GameTypeOption>;

const GAME_TYPE_OPTIONS = GAME_TYPES.map((id) => ({ id, ...GAME_TYPE_OPTIONS_BY_ID[id] }));

interface HostGameModePickerProps {
  gameType: GameType;
  open: boolean;
  onGameTypeChange: (gameType: GameType) => void;
  onOpenChange: (open: boolean) => void;
}

export function HostGameModePicker({
  gameType,
  open,
  onGameTypeChange,
  onOpenChange,
}: HostGameModePickerProps) {
  const selectedGameType = GAME_TYPE_OPTIONS_BY_ID[gameType];

  return (
    <div className="mb-6">
      <p className="block text-sm font-medium text-ink-dim mb-2">Game Mode</p>
      <div>
        <motion.button
          type="button"
          onClick={() => onOpenChange(!open)}
          className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-colors cursor-pointer ${
            open
              ? "border-punch bg-punch/10 text-punch"
              : "border-edge bg-surface/80 text-ink-dim hover:border-edge-strong hover:text-ink"
          }`}
          {...buttonTap}
        >
          <span className="flex items-center justify-between">
            <span className="min-w-0">
              <span className={`text-sm font-semibold block ${open ? "text-punch" : "text-ink"}`}>
                {selectedGameType.displayName}
              </span>
              <span
                className={`text-[11px] leading-snug block mt-0.5 ${open ? "text-punch/70" : "text-ink-dim/60"}`}
              >
                {selectedGameType.description}
              </span>
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 ml-3 transition-transform duration-200"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </motion.button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-xl border-2 border-edge bg-surface">
                {GAME_TYPE_OPTIONS.map((option) => {
                  const selected = gameType === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        onGameTypeChange(option.id);
                        onOpenChange(false);
                      }}
                      className={`w-full border-b border-edge/40 px-4 py-3 text-left transition-colors cursor-pointer last:border-b-0 ${
                        selected ? "bg-punch/10" : "hover:bg-raised/60"
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="min-w-0">
                          <span
                            className={`font-semibold text-sm block ${selected ? "text-punch" : "text-ink"}`}
                          >
                            {option.displayName}
                          </span>
                          <span className="text-[11px] text-ink-dim/60 leading-snug block mt-0.5">
                            {option.description}
                          </span>
                        </span>
                        {selected && (
                          <svg
                            className="shrink-0 text-punch ml-3"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
