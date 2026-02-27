"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useSyncExternalStore,
  startTransition,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import type { GameState } from "@/lib/types";
import { filterCastVotes } from "@/lib/types";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { springGentle, springBouncy } from "@/lib/animations";
import { PlayerAvatar } from "@/components/player-avatar";
import { ScoreBarChart } from "@/components/score-bar-chart";
import { playSound, preloadSounds } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { MIN_PLAYERS, MAX_PLAYERS } from "../game-constants";
import {
  useOptimisticChat,
  type OptimisticChatMessage,
} from "./use-optimistic-chat";
import { useChatParticles, ChatParticleLayer } from "./chat-particles";

/* ─── localStorage helpers ─── */

function getPlayerId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("playerId");
}

function getHostControlToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("hostControlToken");
}

const noopSubscribe = () => () => {};

/* ─── Polling ─── */

const POLL_ACTIVE_MS = 1000;
const POLL_IDLE_MS = 3000;
const POLL_LOBBY_MS = 4000;
const HEARTBEAT_TOUCH_MS = 15_000;
const HEARTBEAT_TOUCH_LOBBY_MS = 60_000;

function isPageHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function useChatGamePoller(
  code: string,
  playerId: string | null,
  hostControlToken: string | null,
  viewMode: "game" | "stage",
) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const versionRef = useRef<number | null>(null);
  const statusRef = useRef<string | null>(null);
  const lastTouchAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let cancelHiddenWait: (() => void) | null = null;
    versionRef.current = null;
    statusRef.current = null;
    lastTouchAtRef.current = 0;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const waitUntilVisible = () =>
      new Promise<void>((resolve) => {
        if (!isPageHidden()) { resolve(); return; }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          document.removeEventListener("visibilitychange", onVis);
          cancelHiddenWait = null;
          resolve();
        };
        const onVis = () => { if (!isPageHidden()) finish(); };
        cancelHiddenWait = finish;
        document.addEventListener("visibilitychange", onVis);
      });

    function getPollDelay(): number {
      const s = statusRef.current ?? "";
      if (s === "WRITING" || s === "VOTING") return POLL_ACTIVE_MS;
      if (s === "LOBBY") return POLL_LOBBY_MS;
      return POLL_IDLE_MS;
    }

    function getTouchInterval(): number {
      return statusRef.current === "LOBBY" ? HEARTBEAT_TOUCH_LOBBY_MS : HEARTBEAT_TOUCH_MS;
    }

    async function poll() {
      while (!cancelled) {
        try {
          if (isPageHidden()) { await waitUntilVisible(); continue; }

          const params = new URLSearchParams();
          if (playerId) params.set("playerId", playerId);
          if (versionRef.current !== null) params.set("v", String(versionRef.current));

          const shouldTouch =
            !!playerId &&
            statusRef.current !== "FINAL_RESULTS" &&
            Date.now() - lastTouchAtRef.current >= getTouchInterval();
          const shouldHostTouch =
            !!hostControlToken &&
            viewMode === "stage" &&
            statusRef.current !== "FINAL_RESULTS" &&
            Date.now() - lastTouchAtRef.current >= getTouchInterval();
          if (shouldTouch) params.set("touch", "1");
          if (shouldHostTouch) params.set("hostTouch", "1");

          const qs = params.toString();
          const url = `/api/games/${code}${qs ? `?${qs}` : ""}`;
          const headers: HeadersInit = {};
          if (versionRef.current !== null) headers["If-None-Match"] = `"${versionRef.current}"`;
          if (shouldHostTouch && hostControlToken) headers["x-host-control-token"] = hostControlToken;

          const res = await fetch(url, { headers, cache: "no-store" });
          if (cancelled) continue;

          if (res.status === 304) {
            if (shouldTouch || shouldHostTouch) lastTouchAtRef.current = Date.now();
            if (statusRef.current === "FINAL_RESULTS") return;
            await sleep(getPollDelay());
            continue;
          }

          if (!res.ok) {
            if (res.status === 404) { setError("Game not found"); return; }
            await sleep(2000);
            continue;
          }

          if (shouldTouch || shouldHostTouch) lastTouchAtRef.current = Date.now();
          const data = (await res.json()) as GameState;
          startTransition(() => setGameState(data));
          versionRef.current = data.version ?? null;
          statusRef.current = data.status ?? null;
          if (data.status === "FINAL_RESULTS") return;
        } catch {
          await sleep(2000);
          continue;
        }
        await sleep(getPollDelay());
      }
    }

    void poll();
    return () => { cancelled = true; cancelHiddenWait?.(); };
  }, [code, playerId, hostControlToken, viewMode, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  return { gameState, error, refresh };
}

/* ─── Shared animation configs ─── */

const msgSpring = { type: "spring" as const, stiffness: 500, damping: 32 };
const gentleSpring = { type: "spring" as const, stiffness: 300, damping: 25 };

/* ─── Typing indicator ─── */

