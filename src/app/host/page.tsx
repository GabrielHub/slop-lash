"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { AI_MODELS, getModelByModelId, type AIModel } from "@/lib/models";
import type { TtsMode } from "@/lib/types";
import { GAME_TYPES, type GameType } from "@/games/core";
import { getNarratorVoice, NARRATOR_VOICES } from "@/games/sloplash/voices";
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
import { ModelIcon } from "@/components/model-icon";
import { ErrorBanner } from "@/components/error-banner";
import { Toggle } from "@/components/toggle";
import { fadeInUp, buttonTap, buttonTapPrimary } from "@/lib/animations";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { MATCHSLOP_IDENTITIES, type MatchSlopIdentity } from "@/games/matchslop/identities";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { persistRoomSessionResult } from "@/lib/convex-room-client";

type HostParticipation = "PLAYER" | "DISPLAY_ONLY";

type GameTypeOption = {
  displayName: string;
  description: string;
  supportsNarrator: boolean;
  supportsAiPlayers: boolean;
  /** Copy for the Disable Timers toggle, or null for modes without one. */
  timerToggleDescription: string | null;
  hostPlaysDescription: Record<HostParticipation, string>;
  minPlayers: number;
  maxPlayers: number;
};

const DEFAULT_HOST_PLAYS_DESCRIPTION: Record<HostParticipation, string> = {
  PLAYER: "Host joins as a player (great for remote games)",
  DISPLAY_ONLY: "Host runs the game as a display/controller only (TV mode)",
};

const GAME_TYPE_OPTIONS_BY_ID = {
  SLOPLASH: {
    displayName: "Slop-Lash",
    description: "Quiplash-style comedy game with AI opponents and a game narrator",
    supportsNarrator: true,
    supportsAiPlayers: true,
    timerToggleDescription: "Phases only advance when all players submit or host skips",
    hostPlaysDescription: DEFAULT_HOST_PLAYS_DESCRIPTION,
    minPlayers: SLOPLASH_MIN_PLAYERS,
    maxPlayers: SLOPLASH_MAX_PLAYERS,
  },
  AI_CHAT_SHOWDOWN: {
    displayName: "ChatSlop",
    description: "AI group chat game — one prompt, everyone competes, no spectators",
    supportsNarrator: false,
    supportsAiPlayers: true,
    timerToggleDescription: null,
    hostPlaysDescription: DEFAULT_HOST_PLAYS_DESCRIPTION,
    minPlayers: CHATSLOP_MIN_PLAYERS,
    maxPlayers: CHATSLOP_MAX_PLAYERS,
  },
  MATCHSLOP: {
    displayName: "MatchSlop",
    description: "A shared AI dating profile sprint — funniest line wins the persona over",
    supportsNarrator: false,
    supportsAiPlayers: true,
    timerToggleDescription: null,
    hostPlaysDescription: DEFAULT_HOST_PLAYS_DESCRIPTION,
    minPlayers: MATCHSLOP_MIN_PLAYERS,
    maxPlayers: MATCHSLOP_MAX_PLAYERS,
  },
  QUIZSLOP: {
    displayName: "QuizSlop",
    description: "Party trivia where everyone picks topics, answers, and calls who will nail it",
    supportsNarrator: false,
    supportsAiPlayers: false,
    timerToggleDescription: "Phases wait for every eligible player or the host to advance",
    hostPlaysDescription: {
      PLAYER: "Host answers here and opens the shared stage in a separate tab",
      DISPLAY_ONLY: "Host opens the shared stage and does not answer (TV mode)",
    },
    minPlayers: QUIZSLOP_MIN_PLAYERS,
    maxPlayers: QUIZSLOP_MAX_PLAYERS,
  },
} satisfies Record<GameType, GameTypeOption>;

const GAME_TYPE_OPTIONS = GAME_TYPES.map((id) => ({ id, ...GAME_TYPE_OPTIONS_BY_ID[id] }));

const MATCHSLOP_IDENTITY_OPTIONS: { id: MatchSlopIdentity; label: string }[] =
  MATCHSLOP_IDENTITIES.map((id) => ({
    id,
    label: id === "NON_BINARY" ? "Non-binary" : id.charAt(0) + id.slice(1).toLowerCase(),
  }));

