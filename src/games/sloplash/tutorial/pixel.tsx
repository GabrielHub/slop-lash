"use client";

import type { CSSProperties } from "react";
import { useLocalTime } from "@/tutorial/clock";
import { BOARD } from "@/tutorial/kit";
import { clamp, ease, hash01, mix, progress } from "@/tutorial/timeline";

/**
 * SlopLash's signature: the ambient pixel rain made solid. A 5x7 LED font,
 * type that rains in cell by cell and locks into place, and a pixel sweep
 * transition. Everything is a pure function of the shot's local time.
 */

const ROWS = 7;
const COLS = 5;

/** 5x7 glyphs, "#" lit. Only what the tutorial spells. */
const FONT: Record<string, readonly string[]> = {
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

export interface PixelCell {
  /** Grid column across the whole text. */
  col: number;
  row: number;
  /** Which character it belongs to. */
  char: number;
}

/** The lit cells of `text`, one blank column between characters. */
export function pixelCells(text: string): { cells: PixelCell[]; cols: number } {
  const cells: PixelCell[] = [];
  const chars = text.toUpperCase().split("");
  chars.forEach((char, index) => {
    const glyph = FONT[char] ?? FONT[" "]!;
    glyph.forEach((line, row) => {
      for (let col = 0; col < COLS; col++) {
        if (line[col] === "#") cells.push({ col: index * (COLS + 1) + col, row, char: index });
      }
    });
  });
  return { cells, cols: Math.max(0, chars.length * (COLS + 1) - 1) };
}

/** The size of `text` set at `cell` px with `gap` px between cells. */
export function pixelSize(text: string, cell: number, gap: number) {
  const { cols } = pixelCells(text);
  const pitch = cell + gap;
  return { width: cols * pitch - gap, height: ROWS * pitch - gap };
}

/** A faint grid of unlit LEDs, as one background. */
export function ledGrid(cell: number, gap: number, color = "color-mix(in srgb, var(--ink) 7%, transparent)"): CSSProperties {
  const pitch = cell + gap;
  return {
    backgroundImage: `conic-gradient(from 90deg at ${gap}px ${gap}px, ${color} 90deg, transparent 0)`,
    backgroundSize: `${pitch}px ${pitch}px`,
    backgroundPosition: `${-gap}px ${-gap}px`,
  };
}

const RAIN_TONES = ["var(--ink-dim)", "var(--teal)", "var(--gold)", "var(--ink-dim)", "var(--punch)"];

export interface PixelRain {
  /** Local seconds the first pixel lands. */
  start: number;
  /** Local seconds the last pixel lands. */
  end: number;
  /** How far above its slot a pixel starts falling, in the text's px. */
  drop?: number;
  /** Fall speed, px per second. */
  speed?: number;
  /** -1 rains up from below instead of down. */
  direction?: 1 | -1;
  seed?: number;
}

/**
 * LED type. Static, or with `rain` its pixels fall in steps (like the
 * ambient field) and lock into their slots with a squash and a gold blink.
 * `flashAt` blinks every pixel bright at once; `shimmer` runs a sweep of
 * light across the lit pixels from that time on.
 */
export function PixelText({
  text,
  cell,
  gap = Math.max(2, Math.round(cell * 0.16)),
  color = "var(--punch)",
  glow = true,
  rain,
  flashAt,
  shimmer,
  grid = false,
  className = "",
  style,
}: {
  text: string;
  cell: number;
  gap?: number;
  color?: string;
  glow?: boolean;
  rain?: PixelRain;
  flashAt?: number;
  shimmer?: number;
  /** Paint the unlit LEDs behind the text; a number frames them as an LED wall that many cells wide around it. */
  grid?: boolean | number;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useLocalTime();
  const { cells, cols } = pixelCells(text);
  const pitch = cell + gap;
  const width = cols * pitch - gap;
  const height = ROWS * pitch - gap;
  const flash = flashAt === undefined ? 0 : 1 - progress(t, flashAt, 0.45, ease.out);
  const flashOn = flashAt !== undefined && t >= flashAt ? flash : 0;
  const radius = Math.max(2, cell * 0.16);

  return (
    <div className={`relative ${className}`} style={{ width, height, ...style }}>
      {grid !== false && (
        <div
          className="absolute"
          style={{
            inset: -pitch * (grid === true ? 1 : grid),
            ...ledGrid(cell, gap),
            borderRadius: grid === true ? radius * 2 : pitch * 0.9,
            backgroundColor:
              grid === true ? undefined : "color-mix(in srgb, var(--surface) 55%, transparent)",
            boxShadow:
              grid === true
                ? undefined
                : "0 0 0 4px var(--edge), 0 40px 90px -40px rgba(0,0,0,0.6)",
          }}
        />
      )}
      {cells.map((pixel, index) => {
        const x = pixel.col * pitch;
        const y = pixel.row * pitch;
        let dy = 0;
        let landed = 1;
        let tone = color;
        let tail = 0;
        let squash = 0;
        if (rain) {
          const { start, end, drop = 900, speed = 2600, direction = 1, seed = 3 } = rain;
          const order = clamp(
            (pixel.col / Math.max(1, cols)) * 0.7 + hash01(seed * 17 + index * 3.7) * 0.3,
          );
          const land = mix(start, end, order);
          const fallTime = drop / speed;
          if (t < land - fallTime) return null;
          if (t < land) {
            // Falling: stepped cell by cell, like the LED field.
            const raw = (land - t) * speed;
            dy = -direction * Math.round(raw / pitch) * pitch;
            landed = 0;
            tail = 1;
            tone = RAIN_TONES[Math.floor(hash01(seed * 5 + index * 1.9) * RAIN_TONES.length)]!;
          } else {
            const blink = progress(t, land, 0.3, ease.out);
            tone = `color-mix(in srgb, var(--gold) ${Math.round((1 - blink) * 100)}%, ${color})`;
            squash = 1 - progress(t, land, 0.2, ease.out);
          }
        }
        const lit = flashOn > 0 ? `color-mix(in srgb, var(--gold) ${Math.round(flashOn * 85)}%, ${tone})` : tone;
        const shine = shimmer !== undefined && landed ? shineAt(t - shimmer, pixel, cols) : 0;
        const fill =
          shine > 0 ? `color-mix(in srgb, var(--gold) ${Math.round(shine * 70)}%, ${lit})` : lit;
        const rainUp = rain?.direction === -1;
        if (tail > 0) {
          return (
              <div
                key={index}
                className="absolute"
                style={{
                  left: x,
                  width: cell,
                  top: rainUp ? y + dy : y + dy - pitch * 3,
                  height: cell + pitch * 3,
                  borderRadius: radius,
                  background: stepTrail(tone, cell, pitch, rainUp ? "to top" : "to bottom"),
                  opacity: 0.85,
                }}
              />
          );
        }
        return (
              <div
                key={index}
                className="absolute"
                style={{
                  left: x,
                  top: y + dy,
                  width: cell,
                  height: cell,
                  borderRadius: radius,
                  background: fill,
                  transformOrigin: "50% 100%",
                  transform:
                    squash > 0 ? `scale(${1 + squash * 0.3}, ${1 - squash * 0.4})` : undefined,
                  boxShadow: glow
                    ? `0 0 ${Math.round(cell * (0.7 + flashOn))}px color-mix(in srgb, ${color} ${Math.round(40 + flashOn * 40)}%, transparent), inset 0 ${-Math.max(2, Math.round(cell * 0.14))}px 0 color-mix(in srgb, ${color} 72%, var(--bg))`
                    : `inset 0 ${-Math.max(2, Math.round(cell * 0.14))}px 0 color-mix(in srgb, ${color} 72%, var(--bg))`,
                }}
              />
        );
      })}
    </div>
  );
}

/** A band of light crossing the text every few seconds, left to right. */
function shineAt(since: number, pixel: PixelCell, cols: number): number {
  if (since < 0) return 0;
  const period = 3.4;
  const sweep = 0.8;
  const phase = since % period;
  if (phase > sweep) return 0;
  const head = (phase / sweep) * 1.5 - 0.25;
  const position = pixel.col / Math.max(1, cols) - pixel.row * 0.025;
  return Math.max(0, 1 - Math.abs(head - position) * 6);
}

/** A falling pixel's head with three fading trail cells above it. */
function stepTrail(
  tone: string,
  cell: number,
  pitch: number,
  direction: "to top" | "to bottom",
): string {
  const stops: string[] = [];
  const alphas = [0.16, 0.32, 0.55];
  alphas.forEach((alpha, step) => {
    const top = step * pitch;
    stops.push(`transparent ${top}px`);
    stops.push(`color-mix(in srgb, ${tone} ${Math.round(alpha * 100)}%, transparent) ${top}px`);
    stops.push(`color-mix(in srgb, ${tone} ${Math.round(alpha * 100)}%, transparent) ${top + cell}px`);
    stops.push(`transparent ${top + cell}px`);
  });
  const head = pitch * 3;
  stops.push(`transparent ${head}px`, `${tone} ${head}px`, `${tone} ${head + cell}px`);
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}

/**
 * How far a full sweep cell bleeds past each side, in board px: neighbours
 * overlap by twice this, over 1 screen px even at the host preview's ~0.2 scale.
 */
const SEAM = 3;

/**
 * The chapter transition: LED cells sweep the board left to right, blinking
 * gold at their leading edge, cover it fully at `at + duration / 2` (cut
 * there) and clear off in the same direction.
 */
export function PixelSweep({
  at,
  duration = 0.9,
  cell = 120,
  seed = 5,
}: {
  at: number;
  duration?: number;
  cell?: number;
  seed?: number;
}) {
  const t = useLocalTime();
  if (t < at || t > at + duration) return null;
  const half = duration / 2;
  const cols = Math.ceil(BOARD.width / cell);
  const rows = Math.ceil(BOARD.height / cell);
  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {Array.from({ length: cols * rows }, (_, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const d = (col + row * 0.45) / (cols + rows * 0.45);
        const jitter = hash01(seed * 13 + index * 2.31);
        const lead = (d * 0.5 + jitter * 0.1) * half;
        const on = progress(t, at + lead, half * 0.4, ease.out);
        const off = progress(t, at + half + lead, half * 0.4, ease.in);
        const fill = on * (1 - off);
        if (fill <= 0.001) return null;
        const hot = Math.min(100, Math.round((1 - on) * 100 + off * 60));
        const full = fill > 0.985;
        // Full cells overlap, so a covered board shows no anti-aliased
        // hairlines between them even when scaled small.
        const bleed = full ? SEAM : 0.5;
        return (
          <div
            key={index}
            className="absolute"
            style={{
              left: col * cell - (full ? SEAM : 0),
              top: row * cell - (full ? SEAM : 0),
              width: cell + bleed * 2,
              height: cell + bleed * 2,
              background: `color-mix(in srgb, var(--gold) ${hot}%, var(--punch))`,
              transform: `scale(${full ? 1 : fill * 0.9})`,
              borderRadius: full ? 0 : cell * 0.1,
            }}
          />
        );
      })}
    </div>
  );
}
