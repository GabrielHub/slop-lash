"use client";

/** Casino cream: the chip's spots, inlay and lettering, a fixed art colour. */
const CREAM = "#f6efe0";

/**
 * The bet chip, drawn to read as a casino chip on a 400 px card: a punch-red
 * disc with six wide cream edge spots, a dark seam, then a face with a cream
 * inlay ring and a big "BET". `spin` turns the spots (degrees) so a resting
 * chip can still look alive.
 */
export function BetChip({ size, spin = 0 }: { size: number; spin?: number }) {
  const body = "var(--punch)";
  const seam = "color-mix(in srgb, var(--punch) 58%, #1a0710)";
  return (
    <div
      className="relative rounded-full"
      style={{
        width: size,
        height: size,
        background: `repeating-conic-gradient(from ${spin}deg, ${body} 0deg 36deg, ${CREAM} 36deg 60deg)`,
        boxShadow: `inset 0 0 0 ${size * 0.028}px ${seam}, 0 ${size * 0.06}px 0 ${seam}, 0 ${size * 0.16}px ${size * 0.22}px -${size * 0.06}px rgba(0,0,0,0.45)`,
      }}
    >
      <div
        className="absolute grid place-items-center rounded-full"
        style={{
          inset: size * 0.19,
          background: body,
          boxShadow: `0 0 0 ${size * 0.026}px ${seam}, inset 0 0 0 ${size * 0.03}px ${CREAM}`,
        }}
      >
        <span
          className="font-display font-black leading-none"
          style={{ fontSize: size * 0.25, color: CREAM, letterSpacing: "-0.01em", transform: "translateY(3%)" }}
        >
          BET
        </span>
      </div>
    </div>
  );
}