function PlayerCountHint({
  total,
  minPlayers,
  maxPlayers,
  humanOnly = false,
}: {
  total: number;
  minPlayers: number;
  maxPlayers: number;
  humanOnly?: boolean;
}) {
  const remaining = maxPlayers - total;

  if (remaining <= 0) return null;

  if (humanOnly) {
    const needed = minPlayers - total;
    if (needed > 0) {
      return (
        <p className="text-xs text-gold/85 mb-3">
          {needed} more human {needed === 1 ? "needs" : "players need"} to join before starting
        </p>
      );
    }
  } else {
    if (total > 0 && total % 2 !== 0) {
      return (
        <p className="text-xs text-gold/85 mb-3">1 more player needs to join for even teams</p>
      );
    }
    if (total < minPlayers) return null;
  }

  return (
    <p className="text-xs text-ink-dim/50 mb-3">
      {remaining} open {remaining === 1 ? "slot" : "slots"} for more players
    </p>
  );
}

const NAME_MAX_LENGTH = 20;

function getCostTier(model: AIModel): string {
  const perGame =
    ((3 * 8 * 100) / 1_000_000) * model.inputPer1M + ((3 * 8 * 50) / 1_000_000) * model.outputPer1M;
  if (perGame < 0.001) return "$";
  if (perGame < 0.005) return "$$";
  return "$$$";
}

