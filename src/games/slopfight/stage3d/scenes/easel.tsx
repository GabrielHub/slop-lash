"use client";

// One player's easel at Build (and at an upgrade):
// - DRAW: the strokes appear live on the canvas as the phone sends them,
//   painted with the forge's brush (doodle-texture.ts); an upgrade shows its
//   new layer over the faded drawing.
// - DESCRIBE: a notepad with the typing shimmer (lines filling in, a pen
//   bobbing, three dots) while the player types.
// - The player's avatar token sits on the easel's leg; their name is on a
//   plate on the top bar.
// - When the drawing goes to the Foundry it peels off the canvas and flies up
//   to the rig (the Foundry catches it over the pedestal).
// - REJECTED: a friendly "Back to the drawing board" card drops onto the easel.
// - House champions have no easel: the easel prop is hidden.

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { PlaneGeometry, type Group, type Mesh } from "three";
import type { EaselNodes } from "../arena/nodes";
import { useStage } from "../services";
import { Card } from "../ui3d/card";
import { slabGeometry } from "../ui3d/geometry";
import { UI_COLORS, uiToon } from "../ui3d/materials";
import { clamp01, easeInCubic, ringDown } from "../ui3d/motion";
import { stageSfx } from "../ui3d/sound";
import { OnPlane, StageText } from "../ui3d/text";
import { AvatarToken, NamePlate } from "../ui3d/tokens";
import { fighterColor } from "./common";
import { createDoodleMaterial } from "./doodle-material";
import type { DoodleRaster } from "./doodle-texture";
import type { SceneFighter } from "./scene-data";

/** Typing counts as "now" for this long after the last keystroke. */
const TYPING_FRESH_MS = 2_500;

export interface EaselProps {
  fighter: SceneFighter;
  easel: EaselNodes;
  doodle: DoodleRaster | null;
  /** The drawing has gone to the Foundry (peel it off and leave a faint ghost). */
  lifted: boolean;
  /** Seconds to wait before the token and plate pop in (stagger). */
  delay?: number;
}

export function Easel({ fighter, easel, doodle, lifted, delay = 0 }: EaselProps) {
  const plane = easel.canvas;
  const color = fighterColor(fighter);
  const describing = fighter.inputKind === "DESCRIBE";
  const rejected = fighter.status === "REJECTED";
  const avatar = easel.avatar;
  if (!plane) return null;
  return (
    <group>
      <OnPlane plane={plane} offset={0.012}>
        {describing ? (
          <TypingPad fighter={fighter} width={plane.width} height={plane.height} />
        ) : (
          <DoodleCanvas doodle={doodle} width={plane.width} height={plane.height} lifted={lifted} />
        )}
        {fighter.ownerName && (
          <NamePlate
            name={fighter.ownerName}
            avatar={null}
            color={color}
            width={Math.min(plane.width * 0.9, 0.95)}
            height={0.22}
            position={[0, plane.height / 2 + 0.2, 0.03]}
            delay={delay + 0.15}
            idle={0.5}
            seed={fighter.slot + 2}
          />
        )}
        {rejected && (
          // Dropped onto the easel with no cable (a cable would cross the owner's
          // name plate), its two-line title on a band tall enough for both lines.
          <Card
            position={[0, -0.03, 0.06]}
            width={plane.width * 0.94}
            height={plane.height * 0.66}
            enter="drop"
            accent={UI_COLORS.tomato}
            bandHeight={0.26}
            title="Back to the drawing board"
            body="Try again on your phone"
            titleSize={0.1}
            bodySize={0.085}
            seed={fighter.slot}
          />
        )}
        {lifted && doodle && <PeelOff doodle={doodle} width={plane.width} height={plane.height} />}
      </OnPlane>
      {avatar && fighter.ownerName && (
        <AvatarToken
          name={fighter.ownerName}
          position={[avatar.position.x, avatar.position.y + 0.02, avatar.position.z]}
          radius={0.15}
          delay={delay}
          seed={fighter.slot + 5}
        />
      )}
    </group>
  );
}

/** The canvas surface with the live doodle (a faint ghost once it has lifted off). */
function DoodleCanvas({ doodle, width, height, lifted }: { doodle: DoodleRaster | null; width: number; height: number; lifted: boolean }) {
  const services = useStage();
  const geometry = useMemo(() => new PlaneGeometry(width * 0.96, height * 0.96), [width, height]);
  const material = useMemo(() => createDoodleMaterial(doodle?.texture ?? null), [doodle]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const fade = useRef(lifted ? 0.75 : 0);
  const last = useRef(doodle?.strokes ?? 0);
  const wiggle = useRef(9);
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const dt = services.clock.delta;
    const target = lifted ? 0.75 : 0;
    fade.current += (target - fade.current) * Math.min(1, dt * 3);
    material.uniforms.uFade.value = fade.current;
    // A fresh stroke: the canvas gives a tiny bounce (the room sees it land).
    const strokes = doodle?.strokes ?? 0;
    if (strokes > last.current) {
      wiggle.current = 0;
      stageSfx(services).play("tap", { intensity: 0.15, gain: 0.25 });
    }
    last.current = strokes;
    wiggle.current += dt;
    const s = 1 + ringDown(wiggle.current, 0.02, 3, 8);
    mesh.current?.scale.set(s, s, 1);
  });
  if (!doodle) return null;
  return <mesh ref={mesh} geometry={geometry} material={material} />;
}