function TypingDots({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[var(--cs-ink-dim)]"
            style={{ animation: `cs-typing-dot 1.4s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
      {label && (
        <span className="text-[11px] text-[var(--cs-ink-dim)] font-medium">{label}</span>
      )}
    </div>
  );
}

/* ─── System message (inline in feed) ─── */

function SystemMsg({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <motion.div
      className="flex items-center justify-center gap-2 py-2"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={msgSpring}
    >
      {icon}
      <span className="text-[11px] font-medium text-[var(--cs-ink-dim)] tracking-wide">
        {children}
      </span>
    </motion.div>
  );
}

/* ─── Chat bubble ─── */

function Bubble({
  message,
  playerName,
  modelId,
  isMe,
  onRetry,
  onDismiss,
}: {
  message: OptimisticChatMessage;
  playerName: string;
  modelId: string | null;
  isMe: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const isPending = message.status === "pending";
  const isFailed = message.status === "failed";
  const isAi = !!modelId;

  const bubbleBg = isMe
    ? "bg-[var(--cs-bubble-me)]"
    : isAi
      ? "bg-[var(--cs-bubble-ai)]"
      : "bg-[var(--cs-bubble-other)]";

  const bubbleRadius = isMe
    ? "rounded-2xl rounded-tr-sm"
    : "rounded-2xl rounded-tl-sm";

  return (
    <motion.div
      className={`flex gap-2.5 max-w-[85%] lg:max-w-[70%] ${isMe ? "ml-auto flex-row-reverse" : ""}`}
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={msgSpring}
    >
      <div className="shrink-0 mt-0.5">
        <PlayerAvatar
          name={playerName}
          modelId={modelId}
          size={28}
          className="rounded-full ring-1 ring-[var(--cs-edge)]"
        />
      </div>
      <div className={`min-w-0 flex flex-col ${isMe ? "items-end" : "items-start"}`}>
        <span className={`text-[10px] lg:text-[11px] font-semibold mb-0.5 ${isAi ? "text-[var(--cs-violet)]" : isMe ? "text-[var(--cs-accent)]" : "text-[var(--cs-ink-dim)]"}`}>
          {playerName}
        </span>
        <div
          className={`px-3.5 py-2.5 lg:px-4 lg:py-3 text-sm lg:text-[15px] leading-relaxed break-words ${bubbleBg} ${bubbleRadius} ${isPending ? "opacity-50" : ""} ${isFailed ? "ring-1 ring-fail/40" : ""}`}
          style={{ color: "var(--cs-ink)" }}
        >
          {message.content}
        </div>
        {isFailed && (
          <div className={`flex gap-2 mt-0.5 text-[10px] font-medium ${isMe ? "justify-end" : ""}`}>
            <button onClick={onRetry} className="text-[var(--cs-accent)] hover:underline cursor-pointer">Retry</button>
            <button onClick={onDismiss} className="text-[var(--cs-ink-dim)] hover:text-[var(--cs-ink)] cursor-pointer">Dismiss</button>
          </div>
        )}
        {isPending && (
          <span className={`text-[10px] text-[var(--cs-ink-dim)] opacity-50 mt-0.5 ${isMe ? "text-right" : ""}`}>
            Sending...
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Game event cards (rendered as "messages" in the feed) ─── */

function GameCard({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <motion.div
      className="mx-auto w-full max-w-sm lg:max-w-md"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={gentleSpring}
    >
      <div
        className={`rounded-2xl px-4 py-4 backdrop-blur-sm ${accent ? "bg-[var(--cs-bubble-game)] border border-[var(--cs-accent)]/20" : "bg-[var(--cs-surface)] border border-[var(--cs-edge)]"}`}
        style={accent ? { boxShadow: "var(--cs-glow)" } : { boxShadow: "var(--cs-shadow)" }}
      >
        {children}
      </div>
    </motion.div>
  );
}

/* ─── Vote option button ─── */

function VoteOption({
  text,
  isMine,
  disabled,
  onVote,
}: {
  text: string;
  isMine: boolean;
  disabled: boolean;
  onVote: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={isMine ? undefined : onVote}
      disabled={disabled || isMine}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
        isMine
          ? "border-[var(--cs-violet)]/20 bg-[var(--cs-violet-soft)] opacity-60 cursor-not-allowed"
          : "border-[var(--cs-edge)] bg-[var(--cs-surface)] hover:border-[var(--cs-accent)]/40 hover:bg-[var(--cs-accent-soft)] cursor-pointer"
      }`}
      whileHover={isMine ? {} : { scale: 1.01, y: -1 }}
      whileTap={isMine ? {} : { scale: 0.98 }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={msgSpring}
    >
      <p className="text-sm font-medium" style={{ color: "var(--cs-ink)" }}>{text}</p>
      {isMine && (
        <span className="text-[10px] text-[var(--cs-violet)] font-medium mt-0.5 block">
          Your answer
        </span>
      )}
    </motion.button>
  );
}

/* ─── Result row ─── */

function ResultRow({
  text,
  playerName,
  modelId,
  voteCount,
  totalVotes,
  points,
  isWinner,
  delay,
}: {
  text: string;
  playerName: string;
  modelId: string | null;
  voteCount: number;
  totalVotes: number;
  points: number;
  isWinner: boolean;
  delay: number;
}) {
  const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
  return (
    <motion.div
      className={`relative overflow-hidden rounded-xl px-3.5 py-3 border ${
        isWinner
          ? "border-[var(--cs-accent)]/30 bg-[var(--cs-accent-soft)]"
          : "border-[var(--cs-edge)] bg-[var(--cs-surface)]"
      }`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...gentleSpring, delay }}
    >
      {/* Vote bar bg */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: isWinner
            ? "linear-gradient(90deg, var(--cs-accent-soft), transparent)"
            : "linear-gradient(90deg, var(--cs-raised), transparent)",
        }}
        initial={{ width: "0%" }}
        animate={{ width: `${pct}%` }}
        transition={{ ...springGentle, delay: delay + 0.2 }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--cs-ink)" }}>
            {text}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <PlayerAvatar name={playerName} modelId={modelId} size={14} className="rounded-full" />
            <span className="text-[11px] text-[var(--cs-ink-dim)] font-medium">{playerName}</span>
            {isWinner && (
              <motion.span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[var(--cs-accent)]/20 text-[var(--cs-accent)]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...springBouncy, delay: delay + 0.4 }}
              >
                Winner
              </motion.span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className={`font-mono font-bold text-base tabular-nums ${isWinner ? "text-[var(--cs-accent)]" : "text-[var(--cs-ink-dim)]"}`}>
            {points >= 0 ? "+" : ""}{points}
          </span>
          <p className="text-[10px] text-[var(--cs-ink-dim)] tabular-nums">
            {voteCount}v ({pct}%)
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Progress pill ─── */

function ProgressPill({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const done = current >= total && total > 0;
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <div className="w-24 h-1 rounded-full bg-[var(--cs-edge)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: done
              ? "var(--cs-accent)"
              : "linear-gradient(90deg, var(--cs-accent), var(--cs-violet))",
          }}
          initial={{ width: "0%" }}
          animate={{ width: `${pct}%` }}
          transition={springGentle}
        />
      </div>
      <span className="text-[10px] font-mono text-[var(--cs-ink-dim)] tabular-nums">
        {current}/{total} {label}
      </span>
    </div>
  );
}

