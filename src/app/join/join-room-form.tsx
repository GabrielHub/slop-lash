"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { fadeInUp, buttonTapPrimary } from "@/lib/animations";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { persistRoomSessionResult } from "@/lib/convex-room-client";
import { isMobileDevice } from "@/lib/mobile-device";
import { isRoomInviteCode, normalizeRoomInviteCode, ROOM_CODE_LENGTH } from "@/lib/room-invite";

const NAME_MAX_LENGTH = 20;

export function JoinRoomForm({ initialRoomCode = "" }: { initialRoomCode?: string }) {
  const router = useRouter();
  const joinRoom = useAction(api.rooms.join);
  const { triggerElement } = usePixelDissolve();
  const [roomCode, setRoomCode] = useState(() => normalizeRoomInviteCode(initialRoomCode));
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const joiningRef = useRef(false);

  async function joinGame() {
    if (joiningRef.current) return;
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    if (roomCode.length !== ROOM_CODE_LENGTH) {
      setError(`Room code must be ${ROOM_CODE_LENGTH} characters`);
      return;
    }
    if (!isRoomInviteCode(roomCode)) {
      setError("Room code contains an invalid character");
      return;
    }

    joiningRef.current = true;
    setLoading(true);
    setError("");

    try {
      const code = normalizeRoomInviteCode(roomCode);
      const usePhoneController = isMobileDevice();
      const room = await joinRoom({
        name: name.trim(),
        roomCode: code,
      });
      persistRoomSessionResult(room);
      // Shared-stage modes require a private controller on every device. Other
      // modes use one automatically only when the join happens on mobile.
      const targetRoute =
        usePhoneController || room.gameType === "MATCHSLOP" || room.gameType === "QUIZSLOP"
          ? `/controller/${room.roomCode}`
          : `/game/${room.roomCode}`;
      router.push(targetRoute);
    } catch (cause) {
      setError(getConvexErrorMessage(cause, "Failed to join"));
    } finally {
      joiningRef.current = false;
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
          {initialRoomCode ? (
            <>
              Join Room <span className="font-mono text-punch">{roomCode}</span>
            </>
          ) : (
            "Join a Game"
          )}
        </h1>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void joinGame();
          }}
        >
          <div className="mb-6">
            <label
              htmlFor="join-player-name"
              className="flex items-baseline justify-between text-sm font-medium text-ink-dim mb-2"
            >
              Your Name
              {name.length >= 15 && (
                <span
                  className={`text-xs tabular-nums ${name.length >= NAME_MAX_LENGTH ? "text-punch" : "text-ink-dim/50"}`}
                >
                  {name.length}/{NAME_MAX_LENGTH}
                </span>
              )}
            </label>
            <input
              id="join-player-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              className="w-full py-3 px-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors"
              maxLength={NAME_MAX_LENGTH}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
            />
          </div>

          <div className="mb-8">
            <label htmlFor="join-room-code" className="block text-sm font-medium text-ink-dim mb-2">
              Room Code
            </label>
            <input
              id="join-room-code"
              type="text"
              value={roomCode}
              onChange={(event) => setRoomCode(normalizeRoomInviteCode(event.target.value))}
              placeholder="ABC234"
              className="w-full py-4 px-4 rounded-xl bg-surface/80 backdrop-blur-sm border-2 border-edge text-ink placeholder:text-ink-dim/30 focus:outline-none focus:border-punch transition-colors text-center text-3xl tracking-[0.3em] font-mono font-bold"
              maxLength={ROOM_CODE_LENGTH}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="go"
            />
          </div>

          <ErrorBanner error={error} />

          <motion.button
            type="submit"
            disabled={loading}
            className="w-full bg-punch/90 backdrop-blur-sm hover:bg-punch-hover disabled:opacity-50 text-accent-ink font-display font-bold py-4 px-8 rounded-xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            onClick={(event) => triggerElement(event.currentTarget)}
            {...buttonTapPrimary}
          >
            {loading ? "Joining..." : "Join Game"}
          </motion.button>
        </form>
      </motion.div>
    </main>
  );
}
