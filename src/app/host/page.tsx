"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { AI_MODELS, type AIModel } from "@/lib/models";
import type { TtsMode, TtsVoice } from "@/lib/types";
import { ModelIcon } from "@/components/model-icon";
import { MAX_PLAYERS } from "@/lib/game-constants";
import { ErrorBanner } from "@/components/error-banner";
import { fadeInUp, buttonTap, buttonTapPrimary } from "@/lib/animations";

export default function HostPage() {
  const router = useRouter();
  const [hostSecret, setHostSecret] = useState("");
  const [hostName, setHostName] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [timersDisabled, setTimersDisabled] = useState(false);
  const [ttsMode, setTtsMode] = useState<TtsMode>("OFF");
  const [ttsVoice, setTtsVoice] = useState<TtsVoice>("MALE");
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
        className="w-full max-w-md"
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

        <h1 className="font-display text-3xl sm:text-4xl font-bold mb-10">
          Host a Game
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createGame();
          }}
        >
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
            <label className="block text-sm font-medium text-ink-dim mb-2">
              Your Name
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

          {/* AI Opponents */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-ink-dim mb-1">
              Add AI Players
            </label>
            <p className="text-xs text-ink-dim/60 mb-4">
              {selectedModels.length}/{maxAiPlayers} selected
            </p>
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
            {ttsMode === "AI_VOICE" && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {(
                  [
                    { value: "MALE", label: "Male" },
                    { value: "FEMALE", label: "Female" },
                  ] as const
                ).map((opt) => (
                  <motion.button
                    key={opt.value}
                    type="button"
                    onClick={() => setTtsVoice(opt.value)}
                    className={`py-2 px-3 rounded-xl border-2 text-sm font-semibold text-center transition-colors cursor-pointer ${
                      ttsVoice === opt.value
                        ? "bg-punch/15 backdrop-blur-sm border-punch text-punch"
                        : "bg-surface/80 backdrop-blur-sm border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                    }`}
                    {...buttonTap}
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          <ErrorBanner error={error} />

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={loading}
            className="w-full bg-punch/90 backdrop-blur-sm hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 px-8 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            {...buttonTapPrimary}
          >
            {loading ? "Creating..." : "Create Game"}
          </motion.button>
        </form>
      </motion.div>
    </main>
  );
}
