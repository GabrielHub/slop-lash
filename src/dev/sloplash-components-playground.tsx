"use client";

import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import { BestPromptsCarousel, extractBestPrompts } from "@/components/best-prompts-carousel";
import { ErrorBanner } from "@/components/error-banner";
import { PlayerList } from "@/components/player-list";
import { PromptOutcomeStamp } from "@/components/prompt-outcome-stamp";
import { ReactionBar } from "@/components/reaction-bar";
import { ScoreBarChart } from "@/components/score-bar-chart";
import { WinnerTagline } from "@/components/winner-tagline";
import { getMockScenario } from "@/dev/game-fixtures/scenarios";

export function DevSloplashPlayground() {
  const { theme, toggle: toggleTheme } = useTheme();
  const finalScenario = getMockScenario("results-final");
  const votingScenario = getMockScenario("voting-player");
  const writingScenario = getMockScenario("writing-player");

  if (!finalScenario || !votingScenario || !writingScenario) {
    return (
      <main className="min-h-svh px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <ErrorBanner error="Missing mock scenarios required for Slop-Lash component playground." className="" />
        </div>
      </main>
    );
  }

  const finalGame = finalScenario.game;
  const votingGame = votingScenario.game;
  const bestPrompts = extractBestPrompts(finalGame);
  const winner = [...finalGame.players]
    .filter((p) => p.type === "HUMAN")
    .sort((a, b) => b.score - a.score)[0];
  const samplePrompt = votingGame.rounds[0]?.prompts[1];
  const sampleResponse = samplePrompt?.responses[1];
  const playerNames = new Map(votingGame.players.map((p) => [p.id, p.name]));

  return (
    <main className="min-h-svh px-6 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-mono tracking-widest text-ink-dim">DEV COMPONENTS / SLOP-LASH</p>
            <h1 className="font-display text-3xl font-bold text-ink">Slop-Lash Components</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-dim">
              Game-specific components rendered with fixture data from the results-final and voting-player scenarios.
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

        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Players</h2>
            <PlayerList
              players={finalGame.players}
              showScores
              hostPlayerId={finalGame.hostPlayerId ?? undefined}
              onKick={() => {}}
            />
          </div>

          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Score Bar Chart</h2>
            <ScoreBarChart game={finalGame} />
          </div>
        </section>

        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Best Prompts</h2>
            <BestPromptsCarousel prompts={bestPrompts} />
          </div>

          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">AI Usage Breakdown</h2>
            <AiUsageBreakdown
              modelUsages={finalGame.modelUsages}
              totalInput={finalGame.aiInputTokens}
              totalOutput={finalGame.aiOutputTokens}
              totalCost={finalGame.aiCostUsd}
            />
          </div>
        </section>

        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Winner Tagline</h2>
            {winner ? (
              <WinnerTagline
                winner={winner}
                tagline="I did not come here to be tasteful. I came here to win."
                isStreaming={false}
              />
            ) : (
              <p className="text-sm text-ink-dim">No human winner fixture found.</p>
            )}
          </div>

          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Prompt Outcome Stamps</h2>
            <div className="space-y-5">
              <PromptOutcomeStamp isUnanimous={false} aiBeatsHuman={false} allPassed delay={0} />
              <PromptOutcomeStamp isUnanimous aiBeatsHuman delay={0} allPassed={false} />
              <PromptOutcomeStamp isUnanimous aiBeatsHuman={false} delay={0} allPassed={false} />
              <PromptOutcomeStamp isUnanimous={false} aiBeatsHuman delay={0} allPassed={false} />
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Reaction Bar</h2>
            {samplePrompt && sampleResponse ? (
              <div className="rounded-xl border border-edge bg-raised/60 p-4">
                <p className="mb-2 font-display font-semibold text-gold">{samplePrompt.text}</p>
                <p className="text-sm text-ink">{sampleResponse.text}</p>
                <ReactionBar
                  responseId={sampleResponse.id}
                  reactions={sampleResponse.reactions}
                  playerId={writingScenario.playerId}
                  code="mock-components"
                  playerNames={playerNames}
                  disabled
                  size="lg"
                />
              </div>
            ) : (
              <p className="text-sm text-ink-dim">No sample response available.</p>
            )}
          </div>

          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Fixture Quick Links</h2>
            <div className="space-y-2 text-sm">
              <Link href="/dev/ui/writing-player" className="block text-ink-dim hover:text-ink">
                `/dev/ui/writing-player`
              </Link>
              <Link href="/dev/ui/voting-reveal" className="block text-ink-dim hover:text-ink">
                `/dev/ui/voting-reveal`
              </Link>
              <Link href="/dev/ui/results-final" className="block text-ink-dim hover:text-ink">
                `/dev/ui/results-final`
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
