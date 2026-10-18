"use client";

// RESULT: the winner turns to the room and showboats (its best move as a
// victory pump, smug, confetti in its colours, the fanfare) under the
// letterboxed `winner_pose`; the loser stays where the fight left it (a KO
// lies there, a ring-out stays in the drink) or, beaten on points, flops over
// with the trombone. If the fight never showed the method, it slams here
// first, over the wide shot, and the close-up follows.
// Then the cut to the back-wall scoreboard: every award flies onto
// `Scoreboard_Text` as the player's token carrying its points (the owner's
// win and finish, each correct bettor's payout), the letterbox opens, and The
// Voice has its one line. The Final calls out double points; third place
// says so. A seed-decided fight shows the judges' coin landing instead.

import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Quaternion, Vector3, type Group, type Vector3Tuple } from "three";
import { FIGHT_OUTRO_MS } from "../../constants";
import type { Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import { TOY_COLOR_VALUES } from "../../vocab";
import type { ArenaNodes, PlaneNode } from "../arena/nodes";
import { Creature, createDriver, type CreatureDriver, type CreatureHandle } from "../creature/creature";
import type { PhaseSceneProps } from "../scenes/phase-scene";
import { useStage } from "../services";
import { Confetti, type ConfettiHandle } from "../ui3d/confetti";
import { UI_COLORS } from "../ui3d/materials";
import { stageSfx } from "../ui3d/sound";
import { MARQUEE_TEXT, OnPlane, StageText, type TroikaTextMesh } from "../ui3d/text";
import { AvatarToken } from "../ui3d/tokens";
import { ownersOf, playerName, sheetsOf, useFightFeed, type FightFeed, type FightRow } from "./feed";
import { sparkColors } from "./conduct";
import { PoseDriver } from "./driver";
import { STAGE_SPECULAR_MIN_LIGHT } from "./fighters";
import { COIN_LAND_S, CoinFlip, FightMarquee, methodSlammed, spawnOf, useBaseShot } from "./parts";
import { fightInputOf, type StoredOutcomeLike } from "./playback";
import { cachedRecording } from "./player";
import type { SampledFighter } from "./recording";
import { voiceFightOf } from "./voice";
import { winnerPoseFraming, winnerPoseOrbit, winnerShape } from "./winner-frame";

const other = (side: Side): Side => (side === "A" ? "B" : "A");

declare global {
  interface Window {
    /** Dev builds: RESULT's beat clock (screenshots and console pokes). */
    __slopResult?: { t: number; beats: string[]; shot: string };
  }
}

/** Seconds into RESULT for each beat. */
export const RESULT_BEATS = {
  slam: 0.45,
  /** The cut to winner_pose (from the start, unless the method slam has to play first). */
  pose: 0,
  showboat: 0.3,
  flop: 0.55,
  voice: 0.8,
  scoreboard: 2.7,
  payouts: 3.0,
  payoutGap: 0.32,
};

type ResultBeats = typeof RESULT_BEATS;

/** A coin-decided fight: the verdict, its fanfare and the line wait for the coin to land. */
export const COIN_RESULT_BEATS: ResultBeats = {
  ...RESULT_BEATS,
  showboat: COIN_LAND_S + 0.1,
  slam: COIN_LAND_S + 0.15,
  voice: COIN_LAND_S + 0.4,
  scoreboard: 3.2,
  payouts: 3.5,
};

/**
 * FIGHT never showed the method (the stage opened late, or playback was cut
 * short): the slam lands once the entry wipe has cleared (it reveals by
 * about 0.94 s; the slam hits about 0.55 s after it starts) and plays over
 * the wide shot, where no fighter stands between it and the camera; a short
 * close-up of the winner and The Voice follow it, and the scoreboard keeps
 * the coin's timing (later payouts would not land inside RESULT's 6 s).
 */
export const LATE_SLAM_BEATS: ResultBeats = {
  ...RESULT_BEATS,
  slam: 0.7,
  showboat: 1.25,
  pose: 2.4,
  voice: 2.5,
  scoreboard: COIN_RESULT_BEATS.scoreboard,
  payouts: COIN_RESULT_BEATS.payouts,
};
/** The late slam's hold, ms (shorter than FIGHT's, to leave the close-up its time). */
const LATE_SLAM_HOLD_MS = 650;

const METHOD_SLAM: Record<StoredOutcomeLike["method"], string> = {
  KO: "K.O.!",
  RINGOUT: "RING OUT!",
  DECISION: "DECISION",
  SUDDEN_DEATH: "SUDDEN DEATH",
};

export function ResultScene({ input, nodes }: PhaseSceneProps) {
  const feed = useFightFeed();
  const fight = feed?.current ?? null;
  const sheets = feed && fight ? sheetsOf(feed, fight) : null;
  if (!feed || !fight || !fight.outcome || !sheets?.A || !sheets.B) return <ResultWaiting nodes={nodes} />;
  return (
    <Result
      key={fight.id}
      feed={feed}
      fight={fight}
      outcome={fight.outcome}
      sheets={{ A: sheets.A, B: sheets.B }}
      phaseStartedAt={input.phaseStartedAt}
      nodes={nodes}
    />
  );
}

function ResultWaiting({ nodes }: { nodes: ArenaNodes | null }) {
  useBaseShot("winner_pose", {});
  return <FightMarquee nodes={nodes} text="RESULT" />;
}

interface ResultProps {
  feed: FightFeed;
  fight: FightRow;
  outcome: StoredOutcomeLike;
  sheets: Record<Side, Champion>;
  phaseStartedAt: number | null;
  nodes: ArenaNodes | null;
}

function Result({ feed, fight, outcome, sheets, phaseStartedAt, nodes }: ResultProps) {
  const services = useStage();
  const [startedAt] = useState(() => phaseStartedAt ?? services.clock.now);
  const elapsed = useRef(() => (services.clock.now - startedAt) / 1000).current;
  const winner = outcome.winner;
  const coin = fight.decidedBySeed || outcome.decidedBySeed === true;
  const winnerName = sheets[winner].name;

  // Where both fighters ended (the recording FIGHT left in the cache), else their marks.
  const ends = useMemo(() => endStates(fight, sheets, outcome), [fight, sheets, outcome]);
  const winnerChest = useMemo(() => {
    const point = new Vector3();
    const height = ends[winner].height;
    return () => point.set(ends[winner].driver.position[0], Math.max(0, ends[winner].driver.position[1]) + height * 0.5, ends[winner].driver.position[2]);
  }, [ends, winner]);
  // winner_pose's target: lifted and slid toward the camera so the whole champion sits between the caption and the top bar (winner-frame.ts).
  const winnerFrame = useMemo(() => {
    const point = new Vector3();
    const end = ends[winner];
    const { pull, lift } = winnerPoseFraming(winnerShape(sheets[winner]));
    const director = services.director;
    return () => {
      const orbit = winnerPoseOrbit(director.shot === "winner_pose" ? director.shotAge : 0);
      const [x, y, z] = end.driver.position;
      return point.set(x + Math.sin(orbit) * pull, Math.max(0, y) + lift, z + Math.cos(orbit) * pull);
    };
  }, [ends, winner, sheets, services]);

  // Both fighters on the wide shot (a ring-out loser is far below: the winner alone).
  const wideTargets = useMemo(() => {
    const loser = ends[other(winner)];
    const point = new Vector3();
    const loserChest = () => {
      const [x, y, z] = (loser.sample ? loser.pose.driver : loser.driver).position;
      return point.set(x, y + loser.height * 0.5, z);
    };
    return outcome.method === "RINGOUT" ? [winnerChest] : [winnerChest, loserChest];
  }, [ends, winner, winnerChest, outcome.method]);

  // The method slams here only when FIGHT never showed it; it plays over the wide shot first.
  const [lateSlam] = useState(() => !coin && !methodSlammed.has(fight.id));
  // A coin-decided fight holds the coin's wide shot (CoinFlip asks for the same one).
  const supersedeBase = useBaseShot(coin || lateSlam ? "fight_wide" : "winner_pose", { targets: coin ? [] : lateSlam ? wideTargets : [winnerFrame] });
  const beats = coin ? COIN_RESULT_BEATS : lateSlam ? LATE_SLAM_BEATS : RESULT_BEATS;
  const cutToPose = useCallback(() => {
    supersedeBase();
    services.director.setBase("winner_pose", { targets: [winnerFrame] });
  }, [supersedeBase, services, winnerFrame]);
  useResultBeats({ fight, outcome, winnerName, elapsed, coin, beats, supersedeBase, cutToPose: lateSlam ? cutToPose : null });

  // The Voice's one line, on its beat.
  useEffect(() => {
    const voice = services.voice;
    const voiceFight = voiceFightOf(feed, fight);
    if (!voiceFight) return;
    const record = recordBefore(feed, fight, winner);
    const line = voice.voice.result(voiceFight, { winner, method: outcome.method }, record);
    if (line) voice.schedule([{ ...line, at: startedAt + beats.voice * 1000 }]);
    // Once per fight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, fight.id, startedAt]);

  // The marquee must not call a coin before it lands.
  const marquee = coin ? "THE JUDGES' COIN" : fight.isFinal ? "CHAMPION" : `${winnerName.toUpperCase()} WINS`;
  return (
    <>
      <FightMarquee nodes={nodes} text={marquee} />
      {coin ? (
        <Suspense fallback={null}>
          <CoinFlip feed={feed} fight={fight} phase="RESULT" live={services.live} />
        </Suspense>
      ) : (
        <>
          <Winner champion={sheets[winner]} end={ends[winner]} elapsed={elapsed} />
          <Loser champion={sheets[other(winner)]} end={ends[other(winner)]} method={outcome.method} elapsed={elapsed} />
        </>
      )}
      <WinnerConfetti champion={sheets[winner]} at={() => winnerChest()} elapsed={elapsed} beats={beats} />
      {/* Its own boundary: the payout text loading must never hide (and re-run) the whole scene. */}
      <Suspense fallback={null}>
        <Payouts feed={feed} fight={fight} winnerName={winnerName} nodes={nodes} elapsed={elapsed} beats={beats} from={winnerChest} />
      </Suspense>
    </>
  );
}

/** Wins and losses each champion had before this fight (rotates its pool lines). */
function recordBefore(feed: FightFeed, fight: FightRow, winner: Side): { winsBefore: number; lossesBefore: number } {
  const winnerId = winner === "A" ? fight.a : fight.b;
  const index = feed.fights.findIndex((row) => row.id === fight.id);
  const before = index >= 0 ? feed.fights.slice(0, index) : [];
  let wins = 0;
  let losses = 0;
  for (const row of before) {
    if (!row.outcome || (row.a !== winnerId && row.b !== winnerId)) continue;
    const side = row.a === winnerId ? "A" : "B";
    if (row.outcome.winner === side) wins += 1;
    else losses += 1;
  }
  return { winsBefore: wins, lossesBefore: losses };
}

// ---------------------------------------------------------------------------
// Direction and beats
// ---------------------------------------------------------------------------

function useResultBeats({
  fight,
  outcome,
  winnerName,
  elapsed,
  coin,
  beats,
  supersedeBase,
  cutToPose,
}: {
  fight: FightRow;
  outcome: StoredOutcomeLike;
  winnerName: string;
  elapsed: () => number;
  coin: boolean;
  beats: ResultBeats;
  supersedeBase: () => void;
  /** After a late slam: the cut from the wide shot to winner_pose. */
  cutToPose: (() => void) | null;
}) {
  const services = useStage();
  const done = useRef(new Set<string>());
  useFrame(() => {
    const t = elapsed();
    if (process.env.NODE_ENV !== "production") window.__slopResult = { t, beats: [...done.current], shot: services.director.shot };
    const sfx = stageSfx(services);
    const beat = (name: string, at: number, run: () => void, late = 1.2) => {
      if (done.current.has(name) || t < at) return;
      done.current.add(name);
      // A beat long past (a late open) is skipped, not replayed out of time.
      if (t - at <= late) run();
    };
    beat("fanfare", beats.showboat, () => {
      services.cheer(1);
      sfx.play("winFanfare", { intensity: 0.9 });
      sfx.play("crowdCheer", { intensity: 0.8 });
    });
    beat("slam", beats.slam, () => {
      if (methodSlammed.has(fight.id) && !coin) return;
      methodSlammed.add(fight.id);
      sfx.play("slam", { intensity: 0.9 });
      const text = coin ? "THE JUDGES DECIDE" : METHOD_SLAM[outcome.method];
      void services.transitions.play("slam", { text, sub: `${winnerName} wins`, holdMs: coin ? 800 : LATE_SLAM_HOLD_MS, shake: 0.5 });
    });
    if (cutToPose) {
      beat("pose", beats.pose, cutToPose, Infinity);
    }
    beat(
      "scoreboard",
      beats.scoreboard,
      () => {
        sfx.play("letterbox", { intensity: 0.6 });
        supersedeBase();
        services.director.setBase("scoreboard", { letterbox: 0 });
      },
      // Always end on the scoreboard, however late the stage opened.
      Infinity,
    );
  }, -40);
}

// ---------------------------------------------------------------------------
// The fighters
// ---------------------------------------------------------------------------

interface EndState {
  driver: CreatureDriver;
  /** The sampled end pose (proxies), when the fight's recording was at hand. */
  sample: SampledFighter | null;
  pose: PoseDriver;
  height: number;
}

/** Each fighter's state where the fight's outro left it (from the cached recording), else its mark. */
function endStates(fight: FightRow, sheets: Record<Side, Champion>, outcome: StoredOutcomeLike): Record<Side, EndState> {
  const input = fightInputOf(fight, sheets);
  const recording = input ? cachedRecording(input) : null;
  const out = {} as Record<Side, EndState>;
  for (const side of ["A", "B"] as const) {
    const pose = new PoseDriver(sheets[side], side);
    const spawn = spawnOf(fight.arena, side);
    let sample: SampledFighter | null = null;
    if (recording && recording.recordedMs > 0) {
      sample = recording.createSample(side);
      recording.sample(side, Math.min(recording.recordedMs, outcome.endMs + FIGHT_OUTRO_MS), sample);
      pose.update(sample, 1);
    }
    const driver = createDriver(sample ? [...pose.driver.position] : spawn.position, sample ? pose.driver.yaw : spawn.yaw);
    out[side] = { driver, sample, pose, height: pose.height };
  }
  return out;
}

/** The winner: on its feet, turning to the room, pumping its best move. */
function Winner({ champion, end, elapsed }: { champion: Champion; end: EndState; elapsed: () => number }) {
  const handle = useRef<CreatureHandle>(null);
  const driver = end.driver;
  const move = useMemo(() => {
    let best = 0;
    champion.moves.forEach((candidate, index) => {
      if (candidate.power > champion.moves[best]!.power) best = index;
    });
    return best;
  }, [champion]);
  const state = useRef({ hops: 0 });
  useFrame((_, realDelta) => {
    const t = elapsed();
    // Stand where it ended (back on the floor if it was mid-hop), face the camera side.
    driver.position[1] = MathUtils.damp(driver.position[1], 0, 10, realDelta);
    driver.velocity[0] = driver.velocity[1] = driver.velocity[2] = 0;
    driver.pose = null;
    driver.yaw = dampYaw(driver.yaw, 0, t > RESULT_BEATS.showboat ? 6 : 2, realDelta);
    // The victory pump: windup, strike up and out, hold, recover, a beat, again.
    const cycle = 1.7;
    const local = t < RESULT_BEATS.showboat ? -1 : (t - RESULT_BEATS.showboat) % cycle;
    const phase = local < 0 ? null : local < 0.35 ? "windup" : local < 0.55 ? "active" : local < 0.85 ? "hold" : local < 1.25 ? "recover" : null;
    const progress =
      phase === "windup" ? local / 0.35 : phase === "active" ? (local - 0.35) / 0.2 : phase === "hold" ? (local - 0.55) / 0.3 : phase === "recover" ? (local - 0.85) / 0.4 : 0;
    const fx = Math.sin(driver.yaw);
    const fz = Math.cos(driver.yaw);
    driver.anim = {
      locomotion: "stand",
      speed: 0,
      intent: "showboat",
      move: phase ? move : null,
      moveType: phase ? champion.moves[move]!.type : null,
      movePhase: phase,
      progress,
      ragdoll: 0,
      reachTarget: [driver.position[0] + fx * 0.5, end.height * 1.35, driver.position[2] + fz * 0.5],
    };
    driver.expression = "smug";
    // A bounce on each pump.
    const hops = local < 0 ? 0 : Math.floor((t - RESULT_BEATS.showboat) / cycle) + 1;
    if (hops > state.current.hops) {
      state.current.hops = hops;
      handle.current?.squash(0.22);
    }
  }, -45);
  return <Creature ref={handle} champion={champion} driver={driver} seed={41} specularMinLight={STAGE_SPECULAR_MIN_LIGHT} />;
}

const tmpQ = new Quaternion();
const tmpAxis = new Vector3();
const tmpV = new Vector3();

/** The loser: a KO lies where it fell, a ring-out stays down below, a points loss flops over backwards. */
function Loser({ champion, end, method, elapsed }: { champion: Champion; end: EndState; method: StoredOutcomeLike["method"]; elapsed: () => number }) {
  const services = useStage();
  const flops = (method === "DECISION" || method === "SUDDEN_DEATH") && end.sample !== null;
  const base = end.sample;
  const work = useMemo(() => (base ? structuredClone(base) : null), [base]);
  const state = useRef({ thud: false });
  useFrame(() => {
    const t = elapsed();
    if (!base || !work) {
      // No recording: a plain standing loser, eyes shut.
      end.driver.expression = t > RESULT_BEATS.flop ? "closed" : null;
      return;
    }
    if (!flops) {
      end.pose.update(base, 0);
      return;
    }
    // Tip over backwards about the feet: gravity-eased, a small bounce, then still.
    const u = MathUtils.clamp((t - RESULT_BEATS.flop) / 0.42, 0, 1);
    const fall = u * u;
    const bounce = u >= 1 ? Math.max(0, Math.sin(Math.min(1, (t - RESULT_BEATS.flop - 0.42) / 0.25) * Math.PI)) * 0.12 : 0;
    const angle = (Math.PI / 2) * (fall - bounce);
    const yaw = base.facing;
    tmpAxis.set(-Math.cos(yaw), 0, Math.sin(yaw));
    tmpQ.setFromAxisAngle(tmpAxis, angle);
    const pivot = base.root.p;
    let lowest = Infinity;
    for (let i = 0; i < base.bodies.length; i += 1) {
      const from = base.bodies[i]!;
      const to = work.bodies[i]!;
      tmpV.set(from.p[0] - pivot[0], from.p[1], from.p[2] - pivot[2]).applyQuaternion(tmpQ);
      to.p[0] = pivot[0] + tmpV.x;
      to.p[1] = tmpV.y;
      to.p[2] = pivot[2] + tmpV.z;
      lowest = Math.min(lowest, to.p[1]);
      const q = new Quaternion(from.q[0], from.q[1], from.q[2], from.q[3]).premultiply(tmpQ);
      to.q[0] = q.x;
      to.q[1] = q.y;
      to.q[2] = q.z;
      to.q[3] = q.w;
    }
    // Keep the body on the floor as it goes over.
    const lift = Math.max(0, end.height * 0.12 - lowest) * fall;
    for (const body of work.bodies) body.p[1] += lift;
    const root = work.bodies[0];
    if (root) {
      work.root.p = [...root.p];
      work.root.q = [...root.q];
    }
    work.anim.ragdoll = u > 0 ? 1 : 0;
    work.anim.intent = u > 0 ? "ko" : "idle";
    end.pose.update(work, 1 / 60);
    if (u >= 1 && !state.current.thud) {
      state.current.thud = true;
      const sfx = stageSfx(services);
      sfx.play("ragdollThud", { intensity: 0.6 });
      sfx.play("lossTrombone", { intensity: 0.8 });
      services.director.shake(0.25);
    }
  }, -45);
  const driver = base ? end.pose.driver : end.driver;
  return <Creature champion={champion} driver={driver} seed={43} specularMinLight={STAGE_SPECULAR_MIN_LIGHT} />;
}

function dampYaw(from: number, to: number, lambda: number, dt: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * (1 - Math.exp(-lambda * dt));
}

function WinnerConfetti({ champion, at, elapsed, beats }: { champion: Champion; at: () => Vector3; elapsed: () => number; beats: ResultBeats }) {
  const confetti = useRef<ConfettiHandle>(null);
  const fired = useRef(0);
  const colors = useMemo(() => sparkColors(champion.palette).concat(TOY_COLOR_VALUES[champion.palette.secondary].hex), [champion]);
  useFrame(() => {
    const t = elapsed();
    // Two pops: on the fanfare, and again as the pump peaks.
    const shots = [beats.showboat + 0.05, beats.showboat + 0.9];
    while (fired.current < shots.length && t >= shots[fired.current]!) {
      if (t - shots[fired.current]! < 1) {
        const p = at();
        confetti.current?.burst({ origin: [p.x, p.y + 1.1, p.z], count: 110, colors, speed: 4.2, spread: 0.6 });
      }
      fired.current += 1;
    }
  });
  return <Confetti ref={confetti} capacity={260} />;
}

// ---------------------------------------------------------------------------
// Payouts on the scoreboard
// ---------------------------------------------------------------------------

interface PayoutRow {
  playerId: string;
  name: string;
  points: number;
  label: string;
}

/** Awards grouped per player, the owner first: "Gabriel +300 WIN + FINISH". */
export function payoutRows(feed: FightFeed, fight: FightRow): PayoutRow[] {
  const rows = new Map<string, PayoutRow>();
  for (const award of fight.awards ?? []) {
    const row = rows.get(award.playerId) ?? { playerId: award.playerId, name: playerName(feed, award.playerId) ?? "Player", points: 0, label: "" };
    row.points += award.points;
    row.label = row.label ? `${row.label} + ${award.reason}` : award.reason;
    rows.set(award.playerId, row);
  }
  return [...rows.values()];
}

/** A world point in a plane's local space (what OnPlane's children use). */
function toPlane(plane: PlaneNode, point: Vector3): Vector3Tuple {
  const local = point.clone().sub(plane.position).applyQuaternion(plane.quaternion.clone().invert());
  return [local.x, local.y, local.z];
}

function Payouts({
  feed,
  fight,
  winnerName,
  nodes,
  elapsed,
  beats,
  from,
}: {
  feed: FightFeed;
  fight: FightRow;
  winnerName: string;
  nodes: ArenaNodes | null;
  elapsed: () => number;
  beats: ResultBeats;
  from: () => Vector3;
}) {
  const plane = nodes?.scoreboardText ?? null;
  const rows = useMemo(() => payoutRows(feed, fight), [feed, fight]);
  const owners = ownersOf(feed, fight);
  const [show, setShow] = useState(() => elapsed() >= beats.payouts);
  const [lateOpen] = useState(() => elapsed() > beats.payouts + 0.8);
  useFrame(() => {
    if (!show && elapsed() >= beats.payouts) setShow(true);
  });
  if (!plane) return null;
  const header = fight.isFinal ? "THE FINAL: DOUBLE POINTS" : fight.isThirdPlace ? "THIRD PLACE" : `ROUND ${fight.round}: ${winnerName} WINS`;
  const width = plane.width;
  const height = plane.height;
  const layout = payoutLayout(width, height, rows.length);
  const textColor = plane.textColor ?? UI_COLORS.bone;
  const ownerIds = new Set([owners.A, owners.B].filter((id): id is string => id !== null));
  return (
    <OnPlane plane={plane} offset={0.03}>
      {plane.bgColor && (
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial color={plane.bgColor} roughness={0.9} />
        </mesh>
      )}
      <FitText position={[0, layout.headerY, 0]} maxWidth={layout.inner} size={layout.headerSize} color={fight.isFinal ? UI_COLORS.gold : textColor}>
        {header}
      </FitText>
      {rows.length === 0 && show && (
        <FitText position={[0, layout.rowY(0), 0]} maxWidth={layout.inner} size={layout.rowHeight * 0.5} color={textColor}>
          No payouts this time
        </FitText>
      )}
      {show &&
        rows.map((row, index) => {
          // The owner's points come off the winner; a bettor's from the crowd.
          const source = ownerIds.has(row.playerId) ? from() : new Vector3(0, 3, -4 + index);
          return (
            <AvatarToken
              key={row.playerId}
              name={row.name}
              radius={layout.tokenRadius}
              faceCamera={false}
              position={[layout.tokenX, layout.rowY(index), 0]}
              flyFrom={lateOpen ? null : toPlane(plane, source)}
              arcHeight={1.6}
              enter="pop"
              delay={lateOpen ? 0.1 * index : RESULT_BEATS.payoutGap * index}
              landSound={index === 0 ? "confirm" : "betPlaced"}
              idle={0.3}
              seed={index + 3}
            >
              {/* Name over its reason on the left, the points at the board's right edge: the columns never meet. */}
              <FitText position={[layout.nameX, layout.rowHeight * 0.13, 0.02]} anchorX="left" maxWidth={layout.nameWidth} size={layout.rowHeight * 0.46} color={textColor}>
                {row.name}
              </FitText>
              <FitText position={[layout.nameX, -layout.rowHeight * 0.27, 0.02]} anchorX="left" maxWidth={layout.nameWidth} size={layout.rowHeight * 0.25} color={textColor} opacity={0.82}>
                {row.label}
              </FitText>
              <FitText position={[layout.pointsX, 0, 0.02]} anchorX="right" maxWidth={layout.pointsWidth} size={layout.rowHeight * 0.6} color={UI_COLORS.gold}>
                {`+${row.points}`}
              </FitText>
            </AvatarToken>
          );
        })}
    </OnPlane>
  );
}

/**
 * The payout board's layout in the text plane's space (x right, y up, centred):
 * the header across the top; each row a token at the left margin, the name
 * with its reason under it, and the points right-aligned at the right margin.
 * Text-relative positions are relative to the row's token.
 */
export function payoutLayout(width: number, height: number, rowCount: number) {
  const margin = width * 0.045;
  const inner = width - margin * 2;
  const headerSize = Math.min(height * 0.13, inner / 10);
  // A little extra headroom: the kitchen's chalk eraser sits on the board's top-left corner.
  const headerY = height / 2 - margin * 0.6 - height * 0.04 - headerSize * 0.7;
  const top = headerY - headerSize * 0.9;
  const rowHeight = Math.min(height * 0.21, (top + height / 2 - margin * 0.4) / Math.max(1, rowCount));
  const tokenRadius = rowHeight * 0.38;
  const tokenX = -width / 2 + margin + tokenRadius;
  const nameX = tokenRadius * 1.5;
  const pointsWidth = inner * 0.24;
  const pointsX = width / 2 - margin - tokenX;
  // The name column stops a gap short of the points column.
  const nameWidth = pointsX - pointsWidth - nameX - inner * 0.05;
  return {
    inner,
    headerSize,
    headerY,
    rowHeight,
    tokenRadius,
    tokenX,
    nameX,
    nameWidth,
    pointsX,
    pointsWidth,
    rowY: (index: number) => top - rowHeight * (index + 0.5),
  };
}

/**
 * StageText that scales itself down to `maxWidth` once laid out (measured,
 * not estimated), shrinking toward its anchor. Hidden until measured, so it
 * never shows a frame at the wrong size.
 */
function FitText({
  maxWidth,
  position,
  children,
  ...text
}: {
  maxWidth: number;
  position: Vector3Tuple;
  children: string;
  size: number;
  color: string;
  anchorX?: "left" | "center" | "right";
  opacity?: number;
}) {
  const group = useRef<Group>(null);
  const onSync = useCallback(
    (mesh: TroikaTextMesh) => {
      const node = group.current;
      const bounds = mesh.textRenderInfo?.blockBounds;
      if (!node || !bounds) return;
      const measured = bounds[2] - bounds[0];
      node.scale.setScalar(measured > maxWidth ? maxWidth / measured : 1);
      node.visible = true;
    },
    [maxWidth],
  );
  return (
    <group ref={group} position={position} visible={false}>
      <StageText {...text} {...MARQUEE_TEXT} whiteSpace="nowrap" onSync={onSync}>
        {children}
      </StageText>
    </group>
  );
}
