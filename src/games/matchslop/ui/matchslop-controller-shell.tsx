"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { CompletionCard } from "@/components/completion-card";
import { PulsingDot } from "@/components/pulsing-dot";
import { fadeInUp, buttonTap, buttonTapPrimary, springDefault } from "@/lib/animations";
import { useControllerStream } from "@/hooks/use-controller-stream";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import type { MatchSlopProfilePromptOption, ControllerVoteOption } from "@/lib/controller-types";
import { MATCHSLOP_PHOTO_PROMPT_ID, MATCHSLOP_PHOTO_PROMPT_TEXT } from "@/games/matchslop/config/game-config";

import { getPlayerId, getPlayerToken, noopSubscribe } from "@/lib/client-session";

function MatchHeader({
  roomCode,
  roundLabel,
}: {
  roomCode: string | null;
  roundLabel: string | null;
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 pl-4 pr-16 py-2.5 flex items-center justify-between bg-base/80 backdrop-blur-sm border-b border-edge">
      <div className="flex items-center gap-2">
        <Link href="/" className="font-display font-bold text-xs text-punch tracking-tight hover:text-punch-hover transition-colors">
          MATCHSLOP
        </Link>
        <span className="text-edge-strong">|</span>
        <span className="font-mono font-bold text-xs tracking-widest text-ink-dim">
          {roomCode ?? "...."}
        </span>
      </div>
      <span className="text-xs text-ink-dim">{roundLabel ?? "Controller"}</span>
    </div>
  );
}

function PhotoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ms-violet)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

/* ─── Opener Step 1: Prompt Picker ─── */

const PHOTO_PROMPT_ID = MATCHSLOP_PHOTO_PROMPT_ID;

function OpenerPromptPicker({
  options,
  personaName,
  onPick,
}: {
  options: MatchSlopProfilePromptOption[];
  personaName: string;
  onPick: (option: MatchSlopProfilePromptOption) => void;
}) {
  return (
    <motion.div
      key="prompt-picker"
      className="space-y-4"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={springDefault}
    >
      <div className="text-center">
        <p
          className="text-[11px] uppercase tracking-[0.15em] font-bold mb-1"
          style={{ color: "var(--ms-rose)" }}
        >
          Step 1
        </p>
        <p className="text-sm" style={{ color: "var(--ms-ink-dim)" }}>
          Pick a prompt from {personaName}&apos;s profile
        </p>
      </div>

      <div className="space-y-3">
        {options.map((option, i) => (
          <motion.button
            key={option.id}
            type="button"
            onClick={() => onPick(option)}
            className="w-full rounded-2xl p-4 text-left cursor-pointer transition-all"
            style={{
              background: "var(--ms-raised)",
              border: "2px solid var(--ms-edge)",
            }}
            whileHover={{
              borderColor: "var(--ms-rose)",
              background: "var(--ms-rose-soft)",
            }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springDefault, delay: i * 0.08 }}
          >
            <p
              className="font-display font-bold text-[15px] leading-snug mb-1.5"
              style={{ color: "var(--ms-rose)" }}
            >
              {option.prompt}
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--ms-ink)" }}
            >
              {option.answer}
            </p>
          </motion.button>
        ))}
      </div>

      {/* Photo-only option */}
      <div className="flex items-center gap-3 px-2">
        <div className="flex-1 h-px" style={{ background: "var(--ms-edge)" }} />
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: "var(--ms-ink-dim)" }}>
          or
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--ms-edge)" }} />
      </div>

      <motion.button
        type="button"
        onClick={() =>
          onPick({ id: PHOTO_PROMPT_ID, prompt: MATCHSLOP_PHOTO_PROMPT_TEXT, answer: "" })
        }
        className="w-full rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2.5 cursor-pointer transition-all"
        style={{
          background: "var(--ms-violet-soft)",
          border: "2px dashed var(--ms-edge-strong)",
        }}
        whileHover={{
          borderColor: "var(--ms-violet)",
          background: "var(--ms-violet-soft)",
        }}
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springDefault, delay: options.length * 0.08 }}
      >
        <PhotoIcon />
        <span
          className="font-display font-bold text-[14px]"
          style={{ color: "var(--ms-violet)" }}
        >
          Just respond to their photo
        </span>
      </motion.button>
    </motion.div>
  );
}

