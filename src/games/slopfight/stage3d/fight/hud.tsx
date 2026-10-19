"use client";

// Who is who, and who is winning, from across the room:
//
// - FightHud: the two health bars fixed along the top of the frame, A on the
//   left in its phone colour (teal), B on the right (gold), like the bars on
//   the phones. Each is the kit's <Bar> (the fill drops at once, the chunk
//   crunches off with a shake and its sound) on a dark plate with the
//   champion's name, the owner and the side's chevron. Under the bar a red
//   tag says ON THE EDGE at the brink, then K.O. or RING OUT. The HUD is
//   camera-fixed (ui3d/screen.ts) and drawn over the set; the fight shots
//   keep the fighters under it (director/framing.ts).
// - SideMarker: on the set, a ring on the floor under a fighter and a chevron
//   over its head in its side's colour, so the bars map onto the creatures
//   even when both are orange.

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ConeGeometry, MathUtils, RingGeometry, Vector3, type Group, type Mesh, type PerspectiveCamera } from "three";
import { ARENAS, type ArenaId } from "../../arenas";
import type { Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import { buildProxyDef } from "../../sim";
import { HUD_BOTTOM_NDC } from "../director/framing";
import { useStage } from "../services";
import { Bar, type BarHandle } from "../ui3d/bar";
import { slabGeometry } from "../ui3d/geometry";
import { lightOf, SIDE_COLORS, UI_COLORS, uiOutline, uiToon } from "../ui3d/materials";
import { placeOnScreen, screenDepth } from "../ui3d/screen";
import { fitTextSize, StageText } from "../ui3d/text";
import type { FightConductor } from "./conduct";
import type { FightPlayer } from "./player";

/** Frame priority: after the camera rig (0.5), beside the slam (0.6) and the caption (0.62). */
const HUD_PRIORITY = 0.61;

// Layout in view heights (1 = the frame's height), from the frame's edges.
const PANEL_W = 0.68;
const PANEL_H = 0.12;
const SIDE_MARGIN = 0.04;
const BAR_W = 0.62;
const BAR_H = 0.038;
const NAME_MAX = 0.044;
const OWNER_SIZE = 0.026;
const PAD = 0.024;
/** The chevron's slot at the panel's outer end. */
const ICON_W = 0.05;
/** The panel's centre, above the frame's middle: its bottom edge on the HUD band. */
const PANEL_Y = (HUD_BOTTOM_NDC / 2) + PANEL_H / 2;
const BAR_Y = -PANEL_H / 2 + PAD * 0.7 + BAR_H / 2;
const NAME_Y = BAR_Y + BAR_H / 2 + 0.012 + NAME_MAX * 0.55;
/** A quarter of health or less: the bar turns the phones' low red. */
const LOW = 0.25;

/** Draw order from here up, B's whole panel over A's; The Voice's caption (950) stays on top. */
const HUD_ORDER: Record<Side, number> = { A: 900, B: 920 };

const LOOK = { overlay: true, depthWrite: true } as const;

let chevronGeometry: ConeGeometry | null = null;
/** A four-sided chevron pointing down (shared). */
function chevron(): ConeGeometry {
  chevronGeometry ??= new ConeGeometry(0.5, 0.9, 4, 1).rotateX(Math.PI);
  return chevronGeometry;
}

export interface FightHudProps {
  player: FightPlayer;
  conductor: FightConductor;
  names: Record<Side, string>;
  owners: Record<Side, string | null>;
}

export function FightHud({ player, conductor, names, owners }: FightHudProps) {
  const services = useStage();
  const root = useRef<Group>(null);
  const panels = useRef<Record<Side, Group | null>>({ A: null, B: null });
  const rise = useRef(0);
  useFrame((state, realDelta) => {
    const group = root.current;
    if (!group) return;
    const camera = state.camera as PerspectiveCamera;
    placeOnScreen(group, camera, screenDepth(camera, services.fx));
    // Drop in from above as the fight opens.
    rise.current = MathUtils.damp(rise.current, player.ready ? 1 : 0, 7, realDelta);
    const aspect = camera.aspect || 16 / 9;
    for (const side of ["A", "B"] as const) {
      const panel = panels.current[side];
      if (!panel) continue;
      const x = (aspect / 2 - SIDE_MARGIN - PANEL_W / 2) * (side === "A" ? -1 : 1);
      panel.position.set(x, PANEL_Y + (1 - rise.current) * 0.3, 0);
      panel.visible = rise.current > 0.02;
    }
  }, HUD_PRIORITY);
  return (
    <group ref={root}>
      {(["A", "B"] as const).map((side) => (
        <group
          key={side}
          ref={(node) => {
            panels.current[side] = node;
          }}
        >
          <HudPanel player={player} conductor={conductor} side={side} name={names[side]} owner={owners[side]} />
        </group>
      ))}
    </group>
  );
}

function HudPanel({ player, conductor, side, name, owner }: { player: FightPlayer; conductor: FightConductor; side: Side; name: string; owner: string | null }) {
  const bar = useRef<BarHandle>(null);
  const tag = useRef<Group>(null);
  const tagState = useRef({ shown: 0 });
  const [low, setLow] = useState(false);
  const [tagText, setTagText] = useState("ON THE EDGE");
  const order = HUD_ORDER[side];
  const outer = side === "A" ? -1 : 1;
  const color = low ? SIDE_COLORS.low : SIDE_COLORS[side];
  const ownerWidth = owner ? Math.min(0.22, owner.length * OWNER_SIZE * 0.58) : 0;
  const nameSize = fitTextSize(name, PANEL_W - ICON_W - PAD * 2 - ownerWidth - 0.02, NAME_MAX);

  useFrame((frame, realDelta) => {
    const max = Math.max(1, player.maxHealth[side]);
    const value = Math.max(0, player.health[side]) / max;
    bar.current?.set(value);
    if (value <= LOW !== low) setLow(value <= LOW);
    // The tag: ON THE EDGE pulses at the brink; K.O. and RING OUT stay.
    const out = conductor.outSide === side;
    const ko = conductor.koSide === side;
    const text = out ? "RING OUT" : ko ? "K.O." : "ON THE EDGE";
    if (text !== tagText) setTagText(text);
    const s = tagState.current;
    s.shown = MathUtils.damp(s.shown, out || ko || conductor.edge[side] > 0.5 ? 1 : 0, 14, realDelta);
    const node = tag.current;
    if (node) {
      node.visible = s.shown > 0.02;
      const pulse = out || ko ? 1 : 1 + 0.06 * Math.sin(frame.clock.elapsedTime * 14);
      node.scale.setScalar(Math.max(0.0001, s.shown * pulse));
    }
  });

  const plate = slabGeometry(PANEL_W, PANEL_H, 0.008, 0.022);
  return (
    <>
      <mesh geometry={plate} material={uiOutline(UI_COLORS.plum, 2.4, { overlay: true })} renderOrder={order} />
      <mesh geometry={plate} material={uiToon(UI_COLORS.plum, { glow: 0.3, ...LOOK })} renderOrder={order + 1} />
      {/* The side's chevron, as over its fighter's head. */}
      <group position={[outer * (PANEL_W / 2 - ICON_W / 2 - PAD * 0.4), NAME_Y, 0.01]} scale={0.034}>
        <mesh geometry={chevron()} material={uiOutline(SIDE_COLORS[side], 3, { overlay: true })} renderOrder={order + 2} />
        <mesh geometry={chevron()} material={uiToon(SIDE_COLORS[side], { glow: 0.45, ...LOOK })} renderOrder={order + 3} />
      </group>
      <Bar ref={bar} value={1} width={BAR_W} height={BAR_H} color={color} flip={side === "B"} overlay={order + 4} position={[0, BAR_Y, 0.008]} />
      <Suspense fallback={null}>
        <StageText
          position={[outer * (PANEL_W / 2 - ICON_W - PAD * 0.4), NAME_Y, 0.012]}
          size={nameSize}
          color={UI_COLORS.bone}
          outlineColor={UI_COLORS.plumEdge}
          outline={0.12}
          anchorX={side === "A" ? "left" : "right"}
          overlay
          renderOrder={order + 9}
          castShadow={false}
        >
          {name}
        </StageText>
        {owner && (
          <StageText
            position={[-outer * (PANEL_W / 2 - PAD), NAME_Y - (NAME_MAX - OWNER_SIZE) * 0.3, 0.012]}
            size={OWNER_SIZE}
            color={lightOf(SIDE_COLORS[side], 0.45)}
            outlineColor={UI_COLORS.plumEdge}
            outline={0.18}
            weight={600}
            anchorX={side === "A" ? "right" : "left"}
            overlay
            renderOrder={order + 9}
            castShadow={false}
          >
            {owner}
          </StageText>
        )}
      </Suspense>
      <group ref={tag} position={[0, -PANEL_H / 2 - 0.026, 0.012]} visible={false}>
        <mesh geometry={slabGeometry(0.24, 0.044, 0.008, 0.016)} material={uiToon(EDGE_RED, { glow: 0.6, ...LOOK })} renderOrder={order + 10} />
        <Suspense fallback={null}>
          <StageText position={[0, 0, 0.008]} size={0.028} color={UI_COLORS.bone} outline={0} overlay renderOrder={order + 11} castShadow={false}>
            {tagText}
          </StageText>
        </Suspense>
      </group>
    </>
  );
}

const EDGE_RED = "#e8402f";

// ---------------------------------------------------------------------------
// On the set
// ---------------------------------------------------------------------------

/** A champion's floor ring radius, from its physics footprint. */
export function ringRadius(champion: Champion): number {
  return MathUtils.clamp(buildProxyDef(champion).footprint + 0.08, 0.32, 0.85);
}

const RING_WIDTH = 0.07;
/** Rings sit this far above the platform's top (clear of the floor, under the contact shadow's blur). */
const RING_LIFT = 0.012;
/** Chevrons draw over the set, above the creatures' eye and mouth decals (2-3), under the HUD. */
const CHEVRON_ORDER = 40;

export interface SideMarkerProps {
  side: Side;
  champion: Champion;
  arena: ArenaId;
  /** The fighter's root (torso) position this frame, or null while unknown. */
  root: () => Vector3 | null;
  /** The fighter's standing height. */
  height: number;
  /** Show the chevron over the head (the fight; the face-off shows the ring only). */
  chevron?: boolean;
  /** Hide both (a fighter that left the arena). */
  hidden?: () => boolean;
}

/**
 * A fighter's side on the set: a ring on the floor under it (only while it is
 * on the platform and near the floor) and, in the fight, a chevron over its
 * head that stays the same size on screen.
 */
export function SideMarker({ side, champion, arena, root, height, chevron: showChevron = true, hidden }: SideMarkerProps) {
  const ring = useRef<Mesh>(null);
  const marker = useRef<Group>(null);
  const state = useRef({ position: new Vector3(), init: false, ring: 0 });
  const radius = useMemo(() => ringRadius(champion), [champion]);
  const geometry = useMemo(() => new RingGeometry(radius - RING_WIDTH, radius, 48).rotateX(-Math.PI / 2), [radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const geometryOf = ARENAS[arena].geometry;
  const color = SIDE_COLORS[side];
  const target = useMemo(() => new Vector3(), []);

  useFrame((frame, realDelta) => {
    const p = root();
    const gone = !p || hidden?.() === true;
    const s = state.current;
    const half = geometryOf.halfSize;
    const grounded = p !== null && Math.abs(p.x) < half + 0.1 && Math.abs(p.z) < half + 0.1 && p.y - geometryOf.topY < 1.1;
    s.ring = MathUtils.damp(s.ring, !gone && grounded ? 1 : 0, 10, realDelta);
    const ringMesh = ring.current;
    if (ringMesh) {
      ringMesh.visible = s.ring > 0.02;
      if (p) ringMesh.position.set(p.x, geometryOf.topY + RING_LIFT, p.z);
      ringMesh.scale.setScalar(Math.max(0.0001, 0.6 + 0.4 * s.ring));
    }
    const node = marker.current;
    if (!node) return;
    node.visible = showChevron && !gone && p.y > geometryOf.topY - 1.5;
    if (!node.visible || !p) return;
    // Over the head, with a little lag so a tumble does not throw it about.
    target.set(p.x, Math.max(p.y, geometryOf.topY + 0.2) + height * 0.62 + 0.32, p.z);
    if (!s.init) {
      s.position.copy(target);
      s.init = true;
    } else {
      s.position.lerp(target, 1 - Math.exp(-realDelta * 9));
    }
    const t = frame.clock.elapsedTime;
    node.position.copy(s.position);
    node.position.y += Math.sin(t * 3.1 + (side === "A" ? 0 : 1.7)) * 0.03;
    node.rotation.y = t * 1.6;
    // About the same size on screen from a wide shot to a close one.
    const distance = frame.camera.position.distanceTo(s.position);
    node.scale.setScalar(0.13 * MathUtils.clamp(distance / 4.5, 0.75, 2.1));
  });

  return (
    <>
      <mesh ref={ring} geometry={geometry} material={uiToon(color, { glow: 0.55 })} visible={false} />
      {showChevron && (
        <group ref={marker} visible={false}>
          <mesh geometry={chevron()} material={uiOutline(color, 3, { overlay: true })} renderOrder={CHEVRON_ORDER} />
          <mesh geometry={chevron()} material={uiToon(color, { glow: 0.45, overlay: true })} renderOrder={CHEVRON_ORDER + 1} />
        </group>
      )}
    </>
  );
}
