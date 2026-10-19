"use client";

// The Slam transition's title: an extruded 3D title fixed in front of the
// camera (re-placed every frame after the camera rig), so the rig and its own
// key light light it, fog and the post stack grade it, and the camera's shake
// shakes it. The timeline (scale, squash, flick) lives in TransitionController;
// this only renders `transitions.slam`.
//
// The sub-line ("X wins") mounts only with a slam that has one, so a stand-in
// is drawn behind the lens for a moment after the titles are prepared: on
// ANGLE its lit SDF program links on its first real draw (compileAsync does
// not), a ~100 ms stall better spent in the lobby than on the K.O.!

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Quaternion, Vector3, type Group, type Object3D, type PerspectiveCamera, type PointLight } from "three";
import { ARENA_IDS, ARENAS } from "../../arenas";
import { finaleSlamText } from "../arena/finale";
import { compileStageObjects } from "../program-cache";
import { useArenaNodes, useStage } from "../services";
import { StageText, TitleText } from "../ui3d/text";

/** Frame priority: after the camera rig (0.5), before the post stack (0.7). */
export const SLAM_PRIORITY = 0.6;
/** Distance in front of the camera, world units. Close enough that nothing on set sits between. */
const DEPTH = 2.2;
/** The title spans at most this much of the screen width, and its caps this much of the height. */
const MAX_WIDTH = 0.74;
const MAX_CAP_HEIGHT = 0.2;
/** The title's key light at full strength. */
const KEY_INTENSITY = 2.4;
/** The sub-line stand-in draws behind the lens for this long after each prepare (it lays out within it). */
const PRIME_S = 0.6;
// Build these during the lobby, then keep their geometry and materials alive.
// A slam changes visibility; it does not parse a font or extrude a new title.
const PREPARED_TITLES = [
  "FIGHT!",
  "FACE-OFF",
  "THE FINAL",
  "THIRD PLACE",
  "K.O.!",
  "RING OUT!",
  "DECISION",
  // The arenas' finales: TIP OVER!, HIGH TIDE!, THE STORM!
  ...ARENA_IDS.map((id) => finaleSlamText(ARENAS[id].finale)),
  "SUDDEN DEATH",
  "WINNER!",
  "CHAMPION",
];

const Z_AXIS = new Vector3(0, 0, 1);
const tmpForward = new Vector3();
const tmpUp = new Vector3();
const tmpRoll = new Quaternion();
const unculled = (object: Object3D) => {
  object.frustumCulled = false;
};

interface Shown {
  seq: number;
  text: string;
  sub: string | null;
  color: string;
  edgeColor: string;
}

