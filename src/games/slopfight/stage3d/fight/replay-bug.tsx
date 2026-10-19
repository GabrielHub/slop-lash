"use client";

// The REPLAY bug: a tomato pill with a blinking dot, top left of the frame,
// with a plum tab under it naming the moment ("THE KNOCKOUT"). Fixed to the
// camera like The Voice's caption (placed every frame after the camera rig,
// drawn over the set, at the focus distance under depth of field so it stays
// sharp). It pops in as the replay starts and flicks up and out as it ends.
// Mounted with RESULT, hidden, so its text is laid out before it is needed,
// and drawn where nothing shows (behind the lens) while RESULT opens: on a
// stage that has drawn no overlay UI yet, its programs finish linking on their
// first draw (ANGLE), a stall better spent under the entry wipe than on the
// replay's first frame.

import { useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import { Vector3, type Group, type Object3D, type PerspectiveCamera } from "three";
import { useStage } from "../services";
import { CAPTION_PRIORITY } from "../ui3d/caption";
import { slabGeometry } from "../ui3d/geometry";
import { UI_COLORS, uiOutline, uiToon } from "../ui3d/materials";
import { clamp01, easeInBack, ringDown, springTo1 } from "../ui3d/motion";
import { StageText } from "../ui3d/text";

/** Distance in front of the camera when no depth of field is on. */
const DEPTH = 2.2;
/** Local units: 1 = the full view height. */
const MARGIN = 0.07;
const PILL = { width: 0.205, height: 0.064 };
const TAB = { width: 0.25, height: 0.04 };
const RENDER_ORDER = 940;
/** The dot blinks this many times a second. */
const BLINK_HZ = 1.6;
/** Drawn behind the lens for this long after mount (the text lays out within it). */
const PRIME_S = 0.6;

const tmpForward = new Vector3();
const tmpUp = new Vector3();
const tmpRight = new Vector3();
const tmpFocus = new Vector3();
const unculled = (object: Object3D) => {
  object.frustumCulled = false;
};

export function ReplayBug({ label, shown }: { label: string; shown: () => boolean }) {
  const services = useStage();
  const group = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const dot = useRef<Group>(null);
  const anim = useRef({ t: 0, leaving: -1, up: false, primed: 0 });

  useFrame((state) => {
    const root = group.current;
    if (!root) return;
    const { clock, fx } = services;
    const a = anim.current;
    const dt = clock.realDelta;
    const up = shown();
    if (up && !a.up) {
      a.t = 0;
      a.leaving = -1;
    }
    if (!up && a.up) a.leaving = 0;
    a.up = up;
    if (a.leaving >= 0) a.leaving += dt;
    a.primed += dt;
    const priming = !up && a.leaving < 0 && a.primed < PRIME_S;
    root.visible = up || (a.leaving >= 0 && a.leaving < 0.4) || priming;
    if (!root.visible) return;
    const camera = state.camera as PerspectiveCamera;
    tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (priming) {
      // Unculled behind the lens: every part draws (and links its program), none shows.
      root.traverse(unculled);
      root.position.copy(camera.position).addScaledVector(tmpForward, -1);
      return;
    }
    a.t += dt;

    // Placement: top left, in front of the camera.
    let depth = DEPTH;
    if (fx.dof.strength > 0.05) {
      tmpFocus.copy(fx.dof.focus).sub(camera.position);
      depth = Math.min(14, Math.max(1.5, tmpFocus.dot(tmpForward)));
    }
    const viewHeight = 2 * depth * Math.tan(((camera.fov ?? 40) * Math.PI) / 360);
    const aspect = camera.aspect || 16 / 9;
    // Below the letterbox's top bar when it is up.
    const top = 0.5 - MARGIN - 0.06 * fx.letterbox;
    const left = -aspect / 2 + MARGIN;
    tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    root.position
      .copy(camera.position)
      .addScaledVector(tmpForward, depth)
      .addScaledVector(tmpUp, top * viewHeight)
      .addScaledVector(tmpRight, left * viewHeight);
    root.quaternion.copy(camera.quaternion);
    root.scale.setScalar(viewHeight);

    // Pop in with a tilt that rings out; flick up and away to leave.
    const body = inner.current;
    if (body) {
      const pop = springTo1(a.t, 2.6, 0.45);
      let y = 0;
      let scale = 0.4 + 0.6 * pop;
      let rot = ringDown(a.t, -0.12, 2.2, 5);
      if (a.leaving >= 0) {
        const p = clamp01(a.leaving / 0.35);
        y = 0.18 * easeInBack(p, 1.6);
        scale *= 1 - 0.3 * p;
        rot += 0.1 * p;
      }
      body.position.y = y;
      body.scale.setScalar(Math.max(0.001, scale));
      body.rotation.z = rot;
    }
    // The recording dot: on, off, on.
    if (dot.current) dot.current.scale.setScalar((a.t * BLINK_HZ) % 1 < 0.62 ? 1 : 0.001);
  }, CAPTION_PRIORITY);

  const pillX = PILL.width / 2;
  const tabX = TAB.width / 2 + 0.012;
  const tabY = -PILL.height / 2 - TAB.height / 2 + 0.004;
  return (
    <group ref={group} visible={false}>
      <group ref={inner}>
        {/* The pill, its left edge at the anchor. */}
        <group position={[pillX, -PILL.height / 2, 0]}>
          <mesh
            geometry={slabGeometry(PILL.width, PILL.height, 0.03, PILL.height / 2)}
            material={[uiToon(UI_COLORS.tomato, { glow: 0.35, overlay: true }), uiToon(UI_COLORS.plumEdge, { glow: 0.2, overlay: true })]}
            renderOrder={RENDER_ORDER + 1}
          />
          <mesh
            geometry={slabGeometry(PILL.width, PILL.height, 0.03, PILL.height / 2)}
            material={uiOutline(UI_COLORS.tomato, 2.4, { overlay: true })}
            renderOrder={RENDER_ORDER}
          />
          <group ref={dot} position={[-PILL.width / 2 + 0.03, 0, 0.022]}>
            <mesh
              geometry={slabGeometry(0.022, 0.022, 0.012, 0.011)}
              material={uiToon(UI_COLORS.bone, { glow: 0.6, overlay: true })}
              renderOrder={RENDER_ORDER + 2}
            />
          </group>
          <Suspense fallback={null}>
            <StageText
              size={0.036}
              color={UI_COLORS.bone}
              outlineColor={UI_COLORS.plumEdge}
              outline={0.05}
              letterSpacing={0.08}
              position={[0.014, -0.001, 0.024]}
              overlay
              renderOrder={RENDER_ORDER + 3}
              castShadow={false}
            >
              REPLAY
            </StageText>
          </Suspense>
        </group>
        {/* The moment's name, tucked under the pill. */}
        <group position={[tabX, tabY - PILL.height / 2, -0.004]} rotation={[0, 0, -0.025]}>
          <mesh
            geometry={slabGeometry(TAB.width, TAB.height, 0.02, 0.016)}
            material={[uiToon(UI_COLORS.plum, { glow: 0.28, overlay: true }), uiToon(UI_COLORS.plumEdge, { glow: 0.2, overlay: true })]}
            renderOrder={RENDER_ORDER - 2}
          />
          <Suspense fallback={null}>
            <StageText
              size={0.021}
              color={UI_COLORS.gold}
              outline={0}
              letterSpacing={0.06}
              maxWidth={TAB.width - 0.03}
              position={[0, 0, 0.014]}
              overlay
              renderOrder={RENDER_ORDER - 1}
              castShadow={false}
            >
              {label}
            </StageText>
          </Suspense>
        </group>
      </group>
    </group>
  );
}
