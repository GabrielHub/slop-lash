"use client";

import { motion } from "motion/react";
import { PlayerAvatar } from "@/components/player-avatar";
import { ScoreBarChart } from "@/components/score-bar-chart";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { springBouncy, springGentle } from "@/lib/animations";
import { filterCastVotes } from "@/lib/types";
import type { useGameStream } from "@/hooks/use-game-stream";
import { MAX_PLAYERS, MIN_PLAYERS } from "../game-constants";
import {
  Bubble,
  GameCard,
  gentleSpring,
  msgSpring,
  ProgressPill,
  ResultRow,
  SystemMsg,
  TypingDots,
  VoteOption,
} from "./chat-components";
import type { OptimisticChatMessage } from "./use-optimistic-chat";

type ChatGameState = NonNullable<ReturnType<typeof useGameStream>["gameState"]>;
type ChatPrompt = ChatGameState["rounds"][number]["prompts"][number];

type ChatFeedOptions = {
  activePlayers: ChatGameState["players"];
  chatMessages: OptimisticChatMessage[];
  currentPrompt: ChatPrompt | null;
  dismissFailed: (clientId: string) => void;
  gameState: ChatGameState;
  handleVote: (responseId: string) => Promise<void>;
  hasSubmitted: boolean;
  hasVoted: boolean;
  playerId: string | null;
  retryMessage: (clientId: string) => Promise<void>;
  triggerElement: (element: HTMLElement) => void;
  viewMode: "game" | "stage";
  votingBusy: boolean;
};

export function buildChatFeed({
  activePlayers,
  chatMessages,
  currentPrompt,
  dismissFailed,
  gameState,
  handleVote,
  hasSubmitted,
  hasVoted,
  playerId,
  retryMessage,
  triggerElement,
  viewMode,
  votingBusy,
}: ChatFeedOptions) {
  // ─── Feed items: Build a unified message list ───

  const game = gameState;
  const feedItems: React.ReactNode[] = [];

  // Lobby
  if (game.status === "LOBBY") {
    feedItems.push(
      <SystemMsg
        key="sys-welcome"
        icon={
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]"
            style={{ background: "var(--cs-accent-soft)", color: "var(--cs-accent)" }}
          >
            &#9835;
          </span>
        }
      >
        The lounge is open
      </SystemMsg>,
    );

    // Room code card
    feedItems.push(
      <GameCard key="lobby-code" accent>
        <div className="text-center">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2"
            style={{ color: "var(--cs-ink-dim)" }}
          >
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
          <span
            className="text-[10px] lg:text-[11px] font-semibold mb-0.5 block"
            style={{ color: "var(--cs-accent)" }}
          >
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
            <p
              className="font-bold text-base lg:text-lg leading-snug"
              style={{ color: "var(--cs-accent)" }}
            >
              {currentPrompt.text}
            </p>
            <p
              className="text-[10px] lg:text-[11px] mt-1.5 font-medium"
              style={{ color: "var(--cs-ink-dim)" }}
            >
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
              <div
                className="px-3.5 py-2 rounded-2xl rounded-tr-sm"
                style={{ background: "var(--cs-bubble-me)", color: "var(--cs-ink)" }}
              >
                <p className="text-sm leading-relaxed">{myResponse.text}</p>
              </div>
              <span
                className="text-[10px] mt-0.5 flex items-center gap-1"
                style={{ color: "var(--cs-accent)" }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Submitted
              </span>
            </div>
          </motion.div>,
        );
      }
    }

    // Progress
    feedItems.push(
      <ProgressPill
        key="writing-progress"
        current={submittedCount}
        total={totalCount}
        label="submitted"
      />,
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

    feedItems.push(<SystemMsg key="sys-vote">Vote for the best answer!</SystemMsg>);

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
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--cs-ink-dim)" }}
          >
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
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "var(--cs-accent-soft)" }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--cs-accent)" }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--cs-accent)" }}>
            Vote cast!
          </span>
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

    feedItems.push(<SystemMsg key="sys-results">Round {game.currentRound} Results</SystemMsg>);

    // Prompt reminder
    feedItems.push(
      <motion.div
        key="result-prompt"
        className="text-center py-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
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
        <p
          className="text-[10px] font-bold uppercase tracking-widest mb-2"
          style={{ color: "var(--cs-ink-dim)" }}
        >
          Standings
        </p>
        <div className="space-y-1.5">
          {[...game.players]
            .sort((a, b) => b.score - a.score)
            .map((p, i) => (
              <motion.div
                key={p.id}
                className="flex items-center gap-2 py-1"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...gentleSpring, delay: 0.3 + i * 0.06 }}
              >
                <span
                  className="w-4 text-center font-mono text-[11px] font-bold"
                  style={{ color: i === 0 ? "var(--cs-accent)" : "var(--cs-ink-dim)" }}
                >
                  {i + 1}
                </span>
                <PlayerAvatar
                  name={p.name}
                  modelId={p.modelId}
                  size={18}
                  className="rounded-full"
                />
                <span
                  className="flex-1 text-sm font-medium truncate"
                  style={{ color: i === 0 ? "var(--cs-accent)" : "var(--cs-ink)" }}
                >
                  {p.name}
                </span>
                <span
                  className="font-mono text-sm font-bold tabular-nums"
                  style={{ color: i === 0 ? "var(--cs-accent)" : "var(--cs-ink-dim)" }}
                >
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

    feedItems.push(<SystemMsg key="sys-gameover">Game Over</SystemMsg>);

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
            AI Cost: ${game.aiCostUsd.toFixed(4)} &middot;{" "}
            {(game.aiInputTokens + game.aiOutputTokens).toLocaleString()} tokens
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
        allMessages={chatMessages}
        players={game.players}
        onRetry={() => void retryMessage(msg.clientId)}
        onDismiss={() => dismissFailed(msg.clientId)}
      />
    );
  });

  return { chatBubbles, feedItems };
}
