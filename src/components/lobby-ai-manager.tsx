"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AI_MODELS, getModelByModelId, type AIModel } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { buttonTap, fadeInUp, staggerContainer } from "@/lib/animations";
import type { GameState } from "@/lib/types";

function getCostTier(model: AIModel): string {
  const perGame =
    (3 * 8 * 100 / 1_000_000) * model.inputPer1M +
    (3 * 8 * 50 / 1_000_000) * model.outputPer1M;
  if (perGame < 0.001) return "$";
  if (perGame < 0.005) return "$$";
  return "$$$";
}

export function LobbyAiManager({
  game,
  code,
  maxPlayers,
}: {
  game: GameState;
  code: string;
  maxPlayers: number;
}) {
  const [open, setOpen] = useState(false);
  const [busyModels, setBusyModels] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const activePlayers = game.players.filter((p) => p.type !== "SPECTATOR");
  const aiPlayers = activePlayers.filter((p) => p.type === "AI");
  const activeAiModelIds = aiPlayers
    .map((p) => p.modelId)
    .filter((id): id is string => id != null);

  const toggleModel = useCallback(
    async (model: AIModel) => {
      if (busyModels.has(model.id)) return;

      const playerId = localStorage.getItem("playerId");
      const hostToken = localStorage.getItem("hostControlToken");
      if (!playerId && !hostToken) return;

      const existingPlayer = aiPlayers.find((p) => p.modelId === model.id);
      const isRemoving = !!existingPlayer;

      setBusyModels((prev) => new Set(prev).add(model.id));
      setError(null);
      try {
        const response = await fetch(`/api/games/${code}/ai-players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isRemoving
              ? { playerId, hostToken, action: "remove", targetPlayerId: existingPlayer.id }
              : { playerId, hostToken, action: "add", modelId: model.id },
          ),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          setError(payload?.error ?? "Unable to update AI players");
        }
      } catch {
        setError("Unable to reach the AI player controls");
      } finally {
        setBusyModels((prev) => {
          const next = new Set(prev);
          next.delete(model.id);
          return next;
        });
      }
    },
    [code, aiPlayers, busyModels],
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border-2 border-edge bg-surface/80 backdrop-blur-sm text-left transition-colors cursor-pointer hover:border-edge-strong group"
      >
        <span className="flex items-center gap-2 min-w-0">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-ai"
          >
            <path d="M12 8V4H8" />
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <path d="M2 12h20" />
            <path d="M12 2v20" />
          </svg>
          <span className="text-sm font-semibold text-ink">AI Players</span>
          <span className="text-xs font-mono tabular-nums text-ink-dim/50">
            {aiPlayers.length}
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
          className="shrink-0 text-ink-dim transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2">
              <div className="flex items-baseline justify-between mb-2 px-0.5">
                <span className="text-xs text-ink-dim/60">
                  Tap to add or remove
                </span>
                <span className="text-xs font-mono tabular-nums text-ink-dim/50">
                  {activePlayers.length}/{maxPlayers} players
                </span>
              </div>
              <motion.div
                className="grid grid-cols-1 gap-1.5"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {AI_MODELS.map((model) => {
                  const selected = activeAiModelIds.includes(model.id);
                  const busy = busyModels.has(model.id);
                  const replacesSameProvider =
                    !selected &&
                    activeAiModelIds.some((id) => {
                      const m = getModelByModelId(id);
                      return m?.provider === model.provider;
                    });
                  const atLimit =
                    activePlayers.length >= maxPlayers &&
                    !selected &&
                    !replacesSameProvider;

                  let stateClass: string;
                  if (selected) {
                    stateClass =
                      "bg-ai-soft/80 backdrop-blur-sm border-ai text-ink";
                  } else if (atLimit) {
                    stateClass =
                      "bg-surface/80 backdrop-blur-sm border-edge text-ink-dim/30";
                  } else {
                    stateClass =
                      "bg-surface/80 backdrop-blur-sm border-edge text-ink-dim hover:border-edge-strong hover:text-ink";
                  }

                  return (
                    <motion.button
                      type="button"
                      key={model.id}
                      onClick={() => void toggleModel(model)}
                      disabled={atLimit || busy}
                      className={`p-2.5 rounded-xl border-2 text-left transition-colors flex items-center gap-2.5 cursor-pointer disabled:cursor-not-allowed ${stateClass}`}
                      variants={fadeInUp}
                      layout
                      {...buttonTap}
                    >
                      <div className="relative shrink-0">
                        <ModelIcon
                          model={model}
                          size={22}
                          className={busy ? "opacity-40" : ""}
                        />
                        {busy && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg
                              className="animate-spin text-ink-dim"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
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
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-sm truncate">
                            {model.shortName}
                          </span>
                          <span className="text-[11px] text-ink-dim/50 shrink-0">
                            {model.provider}
                          </span>
                        </div>
                        <span className="text-[10px] text-ink-dim/40 font-mono">
                          {getCostTier(model)}
                        </span>
                      </div>
                      {selected && !busy && (
                        <svg
                          className="ml-auto shrink-0 text-ai"
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
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>
            {error ? (
              <p className="mt-2 px-0.5 text-xs text-fail">{error}</p>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
