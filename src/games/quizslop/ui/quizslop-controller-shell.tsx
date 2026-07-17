"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { collapseExpand, phaseTransition } from "@/lib/animations";
import { useConvexRoomPresence } from "@/hooks/use-convex-room-presence";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import type { QuizslopDisputeReason, QuizslopDisputeVoteChoice } from "../types";
import { canHostAdvanceQuizslopPhase, isQuizslopSubmissionPhase } from "../quizslop-phase-policy";
import {
  ScoreboardStrip,
  TokenChips,
  VoiceLineBanner,
  formatSignedPoints,
} from "./quizslop-shared-ui";
import { QuizslopControllerPhaseContent } from "./quizslop-phase-content";
import type {
  QuizslopChooseTopicResult,
  QuizslopControllerViewPayload,
  QuizslopInitiateDisputeResult,
} from "./quizslop-view-contracts";

export interface QuizslopControllerShellFixture {
  view: QuizslopControllerViewPayload;
  start(): Promise<void> | void;
  advance(): Promise<void> | void;
  chooseCatalogTopic(
    catalogTopicId: string,
  ): Promise<QuizslopChooseTopicResult> | QuizslopChooseTopicResult;
  castHouseVote(topicId: string): Promise<void> | void;
  submitCall(targetPlayerId: string | null): Promise<void> | void;
  lockAnswer(selectedIndex: number): Promise<void> | void;
  initiateDispute(
    questionId: string,
    reason: QuizslopDisputeReason,
  ): Promise<QuizslopInitiateDisputeResult> | QuizslopInitiateDisputeResult;
  castDisputeVote(disputeId: string, choice: QuizslopDisputeVoteChoice): Promise<void> | void;
}

