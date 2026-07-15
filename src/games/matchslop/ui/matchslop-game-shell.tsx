"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { ErrorBanner } from "@/components/error-banner";
import {
  fadeInUp,
  collapseExpand,
  slideInRight,
  staggerContainer,
  buttonTap,
} from "@/lib/animations";
import { useConvexRoomPresence } from "@/hooks/use-convex-room-presence";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { playSound, preloadSounds } from "@/lib/sounds";
import type { GameState } from "@/lib/types";
import { MATCHSLOP_INITIAL_MOOD, clampMatchSlopMood } from "../types";

/* ─── Local Types ─── */

export {
  getMoodColor,
  MoodMeter,
  OutcomeBadge,
  OutcomeVerdict,
  ProfileCard,
  TranscriptBubble,
} from "./matchslop-stage-components";
export type {
  MatchSlopPersonaImageState,
  MatchSlopProfile,
  MatchSlopProfileGenerationState,
  MatchSlopProfilePrompt,
  MatchSlopTranscriptEntry,
  Outcome,
} from "./matchslop-stage-components";
import {
  asModeState,
  EmptyConversationState,
  EMPTY_TRANSCRIPT,
  getTranscriptSignature,
  HeartIcon,
  OutcomeVerdict,
  PenIcon,
  PersonaPostMortemPanel,
  PersonaTypingBubble,
  PhaseStatusCard,
  ProfileCard,
  SwipeLeftIcon,
  TranscriptBubble,
  type Outcome,
  type PostMortemDataLocal,
} from "./matchslop-stage-components";

export interface MatchSlopGameShellFixture {
  gameState: GameState;
  isHost: boolean;
  advance(): Promise<void> | void;
  end(): Promise<void> | void;
  managePersona(action: "generate" | "skip"): Promise<void> | void;
  start(): Promise<void> | void;
}

