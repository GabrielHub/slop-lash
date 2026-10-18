"use client";

// The Voice's caption: a lit lower-third slab fixed to the camera (placed
// every frame after the camera rig, like the slam title), so the post stack
// grades it and the camera's shake moves it. One line at a time: it rises in
// with a squash, types on with a blip per word, holds while the line is said,
// and flicks off. A new line replaces the old one with a quick re-type.
//
// It draws on top of the set (no depth test) and, during hero shots with
// depth of field, sits at the focus distance (scaled to the same screen size)
// so it stays sharp. Render it once inside the canvas: <Caption />. It reads
// `services.voice.caption` and drives `services.voice.tick()`.

import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useRef, useState } from "react";
import { Vector3, type Group, type PerspectiveCamera } from "three";
import { useStage } from "../services";
import { slabGeometry } from "./geometry";
import { UI_COLORS, uiOutline, uiToon } from "./materials";
import { clamp01, easeInBack, ringDown, springTo1 } from "./motion";
import { stageSfx } from "./sound";
import { wrapCaption } from "./caption-layout";
import { StageText, type TroikaTextMesh } from "./text";

export { wrapCaption };

/** Frame priority: after the camera rig (0.5), with the slam (0.6), before post (0.7). */
export const CAPTION_PRIORITY = 0.62;
/** Distance in front of the camera when no depth of field is on. */
const DEPTH = 2.2;
/** Local units: 1 = the full view height. */
const WIDTH = 1.18;
const LINE_EM = 0.044;
const PAD_X = 0.05;
const TYPE_RATE = 42;
const RENDER_ORDER = 950;

const tmpForward = new Vector3();
const tmpUp = new Vector3();
const tmpFocus = new Vector3();

interface Shown {
  seq: number;
  lines: string[];
  speaker: string;
}

function CaptionLine({
  text,
  y,
  index,
  meshes,
}: {
  text: string;
  y: number;
  index: number;
  meshes: React.MutableRefObject<(TroikaTextMesh | null)[]>;
}) {
  const ref = useCallback(
    (mesh: TroikaTextMesh | null) => {
      meshes.current[index] = mesh;
      if (mesh) mesh.clipRect = [-10, -10, -10, 10];
    },
    [meshes, index],
  );
  return (
    <StageText
      textRef={ref}
      position={[-WIDTH / 2 + PAD_X, y, 0.02]}
      size={LINE_EM}
      color={UI_COLORS.bone}
      outlineColor={UI_COLORS.plumEdge}
      outline={0.04}
      anchorX="left"
      anchorY="middle"
      textAlign="left"
      whiteSpace="nowrap"
      overlay
      renderOrder={RENDER_ORDER + 2}
      castShadow={false}
    >
      {text}
    </StageText>
  );
}

const root0Visible = (group: Group | null) => group?.visible === true;

