"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import { BestPromptsCarousel, extractBestPrompts } from "@/components/best-prompts-carousel";
import { CompletionCard } from "@/components/completion-card";
import { ErrorBanner } from "@/components/error-banner";
import { PlayerList } from "@/components/player-list";
import { PromptOutcomeStamp } from "@/components/prompt-outcome-stamp";
import { PulsingDot } from "@/components/pulsing-dot";
import { ReactionBar } from "@/components/reaction-bar";
import { ScoreBarChart } from "@/components/score-bar-chart";
import { Timer } from "@/components/timer";
import { WinnerTagline } from "@/components/winner-tagline";
import { getMockScenario } from "@/dev/game-fixtures/scenarios";
import {
  SOUND_NAMES,
  type SoundName,
  getDefaultSoundGainMultiplier,
  getAudioStateVersion,
  getFadeInSeconds,
  getFadeOutSeconds,
  getSoundGainMultiplier,
  getVolume,
  isMuted,
  playSound,
  preloadSounds,
  resetSoundTuning,
  setFadeInSeconds,
  setFadeOutSeconds,
  setSoundGainMultiplier,
  setVolume,
  subscribeAudio,
  toggleMute,
} from "@/lib/sounds";

const TIMER_DEMO_LONG_DEADLINE = new Date(Date.now() + 35_000).toISOString();
const TIMER_DEMO_SHORT_DEADLINE = new Date(Date.now() + 8_000).toISOString();
function formatSecondsLabel(value: number): string {
  return `${Math.round(value * 1000)}ms`;
}

