"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { GameState } from "@/lib/types";
import { getModelByModelId, getModelIconForTheme } from "@/lib/models";
import { PlayerList } from "@/components/player-list";
import { useTheme } from "@/components/theme-provider";

export function Results({
  game,
  isHost,
  code,
  isFinal,
}: {
  game: GameState;
  isHost: boolean;
  code: string;
  isFinal: boolean;
}) {
  const { theme } = useTheme();
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState("");

  const currentRound = game.rounds[0];
  const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
  const winner = sortedPlayers[0];

  async function nextRound() {
    setAdvancing(true);
    setError("");
    try {
      const res = await fetch(`/api/games/${code}/next`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to advance");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-lg animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-10">
          {isFinal ? (
            <>
              <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-punch mb-3">
                Game Over!
              </h1>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-soft border-2 border-gold/30">
                <span className="text-gold font-display font-bold text-sm sm:text-base">
                  {winner.name} wins with {winner.score} pts
                </span>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold mb-1">
                Round {game.currentRound} Results
              </h1>
              <p className="text-ink-dim text-sm">
                Round {game.currentRound} of {game.totalRounds}
              </p>
            </>
          )}
        </div>

        {/* Prompt Results */}
        {currentRound && (
          <div className="mb-10 space-y-5">
            {currentRound.prompts.map((prompt, promptIdx) => {
              const totalVotes = prompt.votes.length;
              return (
                <div
                  key={prompt.id}
                  className={`p-4 sm:p-5 rounded-xl bg-surface border-2 border-edge animate-float-in delay-${Math.min(promptIdx + 1, 5)}`}
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <p className="font-display font-semibold text-sm text-gold mb-4">
                    {prompt.text}
                  </p>
                  <div className="space-y-3">
                    {prompt.responses.map((resp) => {
                      const voteCount = prompt.votes.filter(
                        (v) => v.responseId === resp.id
                      ).length;
                      const pct =
                        totalVotes > 0
                          ? Math.round((voteCount / totalVotes) * 100)
                          : 0;
                      const isWinner =
                        totalVotes > 0 && voteCount > totalVotes - voteCount;
                      const model =
                        resp.player.type === "AI" && resp.player.modelId
                          ? getModelByModelId(resp.player.modelId)
                          : null;
                      const iconSrc = model
                        ? getModelIconForTheme(model, theme)
                        : null;

                      return (
                        <div
                          key={resp.id}
                          className={`p-3 rounded-xl relative overflow-hidden border-2 ${
                            isWinner
                              ? "border-gold bg-gold-soft"
                              : "border-edge bg-raised"
                          }`}
                        >
                          {/* Vote bar */}
                          <div
                            className={`absolute inset-0 ${
                              isWinner ? "bg-gold/10" : "bg-ink/[0.03]"
                            }`}
                            style={{
                              width: `${pct}%`,
                              transition: "width 0.8s ease-out",
                            }}
                          />
                          <div className="relative flex justify-between items-center gap-3">
                            <div className="min-w-0">
                              <p
                                className="font-semibold text-sm leading-snug text-ink"
                              >
                                {resp.text}
                              </p>
                              <p className="flex items-center gap-1.5 mt-1">
                                {iconSrc && (
                                  <Image
                                    src={iconSrc}
                                    alt=""
                                    width={14}
                                    height={14}
                                    className="rounded-sm"
                                  />
                                )}
                                <span className="text-xs text-ink-dim">
                                  {resp.player.name}
                                </span>
                                {isWinner && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gold/20 text-gold ml-1">
                                    Winner
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span
                                className={`font-mono font-bold text-sm tabular-nums ${
                                  isWinner ? "text-gold" : "text-ink-dim"
                                }`}
                              >
                                {pct}%
                              </span>
                              <p className="text-[11px] text-ink-dim/60 tabular-nums">
                                {voteCount} vote{voteCount !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Scoreboard */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink-dim mb-3">
            Scoreboard
          </h2>
          <PlayerList players={sortedPlayers} showScores />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-fail-soft border-2 border-fail/30 text-fail text-sm text-center font-medium">
            {error}
          </div>
        )}

        {/* Actions */}
        {!isFinal && isHost && (
          <button
            onClick={nextRound}
            disabled={advancing}
            className="w-full bg-punch hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-xl text-lg transition-all active:scale-[0.97] cursor-pointer disabled:cursor-not-allowed"
          >
            {advancing ? "Starting..." : "Next Round"}
          </button>
        )}

        {isFinal && (
          <Link
            href="/"
            className="block text-center w-full bg-surface hover:bg-raised text-ink font-display font-bold py-4 rounded-xl text-lg border-2 border-edge hover:border-edge-strong transition-all active:scale-[0.97]"
          >
            Play Again
          </Link>
        )}
      </div>
    </main>
  );
}
