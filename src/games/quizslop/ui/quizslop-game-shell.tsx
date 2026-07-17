"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { collapseExpand, phaseTransition } from "@/lib/animations";
import { useConvexRoomPresence } from "@/hooks/use-convex-room-presence";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import type { QuizslopPhase } from "../types";
import { canHostAdvanceQuizslopPhase, isQuizslopSubmissionPhase } from "../quizslop-phase-policy";
import { ScoreboardStrip, VoiceLineBanner } from "./quizslop-shared-ui";
import { QuizslopStagePhaseContent } from "./quizslop-phase-content";
import type { QuizslopStageViewPayload } from "./quizslop-view-contracts";

export interface QuizslopGameShellFixture {
  view: QuizslopStageViewPayload;
  start(): Promise<void> | void;
  advance(): Promise<void> | void;
}

const PHASE_LABELS: Record<QuizslopPhase, string> = {
  LOBBY_SETUP: "Lobby",
  HOUSE_VOTE: "Final vote",
  HOUSE_VOTE_REVEAL: "Vote reveal",
  TOPIC_REVEAL: "Topic",
  SLOP_CALL: "Call Slop",
  SLOP_CALL_REVEAL: "Call reveal",
  ANSWER: "Answering",
  QUESTION_REVEAL: "Reveal",
  DISPUTE_WINDOW: "Disputes",
  DISPUTE_VOTE: "Dispute vote",
  ROUND_RESULTS: "Results",
  CONTINUITY_GRACE: "Reconnecting",
  FINAL_RESULTS: "Final",
  ABANDONED: "Abandoned",
};

export function QuizslopGameShell({
  code,
  fixture,
  viewMode = "stage",
}: {
  code: string;
  fixture?: QuizslopGameShellFixture;
  viewMode?: "game" | "stage";
}) {
  const roomSession = useConvexRoomSession(code);
  const capability = roomSession
    ? viewMode === "stage"
      ? (roomSession.hostCapability ?? roomSession.playerCapability)
      : (roomSession.playerCapability ?? roomSession.hostCapability)
    : null;
  const hostCapability = roomSession?.hostCapability ?? null;
  useConvexRoomPresence({ capability: fixture ? null : capability });
  const queried = useQuery(
    api.quizslopViews.stageView,
    fixture ? "skip" : capability ? { capability } : "skip",
  );
  const liveView: QuizslopStageViewPayload | undefined = queried;
  const view = fixture?.view ?? liveView;
  useScreenWakeLock(view != null);
  const startMutation = useMutation(api.quizslop.start);
  const advanceMutation = useMutation(api.quizslop.advance);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-game", "quizslop");
    return () => {
      document.documentElement.removeAttribute("data-game");
    };
  }, []);

  async function handleStart() {
    if (!fixture && !hostCapability) return;
    setHostActionBusy(true);
    setActionError("");
    try {
      if (fixture) {
        await fixture.start();
      } else if (hostCapability) {
        await startMutation({ capability: hostCapability });
      }
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Could not start the game"));
    } finally {
      setHostActionBusy(false);
    }
  }

  async function handleAdvance() {
    if (!fixture && !hostCapability) return;
    if (!view) return;
    setHostActionBusy(true);
    setActionError("");
    try {
      if (fixture) {
        await fixture.advance();
      } else if (hostCapability) {
        await advanceMutation({
          capability: hostCapability,
          expectedPhaseGeneration: view.version,
        });
      }
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Could not advance the phase"));
    } finally {
      setHostActionBusy(false);
    }
  }

  if (!fixture && !capability) {
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
          style={{ borderColor: "var(--qs-marquee)", borderTopColor: "transparent" }}
        />
      </main>
    );
  }

  const phase = view.phase;
  const isHost = view.me.isHost;
  const inRound = phase !== "LOBBY_SETUP" && phase !== "FINAL_RESULTS" && phase !== "ABANDONED";
  const isSubmissionPhase = isQuizslopSubmissionPhase(phase);
  const showHostAdvance = isHost && canHostAdvanceQuizslopPhase(phase, view.timersDisabled);

  return (
    <div
      className="relative flex min-h-svh flex-col overflow-x-hidden"
      style={{ color: "var(--qs-ink)" }}
    >
      {/* Studio glow backdrop */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% -5%, var(--qs-marquee-soft) 0%, transparent 70%), radial-gradient(ellipse 45% 40% at 85% 90%, var(--qs-signal-soft) 0%, transparent 70%)",
        }}
      />

      {/* Top bar */}
      <header
        className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 backdrop-blur-md sm:px-6"
        style={{
          borderColor: "var(--qs-edge)",
          background: "color-mix(in srgb, var(--qs-bg) 85%, transparent)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-display text-sm font-black tracking-tight transition-opacity hover:opacity-80"
            style={{ color: "var(--qs-marquee)" }}
          >
            QUIZSLOP
          </Link>
          <span style={{ color: "var(--qs-edge-strong)" }}>|</span>
          <span
            className="font-mono text-xs font-bold tracking-widest"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            {view.roomCode}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "var(--qs-signal)", background: "var(--qs-signal-soft)" }}
          >
            {PHASE_LABELS[phase]}
          </span>
          {inRound && view.totalRounds > 0 && (
            <span className="font-mono text-xs tabular-nums" style={{ color: "var(--qs-ink-dim)" }}>
              Round {view.currentRound}/{view.totalRounds}
            </span>
          )}
        </div>
      </header>

      <main className="z-10 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${phase}:${view.currentRound}:${view.revealOrdinal}`}
            variants={phaseTransition}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <QuizslopStagePhaseContent
              view={view}
              isHost={isHost}
              starting={hostActionBusy}
              onStart={() => void handleStart()}
            />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Persistent chrome: timer, host advance, voice line, scoreboard */}
      <footer
        className="z-20 flex shrink-0 flex-col gap-3 border-t px-4 py-3 backdrop-blur-md sm:px-6"
        style={{
          borderColor: "var(--qs-edge)",
          background: "color-mix(in srgb, var(--qs-bg) 88%, transparent)",
        }}
      >
        <AnimatePresence>
          {actionError && (
            <motion.div
              key="error"
              variants={collapseExpand}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <ErrorBanner error={actionError} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-4">
          {(view.phaseDeadline !== null || view.timersDisabled) &&
            phase !== "FINAL_RESULTS" &&
            phase !== "ABANDONED" && (
              <div className="min-w-48 flex-1">
                <Timer
                  deadline={view.phaseDeadline}
                  serverNow={view.serverNow}
                  disabled={view.timersDisabled && view.phaseDeadline === null}
                />
              </div>
            )}
          {showHostAdvance && (
            <button
              type="button"
              disabled={hostActionBusy}
              onClick={() => void handleAdvance()}
              className="cursor-pointer rounded-xl px-5 py-2.5 font-display text-sm font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--qs-signal)", color: "var(--qs-accent-ink)" }}
            >
              {hostActionBusy ? "Working..." : isSubmissionPhase ? "Close phase" : "Continue"}
            </button>
          )}
        </div>

        <VoiceLineBanner voiceLine={view.voiceLine} />

        {view.scoreboard.length > 0 && phase !== "FINAL_RESULTS" && phase !== "ABANDONED" && (
          <ScoreboardStrip scoreboard={view.scoreboard} highlightPlayerId={view.me.playerId} />
        )}
      </footer>
    </div>
  );
}
