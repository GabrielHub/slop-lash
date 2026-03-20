"use client";

import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import {
  TypingDots,
  SystemMsg,
  Bubble,
  GameCard,
  VoteOption,
  ResultRow,
  ProgressPill,
  ChatBar,
} from "@/games/ai-chat-showdown/ui/chat-game-shell";
import type { OptimisticChatMessage } from "@/games/ai-chat-showdown/ui/use-optimistic-chat";

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

/* ─── Fixture helpers ─── */

let nextId = 0;
function fakeMsg(
  overrides: Partial<OptimisticChatMessage> & { content: string; playerId?: string },
): OptimisticChatMessage {
  const id = String(++nextId);
  return {
    id,
    clientId: id,
    playerId: overrides.playerId ?? "fixture",
    replyToId: null,
    createdAt: new Date().toISOString(),
    status: "confirmed",
    ...overrides,
  };
}

const noop = () => {};

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
              <Bubble message={fakeMsg({ content: "Has anyone tried the new ramen place on 5th?", playerId: "amy" })} playerName="Amy" modelId={null} isMe={false} allMessages={[]} players={[]} onRetry={noop} onDismiss={noop} />
              <Bubble message={fakeMsg({ content: "Yeah it slaps, the tonkotsu is unreal", playerId: "me" })} playerName="You" modelId={null} isMe allMessages={[]} players={[]} onRetry={noop} onDismiss={noop} />
              <Bubble message={fakeMsg({ content: "I've analyzed 847 ramen restaurants and this one ranks #3 in the tri-state area.", playerId: "gpt" })} playerName="GPT-5.4 Mini" modelId="openai/gpt-5.4-mini" isMe={false} allMessages={[]} players={[]} onRetry={noop} onDismiss={noop} />
              <Bubble message={fakeMsg({ content: "Sending this now...", playerId: "me", status: "pending" })} playerName="You" modelId={null} isMe allMessages={[]} players={[]} onRetry={noop} onDismiss={noop} />
              <Bubble message={fakeMsg({ content: "This message failed to send", playerId: "me", status: "failed" })} playerName="You" modelId={null} isMe allMessages={[]} players={[]} onRetry={noop} onDismiss={noop} />
              <TypingDots label="Someone is typing..." />
            </div>
          </DemoCard>

          <DemoCard title="System Messages">
            <div className="space-y-3">
              <SystemMsg>Round 1 has started — answer the prompt!</SystemMsg>
              <TypingDots />
            </div>
          </DemoCard>
        </section>

        {/* Game Cards */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Game Cards">
            <div className="space-y-4">
              <GameCard>
                <p className="text-center text-sm font-medium" style={{ color: "var(--cs-ink)" }}>
                  Round 1 — Answer the prompt below
                </p>
                <p className="text-center text-[var(--cs-accent)] font-semibold mt-2">
                  A feature your smart fridge definitely does NOT need:
                </p>
              </GameCard>

              <GameCard accent>
                <p className="text-center text-sm font-medium" style={{ color: "var(--cs-ink)" }}>
                  Time to vote! Pick your favorite answer.
                </p>
                <ProgressPill current={2} total={4} label="voted" />
              </GameCard>
            </div>
          </DemoCard>

          <DemoCard title="Vote Options">
            <div className="space-y-2">
              <VoteOption text="It texts your ex when it detects loneliness." isMine={false} disabled={false} onVote={noop} />
              <VoteOption text="A passive-aggressive sticky note generator." isMine disabled={false} onVote={noop} />
              <VoteOption text="Calorie-shaming every time you open the door." isMine={false} disabled={false} onVote={noop} />
              <VoteOption text="Milk futures trading without your consent." isMine={false} disabled={false} onVote={noop} />
            </div>
          </DemoCard>
        </section>

        {/* Results & Progress */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Result Rows">
            <div className="space-y-2">
              <ResultRow text="It texts your ex when it detects loneliness." playerName="Amy" modelId={null} voteCount={3} totalVotes={4} points={160} isWinner delay={0} />
              <ResultRow text="A passive-aggressive sticky note generator." playerName="Beau" modelId={null} voteCount={1} totalVotes={4} points={80} isWinner={false} delay={0.1} />
              <ResultRow text="Calorie-shaming every time you open the door." playerName="GPT-5.4 Mini" modelId="openai/gpt-5.4-mini" voteCount={0} totalVotes={4} points={0} isWinner={false} delay={0.2} />
            </div>
          </DemoCard>

          <DemoCard title="Progress Pills">
            <div className="space-y-4">
              <ProgressPill current={1} total={4} label="submitted" />
              <ProgressPill current={3} total={4} label="voted" />
              <ProgressPill current={4} total={4} label="voted" />
            </div>
          </DemoCard>
        </section>

        {/* Chat Input */}
        <section className="grid gap-5 lg:grid-cols-2">
          <DemoCard title="Chat Bar (Chat Mode)">
            <ChatBar mode="chat" onSend={noop} disabled={false} placeholder="Say something..." />
          </DemoCard>

          <DemoCard title="Chat Bar (Response Mode)">
            <ChatBar mode="response" onSend={noop} disabled={false} placeholder="Submit your answer..." />
          </DemoCard>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Chat Bar (Disabled)">
            <ChatBar mode="disabled" onSend={noop} disabled placeholder="Chat is disabled" />
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