export function Caption() {
  const services = useStage();
  const group = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const meshes = useRef<(TroikaTextMesh | null)[]>([]);
  const [shown, setShown] = useState<Shown | null>(null);
  // The frame loop reads the latest caption from a ref (state lags a render behind).
  const shownRef = useRef<Shown | null>(null);
  const anim = useRef({ seq: -1, t: 0, lineT: 0, typed: 0, leaving: -1, words: [] as number[], blips: 0 });
  const sfx = stageSfx(services);

  useFrame((state) => {
    const { voice, clock, fx } = services;
    voice.tick();
    const caption = voice.caption;
    const a = anim.current;
    const dt = clock.realDelta;

    if (caption && caption.seq !== a.seq) {
      const lines = wrapCaption(caption.line.text);
      a.seq = caption.seq;
      a.typed = 0;
      a.leaving = -1;
      a.blips = 0;
      // Character offsets where a new word starts (one blip each).
      const joined = lines.join(" ");
      a.words = [];
      for (let i = 1; i < joined.length; i += 1) if (joined[i - 1] === " ") a.words.push(i);
      // A line that replaces one still up keeps the slab up and only re-types.
      const replacing = shownRef.current !== null && root0Visible(group.current) && a.leaving < 0;
      if (!replacing) a.t = 0;
      a.lineT = 0;
      const next = { seq: caption.seq, lines, speaker: "THE VOICE" };
      shownRef.current = next;
      setShown(next);
    }

    const root = group.current;
    const current = shownRef.current;
    if (!root) return;
    const visible = current !== null && caption !== null && caption.seq === current.seq;
    root.visible = visible && a.leaving < 0.5;
    if (!visible) return;

    a.t += dt;
    a.lineT += dt;
    if (clock.now >= caption.until && a.leaving < 0) a.leaving = 0;
    if (a.leaving >= 0) a.leaving += dt;

    // Type on (the slab must have risen a little first).
    const total = current.lines.reduce((sum, line) => sum + line.length, 0) + current.lines.length - 1;
    if (a.t > 0.12) a.typed = Math.min(total, a.typed + dt * TYPE_RATE);
    while (a.blips < a.words.length && a.typed >= a.words[a.blips]!) {
      a.blips += 1;
      if (a.blips % 2 === 1) sfx.play("tap", { intensity: 0.12, gain: 0.45 });
    }
    let remaining = a.typed;
    current.lines.forEach((line, index) => {
      const mesh = meshes.current[index];
      const info = mesh?.textRenderInfo;
      if (!mesh || !info) return;
      const [minX, minY, maxX, maxY] = info.blockBounds;
      const fraction = clamp01(remaining / Math.max(1, line.length));
      remaining -= line.length + 1;
      mesh.clipRect = [minX - 0.02, minY - 0.05, minX - 0.005 + (maxX - minX + 0.03) * fraction, maxY + 0.05];
    });

    // Placement: in front of the camera, in the lower third (clear of letterbox bars).
    const camera = state.camera as PerspectiveCamera;
    let depth = DEPTH;
    if (fx.dof.strength > 0.05) {
      tmpFocus.copy(fx.dof.focus).sub(camera.position);
      tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      depth = Math.min(14, Math.max(1.5, tmpFocus.dot(tmpForward)));
    }
    const viewHeight = 2 * depth * Math.tan(((camera.fov ?? 40) * Math.PI) / 360);
    const aspect = camera.aspect || 16 / 9;
    const fit = Math.min(1, (aspect * 0.86) / WIDTH);
    tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const offsetY = -0.33 + 0.05 * fx.letterbox;
    root.position.copy(camera.position).addScaledVector(tmpForward, depth).addScaledVector(tmpUp, offsetY * viewHeight);
    root.quaternion.copy(camera.quaternion);
    root.scale.setScalar(viewHeight * fit);

    // Motion: rise in with an overshoot, a squash on each new line, flick down to leave.
    const body = inner.current;
    if (body) {
      const rise = springTo1(a.t, 2.2, 0.5);
      let y = -0.22 * (1 - rise);
      let squash = ringDown(a.lineT, -0.12, 3, 7);
      let rot = ringDown(a.t, 0.03, 1.6, 4);
      if (a.leaving >= 0) {
        const p = clamp01(a.leaving / 0.42);
        y += a.leaving < 0.1 ? 0.012 * (a.leaving / 0.1) : 0.012 - 0.32 * easeInBack(p, 1.6);
        squash += a.leaving < 0.1 ? -0.08 : 0.1 * p;
        rot += 0.05 * p;
      }
      body.position.y = y;
      body.scale.set(1 / Math.sqrt(1 + squash), 1 + squash, 1);
      body.rotation.z = rot;
    }
  }, CAPTION_PRIORITY);

  const lines = shown?.lines ?? [];
  const height = 0.075 + lines.length * LINE_EM * 1.12;
  return (
    <group ref={group} visible={false}>
      <group ref={inner}>
        <mesh
          geometry={slabGeometry(WIDTH, height, 0.03, 0.035)}
          material={[uiToon(UI_COLORS.plum, { glow: 0.28, overlay: true }), uiToon(UI_COLORS.plumEdge, { glow: 0.2, overlay: true })]}
          renderOrder={RENDER_ORDER}
        />
        <mesh geometry={slabGeometry(WIDTH, height, 0.03, 0.035)} material={uiOutline(UI_COLORS.plum, 2.4, { overlay: true })} renderOrder={RENDER_ORDER - 1} />
        {/* The speaker tab, top left. */}
        <group position={[-WIDTH / 2 + 0.11, height / 2 + 0.006, 0.022]} rotation={[0, 0, 0.04]}>
          <mesh
            geometry={slabGeometry(0.19, 0.044, 0.02, 0.022)}
            material={[uiToon(UI_COLORS.gold, { glow: 0.3, overlay: true }), uiToon(UI_COLORS.cardEdge, { overlay: true })]}
            renderOrder={RENDER_ORDER + 1}
          />
          <Suspense fallback={null}>
            <StageText
              size={0.024}
              color={UI_COLORS.ink}
              outline={0}
              position={[0, 0, 0.012]}
              overlay
              renderOrder={RENDER_ORDER + 2}
              castShadow={false}
            >
              {shown?.speaker ?? "THE VOICE"}
            </StageText>
          </Suspense>
        </group>
        <Suspense fallback={null}>
          {lines.map((line, index) => (
            <CaptionLine
              key={`${shown?.seq}:${index}`}
              text={line}
              index={index}
              meshes={meshes}
              y={((lines.length - 1) / 2 - index) * LINE_EM * 1.12 - 0.006}
            />
          ))}
        </Suspense>
      </group>
    </group>
  );
}
