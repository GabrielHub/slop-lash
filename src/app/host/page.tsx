"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { AI_MODELS, getModelByModelId, type AIModel } from "@/lib/models";
import type { TtsMode } from "@/lib/types";
import type { GameType } from "@/games/core";
import { GEMINI_VOICES } from "@/games/sloplash/voices";
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
import { ModelIcon } from "@/components/model-icon";
import { ErrorBanner } from "@/components/error-banner";
import { Toggle } from "@/components/toggle";
import { fadeInUp, buttonTap, buttonTapPrimary } from "@/lib/animations";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { MATCHSLOP_IDENTITIES, type MatchSlopIdentity } from "@/games/matchslop/identities";

type HostParticipation = "PLAYER" | "DISPLAY_ONLY";

const GAME_TYPE_OPTIONS: {
  id: GameType;
  displayName: string;
  description: string;
  supportsNarrator: boolean;
  minPlayers: number;
  maxPlayers: number;
}[] = [
  {
    id: "SLOPLASH",
    displayName: "Slop-Lash",
    description: "Quiplash-style comedy game with AI opponents and a live narrator",
    supportsNarrator: true,
    minPlayers: SLOPLASH_MIN_PLAYERS,
    maxPlayers: SLOPLASH_MAX_PLAYERS,
  },
  {
    id: "AI_CHAT_SHOWDOWN",
    displayName: "ChatSlop",
    description: "AI group chat game — one prompt, everyone competes, no spectators",
    supportsNarrator: false,
    minPlayers: CHATSLOP_MIN_PLAYERS,
    maxPlayers: CHATSLOP_MAX_PLAYERS,
  },
  {
    id: "MATCHSLOP",
    displayName: "MatchSlop",
    description: "A shared AI dating profile sprint — funniest line wins the persona over",
    supportsNarrator: false,
    minPlayers: MATCHSLOP_MIN_PLAYERS,
    maxPlayers: MATCHSLOP_MAX_PLAYERS,
  },
];

const MATCHSLOP_IDENTITY_OPTIONS: { id: MatchSlopIdentity; label: string }[] =
  MATCHSLOP_IDENTITIES.map((id) => ({ id, label: id === "NON_BINARY" ? "Non-binary" : id.charAt(0) + id.slice(1).toLowerCase() }));

function PlayerCountHint({
  selectedCount,
  hostParticipation,
  minPlayers,
  maxPlayers,
}: {
  selectedCount: number;
  hostParticipation: HostParticipation;
  minPlayers: number;
  maxPlayers: number;
}) {
  const total = (hostParticipation === "PLAYER" ? 1 : 0) + selectedCount;
  const remaining = maxPlayers - total;

  if (remaining <= 0) return null;

  if (total > 0 && total % 2 !== 0) {
    return (
      <p className="text-xs text-gold/85 mb-3">
        1 more player needs to join for even teams
      </p>
    );
  }

  if (total >= minPlayers) {
    return (
      <p className="text-xs text-ink-dim/50 mb-3">
        {remaining} open {remaining === 1 ? "slot" : "slots"} for more players
      </p>
    );
  }

  return null;
}

const NAME_MAX_LENGTH = 20;

function getCostTier(model: AIModel): string {
  const perGame =
    (3 * 8 * 100 / 1_000_000) * model.inputPer1M +
    (3 * 8 * 50 / 1_000_000) * model.outputPer1M;
  if (perGame < 0.001) return "$";
  if (perGame < 0.005) return "$$";
  return "$$$";
}

