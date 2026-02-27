"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useTheme } from "@/components/theme-provider";
import { PlayerAvatar } from "@/components/player-avatar";
import { springGentle, springBouncy } from "@/lib/animations";

/* ─── Animation configs (match chat-game-shell.tsx) ─── */

const msgSpring = { type: "spring" as const, stiffness: 500, damping: 32 };
const gentleSpring = { type: "spring" as const, stiffness: 300, damping: 25 };

/* ─── Demo wrapper card (matches shared playground styling) ─── */

function DemoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{title}</h2>
      {/* ChatSlop CSS vars scope */}
      <div data-game="chatslop" className="rounded-xl p-4" style={{ background: "var(--cs-bg)" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Static demo versions of ChatSlop internal components ─── */

function TypingDotsDemo() {
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
      <span className="text-[11px] text-[var(--cs-ink-dim)] font-medium">Someone is typing...</span>
    </div>
  );
}

function SystemMsgDemo() {
  return (
    <motion.div
      className="flex items-center justify-center gap-2 py-2"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={msgSpring}
    >
      <span className="text-[11px] font-medium text-[var(--cs-ink-dim)] tracking-wide">
        Round 1 has started — answer the prompt!
      </span>
    </motion.div>
  );
}

function BubbleDemo({
  content,
  playerName,
  modelId,
  isMe,
  status = "confirmed",
}: {
  content: string;
  playerName: string;
  modelId: string | null;
  isMe: boolean;
  status?: "confirmed" | "pending" | "failed";
}) {
  const isPending = status === "pending";
  const isFailed = status === "failed";
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
          {content}
        </div>
        {isFailed && (
          <div className={`flex gap-2 mt-0.5 text-[10px] font-medium ${isMe ? "justify-end" : ""}`}>
            <button className="text-[var(--cs-accent)] hover:underline cursor-pointer">Retry</button>
            <button className="text-[var(--cs-ink-dim)] hover:text-[var(--cs-ink)] cursor-pointer">Dismiss</button>
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

function GameCardDemo({ accent = false, children }: { accent?: boolean; children: React.ReactNode }) {
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

function VoteOptionDemo({ text, isMine }: { text: string; isMine: boolean }) {
  return (
    <motion.button
      type="button"
      disabled={isMine}
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

function ResultRowDemo({
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

function ProgressPillDemo({ current, total, label }: { current: number; total: number; label: string }) {
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

function ChatBarDemo({ mode, placeholder }: { mode: "chat" | "response" | "disabled"; placeholder: string }) {
  const [text, setText] = useState("");
  const isResponse = mode === "response";
  const maxLen = isResponse ? 100 : 200;

  return (
    <div className="flex gap-2 items-end">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLen}
        disabled={mode === "disabled"}
        className="flex-1 py-2.5 px-4 rounded-2xl text-sm transition-all focus:outline-none disabled:opacity-30"
        style={{
          background: "var(--cs-raised)",
          color: "var(--cs-ink)",
          border: "1px solid var(--cs-edge)",
        }}
      />
      <motion.button
        type="button"
        disabled={mode === "disabled" || !text.trim()}
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

/* ─── Main playground ─── */

export function DevChatslopPlayground() {
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <main className="min-h-svh px-6 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-mono tracking-widest text-ink-dim">DEV COMPONENTS / CHATSLOP</p>
            <h1 className="font-display text-3xl font-bold text-ink">ChatSlop Components</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-dim">
              Chat-native UI components rendered with static fixture data. Each card wraps content
              in the ChatSlop theme scope.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="cursor-pointer rounded-md border border-edge px-3 py-2 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <Link
              href="/dev/components"
              className="rounded-md border border-edge px-3 py-2 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Back to Shared
            </Link>
          </div>
        </header>

        {/* Chat Bubbles */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Chat Bubbles">
            <div className="space-y-4">
              <BubbleDemo content="Has anyone tried the new ramen place on 5th?" playerName="Amy" modelId={null} isMe={false} />
              <BubbleDemo content="Yeah it slaps, the tonkotsu is unreal" playerName="You" modelId={null} isMe />
              <BubbleDemo content="I've analyzed 847 ramen restaurants and this one ranks #3 in the tri-state area." playerName="GPT-5.2" modelId="openai/gpt-5.2-chat" isMe={false} />
              <BubbleDemo content="Sending this now..." playerName="You" modelId={null} isMe status="pending" />
              <BubbleDemo content="This message failed to send" playerName="You" modelId={null} isMe status="failed" />
              <TypingDotsDemo />
            </div>
          </DemoCard>

          <DemoCard title="System Messages">
            <div className="space-y-3">
              <SystemMsgDemo />
              <TypingDotsDemo />
            </div>
          </DemoCard>
        </section>

        {/* Game Cards */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Game Cards">
            <div className="space-y-4">
              <GameCardDemo>
                <p className="text-center text-sm font-medium" style={{ color: "var(--cs-ink)" }}>
                  Round 1 — Answer the prompt below
                </p>
                <p className="text-center text-[var(--cs-accent)] font-semibold mt-2">
                  A feature your smart fridge definitely does NOT need:
                </p>
              </GameCardDemo>

              <GameCardDemo accent>
                <p className="text-center text-sm font-medium" style={{ color: "var(--cs-ink)" }}>
                  Time to vote! Pick your favorite answer.
                </p>
                <ProgressPillDemo current={2} total={4} label="voted" />
              </GameCardDemo>
            </div>
          </DemoCard>

          <DemoCard title="Vote Options">
            <div className="space-y-2">
              <VoteOptionDemo text="It texts your ex when it detects loneliness." isMine={false} />
              <VoteOptionDemo text="A passive-aggressive sticky note generator." isMine />
              <VoteOptionDemo text="Calorie-shaming every time you open the door." isMine={false} />
              <VoteOptionDemo text="Milk futures trading without your consent." isMine={false} />
            </div>
          </DemoCard>
        </section>

        {/* Results & Progress */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Result Rows">
            <div className="space-y-2">
              <ResultRowDemo text="It texts your ex when it detects loneliness." playerName="Amy" modelId={null} voteCount={3} totalVotes={4} points={160} isWinner delay={0} />
              <ResultRowDemo text="A passive-aggressive sticky note generator." playerName="Beau" modelId={null} voteCount={1} totalVotes={4} points={80} isWinner={false} delay={0.1} />
              <ResultRowDemo text="Calorie-shaming every time you open the door." playerName="GPT-5.2" modelId="openai/gpt-5.2-chat" voteCount={0} totalVotes={4} points={0} isWinner={false} delay={0.2} />
            </div>
          </DemoCard>

          <DemoCard title="Progress Pills">
            <div className="space-y-4">
              <ProgressPillDemo current={1} total={4} label="submitted" />
              <ProgressPillDemo current={3} total={4} label="voted" />
              <ProgressPillDemo current={4} total={4} label="voted" />
            </div>
          </DemoCard>
        </section>

        {/* Chat Input */}
        <section className="grid gap-5 lg:grid-cols-2">
          <DemoCard title="Chat Bar (Chat Mode)">
            <ChatBarDemo mode="chat" placeholder="Say something..." />
          </DemoCard>

          <DemoCard title="Chat Bar (Response Mode)">
            <ChatBarDemo mode="response" placeholder="Submit your answer..." />
          </DemoCard>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Chat Bar (Disabled)">
            <ChatBarDemo mode="disabled" placeholder="Chat is disabled" />
          </DemoCard>

          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Fixture Quick Links</h2>
            <div className="space-y-2 text-sm">
              <Link href="/dev/ui/chat-lobby" className="block text-ink-dim hover:text-ink">
                `/dev/ui/chat-lobby`
              </Link>
              <Link href="/dev/ui/chat-writing" className="block text-ink-dim hover:text-ink">
                `/dev/ui/chat-writing`
              </Link>
              <Link href="/dev/ui/chat-voting" className="block text-ink-dim hover:text-ink">
                `/dev/ui/chat-voting`
              </Link>
              <Link href="/dev/ui/chat-results-final" className="block text-ink-dim hover:text-ink">
                `/dev/ui/chat-results-final`
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
