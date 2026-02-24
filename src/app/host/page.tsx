"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AI_MODELS, getModelIconForTheme } from "@/lib/models";
import { useTheme } from "@/components/theme-provider";

export default function HostPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [hostSecret, setHostSecret] = useState("");
  const [hostName, setHostName] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleModel(modelId: string) {
    setSelectedModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
    );
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
    <main className="min-h-svh flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-md animate-fade-in-up">
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
            className="w-full py-3 px-4 rounded-xl bg-surface border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
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
            className="w-full py-3 px-4 rounded-xl bg-surface border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
            maxLength={20}
          />
        </div>

        {/* AI Opponents */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-ink-dim mb-1">
            Pick AI Opponents
          </label>
          <p className="text-xs text-ink-dim/60 mb-4">
            {selectedModels.length} selected
          </p>
          <div className="grid grid-cols-1 gap-2">
            {AI_MODELS.map((model) => {
              const selected = selectedModels.includes(model.id);
              const iconSrc = getModelIconForTheme(model, theme);
              return (
                <button
                  key={model.id}
                  onClick={() => toggleModel(model.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 cursor-pointer ${
                    selected
                      ? "bg-ai-soft border-ai text-ink"
                      : "bg-surface border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                  }`}
                >
                  <Image
                    src={iconSrc}
                    alt={model.provider}
                    width={24}
                    height={24}
                    className="rounded-sm shrink-0"
                  />
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-semibold text-sm truncate">
                      {model.name}
                    </span>
                    <span className="text-xs text-ink-dim/60 shrink-0">
                      {model.provider}
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
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-fail-soft border-2 border-fail/30 text-fail text-sm text-center font-medium">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={createGame}
          disabled={loading}
          className="w-full bg-punch hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 px-8 rounded-xl text-lg transition-all active:scale-[0.97] cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create Game"}
        </button>
      </div>
    </main>
  );
}