export default function HostPage() {
  const router = useRouter();
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
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleModel(modelId: string) {
    const targetModel = getModelByModelId(modelId);
    if (!targetModel) return;
    if (gameType === "MATCHSLOP" && modelId === personaModelId) return;
    const maxSelectableAiPlayers =
      selectedGameType.maxPlayers - (hostParticipation === "PLAYER" ? 1 : 0);

    setSelectedModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId);
      }

      const withoutSameProvider = prev.filter((id) => {
        const model = getModelByModelId(id);
        return model?.provider !== targetModel.provider;
      });

      if (withoutSameProvider.length >= maxSelectableAiPlayers) {
        return prev;
      }
      return [...withoutSameProvider, modelId];
    });
  }

  const selectedGameType = GAME_TYPE_OPTIONS.find((g) => g.id === gameType) ?? GAME_TYPE_OPTIONS[0];
  const maxAiPlayers = selectedGameType.maxPlayers - (hostParticipation === "PLAYER" ? 1 : 0);
  const activePlayerCount = (hostParticipation === "PLAYER" ? 1 : 0) + selectedModels.length;
  const isMatchSlop = gameType === "MATCHSLOP";

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
      const res = await fetch("/api/games/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType,
          hostSecret: hostSecret.trim(),
          hostName: hostName.trim(),
          hostParticipation,
          aiModelIds: selectedModels,
          personaModelId: isMatchSlop ? personaModelId : undefined,
          seekerIdentity: isMatchSlop ? seekerIdentity : undefined,
          personaIdentity: isMatchSlop ? personaIdentity : undefined,
          timersDisabled,
          ttsMode,
          ttsVoice: ttsMode === "ON" ? ttsVoice : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create game");
        return;
      }

      if (data.hostControlToken) {
        localStorage.setItem("hostControlToken", data.hostControlToken);
      }
      if (typeof data.hostPlayerId === "string") {
        localStorage.setItem("playerId", data.hostPlayerId);
        localStorage.setItem("playerName", hostName.trim());
      } else {
        localStorage.removeItem("playerId");
        localStorage.removeItem("playerName");
        localStorage.removeItem("playerType");
        localStorage.removeItem("rejoinToken");
      }
      if (typeof data.hostPlayerType === "string") {
        localStorage.setItem("playerType", data.hostPlayerType);
      }
      if (data.rejoinToken) {
        localStorage.setItem("rejoinToken", data.rejoinToken);
      }
      router.push(
        typeof data.hostPlayerId !== "string"
          ? `/stage/${data.roomCode}`
          : `/game/${data.roomCode}`,
      );
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-svh flex flex-col items-center sm:justify-center px-6 py-12 pt-20">
      <motion.div
        className="w-full max-w-md lg:max-w-3xl"
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

        <h1 className="font-display text-3xl sm:text-4xl font-bold mb-10 text-ink">
          Host a Game
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createGame();
          }}
          className="flex flex-col lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12"
        >
          <div>
            <div className="mb-8">
              <label className="block text-sm font-medium text-ink-dim mb-3">
                Game Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {GAME_TYPE_OPTIONS.map((option) => {
                  const selected = gameType === option.id;
                  return (
                    <motion.button
                      type="button"
                      key={option.id}
                      onClick={() => setGameType(option.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-colors cursor-pointer ${
                        selected
                          ? "bg-punch/10 border-punch"
                          : "bg-surface/80 backdrop-blur-sm border-edge hover:border-edge-strong"
                      }`}
                      {...buttonTap}
                    >
                      <span className={`font-semibold text-sm block ${selected ? "text-punch" : "text-ink"}`}>
                        {option.displayName}
                      </span>
                      <span className="text-[11px] text-ink-dim/60 leading-snug block mt-0.5">
                        {option.description}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {isMatchSlop && (
              <div className="mb-8 space-y-4 rounded-2xl border border-edge bg-surface/60 p-4">
                <div>
                  <p className="text-sm font-medium text-ink-dim mb-2">
                    Dating Setup
                  </p>
                  <p className="text-xs text-ink-dim/70 mb-3">
                    This sets the shared persona framing for the whole table.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="block text-xs uppercase tracking-wider text-ink-dim mb-2">
                        I&apos;m
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {MATCHSLOP_IDENTITY_OPTIONS.map((identity) => {
                          const selected = seekerIdentity === identity.id;
                          return (
                            <motion.button
                              key={identity.id}
                              type="button"
                              onClick={() => setSeekerIdentity(identity.id)}
                              className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                                selected
                                  ? "bg-punch/10 border-punch text-punch"
                                  : "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                              }`}
                              {...buttonTap}
                            >
                              {identity.label}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs uppercase tracking-wider text-ink-dim mb-2">
                        Looking for
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {MATCHSLOP_IDENTITY_OPTIONS.map((identity) => {
                          const selected = personaIdentity === identity.id;
                          return (
                            <motion.button
                              key={identity.id}
                              type="button"
                              onClick={() => setPersonaIdentity(identity.id)}
                              className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                                selected
                                  ? "bg-punch/10 border-punch text-punch"
                                  : "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
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

                <div>
                  <p className="text-sm font-medium text-ink-dim mb-2">
                    Persona Model
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {AI_MODELS.map((model) => {
                      const selected = personaModelId === model.id;
                      const teammateSelected = selectedModels.includes(model.id);
                      return (
                        <motion.button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            setPersonaModelId(model.id);
                            setSelectedModels((prev) => prev.filter((id) => id !== model.id));
                          }}
                          className={`p-3 rounded-xl border-2 text-left transition-colors cursor-pointer flex items-center gap-3 ${
                            selected
                              ? "bg-punch/10 border-punch"
                              : teammateSelected
                                ? "bg-surface/60 border-edge text-ink-dim/50"
                                : "bg-surface/80 border-edge hover:border-edge-strong"
                          }`}
                          {...buttonTap}
                        >
                          <ModelIcon model={model} size={22} className="shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className={`font-semibold text-sm truncate ${selected ? "text-punch" : "text-ink"}`}>
                                {model.name}
                              </span>
                              <span className="text-xs text-ink-dim/60 shrink-0">
                                {model.provider}
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-dim/60">
                              Persona model only. Teammates use the funny prompt pool below.
                            </p>
                          </div>
                          {selected && (
                            <svg
                              className="ml-auto shrink-0 text-punch"
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
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-ink-dim mb-2">
                Host Password
              </label>
              <input
                type="password"
                value={hostSecret}
                onChange={(e) => setHostSecret(e.target.value)}
                placeholder="Enter host password"
                className="w-full py-3 px-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
                autoComplete="current-password"
                enterKeyHint="next"
              />
            </div>

            <div className="mb-8">
              {hostParticipation === "PLAYER" ? (
                <>
                  <label className="flex items-baseline justify-between text-sm font-medium text-ink-dim mb-2">
                    Your Name
                    {hostName.length >= 15 && (
                      <span className={`text-xs tabular-nums ${hostName.length >= NAME_MAX_LENGTH ? "text-punch" : "text-ink-dim/50"}`}>
                        {hostName.length}/{NAME_MAX_LENGTH}
                      </span>
                    )}
                  </label>
                  <input
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
          </div>

          <div className="mb-8 lg:mb-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div className="flex items-baseline justify-between mb-3">
              <label className="text-sm font-medium text-ink-dim">
                Add AI Players
              </label>
                <span className="text-sm font-semibold tabular-nums text-ink-dim">
                {activePlayerCount}
                <span className="text-ink-dim/50">/{selectedGameType.maxPlayers}</span>
                <span className="text-xs font-normal text-ink-dim/50 ml-1">active players</span>
              </span>
            </div>
            <PlayerCountHint
              selectedCount={selectedModels.length}
              hostParticipation={hostParticipation}
              minPlayers={selectedGameType.minPlayers}
              maxPlayers={selectedGameType.maxPlayers}
            />
            <div className="grid grid-cols-1 gap-2">
              {AI_MODELS.map((model) => {
                const selected = selectedModels.includes(model.id);
                const replacesSameProvider = !selected && selectedModels.some((id) => {
                  const selectedModel = getModelByModelId(id);
                  return selectedModel?.provider === model.provider;
                });
                const atLimit =
                  selectedModels.length >= maxAiPlayers &&
                  !selected &&
                  !replacesSameProvider;

                let stateClass: string;
                if (selected) {
                  stateClass = "bg-ai-soft/80 backdrop-blur-sm border-ai text-ink";
                } else if (atLimit) {
                  stateClass = "bg-surface/80 backdrop-blur-sm border-edge text-ink-dim/30";
                } else {
                  stateClass = "bg-surface/80 backdrop-blur-sm border-edge text-ink-dim hover:border-edge-strong hover:text-ink";
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
                        <span className="font-semibold text-sm truncate">
                          {model.name}
                        </span>
                        <span className="text-xs text-ink-dim/60 shrink-0">
                          {model.provider}
                        </span>
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
          </div>

          <div>
            {gameType === "SLOPLASH" && (
              <div className="mb-8">
                <Toggle
                  checked={timersDisabled}
                  onChange={setTimersDisabled}
                  label="Disable Timers"
                  description="Phases only advance when all players submit or host skips"
                />
              </div>
            )}

            <div className="mb-8">
              {isMatchSlop ? (
                <div className="rounded-xl border-2 border-dashed border-punch/30 bg-punch/5 p-4">
                  <p className="text-sm font-medium text-punch mb-1">
                    Host Plays Too
                  </p>
                  <p className="text-xs text-ink-dim/70">
                    MatchSlop always runs in display-only TV mode. Everyone interacts from a phone, including the host if they want to join.
                  </p>
                </div>
              ) : (
                <Toggle
                  checked={hostParticipation === "PLAYER"}
                  onChange={(v) => setHostParticipation(v ? "PLAYER" : "DISPLAY_ONLY")}
                  label="Host Plays Too"
                  description={
                    hostParticipation === "PLAYER"
                      ? "Host joins as a player (great for remote games)"
                      : "Host runs the game as a display/controller only (TV mode)"
                  }
                />
              )}
            </div>

            {selectedGameType.supportsNarrator && <div className="mb-8">
              <Toggle
                checked={ttsMode === "ON"}
                onChange={(v) => setTtsMode(v ? "ON" : "OFF")}
                label="Live Narrator"
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                            {ttsVoice !== "RANDOM" ? ttsVoice : "Pick Voice"}
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
                              style={{ transform: voicePickerOpen ? "rotate(180deg)" : "rotate(0deg)" }}
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
                              {(["female", "male"] as const).map((gender) => (
                                <div key={gender}>
                                  <div className="sticky top-0 z-10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink-dim bg-raised border-b border-edge">
                                    {gender}
                                  </div>
                                  {GEMINI_VOICES.filter((v) => v.gender === gender).map((voice) => {
                                    const selected = ttsVoice === voice.name;
                                    return (
                                      <button
                                        key={voice.name}
                                        type="button"
                                        onClick={() => {
                                          setTtsVoice(voice.name);
                                          setVoicePickerOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer border-b border-edge/40 last:border-b-0 ${
                                          selected
                                            ? "bg-punch/10"
                                            : "hover:bg-raised/60"
                                        }`}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className={`font-semibold text-sm ${selected ? "text-punch" : "text-ink"}`}>
                                              {voice.name}
                                            </span>
                                            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                                              selected
                                                ? "bg-punch/15 text-punch"
                                                : "bg-raised text-ink-dim"
                                            }`}>
                                              {voice.trait}
                                            </span>
                                          </div>
                                          <p className={`text-xs mt-0.5 leading-snug ${selected ? "text-punch/70" : "text-ink-dim"}`}>
                                            {voice.description}
                                          </p>
                                        </div>
                                        {selected && (
                                          <svg className="shrink-0 text-punch" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              </Toggle>
            </div>}

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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </span>
              ) : "Create Game"}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </main>
  );
}
