"use client";

// <Card>: a rounded, slightly thick cardstock/vinyl slab lit by the rig, with
// an SDF title and body and room for any content on its face (move rows,
// pips, chips). It moves with the kit's motion language (MotionGroup):
// `enter="rise"` (up from the floor), `"drop"` (down from the rig on a cable),
// `"pop"`, a fly-to when `position` changes, and `leaving` flicks it off.
//
//   <Card position={[x, 1, z]} width={1.3} height={0.8} enter="drop" cable={3}
//         title="Leaf blower is useless underwater" body="Strike -1" accent="#2f6fb0" />
//
// Layout is in card-local units: origin at the card's centre, face at
// z = depth / 2 (use `faceZ(depth)` for children).
//
// `overlay={order}` draws it over the set from render order `order` up (a
// camera-fixed card: the face-off's spotlight), writing depth so depth of
// field keeps it sharp; no cable or shadows then.

import { Suspense, type ReactNode } from "react";
import { useStage } from "../services";
import { cableGeometry, slabGeometry } from "./geometry";
import { darkOf, isLightColor, textGlowOn, textOn, UI_COLORS, uiOutline, uiToon } from "./materials";
import { MotionGroup, type MotionBeat, type MotionGroupProps } from "./motion-group";
import { stageSfx } from "./sound";
import { fitTextSize, StageText } from "./text";

export interface CardProps extends Omit<MotionGroupProps, "children" | "onBeat"> {
  width?: number;
  height?: number;
  /** Slab thickness. */
  depth?: number;
  radius?: number;
  /** Card stock colour. */
  color?: string;
  /** A band of colour across the top (the title strip) and the edge tint. */
  accent?: string | null;
  /** The band's height (default min(height * 0.3, 0.2): one line of title). Give two-line titles a taller band. */
  bandHeight?: number;
  title?: string | null;
  body?: string | null;
  titleColor?: string;
  bodyColor?: string;
  /** Title em size (default fits the width, at most height * 0.16). */
  titleSize?: number;
  bodySize?: number;
  /** Hang from a cable this long (world units) above the card's top edge. */
  cable?: number;
  /** Outline width in px at 1080p (0 for none). */
  outline?: number;
  /** Self-glow on the stock so it never sinks into shadow (0..1). */
  glow?: number;
  /** Play the kit's default sounds for its beats (live rooms only). Default true. */
  sound?: boolean;
  /** Draw over the set (camera-fixed), from this render order up (it takes the next 4). */
  overlay?: number;
  onBeat?: (beat: MotionBeat) => void;
  /** Content on the face, in card-local units (face at z = depth / 2). */
  children?: ReactNode;
}

/** The face plane's z for a card of this thickness (children sit just above it). */
export const faceZ = (depth = 0.04) => depth / 2 + 0.004;

/** The default sound for each card beat. */
export function cardBeatSound(services: Parameters<typeof stageSfx>[0], enter: string, beat: MotionBeat) {
  const sfx = stageSfx(services);
  if (beat === "start" && (enter === "rise" || enter === "drop")) sfx.play("wipe", { intensity: 0.2, gain: 0.35 });
  if (beat === "land") sfx.play(enter === "drop" ? "boing" : "tap", { intensity: 0.35, gain: 0.55 });
  if (beat === "gone") sfx.play("trickWhiff", { intensity: 0.2, gain: 0.4 });
}

export function Card({
  width = 1.2,
  height = 0.8,
  depth = 0.045,
  radius,
  color = UI_COLORS.card,
  accent = null,
  bandHeight,
  title,
  body,
  titleColor,
  bodyColor = UI_COLORS.ink,
  titleSize,
  bodySize,
  cable = 0,
  outline = 2.4,
  glow = 0.08,
  sound = true,
  overlay,
  onBeat,
  children,
  enter = "pop",
  ...motion
}: CardProps) {
  const over = overlay !== undefined;
  const order = overlay ?? 0;
  const look = { overlay: over, depthWrite: over };
  const services = useStage();
  const r = radius ?? Math.min(width, height) * 0.09;
  const geometry = slabGeometry(width, height, depth, r);
  const edge = accent ? darkOf(accent, 0.25) : UI_COLORS.cardEdge;
  const z = faceZ(depth);
  const band = accent && title ? (bandHeight ?? Math.min(height * 0.3, 0.2)) : 0;
  const tSize = titleSize ?? (title ? fitTextSize(title, width * 0.86, Math.min(height * 0.16, 0.16)) : 0);
  const titleY = band ? height / 2 - band / 2 - 0.012 : height / 2 - tSize * 0.9 - 0.04;
  const bSize = bodySize ?? Math.min(0.1, height * 0.12);
  // The body is centred in the space under the title.
  const titleBottom = title ? titleY - (band || tSize) / 2 - 0.02 : height / 2;
  const bodyY = (titleBottom + (-height / 2 + 0.04)) / 2;

  return (
    <MotionGroup
      enter={enter}
      hanging={cable > 0}
      {...motion}
      onBeat={(beat) => {
        if (sound) cardBeatSound(services, enter, beat);
        onBeat?.(beat);
      }}
    >
      {cable > 0 && !over && (
        <mesh geometry={cableGeometry(0.008)} material={uiToon("#3b3a40", { glow: 0 })} position={[0, height / 2 - 0.02, 0]} scale={[1, cable, 1]} />
      )}
      <mesh
        geometry={geometry}
        material={[uiToon(color, { glow, ...look }), uiToon(edge, { glow: glow * 0.5, ...look })]}
        castShadow={!over}
        receiveShadow={!over}
        renderOrder={order + 1}
      />
      {outline > 0 && <mesh geometry={geometry} material={uiOutline(accent ?? UI_COLORS.cardEdge, outline, { overlay: over })} renderOrder={order} />}
      {band > 0 && accent && (
        <mesh
          geometry={slabGeometry(width - 0.05, band, 0.012, Math.min(r * 0.8, band / 2))}
          material={uiToon(accent, { glow: 0.12, ...look })}
          position={[0, height / 2 - band / 2 - 0.025, z - 0.002]}
          renderOrder={order + 2}
        />
      )}
      <Suspense fallback={null}>
        {title && (
          <StageText
            position={[0, titleY, z + 0.008]}
            size={tSize}
            color={titleColor ?? (band && accent ? textOn(accent) : UI_COLORS.ink)}
            outlineColor={band && accent ? darkOf(accent, 0.55) : undefined}
            outline={band && accent && !isLightColor(accent) ? 0.05 : 0}
            glow={band && accent ? textGlowOn(accent) : 0.12}
            maxWidth={width * 0.9}
            castShadow={false}
            overlay={over}
            renderOrder={over ? order + 3 : undefined}
          >
            {title}
          </StageText>
        )}
        {body && (
          <StageText
            position={[0, bodyY, z + 0.006]}
            size={bSize}
            color={bodyColor}
            outline={0}
            glow={0.1}
            maxWidth={width * 0.86}
            lineHeight={1.12}
            castShadow={false}
            overlay={over}
            renderOrder={over ? order + 3 : undefined}
          >
            {body}
          </StageText>
        )}
      </Suspense>
      {children}
    </MotionGroup>
  );
}
