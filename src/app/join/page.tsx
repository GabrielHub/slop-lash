"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function JoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function joinGame() {
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    if (roomCode.length !== 4) {
      setError("Room code must be 4 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const code = roomCode.toUpperCase();
      const res = await fetch(`/api/games/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to join");
        return;
      }

      localStorage.setItem("playerId", data.playerId);
      localStorage.setItem("playerName", name.trim());
      router.push(`/game/${code}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm animate-fade-in-up">
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
          Join a Game
        </h1>

        {/* Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-ink-dim mb-2">
            Your Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full py-3 px-4 rounded-xl bg-surface border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
            maxLength={20}
          />
        </div>

        {/* Room Code */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-ink-dim mb-2">
            Room Code
          </label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
            className="w-full py-4 px-4 rounded-xl bg-surface border-2 border-edge text-ink placeholder:text-ink-dim/30 focus:outline-none focus:border-punch transition-colors text-center text-3xl tracking-[0.3em] font-mono font-bold"
            maxLength={4}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-fail-soft border-2 border-fail/30 text-fail text-sm text-center font-medium">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={joinGame}
          disabled={loading}
          className="w-full bg-punch hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 px-8 rounded-xl text-lg transition-all active:scale-[0.97] cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Joining..." : "Join Game"}
        </button>
      </div>
    </main>
  );
}
