"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { STROKE_GRID } from "../../constants";
import {
  BRUSH_WIDTH,
  ERASER_WIDTH,
  isEraser,
  MATERIAL_CORE_WIDTH,
  simplifyStroke,
  type Stroke,
} from "../../strokes";
import { DRAWING_CANVAS_HEX, ERASER_INDEX, INKS, MATERIAL_INKS, materialInk, PHONE_PALETTE } from "../../vocab";
import { FinishSwatch } from "./materials";

// The phone's square drawing canvas: pointer events (one finger, no page
// scroll), high-DPI, strokes in the contract's 0..1000 grid. Earlier layers
// (an upgrade's old drawing) paint faded under the strokes being drawn.


/** One round-brush polyline (a dot for a single point). */
function trace(ctx: CanvasRenderingContext2D, p: readonly number[], scale: number, width: number, colour: string) {
  if (p.length === 2) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(p[0]! * scale, p[1]! * scale, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(p[0]! * scale, p[1]! * scale);
  for (let index = 2; index + 1 < p.length; index += 2) ctx.lineTo(p[index]! * scale, p[index + 1]! * scale);
  ctx.stroke();
}

/** The strokes as raster.ts paints them: a material ink gets its bright core down the middle. */
function paint(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[], scale: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.p.length < 2) continue;
    const width = (isEraser(stroke) ? ERASER_WIDTH : BRUSH_WIDTH) * scale;
    trace(ctx, stroke.p, scale, width, INKS[stroke.c]?.hex ?? DRAWING_CANVAS_HEX);
    const material = materialInk(stroke.c);
    if (material) trace(ctx, stroke.p, scale, width * MATERIAL_CORE_WIDTH, material.core);
  }
}

export function DrawingCanvas({
  strokes,
  below = [],
  ink,
  disabled = false,
  onStroke,
  backdrop,
  className = "",
}: {
  strokes: readonly Stroke[];
  /** Earlier layers, painted faded underneath. */
  below?: readonly Stroke[];
  /** A stroke colour index: a flat ink, ERASER_INDEX or a material ink. */
  ink: number;
  disabled?: boolean;
  onStroke: (stroke: Stroke) => void;
  /** Shown faded behind an empty canvas (an upgrade of a described champion). */
  backdrop?: React.ReactNode;
  /** Extra classes for the square, e.g. a max width that fits it to the screen. */
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const material = materialInk(ink);
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
    <div className={`relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-edge shadow-sm [-webkit-touch-callout:none] ${className}`} style={{ background: DRAWING_CANVAS_HEX }}>
      {backdrop && strokes.length === 0 && below.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-25">{backdrop}</div>
      )}
      {material && (
        // Picking a material ink says what it does, then gets out of the way.
        <motion.p
          key={material.index}
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 top-2 z-10 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-surface/95 py-1 pl-1 pr-3 text-sm font-bold text-ink shadow-sm"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: [0, 1, 1, 0], y: 0 }}
          transition={{ duration: 2.8, times: [0, 0.08, 0.8, 1] }}
        >
          <FinishSwatch finish={material.finish} className="size-5" />
          {`Paint it on to make it ${material.label.toLowerCase()}`}
        </motion.p>
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

const INK_ROW = "m-0 grid min-w-0 grid-cols-8 place-items-center gap-1 border-0 p-0";

function InkButton({
  label,
  on,
  onClick,
  background,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  background?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`grid aspect-square w-full max-w-11 cursor-pointer place-items-center rounded-full transition-transform ${
        on ? "scale-110 ring-[3px] ring-ink ring-offset-2 ring-offset-canvas" : ""
      }`}
      style={background ? { background } : undefined}
    >
      {children}
    </button>
  );
}

/**
 * Two rows of eight: the six inks and the eraser, then the seven material
 * inks, each row ending in one of `tools` (undo, clear), so the whole draw
 * screen fits a short phone without scrolling.
 */
export function InkPicker({
  ink,
  onInk,
  tools,
}: {
  ink: number;
  onInk: (index: number) => void;
  tools: readonly [ReactNode, ReactNode];
}) {
  return (
    <div className="flex flex-col gap-2 px-0.5">
      <fieldset className={INK_ROW}>
        <legend className="sr-only">Ink</legend>
        {PHONE_PALETTE.map((entry) => (
          <InkButton
            key={entry.index}
            label={entry.label}
            on={entry.index === ink}
            onClick={() => onInk(entry.index)}
            background={entry.index === ERASER_INDEX ? undefined : entry.hex}
          >
            {entry.index === ERASER_INDEX && (
              <svg viewBox="0 0 24 24" className="size-7 text-ink" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
                <path d="m7 21-4-4 11-11 7 7-7 8z" fill={DRAWING_CANVAS_HEX} />
                <path d="M3 17 9 11" />
                <path d="M7 21h13" strokeLinecap="round" />
              </svg>
            )}
          </InkButton>
        ))}
        {tools[0]}
      </fieldset>
      <fieldset className={INK_ROW}>
        <legend className="sr-only">Material inks: what you paint is made of it</legend>
        {MATERIAL_INKS.map((entry) => (
          <InkButton
            key={entry.index}
            label={`${entry.label} ink`}
            on={entry.index === ink}
            onClick={() => onInk(entry.index)}
          >
            <FinishSwatch finish={entry.finish} className="size-full" />
          </InkButton>
        ))}
        {tools[1]}
      </fieldset>
    </div>
  );
}

/** A round tool at the end of an ink row. */
export function InkTool({
  label,
  onClick,
  disabled,
  armed = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  /** Waiting for a confirming second tap. */
  armed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid aspect-square w-full max-w-11 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        armed ? "bg-fail text-white" : "bg-raised text-ink"
      }`}
    >
      {children}
    </button>
  );
}
