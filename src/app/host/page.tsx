"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { AI_MODELS, type AIModel } from "@/lib/models";
import type { TtsMode } from "@/lib/types";
import { GEMINI_VOICES } from "@/lib/voices";
import { ModelIcon } from "@/components/model-icon";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/game-constants";
import { ErrorBanner } from "@/components/error-banner";
import { fadeInUp, buttonTap, buttonTapPrimary } from "@/lib/animations";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";

function PlayerCountHint({ selectedCount }: { selectedCount: number }) {
  const total = 1 + selectedCount;
  const remaining = MAX_PLAYERS - total;

  if (remaining <= 0) return null;

  if (total % 2 !== 0) {
    return (
      <p className="text-xs text-amber-400/80 mb-3">
        1 more player needs to join for even teams
      </p>
    );
  }

  if (total >= MIN_PLAYERS) {
    return (
      <p className="text-xs text-ink-dim/50 mb-3">
        {remaining} open {remaining === 1 ? "slot" : "slots"} for more players
      </p>
    );
  }

  return null;
}

export default function HostPage() {
  const router = useRouter();
  const { triggerElement } = usePixelDissolve();
  const [hostSecret, setHostSecret] = useState("");
  const [hostName, setHostName] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [timersDisabled, setTimersDisabled] = useState(false);
  const [ttsMode, setTtsMode] = useState<TtsMode>("OFF");
  const [ttsVoice, setTtsVoice] = useState("RANDOM");
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const maxAiPlayers = MAX_PLAYERS - 1; // Reserve 1 slot for the host

  function getCostTier(model: AIModel): string {
    // Estimate per-game cost: ~3 rounds * 8 prompts * (~100 input + 50 output tokens)
    const perGame =
      (3 * 8 * 100 / 1_000_000) * model.inputPer1M +
      (3 * 8 * 50 / 1_000_000) * model.outputPer1M;
    if (perGame < 0.001) return "$";
    if (perGame < 0.005) return "$$";
    return "$$$";
  }

  function toggleModel(modelId: string) {
    setSelectedModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId);
      }
      if (prev.length >= maxAiPlayers) {
        return prev;
      }
      return [...prev, modelId];
    });
  }

  async function createGame() {
    if (!hostSecret.trim()) {
      setError("Enter the host password");
      return;
    }
    if (!hostName.trim()) {
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
          hostSecret: hostSecret.trim(),
          hostName: hostName.trim(),
          aiModelIds: selectedModels,
          timersDisabled,
          ttsMode,
          ttsVoice: ttsMode === "AI_VOICE" ? ttsVoice : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create game");
        return;
      }

      localStorage.setItem("playerId", data.hostPlayerId);
      localStorage.setItem("playerName", hostName.trim());
      if (data.rejoinToken) {
        localStorage.setItem("rejoinToken", data.rejoinToken);
      }
      router.push(`/game/${data.roomCode}`);
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
        {/* Back link */}
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
          {/* Left top: Identity fields */}
          <div>
            {/* Password */}
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

            {/* Name */}
            <div className="mb-8">
              <label className="flex items-baseline justify-between text-sm font-medium text-ink-dim mb-2">
                Your Name
                {hostName.length >= 15 && (
                  <span className={`text-xs tabular-nums ${hostName.length >= 20 ? "text-punch" : "text-ink-dim/50"}`}>
                    {hostName.length}/{20}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Enter your name"
                className="w-full py-3 px-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
                maxLength={20}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="done"
              />
            </div>
          </div>

          {/* Right column: AI Opponents (spans full height on desktop) */}
          <div className="mb-8 lg:mb-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div className="flex items-baseline justify-between mb-3">
              <label className="text-sm font-medium text-ink-dim">
                Add AI Players
              </label>
              <span className="text-sm font-semibold tabular-nums text-ink-dim">
                {1 + selectedModels.length}
                <span className="text-ink-dim/50">/{MAX_PLAYERS}</span>
                <span className="text-xs font-normal text-ink-dim/50 ml-1">players</span>
              </span>
            </div>
            <PlayerCountHint selectedCount={selectedModels.length} />
            <div className="grid grid-cols-1 gap-2">
              {AI_MODELS.map((model) => {
                const selected = selectedModels.includes(model.id);
                const atLimit = selectedModels.length >= maxAiPlayers && !selected;

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

          {/* Left bottom: Game options + submit */}
          <div>
            {/* Disable Timers */}
            <div className="mb-8">
              <button
                type="button"
                onClick={() => setTimersDisabled((v) => !v)}
                className="w-full p-3 rounded-xl border-2 text-left transition-colors flex items-center gap-3 cursor-pointer bg-surface/80 backdrop-blur-sm border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
              >
                <div
                  className={`relative w-10 h-6 rounded-full transition-colors ${timersDisabled ? "bg-punch" : "bg-edge-strong"}`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${timersDisabled ? "translate-x-[18px]" : "translate-x-0.5"}`}
                  />
                </div>
                <div>
                  <span className="font-semibold text-sm">Disable Timers</span>
                  <p className="text-xs text-ink-dim/60">
                    Phases only advance when all players submit or host skips
                  </p>
                </div>
              </button>
            </div>

            {/* Voice Readout */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-ink-dim mb-1">
                Voice Readout
              </label>
              <p className="text-xs text-ink-dim/60 mb-3">
                Read prompts and responses aloud during voting
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: "OFF", label: "Off" },
                    { value: "AI_VOICE", label: "AI Voice" },
                    { value: "BROWSER_VOICE", label: "Browser" },
                  ] as const
                ).map((opt) => (
                  <motion.button
                    key={opt.value}
                    type="button"
                    onClick={() => setTtsMode(opt.value)}
                    className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold text-center transition-colors cursor-pointer ${
                      ttsMode === opt.value
                        ? "bg-punch/15 backdrop-blur-sm border-punch text-punch"
                        : "bg-surface/80 backdrop-blur-sm border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                    }`}
                    {...buttonTap}
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </div>

              {/* Voice picker (AI Voice only) */}
              <AnimatePresence>
                {ttsMode === "AI_VOICE" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3">
                      {/* Random default + expand toggle */}
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

                      {/* Expandable voice list */}
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
            </div>

            <ErrorBanner error={error} />

            {/* Submit */}
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
