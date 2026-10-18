"use client";

// Text in the world. Two kinds:
//
// - StageText: SDF text (drei <Text>, troika) in Fredoka, lit by the rig and
//   shadowed (flat for self-lit signs and camera-fixed overlays), with a
//   tinted outline (never black). For marquees, scoreboards, cards and
//   labels. Readable from 3 m at 1080p at size >= 0.12.
// - TitleText: an extruded, bevelled title built from the same font's
//   outlines (font-geometry.ts): faces in one colour, sides in a darker one,
//   an ink outline. For slams and the champion's name. If the font cannot be
//   read it falls back to a flat StageText title instead of failing the stage.
//
// OnPlane places children on a set's text-plane marker (Marquee_Text,
// Scoreboard_Text, Easel_N_Canvas): its local XY plane, facing +Z.

import { Text } from "@react-three/drei";
import { useLoader, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, type ReactNode, type Ref } from "react";
import { Color, DoubleSide, FileLoader, Loader, type LoadingManager } from "three";
import type { PlaneNode } from "../arena/nodes";
import { StageBoundary } from "../boundary";
import { createOutlineMaterial } from "../look/outline";
import { createToonMaterial } from "../look/toon";
import { createTitleGeometry, parseWoff, type WoffFont } from "./font-geometry";
import { sanitizeStageText } from "./sanitize";

export { sanitizeStageText };

export const FONT_BOLD = "/fonts/slopfight/fredoka-latin-700-normal.woff";
export const FONT_SEMIBOLD = "/fonts/slopfight/fredoka-latin-600-normal.woff";

/** Characters preloaded into the SDF atlas, so the first title does not hitch. */
export const TITLE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,:'-&#/ ";

/** Darken a colour toward a warm ink (outlines are never pure black). */
export function inkOf(color: string, amount = 0.72): string {
  return new Color(color).lerp(new Color("#1d1418"), amount).getStyle();
}

type GroupProps = ThreeElements["group"];

export interface StageTextProps extends Omit<GroupProps, "children"> {
  children: string;
  /** Em size in world units. */
  size?: number;
  color?: string;
  /** Outline colour (defaults to a dark version of `color`). */
  outlineColor?: string;
  /** Outline width as a fraction of the size. */
  outline?: number;
  /** Self-glow 0..1; 0 is purely lit. */
  glow?: number;
  /** Flat colour that the rig never touches (a self-lit sign); ignores `glow`. Overlay text is always unlit. */
  unlit?: boolean;
  maxWidth?: number;
  anchorX?: "left" | "center" | "right";
  anchorY?: "top" | "middle" | "bottom";
  textAlign?: "left" | "center" | "right";
  weight?: 600 | 700;
  letterSpacing?: number;
  lineHeight?: number;
  castShadow?: boolean;
  /** Draw on top of the set, unfogged and unlit (camera-fixed captions). */
  overlay?: boolean;
  /** Fill and outline opacity 0..1. */
  opacity?: number;
  /** The troika text mesh (e.g. to animate `clipRect` without a re-layout). */
  textRef?: Ref<TroikaTextMesh>;
  /** Called when the text has been laid out (its `textRenderInfo` is ready). */
  onSync?: (mesh: TroikaTextMesh) => void;
  /** Render order of the text mesh. */
  renderOrder?: number;
  /** Wrapping: "normal" wraps at maxWidth, "nowrap" never wraps. */
  whiteSpace?: "normal" | "nowrap";
}

/** The parts of troika's Text mesh the kit touches. */
export interface TroikaTextMesh {
  clipRect: [number, number, number, number] | null;
  textRenderInfo: { blockBounds: [number, number, number, number] } | null;
  fillOpacity: number;
  outlineOpacity: number;
  visible: boolean;
}

/**
 * Marquee letters: self-lit and flat, so the rig never dims them, with no
 * outline (on the dark board an ink outline is lighter than the board, a grey
 * halo that blurs the letters).
 */
export const MARQUEE_TEXT = { unlit: true, outline: 0, castShadow: false } as const;

/** Lit, shadowed SDF text. Suspends while the font loads. Text is sanitized (sanitizeStageText). */
export function StageText({
  children,
  size = 0.3,
  color = "#fff4dc",
  outlineColor,
  outline = 0.06,
  glow = 0,
  unlit = false,
  maxWidth,
  anchorX = "center",
  anchorY = "middle",
  textAlign = "center",
  weight = 700,
  letterSpacing = 0.01,
  lineHeight = 1.05,
  castShadow = true,
  overlay = false,
  opacity = 1,
  textRef,
  onSync,
  renderOrder,
  whiteSpace,
  ...group
}: StageTextProps) {
  const text = useMemo(() => sanitizeStageText(children), [children]);
  const material = {
    attach: "material",
    color,
    transparent: overlay || opacity < 1,
    depthTest: !overlay,
    depthWrite: !overlay,
    fog: !overlay,
  } as const;
  return (
    <group {...group}>
      <Text
        ref={textRef}
        onSync={onSync}
        renderOrder={renderOrder}
        whiteSpace={whiteSpace}
        fillOpacity={opacity}
        outlineOpacity={opacity}
        font={weight === 700 ? FONT_BOLD : FONT_SEMIBOLD}
        characters={TITLE_CHARACTERS}
        fontSize={size}
        maxWidth={maxWidth}
        anchorX={anchorX}
        anchorY={anchorY}
        textAlign={textAlign}
        letterSpacing={letterSpacing}
        lineHeight={lineHeight}
        outlineWidth={outline > 0 ? size * outline : 0}
        outlineColor={outlineColor ?? inkOf(color)}
        outlineBlur={size * 0.004}
        castShadow={castShadow && !overlay}
        receiveShadow={!overlay}
      >
        {text}
        {unlit || overlay ? (
          <meshBasicMaterial {...material} />
        ) : (
          <meshStandardMaterial {...material} roughness={0.55} metalness={0} emissive={color} emissiveIntensity={glow} shadowSide={DoubleSide} />
        )}
      </Text>
    </group>
  );
}

