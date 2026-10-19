"use client";

// The Voice's caption: a lit plum slab fixed to the camera (placed every
// frame after the camera rig, like the slam title), so the post stack grades
// it and the camera's shake moves it. One line at a time: it rises in with a
// squash, types on with a blip per word, holds while the line is said, and
// flicks off. A new line replaces the old one with a quick re-type.
//
// The slab hugs its text and sits low in the frame (above the letterbox
// bars when they are in), in the bottom-left, centre or right: whichever
// covers least of the director's subjects on screen (caption-layout.ts).
// It draws on top of the set (no depth test) and writes depth, at the
// depth-of-field focus distance in hero shots, so it stays sharp
// (ui3d/screen.ts). Render it once inside the canvas: <Caption />. It reads
// `services.voice.caption` and drives `services.voice.tick()`.

import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useRef, useState } from "react";
import { MathUtils, Vector3, type Group, type PerspectiveCamera } from "three";
import { subjectsNdcBox, type NdcBox } from "../director/framing";
import { useStage } from "../services";
import { captionBottom, captionX, chooseCaptionSlot, wrapCaption, type CaptionSlot } from "./caption-layout";
import { slabGeometry } from "./geometry";
import { UI_COLORS, uiOutline, uiToon } from "./materials";
import { clamp01, easeInBack, ringDown, springTo1 } from "./motion";
import { placeOnScreen, screenDepth } from "./screen";
import { stageSfx } from "./sound";
import { StageText, type TroikaTextMesh } from "./text";

export { wrapCaption };

/** Frame priority: after the camera rig (0.5), with the slam (0.6), before post (0.7). */
export const CAPTION_PRIORITY = 0.62;
/** Local units: 1 = the full view height. */
const LINE_EM = 0.036;
const LINE_STEP = LINE_EM * 1.12;
const PAD_X = 0.032;
const PAD_Y = 0.024;
/** The slab is never narrower than this (the speaker tab sits on it). */
const MIN_WIDTH = 0.26;
const WIDTH_STEP = 0.02;
/** Before the text has laid out: a line's width per character. */
const EM_PER_CHAR = 0.53;
/** The slab never takes more of the frame's width than this. */
const MAX_WIDTH_SHARE = 0.86;
const TYPE_RATE = 42;
const RENDER_ORDER = 950;
const TAB_W = 0.15;
const TAB_H = 0.034;

interface Shown {
  seq: number;
  lines: string[];
  speaker: string;
  /** Slab width (local units), from the laid-out text once it has. */
  width: number;
}

function slabHeight(lines: number): number {
  return PAD_Y * 2 + Math.max(1, lines) * LINE_STEP;
}

/** A slab width for text `textWidth` wide, in steps (one cached slab per step). */
function slabWidth(textWidth: number): number {
  return Math.max(MIN_WIDTH, Math.ceil((textWidth + PAD_X * 2) / WIDTH_STEP) * WIDTH_STEP);
}

function estimateWidth(lines: readonly string[]): number {
  const longest = lines.reduce((most, line) => Math.max(most, line.length), 0);
  return slabWidth(longest * EM_PER_CHAR * LINE_EM);
}