/* ─── Opener Step 2: Write with pinned prompt ─── */

function OpenerWriteStep({
  selectedOption,
  responseText,
  onChangeText,
  onSubmit,
  onBack,
  submitting,
  disabled,
  triggerElement,
}: {
  selectedOption: MatchSlopProfilePromptOption;
  responseText: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  disabled: boolean;
  triggerElement: (el: HTMLElement) => void;
}) {
  const isPhotoOption = selectedOption.id === PHOTO_PROMPT_ID;
  return (
    <motion.div
      key="opener-write"
      className="space-y-4"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={springDefault}
    >
      {/* Back + pinned prompt */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 mb-3 text-sm font-medium cursor-pointer transition-colors"
          style={{ color: "var(--ms-ink-dim)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Change prompt
        </button>

        {isPhotoOption ? (
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{
              background: "var(--ms-violet-soft)",
              border: "1px solid var(--ms-violet)",
            }}
          >
            <span className="shrink-0">
              <PhotoIcon size={20} />
            </span>
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.15em] font-bold mb-0.5"
                style={{ color: "var(--ms-violet)" }}
              >
                Responding to
              </p>
              <p
                className="font-display font-bold text-[15px] leading-snug"
                style={{ color: "var(--ms-violet)" }}
              >
                Their photo
              </p>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl p-4"
            style={{
              background: "var(--ms-rose-soft)",
              border: "1px solid var(--ms-rose)",
            }}
          >
            <p
              className="text-[10px] uppercase tracking-[0.15em] font-bold mb-1"
              style={{ color: "var(--ms-rose)" }}
            >
              Responding to
            </p>
            <p
              className="font-display font-bold text-[15px] leading-snug"
              style={{ color: "var(--ms-rose)" }}
            >
              {selectedOption.prompt}
            </p>
            <p
              className="text-sm mt-1 leading-relaxed"
              style={{ color: "var(--ms-ink)" }}
            >
              {selectedOption.answer}
            </p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="space-y-3">
        <div>
          <p
            className="text-[11px] uppercase tracking-[0.15em] font-bold mb-2"
            style={{ color: "var(--ms-coral)" }}
          >
            Step 2 &mdash; Write your opener
          </p>
          <input
            type="text"
            value={responseText}
            onChange={(e) => onChangeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && responseText.trim()) onSubmit();
            }}
            placeholder={isPhotoOption ? "Say something about their photo..." : `Reply to "${selectedOption.prompt}"...`}
            maxLength={300}
            autoFocus
            className="w-full py-3.5 px-4 rounded-2xl text-base focus:outline-none transition-colors"
            style={{
              background: "var(--ms-raised)",
              border: "2px solid var(--ms-edge)",
              color: "var(--ms-ink)",
            }}
          />
        </div>
        <motion.button
          type="button"
          onClick={(e) => {
            triggerElement(e.currentTarget);
            onSubmit();
          }}
          disabled={disabled}
          className="w-full py-3.5 rounded-2xl font-display font-bold text-white text-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "var(--ms-gradient-romance)",
            boxShadow: disabled ? "none" : "0 4px 20px var(--ms-rose-glow)",
          }}
          {...buttonTapPrimary}
        >
          {submitting ? "Sending..." : "Send Opener"}
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ─── Opener Voting: Responses grouped by prompt ─── */

function OpenerVotingList({
  responses,
  openerPromptById,
  forfeitCount,
  votingBusy,
  onVote,
  onPass,
  triggerElement,
}: {
  responses: ControllerVoteOption[];
  openerPromptById: Map<string, string>;
  forfeitCount: number;
  votingBusy: boolean;
  onVote: (responseId: string) => void;
  onPass: () => void;
  triggerElement: (el: HTMLElement) => void;
}) {
  // Group responses by their chosen profile prompt
  const grouped = useMemo(() => {
    const groups = new Map<string, { promptId: string; promptText: string; responses: ControllerVoteOption[] }>();
    const ungrouped: ControllerVoteOption[] = [];

    for (const resp of responses) {
      const promptId = resp.openerPromptId;
      const promptText = promptId ? openerPromptById.get(promptId) : null;
      if (promptId && promptText) {
        const existing = groups.get(promptId);
        if (existing) {
          existing.responses.push(resp);
        } else {
          groups.set(promptId, { promptId, promptText, responses: [resp] });
        }
      } else {
        ungrouped.push(resp);
      }
    }

    return { groups: [...groups.values()], ungrouped };
  }, [responses, openerPromptById]);

  const hasGroups = grouped.groups.length > 0;

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--ms-raised)",
          border: "1px solid var(--ms-edge)",
        }}
      >
        <p
          className="text-xs uppercase tracking-wider font-bold mb-1"
          style={{ color: "var(--ms-violet)" }}
        >
          Pick the best opener
        </p>
        <p className="text-sm" style={{ color: "var(--ms-ink-dim)" }}>
          {hasGroups
            ? "Responses are grouped by the prompt they chose."
            : "Vote for the funniest line."}{" "}
                Votes become points, even for strong runner-ups. Human votes count double.
        </p>
      </div>

      {hasGroups ? (
        <div className="space-y-4">
          {grouped.groups.map((group, groupIndex) => (
            <motion.div
              key={group.promptId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springDefault, delay: groupIndex * 0.06 }}
            >
              {/* Prompt label */}
              <div
                className="flex items-center gap-2 mb-2 px-1"
              >
                {group.promptId === PHOTO_PROMPT_ID ? (
                  <span className="shrink-0">
                    <PhotoIcon size={12} />
                  </span>
                ) : (
                  <span
                    className="shrink-0 w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--ms-rose)" }}
                  />
                )}
                <span
                  className="text-[11px] font-bold uppercase tracking-wider truncate"
                  style={{ color: group.promptId === PHOTO_PROMPT_ID ? "var(--ms-violet)" : "var(--ms-rose)" }}
                >
                  {group.promptText}
                </span>
              </div>

              {/* Responses under this prompt */}
              <div className="space-y-2">
                {group.responses.map((resp) => (
                  <motion.button
                    key={resp.id}
                    type="button"
                    onClick={(e) => {
                      triggerElement(e.currentTarget);
                      onVote(resp.id);
                    }}
                    disabled={votingBusy}
                    className="w-full text-left py-3 px-4 rounded-2xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: "var(--ms-raised)",
                      border: "2px solid var(--ms-edge)",
                    }}
                    whileHover={{
                      borderColor: "var(--ms-violet)",
                      background: "var(--ms-violet-soft)",
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span
                      className="text-[15px] leading-relaxed"
                      style={{ color: "var(--ms-ink)" }}
                    >
                      {resp.text}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ))}

          {/* Ungrouped responses (shouldn't normally happen but safe fallback) */}
          {grouped.ungrouped.length > 0 && (
            <div className="space-y-2">
              {grouped.ungrouped.map((resp) => (
                <motion.button
                  key={resp.id}
                  type="button"
                  onClick={(e) => {
                    triggerElement(e.currentTarget);
                    onVote(resp.id);
                  }}
                  disabled={votingBusy}
                  className="w-full text-left py-3 px-4 rounded-2xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "var(--ms-raised)",
                    border: "2px solid var(--ms-edge)",
                  }}
                  whileHover={{
                    borderColor: "var(--ms-violet)",
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span
                    className="text-[15px] leading-relaxed"
                    style={{ color: "var(--ms-ink)" }}
                  >
                    {resp.text}
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {responses.map((resp) => (
            <motion.button
              key={resp.id}
              type="button"
              onClick={(e) => {
                triggerElement(e.currentTarget);
                onVote(resp.id);
              }}
              disabled={votingBusy}
              className="w-full text-left py-3 px-4 rounded-2xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--ms-raised)",
                border: "2px solid var(--ms-edge)",
              }}
              whileHover={{
                borderColor: "var(--ms-violet)",
              }}
              whileTap={{ scale: 0.97 }}
            >
              <span
                className="text-[15px] leading-relaxed"
                style={{ color: "var(--ms-ink)" }}
              >
                {resp.text}
              </span>
            </motion.button>
          ))}
        </div>
      )}

      <motion.button
        type="button"
        onClick={(e) => {
          triggerElement(e.currentTarget);
          onPass();
        }}
        disabled={votingBusy}
        className="w-full py-2.5 rounded-2xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          border: "1px solid var(--ms-edge)",
          color: "var(--ms-ink-dim)",
        }}
        {...buttonTap}
      >
        Pass
      </motion.button>

      {forfeitCount > 0 && (
        <p className="text-xs text-center" style={{ color: "var(--ms-ink-dim)", opacity: 0.6 }}>
          {forfeitCount} {forfeitCount === 1 ? "model" : "models"} failed to respond
        </p>
      )}
    </div>
  );
}

