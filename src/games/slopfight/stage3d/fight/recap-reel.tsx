"use client";

// The recap's replay reel (FINISHED, viewer null). A strip of fight cards
// rises along the bottom of the frame over the podium (round, arena, the two
// champions, how it ended, the recap line); picking one opens a replay screen
// that re-simulates that fight from its stored inputs with the same playback
// as the live stage, in its own arena (the set the fight was fought in, not
// the podium's), with its own little director, sparks and health bars.
//
// The reel draws in a heads-up layer over the stage (a drei <Hud> after the
// post stack), so the podium's depth of field and crane never blur or clip
// it; the replay renders into a texture with its own camera. Quiet by
// default (a recap is not live): the SOUND chip turns the replay's sounds on.

import { Hud, PerspectiveCamera, RenderTexture, useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Vector3, type Group, type PerspectiveCamera as ThreePerspectiveCamera } from "three";
import { sfx, type SfxName, type SfxOptions } from "../../audio";
import { ARENAS } from "../../arenas";
import type { Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import { loadRapier, type FightEvent, type FightInput } from "../../sim";
import { TOY_COLOR_VALUES } from "../../vocab";
import { ARENA_FILES, prepareSet } from "../arena/arena";
import { CrowdController } from "../arena/crowd";
import { copyPose, createPose, createShotState, SHOTS, type ShotId, type ShotParams } from "../director/shots";
import { moodFor } from "../look/moods";
import { readIrradianceProbe } from "../look/irradiance";
import { ArenaPracticals } from "../look/lighting";
import type { PhaseSceneProps } from "../scenes/phase-scene";
import { useStage } from "../services";
import { Bar, type BarHandle } from "../ui3d/bar";
import { Card, faceZ } from "../ui3d/card";
import { slabGeometry } from "../ui3d/geometry";
import { darkOf, lightOf, UI_COLORS, uiOutline, uiToon } from "../ui3d/materials";
import { MotionGroup } from "../ui3d/motion-group";
import { fitTextSize, StageText } from "../ui3d/text";
import { sparkColors } from "./conduct";
import { sheetsOf, useFightFeed, type FightFeed, type FightRow } from "./feed";
import { barColor, FightCreature } from "./fighters";
import { FightFx, FxSystem } from "./fx";
import { fightInputOf } from "./playback";
import { FightPlayer } from "./player";

/** The heads-up camera: the layout works in its z = 0 plane. */
const HUD_DISTANCE = 10;
const HUD_FOV = 30;
/** A breath after the podium scene mounts the reel (it already waits for the crane). */
const REEL_DELAY_MS = 800;
/** A beat before the replay's sim time starts. */
const LEAD_MS = 700;
/** Hold on the finish before the "watch again" chip. */
const END_HOLD_MS = 2_600;

const METHOD_TEXT = { KO: "K.O.!", RINGOUT: "RING OUT!", DECISION: "DECISION", SUDDEN_DEATH: "SUDDEN DEATH" } as const;

export function fightLabel(fight: Pick<FightRow, "round" | "isFinal" | "isThirdPlace">): string {
  if (fight.isFinal) return "THE FINAL";
  if (fight.isThirdPlace) return "THIRD PLACE";
  return `ROUND ${fight.round}`;
}

export interface CardLine {
  text: string;
  /** The winner's line (bold, with the gold pip). */
  winner?: boolean;
  /** Small connecting text ("vs"). */
  small?: boolean;
  /** The method line (in the arena's colour). */
  method?: boolean;
}

/** A card's body: both champions (the winner marked), how it ended, the arena. */
export function fightSummary(fight: FightRow, sheets: { A: Champion | null; B: Champion | null }): CardLine[] {
  const outcome = fight.outcome;
  const how = !outcome ? null : fight.decidedBySeed || outcome.decidedBySeed ? "THE JUDGES' COIN" : METHOD_TEXT[outcome.method].replace("!", "");
  return [
    { text: sheets.A?.name ?? "A", winner: outcome?.winner === "A" },
    { text: "vs", small: true },
    { text: sheets.B?.name ?? "B", winner: outcome?.winner === "B" },
    { text: how ? `${how}  ·  ${ARENAS[fight.arena].name}` : ARENAS[fight.arena].name, method: true },
  ];
}

/** In the recap (FINISHED, viewer null): the strip of fight cards that replays any fight. */
export function RecapReel({ input }: PhaseSceneProps) {
  const feed = useFightFeed();
  const fights = useMemo(() => (feed ? feed.fights.filter((fight) => fight.outcome !== null) : []), [feed]);
  // Only the read-only recap gets the reel; a live room's podium stays clean.
  if (!feed || fights.length === 0 || input.live) return null;
  return (
    <Hud renderPriority={2}>
      <ReelHud feed={feed} fights={fights} />
    </Hud>
  );
}

function ReelHud({ feed, fights }: { feed: FightFeed; fights: readonly FightRow[] }) {
  const size = useThree((state) => state.size);
  const aspect = size.width / Math.max(1, size.height);
  const halfH = HUD_DISTANCE * Math.tan(MathUtils.degToRad(HUD_FOV / 2));
  const halfW = halfH * aspect;
  const [shown, setShown] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [sound, setSound] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), REEL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => () => void (document.body.style.cursor = ""), []);

  const count = fights.length;
  const margin = Math.max(0.25, halfW * 0.05);
  const gap = 0.1;
  const cardW = Math.min(1.75, (halfW * 2 - margin * 2 - gap * (count - 1)) / count);
  const cardH = Math.min(cardW * 0.62, halfH * 0.36);
  const stripY = -halfH + cardH / 2 + halfH * 0.06;
  const fight = fights.find((row) => row.id === selected) ?? null;
  // One text size for the whole strip (the longest line of any card fits).
  const textSize = useMemo(() => {
    let size = 0.11;
    for (const row of fights) {
      for (const line of fightSummary(row, sheetsOf(feed, row))) {
        if (!line.small) size = Math.min(size, fitTextSize(line.text, cardW * 0.8, (cardH - 0.26) / 3.6));
      }
    }
    return size;
  }, [feed, fights, cardW, cardH]);

  // The replay screen fills the space above the strip.
  const top = halfH - 0.32;
  const bottom = stripY + cardH / 2 + 0.55;
  const screenH = Math.max(1, Math.min(top - bottom - 0.3, ((halfW * 2 - margin * 2) * 9) / 16));
  const screenW = (screenH * 16) / 9;
  const screenY = (top + bottom) / 2 - 0.12;

  if (!shown) return <HudRig />;
  return (
    <>
      <HudRig />
      <StageText position={[-halfW + margin, stripY + cardH / 2 + 0.2, 0]} anchorX="left" size={0.17} color={UI_COLORS.bone} outlineColor={UI_COLORS.plumEdge} outline={0.14} glow={0.2} castShadow={false}>
        {fight ? "PICK ANOTHER FIGHT" : "WATCH A FIGHT AGAIN"}
      </StageText>
      {fights.map((row, index) => (
        <ReelCard
          key={row.id}
          feed={feed}
          fight={row}
          index={index}
          position={[-halfW + margin + cardW / 2 + index * (cardW + gap), stripY, 0]}
          width={cardW}
          height={cardH}
          textSize={textSize}
          selected={row.id === selected}
          onSelect={() => {
            setSelected(row.id);
            setRun((value) => value + 1);
          }}
        />
      ))}
      {fight && (
        <ReplayScreen
          key={`${fight.id}:${run}`}
          feed={feed}
          fight={fight}
          sound={sound}
          position={[0, screenY, -0.2]}
          width={screenW}
          height={screenH}
          onClose={() => setSelected(null)}
          onAgain={() => setRun((value) => value + 1)}
          onSound={() => setSound((value) => !value)}
        />
      )}
    </>
  );
}

