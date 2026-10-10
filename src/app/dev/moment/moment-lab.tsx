"use client";

import { useState, type ReactNode } from "react";
import { useTheme } from "@/components/theme-provider";
import { FIXTURES } from "@/dev/fixtures";
import { FIXTURE_NOW } from "@/dev/fixtures/base";
import { StaticRoomProvider } from "@/room/context";
import {
  CountUp,
  fireConfetti,
  Stamp,
  StageFxProvider,
  SurfaceProvider,
  TypeOn,
  useHeld,
  useMoment,
  type ConfettiPreset,
  type MomentCue,
  type StampTone,
  type Surface,
} from "@/room/moment";
import { DoneTracker } from "@/room/parts";

const PRESETS: ConfettiPreset[] = [
  "burst",
  "flawless",
  "slopped",
  "final",
  "hearts",
  "quiz",
  "personal",
];
const TONES: StampTone[] = ["punch", "teal", "gold", "win", "fail", "ink"];
const LINE = "I came, I generated, I was statistically the funniest. GG, carbon-based lifeforms.";
const MORE = " Rematch? I've already written your excuses.";

const view = FIXTURES.SLOPLASH[0]!.view;

/**
 * A bench for the moment kit: a staged verdict on the shared clock, every
 * stamp tone, confetti presets, TypeOn, CountUp and both DoneTracker variants.
 * Dev only; it runs on a fixture room so the hooks have a clock and players.
 */
export function MomentLab() {
  const [clockOffsetMs] = useState(() => FIXTURE_NOW - Date.now());
  const [surface, setSurface] = useState<Surface>("stage");
  const { theme, toggle } = useTheme();
  return (
    <StaticRoomProvider view={view} capability="fixture" clockOffsetMs={clockOffsetMs} live>
      <SurfaceProvider value={surface}>
        <StageFxProvider className="relative min-h-svh">
          <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 text-ink">
            <header className="flex flex-wrap items-center gap-2">
              <h1 className="mr-auto font-display text-2xl font-bold">Moment lab</h1>
              {(["stage", "phone"] as const).map((option) => (
                <Chip key={option} on={surface === option} onClick={() => setSurface(option)}>
                  {option}
                </Chip>
              ))}
              <Chip on={false} onClick={toggle}>
                {theme}
              </Chip>
            </header>
            <Verdict clockOffsetMs={clockOffsetMs} />
            <Section title="Stamps">
              <div className="flex flex-wrap items-center gap-6">
                {TONES.map((tone, index) => (
                  <Stamp key={tone} tone={tone} tilt={index % 2 ? 2 : -3} size="md">
                    {tone}
                  </Stamp>
                ))}
              </div>
            </Section>
            <Section title="Confetti">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Chip key={preset} on={false} onClick={() => fireConfetti(preset)}>
                    {preset}
                  </Chip>
                ))}
              </div>
            </Section>
            <Typing />
            <Tracker />
          </main>
        </StageFxProvider>
      </SurfaceProvider>
    </StaticRoomProvider>
  );
}

/** A verdict on four beats: stamp, impact, score, confetti. */
function Verdict({ clockOffsetMs }: { clockOffsetMs: number }) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const cues: MomentCue[] = [
    { at: 0 },
    {
      at: 170,
      sound: "stamp-slam",
      shake: "hard",
      flash: "fail",
      ambient: "slop",
      haptic: 60,
    },
    { at: 600, sound: "winner-reveal" },
    { at: 1_100, sound: "celebration", confetti: "slopped", ambient: "cheer" },
  ];
  const beat = useMoment(cues, { when: anchor !== null, anchor: anchor ?? undefined });
  const score = useHeld(1_242, beat >= 3);
  return (
    <Section title="useMoment">
      <div className="flex flex-wrap items-center gap-6">
        <Chip on={false} onClick={() => setAnchor(Date.now() + clockOffsetMs)}>
          Play
        </Chip>
        <span className="font-mono text-sm text-ink-dim">beat {beat}</span>
        <Stamp tone="punch" size="lg" show={beat >= 1}>
          Slopped!
        </Stamp>
        <span className="font-display text-3xl font-bold text-gold">
          +{beat >= 3 ? <CountUp value={score} /> : 0}
        </span>
      </div>
    </Section>
  );
}

function Typing() {
  const [take, setTake] = useState(0);
  const [text, setText] = useState(LINE);
  return (
    <Section title="TypeOn">
      <div className="flex gap-2">
        <Chip
          on={false}
          onClick={() => {
            setText(LINE);
            setTake((value) => value + 1);
          }}
        >
          Retype
        </Chip>
        <Chip on={false} onClick={() => setText((value) => value + MORE)}>
          Extend
        </Chip>
      </div>
      <p className="max-w-xl rounded-xl border border-edge bg-surface/70 p-4 font-display text-xl font-bold">
        <TypeOn key={take} text={text} cps={36} />
      </p>
    </Section>
  );
}

function Tracker() {
  const ids = view.players.map((player) => player.id);
  const [count, setCount] = useState(1);
  const done = ids.slice(0, count);
  return (
    <Section title="DoneTracker">
      <div className="flex gap-2">
        <Chip on={false} onClick={() => setCount((value) => Math.min(ids.length, value + 1))}>
          Lock in next
        </Chip>
        <Chip on={false} onClick={() => setCount(0)}>
          Reset
        </Chip>
      </div>
      <DoneTracker label="Answers in" doneIds={done} />
      <div className="max-w-sm rounded-xl border border-edge bg-surface/70 p-3">
        <DoneTracker variant="phone" doneIds={done} />
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-xs uppercase tracking-widest text-ink-dim">{title}</h2>
      {children}
    </section>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-3 py-1 font-mono text-xs ${
        on
          ? "border-punch bg-punch/15 text-ink"
          : "border-edge bg-surface/80 text-ink-dim hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