/** The drawing peeling off the canvas and flying up to the rig. */
function PeelOff({ doodle, width, height }: { doodle: DoodleRaster; width: number; height: number }) {
  const services = useStage();
  const group = useRef<Group>(null);
  const geometry = useMemo(() => new PlaneGeometry(width * 0.96, height * 0.96).translate(0, height * 0.48, 0), [width, height]);
  const material = useMemo(() => createDoodleMaterial(doodle.texture), [doodle]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const t = useRef(0);
  useEffect(() => {
    stageSfx(services).play("wipe", { intensity: 0.3, gain: 0.5 });
  }, [services]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    t.current += services.clock.delta;
    const time = t.current;
    // Peel from the bottom edge (anticipation: it curls back first), then away up.
    const peel = clamp01(time / 0.5);
    const fly = easeInCubic(clamp01((time - 0.45) / 0.9));
    g.position.set(0, -height * 0.48 + fly * 4.5, 0.02 + peel * 0.18 + fly * 0.6);
    g.rotation.set(-peel * 0.5 + fly * 0.9, 0, Math.sin(time * 5) * 0.08 * peel);
    g.visible = time < 1.5;
  });
  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} />
    </group>
  );
}

/** The describer's notepad: lines fill in as they type, a shimmer sweeps across, three dots bounce. */
function TypingPad({ fighter, width, height }: { fighter: SceneFighter; width: number; height: number }) {
  const services = useStage();
  const lines = useRef<(Mesh | null)[]>([]);
  const dots = useRef<(Mesh | null)[]>([]);
  const fill = useRef({ progress: 0.15, typing: 0 });
  const forging = fighter.status === "FORGING" || fighter.status === "READY";
  const rows = 5;
  const padWidth = width * 0.8;
  useFrame(() => {
    const dt = services.clock.delta;
    const now = services.clock.now;
    const fresh = fighter.typingAt !== null && now - fighter.typingAt < TYPING_FRESH_MS;
    const state = fill.current;
    state.typing += ((fresh ? 1 : 0) - state.typing) * Math.min(1, dt * 4);
    if (fresh) state.progress = Math.min(1, state.progress + dt * 0.05);
    if (forging) state.progress = 1;
    const t = services.clock.elapsed;
    lines.current.forEach((line, index) => {
      if (!line) return;
      const start = index / rows;
      const k = clamp01((state.progress - start) * rows);
      const shimmer = 0.5 + 0.5 * Math.sin(t * 5 - index * 0.9);
      line.scale.x = Math.max(0.001, k * (index === rows - 1 ? 0.6 : 1));
      line.position.x = -padWidth / 2 + (padWidth * line.scale.x) / 2;
      line.position.z = 0.004 + shimmer * 0.004 * state.typing;
    });
    dots.current.forEach((dot, index) => {
      if (!dot) return;
      const bounce = Math.max(0, Math.sin(t * 7 - index * 0.8));
      dot.position.y = -height * 0.34 + bounce * 0.05 * state.typing;
      dot.visible = !forging;
    });
  });
  const lineGeometry = slabGeometry(1, 0.045, 0.01, 0.02);
  return (
    <group>
      <mesh position={[0, 0, -0.002]} geometry={slabGeometry(width * 0.96, height * 0.96, 0.012, 0.03)} material={uiToon("#fbf6e8", { glow: 0.22 })} />
      {Array.from({ length: rows }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            lines.current[index] = mesh;
          }}
          geometry={lineGeometry}
          material={uiToon(index % 2 === 0 ? "#3d4fb8" : "#2b1d24", { glow: 0.12 })}
          position={[0, height * 0.28 - index * height * 0.11, 0.004]}
        />
      ))}
      {Array.from({ length: 3 }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            dots.current[index] = mesh;
          }}
          position={[-0.1 + index * 0.1, -height * 0.34, 0.02]}
          material={uiToon("#3d4fb8", { glow: 0.3 })}
        >
          <sphereGeometry args={[0.032, 12, 8]} />
        </mesh>
      ))}
      <Suspense fallback={null}>
        <StageText size={0.085} color={UI_COLORS.inkDim} outline={0} glow={0.1} position={[0, height * 0.4, 0.01]} castShadow={false}>
          {forging ? "Sent to the Foundry" : "Describing..."}
        </StageText>
      </Suspense>
    </group>
  );
}

/** Hide an easel prop (a house champion has none) while mounted. */
export function HiddenEasel({ easel }: { easel: EaselNodes }) {
  useEffect(() => {
    const object = easel.node.object;
    const was = object.visible;
    object.visible = false;
    return () => {
      object.visible = was;
    };
  }, [easel]);
  return null;
}
