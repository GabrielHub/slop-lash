"use client";

import { useState, useMemo } from "react";
import { GameState } from "@/lib/types";
import { Timer } from "@/components/timer";

export function Writing({
  game,
  playerId,
  code,
}: {
  game: GameState;
  playerId: string | null;
  code: string;
}) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const currentRound = game.rounds[0];
  const myPrompts = useMemo(() => {
    if (!currentRound || !playerId) return [];
    return currentRound.prompts.filter(
      (p) =>
        p.responses.length < 2 ||
        p.responses.some((r) => r.playerId === playerId)
    );
  }, [currentRound, playerId]);

  const alreadyAnswered = useMemo(() => {
    if (!currentRound || !playerId) return new Set<string>();
    const set = new Set<string>();
    for (const prompt of currentRound.prompts) {
      if (prompt.responses.some((r) => r.playerId === playerId)) {
        set.add(prompt.id);
      }
    }
    return set;
  }, [currentRound, playerId]);

  async function submitResponse(promptId: string) {
    const text = responses[promptId];
    if (!text?.trim()) return;

    setSubmitting(promptId);
    setError("");

    try {
      const res = await fetch(`/api/games/${code}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, promptId, text: text.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit");
        return;
      }

      setSubmitted((prev) => new Set(prev).add(promptId));
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(null);
    }
  }

  const player = game.players.find((p) => p.id === playerId);
  const isAI = player?.type === "AI";

  if (isAI || !playerId) {
    return (
      <main className="min-h-svh flex flex-col items-center justify-center px-6 pt-16">
        <div className="text-center animate-fade-in-up">
          <h1 className="font-display text-3xl font-bold mb-3">
            Round {game.currentRound}
          </h1>
          <div className="inline-flex items-center gap-2 text-ink-dim">
            <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
            <p className="font-medium">
              Players are writing their answers...
            </p>
          </div>
        </div>
      </main>
    );
  }

  const allDone =
    myPrompts.length > 0 &&
    myPrompts.every(
      (p) => submitted.has(p.id) || alreadyAnswered.has(p.id)
    );

  return (
    <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-lg animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold">
            Round {game.currentRound}
          </h1>
          <p className="text-ink-dim text-sm mt-1">
            Write your funniest answers
          </p>
        </div>

        {/* Timer */}
        <div className="mb-8">
          <Timer seconds={90} />
        </div>

        {allDone ? (
          <div className="text-center py-12 animate-scale-in">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-win-soft border-2 border-win/30 flex items-center justify-center">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-win"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="font-display text-xl font-bold text-win mb-1">
              All submitted!
            </p>
            <p className="text-ink-dim text-sm">
              Waiting for other players to finish...
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {myPrompts.map((prompt, i) => {
              const isDone =
                submitted.has(prompt.id) || alreadyAnswered.has(prompt.id);
              return (
                <div
                  key={prompt.id}
                  className={`p-4 sm:p-5 rounded-xl border-2 transition-all animate-fade-in-up delay-${Math.min(i + 1, 5)} ${
                    isDone
                      ? "bg-win-soft border-win/30"
                      : "bg-surface border-edge"
                  }`}
                  style={{ boxShadow: isDone ? undefined : "var(--shadow-card)" }}
                >
                  <p className="font-display font-semibold text-base sm:text-lg mb-3 leading-snug">
                    {prompt.text}
                  </p>
                  {isDone ? (
                    <div className="flex items-center gap-1.5 text-win text-sm font-medium">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Submitted
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={responses[prompt.id] || ""}
                        onChange={(e) =>
                          setResponses((prev) => ({
                            ...prev,
                            [prompt.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && responses[prompt.id]?.trim()) {
                            submitResponse(prompt.id);
                          }
                        }}
                        placeholder="Your answer..."
                        className="flex-1 py-3 px-4 rounded-xl bg-raised border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors text-sm sm:text-base"
                        maxLength={100}
                        disabled={submitting === prompt.id}
                      />
                      <button
                        onClick={() => submitResponse(prompt.id)}
                        disabled={
                          submitting === prompt.id ||
                          !responses[prompt.id]?.trim()
                        }
                        className="px-5 py-3 bg-punch hover:bg-punch-hover disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed shrink-0"
                      >
                        {submitting === prompt.id ? (
                          <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        ) : (
                          "Send"
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-fail-soft border-2 border-fail/30 text-fail text-sm text-center font-medium">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
