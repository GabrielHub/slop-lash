"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ErrorBanner } from "@/components/error-banner";
import { RoomInviteButton } from "@/components/room-invite-button";
import { Timer } from "@/components/timer";
import { useConvexRoomPresence } from "@/hooks/use-convex-room-presence";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { collapseExpand } from "@/lib/animations";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { playSound, type SoundName } from "@/lib/sounds";
import { canHostAdvanceQuizslopPhase, getQuizslopHostAdvanceLabel } from "../quizslop-phase-policy";
import { adaptQuizslopControllerView } from "./quizslop-exam-adapters";
import { QuizslopExamControllerContent } from "./quizslop-exam-controller";
import { QuizslopSoundToggle } from "./quizslop-sound-toggle";
import { QuizslopTutorialGuide } from "./quizslop-tutorial-guide";

export function QuizslopControllerShell({ code }: { code: string }) {
  const roomSession = useConvexRoomSession(code);
  const playerCapability = roomSession?.playerCapability ?? null;
  const hostCapability = roomSession?.hostCapability ?? null;
  const capability = playerCapability ?? hostCapability;
  useConvexRoomPresence({ capability });
  const queried = useQuery(api.quizslopViews.controllerView, capability ? { capability } : "skip");
  const view = useMemo(
    () => (queried ? adaptQuizslopControllerView(queried) : undefined),
    [queried],
  );
  useScreenWakeLock(view !== undefined);

  const startMutation = useMutation(api.quizslop.start);
  const advanceMutation = useMutation(api.quizslop.advance);
  const removePlayerMutation = useMutation(api.lobby.kickHuman);
  const submitScratchMutation = useMutation(api.quizslop.submitScratch);
  const submitProxyAnswerMutation = useMutation(api.quizslop.submitProxyAnswer);
  const submitGroupAnswerMutation = useMutation(api.quizslop.submitGroupAnswer);
  const submitDefenseMutation = useMutation(api.quizslop.submitDefense);
  const castSuspensionVoteMutation = useMutation(api.quizslop.castSuspensionVote);
  const castFinalAccusationMutation = useMutation(api.quizslop.castFinalAccusation);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const phaseKeyRef = useRef("");

  useEffect(() => {
    document.documentElement.setAttribute("data-game", "quizslop");
    return () => {
      document.documentElement.removeAttribute("data-game");
    };
  }, []);

  useEffect(() => {
    if (!view) return;
    const key = `${view.phase}:${view.sectionNumber}:${view.version}`;
    if (phaseKeyRef.current === key) return;
    phaseKeyRef.current = key;
    setActionError("");
  }, [view]);

  async function runAction(
    key: string,
    action: () => Promise<boolean>,
    fallback: string,
    sound: SoundName,
  ) {
    setBusyAction(key);
    setActionError("");
    try {
      if (await action()) playSound(sound);
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, fallback));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleHostAction(kind: "start" | "advance") {
    if (!view) return;
    await runAction(
      kind,
      async () => {
        if (!hostCapability) return false;
        if (kind === "start") {
          await startMutation({ capability: hostCapability });
        } else {
          await advanceMutation({
            capability: hostCapability,
            expectedPhaseGeneration: view.version,
          });
        }
        return true;
      },
      "The proctor could not move the exam",
      kind === "start" ? "game-start" : "phase-transition",
    );
  }

  async function handleAnswer(kind: "scratch" | "proxy" | "group", selectedIndex: number) {
    if (!view) return;
    await runAction(
      kind,
      async () => {
        if (!playerCapability) return false;
        const args = {
          capability: playerCapability,
          selectedIndex,
          expectedPhaseGeneration: view.version,
        };
        if (kind === "scratch") await submitScratchMutation(args);
        if (kind === "proxy") await submitProxyAnswerMutation(args);
        if (kind === "group") await submitGroupAnswerMutation(args);
        return true;
      },
      "The answer sheet jammed on the way into the machine",
      kind === "group" ? "vote-cast" : kind === "proxy" ? "stamp-slam" : "submitted",
    );
  }

  async function handleRemovePlayer(targetPlayerId: string) {
    if (!view || view.phase !== "LOBBY_SETUP" || !view.me.isHost) return;
    const target = view.roster.find((player) => player.playerId === targetPlayerId);
    if (!target || target.playerId === view.me.playerId) return;
    if (!window.confirm(`Remove ${target.name} from this room?`)) return;
    await runAction(
      `remove:${targetPlayerId}`,
      async () => {
        if (!hostCapability) return false;
        await removePlayerMutation({
          capability: hostCapability,
          targetPlayerId: targetPlayerId as Id<"players">,
        });
        return true;
      },
      "The proctor could not remove that player",
      "player-leave",
    );
  }

  async function handleDefense(assignmentId: string, text: string) {
    if (!view) return;
    await runAction(
      `defense:${assignmentId}`,
      async () => {
        if (!playerCapability) return false;
        await submitDefenseMutation({
          capability: playerCapability,
          assignmentId: assignmentId as Id<"quizSlopAssignments">,
          text,
          expectedPhaseGeneration: view.version,
        });
        return true;
      },
      "The stenographer rejected that statement",
      "submitted",
    );
  }

  async function handleSuspensionVote(targetPlayerId: string | null) {
    if (!view) return;
    await runAction(
      "suspension",
      async () => {
        if (!playerCapability) return false;
        await castSuspensionVoteMutation({
          capability: playerCapability,
          targetPlayerId: targetPlayerId as Id<"players"> | null,
          expectedPhaseGeneration: view.version,
        });
        return true;
      },
      "The disciplinary ballot was returned for excessive sincerity",
      "vote-cast",
    );
  }

  async function handleAccusation(targetPlayerId: string) {
    if (!view) return;
    await runAction(
      "accusation",
      async () => {
        if (!playerCapability) return false;
        await castFinalAccusationMutation({
          capability: playerCapability,
          targetPlayerId: targetPlayerId as Id<"players">,
          expectedPhaseGeneration: view.version,
        });
        return true;
      },
      "The integrity office misplaced your accusation",
      "vote-cast",
    );
  }

  if (!capability) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p className="font-display text-xl font-bold text-fail">
          Open this room from the host or join screen
        </p>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--qs-edge)", borderTopColor: "var(--qs-punch)" }}
        />
      </main>
    );
  }

  const showHostAdvance =
    view.me.isHost && canHostAdvanceQuizslopPhase(view.phase, view.timersDisabled);
  return (
    <div
      className="relative flex min-h-svh flex-col overflow-x-hidden"
      style={{ color: "var(--qs-ink)", background: "var(--qs-bg)" }}
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-70"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(102deg, transparent 0 48%, color-mix(in srgb, var(--qs-punch) 5%, transparent) 48% 48.2%, transparent 48.2%), radial-gradient(circle at 92% 8%, var(--qs-marquee-soft), transparent 35%)",
        }}
      />
      <header
        className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 backdrop-blur-md sm:px-6 lg:px-8"
        style={{
          borderColor: "var(--qs-edge)",
          background: "color-mix(in srgb, var(--qs-bg) 90%, transparent)",
        }}
      >
        <div className="min-w-0">
          <p
            className="font-display text-sm font-black uppercase"
            style={{ color: "var(--qs-punch)" }}
          >
            QuizSlop{" "}
            <span
              className="font-mono text-[9px] tracking-[0.18em]"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              · {view.roomCode}
            </span>
          </p>
          <p
            className="truncate font-mono text-[9px] font-black uppercase tracking-[0.16em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            {view.me.name ?? "Display proctor"} · {view.phase.toLowerCase().replaceAll("_", " ")}
          </p>
        </div>
        <QuizslopSoundToggle />
      </header>

      <main className="relative z-10 flex-1 pb-28">
        {view.phaseDeadline !== null && view.phase !== "FINAL_RESULTS" ? (
          <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
            <Timer deadline={view.phaseDeadline} serverNow={view.serverNow} />
          </div>
        ) : null}
        {view.timersDisabled && view.phase !== "FINAL_RESULTS" ? (
          <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
            <QuizslopTutorialGuide phase={view.phase} />
          </div>
        ) : null}
        <AnimatePresence>
          {actionError ? (
            <motion.div
              key="error"
              className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6 lg:px-8"
              variants={collapseExpand}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <ErrorBanner error={actionError} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <QuizslopExamControllerContent
          view={view}
          busyAction={busyAction}
          actions={{
            start: () => void handleHostAction("start"),
            removePlayer: (playerId) => void handleRemovePlayer(playerId),
            submitScratch: (selectedIndex) => void handleAnswer("scratch", selectedIndex),
            submitProxyAnswer: (selectedIndex) => void handleAnswer("proxy", selectedIndex),
            submitGroupAnswer: (selectedIndex) => void handleAnswer("group", selectedIndex),
            submitDefense: (assignmentId, text) => void handleDefense(assignmentId, text),
            castSuspensionVote: (targetPlayerId) => void handleSuspensionVote(targetPlayerId),
            castFinalAccusation: (targetPlayerId) => void handleAccusation(targetPlayerId),
          }}
        />
      </main>

      {view.me.isHost ? (
        <aside
          className="fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur-md sm:px-6 lg:left-auto lg:right-5 lg:bottom-5 lg:w-72 lg:border"
          style={{
            borderColor: "var(--qs-edge-strong)",
            background: "color-mix(in srgb, var(--qs-bg) 94%, transparent)",
          }}
        >
          <p
            className="font-mono text-[9px] font-black uppercase tracking-[0.2em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Proctor controls
          </p>
          <div className="mt-2 flex gap-2 lg:grid lg:grid-cols-2">
            {view.phase === "LOBBY_SETUP" ? (
              <RoomInviteButton roomCode={view.roomCode} tone="quiz" className="min-w-0 flex-1" />
            ) : null}
            <Link
              href={`/stage/${view.roomCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 border px-3 py-2 text-center font-mono text-[9px] font-black uppercase tracking-wider"
              style={{ borderColor: "var(--qs-marquee)", color: "var(--qs-marquee)" }}
            >
              Shared stage
            </Link>
            {showHostAdvance ? (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleHostAction("advance")}
                className="min-w-0 flex-1 cursor-pointer border px-3 py-2 font-mono text-[9px] font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40 lg:col-span-2"
                style={{
                  borderColor: "var(--qs-punch)",
                  background: "var(--qs-punch)",
                  color: "var(--qs-accent-ink)",
                }}
              >
                {busyAction === "advance"
                  ? "Processing..."
                  : getQuizslopHostAdvanceLabel(view.phase)}
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