function SfxMixerPanel(): React.ReactNode {
  const muted = useSyncExternalStore(subscribeAudio, isMuted, () => false);
  const volume = useSyncExternalStore(subscribeAudio, getVolume, () => 0.5);
  const fadeIn = useSyncExternalStore(subscribeAudio, getFadeInSeconds, () => 0.02);
  const fadeOut = useSyncExternalStore(subscribeAudio, getFadeOutSeconds, () => 0.02);
  useSyncExternalStore(subscribeAudio, getAudioStateVersion, () => 0);
  const [selectedSound, setSelectedSound] = useState<SoundName>(SOUND_NAMES[0]);

  return (
    <section className="mb-10 rounded-2xl border-2 border-gold/30 bg-gradient-to-br from-gold/5 via-surface/85 to-teal/5 p-5" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono tracking-[0.22em] text-ink-dim">AUDIO LAB</p>
          <h2 className="font-display text-xl font-bold text-ink">SFX Mixer</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-dim">
            Tune AI-generated SFX loudness and fade envelopes in real time. Settings persist in local storage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => preloadSounds()}
              className="cursor-pointer rounded-lg border border-edge px-3 py-2 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Preload
            </button>
            <button
              type="button"
              onClick={() => playSound(selectedSound)}
              className="cursor-pointer rounded-lg border border-teal/40 bg-teal/10 px-3 py-2 text-sm font-medium text-teal hover:bg-teal/15"
            >
              Play Selected
            </button>
            <button
              type="button"
              onClick={() => resetSoundTuning()}
              className="cursor-pointer rounded-lg border border-punch/30 bg-punch/5 px-3 py-2 text-sm text-punch hover:bg-punch/10"
            >
              Reset Tuning
            </button>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="rounded-xl border border-edge bg-surface/60 p-4">
          <h3 className="mb-3 text-sm font-medium text-ink">Global Audio</h3>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-mono uppercase tracking-[0.18em] text-ui-soft">
                Master Volume ({Math.round((muted ? 0 : volume) * 100)}%)
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="cursor-pointer rounded-md border border-edge px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <select
                value={selectedSound}
                onChange={(e) => setSelectedSound(e.target.value as SoundName)}
                className="min-w-52 cursor-pointer rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm text-ink"
              >
                {SOUND_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-surface/60 p-4">
          <h3 className="mb-3 text-sm font-medium text-ink">Envelope Tuning</h3>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-mono uppercase tracking-[0.18em] text-ui-soft">
                Fade In ({formatSecondsLabel(fadeIn)})
              </span>
              <input
                type="range"
                min={0}
                max={0.2}
                step={0.005}
                value={fadeIn}
                onChange={(e) => setFadeInSeconds(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-mono uppercase tracking-[0.18em] text-ui-soft">
                Fade Out ({formatSecondsLabel(fadeOut)})
              </span>
              <input
                type="range"
                min={0}
                max={0.25}
                step={0.005}
                value={fadeOut}
                onChange={(e) => setFadeOutSeconds(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-surface/50 p-3 sm:p-4">
        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_120px_60px] gap-3 px-2 text-[10px] font-mono uppercase tracking-[0.2em] text-ui-soft">
          <span>Sound</span>
          <span className="text-right">Gain</span>
          <span className="text-right">Play</span>
        </div>
        <div className="space-y-2">
          {SOUND_NAMES.map((name) => {
            const gain = getSoundGainMultiplier(name);
            const defaultGain = getDefaultSoundGainMultiplier(name);
            const changed = Math.abs(gain - defaultGain) > 0.001;
            return (
              <div
                key={name}
                className="grid grid-cols-[minmax(0,1fr)_120px_60px] items-center gap-3 rounded-lg border border-edge/80 bg-surface/70 px-2 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{name}</div>
                  <div className="text-xs text-ink-dim">
                    Default {defaultGain.toFixed(2)}{changed ? ` -> ${gain.toFixed(2)}` : ""}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={gain}
                    onChange={(e) => setSoundGainMultiplier(name, Number(e.target.value))}
                    className="mt-1.5 w-full cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-end gap-1">
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.01}
                    value={gain.toFixed(2)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next)) setSoundGainMultiplier(name, next);
                    }}
                    className="w-[4.5rem] rounded border border-edge bg-surface px-2 py-1 text-right text-xs font-mono text-ink"
                  />
                  <button
                    type="button"
                    onClick={() => setSoundGainMultiplier(name, defaultGain)}
                    className="cursor-pointer rounded border border-edge px-1.5 py-1 text-[10px] text-ink-dim hover:text-ink"
                    aria-label={`Reset ${name} gain`}
                    title="Reset gain"
                  >
                    R
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => playSound(name)}
                  className="cursor-pointer justify-self-end rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-xs font-medium text-gold hover:bg-gold/15"
                >
                  Play
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function DevComponentsPlayground() {
  const { theme, toggle: toggleTheme } = useTheme();
  const finalScenario = getMockScenario("results-final");
  const votingScenario = getMockScenario("voting-player");
  const writingScenario = getMockScenario("writing-player");

  if (!finalScenario || !votingScenario || !writingScenario) {
    return (
      <main className="min-h-svh px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <ErrorBanner error="Missing mock scenarios required for component playground." className="" />
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
            <p className="mb-2 text-xs font-mono tracking-widest text-ink-dim">DEV COMPONENTS</p>
            <h1 className="font-display text-3xl font-bold text-ink">Component Playground</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-dim">
              Real components rendered with fixture data for isolated styling and animation iteration.
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
              href="/dev/ui"
              className="rounded-md border border-edge px-3 py-2 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Back to Flow Routes
            </Link>
          </div>
        </header>

        <SfxMixerPanel />

        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Feedback States</h2>
            <ErrorBanner error="Mock error banner for spacing/animation review." />
            <CompletionCard title="All submitted!" subtitle="Waiting for the rest of the lobby..." />
            <div className="mt-4">
              <PulsingDot>Waiting for host action...</PulsingDot>
            </div>
          </div>

          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Timer Variants</h2>
            <div className="space-y-5">
              <Timer deadline={TIMER_DEMO_LONG_DEADLINE} total={45} />
              <Timer deadline={TIMER_DEMO_SHORT_DEADLINE} total={45} />
              <Timer deadline={null} disabled />
            </div>
          </div>
        </section>

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