/** A three.js Loader for WOFF fonts, so R3F's useLoader caches and suspends on it. */
export class WoffFontLoader extends Loader<WoffFont> {
  constructor(manager?: LoadingManager) {
    super(manager);
  }

  load(url: string, onLoad: (font: WoffFont) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    const loader = new FileLoader(this.manager);
    loader.setResponseType("arraybuffer");
    loader.setPath(this.path);
    loader.load(
      url,
      (data) => {
        let font: WoffFont;
        try {
          font = parseWoff(data as ArrayBuffer);
        } catch (error) {
          if (onError) onError(error);
          else console.error(error);
          this.manager.itemError(url);
          return;
        }
        onLoad(font);
      },
      onProgress,
      onError,
    );
  }
}

/**
 * The parsed title font (suspends the first time; throws if it cannot be
 * loaded or read, so render it under a StageBoundary or use TitleText).
 */
export function useTitleFont(url = FONT_BOLD): WoffFont {
  return useLoader(WoffFontLoader, url);
}

export interface TitleTextProps extends Omit<GroupProps, "children"> {
  text: string;
  /** Cap height, world units. */
  size?: number;
  faceColor?: string;
  sideColor?: string;
  outlineColor?: string;
  /** Outline width in pixels at 1080p (0 for none). */
  outlineWidth?: number;
  /** Self-glow on the faces 0..1, so a title never sinks into shadow. */
  glow?: number;
  /** Called with the built title's width (world units, before the group's scale). */
  onLayout?: (width: number, height: number) => void;
  castShadow?: boolean;
}

/**
 * An extruded, bevelled title. Suspends while the font loads. If the font
 * fails to load or parse, it shows the same words as flat SDF text.
 */
export function TitleText(props: TitleTextProps) {
  return (
    <StageBoundary label="title font" fallback={<FlatTitle {...props} />}>
      <ExtrudedTitle {...props} />
    </StageBoundary>
  );
}

/** TitleText's fallback: the title as lit SDF text at the same cap height. */
function FlatTitle({
  text,
  size = 1,
  faceColor = "#fff4dc",
  sideColor = "#8a2a1e",
  outlineColor,
  outlineWidth: _outlineWidth,
  glow = 0.18,
  onLayout,
  castShadow = true,
  ...group
}: TitleTextProps) {
  const em = size / 0.7;
  // Rough Fredoka metrics (as fitTextSize); the slam only needs the scale to fit the screen.
  const width = Math.max(1, Array.from(sanitizeStageText(text)).length) * 0.58 * em;
  useEffect(() => onLayout?.(width, size), [onLayout, width, size]);
  return (
    <StageText
      {...group}
      size={em}
      color={faceColor}
      outlineColor={outlineColor ?? inkOf(sideColor, 0.55)}
      outline={0.07}
      glow={glow}
      castShadow={castShadow}
    >
      {text}
    </StageText>
  );
}

function ExtrudedTitle({
  text,
  size = 1,
  faceColor = "#fff4dc",
  sideColor = "#8a2a1e",
  outlineColor,
  outlineWidth = 3,
  glow = 0.18,
  onLayout,
  castShadow = true,
  ...group
}: TitleTextProps) {
  const font = useTitleFont();
  const title = useMemo(() => createTitleGeometry(font, sanitizeStageText(text), { size }), [font, text, size]);
  const materials = useMemo(() => {
    // A near-white face lit by the whole rig would cross the bloom threshold
    // (bloom is for emissives); a slightly darker albedo keeps it crisp.
    const albedo = new Color(faceColor).multiplyScalar(0.7);
    const face = createToonMaterial({ vertexColors: false, color: albedo, emissive: faceColor, rim: 0.3, specular: 0.3 });
    face.emissiveIntensity = glow;
    const side = createToonMaterial({ vertexColors: false, color: sideColor, emissive: sideColor, rim: 0.2 });
    side.emissiveIntensity = glow * 0.6;
    return [face, side];
  }, [faceColor, sideColor, glow]);
  const outline = useMemo(
    () => (outlineWidth > 0 ? createOutlineMaterial({ color: outlineColor ?? inkOf(sideColor, 0.55), width: outlineWidth }) : null),
    [outlineColor, sideColor, outlineWidth],
  );

  useEffect(() => () => title.geometry.dispose(), [title]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  useEffect(() => () => outline?.dispose(), [outline]);
  useEffect(() => onLayout?.(title.width, title.height), [onLayout, title]);

  return (
    <group {...group}>
      <mesh geometry={title.geometry} material={materials} castShadow={castShadow} receiveShadow />
      {outline && <mesh geometry={title.geometry} material={outline} />}
    </group>
  );
}

/** The em size that fits `text` on one line within `width` (rough Fredoka metrics), capped at `maxSize`. */
export function fitTextSize(text: string, width: number, maxSize: number): number {
  const ems = Math.max(1, text.length) * 0.58;
  return Math.min(maxSize, width / ems);
}

/** Children on a set's text plane (its local XY plane, facing +Z), nudged off the surface. */
export function OnPlane({ plane, offset = 0.012, children }: { plane: PlaneNode; offset?: number; children: ReactNode }) {
  const position = useMemo(
    () => plane.position.clone().addScaledVector(plane.normal, offset),
    [plane, offset],
  );
  return (
    <group position={position} quaternion={plane.quaternion}>
      {children}
    </group>
  );
}