function CaptionLine({
  text,
  x,
  y,
  index,
  onMesh,
}: {
  text: string;
  x: number;
  y: number;
  index: number;
  onMesh: (index: number, mesh: TroikaTextMesh | null) => void;
}) {
  const ref = useCallback(
    (mesh: TroikaTextMesh | null) => {
      onMesh(index, mesh);
      if (mesh) mesh.clipRect = [-10, -10, -10, 10];
    },
    [onMesh, index],
  );
  return (
    <StageText
      textRef={ref}
      position={[x, y, 0.02]}
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

const tmpForward = new Vector3();
const subjectBoxes: NdcBox[] = [
  { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  { minX: 0, maxX: 0, minY: 0, maxY: 0 },
];

export function Caption() {
  const services = useStage();
  const group = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const meshes = useRef<(TroikaTextMesh | null)[]>([]);
  const onMesh = useCallback((index: number, mesh: TroikaTextMesh | null) => {
    meshes.current[index] = mesh;
  }, []);
  const [shown, setShown] = useState<Shown | null>(null);
  // The frame loop reads the latest caption from a ref (state lags a render behind).
  const shownRef = useRef<Shown | null>(null);
  const anim = useRef({ seq: -1, t: 0, lineT: 0, typed: 0, leaving: -1, words: [] as number[], blips: 0, fresh: true });
  const place = useRef({ slot: 0 as CaptionSlot, x: 0, y: 0, snap: true });
  const sfx = stageSfx(services);

  useFrame((state) => {
    const { voice, clock, fx, director } = services;
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
      if (!replacing) {
        a.t = 0;
        place.current.snap = true;
      }
      a.lineT = 0;
      a.fresh = true;
      const next = { seq: caption.seq, lines, speaker: "THE VOICE", width: estimateWidth(lines) };
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
    let measured = 0;
    let laidOut = true;
    current.lines.forEach((line, index) => {
      const mesh = meshes.current[index];
      const info = mesh?.textRenderInfo;
      if (!mesh || !info) {
        laidOut = false;
        return;
      }
      const [minX, minY, maxX, maxY] = info.blockBounds;
      measured = Math.max(measured, maxX - minX);
      const fraction = clamp01(remaining / Math.max(1, line.length));
      remaining -= line.length + 1;
      mesh.clipRect = [minX - 0.02, minY - 0.05, minX - 0.005 + (maxX - minX + 0.03) * fraction, maxY + 0.05];
    });
    // Hug the laid-out text.
    if (laidOut && measured > 0) {
      const width = slabWidth(measured);
      if (width !== current.width) {
        const next = { ...current, width };
        shownRef.current = next;
        setShown(next);
      }
    }

    // Placement: low in the frame, clear of the bars, on the side away from the subjects.
    const camera = state.camera as PerspectiveCamera;
    const aspect = camera.aspect || 16 / 9;
    const fit = Math.min(1, (aspect * MAX_WIDTH_SHARE) / current.width);
    const widthNdc = ((current.width * fit) / aspect) * 2;
    const heightNdc = slabHeight(current.lines.length) * fit * 2;
    const bottom = captionBottom(fx.letterboxBarFraction(aspect));
    const targets = director.targets;
    const height = director.subjectHeight;
    tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const subjects = subjectBoxes.slice(0, Math.min(2, targets.length));
    subjects.forEach((box, index) => subjectsNdcBox([targets[index]!], height, camera.position, tmpForward, camera.fov, aspect, box));
    const p = place.current;
    p.slot = chooseCaptionSlot(subjects, widthNdc, heightNdc, bottom, p.slot, a.fresh);
    a.fresh = false;
    // Local units (view heights) from NDC.
    const goalX = (captionX(p.slot, widthNdc) * aspect) / 2;
    const goalY = (bottom + heightNdc / 2) / 2;
    if (p.snap) {
      p.x = goalX;
      p.y = goalY;
      p.snap = false;
    } else {
      p.x = MathUtils.damp(p.x, goalX, 6, dt);
      p.y = MathUtils.damp(p.y, goalY, 9, dt);
    }
    placeOnScreen(root, camera, screenDepth(camera, fx), p.x, p.y);
    root.scale.multiplyScalar(fit);

    // Motion: rise in with an overshoot, a squash on each new line, flick down to leave.
    const body = inner.current;
    if (body) {
      const rise = springTo1(a.t, 2.2, 0.5);
      let y = -0.2 * (1 - rise);
      let squash = ringDown(a.lineT, -0.12, 3, 7);
      let rot = ringDown(a.t, 0.03, 1.6, 4);
      if (a.leaving >= 0) {
        const q = clamp01(a.leaving / 0.42);
        y += a.leaving < 0.1 ? 0.012 * (a.leaving / 0.1) : 0.012 - 0.3 * easeInBack(q, 1.6);
        squash += a.leaving < 0.1 ? -0.08 : 0.1 * q;
        rot += 0.05 * q;
      }
      body.position.y = y;
      body.scale.set(1 / Math.sqrt(1 + squash), 1 + squash, 1);
      body.rotation.z = rot;
    }
  }, CAPTION_PRIORITY);

  const lines = shown?.lines ?? [];
  const width = shown?.width ?? MIN_WIDTH;
  const height = slabHeight(lines.length);
  const slab = slabGeometry(width, height, 0.026, 0.03);
  return (
    <group ref={group} visible={false}>
      <group ref={inner}>
        <mesh
          geometry={slab}
          material={[
            uiToon(UI_COLORS.plum, { glow: 0.28, overlay: true, depthWrite: true }),
            uiToon(UI_COLORS.plumEdge, { glow: 0.2, overlay: true, depthWrite: true }),
          ]}
          renderOrder={RENDER_ORDER}
        />
        <mesh geometry={slab} material={uiOutline(UI_COLORS.plum, 2.4, { overlay: true })} renderOrder={RENDER_ORDER - 1} />
        {/* The speaker tab, top left. */}
        <group position={[-width / 2 + TAB_W / 2 + 0.018, height / 2 + 0.004, 0.022]} rotation={[0, 0, 0.04]}>
          <mesh
            geometry={slabGeometry(TAB_W, TAB_H, 0.018, 0.018)}
            material={[uiToon(UI_COLORS.gold, { glow: 0.3, overlay: true }), uiToon(UI_COLORS.cardEdge, { overlay: true })]}
            renderOrder={RENDER_ORDER + 1}
          />
          <Suspense fallback={null}>
            <StageText
              size={0.019}
              color={UI_COLORS.ink}
              outline={0}
              position={[0, 0, 0.011]}
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
              onMesh={onMesh}
              x={-width / 2 + PAD_X}
              y={((lines.length - 1) / 2 - index) * LINE_STEP - 0.004}
            />
          ))}
        </Suspense>
      </group>
    </group>
  );
}
