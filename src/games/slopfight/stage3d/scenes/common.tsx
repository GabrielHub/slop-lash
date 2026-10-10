"use client";

// Shared pieces for the non-fight scenes: the scene data hook, the phase
// clock, the animated marquee, colours per fighter, and node helpers.

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import { TOY_COLOR_VALUES } from "../../vocab";
import type { ArenaNodes, NodeTransform } from "../arena/nodes";
import { useStageFoundry, useStageStrokes, useLiveFeeds } from "../feeds";
import { useStage } from "../services";
import type { StageInput } from "../stage-input";
import { lightOf, UI_COLORS } from "../ui3d/materials";
import { ringDown, springTo1 } from "../ui3d/motion";
import { useRoomOrNull } from "../ui3d/room";
import { stageSfx } from "../ui3d/sound";
import { fitTextSize, OnPlane, StageText } from "../ui3d/text";
import { playerTokenColor } from "../ui3d/tokens";
import { buildSceneData, needsSynthetic, type SceneData, type SceneFighter } from "./scene-data";

type DevFeedModule = typeof import("./dev-feed");

/** The scenes' view of the room plus the stage feeds (null outside a SlopFight room). */
export function useSceneData(): SceneData | null {
  const room = useRoomOrNull();
  const strokes = useStageStrokes();
  const foundry = useStageFoundry();
  const live = useLiveFeeds();
  const view = room?.view ?? null;
  const offset = room?.clockOffsetMs ?? 0;
  const synth = !!view && !live && needsSynthetic(view, foundry);
  // A fixture's forging fighters grow from a synthetic stream (the sample
  // champions, loaded on demand so they stay out of the production chunk):
  // re-read it a few times a second.
  const [devFeed, setDevFeed] = useState<DevFeedModule | null>(null);
  useEffect(() => {
    if (!synth || devFeed) return;
    let alive = true;
    void import("./dev-feed").then((module) => {
      if (alive) setDevFeed(module);
    });
    return () => {
      alive = false;
    };
  }, [synth, devFeed]);
  const [synthNow, setSynthNow] = useState<number | null>(null);
  useEffect(() => {
    if (!synth) return;
    const tick = () => setSynthNow(Date.now() + offset);
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [synth, offset]);
  return useMemo(() => {
    if (!view) return null;
    const synthetic = synth && devFeed && synthNow !== null ? devFeed.sampleStream(synthNow) : null;
    return buildSceneData(view, { strokes, foundry, synthetic });
  }, [view, strokes, foundry, synth, devFeed, synthNow]);
}

/** Seconds since the phase started on the presentation clock (mount time when the phase start is unknown). */
export function usePhaseSeconds(input: StageInput): () => number {
  const services = useStage();
  const mountedAt = useRef<number | null>(null);
  return useMemo(
    () => () => {
      if (mountedAt.current === null) mountedAt.current = services.clock.now;
      const start = input.phaseStartedAt ?? mountedAt.current;
      return (services.clock.now - start) / 1000;
    },
    [services, input.phaseStartedAt],
  );
}

/** Sounds for scene beats (live rooms only). */
export function useSceneSfx() {
  const services = useStage();
  return useMemo(() => stageSfx(services), [services]);
}

/** A fighter's colour: its champion's primary, else its owner's token colour, else a slot colour. */
export function fighterColor(fighter: SceneFighter | null | undefined): string {
  if (fighter?.champion) return TOY_COLOR_VALUES[fighter.champion.palette.primary].hex;
  if (fighter?.ownerName) return playerTokenColor(fighter.ownerName);
  const slots = [TOY_COLOR_VALUES.tangerine.hex, TOY_COLOR_VALUES.sky.hex, TOY_COLOR_VALUES.lime.hex, TOY_COLOR_VALUES.bubblegum.hex];
  return slots[(fighter?.slot ?? 0) % slots.length]!;
}

/** A champion's three palette colours (for confetti). */
export function paletteHexes(fighter: SceneFighter | null | undefined): string[] {
  const palette = fighter?.champion?.palette;
  if (!palette) return [fighterColor(fighter)];
  return [palette.primary, palette.secondary, palette.accent].map((color) => TOY_COLOR_VALUES[color].hex);
}

/** The easel for a slot (sorted by node index), or null. */
export function easelFor(nodes: ArenaNodes | null, slot: number) {
  if (!nodes) return null;
  return [...nodes.easels].sort((a, b) => a.index - b.index)[slot] ?? null;
}

/** The pedestal for a slot, or null. */
export function pedestalFor(nodes: ArenaNodes | null, slot: number) {
  if (!nodes) return null;
  return [...nodes.pedestals].sort((a, b) => a.index - b.index)[slot] ?? null;
}

/** A node's world position as a tuple (copy). */
export function nodePoint(node: NodeTransform | null | undefined, fallback: [number, number, number]): [number, number, number] {
  return node ? [node.position.x, node.position.y, node.position.z] : fallback;
}

/** The pedestal top for a slot (world), with a sensible fallback. */
export function pedestalTop(nodes: ArenaNodes | null, slot: number): [number, number, number] {
  const pedestal = pedestalFor(nodes, slot);
  const fallbackZ = [-2.75, -0.92, 0.92, 2.75][slot] ?? 0;
  return nodePoint(pedestal?.top ?? pedestal?.node, [7.5, 0.7, fallbackZ]);
}

/** The yaw that faces from `from` toward `to` (three.js: 0 faces +z). */
export function yawToward(from: readonly number[], to: { x: number; z: number } | readonly number[]): number {
  const tx = Array.isArray(to) ? (to as number[])[0]! : (to as { x: number }).x;
  const tz = Array.isArray(to) ? (to as number[])[2]! : (to as { z: number }).z;
  return Math.atan2(tx - from[0]!, tz - from[2]!);
}

/** A camera anchor's position (for facing things toward a shot). */
export function cameraPoint(nodes: ArenaNodes | null, name: keyof ArenaNodes["cameras"], fallback: [number, number, number]): Vector3 {
  const anchor = nodes?.cameras[name];
  return anchor ? anchor.position.clone() : new Vector3(...fallback);
}

/** One line of marquee copy, in the marquee plane's space (centre x = 0). */
export interface MarqueeLine {
  text: string;
  /** Centre height. */
  y: number;
  /** Em size. */
  size: number;
  /** Estimated laid-out width (fitTextSize's em advance). */
  width: number;
}

/** How SceneMarquee lays out its big line and optional sub-line on a marquee plane. */
export function marqueeLines(plane: { width: number; height: number }, text: string, sub: string | null): MarqueeLine[] {
  const big = fitTextSize(text, plane.width * 0.9, plane.height * (sub ? 0.5 : 0.66));
  const lines: MarqueeLine[] = [{ text, y: sub ? plane.height * 0.14 : 0, size: big, width: Math.max(1, text.length) * 0.58 * big }];
  if (sub) {
    const small = fitTextSize(sub, plane.width * 0.9, plane.height * 0.24);
    lines.push({ text: sub, y: -plane.height * 0.27, size: small, width: Math.max(1, sub.length) * 0.58 * small });
  }
  return lines;
}

export interface MarqueeProps {
  nodes: ArenaNodes | null;
  /** The big line. */
  text: string;
  /** A smaller second line. */
  sub?: string | null;
  /** Flip in when the text changes (with a clack). */
  animate?: boolean;
}

/**
 * The set's marquee with custom copy: a big line and an optional small one,
 * on the marquee's own background. It flips over (a split-flap clack) when
 * the text changes.
 */
export function SceneMarquee({ nodes, text, sub = null, animate = true }: MarqueeProps) {
  const services = useStage();
  const plane = nodes?.marqueeText ?? null;
  const flip = useRef<Group>(null);
  const changed = useRef({ key: `${text}|${sub}`, t: 10 });
  const key = `${text}|${sub}`;
  useEffect(() => {
    if (changed.current.key !== key) changed.current = { key, t: 0 };
    if (animate && changed.current.t === 0) stageSfx(services).play("tap", { intensity: 0.4, gain: 0.5 });
  }, [key, animate, services]);
  useFrame(() => {
    const group = flip.current;
    if (!group) return;
    changed.current.t += services.clock.realDelta;
    const t = changed.current.t;
    if (!animate || t > 1.2) {
      group.rotation.x = 0;
      group.scale.setScalar(1);
      return;
    }
    // Flip down from the top edge, overshoot, settle.
    group.rotation.x = -(1 - springTo1(t, 2.4, 0.45)) * 1.4;
    const s = 1 + ringDown(t, 0.06, 3, 6);
    group.scale.set(s, s, 1);
  });
  if (!plane) return null;
  const color = plane.textColor ?? "#fff2c2";
  const [main, second] = marqueeLines(plane, text, sub);
  return (
    <OnPlane plane={plane}>
      {plane.bgColor && (
        <mesh position={[0, 0, -0.006]} receiveShadow>
          <planeGeometry args={[plane.width, plane.height]} />
          <meshStandardMaterial color={plane.bgColor} roughness={0.85} />
        </mesh>
      )}
      <group position={[0, plane.height / 2, 0]}>
        <group ref={flip}>
          <group position={[0, -plane.height / 2, 0]}>
            <Suspense fallback={null}>
              <StageText size={main!.size} color={color} glow={0.25} castShadow={false} position={[0, main!.y, 0]}>
                {text}
              </StageText>
              {second && (
                <StageText size={second.size} color={lightOf(color, 0.3)} glow={0.34} castShadow={false} position={[0, second.y, 0]}>
                  {second.text}
                </StageText>
              )}
            </Suspense>
          </group>
        </group>
      </group>
    </OnPlane>
  );
}

/** Ink for text on a fighter-coloured surface. */
export const INK = UI_COLORS.ink;
