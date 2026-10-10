"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE, STAMP_IMPACT_MS, stamp } from "@/lib/animations";

export type StampTone = "punch" | "teal" | "gold" | "win" | "fail" | "ink";
export type StampSize = "sm" | "md" | "lg" | "xl";

const TONE: Record<StampTone, string> = {
  punch: "text-punch",
  teal: "text-teal",
  gold: "text-gold",
  win: "text-win",
  fail: "text-fail",
  ink: "text-ink",
};

const SIZE: Record<StampSize, string> = {
  sm: "text-sm",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-5xl",
};

/** Worn rubber: a fixed noise mask takes a little ink out of the stamp. */
const WORN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.7 1.75'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E\")";

const FACE: CSSProperties = {
  padding: "0.42em 0.8em 0.36em",
  border: "0.14em solid currentColor",
  borderRadius: "0.2em",
  outline: "0.045em solid currentColor",
  outlineOffset: "-0.3em",
  background: "color-mix(in srgb, currentColor 9%, transparent)",
  maskImage: WORN,
  WebkitMaskImage: WORN,
  maskSize: "180px 180px",
  WebkitMaskSize: "180px 180px",
};

/** The impact ring at rest: invisible, at the scale its throw ends on. */
const RING_REST = { opacity: 0, scale: 1.35 };

/**
 * A rubber stamp that slams down when `show` turns true: it winds in big and
 * over-tilted, lands on its resting `tilt` about STAMP_IMPACT_MS later (where
 * its sound belongs), and throws one ring outward on impact. Colours come from
 * the theme through currentColor, so it reads in either theme. The words stay
 * in the DOM; the stamp never carries a verdict by motion alone.
 */
export function Stamp({
  children,
  tone = "punch",
  tilt = -3,
  size = "md",
  show = true,
  className = "",
}: {
  children: ReactNode;
  tone?: StampTone;
  /** Resting rotation in degrees. See ACCENT for each game's. */
  tilt?: number;
  size?: StampSize;
  show?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className={`relative inline-flex items-center justify-center whitespace-nowrap font-display font-black uppercase leading-none tracking-[0.12em] ${TONE[tone]} ${SIZE[size]} ${className}`}
      variants={stamp(tilt)}
      initial="hidden"
      animate={show ? "visible" : "hidden"}
    >
      <span className="block" style={FACE}>
        {children}
      </span>
      {/*
        Always rendered, and its resting target is the throw's last frame, so the
        server and a reduced-motion client draw the same invisible ring (a scene
        mounted with initial={false} renders the target, not `initial`). Only
        animated when it lands.
      */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ border: "0.14em solid currentColor", borderRadius: "0.2em" }}
        initial={{ opacity: 0, scale: 1 }}
        animate={show && !reduced ? { opacity: [0, 0.6, 0], scale: [1, 1, 1.35] } : RING_REST}
        transition={{
          delay: STAMP_IMPACT_MS / 1000,
          duration: 0.45,
          times: [0, 0.04, 1],
          ease: EASE.out,
        }}
      />
    </motion.span>
  );
}
