"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { fadeInUp, buttonTapPrimary } from "@/lib/animations";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";

export default function JoinPage() {
  const router = useRouter();
  const { triggerElement } = usePixelDissolve();
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
    <main className="min-h-svh flex flex-col items-center sm:justify-center px-6 py-12 pt-20">
      <motion.div
        className="w-full max-w-sm"
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
          Join a Game
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            joinGame();
          }}
        >
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
              className="w-full py-3 px-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
              maxLength={20}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
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
              className="w-full py-4 px-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/30 focus:outline-none focus:border-punch transition-colors text-center text-3xl tracking-[0.3em] font-mono font-bold"
              maxLength={4}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="go"
            />
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
            {loading ? "Joining..." : "Join Game"}
          </motion.button>
        </form>
      </motion.div>
    </main>
  );
}