function HudRig() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, HUD_DISTANCE]} fov={HUD_FOV} near={0.5} far={40} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[2.5, 4, 8]} intensity={2.4} />
    </>
  );
}

/** Pointer handlers for a clickable group (a pointer cursor while hovered). */
function usePress(onPress: () => void) {
  const [hover, setHover] = useState(false);
  return {
    hover,
    handlers: {
      onClick: (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onPress();
      },
      onPointerOver: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      },
      onPointerOut: () => {
        setHover(false);
        document.body.style.cursor = "";
      },
    },
  };
}

function ReelCard({
  feed,
  fight,
  index,
  position,
  width,
  height,
  selected,
  onSelect,
  textSize,
}: {
  feed: FightFeed;
  fight: FightRow;
  index: number;
  position: [number, number, number];
  width: number;
  height: number;
  selected: boolean;
  onSelect: () => void;
  textSize: number;
}) {
  const lift = useRef<Group>(null);
  const press = usePress(onSelect);
  const sheets = sheetsOf(feed, fight);
  const accent = TOY_COLOR_VALUES[ARENAS[fight.arena].accent].hex;
  const lines = fightSummary(fight, sheets);
  const size = textSize;
  const band = Math.min(height * 0.3, 0.2);
  // Rows under the title band: name, vs, name, method.
  const rowY = (index: number) => height / 2 - band - 0.06 - size * 0.7 - [0, 0.95, 1.8, 3.05][index]! * size;
  useFrame((_, realDelta) => {
    const node = lift.current;
    if (!node) return;
    const up = selected ? 0.16 : press.hover ? 0.09 : 0;
    node.position.y = MathUtils.damp(node.position.y, up, 12, realDelta);
    node.scale.setScalar(MathUtils.damp(node.scale.x, press.hover || selected ? 1.05 : 1, 12, realDelta));
  });
  return (
    <group position={position} {...press.handlers}>
      <group ref={lift}>
        {selected && (
          <mesh position={[0, 0, -0.03]} geometry={slabGeometry(width + 0.09, height + 0.09, 0.02, Math.min(width, height) * 0.12)} material={uiToon(UI_COLORS.gold, { glow: 0.5 })} />
        )}
        <Card
          width={width}
          height={height}
          enter="rise"
          enterDistance={1.4}
          delay={index * 0.09}
          accent={accent}
          title={fightLabel(fight)}
          body={null}
          idle={0.25}
          seed={index + 1}
          realtime
          sound={false}
        >
          {lines.map((line, row) => (
            <group key={row} position={[0, rowY(row), faceZ() + 0.006]}>
              {line.winner && (
                <mesh position={[-Math.min(width * 0.42, line.text.length * size * 0.29 + size * 0.7), 0, 0]} geometry={slabGeometry(size * 0.55, size * 0.55, 0.01, size * 0.27)} material={uiToon(UI_COLORS.gold, { glow: 0.4 })} />
              )}
              <StageText
                size={line.small ? size * 0.75 : line.method ? size * 0.82 : size}
                color={line.method ? darkOf(accent, 0.35) : line.winner || line.small ? UI_COLORS.ink : UI_COLORS.inkDim}
                weight={line.winner || line.method ? 700 : 600}
                maxWidth={width * 0.9}
                castShadow={false}
              >
                {line.text}
              </StageText>
            </group>
          ))}
        </Card>
      </group>
    </group>
  );
}

