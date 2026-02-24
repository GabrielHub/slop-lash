"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameState, filterCastVotes } from "@/lib/types";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { getPlayerColor } from "@/lib/player-colors";

export interface BestPrompt {
  promptText: string;
  responseText: string;
  playerName: string;
  playerType: "HUMAN" | "AI";
  playerModelId: string | null;
  votePct: number;
  roundNumber: number;
}

export function extractBestPrompts(game: GameState): BestPrompt[] {
  const results: BestPrompt[] = [];

  for (const round of game.rounds) {
    for (const prompt of round.prompts) {
      const actualVotes = filterCastVotes(prompt.votes);
      const totalVotes = actualVotes.length;
      if (totalVotes === 0) continue;

      const voteCounts = new Map<string, number>();
      for (const v of actualVotes) {
        voteCounts.set(v.responseId, (voteCounts.get(v.responseId) ?? 0) + 1);
      }

      // Find winning response
      let bestRespId = "";
      let bestCount = 0;
      for (const [respId, count] of voteCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestRespId = respId;
        }
      }

      const winningResp = prompt.responses.find((r) => r.id === bestRespId);
      if (!winningResp) continue;

      const pct = Math.round((bestCount / totalVotes) * 100);

      results.push({
        promptText: prompt.text,
        responseText: winningResp.text,
        playerName: winningResp.player.name,
        playerType: winningResp.player.type,
        playerModelId: winningResp.player.modelId ?? null,
        votePct: pct,
        roundNumber: round.roundNumber,
      });
    }
  }

  results.sort((a, b) => b.votePct - a.votePct);
  return results.slice(0, 5);
}

export function BestPromptsCarousel({ prompts }: { prompts: BestPrompt[] }) {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % prompts.length);
  }, [prompts.length]);

  // Auto-rotate every 4 seconds
  useEffect(() => {
    if (prompts.length <= 1) return;
    const interval = setInterval(next, 4000);
    return () => clearInterval(interval);
  }, [prompts.length, next]);

  if (prompts.length === 0) return null;

  const item = prompts[current];
  const model =
    item.playerType === "AI" && item.playerModelId
      ? getModelByModelId(item.playerModelId)
      : null;

  return (
    <div className="relative">
      {/* Card area */}
      <div className="relative overflow-hidden rounded-xl min-h-[160px]">
        {/* Tap zones for prev/next on mobile */}
        {prompts.length > 1 && (
          <>
            <button
              className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
              aria-label="Previous"
              onClick={() =>
                setCurrent(
                  (c) => (c - 1 + prompts.length) % prompts.length
                )
              }
            />
            <button
              className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
              aria-label="Next"
              onClick={next}
            />
          </>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="p-4 sm:p-5 rounded-xl bg-surface/80 backdrop-blur-md border-2 border-edge"
            style={{ boxShadow: "var(--shadow-card)" }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
          >
            {/* Prompt text */}
            <p className="font-display font-semibold text-base text-gold mb-3 leading-snug">
              {item.promptText}
            </p>

            {/* Winning response */}
            <p className="text-ink font-semibold text-base sm:text-lg leading-snug mb-3">
              &ldquo;{item.responseText}&rdquo;
            </p>

            {/* Attribution row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {model ? (
                  <ModelIcon model={model} size={18} className="shrink-0" />
                ) : (
                  <span
                    className="w-[18px] h-[18px] flex items-center justify-center rounded-sm text-xs font-bold shrink-0"
                    style={{
                      color: getPlayerColor(item.playerName),
                      backgroundColor: `${getPlayerColor(item.playerName)}20`,
                    }}
                  >
                    {item.playerName[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
                <span className="text-sm text-ink-dim truncate">
                  {item.playerName}
                </span>
                <span className="text-xs text-ink-dim/70">
                  &middot; Round {item.roundNumber}
                </span>
              </div>
              <span className="font-mono font-bold text-base text-gold tabular-nums shrink-0">
                {item.votePct}%
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      {prompts.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {prompts.map((_, i) => (
            <button
              key={i}
              className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                i === current
                  ? "bg-gold w-5"
                  : "bg-edge hover:bg-ink-dim/40"
              }`}
              aria-label={`Go to prompt ${i + 1}`}
              onClick={() => setCurrent(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