export function SlamTitle() {
  const services = useStage();
  const { gl, camera, scene } = useThree();
  const nodes = useArenaNodes();
  const groupRef = useRef<Group>(null);
  const contentRef = useRef<Group>(null);
  const lightRef = useRef<PointLight>(null);
  const primerRef = useRef<Group>(null);
  const primed = useRef(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const seqRef = useRef(-1);
  const widths = useRef(new Map<string, number>());
  const titles = shown && !PREPARED_TITLES.includes(shown.text) ? [...PREPARED_TITLES, shown.text] : PREPARED_TITLES;
  const color = shown?.color ?? "#fff4dc";
  const edgeColor = shown?.edgeColor ?? `#${services.transitions.accentDark.getHexString()}`;
  const warmupTimer = useRef<number | null>(null);
  const prepare = useCallback(() => {
    if (warmupTimer.current !== null) window.clearTimeout(warmupTimer.current);
    primed.current = 0;
    warmupTimer.current = window.setTimeout(() => {
      warmupTimer.current = null;
      const content = contentRef.current;
      if (content) void compileStageObjects(gl, content, camera, scene).catch((error: unknown) => {
        console.warn("[slopfight] Title warmup failed", error);
      });
    }, 100);
  }, [gl, camera, scene]);
  useEffect(() => {
    prepare();
    return () => {
      if (warmupTimer.current !== null) window.clearTimeout(warmupTimer.current);
    };
  }, [prepare, nodes, color, edgeColor]);

  useFrame((state) => {
    const slam = services.transitions.slam;
    const group = groupRef.current;
    if (slam.seq !== seqRef.current && slam.text) {
      seqRef.current = slam.seq;
      setShown({ seq: slam.seq, text: slam.text, sub: slam.sub, color: slam.color, edgeColor: slam.edgeColor });
    }
    const primer = primerRef.current;
    if (primer) {
      primed.current += services.clock.realDelta;
      primer.visible = primed.current < PRIME_S;
      if (primer.visible) {
        // Unculled behind the lens: it draws (and links its program), nothing shows.
        primer.traverse(unculled);
        tmpForward.set(0, 0, -1).applyQuaternion(state.camera.quaternion);
        primer.position.copy(state.camera.position).addScaledVector(tmpForward, -1);
      }
    }
    const content = contentRef.current;
    const light = lightRef.current;
    if (!group || !content || !light) return;
    const width = widths.current.get(slam.text) ?? 0;
    const ready = width > 0 && shown?.seq === slam.seq;
    const visible = slam.visible && ready;
    // The light stays in the scene at zero instead of hiding: three.js counts
    // only visible lights into every lit material's program, so a light that
    // comes and goes recompiles the whole scene at each slam (a 120+ ms frame).
    content.visible = visible;
    light.intensity = visible ? KEY_INTENSITY : 0;
    if (!visible) return;

    const camera = state.camera as PerspectiveCamera;
    const viewHeight = 2 * DEPTH * Math.tan(((camera.fov ?? 40) * Math.PI) / 360);
    const viewWidth = viewHeight * (camera.aspect || 16 / 9);
    const fit = Math.min((viewWidth * MAX_WIDTH) / width, viewHeight * MAX_CAP_HEIGHT);

    tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    group.position
      .copy(camera.position)
      .addScaledVector(tmpForward, DEPTH)
      .addScaledVector(tmpUp, slam.offsetY * viewHeight);
    group.quaternion.copy(camera.quaternion).multiply(tmpRoll.setFromAxisAngle(Z_AXIS, slam.rotation));
    group.scale.set(fit * slam.scaleX, fit * slam.scaleY, fit);
  }, SLAM_PRIORITY);

  return (
    <>
      <group ref={groupRef}>
        {/* Its own warm key, up and to the left of the title, so it reads from every shot. */}
        <pointLight ref={lightRef} position={[-1.6, 1.4, 2.2]} intensity={0} distance={9} decay={2} color="#ffe2bf" />
        <group ref={contentRef} visible={false}>
          {/* TitleText falls back to flat text if the font cannot be read; the
              sub-line suspends on its own so it never holds the title back. */}
          {titles.map((text) => (
            <Suspense key={text} fallback={null}>
              <TitleText
                visible={shown?.text === text}
                text={text}
                size={1}
                faceColor={color}
                sideColor={edgeColor}
                onLayout={(width) => {
                  const firstLayout = !widths.current.has(text);
                  widths.current.set(text, width);
                  if (firstLayout) prepare();
                }}
                glow={0.05}
                castShadow={false}
                renderOrder={20}
              />
            </Suspense>
          ))}
          {shown?.sub && (
            <Suspense fallback={null}>
              <StageText size={0.32} color={shown.color} position={[0, -0.95, 0.1]} castShadow={false}>
                {shown.sub}
              </StageText>
            </Suspense>
          )}
        </group>
      </group>
      {/* Same props as the sub-line, so it builds the same program. */}
      <group ref={primerRef} visible={false}>
        <Suspense fallback={null}>
          <StageText size={0.32} color={color} castShadow={false}>
            WINS
          </StageText>
        </Suspense>
      </group>
    </>
  );
}