/** A small pill button in the heads-up layer. */
function HudButton({ label, position, onPress, color = UI_COLORS.plum }: { label: string; position: [number, number, number]; onPress: () => void; color?: string }) {
  const press = usePress(onPress);
  const size = 0.13;
  const width = fitTextWidth(label, size) + size * 1.6;
  const height = size * 2;
  const geometry = slabGeometry(width, height, 0.04, height / 2);
  const fill = press.hover ? lightOf(color, 0.18) : color;
  return (
    <group position={position} {...press.handlers}>
      <mesh geometry={geometry} material={uiToon(fill, { glow: 0.2 })} />
      <mesh geometry={geometry} material={uiOutline(UI_COLORS.plumEdge, 2)} />
      <StageText position={[0, -size * 0.04, faceZ(0.04) + 0.01]} size={size} color={UI_COLORS.bone} glow={0.2} castShadow={false}>
        {label}
      </StageText>
    </group>
  );
}

/** Rough width of a label at an em size (the kit's chips use the same estimate). */
function fitTextWidth(label: string, size: number): number {
  return label.length * size * 0.62;
}

// ---------------------------------------------------------------------------
// The replay screen
// ---------------------------------------------------------------------------

interface ReplayState {
  done: boolean;
  method: string | null;
}

function ReplayScreen({
  feed,
  fight,
  sound,
  position,
  width,
  height,
  onClose,
  onAgain,
  onSound,
}: {
  feed: FightFeed;
  fight: FightRow;
  sound: boolean;
  position: [number, number, number];
  width: number;
  height: number;
  onClose: () => void;
  onAgain: () => void;
  onSound: () => void;
}) {
  const services = useStage();
  const sheets = sheetsOf(feed, fight);
  const input = useMemo(() => fightInputOf(fight, sheets), [fight, sheets]);
  const player = useMemo(
    () => (input && fight.outcome ? new FightPlayer(input, fight.outcome, { label: `recap ${fight.id}` }) : null),
    [input, fight],
  );
  useEffect(() => {
    if (!player) return;
    let alive = true;
    void loadRapier()
      .then((R) => {
        if (alive) player.start(R);
      })
      .catch((error: unknown) => console.warn("[slopfight] recap replay could not load the sim", error));
    return () => {
      alive = false;
    };
  }, [player]);
  const [state, setState] = useState<ReplayState>({ done: false, method: null });
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const texture = services.quality.settings.level >= 2 ? 1280 : 900;
  const header = `${fightLabel(fight)}  ·  ${ARENAS[fight.arena].name}`;
  const line = fight.recapLine ?? (input ? "" : "This fight was settled by the judges' coin.");
  return (
    <MotionGroup position={position} enter="pop" realtime idle={0}>
      <mesh position={[0, 0, -0.04]} geometry={slabGeometry(width + 0.16, height + 0.16, 0.06, 0.12)} material={uiToon(UI_COLORS.plum, { glow: 0.15 })} />
      <mesh position={[0, 0, -0.04]} geometry={slabGeometry(width + 0.16, height + 0.16, 0.06, 0.12)} material={uiOutline(UI_COLORS.plumEdge, 2.4)} />
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#ffffff">
          {input && player ? (
            <RenderTexture attach="map" width={texture} height={Math.round((texture * 9) / 16)} samples={4}>
              <Suspense fallback={null}>
                <ReplayWorld fight={fight} input={input} player={player} sheets={{ A: input.a, B: input.b }} sound={soundRef} onState={setState} />
              </Suspense>
            </RenderTexture>
          ) : null}
        </meshBasicMaterial>
      </mesh>
      {input && player && <ReplayBars player={player} sheets={{ A: input.a, B: input.b }} width={width} height={height} />}
      <StageText position={[-width / 2, height / 2 + 0.2, 0]} anchorX="left" size={0.17} color={UI_COLORS.bone} outlineColor={UI_COLORS.plumEdge} outline={0.14} glow={0.25} castShadow={false}>
        {header}
      </StageText>
      {state.method && (
        <StageText position={[0, 0, 0.05]} size={Math.min(0.62, height * 0.2)} color={UI_COLORS.gold} outlineColor={UI_COLORS.plumEdge} outline={0.1} glow={0.4} castShadow={false}>
          {state.method}
        </StageText>
      )}
      {line && (
        <StageText position={[0, -height / 2 - 0.2, 0]} size={Math.min(0.13, fitTextSize(line, width, 0.13))} maxWidth={width} color={UI_COLORS.bone} outlineColor={UI_COLORS.plumEdge} outline={0.12} glow={0.2} castShadow={false}>
          {line}
        </StageText>
      )}
      <HudButton label="CLOSE" position={[width / 2 - 0.3, height / 2 + 0.2, 0]} onPress={onClose} color={UI_COLORS.tomato} />
      <HudButton label={sound ? "SOUND ON" : "SOUND OFF"} position={[width / 2 - 1.18, height / 2 + 0.2, 0]} onPress={onSound} />
      {state.done && <HudButton label="WATCH AGAIN" position={[0, -height * 0.18, 0.06]} onPress={onAgain} color={UI_COLORS.gold} />}
    </MotionGroup>
  );
}

