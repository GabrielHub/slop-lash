"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "@/components/theme-provider";
import type { AmbientStats } from "@/components/ambient/engine";
import {
  originOf,
  pulseAmbient,
  resetAmbient,
  setAmbient,
  type AmbientEnergy,
  type AmbientPulseKind,
  type AmbientScene,
  type AmbientSurface,
} from "@/lib/ambient-events";

const SCENES: AmbientScene[] = ["stars", "pixels", "bubbles", "confetti"];
const ENERGIES: AmbientEnergy[] = ["calm", "focus", "hype"];
const SURFACES: AmbientSurface[] = ["stage", "phone"];
const PULSES: AmbientPulseKind[] = ["cheer", "slop", "heart", "chill", "gust", "swell"];
/** The game whose palette each scene is drawn in, as the room shell sets it on <html>. */
const GAME: Record<AmbientScene, string | null> = {
  stars: null,
  pixels: null,
  bubbles: "matchslop",
  confetti: "quizslop",
};

/** The page's query string, as the server page hands it over. */
export type AmbientLabParams = Partial<Record<string, string>>;

function presetFrom(params: AmbientLabParams) {
  const pickFrom = <T extends string>(
    options: readonly T[],
    value: string | undefined,
    fallback: T,
  ) => (options.includes(value as T) ? (value as T) : fallback);
  const { mood } = params;
  return {
    scene: pickFrom(SCENES, params.scene, "stars"),
    energy: pickFrom(ENERGIES, params.energy, "calm"),
    surface: pickFrom(SURFACES, params.surface, "stage"),
    urgent: params.urgent === "1",
    mood: mood === undefined || mood === "" ? null : Number(mood),
    theme: params.theme,
    ui: params.ui !== "0",
  };
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs font-semibold cursor-pointer transition-colors ${
        active
          ? "border-teal bg-teal-soft text-ink"
          : "border-edge bg-surface/80 text-ink-dim hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Every state of the ambient background on one page: scenes, energy, surface,
 * urgency, mood, pulses (fired where you click), and the theme. Query params
 * (`scene`, `energy`, `surface`, `urgent=1`, `mood`, `theme`, `ui=0`) preset it
 * for screenshots.
 */
export function AmbientLab({ params }: { params: AmbientLabParams }) {
  const { theme, toggle, mounted } = useTheme();
  const [preset] = useState(() => presetFrom(params));
  const [scene, setScene] = useState<AmbientScene>(preset.scene);
  const [energy, setEnergy] = useState<AmbientEnergy>(preset.energy);
  const [surface, setSurface] = useState<AmbientSurface>(preset.surface);
  const [urgent, setUrgent] = useState(preset.urgent);
  const [mood, setMood] = useState<number | null>(preset.mood);
  const [armed, setArmed] = useState<AmbientPulseKind>("cheer");
  const [ui, setUi] = useState(preset.ui);
  const [sample, setSample] = useState(preset.ui);
  const [stats, setStats] = useState<AmbientStats | null>(null);

  // The theme preset applies once; afterwards the toggle button owns the theme.
  const themePreset = useRef(false);
  useEffect(() => {
    if (!mounted || themePreset.current) return;
    themePreset.current = true;
    const wanted = preset.theme;
    if ((wanted === "light" || wanted === "dark") && wanted !== theme) toggle();
  }, [mounted, preset.theme, theme, toggle]);

  useEffect(() => {
    setAmbient({ scene, energy, surface, urgent, mood });
    const game = GAME[scene];
    if (game) document.documentElement.dataset.game = game;
    else delete document.documentElement.dataset.game;
  }, [scene, energy, surface, urgent, mood]);

  useEffect(
    () => () => {
      resetAmbient();
      delete document.documentElement.dataset.game;
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setStats(window.__ambientStats ?? null), 500);
    return () => window.clearInterval(timer);
  }, []);

  const fire = (kind: AmbientPulseKind, origin: { x: number; y: number }) =>
    pulseAmbient({ kind, origin, strength: 1 });

  return (
    <main className="min-h-svh">
      <button
        type="button"
        aria-label={`Fire ${armed} here`}
        className="fixed inset-0 cursor-crosshair"
        onClick={(event) => {
          // A keyboard press has no position: fire from the centre.
          const keyboard = event.detail === 0;
          fire(armed, {
            x: keyboard ? 0.5 : event.clientX / window.innerWidth,
            y: keyboard ? 0.5 : event.clientY / window.innerHeight,
          });
        }}
      />
      {ui && (
        <div className="fixed left-3 top-3 z-10 w-[min(22rem,calc(100vw-1.5rem))] space-y-2 rounded-xl border border-edge bg-surface/85 p-3 text-xs text-ink shadow cursor-auto">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-bold">Ambient lab</p>
            <div className="flex gap-1">
              <Chip onClick={toggle}>{theme === "dark" ? "Light" : "Dark"}</Chip>
              <Chip active={sample} onClick={() => setSample((on) => !on)}>
                Text
              </Chip>
              <Chip onClick={() => setUi(false)}>Hide</Chip>
            </div>
          </div>
          <Row label="Scene">
            {SCENES.map((option) => (
              <Chip key={option} active={scene === option} onClick={() => setScene(option)}>
                {option}
              </Chip>
            ))}
          </Row>
          <Row label="Energy">
            {ENERGIES.map((option) => (
              <Chip key={option} active={energy === option} onClick={() => setEnergy(option)}>
                {option}
              </Chip>
            ))}
            <Chip active={urgent} onClick={() => setUrgent((on) => !on)}>
              urgent
            </Chip>
          </Row>
          <Row label="Surface">
            {SURFACES.map((option) => (
              <Chip key={option} active={surface === option} onClick={() => setSurface(option)}>
                {option}
              </Chip>
            ))}
          </Row>
          <Row label="Mood">
            <input
              type="range"
              min={0}
              max={100}
              value={mood ?? 50}
              onChange={(event) => setMood(Number(event.target.value))}
              className="w-32"
              aria-label="Mood"
            />
            <span className="w-8 font-mono tabular-nums text-ink-dim">{mood ?? "none"}</span>
            <Chip active={mood === null} onClick={() => setMood(null)}>
              none
            </Chip>
          </Row>
          <Row label="Pulse">
            {PULSES.map((kind) => (
              <Chip
                key={kind}
                active={armed === kind}
                onClick={(event) => {
                  setArmed(kind);
                  fire(kind, originOf(event.currentTarget));
                }}
              >
                {kind}
              </Chip>
            ))}
          </Row>
          <p className="text-ink-dim">
            Click anywhere to fire <b className="text-ink">{armed}</b> there (one pulse per 1.5s,
            swell always).
          </p>
          {stats && (
            <p className="font-mono text-ink-dim">
              {stats.avgFrameMs.toFixed(2)}ms avg · {stats.maxFrameMs.toFixed(1)}ms max ·{" "}
              {stats.fps}
              fps · {stats.particles} particles · dpr {stats.dpr}
              {stats.dropped ? " · dropped" : ""}
              {stats.running ? "" : " · paused"}
            </p>
          )}
        </div>
      )}
      {!ui && (
        <button
          type="button"
          onClick={() => setUi(true)}
          className="fixed left-3 top-3 z-10 rounded-md border border-edge bg-surface/60 px-2 py-1 text-xs text-ink-dim opacity-0 hover:opacity-100"
        >
          Show
        </button>
      )}
      {sample && (
        <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-center gap-6 px-4 text-center">
          <h1 className="font-display text-5xl font-extrabold text-ink sm:text-7xl">Round 2</h1>
          <div className="w-full max-w-2xl rounded-2xl border border-edge bg-surface p-6 text-left shadow">
            <p className="font-display text-2xl font-bold text-ink sm:text-3xl">
              The worst thing to hear from your pilot is ______.
            </p>
            <p className="mt-3 text-ink-dim">
              Text sits in the calm zone; the field stays brightest at the edges.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-14 shrink-0 text-ink-dim">{label}</span>
      {children}
    </div>
  );
}
