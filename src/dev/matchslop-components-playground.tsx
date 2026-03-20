"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useTheme } from "@/components/theme-provider";
import { springGentle } from "@/lib/animations";
import {
  MoodMeter,
  OutcomeBadge,
  OutcomeVerdict,
  TranscriptBubble,
  ProfileCard,
  getMoodColor,
  type MatchSlopProfile,
  type MatchSlopTranscriptEntry,
} from "@/games/matchslop/ui/matchslop-game-shell";
import { ProgressCount } from "@/games/matchslop/ui/matchslop-shared-ui";

/* ─── Demo wrapper (matches shared playground card style) ─── */

function DemoCard({ title, children, span }: { title: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div
      className={`rounded-xl border-2 border-edge bg-surface/80 p-4 ${span ? "lg:col-span-2" : ""}`}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{title}</h2>
      {/* MatchSlop CSS vars scope */}
      <div data-game="matchslop" className="rounded-xl p-4" style={{ background: "var(--ms-bg)" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Fixture data ─── */

const FIXTURE_PROFILE: MatchSlopProfile = {
  displayName: "Nora",
  age: 29,
  location: "Echo Park",
  bio: "Tarot decks, bike grease, and the kind of confidence that gets you banned from trivia night.",
  tagline: "Looking for someone funny enough to survive brunch.",
  prompts: [
    { id: "1", prompt: "Typical Sunday", answer: "Farmer\u2019s market, then a reckless amount of anchovies." },
  ],
  details: { job: "Tattoo Apprentice", school: "CalArts", height: "5\u20196\u201d", languages: ["English", "Spanish"] },
};

const FIXTURE_TRANSCRIPT: MatchSlopTranscriptEntry[] = [
  {
    id: "player-turn-1",
    speaker: "PLAYERS",
    text: "You had me at reckless anchovies. I too enjoy flirting with coastal danger.",
    authorName: "Amy",
    turn: 1,
  },
  {
    id: "persona-turn-1",
    speaker: "PERSONA",
    text: "Coastal danger is my whole brand. Last Sunday I cured fish on my fire escape and the seagulls formed a queue.",
    authorName: "Nora, 29",
    turn: 1,
    outcome: "CONTINUE",
  },
  {
    id: "player-turn-2",
    speaker: "PLAYERS",
    text: "Okay but seriously, do you like bread? Because I knead you in my life.",
    authorName: "Ong",
    turn: 2,
  },
  {
    id: "persona-turn-2",
    speaker: "PERSONA",
    text: "I\u2019m going to be honest, I\u2019d rather date the bread. Unmatched.",
    authorName: "Nora, 29",
    turn: 2,
    outcome: "UNMATCHED",
  },
];

/* ─── Main playground ─── */

export function DevMatchslopPlayground() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [sliderMood, setSliderMood] = useState(55);
  const [demoDelta, setDemoDelta] = useState<number | null>(12);

  return (
    <main className="min-h-svh px-6 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-mono tracking-widest text-ink-dim">DEV COMPONENTS / MATCHSLOP</p>
            <h1 className="font-display text-3xl font-bold text-ink">MatchSlop Components</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-dim">
              Dating-app game UI components rendered with static fixture data. Each card
              wraps content in the MatchSlop theme scope.
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

        {/* Mood Meter — interactive slider */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Mood Meter — Interactive (with Delta)">
            <div className="space-y-4">
              <MoodMeter mood={sliderMood} moodDelta={demoDelta} />
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sliderMood}
                  onChange={(e) => setSliderMood(Number(e.target.value))}
                  className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(90deg, hsl(220,90%,55%) 0%, hsl(180,80%,50%) 25%, hsl(50,80%,50%) 50%, hsl(30,85%,50%) 75%, hsl(0,90%,55%) 100%)`,
                    accentColor: getMoodColor(sliderMood),
                  }}
                />
                <span
                  className="font-mono text-sm font-bold tabular-nums shrink-0"
                  style={{ color: "var(--ms-ink-dim)", minWidth: "3ch" }}
                >
                  {sliderMood}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono" style={{ color: "var(--ms-ink-dim)" }}>Delta:</span>
                {[-20, -10, -5, 0, 5, 10, 20].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDemoDelta(d === 0 ? null : d)}
                    className="px-2 py-0.5 rounded text-xs font-mono cursor-pointer"
                    style={{
                      background: demoDelta === d || (d === 0 && demoDelta == null) ? "var(--ms-violet-soft)" : "var(--ms-raised)",
                      border: "1px solid var(--ms-edge)",
                      color: d > 0 ? "var(--ms-mint)" : d < 0 ? "var(--ms-red)" : "var(--ms-ink-dim)",
                    }}
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            </div>
          </DemoCard>

          <DemoCard title="Mood Meter — All Tiers (with Critical Zone)">
            <div className="space-y-1">
              {[10, 30, 55, 75, 95].map((value) => (
                <MoodMeter key={value} mood={value} moodDelta={value <= 20 ? -15 : value >= 80 ? 18 : 5} />
              ))}
            </div>
          </DemoCard>
        </section>

        {/* Profile Card */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Profile Card with Mood">
            <div className="max-w-sm mx-auto">
              <ProfileCard
                profile={FIXTURE_PROFILE}
                personaImage={null}
                profileGeneration={{ status: "READY" }}
                outcome="IN_PROGRESS"
                mood={sliderMood}
                gameStarted={true}
              />
            </div>
          </DemoCard>

          {/* Transcript Bubbles */}
          <DemoCard title="Transcript Bubbles">
            <div className="space-y-3">
              {FIXTURE_TRANSCRIPT.map((entry, i) => (
                <TranscriptBubble key={entry.id} entry={entry} index={i} />
              ))}
            </div>
          </DemoCard>
        </section>

        {/* Outcome Badges */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Outcome Badges">
            <div className="flex flex-wrap gap-3">
              <OutcomeBadge outcome="DATE_SEALED" />
              <OutcomeBadge outcome="UNMATCHED" />
              <OutcomeBadge outcome="TURN_LIMIT" />
              <OutcomeBadge outcome="COMEBACK" />
            </div>
          </DemoCard>

          {/* Typing Indicator */}
          <DemoCard title="Typing Indicator">
            <div className="flex items-center gap-2 px-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: "var(--ms-rose)",
                    animation: `ms-typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
              <span className="text-xs font-medium ml-1" style={{ color: "var(--ms-ink-dim)" }}>
                Nora is typing...
              </span>
            </div>
          </DemoCard>
        </section>

        {/* Outcome Verdicts */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Outcome Verdict — Date Sealed">
            <OutcomeVerdict outcome="DATE_SEALED" />
          </DemoCard>

          <DemoCard title="Outcome Verdict — Unmatched">
            <OutcomeVerdict outcome="UNMATCHED" />
          </DemoCard>
        </section>

        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Outcome Verdict — Turn Limit">
            <OutcomeVerdict outcome="TURN_LIMIT" />
          </DemoCard>

          <DemoCard title="Outcome Verdict — Comeback">
            <OutcomeVerdict outcome="COMEBACK" />
          </DemoCard>
        </section>

        {/* Progress Counts + Signal Display */}
        <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <DemoCard title="Progress Counts">
            <div className="space-y-3">
              <ProgressCount count={2} total={5} label="submitted" />
              <ProgressCount count={5} total={5} label="submitted" />
              <ProgressCount count={3} total={5} label="voted" />
              <ProgressCount count={5} total={5} label="voted" />
            </div>
          </DemoCard>

          <DemoCard title="Persona Signal Card (Controller)">
            <div className="space-y-3">
              <div
                className="rounded-xl flex items-start gap-2"
                style={{
                  padding: "0.5rem 0.75rem",
                  background: "color-mix(in srgb, var(--ms-coral) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--ms-coral) 20%, transparent)",
                }}
              >
                <span
                  className="font-mono font-bold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded-md"
                  style={{ fontSize: "9px", color: "var(--ms-coral)", background: "var(--ms-coral-soft)" }}
                >
                  too generic
                </span>
                <p className="text-xs leading-snug italic" style={{ color: "var(--ms-ink-dim)" }}>
                  try being more specific instead of louder
                </p>
              </div>
              <div
                className="rounded-xl flex items-start gap-2"
                style={{
                  padding: "0.5rem 0.75rem",
                  background: "color-mix(in srgb, var(--ms-coral) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--ms-coral) 20%, transparent)",
                }}
              >
                <span
                  className="font-mono font-bold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded-md"
                  style={{ fontSize: "9px", color: "var(--ms-coral)", background: "var(--ms-coral-soft)" }}
                >
                  more real
                </span>
                <p className="text-xs leading-snug italic" style={{ color: "var(--ms-ink-dim)" }}>
                  say something that feels real for once
                </p>
              </div>
            </div>
          </DemoCard>
        </section>

        {/* Scoreboard demo */}
        <section className="grid gap-5 lg:grid-cols-2">
          <DemoCard title="Compact Scoreboard">
            <div>
              <span
                className="font-display font-bold uppercase tracking-wider block mb-2"
                style={{ fontSize: "0.6rem", color: "var(--ms-ink-dim)" }}
              >
                Leaderboard
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: "Amy", score: 150, isLeader: true },
                  { name: "Ong", score: 100, isLeader: false },
                  { name: "GPT-5.4", score: 50, isLeader: false },
                ].map((player) => (
                  <motion.div
                    key={player.name}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1"
                    style={{
                      background: player.isLeader ? "var(--gold-soft, var(--ms-coral-soft))" : "var(--ms-raised)",
                      border: `1px solid ${player.isLeader ? "var(--gold, var(--ms-coral))" : "var(--ms-edge)"}`,
                    }}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springGentle, delay: player.isLeader ? 0 : 0.06 }}
                  >
                    <span
                      className="font-display font-bold truncate"
                      style={{
                        fontSize: "0.7rem",
                        color: player.isLeader ? "var(--gold, var(--ms-coral))" : "var(--ms-ink)",
                      }}
                    >
                      {player.name}
                    </span>
                    <span
                      className="font-mono font-bold tabular-nums"
                      style={{
                        fontSize: "0.65rem",
                        color: player.isLeader ? "var(--gold, var(--ms-coral))" : "var(--ms-ink-dim)",
                      }}
                    >
                      {player.score}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </DemoCard>

          <div className="rounded-xl border-2 border-edge bg-surface/80 p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="mb-3 font-display text-lg font-bold text-ink">Fixture Quick Links</h2>
            <div className="space-y-2 text-sm">
              {[
                "matchslop-lobby",
                "matchslop-writing",
                "matchslop-voting",
                "matchslop-results",
                "matchslop-final",
                "matchslop-final-unmatched",
                "matchslop-final-comeback",
                "matchslop-comeback-writing",
              ].map((slug) => (
                <Link key={slug} href={`/dev/ui/${slug}`} className="block text-ink-dim hover:text-ink font-mono">
                  /dev/ui/{slug}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