/* ─── Chat input bar ─── */

function ChatBar({
  mode,
  onSend,
  disabled,
  placeholder,
}: {
  mode: "chat" | "response" | "disabled";
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const [text, setText] = useState("");

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  const isResponse = mode === "response";
  const maxLen = isResponse ? 100 : 200;

  return (
    <div className="flex gap-2 items-end">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
        placeholder={placeholder}
        maxLength={maxLen}
        disabled={disabled || mode === "disabled"}
        className="flex-1 py-2.5 px-4 rounded-2xl text-sm transition-all focus:outline-none disabled:opacity-30"
        style={{
          background: "var(--cs-raised)",
          color: "var(--cs-ink)",
          border: `1px solid var(--cs-edge)`,
        }}
      />
      <motion.button
        type="button"
        onClick={handleSend}
        disabled={disabled || mode === "disabled" || !text.trim()}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: isResponse ? "var(--cs-accent)" : "var(--cs-accent-soft)",
          color: isResponse ? "var(--cs-bg)" : "var(--cs-accent)",
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </motion.button>
    </div>
  );
}

/* ─── Main component ─── */

export function ChatGameShell({
  code,
  viewMode = "game",
}: {
  code: string;
  viewMode?: "game" | "stage";
}) {
  const searchParams = useSearchParams();
  const playerId = useSyncExternalStore(noopSubscribe, getPlayerId, () => null);
  const hostControlToken = useSyncExternalStore(noopSubscribe, getHostControlToken, () => null);
  const { gameState, error, refresh } = useChatGamePoller(code, playerId, hostControlToken, viewMode);
  const { triggerElement } = usePixelDissolve();

  // Optimistic chat
  const chatEnabled = !!gameState && gameState.status !== "FINAL_RESULTS";
  const { messages: chatMessages, sendMessage: sendChatMessage, retryMessage, dismissFailed, incomingTick } = useOptimisticChat(code, playerId, chatEnabled);

  // Chat particle effects (each message = one pixel in the rain)
  const { particles: chatParticles, containerRef: particleContainerRef, emitIncoming, emitOutgoing } = useChatParticles();

  // Transient UI state
  const [submitting, setSubmitting] = useState(false);
  const [votingBusy, setVotingBusy] = useState(false);
  const [votedPromptId, setVotedPromptId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [endingGame, setEndingGame] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const rejoinAttempted = useRef(false);
  const phaseKeyRef = useRef("");
  const prevStatus = useRef<string | undefined>(undefined);
  const advancePendingRef = useRef(false);
  const startPendingRef = useRef(false);

  // Reset transient state on phase change
  useEffect(() => {
    if (!gameState) return;
    const key = `${gameState.status}:${gameState.currentRound}`;
    if (phaseKeyRef.current !== key) {
      phaseKeyRef.current = key;
      setActionError("");
      setVotedPromptId(null);
      setSubmitting(false);
      setVotingBusy(false);
      setAdvancing(false);
      advancePendingRef.current = false;
      startPendingRef.current = false;
    }
  }, [gameState]);

  // Phase transition sound
  useEffect(() => {
    const status = gameState?.status;
    if (!status || status === prevStatus.current) return;
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (!prev || status === "LOBBY") return;
    playSound("phase-transition");
  }, [gameState?.status]);

  // Final results celebration
  const confettiFired = useRef(false);
  useEffect(() => {
    if (gameState?.status !== "FINAL_RESULTS" || confettiFired.current) return;
    confettiFired.current = true;
    playSound("game-over");
    const timer = setTimeout(() => playSound("celebration"), 2000);
    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ["#D4A853", "#C08B6E", "#F0E8D8"] });
    });
    return () => clearTimeout(timer);
  }, [gameState?.status]);

  // Player join/leave sounds (lobby)
  const players = gameState?.players;
  const prevPlayerIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!players) return;
    const currentIds = new Set(players.map((p) => p.id));
    const prev = prevPlayerIds.current;
    prevPlayerIds.current = currentIds;
    if (!prev) return; // skip initial render
    const hasJoin = players.some((p) => !prev.has(p.id));
    const hasLeave = [...prev].some((id) => !currentIds.has(id));
    if (hasJoin) playSound("player-join");
    else if (hasLeave) playSound("player-leave");
  }, [players]);

  // Chat receive sound + particle (new messages from other players)
  const incomingTickRef = useRef(incomingTick);
  useEffect(() => {
    if (incomingTick > incomingTickRef.current) {
      playSound("chat-receive");
      // Particle falls from above → lands near the bottom of the feed
      const container = particleContainerRef.current;
      const targetY = container ? container.scrollHeight - 40 : 300;
      emitIncoming(targetY, false);
    }
    incomingTickRef.current = incomingTick;
  }, [incomingTick, emitIncoming, particleContainerRef]);

  // Round start sound (entering WRITING = new round begins)
  const status = gameState?.status;
  const currentRoundNum = gameState?.currentRound;
  const prevRoundRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (status !== "WRITING" || currentRoundNum == null) return;
    if (prevRoundRef.current !== undefined && currentRoundNum !== prevRoundRef.current) {
      playSound("round-start");
    }
    prevRoundRef.current = currentRoundNum;
  }, [status, currentRoundNum]);

  // Winner reveal sound on ROUND_RESULTS
  const roundResultsFired = useRef<string>("");
  useEffect(() => {
    if (status !== "ROUND_RESULTS" || currentRoundNum == null) return;
    const key = `${currentRoundNum}`;
    if (roundResultsFired.current === key) return;
    roundResultsFired.current = key;
    playSound("winner-reveal");
  }, [status, currentRoundNum]);

  // All-in sound: everyone submitted their response
  const allInFired = useRef<string>("");
  useEffect(() => {
    if (!gameState || gameState.status !== "WRITING") return;
    const prompt = gameState.rounds[0]?.prompts[0];
    if (!prompt) return;
    const active = gameState.players.filter(
      (p) => p.type !== "SPECTATOR" && p.participationStatus === "ACTIVE",
    );
    if (active.length < 2) return;
    const allSubmitted = prompt.responses.length >= active.length;
    const key = `${gameState.currentRound}`;
    if (allSubmitted && allInFired.current !== key) {
      allInFired.current = key;
      playSound("all-in");
    }
  }, [gameState]);

  // Visibility-triggered refresh
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  // Rejoin attempt
  useEffect(() => {
    if (!gameState || rejoinAttempted.current) return;
    const inGame = gameState.players.some((p) => p.id === playerId);
    if (inGame || !playerId) return;
    rejoinAttempted.current = true;
    const token = searchParams.get("rejoin") ?? localStorage.getItem("rejoinToken");
    if (!token) return;

    setReconnecting(true);
    fetch(`/api/games/${code}/rejoin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("playerId", data.playerId);
          localStorage.setItem("playerName", data.playerName);
          localStorage.setItem("rejoinToken", token);
          refresh();
        }
      })
      .catch(() => { rejoinAttempted.current = false; })
      .finally(() => setReconnecting(false));
  }, [gameState, playerId, code, searchParams, refresh]);

  // Auto-scroll feed
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameState?.status, gameState?.currentRound, chatMessages.length]);

  // Preload sounds
  useEffect(() => {
    window.addEventListener("pointerdown", preloadSounds, { once: true });
    return () => window.removeEventListener("pointerdown", preloadSounds);
  }, []);

  // Derived state
  const isHost = playerId === gameState?.hostPlayerId || (viewMode === "stage" && !!hostControlToken && gameState?.hostPlayerId == null);
  const currentRound = gameState?.rounds[0];
  const currentPrompt = currentRound?.prompts[0];
  const activePlayers = useMemo(
    () => gameState?.players.filter((p) => p.type !== "SPECTATOR" && p.participationStatus === "ACTIVE") ?? [],
    [gameState?.players],
  );
  const hasSubmitted = useMemo(() => {
    if (!currentPrompt || !playerId) return false;
    return currentPrompt.responses.some((r) => r.playerId === playerId);
  }, [currentPrompt, playerId]);
  const hasVoted = useMemo(() => {
    if (votedPromptId) return true;
    if (!currentPrompt || !playerId) return false;
    return currentPrompt.votes.some((v) => v.voterId === playerId);
  }, [currentPrompt, playerId, votedPromptId]);
  const canEndGame = isHost && (gameState?.status === "WRITING" || gameState?.status === "VOTING" || gameState?.status === "ROUND_RESULTS");

  // ─── Actions ───

  function handleKick(targetPlayerId: string) {
    const target = gameState!.players.find((p) => p.id === targetPlayerId);
    if (!window.confirm(`Kick ${target?.name ?? "this player"}?`)) return;
    const hostToken = localStorage.getItem("hostControlToken");
    fetch(`/api/games/${code}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, hostToken, targetPlayerId }),
    }).catch(() => {});
  }

  async function handleStartGame() {
    if (startPendingRef.current) return;
    const hostToken = localStorage.getItem("hostControlToken");
    if (!playerId && !hostToken) return;
    startPendingRef.current = true;
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to start");
        startPendingRef.current = false;
      } else {
        playSound("game-start");
        refresh();
      }
    } catch {
      setActionError("Something went wrong");
      startPendingRef.current = false;
    }
  }

  async function handleVote(responseId: string) {
    if (!playerId || !currentPrompt || votingBusy) return;
    setVotingBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: playerId, promptId: currentPrompt.id, responseId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to vote");
      } else {
        setVotedPromptId(currentPrompt.id);
        playSound("vote-cast");
      }
    } catch {
      setActionError("Something went wrong");
    } finally {
      setVotingBusy(false);
    }
  }

  async function handleNextRound() {
    if (advancePendingRef.current) return;
    const hostToken = localStorage.getItem("hostControlToken");
    advancePendingRef.current = true;
    setAdvancing(true);
    setActionError("");
    playSound("round-transition");
    try {
      const res = await fetch(`/api/games/${code}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Failed to advance");
        advancePendingRef.current = false;
        setAdvancing(false);
      }
    } catch {
      setActionError("Something went wrong");
      advancePendingRef.current = false;
      setAdvancing(false);
    }
  }

  async function handleEndGame() {
    if ((!playerId && !hostControlToken) || !canEndGame) return;
    if (!window.confirm("End the game early? Scores will be calculated for completed rounds.")) return;
    setEndingGame(true);
    try {
      await fetch(`/api/games/${code}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken: hostControlToken }),
      });
    } finally {
      setEndingGame(false);
    }
  }

  async function handleForceAdvance() {
    const hostToken = localStorage.getItem("hostControlToken");
    if (!playerId && !hostToken) return;
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || "Action failed");
      }
    } catch {
      setActionError("Something went wrong");
    }
  }

  // ─── Loading / Error states ───

  if (reconnecting) {
    return (
      <div data-game="chatslop" className="h-svh flex items-center justify-center" style={{ background: "var(--cs-bg)" }}>
        <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-[var(--cs-edge)] border-t-[var(--cs-accent)] animate-spin" />
          <p className="text-sm font-medium" style={{ color: "var(--cs-ink-dim)" }}>Reconnecting...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-game="chatslop" className="h-svh flex items-center justify-center" style={{ background: "var(--cs-bg)" }}>
        <motion.div className="text-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-fail-soft border border-fail/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fail">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-fail font-bold text-lg">{error}</p>
        </motion.div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div data-game="chatslop" className="h-svh flex flex-col" style={{ background: "var(--cs-bg)" }}>
        <div className="shrink-0 px-4 py-3 flex items-center gap-2.5 border-b" style={{ borderColor: "var(--cs-edge)" }}>
          <div className="h-4 w-20 rounded-md animate-pulse" style={{ background: "var(--cs-edge)" }} />
        </div>
        <div className="flex-1 px-4 py-6 space-y-4">
          <div className="flex justify-center">
            <div className="h-5 w-28 rounded-full animate-pulse" style={{ background: "var(--cs-edge)" }} />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-2xl animate-pulse" style={{ background: "var(--cs-edge)", opacity: 1 - i * 0.2, animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
        <div className="shrink-0 px-4 py-3 border-t" style={{ borderColor: "var(--cs-edge)" }}>
          <div className="h-10 rounded-2xl animate-pulse" style={{ background: "var(--cs-edge)" }} />
        </div>
      </div>
    );
  }

  // ─── Feed items: Build a unified message list ───

  const game = gameState;
  const feedItems: React.ReactNode[] = [];

  // Lobby
  if (game.status === "LOBBY") {
    feedItems.push(
      <SystemMsg key="sys-welcome" icon={
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]" style={{ background: "var(--cs-accent-soft)", color: "var(--cs-accent)" }}>
          &#9835;
        </span>
      }>
        The lounge is open
      </SystemMsg>,
    );

    // Room code card
    feedItems.push(
      <GameCard key="lobby-code" accent>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: "var(--cs-ink-dim)" }}>
            Room Code
          </p>
          <div className="flex justify-center gap-2">
            {game.roomCode.split("").map((char, i) => (
              <motion.span
                key={i}
                className="w-11 h-14 flex items-center justify-center rounded-lg font-mono font-extrabold text-2xl"
                style={{
                  background: "var(--cs-raised)",
                  color: "var(--cs-accent)",
                  border: "1px solid var(--cs-accent)",
                  opacity: 0.9 + i * 0.025,
                  boxShadow: "0 0 12px var(--cs-accent-glow)",
                }}
                initial={{ opacity: 0, y: 8, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...springBouncy, delay: i * 0.06 }}
              >
                {char}
              </motion.span>
            ))}
          </div>
          <p className="text-[11px] mt-3 font-medium" style={{ color: "var(--cs-ink-dim)" }}>
            Share this code to invite players
          </p>
        </div>
      </GameCard>,
    );

    // Player join messages
    const actives = game.players.filter((p) => p.type !== "SPECTATOR");
    actives.forEach((p, i) => {
      feedItems.push(
        <motion.div
          key={`join-${p.id}`}
          className="flex items-center justify-center gap-2 py-1"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...msgSpring, delay: i * 0.08 }}
        >
          <PlayerAvatar name={p.name} modelId={p.modelId} size={16} className="rounded-full" />
          <span className="text-[11px] font-medium" style={{ color: "var(--cs-ink-dim)" }}>
            <span style={{ color: "var(--cs-ink)" }}>{p.name}</span>
            {p.modelId ? " (AI)" : ""} joined
          </span>
        </motion.div>,
      );
    });

    // Player count
    feedItems.push(
      <div key="lobby-count" className="text-center py-1">
        <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--cs-ink-dim)" }}>
          {actives.length}/{MAX_PLAYERS} players
          {actives.length < MIN_PLAYERS && ` (need ${MIN_PLAYERS - actives.length} more)`}
        </span>
      </div>,
    );
  }

  // Writing
  if (game.status === "WRITING" && currentPrompt) {
    const submittedCount = currentPrompt.responses.length;
    const totalCount = activePlayers.length;

    feedItems.push(
      <SystemMsg key="sys-round">
        Round {game.currentRound} of {game.totalRounds}
      </SystemMsg>,
    );

    // Prompt as a "bot message"
    feedItems.push(
      <motion.div
        key="prompt-msg"
        className="flex gap-2.5 max-w-[85%] lg:max-w-[70%]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={msgSpring}
      >
        <div className="shrink-0 mt-0.5">
          <span
            className="w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-sm lg:text-base"
            style={{ background: "var(--cs-accent)", color: "var(--cs-bg)" }}
          >
            &#9835;
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-[10px] lg:text-[11px] font-semibold mb-0.5 block" style={{ color: "var(--cs-accent)" }}>
            ChatSlop
          </span>
          <div
            className="px-4 py-3 lg:px-5 lg:py-4 rounded-2xl rounded-tl-sm"
            style={{
              background: "var(--cs-bubble-game)",
              border: "1px solid color-mix(in srgb, var(--cs-accent) 20%, transparent)",
              boxShadow: "var(--cs-glow)",
            }}
          >
            <p className="font-bold text-base lg:text-lg leading-snug" style={{ color: "var(--cs-accent)" }}>
              {currentPrompt.text}
            </p>
            <p className="text-[10px] lg:text-[11px] mt-1.5 font-medium" style={{ color: "var(--cs-ink-dim)" }}>
              Type your funniest answer below
            </p>
          </div>
        </div>
      </motion.div>,
    );

    // If submitted, show confirmation
    if (hasSubmitted) {
      const myResponse = currentPrompt.responses.find((r) => r.playerId === playerId);
      if (myResponse) {
        feedItems.push(
          <motion.div
            key="my-response"
            className="flex gap-2.5 max-w-[85%] lg:max-w-[70%] ml-auto flex-row-reverse"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={msgSpring}
          >
            <div className="min-w-0 flex flex-col items-end">
              <div className="px-3.5 py-2 rounded-2xl rounded-tr-sm" style={{ background: "var(--cs-bubble-me)", color: "var(--cs-ink)" }}>
                <p className="text-sm leading-relaxed">{myResponse.text}</p>
              </div>
              <span className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "var(--cs-accent)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Submitted
              </span>
            </div>
          </motion.div>,
        );
      }
    }

    // Progress
    feedItems.push(
      <ProgressPill key="writing-progress" current={submittedCount} total={totalCount} label="submitted" />,
    );

    // Stage view: show who submitted
    if (viewMode === "stage") {
      currentPrompt.responses.forEach((r) => {
        const player = game.players.find((p) => p.id === r.playerId);
        feedItems.push(
          <SystemMsg key={`submitted-${r.id}`}>
            {player?.name ?? "?"} submitted their answer
          </SystemMsg>,
        );
      });
    }

    // Waiting indicator
    if (hasSubmitted || viewMode === "stage") {
      feedItems.push(<TypingDots key="writing-wait" label="Others are writing..." />);
    }
  }

  // Voting
  if (game.status === "VOTING" && currentPrompt) {
    const votedCount = currentPrompt.votes.length;
    const totalCount = activePlayers.length;
    const responses = currentPrompt.responses.filter((r) => r.text !== FORFEIT_MARKER);

    feedItems.push(
      <SystemMsg key="sys-vote">Vote for the best answer!</SystemMsg>,
    );

    // Show prompt reminder
    feedItems.push(
      <motion.div
        key="vote-prompt"
        className="text-center py-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <span className="text-xs font-medium" style={{ color: "var(--cs-ink-dim)" }}>
          &ldquo;{currentPrompt.text}&rdquo;
        </span>
      </motion.div>,
    );

    if (!hasVoted) {
      // Vote options as a card
      feedItems.push(
        <GameCard key="vote-card">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--cs-ink-dim)" }}>
            Tap to vote
          </p>
          <div className="space-y-2">
            {responses.map((resp) => {
              const isMine = resp.playerId === playerId;
              return (
                <VoteOption
                  key={resp.id}
                  text={resp.text}
                  isMine={isMine}
                  disabled={votingBusy}
                  onVote={() => {
                    triggerElement(document.activeElement as HTMLElement);
                    void handleVote(resp.id);
                  }}
                />
              );
            })}
          </div>
        </GameCard>,
      );
    } else {
      // Vote cast confirmation
      feedItems.push(
        <motion.div
          key="vote-done"
          className="flex items-center justify-center gap-2 py-3"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springBouncy}
        >
          <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--cs-accent-soft)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--cs-accent)" }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--cs-accent)" }}>Vote cast!</span>
        </motion.div>,
      );
      feedItems.push(<TypingDots key="vote-wait" label="Waiting for votes..." />);
    }

    feedItems.push(
      <ProgressPill key="vote-progress" current={votedCount} total={totalCount} label="voted" />,
    );
  }

  // Round Results
  if (game.status === "ROUND_RESULTS" && currentPrompt) {
    const castVotes = filterCastVotes(currentPrompt.votes);
    const totalVotes = castVotes.length;
    const sortedResponses = [...currentPrompt.responses]
      .filter((r) => r.text !== FORFEIT_MARKER)
      .sort((a, b) => b.pointsEarned - a.pointsEarned);
    const winnerId = sortedResponses[0]?.id;

    feedItems.push(
      <SystemMsg key="sys-results">Round {game.currentRound} Results</SystemMsg>,
    );

    // Prompt reminder
    feedItems.push(
      <motion.div key="result-prompt" className="text-center py-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <span className="text-xs font-medium" style={{ color: "var(--cs-ink-dim)" }}>
          &ldquo;{currentPrompt.text}&rdquo;
        </span>
      </motion.div>,
    );

    // Results card
    feedItems.push(
      <GameCard key="results-card" accent>
        <div className="space-y-2">
          {sortedResponses.map((resp, idx) => {
            const voteCount = castVotes.filter((v) => v.responseId === resp.id).length;
            const player = game.players.find((p) => p.id === resp.playerId);
            return (
              <ResultRow
                key={resp.id}
                text={resp.text}
                playerName={player?.name ?? "?"}
                modelId={player?.modelId ?? null}
                voteCount={voteCount}
                totalVotes={totalVotes}
                points={resp.pointsEarned}
                isWinner={resp.id === winnerId}
                delay={idx * 0.1}
              />
            );
          })}
        </div>
      </GameCard>,
    );

    // Standings
    feedItems.push(
      <GameCard key="standings-card">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--cs-ink-dim)" }}>
          Standings
        </p>
        <div className="space-y-1.5">
          {[...game.players].sort((a, b) => b.score - a.score).map((p, i) => (
            <motion.div
              key={p.id}
              className="flex items-center gap-2 py-1"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...gentleSpring, delay: 0.3 + i * 0.06 }}
            >
              <span className="w-4 text-center font-mono text-[11px] font-bold" style={{ color: i === 0 ? "var(--cs-accent)" : "var(--cs-ink-dim)" }}>
                {i + 1}
              </span>
              <PlayerAvatar name={p.name} modelId={p.modelId} size={18} className="rounded-full" />
              <span className="flex-1 text-sm font-medium truncate" style={{ color: i === 0 ? "var(--cs-accent)" : "var(--cs-ink)" }}>
                {p.name}
              </span>
              <span className="font-mono text-sm font-bold tabular-nums" style={{ color: i === 0 ? "var(--cs-accent)" : "var(--cs-ink-dim)" }}>
                {p.score}
              </span>
            </motion.div>
          ))}
        </div>
      </GameCard>,
    );
  }

  // Final Results
  if (game.status === "FINAL_RESULTS") {
    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    feedItems.push(
      <SystemMsg key="sys-gameover">Game Over</SystemMsg>,
    );

    // Winner announcement
    feedItems.push(
      <motion.div
        key="winner-announce"
        className="text-center py-4"
        initial={{ opacity: 0, scale: 0.7, rotate: -2 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={springBouncy}
      >
        <motion.p
          className="font-display text-3xl lg:text-4xl font-extrabold tracking-tight"
          style={{ color: "var(--cs-accent)", textShadow: "0 0 40px var(--cs-accent-glow)" }}
          initial={{ y: -15 }}
          animate={{ y: 0 }}
          transition={{ ...springBouncy, delay: 0.1 }}
        >
          Game Over!
        </motion.p>
        {winner && (
          <motion.p
            className="text-lg lg:text-xl font-display font-bold mt-2"
            style={{ color: "var(--cs-violet)" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springGentle, delay: 0.3 }}
          >
            {winner.name} wins!
          </motion.p>
        )}
      </motion.div>,
    );

    // Score chart
    feedItems.push(
      <motion.div
        key="score-chart"
        className="max-w-sm lg:max-w-md mx-auto w-full"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springGentle, delay: 0.2 }}
      >
        <ScoreBarChart game={game} />
      </motion.div>,
    );

    // AI cost
    if (game.aiCostUsd > 0) {
      feedItems.push(
        <motion.div
          key="ai-cost"
          className="text-center py-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <span className="text-[10px] font-mono" style={{ color: "var(--cs-ink-dim)" }}>
            AI Cost: ${game.aiCostUsd.toFixed(4)} &middot; {(game.aiInputTokens + game.aiOutputTokens).toLocaleString()} tokens
          </span>
        </motion.div>,
      );
    }
  }

  // Interleave chat messages
  const chatBubbles = chatMessages.map((msg) => {
    const player = game.players.find((p) => p.id === msg.playerId);
    return (
      <Bubble
        key={`chat-${msg.clientId}`}
        message={msg}
        playerName={player?.name ?? "Unknown"}
        modelId={player?.modelId ?? null}
        isMe={msg.playerId === playerId}
        onRetry={() => void retryMessage(msg.clientId)}
        onDismiss={() => dismissFailed(msg.clientId)}
      />
    );
  });

  // Determine input bar mode
  const inputMode: "chat" | "response" | "disabled" = (() => {
    if (viewMode === "stage") return "disabled";
    if (game.status === "FINAL_RESULTS") return "disabled";
    if (game.status === "WRITING" && !hasSubmitted) return "response";
    return "chat";
  })();

  const inputPlaceholder = (() => {
    if (inputMode === "response") return "Your funniest answer...";
    if (game.status === "VOTING" && !hasVoted) return "Vote above first...";
    return "Say something...";
  })();

  function handleInputSend(text: string) {
    if (inputMode === "response") {
      if (!playerId || !currentPrompt) return;
      setSubmitting(true);
      setActionError("");
      fetch(`/api/games/${code}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, promptId: currentPrompt.id, text: text.trim() }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json();
            setActionError(data.error || "Failed to submit");
          } else {
            playSound("submitted");
            // Response is a joke → particle rises into the rain
            const container = particleContainerRef.current;
            const originY = container ? container.clientHeight - 20 : 400;
            emitOutgoing(originY, true);
          }
        })
        .catch(() => setActionError("Something went wrong"))
        .finally(() => setSubmitting(false));
    } else {
      playSound("chat-send");
      // Particle rises from the input area into the rain above
      const container = particleContainerRef.current;
      const originY = container ? container.clientHeight - 20 : 400;
      emitOutgoing(originY, true);
      void sendChatMessage(text);
    }
  }

  // Host action button
  const hostAction = (() => {
    if (!isHost) return null;

    if (game.status === "LOBBY") {
      const canStart = activePlayers.length >= MIN_PLAYERS;
      const needed = MIN_PLAYERS - activePlayers.length;
      return (
        <motion.button
          onClick={(e) => {
            if (startPendingRef.current) return;
            triggerElement(e.currentTarget);
            void handleStartGame();
          }}
          disabled={startPendingRef.current || !canStart}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: canStart ? "var(--cs-accent)" : "var(--cs-raised)",
            color: canStart ? "var(--cs-bg)" : "var(--cs-ink-dim)",
            border: canStart ? "none" : "1px solid var(--cs-edge)",
          }}
          whileHover={canStart ? { scale: 1.02 } : {}}
          whileTap={canStart ? { scale: 0.98 } : {}}
        >
          {startPendingRef.current ? "Starting..." : canStart ? "Start Game" : `Need ${needed} more player${needed === 1 ? "" : "s"}`}
        </motion.button>
      );
    }

    if (game.status === "WRITING" || game.status === "VOTING") {
      const label = game.status === "WRITING" ? "Skip to Voting" : "Skip to Results";
      return (
        <button
          onClick={() => void handleForceAdvance()}
          className="w-full py-2 rounded-xl text-[11px] font-medium transition-all cursor-pointer"
          style={{ color: "var(--cs-ink-dim)", border: "1px solid var(--cs-edge)" }}
        >
          {label}
        </button>
      );
    }

    if (game.status === "ROUND_RESULTS") {
      const isLast = game.currentRound >= game.totalRounds;
      return (
        <motion.button
          onClick={(e) => {
            if (advancePendingRef.current) return;
            triggerElement(e.currentTarget);
            void handleNextRound();
          }}
          disabled={advancing}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all cursor-pointer disabled:opacity-40"
          style={{ background: "var(--cs-accent)", color: "var(--cs-bg)" }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {advancing ? "Starting..." : isLast ? "Finish Game" : "Next Round"}
        </motion.button>
      );
    }

    if (game.status === "FINAL_RESULTS") {
      return (
        <Link
          href="/host"
          className="block w-full text-center py-3 rounded-xl font-bold text-sm transition-all"
          style={{ background: "var(--cs-accent)", color: "var(--cs-bg)" }}
        >
          Play Again
        </Link>
      );
    }

    return null;
  })();

  // Non-host waiting / final actions
  const nonHostAction = (() => {
    if (isHost) return null;

    if (game.status === "LOBBY") {
      return <TypingDots label="Waiting for host to start..." />;
    }

    if (game.status === "ROUND_RESULTS") {
      const isLast = game.currentRound >= game.totalRounds;
      return <TypingDots label={isLast ? "Waiting for host to finish..." : "Waiting for next round..."} />;
    }

    if (game.status === "FINAL_RESULTS") {
      return (
        <Link
          href="/join"
          className="block w-full text-center py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ background: "var(--cs-raised)", color: "var(--cs-ink)", border: "1px solid var(--cs-edge)" }}
        >
          Join Another Game
        </Link>
      );
    }

    return null;
  })();

  // ─── Render ───

  return (
    <div data-game="chatslop" className="h-svh flex flex-col" style={{ background: "var(--cs-bg)" }}>
      {/* Header */}
      <header
        className="shrink-0 px-4 py-2.5 flex items-center justify-between z-30"
        style={{ borderBottom: "1px solid var(--cs-edge)", background: "color-mix(in srgb, var(--cs-bg) 90%, transparent)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-2">
          <Link href="/" className="font-display font-extrabold text-xs tracking-tight" style={{ color: "var(--cs-accent)" }}>
            CHAT<span style={{ color: "var(--cs-violet)" }}>SLOP</span>
          </Link>
          <span className="w-px h-3" style={{ background: "var(--cs-edge)" }} />
          <span className="font-mono font-bold text-[11px] tracking-[0.15em]" style={{ color: "var(--cs-ink-dim)" }}>
            {game.roomCode}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {game.status !== "LOBBY" && (
            <span className="text-[10px] font-mono font-semibold tabular-nums" style={{ color: "var(--cs-ink-dim)" }}>
              R{game.currentRound}/{game.totalRounds}
            </span>
          )}
          <button
            onClick={() => setPlayersOpen(!playersOpen)}
            className="flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
            style={{ color: "var(--cs-ink-dim)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="font-mono font-semibold tabular-nums">{activePlayers.length}</span>
          </button>
          {canEndGame && (
            <button
              onClick={handleEndGame}
              disabled={endingGame}
              className="text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
              style={{ color: "var(--cs-ink-dim)" }}
            >
              {endingGame ? "..." : "End"}
            </button>
          )}
        </div>
      </header>

      {/* Players drawer */}
      <AnimatePresence>
        {playersOpen && (
          <motion.div
            className="shrink-0 px-4 py-3 overflow-y-auto max-h-48"
            style={{ borderBottom: "1px solid var(--cs-edge)", background: "var(--cs-surface)" }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="space-y-1.5">
              {game.players.map((p) => {
                const isDisconnected = p.participationStatus === "DISCONNECTED";
                return (
                  <div key={p.id} className={`flex items-center gap-2 py-1 ${isDisconnected ? "opacity-40" : ""}`}>
                    <PlayerAvatar name={p.name} modelId={p.modelId} size={18} className="rounded-full" />
                    <span className={`text-sm font-medium flex-1 ${isDisconnected ? "line-through" : ""}`} style={{ color: "var(--cs-ink)" }}>
                      {p.name}
                    </span>
                    {p.modelId && <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded" style={{ background: "var(--cs-violet-soft)", color: "var(--cs-violet)" }}>AI</span>}
                    {isDisconnected && <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded" style={{ background: "var(--cs-raised)", color: "var(--cs-ink-dim)" }}>Left</span>}
                    {game.status !== "LOBBY" && (
                      <span className="text-xs font-mono tabular-nums" style={{ color: "var(--cs-ink-dim)" }}>{p.score}</span>
                    )}
                    {isHost && p.id !== playerId && !isDisconnected && (
                      <button onClick={() => handleKick(p.id)} className="text-[10px] cursor-pointer" style={{ color: "var(--cs-ink-dim)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified chat feed */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-4 lg:py-6 relative">
        <ChatParticleLayer particles={chatParticles} containerRef={particleContainerRef} />
        <div className="max-w-lg lg:max-w-2xl mx-auto space-y-3 lg:space-y-4">
          {/* Game events */}
          {feedItems}

          {/* Chat messages */}
          {chatBubbles}

          <div ref={feedEndRef} />
        </div>
      </div>

      {/* Action bar + input */}
      <div
        className="shrink-0 px-4 lg:px-8 py-3 space-y-2"
        style={{ borderTop: "1px solid var(--cs-edge)", background: "color-mix(in srgb, var(--cs-bg) 92%, transparent)", backdropFilter: "blur(12px)" }}
      >
        {/* Error banner */}
        <AnimatePresence>
          {actionError && (
            <motion.div
              className="text-center text-[11px] font-medium py-1.5 px-3 rounded-lg"
              style={{ background: "var(--fail-soft, #2A1010)", color: "var(--fail, #F87171)", border: "1px solid color-mix(in srgb, var(--fail, #F87171) 30%, transparent)" }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {actionError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Host/Non-host actions */}
        <div className="max-w-lg lg:max-w-2xl mx-auto w-full space-y-2">
          {hostAction}
          {nonHostAction}

          {/* Chat/response input */}
          {inputMode !== "disabled" && !!playerId && (
            <ChatBar
              mode={inputMode}
              onSend={handleInputSend}
              disabled={submitting || (game.status === "WRITING" && hasSubmitted)}
              placeholder={inputPlaceholder}
            />
          )}
        </div>
      </div>
    </div>
  );
}
