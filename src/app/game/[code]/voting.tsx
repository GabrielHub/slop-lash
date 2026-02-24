"use client";

import { useState, useMemo } from "react";
import { GameState } from "@/lib/types";

export function Voting({
  game,
  playerId,
  code,
}: {
  game: GameState;
  playerId: string | null;
  code: string;
}) {
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState("");

  const currentRound = game.rounds[0];

  const votablePrompts = useMemo(() => {
    if (!currentRound || !playerId) return [];
    return currentRound.prompts.filter(
      (p) =>
        p.responses.length >= 2 &&
        !p.responses.some((r) => r.playerId === playerId)
    );
  }, [currentRound, playerId]);

  const alreadyVoted = useMemo(() => {
    if (!currentRound || !playerId) return new Set<string>();
    const set = new Set<string>();
    for (const prompt of currentRound.prompts) {
      if (prompt.votes.some((v) => v.voterId === playerId)) {
        set.add(prompt.id);
      }
    }
    return set;
  }, [currentRound, playerId]);

  async function castVote(promptId: string, responseId: string) {
    if (!playerId) return;
    setVoting(true);
    setError("");

    try {
      const res = await fetch(`/api/games/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: playerId, promptId, responseId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to vote");
        return;
      }

      setVoted((prev) => new Set(prev).add(promptId));
    } catch {
      setError("Something went wrong");
    } finally {
      setVoting(false);
    }
  }

  const player = game.players.find((p) => p.id === playerId);
  const isAI = player?.type === "AI";

  if (isAI || !playerId) {
    return (
      <main className="min-h-svh flex flex-col items-center justify-center px-6 pt-16">
        <div className="text-center animate-fade-in-up">
          <h1 className="font-display text-3xl font-bold mb-3">
            Voting Time
          </h1>
          <div className="inline-flex items-center gap-2 text-ink-dim">
            <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
            <p className="font-medium">
              Players are casting their votes...
            </p>
          </div>
        </div>
      </main>
    );
  }

  const allDone =
    votablePrompts.length > 0 &&
    votablePrompts.every(
      (p) => voted.has(p.id) || alreadyVoted.has(p.id)
    );

  return (
    <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-lg animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl sm:text-3xl font-bold">
            Vote!
          </h1>
          <p className="text-ink-dim text-sm mt-1">
            Pick the funnier answer
          </p>
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
              All votes cast!
            </p>
            <p className="text-ink-dim text-sm">
              Waiting for other players...
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {votablePrompts.map((prompt, i) => {
              const isDone =
                voted.has(prompt.id) || alreadyVoted.has(prompt.id);
              if (isDone) return null;

              const [respA, respB] = prompt.responses;
              return (
                <div
                  key={prompt.id}
                  className={`animate-float-in delay-${Math.min(i + 1, 5)}`}
                >
                  {/* Prompt text */}
                  <p className="font-display font-semibold text-base sm:text-lg text-center mb-5 text-gold leading-snug">
                    {prompt.text}
                  </p>

                  <div className="space-y-3">
                    {/* Response A */}
                    <button
                      onClick={() => castVote(prompt.id, respA.id)}
                      disabled={voting}
                      className="w-full p-4 sm:p-5 rounded-xl bg-surface border-2 border-edge text-left transition-all hover:border-teal hover:bg-teal-soft disabled:opacity-50 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed group"
                      style={{ boxShadow: "var(--shadow-card)" }}
                    >
                      <p className="text-base sm:text-lg leading-snug group-hover:text-teal transition-colors">
                        {respA.text}
                      </p>
                    </button>

                    {/* VS Divider */}
                    <div className="flex items-center justify-center gap-3">
                      <div className="h-px flex-1 bg-edge" />
                      <span className="font-display font-extrabold text-xs text-ink-dim/50 tracking-widest">
                        VS
                      </span>
                      <div className="h-px flex-1 bg-edge" />
                    </div>

                    {/* Response B */}
                    <button
                      onClick={() => castVote(prompt.id, respB.id)}
                      disabled={voting}
                      className="w-full p-4 sm:p-5 rounded-xl bg-surface border-2 border-edge text-left transition-all hover:border-punch hover:bg-fail-soft disabled:opacity-50 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed group"
                      style={{ boxShadow: "var(--shadow-card)" }}
                    >
                      <p className="text-base sm:text-lg leading-snug group-hover:text-punch transition-colors">
                        {respB.text}
                      </p>
                    </button>
                  </div>
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
