"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { STROKE_GRID } from "../../constants";
import { BRUSH_WIDTH, ERASER_WIDTH, isEraser, simplifyStroke, type Stroke } from "../../strokes";
import { DRAWING_CANVAS_HEX, ERASER_INDEX, PHONE_PALETTE } from "../../vocab";

// The phone's square drawing canvas: pointer events (one finger, no page
// scroll), high-DPI, strokes in the contract's 0..1000 grid. Earlier layers
// (an upgrade's old drawing) paint faded under the strokes being drawn.

const HEX: Record<number, string> = Object.fromEntries(PHONE_PALETTE.map((ink) => [ink.index, ink.hex]));

function paint(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[], scale: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    const eraser = isEraser(stroke);
    const width = (eraser ? ERASER_WIDTH : BRUSH_WIDTH) * scale;
    const colour = HEX[stroke.c] ?? DRAWING_CANVAS_HEX;
    const p = stroke.p;
    if (p.length < 2) continue;
    if (p.length === 2) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(p[0]! * scale, p[1]! * scale, width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(p[0]! * scale, p[1]! * scale);
    for (let index = 2; index + 1 < p.length; index += 2) ctx.lineTo(p[index]! * scale, p[index + 1]! * scale);
    ctx.stroke();
  }
}

export function DrawingCanvas({
  strokes,
  below = [],
  ink,
  disabled = false,
  onStroke,
  backdrop,
}: {
  strokes: readonly Stroke[];
  /** Earlier layers, painted faded underneath. */
  below?: readonly Stroke[];
  /** Palette index 0..5, or ERASER_INDEX. */
  ink: number;
  disabled?: boolean;
  onStroke: (stroke: Stroke) => void;
  /** Shown faded behind an empty canvas (an upgrade of a described champion). */
  backdrop?: React.ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ id: number; points: number[] } | null>(null);
  const frame = useRef<number | null>(null);
  const size = useRef(0);

  const draw = useCallback(() => {
    frame.current = null;
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx || size.current === 0) return;
    const dpr = element.width / size.current;
    const scale = (size.current * dpr) / STROKE_GRID;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, element.width, element.height);
    if (below.length > 0) {
      ctx.fillStyle = DRAWING_CANVAS_HEX;
      ctx.fillRect(0, 0, element.width, element.height);
      paint(ctx, below, scale);
      // Fade the old drawing toward the canvas colour; new strokes go on top at full strength.
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = DRAWING_CANVAS_HEX;
      ctx.fillRect(0, 0, element.width, element.height);
      ctx.globalAlpha = 1;
    }
    paint(ctx, strokes, scale);
    const current = live.current;
    if (current) paint(ctx, [{ c: ink as Stroke["c"], w: 1, p: current.points }], scale);
  }, [below, strokes, ink]);

  const drawRef = useRef(draw);
  useLayoutEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  const schedule = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  // Size the backing store to the element at device resolution.
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => {
      const width = element.clientWidth;
      if (width === 0) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      size.current = width;
      element.width = Math.round(width * dpr);
      element.height = Math.round(width * dpr);
      drawRef.current();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Redraw whenever the strokes, the layers below or the ink change.
  useEffect(() => {
    schedule();
  }, [draw, schedule]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const toGrid = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * STROKE_GRID,
      ((event.clientY - rect.top) / rect.height) * STROKE_GRID,
    ];
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = live.current;
    if (!current || current.id !== event.pointerId) return;
    live.current = null;
    const p = simplifyStroke(current.points);
    if (p.length >= 2) onStroke({ c: ink as Stroke["c"], w: 1, p });
    schedule();
  };

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-edge shadow-sm" style={{ background: DRAWING_CANVAS_HEX }}>
      {backdrop && strokes.length === 0 && below.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-25">{backdrop}</div>
      )}
      <canvas
        ref={canvas}
        aria-label="Drawing canvas"
        className={`absolute inset-0 size-full touch-none select-none ${disabled ? "opacity-60" : "cursor-crosshair"}`}
        onPointerDown={(event) => {
          if (disabled || !event.isPrimary || live.current) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          live.current = { id: event.pointerId, points: toGrid(event) };
          schedule();
        }}
        onPointerMove={(event) => {
          const current = live.current;
          if (!current || current.id !== event.pointerId) return;
          // Coalesced events keep fast strokes smooth on phones that batch pointer moves.
          const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
          if (samples.length > 0) {
            const rect = event.currentTarget.getBoundingClientRect();
            for (const sample of samples) {
              current.points.push(
                ((sample.clientX - rect.left) / rect.width) * STROKE_GRID,
                ((sample.clientY - rect.top) / rect.height) * STROKE_GRID,
              );
            }
          } else current.points.push(...toGrid(event));
          schedule();
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
    </div>
  );
}

/** The six inks and the eraser. */
export function InkPicker({ ink, onInk }: { ink: number; onInk: (index: number) => void }) {
  return (
    <fieldset className="m-0 flex min-w-0 items-center justify-between gap-1.5 border-0 px-1 py-0">
      <legend className="sr-only">Ink</legend>
      {PHONE_PALETTE.map((entry) => {
        const on = entry.index === ink;
        const eraser = entry.index === ERASER_INDEX;
        return (
          <button
            key={entry.index}
            type="button"
            aria-pressed={on}
            aria-label={entry.label}
            onClick={() => onInk(entry.index)}
            className={`grid size-11 cursor-pointer place-items-center rounded-full transition-transform ${on ? "scale-110 ring-[3px] ring-ink ring-offset-2 ring-offset-canvas" : ""}`}
            style={{ background: eraser ? "transparent" : entry.hex }}
          >
            {eraser && (
              <svg viewBox="0 0 24 24" className="size-7 text-ink" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
                <path d="m7 21-4-4 11-11 7 7-7 8z" fill={DRAWING_CANVAS_HEX} />
                <path d="M3 17 9 11" />
                <path d="M7 21h13" strokeLinecap="round" />
              </svg>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
