import type { CreateTypes, Options, Shape } from "canvas-confetti";
import { noteConfettiBurst } from "@/components/ambient/engine";
import { HEART_PATH, parseColor } from "@/components/ambient/palette";
import { prefersReducedMotion } from "@/lib/animations";

/**
 * Celebration bursts, one vocabulary for every game. Colours come from the
 * theme tokens at fire time, so a burst is in the current game's palette and
 * works in either theme. Every preset stays under about 140 particles, uses
 * stage-sized pieces (they read from the couch), and is skipped under reduced
 * motion. "personal" is the only preset meant for a phone.
 */
export type ConfettiPreset =
  /** A plain centre burst. */
  | "burst"
  /** A unanimous win: teal and gold from the centre, then a second puff. */
  | "flawless"
  /** The AI won: punch-red cannons from both sides. */
  | "slopped"
  /** The end of a game: side cannons, then a centre wave. */
  | "final"
  /** MatchSlop's sealed date: rose, violet and coral hearts. */
  | "hearts"
  /** QuizSlop's studio drop: squares and dots falling from the rig. */
  | "quiz"
  /** One player's phone: a small burst from the bottom. */
  | "personal";

export interface ConfettiOrigin {
  /** 0-1 across the viewport. */
  x: number;
  /** 0-1 down the viewport. */
  y: number;
}

let instance: Promise<CreateTypes | null> | null = null;
/** MatchSlop's heart, built once with the canvas (falls back to circles). */
let heartShape: Shape | null = null;

/** One confetti canvas over the page (under modals), created on first use. */
function confettiInstance(): Promise<CreateTypes | null> {
  instance ??= import("canvas-confetti")
    .then(({ default: confetti }) => {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;z-index:40;pointer-events:none";
      document.body.appendChild(canvas);
      try {
        heartShape = confetti.shapeFromPath({ path: HEART_PATH });
      } catch {
        heartShape = null;
      }
      return confetti.create(canvas, {
        resize: true,
        useWorker: true,
        disableForReducedMotion: true,
      });
    })
    .catch(() => {
      instance = null;
      return null;
    });
  return instance;
}

/**
 * Reads `--token` colours as hex; canvas-confetti only understands hex. With
 * no tokens at all it falls back to the library's own colours.
 */
function tokens(...names: string[]): string[] | undefined {
  const style = getComputedStyle(document.documentElement);
  const colors = names.flatMap((name) => {
    const rgb = parseColor(style.getPropertyValue(name));
    return rgb ? [`#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`] : [];
  });
  return colors.length ? colors : undefined;
}

function shots(
  preset: ConfettiPreset,
  origin: ConfettiOrigin | undefined,
): { delayMs: number; options: Options }[] {
  const stage = { scalar: 1.2, ticks: 260, disableForReducedMotion: true } satisfies Options;
  switch (preset) {
    case "burst":
      return [
        {
          delayMs: 0,
          options: {
            ...stage,
            particleCount: 90,
            spread: 75,
            startVelocity: 34,
            origin: origin ?? { x: 0.5, y: 0.6 },
            colors: tokens("--punch", "--teal", "--gold"),
          },
        },
      ];
    case "flawless": {
      const colors = tokens("--teal", "--gold", "--win");
      const at = origin ?? { x: 0.5, y: 0.55 };
      return [
        {
          delayMs: 0,
          options: {
            ...stage,
            particleCount: 90,
            spread: 85,
            startVelocity: 36,
            origin: at,
            colors,
          },
        },
        {
          delayMs: 260,
          options: {
            ...stage,
            particleCount: 40,
            spread: 120,
            startVelocity: 24,
            origin: { x: at.x, y: at.y - 0.05 },
            colors,
          },
        },
      ];
    }
    case "slopped": {
      const colors = tokens("--punch", "--fail", "--gold");
      const side = { ...stage, particleCount: 60, spread: 55, startVelocity: 44, colors };
      const y = origin?.y ?? 0.65;
      return [
        { delayMs: 0, options: { ...side, angle: 60, origin: { x: 0, y } } },
        { delayMs: 0, options: { ...side, angle: 120, origin: { x: 1, y } } },
      ];
    }
    case "final": {
      const colors = tokens("--punch", "--teal", "--gold");
      const side = { ...stage, particleCount: 45, spread: 60, startVelocity: 50, colors };
      return [
        { delayMs: 0, options: { ...side, angle: 60, origin: { x: 0, y: 0.7 } } },
        { delayMs: 0, options: { ...side, angle: 120, origin: { x: 1, y: 0.7 } } },
        {
          delayMs: 600,
          options: {
            ...stage,
            particleCount: 50,
            spread: 100,
            startVelocity: 30,
            origin: origin ?? { x: 0.5, y: 0.45 },
            colors,
          },
        },
      ];
    }
    case "hearts": {
      const colors = tokens("--ms-rose", "--ms-violet", "--ms-coral", "--punch");
      const at = origin ?? { x: 0.5, y: 0.55 };
      const hearts = {
        ...stage,
        shapes: heartShape ? [heartShape] : (["circle"] as Shape[]),
        scalar: 2,
        flat: true,
        gravity: 0.7,
        ticks: 320,
        colors,
      };
      return [
        {
          delayMs: 0,
          options: { ...hearts, particleCount: 60, spread: 100, startVelocity: 32, origin: at },
        },
        {
          delayMs: 350,
          options: { ...hearts, particleCount: 40, spread: 140, startVelocity: 22, origin: at },
        },
      ];
    }
    case "quiz": {
      const colors = tokens("--qs-marquee", "--qs-signal", "--qs-punch", "--gold", "--teal");
      const drop = {
        ...stage,
        particleCount: 40,
        angle: 270,
        spread: 70,
        startVelocity: 18,
        gravity: 0.65,
        drift: 0,
        ticks: 340,
        shapes: ["square", "circle"] as Shape[],
        colors,
      };
      return [0.2, 0.5, 0.8].map((x, i) => ({
        delayMs: i * 140,
        options: { ...drop, origin: { x, y: -0.05 } },
      }));
    }
    case "personal":
      return [
        {
          delayMs: 0,
          options: {
            particleCount: 40,
            spread: 60,
            startVelocity: 32,
            ticks: 200,
            origin: origin ?? { x: 0.5, y: 0.95 },
            angle: 90,
            colors: tokens("--punch", "--teal", "--gold"),
            disableForReducedMotion: true,
          },
        },
      ];
  }
}

/**
 * Fires a confetti preset. `origin` (0-1 viewport fractions) moves the burst
 * to whatever caused it, e.g. `originOf(stampElement)`.
 */
export function fireConfetti(preset: ConfettiPreset, origin?: ConfettiOrigin): void {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  void confettiInstance().then((confetti) => {
    if (!confetti) return;
    noteConfettiBurst();
    for (const { delayMs, options } of shots(preset, origin)) {
      if (delayMs) window.setTimeout(() => void confetti(options), delayMs);
      else void confetti(options);
    }
  });
}