export function MatchSlopGameShell({
  code,
  fixture,
  viewMode = "game",
}: {
  code: string;
  fixture?: MatchSlopGameShellFixture;
  viewMode?: "game" | "stage";
}) {
  const roomSession = useConvexRoomSession(code);
  const capability = roomSession
    ? viewMode === "stage"
      ? (roomSession.hostCapability ?? roomSession.playerCapability)
      : (roomSession.playerCapability ?? roomSession.hostCapability)
    : null;
  const hostCapability = roomSession?.hostCapability ?? null;
  useConvexRoomPresence({
    capability: fixture ? null : capability,
  });
  const queriedGameState = useQuery(
    api.gameViews.stage,
    fixture ? "skip" : capability ? { capability } : "skip",
  ) as GameState | undefined;
  const gameState = fixture?.gameState ?? queriedGameState;
  const startGameMutation = useMutation(api.lobby.start);
  const advanceGameMutation = useMutation(api.matchslop.advance);
  const endGameMutation = useMutation(api.matchslop.end);
  const managePersonaMutation = useMutation(api.matchslop.managePersona);
  const { triggerElement } = usePixelDissolve();
  useScreenWakeLock(gameState != null);
  const [endingGame, setEndingGame] = useState(false);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<GameState["status"] | null>(null);
  const prevPlayerIdsRef = useRef<Set<string> | null>(null);
  const prevRoundRef = useRef<number | undefined>(undefined);
  const allInRef = useRef<string>("");
  const winnerRevealRef = useRef<string>("");
  const finalResultsRef = useRef<string>("");
  const prevTranscriptLengthRef = useRef<number | null>(null);
  const prevVoteCountRef = useRef<number | null>(null);

  // Auto-scroll transcript
  const modeState = asModeState(gameState?.modeState);
  const profileDraft = modeState.profileDraft ?? null;
  const profile = modeState.profile ?? null;
  const profileGeneration = modeState.profileGeneration ?? null;
  const outcome = (modeState.outcome ?? "IN_PROGRESS") as Outcome;
  const comebackRound = modeState.comebackRound ?? null;
  const personaImage = modeState.personaImage ?? null;
  const rawTranscript = modeState.transcript ?? EMPTY_TRANSCRIPT;
  const rawTranscriptSignature = useMemo(
    () => getTranscriptSignature(rawTranscript),
    [rawTranscript],
  );
  const lastRoundResult = modeState.lastRoundResult ?? null;
  const pendingReply = modeState.pendingPersonaReply ?? null;
  const currentRoundData =
    gameState?.rounds.find((round) => round.roundNumber === gameState.currentRound) ??
    gameState?.rounds[0];
  const currentPrompt =
    currentRoundData?.prompts[gameState?.votingPromptIndex ?? 0] ?? currentRoundData?.prompts[0];
  const isInitialProfilePending =
    gameState?.status === "WRITING" &&
    gameState.currentRound === 1 &&
    profile == null &&
    profileGeneration?.status !== "FAILED";
  const isInitialProfileFailed =
    gameState?.status === "WRITING" &&
    gameState.currentRound === 1 &&
    profile == null &&
    profileGeneration?.status === "FAILED";
  // During phase transitions the latest winner/persona line may not be
  // persisted to transcript yet. Derive a display-ready conversation so the
  // stage stays in sync with the controller prompt context.
  const transcript = useMemo(() => {
    let result = rawTranscript;
    if (
      gameState?.status === "ROUND_RESULTS" &&
      lastRoundResult?.winnerText &&
      gameState.currentRound != null
    ) {
      const winnerId = `players-turn-${gameState.currentRound}`;
      // Don't double-add if already present
      if (!result.some((e) => e.id === winnerId)) {
        result = [
          ...result,
          {
            id: winnerId,
            speaker: "PLAYERS" as const,
            text: lastRoundResult.winnerText,
            turn: gameState.currentRound,
            outcome: null,
            authorName: lastRoundResult.authorName ?? null,
            selectedPromptText:
              gameState.currentRound === 1 ? (lastRoundResult.selectedPromptText ?? null) : null,
            selectedPromptId:
              gameState.currentRound === 1 ? (lastRoundResult.selectedPromptId ?? null) : null,
          },
        ];
      }
    }

    const latestPersonaEntry = [...result].reverse().find((entry) => entry.speaker === "PERSONA");

    // While ROUND_RESULTS is still visible, show the freshly generated reply
    // as soon as it's ready, even before the persisted transcript updates.
    if (
      gameState?.status === "ROUND_RESULTS" &&
      pendingReply?.status === "READY" &&
      pendingReply.reply
    ) {
      const personaId = `persona-turn-${gameState.currentRound}`;
      if (!result.some((entry) => entry.id === personaId)) {
        result = [
          ...result,
          {
            id: personaId,
            speaker: "PERSONA" as const,
            text: pendingReply.reply,
            turn: gameState.currentRound,
            outcome: null,
            authorName: profile?.displayName ?? null,
          },
        ];
      }
    }

    // Once the next WRITING phase begins, use the active prompt as a fallback
    // persona message if transcript lags behind the new round prompt.
    if (
      gameState?.status === "WRITING" &&
      (gameState.currentRound ?? 0) > 1 &&
      currentPrompt?.text &&
      latestPersonaEntry?.text !== currentPrompt.text
    ) {
      result = [
        ...result,
        {
          id: `persona-prompt-${gameState.currentRound - 1}`,
          speaker: "PERSONA" as const,
          text: currentPrompt.text,
          turn: gameState.currentRound - 1,
          outcome: null,
          authorName: profile?.displayName ?? profileDraft?.displayName ?? null,
        },
      ];
    }

    return result;
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed on a stable transcript signature instead of object identity
  }, [
    rawTranscriptSignature,
    lastRoundResult?.winnerText,
    gameState?.status,
    gameState?.currentRound,
    pendingReply?.status,
    pendingReply?.reply,
    profile?.displayName,
    profileDraft?.displayName,
    currentPrompt?.text,
  ]);
  const isComebackRound = comebackRound != null && gameState?.currentRound === comebackRound;
  const isActiveComebackRound = isComebackRound && gameState?.status !== "FINAL_RESULTS";
  const activePlayers = useMemo(
    () =>
      gameState?.players.filter(
        (player) => player.type !== "SPECTATOR" && player.participationStatus === "ACTIVE",
      ) ?? [],
    [gameState?.players],
  );
  const activePlayerIdSet = useMemo(
    () => new Set(activePlayers.map((player) => player.id)),
    [activePlayers],
  );
  const stageProgressCount = useMemo(() => {
    if (gameState?.status !== "WRITING" || !currentPrompt) return null;
    const submitted = new Set(
      currentPrompt.responses
        .map((response) => response.playerId)
        .filter((playerId) => activePlayerIdSet.has(playerId)),
    ).size;
    return { submitted, total: activePlayers.length };
  }, [activePlayerIdSet, activePlayers.length, currentPrompt, gameState?.status]);
  const stageVoteProgressCount = useMemo(() => {
    if (gameState?.status !== "VOTING" || !currentPrompt) return null;
    const voted = new Set(
      currentPrompt.votes
        .map((vote) => vote.voterId)
        .filter((playerId) => activePlayerIdSet.has(playerId)),
    ).size;
    return { voted, total: activePlayers.length };
  }, [activePlayerIdSet, activePlayers.length, currentPrompt, gameState?.status]);
  const displaySignalCategory =
    gameState?.status === "ROUND_RESULTS" && pendingReply?.status === "READY"
      ? (pendingReply.signalCategory ?? modeState.latestSignalCategory)
      : modeState.latestSignalCategory;
  const displaySideComment =
    gameState?.status === "ROUND_RESULTS" && pendingReply?.status === "READY"
      ? (pendingReply.sideComment ?? modeState.latestSideComment)
      : modeState.latestSideComment;
  const displayMoodDelta =
    gameState?.status === "ROUND_RESULTS" && pendingReply?.status === "READY"
      ? (pendingReply.moodDelta ?? modeState.latestMoodDelta)
      : modeState.latestMoodDelta;
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      // In final results, scroll to top so the beginning of the conversation
      // (with prompt context) is visible first. During live play, scroll to
      // bottom so the newest message is always in view.
      if (gameState?.status === "FINAL_RESULTS") {
        el.scrollTop = 0;
        return;
      }
      transcriptEndRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [transcript.length, gameState?.status, currentPrompt?.text, rawTranscriptSignature]);

  useEffect(() => {
    window.addEventListener("pointerdown", preloadSounds, { once: true });
    return () => window.removeEventListener("pointerdown", preloadSounds);
  }, []);

  useEffect(() => {
    const status = gameState?.status;
    if (!status || status === prevStatusRef.current) return;
    const previousStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!previousStatus || status === "LOBBY") return;
    playSound("phase-transition");
  }, [gameState?.status]);

  useEffect(() => {
    const players = gameState?.players;
    if (!players) return;
    const currentIds = new Set(players.map((player) => player.id));
    const previousIds = prevPlayerIdsRef.current;
    prevPlayerIdsRef.current = currentIds;
    if (!previousIds) return;
    const hasJoin = players.some((player) => !previousIds.has(player.id));
    const hasLeave = [...previousIds].some((id) => !currentIds.has(id));
    if (hasJoin) {
      playSound("player-join");
    } else if (hasLeave) {
      playSound("player-leave");
    }
  }, [gameState?.players]);

  useEffect(() => {
    const status = gameState?.status;
    const currentRound = gameState?.currentRound;
    if (status !== "WRITING" || currentRound == null) return;
    if (prevRoundRef.current !== undefined && currentRound !== prevRoundRef.current) {
      playSound("round-start");
    }
    prevRoundRef.current = currentRound;
  }, [gameState?.currentRound, gameState?.status]);

  useEffect(() => {
    if (!gameState || gameState.status !== "WRITING" || !currentPrompt) return;
    if (activePlayers.length < 2) return;
    const allSubmitted = (stageProgressCount?.submitted ?? 0) >= activePlayers.length;
    const key = `${gameState.currentRound}`;
    if (allSubmitted && allInRef.current !== key) {
      allInRef.current = key;
      playSound("all-in");
    }
  }, [activePlayers.length, currentPrompt, gameState, stageProgressCount?.submitted]);

  useEffect(() => {
    const status = gameState?.status;
    const currentRound = gameState?.currentRound;
    if (status !== "ROUND_RESULTS" || currentRound == null) return;
    const key = `${currentRound}`;
    if (winnerRevealRef.current === key) return;
    winnerRevealRef.current = key;
    playSound("winner-reveal");
  }, [gameState?.currentRound, gameState?.status]);

  useEffect(() => {
    if (gameState?.status !== "FINAL_RESULTS") return;
    const key = `${gameState.currentRound}:${outcome}`;
    if (finalResultsRef.current === key) return;
    finalResultsRef.current = key;
    playSound("game-over");
    if (outcome !== "DATE_SEALED") return;
    const timer = window.setTimeout(() => playSound("celebration"), 2000);
    return () => window.clearTimeout(timer);
  }, [gameState?.currentRound, gameState?.status, outcome]);

  useEffect(() => {
    const previousLength = prevTranscriptLengthRef.current;
    prevTranscriptLengthRef.current = transcript.length;
    if (previousLength == null || transcript.length <= previousLength) return;
    const newEntries = transcript.slice(previousLength);
    const hasPlayerEntry = newEntries.some((entry) => entry.speaker === "PLAYERS");
    const hasPersonaEntry = newEntries.some((entry) => entry.speaker === "PERSONA");
    if (hasPlayerEntry) {
      playSound("chat-send");
    }
    if (!hasPersonaEntry) return;
    const timer = window.setTimeout(() => playSound("chat-receive"), hasPlayerEntry ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [transcript]);
  useEffect(() => {
    const nextVoteCount = currentPrompt?.votes?.length ?? 0;
    const previousVoteCount = prevVoteCountRef.current;
    prevVoteCountRef.current = nextVoteCount;
    if (
      previousVoteCount == null ||
      gameState?.status !== "VOTING" ||
      gameState.votingRevealing ||
      nextVoteCount <= previousVoteCount
    ) {
      return;
    }
    playSound("vote-cast");
  }, [currentPrompt?.votes?.length, gameState?.status, gameState?.votingRevealing]);

  // Set data-game attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-game", "matchslop");
    return () => {
      document.documentElement.removeAttribute("data-game");
    };
  }, []);

  const isHost = fixture?.isHost ?? hostCapability !== null;
  const canEndGame =
    isHost &&
    (gameState?.status === "WRITING" ||
      gameState?.status === "VOTING" ||
      gameState?.status === "ROUND_RESULTS");
  const canAdvancePhase = !isInitialProfilePending && !isInitialProfileFailed;
  const [personaAction, setPersonaAction] = useState<"generate" | "skip" | null>(null);
  const lobbyGenerationTriggeredRef = useRef(false);
  const personaStatus = profileGeneration?.status ?? "NOT_REQUESTED";
  const personaLobbyAction =
    personaStatus === "STREAMING" || personaStatus === "READY" ? "skip" : "generate";

  // Auto-trigger persona generation when host enters lobby
  useEffect(() => {
    if (!isHost || gameState?.status !== "LOBBY" || lobbyGenerationTriggeredRef.current) {
      return;
    }

    const genStatus = profileGeneration?.status;
    // Only trigger if not already generating or done
    if (genStatus && genStatus !== "NOT_REQUESTED") return;

    lobbyGenerationTriggeredRef.current = true;

    if (!fixture && !hostCapability) return;

    const request = fixture
      ? fixture.managePersona("generate")
      : hostCapability
        ? managePersonaMutation({ capability: hostCapability, action: "generate" })
        : undefined;
    void Promise.resolve(request).catch((cause: unknown) => {
      lobbyGenerationTriggeredRef.current = false;
      setActionError(getConvexErrorMessage(cause, "Could not start persona generation"));
    });
  }, [
    gameState?.status,
    fixture,
    hostCapability,
    isHost,
    managePersonaMutation,
    profileGeneration?.status,
  ]);

  async function postPersonaAction(action: "generate" | "skip") {
    if (!fixture && !hostCapability) return;
    setPersonaAction(action);
    setActionError("");
    try {
      if (fixture) {
        await fixture.managePersona(action);
      } else {
        if (!hostCapability) return;
        await managePersonaMutation({ capability: hostCapability, action });
      }
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Persona action failed"));
      if (action === "generate") {
        lobbyGenerationTriggeredRef.current = false;
      }
    } finally {
      setPersonaAction(null);
    }
  }

  async function postHostAction(path: "start" | "next") {
    if (!fixture && !hostCapability) return;
    setHostActionBusy(true);
    setActionError("");
    try {
      if (path === "start") {
        if (fixture) {
          await fixture.start();
        } else {
          if (!hostCapability) return;
          await startGameMutation({ capability: hostCapability });
        }
        playSound("game-start");
      } else {
        if (fixture) {
          await fixture.advance();
        } else {
          if (!hostCapability) return;
          await advanceGameMutation({ capability: hostCapability });
        }
        if (gameState?.status === "ROUND_RESULTS") {
          playSound("round-transition");
        }
      }
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Action failed"));
    } finally {
      setHostActionBusy(false);
    }
  }

  async function handleEndGame() {
    if (!canEndGame) return;
    if (!window.confirm("End the game early?")) return;
    if (!fixture && !hostCapability) return;
    setEndingGame(true);
    setActionError("");
    try {
      if (fixture) {
        await fixture.end();
      } else {
        if (!hostCapability) return;
        await endGameMutation({ capability: hostCapability });
      }
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Could not end game"));
    } finally {
      setEndingGame(false);
    }
  }

  /* ─── Loading / Error ─── */

  if (!fixture && !capability) {
    return (
      <main className="min-h-svh flex items-center justify-center px-6">
        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <p className="text-fail font-display font-bold text-xl">
            Open this room from the host or join screen
          </p>
        </motion.div>
      </main>
    );
  }

  if (!gameState) {
    return (
      <main className="min-h-svh flex items-center justify-center px-6">
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <HeartIcon size={32} className="animate-ms-heartbeat" />
          <p style={{ color: "var(--ms-ink-dim)" }}>Finding your match...</p>
        </motion.div>
      </main>
    );
  }

  /* ─── Main Layout ─── */

  return (
    <div className="min-h-svh flex flex-col overflow-x-hidden relative">
      {/* Ambient glow background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 20% 50%, var(--ms-rose-soft) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 80% 30%, var(--ms-violet-soft) 0%, transparent 70%)
          `,
          opacity: 0.6,
        }}
      />

      {/* Top bar */}
      <div
        className="shrink-0 z-30 flex items-center justify-between backdrop-blur-md"
        style={{
          paddingTop: "clamp(0.5rem, 1vw, 1rem)",
          paddingBottom: "clamp(0.5rem, 1vw, 1rem)",
          paddingLeft: "clamp(1rem, 2vw, 2rem)",
          paddingRight: "clamp(4rem, 5vw, 5.5rem)",
          background: `color-mix(in srgb, var(--ms-bg) 85%, transparent)`,
          borderBottom: "1px solid var(--ms-edge)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-display font-bold tracking-tight transition-colors hover:opacity-80"
            style={{
              fontSize: "clamp(0.7rem, 1vw, 0.9rem)",
              color: "var(--ms-rose)",
            }}
          >
            MATCHSLOP
          </Link>
          <span style={{ color: "var(--ms-edge-strong)" }}>|</span>
          <span
            className="font-mono font-bold tracking-widest"
            style={{
              fontSize: "clamp(0.65rem, 0.85vw, 0.8rem)",
              color: "var(--ms-ink-dim)",
            }}
          >
            {gameState.roomCode}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-bold uppercase tracking-wider px-3 py-1 rounded-full"
            style={{
              fontSize: "clamp(0.55rem, 0.75vw, 0.7rem)",
              color: "var(--ms-rose)",
              background: "var(--ms-rose-soft)",
            }}
          >
            {gameState.status === "LOBBY"
              ? "Lobby"
              : isActiveComebackRound
                ? "Comeback"
                : gameState.status === "WRITING"
                  ? "Writing"
                  : gameState.status === "VOTING"
                    ? "Voting"
                    : gameState.status === "ROUND_RESULTS"
                      ? "Results"
                      : "Final"}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)",
              color: "var(--ms-ink-dim)",
            }}
          >
            {isComebackRound
              ? "Comeback Round"
              : `Turn ${gameState.currentRound}/${gameState.totalRounds}`}
          </span>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 relative z-10" style={{ padding: "clamp(0.75rem, 2vw, 2rem)" }}>
        <div
          className="mx-auto h-full grid gap-[clamp(0.75rem,2vw,2rem)] items-start"
          style={{
            maxWidth: "min(100%, 120rem)",
            gridTemplateColumns: "clamp(20rem, 40%, 36rem) 1fr",
          }}
        >
          {/* Left: Profile Card */}
          <div className="sticky top-4 self-start space-y-3">
            <ProfileCard
              profile={profile ?? profileDraft}
              personaImage={personaImage}
              profileGeneration={profileGeneration}
              outcome={outcome}
              mood={
                typeof modeState.mood === "number"
                  ? clampMatchSlopMood(modeState.mood)
                  : MATCHSLOP_INITIAL_MOOD
              }
              moodDelta={displayMoodDelta}
              gameStarted={gameState.status !== "LOBBY"}
              compact={viewMode === "stage"}
            />

            {/* Persona controls in lobby and round-1 recovery */}
            <AnimatePresence>
              {isHost && (gameState.status === "LOBBY" || isInitialProfileFailed) && (
                <motion.button
                  key={`persona-${gameState.status}-${personaLobbyAction}-${personaStatus}`}
                  type="button"
                  onClick={() => void postPersonaAction(personaLobbyAction)}
                  disabled={personaAction != null}
                  className="w-full rounded-2xl font-display font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: "var(--ms-surface)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                    padding: "clamp(0.75rem, 1.2vw, 1rem)",
                    fontSize: "clamp(0.85rem, 1.1vw, 1rem)",
                    boxShadow: "var(--ms-shadow)",
                  }}
                  {...buttonTap}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                  transition={{ delay: 0.3 }}
                >
                  {personaLobbyAction === "skip" ? (
                    <SwipeLeftIcon size={18} />
                  ) : (
                    <PenIcon size={18} />
                  )}
                  {personaAction === "skip"
                    ? "Skipping..."
                    : personaAction === "generate" && personaStatus === "FAILED"
                      ? "Retrying..."
                      : personaAction === "generate"
                        ? "Generating..."
                        : personaLobbyAction === "skip"
                          ? "Skip Persona"
                          : personaStatus === "FAILED"
                            ? "Retry Persona"
                            : "Generate Persona"}
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Combined Phase Status + Conversation */}
          <div className="space-y-[clamp(0.75rem,1.5vw,1.5rem)]">
            <motion.div
              className="rounded-[1.5rem] overflow-hidden relative"
              style={{
                background: "var(--ms-surface)",
                border: "1px solid var(--ms-edge)",
                boxShadow: "var(--ms-shadow)",
              }}
              variants={slideInRight}
              initial="hidden"
              animate="visible"
            >
              {/* Phase status header */}
              <PhaseStatusCard
                gameState={gameState}
                outcome={outcome}
                isComebackRound={isActiveComebackRound}
                isHost={isHost}
                hostActionBusy={hostActionBusy}
                endingGame={endingGame}
                triggerElement={triggerElement}
                postHostAction={(path) => void postHostAction(path)}
                handleEndGame={() => void handleEndGame()}
                canEndGame={canEndGame}
                canAdvancePhase={canAdvancePhase}
                progressCount={stageProgressCount}
                voteProgressCount={stageVoteProgressCount}
                sideComment={displaySideComment}
                signalCategory={displaySignalCategory}
                moodDelta={displayMoodDelta}
              />

              {/* Conversation — hidden during lobby and final results */}
              <AnimatePresence>
                {gameState.status !== "LOBBY" && gameState.status !== "FINAL_RESULTS" && (
                  <motion.div
                    key="conversation-section"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Conversation divider + header */}
                    <div
                      className="flex items-center justify-between"
                      style={{
                        padding: "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2vw, 1.5rem)",
                        borderTop: "1px solid var(--ms-edge)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <HeartIcon size={16} className="" />
                        <h3
                          className="font-display font-bold"
                          style={{
                            fontSize: "clamp(0.85rem, 1.2vw, 1.2rem)",
                            color: "var(--ms-ink)",
                          }}
                        >
                          The conversation
                        </h3>
                      </div>
                      {transcript.length > 0 && (
                        <span
                          className="font-mono"
                          style={{
                            fontSize: "clamp(0.6rem, 0.75vw, 0.7rem)",
                            color: "var(--ms-ink-dim)",
                          }}
                        >
                          {transcript.length} message{transcript.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Conversation transcript */}
                    <div
                      ref={transcriptScrollRef}
                      className="overflow-y-auto"
                      style={{
                        padding: "0 clamp(0.75rem, 1.5vw, 1.25rem) clamp(0.75rem, 1.5vw, 1.25rem)",
                        maxHeight: "clamp(20rem, 50vh, 50rem)",
                      }}
                    >
                      {transcript.length > 0 ? (
                        <motion.div
                          className="space-y-3"
                          variants={staggerContainer}
                          initial="hidden"
                          animate="visible"
                        >
                          {transcript.map((entry, index) => (
                            <TranscriptBubble
                              key={entry.id ?? `${entry.turn ?? index}-${index}`}
                              entry={entry}
                              index={index}
                            />
                          ))}
                          {/* Typing indicator while persona reply is generating */}
                          {gameState.status === "ROUND_RESULTS" &&
                            pendingReply?.status !== "READY" &&
                            pendingReply?.status !== "FAILED" && (
                              <PersonaTypingBubble
                                personaName={profile?.displayName ?? "Persona"}
                              />
                            )}
                          <div ref={transcriptEndRef} />
                        </motion.div>
                      ) : (
                        <EmptyConversationState
                          status={gameState.status}
                          isComebackRound={isActiveComebackRound}
                          lastRoundResult={lastRoundResult}
                        />
                      )}
                    </div>

                    {/* Outcome verdict footer */}
                    <OutcomeVerdict outcome={outcome} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Post-mortem panel */}
            {gameState.status === "FINAL_RESULTS" && (
              <PersonaPostMortemPanel
                postMortem={(modeState.postMortem as PostMortemDataLocal | undefined) ?? null}
                postMortemDraft={
                  (modeState.postMortemDraft as PostMortemDataLocal | undefined) ?? null
                }
                postMortemStatus={
                  (modeState.postMortemGeneration as { status?: string } | undefined)?.status ??
                  "NOT_REQUESTED"
                }
                personaName={profile?.displayName ?? "The persona"}
              />
            )}

            {/* Final results link */}
            {gameState.status === "FINAL_RESULTS" && (
              <motion.div variants={fadeInUp} initial="hidden" animate="visible">
                <Link
                  href={isHost ? "/host" : "/join"}
                  className="block text-center rounded-2xl font-display font-semibold transition-all"
                  style={{
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                    padding: "clamp(0.75rem, 1.2vw, 1rem)",
                    fontSize: "clamp(0.85rem, 1.1vw, 1rem)",
                  }}
                >
                  {isHost ? "Host Another Game" : "Join Another Game"}
                </Link>
              </motion.div>
            )}

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
          </div>
        </div>
      </main>
    </div>
  );
}
