"use client";

// People and names in the scene: <AvatarToken> (a player's avatar as a
// chunky token that can be tossed along an arc and lands with a bounce),
// <NamePlate> (a plaque with a name, an optional sub-line and avatar) and
// <FaceCamera> (turns its children toward the camera every frame).

import { useFrame } from "@react-three/fiber";
import { Suspense, useRef, type ReactNode } from "react";
import { Quaternion, Vector3, type Group, type Vector3Tuple } from "three";
import { getPlayerColor } from "@/lib/player-colors";
import type { SfxName } from "../../audio";
import { useStage } from "../services";
import { discGeometry, slabGeometry } from "./geometry";
import { darkOf, lightOf, nearestToy, toyHex, UI_COLORS, uiOutline, uiToon } from "./materials";
import { MotionGroup, type MotionBeat, type MotionGroupProps } from "./motion-group";
import { stageSfx } from "./sound";
import { fitTextSize, StageText } from "./text";

const tmpWorld = new Vector3();
const tmpCamera = new Vector3();
const tmpParent = new Quaternion();
const tmpQ = new Quaternion();

/**
 * Turns its children to face the camera every frame: `mode="yaw"` (default)
 * keeps them upright and turns them about Y; `"full"` faces the camera
 * squarely (health bars). `amount` < 1 turns only part of the way.
 */
export function FaceCamera({ mode = "yaw", amount = 1, children, position }: { mode?: "yaw" | "full"; amount?: number; children?: ReactNode; position?: Vector3Tuple }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const group = ref.current;
    if (!group || !group.parent) return;
    const camera = state.camera;
    group.parent.getWorldQuaternion(tmpParent);
    if (mode === "full") {
      tmpQ.copy(tmpParent).invert().multiply(camera.quaternion);
    } else {
      group.getWorldPosition(tmpWorld);
      camera.getWorldPosition(tmpCamera);
      const yaw = Math.atan2(tmpCamera.x - tmpWorld.x, tmpCamera.z - tmpWorld.z);
      tmpQ.setFromAxisAngle(Y_AXIS, yaw);
      tmpQ.premultiply(tmpParent.invert());
    }
    if (amount >= 1) group.quaternion.copy(tmpQ);
    else group.quaternion.identity().slerp(tmpQ, amount);
  }, 0.55);
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

const Y_AXIS = new Vector3(0, 1, 0);

/** A player's colour on the TV: their phone colour, moved to the nearest toy colour. */
export function playerTokenColor(name: string): string {
  return toyHex(nearestToy(getPlayerColor(name)));
}

/** The token's letter: the first drawable character of the name. */
export function tokenInitial(name: string): string {
  const match = name.normalize("NFKD").match(/[A-Za-z0-9]/);
  return (match?.[0] ?? "?").toUpperCase();
}

export interface AvatarTokenProps extends Omit<MotionGroupProps, "children" | "onBeat"> {
  name: string;
  /** Override the colour (defaults to the player's). */
  color?: string;
  radius?: number;
  thickness?: number;
  /** Turn toward the camera (default true). */
  faceCamera?: boolean;
  /** Sound on landing (live rooms only); null for none. */
  landSound?: SfxName | null;
  onBeat?: (beat: MotionBeat) => void;
  children?: ReactNode;
}

/** A chunky disc token in the player's colour with their initial; tosses along arcs and bounces on landing. */
export function AvatarToken({
  name,
  color,
  radius = 0.16,
  thickness,
  faceCamera = true,
  landSound = "tap",
  onBeat,
  children,
  enter = "pop",
  ...motion
}: AvatarTokenProps) {
  const services = useStage();
  const base = color ?? playerTokenColor(name);
  const depth = thickness ?? radius * 0.42;
  const disc = discGeometry(radius, depth);
  const face = discGeometry(radius * 0.74, depth * 0.3);
  const letter = tokenInitial(name);
  const content = (
    <>
      <mesh geometry={disc} material={uiToon(base, { glow: 0.1, specular: 0.45 })} castShadow />
      <mesh geometry={disc} material={uiOutline(base, 2.2)} />
      <mesh geometry={face} material={uiToon(lightOf(base, 0.78), { glow: 0.12 })} position={[0, 0, depth * 0.42]} />
      <Suspense fallback={null}>
        <StageText
          size={radius * 1.05}
          color={darkOf(base, 0.25)}
          outline={0}
          glow={0.1}
          position={[0, -radius * 0.04, depth * 0.6]}
          castShadow={false}
        >
          {letter}
        </StageText>
      </Suspense>
      {children}
    </>
  );
  return (
    <MotionGroup
      enter={enter}
      {...motion}
      onBeat={(beat) => {
        if (beat === "land" && landSound) stageSfx(services).play(landSound, { intensity: 0.3, gain: 0.6 });
        onBeat?.(beat);
      }}
    >
      {faceCamera ? <FaceCamera>{content}</FaceCamera> : content}
    </MotionGroup>
  );
}