// ---------------------------------------------------------------------------
// The replayed fight (rendered into the screen's texture)
// ---------------------------------------------------------------------------

const ASPECT = 16 / 9;

/** A small director for the replay: the stage's own shot solvers on the fight's set. */
class ReplayDirector {
  /** The replay screen is small on the TV: the base framing is the close two-shot. */
  readonly baseId: ShotId = "fight_close";
  id: ShotId = "fight_close";
  params: ShotParams = {};
  targets: Array<() => Vector3> = [];
  base: Array<() => Vector3> = [];
  private state = createShotState();
  private readonly prev = createPose();
  readonly out = createPose();
  private first = true;
  private t = 0;
  private startedAt = 0;
  private until = Infinity;
  private lastCut = -10;
  private trauma = 0;

  cut(id: ShotId, targets: Array<() => Vector3>, hold: number, params: ShotParams = {}, force = false): void {
    if (!force && this.t - this.lastCut < 1.2 && this.id !== this.baseId) return;
    copyPose(this.prev, this.out);
    this.id = id;
    this.targets = targets;
    this.params = params;
    this.state = createShotState();
    this.startedAt = this.t;
    this.until = hold > 0 ? this.t + hold : Infinity;
    this.first = true;
    this.lastCut = this.t;
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, nodes: Parameters<(typeof SHOTS)["fight_wide"]["solve"]>[0]["nodes"], camera: ThreePerspectiveCamera): void {
    this.t += dt;
    if (this.t > this.until) this.cut(this.baseId, this.base, 0, {}, true);
    const targets = this.targets.map((target) => target());
    SHOTS[this.id].solve(
      { nodes, targets, t: this.t - this.startedAt, dt, aspect: ASPECT, prev: this.prev, params: this.params, first: this.first },
      this.state,
      this.out,
    );
    this.first = false;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const shake = this.trauma * this.trauma * 0.12;
    camera.position.copy(this.out.position);
    camera.position.x += (Math.sin(this.t * 61) + Math.sin(this.t * 37)) * shake * 0.5;
    camera.position.y += Math.sin(this.t * 53 + 1) * shake * 0.5;
    if (camera.fov !== this.out.fov) {
      camera.fov = this.out.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(this.out.target);
    if (this.out.roll) camera.rotateZ(MathUtils.degToRad(this.out.roll));
  }
}

/** Classic fighting-game bars along the top of the replay screen, names under them. */
function ReplayBars({ player, sheets, width, height }: { player: FightPlayer; sheets: { A: Champion; B: Champion }; width: number; height: number }) {
  const barA = useRef<BarHandle>(null);
  const barB = useRef<BarHandle>(null);
  useFrame(() => {
    const set = (side: Side, bar: BarHandle | null) => {
      const max = player.maxHealth[side] || 1;
      bar?.set(Math.max(0, Math.min(1, player.health[side] / max)));
    };
    set("A", barA.current);
    set("B", barB.current);
  });
  const barW = width * 0.4;
  const barH = Math.max(0.09, height * 0.045);
  const y = height / 2 - barH * 1.3;
  const nameSize = Math.min(0.13, barH * 1.15);
  return (
    <group position={[0, 0, 0.03]}>
      {(["A", "B"] as const).map((side) => {
        const x = (side === "A" ? -1 : 1) * (width / 2 - barW / 2 - 0.1);
        return (
          <group key={side} position={[x, y, 0]}>
            <Bar ref={side === "A" ? barA : barB} value={1} width={barW} height={barH} color={barColor(sheets[side])} flip={side === "B"} sound={false} />
            <StageText
              position={[side === "A" ? -barW / 2 : barW / 2, -barH * 1.25, 0.02]}
              anchorX={side === "A" ? "left" : "right"}
              size={nameSize}
              color={UI_COLORS.bone}
              outlineColor={UI_COLORS.plumEdge}
              outline={0.16}
              glow={0.2}
              castShadow={false}
            >
              {sheets[side].name}
            </StageText>
          </group>
        );
      })}
    </group>
  );
}

function ReplayWorld({
  fight,
  input,
  player,
  sheets,
  sound,
  onState,
}: {
  fight: FightRow;
  input: FightInput;
  player: FightPlayer;
  sheets: { A: Champion; B: Champion };
  sound: { current: boolean };
  onState: (state: ReplayState) => void;
}) {
  const arena = fight.arena;
  const mood = moodFor(arena);
  const gltf = useGLTF(ARENA_FILES[arena]);
  const prepared = useMemo(() => prepareSet(arena, gltf.scene, mood), [arena, gltf.scene, mood]);
  const probe = useMemo(() => readIrradianceProbe(prepared.nodes.get("Probe_Ambient")?.userData.sf_probe_sh), [prepared]);
  const crowd = useMemo(() => new CrowdController(), []);
  useEffect(() => {
    crowd.bind(prepared.nodes.crowd);
    return () => {
      crowd.reset();
      prepared.hazards.reset();
    };
  }, [crowd, prepared]);
  useEffect(() => () => prepared.materials.forEach((material) => material.dispose()), [prepared]);
  const fx = useMemo(() => new FxSystem(), []);
  const camera = useRef<ThreePerspectiveCamera>(null);
  const director = useMemo(() => new ReplayDirector(), []);
  const torso = useMemo(() => ({ A: new Vector3(-1.6, 0.5, 0), B: new Vector3(1.6, 0.5, 0) }), []);
  const colors = useMemo(() => ({ A: sparkColors(sheets.A.palette), B: sparkColors(sheets.B.palette) }), [sheets]);
  const clock = useRef({ ms: -LEAD_MS, stop: 0, slow: 0, elapsed: 0, landed: { A: false, B: false }, ringout: null as Side | null, finished: false, done: false });
  const [timeScale, setTimeScale] = useState(1);
  const scaleRef = useRef(1);
  const [ready, setReady] = useState(player.ready);

  useEffect(() => {
    director.base = [() => torso.A, () => torso.B];
    director.cut(director.baseId, director.base, 0, {}, true);
  }, [director, torso]);

  const play = (name: SfxName, options: SfxOptions = {}) => {
    if (!sound.current) return;
    try {
      sfx.play(name, options);
    } catch {
      // Sound is decoration.
    }
  };

  const onEvent = (event: FightEvent) => {
    const c = clock.current;
    switch (event.kind) {
      case "contact":
        director.shake(0.3);
        break;
      case "hit":
      case "throw": {
        if (event.damage <= 0) break;
        const point = new Vector3(event.point[0] ?? 0, event.point[1] ?? 0.5, event.point[2] ?? 0);
        const big = event.kind === "hit" ? event.big : event.damage >= 18;
        const strength = Math.min(1, Math.max(0.15, event.damage / 30));
        fx.spark(point, { colors: colors[event.side], big, strength });
        director.shake(big ? 0.7 : 0.25 + strength * 0.3);
        c.stop = big ? 0.11 : 0.067;
        if (big) {
          c.slow = 0.5;
          director.cut("slowmo_orbit", [() => point], 1.1, { side: event.side }, true);
        }
        const intensity = big ? 0.92 : 0.3 + strength * 0.45;
        if (event.kind === "throw" || event.type === "GRAPPLE") play("grappleSlam", { intensity });
        else if (event.type === "STRIKE") play("strikeThwack", { intensity });
        else play("trickBonk", { intensity });
        if (big) play("crowdGasp", { intensity: 0.7, gain: 0.8 });
        break;
      }
      case "edge": {
        const side = event.side;
        director.cut("edge_drama", [() => torso[side]], 1.6);
        play("edgeAlarm", { intensity: 0.7 });
        break;
      }
      case "ringout": {
        const side = event.side;
        c.ringout = side;
        const lead = new Vector3();
        director.cut("ragdoll_follow", [() => lead.copy(torso[side])], 0, {}, true);
        play("ringOutScream", { intensity: 0.9 });
        break;
      }
      case "ko": {
        const side = event.side;
        director.cut("fight_close", [() => torso[side]], 2.5, {}, true);
        director.shake(0.6);
        play("koSting", { intensity: 1 });
        break;
      }
      case "end":
        c.finished = true;
        crowd.cheer(1);
        onState({ done: false, method: METHOD_TEXT[event.method] });
        play("crowdCheer", { intensity: 1 });
        break;
      default:
        break;
    }
  };

  useFrame((_, realDelta) => {
    const c = clock.current;
    const dt = Math.min(realDelta, 0.1);
    c.elapsed += dt;
    // Glowing signs and water keep moving.
    for (const material of prepared.timed) material.uniforms.uTime!.value = c.elapsed;
    for (const glow of prepared.glows) {
      glow.uniforms.uTime.value = c.elapsed;
      glow.uniforms.uFlicker.value = 1;
      glow.uniforms.uAlert.value = 0;
    }
    if (!player.ready) return;
    if (!ready) setReady(true);
    let rate = 1;
    if (c.stop > 0) {
      c.stop -= dt;
      rate = 0;
    } else if (c.slow > 0) {
      c.slow -= dt;
      rate = 0.3;
    }
    const quantized = Math.round(rate * 10) / 10;
    crowd.update(dt * rate);
    prepared.hazards.update(Math.max(0, c.ms) / 1000, { x: 1, z: 0, strength: 0 });
    if (quantized !== scaleRef.current) {
      scaleRef.current = quantized;
      setTimeScale(quantized);
    }
    const endMs = fight.outcome?.endMs ?? input.limitMs;
    const limit = endMs + END_HOLD_MS;
    c.ms = Math.min(limit, c.ms + dt * 1000 * rate);
    const played = player.update(Math.max(0, c.ms), dt * rate);
    for (const { event, fresh } of played) if (fresh) onEvent(event);
    const samples = player.samples;
    if (samples) {
      for (const side of ["A", "B"] as const) {
        const p = samples[side].root.p;
        torso[side].set(p[0], p[1], p[2]);
        const landing = player.landingMs[side];
        if (landing !== null && !c.landed[side] && player.t >= landing) {
          c.landed[side] = true;
          if (sound.current) {
            try {
              sfx.landing(arena, { intensity: 0.9 });
            } catch {
              // Sound is decoration.
            }
          }
          if (ARENAS[arena].ringOutLanding === "splash") fx.splash(torso[side].clone());
          director.shake(0.5);
        }
      }
    }
    if (c.ms >= limit && !c.done) {
      c.done = true;
      onState({ done: true, method: fight.outcome ? METHOD_TEXT[fight.outcome.method] : null });
    }
    if (camera.current) director.update(dt, prepared.nodes, camera.current);
  }, -20);

  const topY = ARENAS[arena].geometry.topY;
  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault manual aspect={ASPECT} fov={40} near={0.1} far={200} position={[0, 3, 9]} />
      <color attach="background" args={[mood.fog.color]} />
      <fog attach="fog" args={[mood.fog.color, mood.fog.near, mood.fog.far]} />
      {probe ? <primitive object={probe} /> : <hemisphereLight args={[mood.bounce.sky, mood.bounce.ground, mood.bounce.intensity]} />}
      {mood.key.intensity > 0 && <directionalLight color={mood.key.color} intensity={mood.key.intensity} position={mood.key.position as [number, number, number]} />}
      {mood.fill.intensity > 0 && <directionalLight color={mood.fill.color} intensity={mood.fill.intensity} position={mood.fill.position as [number, number, number]} />}
      {mood.rim.intensity > 0 && <directionalLight color={mood.rim.color} intensity={mood.rim.intensity} position={mood.rim.position as [number, number, number]} />}
      <ArenaPracticals lights={prepared.nodes.lights} scale={mood.practicalScale} />
      <primitive object={prepared.root} />
      {ready && (
        <>
          <ReplayFighter player={player} side="A" timeScale={timeScale} topY={topY} />
          <ReplayFighter player={player} side="B" timeScale={timeScale} topY={topY} />
        </>
      )}
      <FightFx system={fx} />
    </>
  );
}

/** A fighter in the replay, with a soft blob shadow (the replay has no shadow-casting light). */
function ReplayFighter({ player, side, timeScale, topY }: { player: FightPlayer; side: Side; timeScale: number; topY: number }) {
  const blob = useRef<Group>(null);
  const driver = player.drivers[side];
  useFrame(() => {
    const node = blob.current;
    if (!node) return;
    const [x, y, z] = driver.driver.position;
    const lift = Math.max(0, y - topY);
    node.position.set(x, topY + 0.006, z);
    node.visible = y > topY - 0.3;
    const s = driver.height * 0.55 * Math.max(0.3, 1 - lift * 0.6);
    node.scale.set(s, s, s);
  });
  return (
    <>
      <FightCreature player={player} side={side} timeScale={timeScale} />
      <group ref={blob}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
