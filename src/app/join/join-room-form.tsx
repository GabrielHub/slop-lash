"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { TopBar } from "@/components/top-bar";
import { enter, listParent, press } from "@/lib/animations";
import { originOf, pulseAmbient } from "@/lib/ambient-events";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { roomPath, saveRoomSession, useStoredRoomSession } from "@/room/session";
import { isMobileDevice } from "@/lib/mobile-device";
import { isRoomInviteCode, normalizeRoomInviteCode, ROOM_CODE_LENGTH } from "@/lib/room-invite";
import { saveLastName, useRememberedName } from "./last-name";
import { NameField } from "./name-field";

const INPUT =
  "w-full rounded-xl bg-surface/80 border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors";

/**
 * Code first, then name: players read the code off the TV before anything
 * else. An invite link or QR (`/join/CODE`) already carries the code, so it
 * only asks for the name, with a way to change the code.
 */
export function JoinRoomForm({ initialRoomCode = "" }: { initialRoomCode?: string }) {
  const router = useRouter();
  const joinRoom = useAction(api.rooms.join);
  const { triggerElement } = usePixelDissolve();
  const [roomCode, setRoomCode] = useState(() => normalizeRoomInviteCode(initialRoomCode));
  const [editingCode, setEditingCode] = useState(false);
  const [name, setName] = useRememberedName();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const joiningRef = useRef(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const existing = useStoredRoomSession(roomCode);

  const codeFromLink = initialRoomCode !== "" && !editingCode;
  const codeComplete = roomCode.length === ROOM_CODE_LENGTH;

  // The page has one job, so its first empty step takes focus: the code, or the
  // name when the link already carried the code (and again after "change").
  useEffect(() => {
    (codeFromLink ? nameRef : codeRef).current?.focus();
  }, [codeFromLink]);

  async function joinGame() {
    if (joiningRef.current) return;
    if (!codeComplete) {
      setError(`Enter the ${ROOM_CODE_LENGTH}-character room code`);
      return;
    }
    if (!isRoomInviteCode(roomCode)) {
      setError("That code has a character rooms never use");
      return;
    }
    if (!name.trim()) {
      setError("Enter your name");
      nameRef.current?.focus();
      return;
    }

    joiningRef.current = true;
    setLoading(true);
    setError("");
    if (submitRef.current) triggerElement(submitRef.current);

    try {
      const room = await joinRoom({
        name: name.trim(),
        roomCode: normalizeRoomInviteCode(roomCode),
      });
      saveLastName(name.trim());
      saveRoomSession(room);
      pulseAmbient({ kind: "cheer", origin: originOf(submitRef.current) });
      router.push(roomPath(room, isMobileDevice()));
    } catch (cause) {
      setError(getConvexErrorMessage(cause, "Failed to join"));
    } finally {
      joiningRef.current = false;
      setLoading(false);
    }
  }

  function changeCode(value: string) {
    const next = normalizeRoomInviteCode(value);
    setRoomCode(next);
    setError("");
    // A finished code moves straight on to the name, unless one is already there.
    if (next.length === ROOM_CODE_LENGTH && isRoomInviteCode(next) && !name.trim()) {
      nameRef.current?.focus();
    }
  }

  return (
    <div className="min-h-svh flex flex-col">
      <TopBar backHref="/" backLabel="Back to home" />

      <main className="flex-1 flex flex-col items-center px-4 pt-4 pb-16 sm:justify-center">
        <motion.div
          className="w-full max-w-sm"
          variants={listParent(4)}
          initial="hidden"
          animate="visible"
        >
          <motion.div className="mb-8" variants={enter}>
            {codeFromLink ? (
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">
                  Joining <span className="font-mono tracking-wider text-punch">{roomCode}</span>
                </h1>
                <button
                  type="button"
                  onClick={() => setEditingCode(true)}
                  className="h-11 text-sm font-medium text-ink-dim underline underline-offset-4 decoration-edge-strong hover:text-ink cursor-pointer"
                >
                  change
                </button>
              </div>
            ) : (
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">Join a game</h1>
            )}
          </motion.div>

          <AnimatePresence initial={false}>
            {existing && (
              <motion.div
                key="rejoin"
                className="mb-6"
                variants={enter}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Link
                  href={roomPath(existing, isMobileDevice())}
                  className="flex min-h-12 items-center rounded-xl border-2 border-teal/50 bg-teal-soft/60 px-4 py-2 text-sm font-semibold text-ink hover:border-teal transition-colors"
                >
                  You&apos;re already in {existing.roomCode}. Jump back in →
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.form
            variants={enter}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void joinGame();
            }}
          >
            {!codeFromLink && (
              <div className="mb-5">
                <label
                  htmlFor="join-room-code"
                  className="block text-sm font-medium text-ink-dim mb-2"
                >
                  Room code
                </label>
                <input
                  ref={codeRef}
                  id="join-room-code"
                  type="text"
                  value={roomCode}
                  onChange={(event) => changeCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && codeComplete && !name.trim()) {
                      event.preventDefault();
                      nameRef.current?.focus();
                    }
                  }}
                  placeholder="ABC234"
                  className={`${INPUT} h-16 px-4 text-center text-3xl tracking-[0.3em] font-mono font-bold placeholder:text-ink-dim/25`}
                  maxLength={ROOM_CODE_LENGTH}
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint={name.trim() ? "go" : "next"}
                />
              </div>
            )}

            <div className="mb-6">
              <NameField
                id="join-player-name"
                ref={nameRef}
                value={name}
                onChange={(next) => {
                  setName(next);
                  setError("");
                }}
                focusClass="focus:border-punch"
                enterKeyHint="go"
              />
            </div>

            <ErrorBanner error={error} />

            <motion.button
              ref={submitRef}
              type="submit"
              disabled={loading}
              className="w-full h-14 rounded-xl bg-punch hover:bg-punch-hover text-accent-ink font-display text-xl font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              {...press}
            >
              {loading ? "Joining…" : "Join"}
            </motion.button>
          </motion.form>
        </motion.div>
      </main>
    </div>
  );
}
