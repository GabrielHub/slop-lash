"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { useConvexRoomPresence } from "@/hooks/use-convex-room-presence";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { collapseExpand } from "@/lib/animations";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { canHostAdvanceQuizslopPhase, getQuizslopHostAdvanceLabel } from "../quizslop-phase-policy";
import { adaptQuizslopStageView } from "./quizslop-exam-adapters";
import type { QuizslopExamPhase } from "./quizslop-exam-contracts";
import { QuizslopExamStageContent } from "./quizslop-exam-stage";
import { QuizslopSoundToggle } from "./quizslop-sound-toggle";
import { QuizslopTutorialGuide } from "./quizslop-tutorial-guide";
import { useQuizslopExamSounds } from "./use-quizslop-exam-sounds";

const PHASE_LABELS: Record<QuizslopExamPhase, string> = {
  LOBBY_SETUP: "Admissions",
  SECTION_INTRO: "Section briefing",
  SCRATCH: "Scratch work",
  PROXY_ANSWER: "Proxy filing",
  ORAL_DEFENSE: "Oral defense",
  SECTION_RESULTS: "Raw grade",
  PROCTOR_REVIEW_VOTE: "Proctor Review",
  PROCTOR_REVIEW_RESULT: "Suspension notice",
  FINAL_ACCUSATION: "Integrity hearing",
  FINAL_RESULTS: "Final transcript",
};

export function QuizslopGameShell({
  code,
  viewMode = "stage",
}: {
  code: string;
  viewMode?: "game" | "stage";
}) {
  const roomSession = useConvexRoomSession(code);
  const capability = roomSession
    ? viewMode === "stage"
      ? (roomSession.hostCapability ?? roomSession.playerCapability)
      : (roomSession.playerCapability ?? roomSession.hostCapability)
    : null;
  const hostCapability = roomSession?.hostCapability ?? null;
  useConvexRoomPresence({ capability });
  const queried = useQuery(api.quizslopViews.stageView, capability ? { capability } : "skip");
  const view = useMemo(() => (queried ? adaptQuizslopStageView(queried) : undefined), [queried]);
  useScreenWakeLock(view !== undefined);
  useQuizslopExamSounds(view);

  const startMutation = useMutation(api.quizslop.start);
  const advanceMutation = useMutation(api.quizslop.advance);
  const removePlayerMutation = useMutation(api.lobby.kickHuman);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-game", "quizslop");
    return () => document.documentElement.removeAttribute("data-game");
  }, []);

  async function runHostAction(kind: "start" | "advance") {
    if (!view || !hostCapability) return;
    setBusyAction(kind);
    setActionError("");
    try {
      if (kind === "start") {
        await startMutation({ capability: hostCapability });
      } else {
        await advanceMutation({
          capability: hostCapability,
          expectedPhaseGeneration: view.version,
        });
      }
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "The proctor could not move the exam"));
    } finally {
      setBusyAction(null);
    }
  }

  async function removePlayer(targetPlayerId: string) {
    if (!view || view.phase !== "LOBBY_SETUP" || !view.me.isHost) return;
    const target = view.roster.find((player) => player.playerId === targetPlayerId);
    if (!target || target.playerId === view.me.playerId) return;
    if (!window.confirm(`Remove ${target.name} from this room?`)) return;
    setBusyAction(`remove:${targetPlayerId}`);
    setActionError("");
    try {
      if (hostCapability) {
        await removePlayerMutation({
          capability: hostCapability,
          targetPlayerId: targetPlayerId as Id<"players">,
        });
      }
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "The proctor could not remove that player"));
    } finally {
      setBusyAction(null);
    }
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
          className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: "var(--qs-punch)", borderTopColor: "transparent" }}
        />
      </main>
    );
  }

  const phase = view.phase;
  const showHostAdvance = view.me.isHost && canHostAdvanceQuizslopPhase(phase, view.timersDisabled);

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
        className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 backdrop-blur-md sm:px-6 lg:px-10"
        style={{
          borderColor: "var(--qs-edge)",
          background: "color-mix(in srgb, var(--qs-bg) 90%, transparent)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-display text-sm font-black uppercase tracking-tight"
            style={{ color: "var(--qs-punch)" }}
          >
            QuizSlop
          </Link>
          <span
            className="font-mono text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Form S-LOP 70 · {view.roomCode}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <QuizslopSoundToggle />
          <span
            className="border px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-[0.16em]"
            style={{ borderColor: "var(--qs-edge-strong)", color: "var(--qs-ink)" }}
          >
            {PHASE_LABELS[phase]}
          </span>
          {view.totalSections > 0 && phase !== "LOBBY_SETUP" ? (
            <span
              className="font-mono text-[10px] font-black tabular-nums"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              §{view.sectionNumber}/{view.totalSections}
            </span>
          ) : null}
        </div>
      </header>

      <main className="relative z-10 flex-1">
        {view.timersDisabled && phase !== "FINAL_RESULTS" ? (
          <div className="mx-auto w-full max-w-[90rem] px-4 pt-5 sm:px-8 lg:px-10">
            <QuizslopTutorialGuide phase={phase} />
          </div>
        ) : null}
        <QuizslopExamStageContent
          view={view}
          busyAction={busyAction}
          actions={{
            start: () => void runHostAction("start"),
            advance: () => void runHostAction("advance"),
            removePlayer: (playerId) => void removePlayer(playerId),
          }}
        />
      </main>

      <footer
        className="sticky bottom-0 z-30 border-t px-4 py-3 backdrop-blur-md sm:px-6 lg:px-10"
        style={{
          borderColor: "var(--qs-edge)",
          background: "color-mix(in srgb, var(--qs-bg) 92%, transparent)",
        }}
      >
        <AnimatePresence>
          {actionError ? (
            <motion.div
              key="error"
              className="mb-3"
              variants={collapseExpand}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <ErrorBanner error={actionError} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex flex-wrap items-center gap-4">
          {view.phaseDeadline !== null && phase !== "FINAL_RESULTS" ? (
            <div className="min-w-48 flex-1">
              <Timer deadline={view.phaseDeadline} serverNow={view.serverNow} />
            </div>
          ) : null}
          {showHostAdvance ? (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void runHostAction("advance")}
              className="cursor-pointer border-2 px-5 py-2.5 font-display text-sm font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: "var(--qs-punch)",
                background: "var(--qs-punch)",
                color: "var(--qs-accent-ink)",
              }}
            >
              {busyAction === "advance" ? "Processing..." : getQuizslopHostAdvanceLabel(phase)}
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