export function MatchSlopControllerShell({ code }: { code: string }) {
  const searchParams = useSearchParams();
  const { triggerElement } = usePixelDissolve();
  const playerId = useSyncExternalStore(noopSubscribe, getPlayerId, () => null);
  const playerToken = useSyncExternalStore(noopSubscribe, getPlayerToken, () => null);
  const { gameState, error, refresh } = useControllerStream(code, playerToken);
  useScreenWakeLock(gameState != null);

  // Activate MatchSlop design tokens (--ms-* CSS variables)
  useEffect(() => {
    document.documentElement.setAttribute("data-game", "matchslop");
    return () => {
      document.documentElement.removeAttribute("data-game");
    };
  }, []);

  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [openerStep, setOpenerStep] = useState<"pick" | "write">("pick");
  const [responseText, setResponseText] = useState("");
  const [submittedPromptIds, setSubmittedPromptIds] = useState<Set<string>>(new Set());
  const [submittingPromptId, setSubmittingPromptId] = useState<string | null>(null);
  const [votingPromptIds, setVotingPromptIds] = useState<Set<string>>(new Set());
  const [votingBusy, setVotingBusy] = useState(false);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const rejoinAttempted = useRef(false);
  const phaseKeyRef = useRef("");

  useEffect(() => {
    if (!gameState) return;
    const nextKey = `${gameState.status}:${gameState.currentRound}:${gameState.votingPromptIndex}:${gameState.votingRevealing ? 1 : 0}`;
    if (phaseKeyRef.current !== nextKey) {
      phaseKeyRef.current = nextKey;
      setActionError("");
      if (gameState.status !== "WRITING") {
        setResponseText("");
        setSubmittedPromptIds(new Set());
        setSelectedPromptId(null);
        setOpenerStep("pick");
      }
      if (gameState.status !== "VOTING") {
        setVotingPromptIds(new Set());
      }
    }
  }, [gameState]);

  useEffect(() => {
    if (!gameState || rejoinAttempted.current) return;
    const localPlayer = playerId
      ? gameState.players.find((p) => p.id === playerId)
      : null;
    const needsRejoin =
      playerId == null ||
      localPlayer == null ||
      localPlayer.participationStatus === "DISCONNECTED";
    if (!needsRejoin) return;

    rejoinAttempted.current = true;
    const token = searchParams.get("rejoin") ?? localStorage.getItem("rejoinToken");
    if (!token) {
      rejoinAttempted.current = false;
      return;
    }

    setReconnecting(true);
    fetch(`/api/games/${code}/rejoin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          rejoinAttempted.current = false;
          return;
        }
        const data = await res.json();
        localStorage.setItem("playerId", data.playerId);
        localStorage.setItem("playerName", data.playerName);
        localStorage.setItem("rejoinToken", token);
        if (data.playerType) localStorage.setItem("playerType", data.playerType);
        refresh();
      })
      .catch(() => {
        rejoinAttempted.current = false;
      })
      .finally(() => setReconnecting(false));
  }, [gameState, playerId, code, searchParams, refresh]);

  const isHost = !!(gameState && playerId && gameState.hostPlayerId === playerId);
  const activePlayerCount = gameState?.players.filter((p) => p.type !== "SPECTATOR").length ?? 0;
  const matchslop = gameState?.matchslop ?? null;
  const profileGeneration = matchslop?.profileGeneration ?? null;
  const promptOptions = matchslop?.writing?.openerOptions ?? [];
  const prompts = matchslop?.profile?.prompts;
  const openerPromptById = useMemo(
    () => {
      const map = new Map((prompts ?? []).map((prompt) => [prompt.id, prompt.prompt]));
      map.set(PHOTO_PROMPT_ID, MATCHSLOP_PHOTO_PROMPT_TEXT);
      return map;
    },
    [prompts],
  );
  const currentVotePrompt = gameState?.voting?.currentPrompt ?? null;
  const hasVotedCurrent = currentVotePrompt
    ? currentVotePrompt.hasVoted || votingPromptIds.has(currentVotePrompt.id)
    : false;
  const hasSubmittedCurrent = matchslop?.writing?.submitted || (matchslop?.writing?.promptId ? submittedPromptIds.has(matchslop.writing.promptId) : false);
  const comebackRound = matchslop?.comebackRound ?? null;
  const isComebackRound = comebackRound != null && gameState?.currentRound === comebackRound;
  const isOpenerRound = gameState?.currentRound === 1;
  const isInitialProfilePending =
    gameState?.status === "WRITING" &&
    gameState.currentRound === 1 &&
    matchslop?.profile == null &&
    profileGeneration?.status !== "FAILED";
  const isInitialProfileFailed =
    gameState?.status === "WRITING" &&
    gameState.currentRound === 1 &&
    matchslop?.profile == null &&
    profileGeneration?.status === "FAILED";
  const isOpenerVoting = currentVotePrompt?.responses.some((r) => r.openerPromptId) ?? false;
  const selectedOption = promptOptions.find((o) => o.id === selectedPromptId) ?? null;
  const personaName = matchslop?.profile?.displayName ?? "the persona";

  async function postHostAction(path: "start" | "next") {
    const hostToken = localStorage.getItem("hostControlToken");
    if (!playerId && !hostToken) return;
    setHostActionBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Action failed");
      }
    } catch {
      setActionError("Something went wrong");
    } finally {
      setHostActionBusy(false);
    }
  }

  async function submitResponse(promptId: string) {
    if (!playerToken) return;
    const text = responseText.trim();
    if (!text) return;
    setSubmittingPromptId(promptId);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerToken,
          promptId,
          text,
          metadata: selectedPromptId ? { selectedPromptId } : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Failed to submit");
        return;
      }
      setSubmittedPromptIds((prev) => new Set(prev).add(promptId));
      setResponseText("");
    } catch {
      setActionError("Something went wrong");
    } finally {
      setSubmittingPromptId(null);
    }
  }

  async function castVote(promptId: string, responseId: string | null) {
    if (!playerToken) return;
    setVotingBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerToken, promptId, responseId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Failed to vote");
        return;
      }
      setVotingPromptIds((prev) => new Set(prev).add(promptId));
    } catch {
      setActionError("Something went wrong");
    } finally {
      setVotingBusy(false);
    }
  }

  if (reconnecting) {
    return (
      <>
        <MatchHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <div className="text-center">
            <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-edge border-t-punch animate-spin" />
            <p className="text-ink-dim text-sm">Reconnecting...</p>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <MatchHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <p className="text-fail font-display font-bold text-xl">{error}</p>
        </main>
      </>
    );
  }

  if (!gameState) {
    return (
      <>
        <MatchHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <div className="w-8 h-8 rounded-full border-2 border-edge border-t-punch animate-spin" />
        </main>
      </>
    );
  }

  const roundLabel =
    gameState.status === "LOBBY"
      ? "Controller"
      : isComebackRound
        ? "Comeback Round"
        : `Round ${gameState.currentRound}/${gameState.totalRounds}`;
  const canHostAdvance =
    isHost &&
    (gameState.status === "WRITING" ||
      gameState.status === "VOTING" ||
      gameState.status === "ROUND_RESULTS") &&
    !isInitialProfilePending &&
    !isInitialProfileFailed;

  return (
    <>
      <MatchHeader roomCode={gameState.roomCode} roundLabel={roundLabel} />
      <main className="min-h-svh flex flex-col items-center px-4 py-6 pt-16">
        <motion.div
          className="w-full max-w-md"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <div className="mb-4 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">
              {gameState.status === "LOBBY" && "Lobby"}
              {gameState.status === "WRITING" && (isComebackRound ? "Comeback Round" : "Write")}
              {gameState.status === "VOTING" && (isComebackRound ? "Comeback Vote" : "Vote")}
              {gameState.status === "ROUND_RESULTS" && (isComebackRound ? "Comeback Results" : "Round Results")}
              {gameState.status === "FINAL_RESULTS" && (matchslop?.outcome === "COMEBACK" ? "Partial Win" : "Game Over")}
            </h1>
          </div>

          {gameState.phaseDeadline && !gameState.timersDisabled && (
            <div className="mb-4">
              <Timer deadline={gameState.phaseDeadline} />
            </div>
          )}

          <div className="space-y-4">
            {gameState.status === "LOBBY" && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-teal-soft/50 border border-teal/20 p-6 text-center">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-teal font-bold mb-2">
                    Room Code
                  </p>
                  <p className="font-mono text-4xl font-black tracking-[0.25em] text-teal">
                    {gameState.roomCode}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-ink-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-punch animate-pulse" />
                  <span className="font-medium">
                    {activePlayerCount} player{activePlayerCount !== 1 ? "s" : ""} connected
                  </span>
                </div>
                {isHost ? (
                  <motion.button
                    type="button"
                    onClick={(e) => {
                      triggerElement(e.currentTarget);
                      void postHostAction("start");
                    }}
                    disabled={hostActionBusy || activePlayerCount < 2}
                    className="w-full bg-punch hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-2xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
                    {...buttonTapPrimary}
                  >
                    {hostActionBusy
                      ? "Starting..."
                      : activePlayerCount < 2
                        ? "Need more players"
                        : "Start Game"}
                  </motion.button>
                ) : (
                  <div className="text-center py-3">
                    <PulsingDot>Waiting for the host to start the game...</PulsingDot>
                  </div>
                )}
              </div>
            )}

            {gameState.status === "WRITING" && (
              <div className="space-y-4">
                {isInitialProfilePending ? (
                  <CompletionCard
                    title="Building profile"
                    subtitle="The persona is still generating. Writing opens as soon as the prompts are ready."
                  />
                ) : isInitialProfileFailed ? (
                  <CompletionCard
                    title="Profile failed"
                    subtitle="The persona could not be generated. Ask the host to end the game and start again."
                  />
                ) : hasSubmittedCurrent ? (
                  <CompletionCard
                    title="Submitted!"
                    subtitle={isComebackRound
                      ? "Waiting to see if the room can save this."
                      : "Waiting for everyone else to write."}
                  />
                ) : isOpenerRound ? (
                  /* ── Opener: two-step pick → write ── */
                  <AnimatePresence mode="wait">
                    {openerStep === "pick" ? (
                      <OpenerPromptPicker
                        key="picker"
                        options={promptOptions}
                        personaName={personaName}
                        onPick={(option) => {
                          setSelectedPromptId(option.id);
                          setOpenerStep("write");
                        }}
                      />
                    ) : selectedOption ? (
                      <OpenerWriteStep
                        key="write"
                        selectedOption={selectedOption}
                        responseText={responseText}
                        onChangeText={setResponseText}
                        onSubmit={() => {
                          if (matchslop?.writing?.promptId) {
                            void submitResponse(matchslop.writing.promptId);
                          }
                        }}
                        onBack={() => setOpenerStep("pick")}
                        submitting={submittingPromptId === matchslop?.writing?.promptId}
                        disabled={!responseText.trim() || !matchslop?.writing?.promptId || submittingPromptId === matchslop?.writing?.promptId}
                        triggerElement={triggerElement}
                      />
                    ) : null}
                  </AnimatePresence>
                ) : (
                  /* ── Follow-up rounds: single-step write ── */
                  <div className="space-y-4">
                    <div
                      className="rounded-2xl p-4"
                      style={{
                        background: "var(--ms-raised)",
                        border: "1px solid var(--ms-edge)",
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-wider mb-2 font-bold"
                        style={{ color: "var(--ms-ink-dim)" }}
                      >
                        {isComebackRound ? "One last shot" : "Reply to"}
                      </p>
                      <p
                        className="font-display font-semibold text-sm leading-snug"
                        style={{ color: "var(--ms-rose)" }}
                      >
                        {matchslop?.writing?.text ?? "Write the funniest reply."}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && matchslop?.writing?.promptId) {
                            void submitResponse(matchslop.writing.promptId);
                          }
                        }}
                        placeholder={isComebackRound
                          ? "Type the line that saves the match..."
                          : "Type your funniest reply..."}
                        maxLength={300}
                        className="w-full py-3.5 px-4 rounded-2xl text-base focus:outline-none transition-colors"
                        style={{
                          background: "var(--ms-raised)",
                          border: "2px solid var(--ms-edge)",
                          color: "var(--ms-ink)",
                        }}
                      />
                      <motion.button
                        type="button"
                        onClick={(e) => {
                          triggerElement(e.currentTarget);
                          if (matchslop?.writing?.promptId) {
                            void submitResponse(matchslop.writing.promptId);
                          }
                        }}
                        disabled={!responseText.trim() || !matchslop?.writing?.promptId || submittingPromptId === matchslop?.writing?.promptId}
                        className="w-full py-3.5 rounded-2xl font-display font-bold text-white text-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: "var(--ms-gradient-romance)",
                          boxShadow: !responseText.trim() ? "none" : "0 4px 20px var(--ms-rose-glow)",
                        }}
                        {...buttonTapPrimary}
                      >
                        {submittingPromptId === matchslop?.writing?.promptId
                          ? "Sending..."
                          : isComebackRound
                            ? "Send comeback"
                            : "Send"}
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {gameState.status === "VOTING" && (
              <div className="space-y-4">
                {gameState.votingRevealing ? (
                  <CompletionCard title="Revealing" subtitle="The main screen is calculating results." />
                ) : !currentVotePrompt ? (
                  <CompletionCard title="Waiting" subtitle="The next ballot is not ready yet." />
                ) : hasVotedCurrent ? (
                  <div className="space-y-3">
                    <div
                      className="rounded-2xl p-4"
                      style={{
                        background: "var(--ms-raised)",
                        border: "1px solid var(--ms-edge)",
                      }}
                    >
                      <p
                        className="font-display font-semibold text-lg mb-2"
                        style={{ color: "var(--ms-violet)" }}
                      >
                        Vote cast!
                      </p>
                      <PulsingDot>
                        {isComebackRound
                          ? "Waiting to see if the room saved it..."
                          : "Waiting on other players..."}
                      </PulsingDot>
                    </div>
                  </div>
                ) : isOpenerVoting ? (
                  <OpenerVotingList
                    responses={currentVotePrompt.responses}
                    openerPromptById={openerPromptById}
                    forfeitCount={currentVotePrompt.forfeitCount}
                    votingBusy={votingBusy}
                    onVote={(responseId) => void castVote(currentVotePrompt.id, responseId)}
                    onPass={() => void castVote(currentVotePrompt.id, null)}
                    triggerElement={triggerElement}
                  />
                ) : (
                  <div className="space-y-3">
                    <div
                      className="rounded-2xl p-4"
                      style={{
                        background: "var(--ms-raised)",
                        border: "1px solid var(--ms-edge)",
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-wider mb-2 font-bold"
                        style={{ color: "var(--ms-violet)" }}
                      >
                        {isComebackRound ? "Vote for the line that saves it" : "Vote for the funniest reply"}
                      </p>
                      <p
                        className="font-display font-semibold text-sm leading-snug mb-1"
                        style={{ color: "var(--ms-rose)" }}
                      >
                        {currentVotePrompt.text}
                      </p>
                      <p className="text-xs" style={{ color: "var(--ms-ink-dim)" }}>
                        {isComebackRound
                          ? "Pick the follow-up that gives the room the best chance to claw this back."
                          : "Votes become points, even for strong runner-ups. Human votes count double."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {currentVotePrompt.responses.map((resp) => (
                        <motion.button
                          key={resp.id}
                          type="button"
                          onClick={(e) => {
                            triggerElement(e.currentTarget);
                            void castVote(currentVotePrompt.id, resp.id);
                          }}
                          disabled={votingBusy}
                          className="w-full text-left py-3 px-4 rounded-2xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: "var(--ms-raised)",
                            border: "2px solid var(--ms-edge)",
                          }}
                          whileHover={{
                            borderColor: "var(--ms-violet)",
                          }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <span
                            className="text-[15px] leading-relaxed"
                            style={{ color: "var(--ms-ink)" }}
                          >
                            {resp.text}
                          </span>
                        </motion.button>
                      ))}
                      <motion.button
                        type="button"
                        onClick={(e) => {
                          triggerElement(e.currentTarget);
                          void castVote(currentVotePrompt.id, null);
                        }}
                        disabled={votingBusy}
                        className="w-full py-2.5 rounded-2xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          border: "1px solid var(--ms-edge)",
                          color: "var(--ms-ink-dim)",
                        }}
                        {...buttonTap}
                      >
                        Pass
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(gameState.status === "ROUND_RESULTS" || gameState.status === "FINAL_RESULTS") && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-edge bg-surface/70 p-5 text-center">
                  <p className="font-display font-bold text-lg text-ink mb-2">
                    {gameState.status === "FINAL_RESULTS"
                      ? matchslop?.outcome === "COMEBACK"
                        ? "Partial Win"
                        : "Game Over"
                      : isComebackRound
                        ? "Comeback Round Complete"
                        : `Round ${gameState.currentRound} Complete`}
                  </p>
                  <PulsingDot>
                    {gameState.status === "FINAL_RESULTS"
                      ? matchslop?.outcome === "COMEBACK"
                        ? "Check the main screen for the comeback ending."
                        : "Check the main screen for the final transcript."
                      : isComebackRound
                        ? "The main screen is revealing whether the room saved it."
                        : "Round results are on the main screen."}
                  </PulsingDot>
                </div>

                {isHost && gameState.status === "ROUND_RESULTS" ? (
                  <motion.button
                    type="button"
                    onClick={(e) => {
                      triggerElement(e.currentTarget);
                      void postHostAction("next");
                    }}
                    disabled={hostActionBusy}
                    className="w-full bg-punch/90 hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-2xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                    {...buttonTapPrimary}
                  >
                    {hostActionBusy ? "Advancing..." : isComebackRound ? "Show Ending" : "Next Round"}
                  </motion.button>
                ) : (
                  <div className="text-center py-2">
                    <PulsingDot>
                      {gameState.status === "FINAL_RESULTS"
                        ? "Waiting for the next game..."
                        : isComebackRound
                          ? "Waiting for host to reveal the ending..."
                          : "Waiting for host to continue..."}
                    </PulsingDot>
                  </div>
                )}

                {gameState.status === "FINAL_RESULTS" && (
                  <Link
                    href={isHost ? "/host" : "/join"}
                    className="block text-center py-3 rounded-2xl border border-edge text-ink-dim hover:text-ink hover:bg-surface/60 transition-colors"
                  >
                    {isHost ? "Host Another Game" : "Join Another Game"}
                  </Link>
                )}
              </div>
            )}

            {canHostAdvance && (gameState.status === "WRITING" || gameState.status === "VOTING") && (
              <div className="mt-5 pt-4 border-t border-edge/50">
                <motion.button
                  type="button"
                  onClick={(e) => {
                    triggerElement(e.currentTarget);
                    void postHostAction("next");
                  }}
                  disabled={hostActionBusy}
                  className="w-full py-3 rounded-2xl border-2 border-dashed border-punch/30 text-punch/80 hover:text-punch hover:border-punch/50 hover:bg-punch/5 font-display font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  {...buttonTap}
                >
                  {hostActionBusy ? "Working..." : "Force Advance"}
                </motion.button>
              </div>
            )}

            <AnimatePresence>
              {actionError && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <ErrorBanner error={actionError} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>
    </>
  );
}