export default function HostPage() {
  const router = useRouter();
  const createRoom = useAction(api.rooms.create);
  const { triggerElement } = usePixelDissolve();
  const [gameType, setGameType] = useState<GameType>("SLOPLASH");
  const [hostSecret, setHostSecret] = useState("");
  const [hostName, setHostName] = useState("");
  const [hostParticipation, setHostParticipation] = useState<HostParticipation>("PLAYER");
  const [seekerIdentity, setSeekerIdentity] = useState<MatchSlopIdentity>("MAN");
  const [personaIdentity, setPersonaIdentity] = useState<MatchSlopIdentity>("WOMAN");
  const [personaModelId, setPersonaModelId] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [timersDisabled, setTimersDisabled] = useState(false);
  const [ttsMode, setTtsMode] = useState<TtsMode>("OFF");
  const [ttsVoice, setTtsVoice] = useState("RANDOM");
  const [gameModePickerOpen, setGameModePickerOpen] = useState(false);
  const [personaModelPickerOpen, setPersonaModelPickerOpen] = useState(false);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedGameType = GAME_TYPE_OPTIONS_BY_ID[gameType];
  const isMatchSlop = gameType === "MATCHSLOP";
  const isQuizSlop = gameType === "QUIZSLOP";
  const selectedPersonaModel = personaModelId ? getModelByModelId(personaModelId) : undefined;
  const maxAiPlayers = selectedGameType.maxPlayers - (hostParticipation === "PLAYER" ? 1 : 0);
  // Modes without AI players keep any prior selection in state (so switching
  // back restores it) but must never count or submit it.
  const activeAiModels = selectedGameType.supportsAiPlayers ? selectedModels : [];
  const activePlayerCount = (hostParticipation === "PLAYER" ? 1 : 0) + activeAiModels.length;

  function toggleModel(modelId: string) {
    const targetModel = getModelByModelId(modelId);
    if (!targetModel) return;
    if (gameType === "MATCHSLOP" && modelId === personaModelId) return;

    setSelectedModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId);
      }

      const withoutSameProvider = prev.filter((id) => {
        const model = getModelByModelId(id);
        return model?.provider !== targetModel.provider;
      });

      if (withoutSameProvider.length >= maxAiPlayers) {
        return prev;
      }
      return [...withoutSameProvider, modelId];
    });
  }

  useEffect(() => {
    setSelectedModels((prev) => (prev.length <= maxAiPlayers ? prev : prev.slice(0, maxAiPlayers)));
  }, [maxAiPlayers]);

  useEffect(() => {
    if (!isMatchSlop) return;
    setHostParticipation("DISPLAY_ONLY");
    setPersonaModelId((prev) => prev ?? AI_MODELS[0]?.id ?? null);
  }, [isMatchSlop]);

  useEffect(() => {
    if (!isMatchSlop || !personaModelId) return;
    setSelectedModels((prev) => prev.filter((id) => id !== personaModelId));
  }, [isMatchSlop, personaModelId]);

  useEffect(() => {
    if (!selectedGameType.supportsNarrator) {
      setTtsMode("OFF");
      setVoicePickerOpen(false);
    }
  }, [selectedGameType.supportsNarrator]);

  // MatchSlop honours timersDisabled but never shows the toggle, so a value set
  // on another mode would otherwise follow the host across the picker unseen.
  useEffect(() => {
    if (selectedGameType.timerToggleDescription === null) {
      setTimersDisabled(false);
    }
  }, [selectedGameType.timerToggleDescription]);

  useEffect(() => {
    if (!isMatchSlop) {
      setPersonaModelPickerOpen(false);
    }
  }, [isMatchSlop]);

  async function createGame() {
    if (!hostSecret.trim()) {
      setError("Enter the host password");
      return;
    }
    if (hostParticipation === "PLAYER" && !hostName.trim()) {
      setError("Enter your name");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const room = await createRoom({
        aiModelIds: activeAiModels,
        gameType,
        hostName: hostName.trim() || undefined,
        hostParticipation,
        hostSecret: hostSecret.trim(),
        personaIdentity: isMatchSlop ? personaIdentity : undefined,
        personaModelId: isMatchSlop ? (personaModelId ?? undefined) : undefined,
        seekerIdentity: isMatchSlop ? seekerIdentity : undefined,
        timersDisabled,
        ttsMode: isQuizSlop ? undefined : ttsMode,
        ttsVoice: !isQuizSlop && ttsMode === "ON" ? ttsVoice : undefined,
      });
      persistRoomSessionResult(room);
      // A QuizSlop playing host answers on a private controller and opens the
      // shared stage separately; a display-only host goes straight to stage.
      router.push(
        room.playerId === null
          ? `/stage/${room.roomCode}`
          : isQuizSlop
            ? `/controller/${room.roomCode}`
            : `/game/${room.roomCode}`,
      );
    } catch (error) {
      setError(getConvexErrorMessage(error, "Failed to create game"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-svh flex flex-col items-center sm:justify-center px-6 py-12 pt-20">
      <motion.div
        className={`w-full max-w-md lg:max-w-3xl ${isMatchSlop ? "xl:max-w-5xl" : ""}`}
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-ink-dim hover:text-ink transition-colors mb-8 text-sm font-medium"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="font-display text-3xl sm:text-4xl font-bold mb-8 text-ink">Host a Game</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createGame();
          }}
          className="flex flex-col lg:flex-row lg:gap-x-12 lg:items-start"
        >
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <p className="block text-sm font-medium text-ink-dim mb-2">Game Mode</p>
              <div>
                <motion.button
                  type="button"
                  onClick={() => setGameModePickerOpen((open) => !open)}
                  className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-colors cursor-pointer ${
                    gameModePickerOpen
                      ? "border-punch bg-punch/10 text-punch"
                      : "border-edge bg-surface/80 text-ink-dim hover:border-edge-strong hover:text-ink"
                  }`}
                  {...buttonTap}
                >
                  <span className="flex items-center justify-between">
                    <span className="min-w-0">
                      <span
                        className={`text-sm font-semibold block ${gameModePickerOpen ? "text-punch" : "text-ink"}`}
                      >
                        {selectedGameType.displayName}
                      </span>
                      <span
                        className={`text-[11px] leading-snug block mt-0.5 ${gameModePickerOpen ? "text-punch/70" : "text-ink-dim/60"}`}
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
                      style={{ transform: gameModePickerOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </motion.button>

                <AnimatePresence>
                  {gameModePickerOpen && (
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
                                setGameType(option.id);
                                setGameModePickerOpen(false);
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

            {isMatchSlop && (
              <div className="mb-6">
                <p className="block text-sm font-medium text-ink-dim mb-1">Dating Setup</p>
                <p className="text-xs text-ink-dim/50 mb-3">
                  Sets the shared persona framing for the whole table.
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-ink-dim/70 w-20 shrink-0">
                      I&apos;m a
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                      {MATCHSLOP_IDENTITY_OPTIONS.map((identity) => {
                        const selected = seekerIdentity === identity.id;
                        return (
                          <motion.button
                            key={identity.id}
                            type="button"
                            onClick={() => setSeekerIdentity(identity.id)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                              selected
                                ? "bg-punch/15 text-punch ring-1 ring-punch/40"
                                : "bg-surface/80 text-ink-dim ring-1 ring-edge hover:ring-edge-strong hover:text-ink"
                            }`}
                            {...buttonTap}
                          >
                            {identity.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-ink-dim/70 w-20 shrink-0">
                      Looking for
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                      {MATCHSLOP_IDENTITY_OPTIONS.map((identity) => {
                        const selected = personaIdentity === identity.id;
                        return (
                          <motion.button
                            key={identity.id}
                            type="button"
                            onClick={() => setPersonaIdentity(identity.id)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                              selected
                                ? "bg-punch/15 text-punch ring-1 ring-punch/40"
                                : "bg-surface/80 text-ink-dim ring-1 ring-edge hover:ring-edge-strong hover:text-ink"
                            }`}
                            {...buttonTap}
                          >
                            {identity.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6">
              <label htmlFor="host-secret" className="block text-sm font-medium text-ink-dim mb-2">
                Host Password
              </label>
              <input
                id="host-secret"
                type="password"
                value={hostSecret}
                onChange={(e) => setHostSecret(e.target.value)}
                placeholder="Enter host password"
                className="w-full py-3 px-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
                autoComplete="current-password"
                enterKeyHint="next"
              />
            </div>

            <div className="mb-6">
              {hostParticipation === "PLAYER" ? (
                <>
                  <label
                    htmlFor="host-player-name"
                    className="flex items-baseline justify-between text-sm font-medium text-ink-dim mb-2"
                  >
                    Your Name
                    {hostName.length >= 15 && (
                      <span
                        className={`text-xs tabular-nums ${hostName.length >= NAME_MAX_LENGTH ? "text-punch" : "text-ink-dim/50"}`}
                      >
                        {hostName.length}/{NAME_MAX_LENGTH}
                      </span>
                    )}
                  </label>
                  <input
                    id="host-player-name"
                    type="text"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full py-3 px-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
                    maxLength={NAME_MAX_LENGTH}
                    autoComplete="name"
                    autoCapitalize="words"
                    enterKeyHint="done"
                  />
                </>
              ) : (
                <div className="rounded-xl border border-edge bg-surface/60 px-4 py-3 text-sm text-ink-dim">
                  TV mode does not create a host player, so no host name is needed.
                </div>
              )}
            </div>

            {isMatchSlop && (
              <div className="mb-6">
                <p className="block text-sm font-medium text-ink-dim mb-3">Persona Model</p>
                <div>
                  <motion.button
                    type="button"
                    onClick={() => setPersonaModelPickerOpen((open) => !open)}
                    className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-colors cursor-pointer ${
                      personaModelPickerOpen
                        ? "border-punch bg-punch/10 text-punch"
                        : "border-edge bg-surface/80 text-ink-dim hover:border-edge-strong hover:text-ink"
                    }`}
                    {...buttonTap}
                  >
                    <span className="flex items-center gap-3">
                      {selectedPersonaModel ? (
                        <ModelIcon model={selectedPersonaModel} size={22} className="shrink-0" />
                      ) : (
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-raised text-[10px] font-bold text-ink-dim">
                          ?
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span
                            className={`truncate text-sm font-semibold ${personaModelPickerOpen ? "text-punch" : "text-ink"}`}
                          >
                            {selectedPersonaModel?.name ?? "Pick model"}
                          </span>
                          {selectedPersonaModel && (
                            <span className="shrink-0 text-xs text-ink-dim/60">
                              {selectedPersonaModel.provider}
                            </span>
                          )}
                        </span>
                        <span
                          className={`mt-0.5 block text-xs ${personaModelPickerOpen ? "text-punch/70" : "text-ink-dim/70"}`}
                        >
                          Persona runs on this model. AI teammates stay in the list on the right.
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
                        className="shrink-0 transition-transform duration-200"
                        style={{
                          transform: personaModelPickerOpen ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </motion.button>

                  <AnimatePresence>
                    {personaModelPickerOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border-2 border-edge bg-surface">
                          {AI_MODELS.map((model) => {
                            const selected = personaModelId === model.id;
                            const teammateSelected = selectedModels.includes(model.id);
                            return (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => {
                                  setPersonaModelId(model.id);
                                  setSelectedModels((prev) => prev.filter((id) => id !== model.id));
                                  setPersonaModelPickerOpen(false);
                                }}
                                className={`w-full border-b border-edge/40 px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                                  selected ? "bg-punch/10" : "hover:bg-raised/60"
                                }`}
                              >
                                <span className="flex items-center gap-3">
                                  <ModelIcon model={model} size={20} className="shrink-0" />
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline gap-2">
                                      <span
                                        className={`truncate text-sm font-semibold ${selected ? "text-punch" : "text-ink"}`}
                                      >
                                        {model.name}
                                      </span>
                                      <span className="shrink-0 text-xs text-ink-dim/60">
                                        {model.provider}
                                      </span>
                                    </span>
                                    <span className="mt-0.5 flex items-center gap-2 text-xs">
                                      <span
                                        className={`font-mono ${selected ? "text-punch/70" : "text-ink-dim/60"}`}
                                      >
                                        {getCostTier(model)}
                                      </span>
                                      {teammateSelected && (
                                        <span
                                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                            selected
                                              ? "bg-punch/15 text-punch"
                                              : "bg-raised text-ink-dim"
                                          }`}
                                        >
                                          In AI lineup
                                        </span>
                                      )}
                                    </span>
                                  </span>
                                  {selected && (
                                    <svg
                                      className="shrink-0 text-punch"
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
            )}

            {selectedGameType.timerToggleDescription && (
              <div className="mb-6">
                <Toggle
                  checked={timersDisabled}
                  onChange={setTimersDisabled}
                  label="Disable Timers"
                  description={selectedGameType.timerToggleDescription}
                />
              </div>
            )}

            {!isMatchSlop && (
              <div className="mb-6">
                <Toggle
                  checked={hostParticipation === "PLAYER"}
                  onChange={(v) => setHostParticipation(v ? "PLAYER" : "DISPLAY_ONLY")}
                  label="Host Plays Too"
                  description={selectedGameType.hostPlaysDescription[hostParticipation]}
                />
              </div>
            )}

            {selectedGameType.supportsNarrator && (
              <div className="mb-6">
                <Toggle
                  checked={ttsMode === "ON"}
                  onChange={(v) => setTtsMode(v ? "ON" : "OFF")}
                  label="Game Narrator"
                  description="AI game-show host narrates the entire game aloud"
                >
                  <AnimatePresence>
                    {ttsMode === "ON" && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3">
                          <div className="flex gap-2">
                            <motion.button
                              type="button"
                              onClick={() => {
                                setTtsVoice("RANDOM");
                                setVoicePickerOpen(false);
                              }}
                              className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-semibold text-center transition-colors cursor-pointer ${
                                ttsVoice === "RANDOM"
                                  ? "bg-punch/15 border-punch text-punch"
                                  : "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                              }`}
                              {...buttonTap}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="16 3 21 3 21 8" />
                                  <line x1="4" y1="20" x2="21" y2="3" />
                                  <polyline points="21 16 21 21 16 21" />
                                  <line x1="15" y1="15" x2="21" y2="21" />
                                  <line x1="4" y1="4" x2="9" y2="9" />
                                </svg>
                                Random
                              </span>
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={() => setVoicePickerOpen((v) => !v)}
                              className={`py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition-colors cursor-pointer ${
                                ttsVoice !== "RANDOM"
                                  ? "bg-punch/15 border-punch text-punch"
                                  : "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                              }`}
                              {...buttonTap}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {ttsVoice !== "RANDOM"
                                  ? (getNarratorVoice(ttsVoice)?.name ?? "Pick Voice")
                                  : "Pick Voice"}
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="transition-transform duration-200"
                                  style={{
                                    transform: voicePickerOpen ? "rotate(180deg)" : "rotate(0deg)",
                                  }}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </span>
                            </motion.button>
                          </div>

                          <AnimatePresence>
                            {voicePickerOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border-2 border-edge bg-surface">
                                  {NARRATOR_VOICES.map((voice) => {
                                    const selected = ttsVoice === voice.id;
                                    return (
                                      <button
                                        key={voice.id}
                                        type="button"
                                        onClick={() => {
                                          setTtsVoice(voice.id);
                                          setVoicePickerOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer border-b border-edge/40 last:border-b-0 ${
                                          selected ? "bg-punch/10" : "hover:bg-raised/60"
                                        }`}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span
                                              className={`font-semibold text-sm ${selected ? "text-punch" : "text-ink"}`}
                                            >
                                              {voice.name}
                                            </span>
                                            <span
                                              className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                                                selected
                                                  ? "bg-punch/15 text-punch"
                                                  : "bg-raised text-ink-dim"
                                              }`}
                                            >
                                              {voice.trait}
                                            </span>
                                          </div>
                                          <p
                                            className={`text-xs mt-0.5 leading-snug ${selected ? "text-punch/70" : "text-ink-dim"}`}
                                          >
                                            {voice.description}
                                          </p>
                                        </div>
                                        {selected && (
                                          <svg
                                            className="shrink-0 text-punch"
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
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Toggle>
              </div>
            )}

            <ErrorBanner error={error} />

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full bg-punch/90 backdrop-blur-sm hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 px-8 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              onClick={(e) => triggerElement(e.currentTarget)}
              {...buttonTapPrimary}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Creating...
                </span>
              ) : (
                "Create Game"
              )}
            </motion.button>
          </div>

          <div className="mb-8 lg:mb-0 lg:w-[340px] xl:w-[380px] shrink-0">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-sm font-medium text-ink-dim">
                {selectedGameType.supportsAiPlayers ? "Add AI Players" : "Human Players"}
              </span>
              <span className="text-sm font-semibold tabular-nums text-ink-dim">
                {activePlayerCount}
                <span className="text-ink-dim/50">/{selectedGameType.maxPlayers}</span>
                <span className="text-xs font-normal text-ink-dim/50 ml-1">
                  {selectedGameType.supportsAiPlayers ? "active players" : "initial players"}
                </span>
              </span>
            </div>
            <PlayerCountHint
              total={activePlayerCount}
              minPlayers={selectedGameType.minPlayers}
              maxPlayers={selectedGameType.maxPlayers}
              humanOnly={!selectedGameType.supportsAiPlayers}
            />
            {!selectedGameType.supportsAiPlayers ? (
              <div className="rounded-xl border-2 border-edge bg-surface/80 p-5 text-sm text-ink-dim">
                <p className="font-semibold text-ink">
                  {selectedGameType.displayName} is for {selectedGameType.minPlayers}–
                  {selectedGameType.maxPlayers} humans.
                </p>
                <p className="mt-2 leading-relaxed">
                  Create the room, put the stage on the shared screen, then have everyone join on
                  their own device. Each player privately picks a topic and answers from their
                  controller.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {AI_MODELS.map((model) => {
                  const selected = selectedModels.includes(model.id);
                  const replacesSameProvider =
                    !selected &&
                    selectedModels.some((id) => {
                      const selectedModel = getModelByModelId(id);
                      return selectedModel?.provider === model.provider;
                    });
                  const atLimit =
                    selectedModels.length >= maxAiPlayers && !selected && !replacesSameProvider;

                  let stateClass: string;
                  if (selected) {
                    stateClass = "bg-ai-soft/80 backdrop-blur-sm border-ai text-ink";
                  } else if (atLimit) {
                    stateClass = "bg-surface/80 backdrop-blur-sm border-edge text-ink-dim/30";
                  } else {
                    stateClass =
                      "bg-surface/80 backdrop-blur-sm border-edge text-ink-dim hover:border-edge-strong hover:text-ink";
                  }

                  return (
                    <motion.button
                      type="button"
                      key={model.id}
                      onClick={() => toggleModel(model.id)}
                      disabled={atLimit}
                      className={`p-3 rounded-xl border-2 text-left transition-colors flex items-center gap-3 cursor-pointer disabled:cursor-not-allowed ${stateClass}`}
                      layout
                      {...buttonTap}
                    >
                      <ModelIcon model={model} size={24} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm truncate">{model.name}</span>
                          <span className="text-xs text-ink-dim/60 shrink-0">{model.provider}</span>
                        </div>
                        <span className="text-[11px] text-ink-dim/50 font-mono">
                          {getCostTier(model)}
                        </span>
                      </div>
                      {selected && (
                        <svg
                          className="ml-auto shrink-0 text-ai"
                          width="18"
                          height="18"
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
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </form>
      </motion.div>
    </main>
  );
}