export interface NamePlateProps extends Omit<MotionGroupProps, "children" | "onBeat"> {
  name: string;
  /** A smaller second line ("House champion", "Waiting..."). */
  sub?: string | null;
  /** The plate's accent (left strip and edge). */
  color?: string;
  /** Show this player's avatar token at the left end. */
  avatar?: string | null;
  width?: number;
  height?: number;
  /** Dim (an empty seat, a waiting state). */
  dim?: boolean;
  faceCamera?: boolean;
  sound?: boolean;
  onBeat?: (beat: MotionBeat) => void;
  children?: ReactNode;
}

/** A plaque with a name (and a sub-line), lit like a prop. Pops in by default. */
export function NamePlate({
  name,
  sub = null,
  color = UI_COLORS.gold,
  avatar = null,
  width = 1.3,
  height = 0.36,
  dim = false,
  faceCamera = false,
  sound = true,
  onBeat,
  children,
  enter = "pop",
  ...motion
}: NamePlateProps) {
  const services = useStage();
  const depth = 0.06;
  const geometry = slabGeometry(width, height, depth, height * 0.28);
  const stock = dim ? "#cdbfa8" : UI_COLORS.card;
  const tokenSpace = avatar ? height * 0.95 : 0;
  const textWidth = width - tokenSpace - height * 0.35;
  const nameSize = fitTextSize(name, textWidth, sub ? height * 0.36 : height * 0.48);
  const subSize = Math.min(height * 0.2, nameSize * 0.62);
  const textX = -width / 2 + tokenSpace + height * 0.2 + textWidth / 2;
  const content = (
    <>
      <mesh geometry={geometry} material={[uiToon(stock, { glow: 0.08 }), uiToon(dim ? "#9c8f7a" : darkOf(color, 0.2))]} castShadow receiveShadow />
      <mesh geometry={geometry} material={uiOutline(dim ? "#9c8f7a" : color, 2.2)} />
      {/* The accent strip along the bottom edge. */}
      <mesh
        geometry={slabGeometry(width - height * 0.3, height * 0.12, 0.012, height * 0.06)}
        material={uiToon(dim ? "#b8aa93" : color, { glow: 0.14 })}
        position={[0, -height / 2 + height * 0.14, depth / 2 + 0.002]}
      />
      {avatar && <AvatarTokenStatic name={avatar} radius={height * 0.36} position={[-width / 2 + height * 0.55, 0.01, depth / 2 + 0.02]} />}
      <Suspense fallback={null}>
        <StageText
          size={nameSize}
          color={dim ? UI_COLORS.inkDim : UI_COLORS.ink}
          outline={0}
          glow={0.08}
          maxWidth={textWidth}
          position={[textX, sub ? height * 0.1 : height * 0.03, depth / 2 + 0.006]}
          castShadow={false}
        >
          {name}
        </StageText>
        {sub && (
          <StageText size={subSize} color={UI_COLORS.inkDim} outline={0} glow={0.06} position={[textX, -height * 0.16, depth / 2 + 0.006]} castShadow={false}>
            {sub}
          </StageText>
        )}
      </Suspense>
      {children}
    </>
  );
  return (
    <MotionGroup
      enter={enter}
      {...motion}
      onBeat={(beat) => {
        if (sound && beat === "land") stageSfx(services).play("tap", { intensity: 0.3, gain: 0.5 });
        onBeat?.(beat);
      }}
    >
      {faceCamera ? <FaceCamera>{content}</FaceCamera> : content}
    </MotionGroup>
  );
}

/** A token without its own motion (inside a plate or a card). */
export function AvatarTokenStatic({ name, color, radius = 0.12, position }: { name: string; color?: string; radius?: number; position?: Vector3Tuple }) {
  const base = color ?? playerTokenColor(name);
  const depth = radius * 0.42;
  const disc = discGeometry(radius, depth);
  return (
    <group position={position}>
      <mesh geometry={disc} material={uiToon(base, { glow: 0.1, specular: 0.45 })} castShadow />
      <mesh geometry={disc} material={uiOutline(base, 1.8)} />
      <mesh geometry={discGeometry(radius * 0.74, depth * 0.3)} material={uiToon(lightOf(base, 0.78), { glow: 0.12 })} position={[0, 0, depth * 0.42]} />
      <Suspense fallback={null}>
        <StageText size={radius * 1.05} color={darkOf(base, 0.25)} outline={0} glow={0.1} position={[0, -radius * 0.04, depth * 0.6]} castShadow={false}>
          {tokenInitial(name)}
        </StageText>
      </Suspense>
    </group>
  );
}