export function QuizslopControllerShell({
  code,
  fixture,
}: {
  code: string;
  fixture?: QuizslopControllerShellFixture;
}) {
  const roomSession = useConvexRoomSession(code);
  const playerCapability = roomSession?.playerCapability ?? null;
  const hostCapability = roomSession?.hostCapability ?? null;
  const capability = playerCapability ?? hostCapability;
  useConvexRoomPresence({ capability: fixture ? null : capability });
  const queried = useQuery(
    api.quizslopViews.controllerView,
    fixture ? "skip" : capability ? { capability } : "skip",
  );
  const liveView: QuizslopControllerViewPayload | undefined = queried;
  const view = fixture?.view ?? liveView;
  useScreenWakeLock(view != null);

  const startMutation = useMutation(api.quizslop.start);
  const advanceMutation = useMutation(api.quizslop.advance);
  const chooseCatalogTopicMutation = useMutation(api.quizslop.chooseCatalogTopic);
  const castHouseVoteMutation = useMutation(api.quizslop.castHouseVote);
  const submitCallMutation = useMutation(api.quizslop.submitCall);
  const lockAnswerMutation = useMutation(api.quizslop.lockAnswer);
  const initiateDisputeMutation = useMutation(api.quizslop.initiateDispute);
  const castDisputeVoteMutation = useMutation(api.quizslop.castDisputeVote);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [topicTakenNotice, setTopicTakenNotice] = useState<string | null>(null);
  const [disputeNotice, setDisputeNotice] = useState<string | null>(null);
  const phaseKeyRef = useRef("");

  useEffect(() => {
    document.documentElement.setAttribute("data-game", "quizslop");
    return () => {
      document.documentElement.removeAttribute("data-game");
    };
  }, []);

  // Reset transient notices whenever the authoritative phase tuple moves, so a
  // reload or reconnect renders purely from the server view.
  useEffect(() => {
    if (!view) return;
    const nextKey = `${view.phase}:${view.currentRound}:${view.revealOrdinal}`;
    if (phaseKeyRef.current === nextKey) return;
    phaseKeyRef.current = nextKey;
    setActionError("");
    setDisputeNotice(null);
    if (view.phase !== "LOBBY_SETUP") setTopicTakenNotice(null);
  }, [view]);

  async function runAction(key: string, action: () => Promise<void> | void, fallback: string) {
    setBusyAction(key);
    setActionError("");
    try {
      await action();
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, fallback));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleChooseTopic(catalogTopicId: string) {
    setTopicTakenNotice(null);
    await runAction(
      `topic:${catalogTopicId}`,
      async () => {
        const result = fixture
          ? await fixture.chooseCatalogTopic(catalogTopicId)
          : playerCapability
            ? await chooseCatalogTopicMutation({ capability: playerCapability, catalogTopicId })
            : null;
        if (result?.kind === "TOPIC_TAKEN") {
          setTopicTakenNotice("Someone claimed that topic first. Here are fresh picks.");
        }
      },
      "Could not confirm that topic",
    );
  }

  async function handleHouseVote(topicId: string) {
    if (!view) return;
    await runAction(
      `vote:${topicId}`,
      async () => {
        if (fixture) {
          await fixture.castHouseVote(topicId);
        } else if (playerCapability) {
          await castHouseVoteMutation({
            capability: playerCapability,
            topicId: topicId as Id<"quizSlopTopics">,
            expectedPhaseGeneration: view.version,
          });
        }
      },
      "Could not cast your vote",
    );
  }

  async function handleSubmitCall(targetPlayerId: string | null) {
    if (!view) return;
    await runAction(
      "call",
      async () => {
        if (fixture) {
          await fixture.submitCall(targetPlayerId);
        } else if (playerCapability) {
          await submitCallMutation({
            capability: playerCapability,
            targetPlayerId: targetPlayerId === null ? null : (targetPlayerId as Id<"players">),
            expectedPhaseGeneration: view.version,
          });
        }
      },
      "Could not lock your call",
    );
  }

  async function handleLockAnswer(selectedIndex: number) {
    if (!view) return;
    await runAction(
      "answer",
      async () => {
        if (fixture) {
          await fixture.lockAnswer(selectedIndex);
        } else if (playerCapability) {
          await lockAnswerMutation({
            capability: playerCapability,
            selectedIndex,
            expectedPhaseGeneration: view.version,
          });
        }
      },
      "Could not lock your answer",
    );
  }

  async function handleInitiateDispute(questionId: string, reason: QuizslopDisputeReason) {
    if (!view) return;
    setDisputeNotice(null);
    await runAction(
      "dispute",
      async () => {
        const result = fixture
          ? await fixture.initiateDispute(questionId, reason)
          : playerCapability
            ? await initiateDisputeMutation({
                capability: playerCapability,
                questionId: questionId as Id<"quizSlopQuestions">,
                reason,
                expectedPhaseGeneration: view.version,
              })
            : null;
        if (result?.kind === "ALREADY_OPEN") {
          setDisputeNotice(
            "That question is already challenged. Your token is safe — pick a different one.",
          );
        }
      },
      "Could not file the challenge",
    );
  }

  async function handleDisputeVote(disputeId: string, choice: QuizslopDisputeVoteChoice) {
    if (!view) return;
    await runAction(
      `ballot:${disputeId}`,
      async () => {
        if (fixture) {
          await fixture.castDisputeVote(disputeId, choice);
        } else if (playerCapability) {
          await castDisputeVoteMutation({
            capability: playerCapability,
            disputeId: disputeId as Id<"quizSlopDisputes">,
            choice,
            expectedPhaseGeneration: view.version,
          });
        }
      },
      "Could not cast that ruling",
    );
  }

  async function handleHostAction(kind: "start" | "advance") {
    if (!view) return;
    await runAction(
      `host:${kind}`,
      async () => {
        if (fixture) {
          await (kind === "start" ? fixture.start() : fixture.advance());
        } else if (hostCapability) {
          if (kind === "start") {
            await startMutation({ capability: hostCapability });
          } else {
            await advanceMutation({
              capability: hostCapability,
              expectedPhaseGeneration: view.version,
            });
          }
        }
      },
      "Host action failed",
    );
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
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--qs-edge)", borderTopColor: "var(--qs-marquee)" }}
        />
      </main>
    );
  }

  const phase = view.phase;
  const isHost = view.me.isHost;
  const inRound = phase !== "LOBBY_SETUP" && phase !== "FINAL_RESULTS" && phase !== "ABANDONED";
  const showHostAdvance = isHost && canHostAdvanceQuizslopPhase(phase, view.timersDisabled);

  return (
    <div className="relative flex min-h-svh flex-col" style={{ color: "var(--qs-ink)" }}>
      <header
        className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5 backdrop-blur-md"
        style={{
          borderColor: "var(--qs-edge)",
          background: "color-mix(in srgb, var(--qs-bg) 88%, transparent)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-display text-sm font-black" style={{ color: "var(--qs-marquee)" }}>
            QUIZSLOP
          </span>
          <span
            className="font-mono text-[11px] font-bold tracking-widest"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            {view.roomCode}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {view.me.isParticipant && (
            <span className="flex items-center gap-1.5">
              <span
                className="font-mono text-sm font-bold tabular-nums"
                style={{ color: "var(--qs-marquee)" }}
              >
                {view.me.total}
              </span>
              <TokenChips remaining={view.me.tokensRemaining} size={13} />
            </span>
          )}
          {inRound && view.totalRounds > 0 && (
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              R{view.currentRound}/{view.totalRounds}
            </span>
          )}
        </div>
      </header>

      <main className="z-10 mx-auto w-full max-w-md flex-1 px-4 py-5">
        {(view.phaseDeadline !== null || view.timersDisabled) &&
          phase !== "FINAL_RESULTS" &&
          phase !== "ABANDONED" && (
            <div className="mb-4">
              <Timer
                deadline={view.phaseDeadline}
                serverNow={view.serverNow}
                disabled={view.timersDisabled && view.phaseDeadline === null}
              />
            </div>
          )}

        <AnimatePresence>
          {actionError && (
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
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${phase}:${view.currentRound}:${view.revealOrdinal}`}
            variants={phaseTransition}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <QuizslopControllerPhaseContent
              view={view}
              busyAction={busyAction}
              topicTakenNotice={topicTakenNotice}
              disputeNotice={disputeNotice}
              actions={{
                chooseTopic: (catalogTopicId) => void handleChooseTopic(catalogTopicId),
                castHouseVote: (topicId) => void handleHouseVote(topicId),
                submitCall: (targetPlayerId) => void handleSubmitCall(targetPlayerId),
                lockAnswer: (selectedIndex) => void handleLockAnswer(selectedIndex),
                initiateDispute: (questionId, reason) =>
                  void handleInitiateDispute(questionId, reason),
                castDisputeVote: (disputeId, choice) => void handleDisputeVote(disputeId, choice),
                start: () => void handleHostAction("start"),
              }}
            />
          </motion.div>
        </AnimatePresence>

        {/* Host tools: a playing host opens the shared stage in its own tab. */}
        {isHost && (
          <div
            className="mt-6 flex flex-col gap-2 rounded-2xl border p-3"
            style={{ borderColor: "var(--qs-edge)", background: "var(--qs-surface)" }}
          >
            <p
              className="font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              Host tools
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/stage/${view.roomCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider"
                style={{ borderColor: "var(--qs-signal)", color: "var(--qs-signal)" }}
              >
                Open stage
              </Link>
              {showHostAdvance && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleHostAction("advance")}
                  className="cursor-pointer rounded-xl px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: "var(--qs-signal)", color: "var(--qs-accent-ink)" }}
                >
                  {busyAction === "host:advance"
                    ? "Working..."
                    : isQuizslopSubmissionPhase(phase)
                      ? "Close phase"
                      : "Continue"}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-5">
          <VoiceLineBanner voiceLine={view.voiceLine} />
        </div>

        {view.scoreboard.length > 0 && phase === "ROUND_RESULTS" && (
          <div className="mt-4">
            <ScoreboardStrip scoreboard={view.scoreboard} highlightPlayerId={view.me.playerId} />
          </div>
        )}

        {view.me.isParticipant &&
          phase !== "ROUND_RESULTS" &&
          phase !== "FINAL_RESULTS" &&
          phase !== "ABANDONED" && (
            <p
              className="mt-4 text-center font-mono text-[11px] tabular-nums"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              {view.me.name ?? "You"} · {view.me.total} pts · quiz {view.me.quizSubtotal} · calls{" "}
              {formatSignedPoints(view.me.callSubtotal)}
            </p>
          )}
      </main>
    </div>
  );
}
