"use client";

// RESULT: first the instant replay (result-replay.ts): the decisive moment
// again, slowed, from a new angle, under a REPLAY bug. Then, on a two-shot,
// the winner turns to the room and showboats (its best move as a victory
// pump, smug, confetti in its colours, the fanfare) while the loser stays
// where the fight left it (a KO lies there, a ring-out stays in the drink)
// or, beaten on points, flops over with the trombone. If the fight never
// showed the method, it slams here, right after the replay.
// Then the cut to the back-wall scoreboard: every award flies onto
// `Scoreboard_Text` as the player's token carrying its points (the owner's
// win and finish, each correct bettor's payout), and The Voice has its one
// line. The Final calls out double points; third place says so. A
// seed-decided fight has no moment to replay: it shows the judges' coin
// landing instead. Without a replay (no time left for one on a stage that
// never saw the fight) the winner gets the letterboxed `winner_pose`.

import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { MathUtils, Quaternion, Vector3, type Group, type Object3D, type Vector3Tuple } from "three";
import { FIGHT_OUTRO_MS, RESULT_SECONDS } from "../../constants";
import type { Side } from "../../modifiers";
import type { VoiceLine } from "../../narration/lines";
import type { Champion } from "../../sheet";
import { loadRapier } from "../../sim";
import { TOY_COLOR_VALUES } from "../../vocab";
import type { ArenaNodes, PlaneNode } from "../arena/nodes";
import { Creature, createDriver, type CreatureDriver, type CreatureHandle } from "../creature/creature";
import type { TargetLike } from "../director/director";
import type { ShotId } from "../director/shots";
import type { PhaseSceneProps } from "../scenes/phase-scene";
import { useStage } from "../services";
import { Confetti, type ConfettiHandle } from "../ui3d/confetti";
import { UI_COLORS } from "../ui3d/materials";
import { arcDuration } from "../ui3d/motion";
import { stageSfx } from "../ui3d/sound";
import { MARQUEE_TEXT, OnPlane, StageText, type TroikaTextMesh } from "../ui3d/text";
import { AvatarToken } from "../ui3d/tokens";
import { ClearShotSearch } from "./clearance";
import { ownersOf, playerName, sheetsOf, useFightFeed, type FightFeed, type FightRow } from "./feed";
import { sparkColors } from "./conduct";
import { PoseDriver } from "./driver";
import { STAGE_SPECULAR_MIN_LIGHT } from "./fighters";
import { FightFx, FxSystem } from "./fx";
import { COIN_LAND_S, CoinFlip, FightMarquee, methodSlammed, spawnOf, useBaseShot } from "./parts";
import { fightInputOf, type StoredOutcomeLike } from "./playback";
import { cachedRecording } from "./player";
import type { SampledFighter } from "./recording";
import { ReplayBug } from "./replay-bug";
import { ResultReplay, type ReplayHooks, type ReplayState } from "./result-replay";
import { voiceFightOf } from "./voice";
import { winnerPoseFraming, winnerPoseOrbit, winnerShape } from "./winner-frame";

const other = (side: Side): Side => (side === "A" ? "B" : "A");

declare global {
  interface Window {
    /** Dev builds: RESULT's beat clock (screenshots and console pokes). */
    __slopResult?: {
      t: number;
      /** The beats' clock: seconds since the cut back after a replay (null while one is to come). */
      post: number | null;
      beats: string[];
      shot: string;
      /** The instant replay: its state, real ms in, sim ms shown, playback rate, and sim ms recorded (a cold stage records the fight first). */
      replay?: { state: ReplayState; kind: string | null; t: number; sim: number; rate: number; realMs: number | null; recorded: number | null };
    };
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

/**
 * After the instant replay, counted from the cut back to the two-shot: the
 * fanfare and the winner's pump, the loser's flop, The Voice, then the
 * scoreboard. Tighter than RESULT_BEATS: the replay has already held the
 * room for about three seconds.
 */
export const REPLAY_BEATS: ResultBeats = {
  ...RESULT_BEATS,
  showboat: 0.35,
  flop: 0.6,
  voice: 0.75,
  scoreboard: 1.7,
  payouts: 2.0,
};

/** After the replay on a stage that never showed the method: the slam first, over the two-shot. */
export const REPLAY_SLAM_BEATS: ResultBeats = {
  ...REPLAY_BEATS,
  slam: 0.3,
  showboat: 0.95,
  flop: 1.0,
  voice: 1.15,
  scoreboard: 2.2,
  payouts: 2.5,
};

/** A payout token lands at most this long after its beat (the longest toss, from the crowd)... */
const PAYOUT_FLIGHT_S = arcDuration(Infinity);
/** ...and the landed payouts stay up at least this long before RESULT ends. */
const PAYOUT_READ_S = 1.25;
/** A late replay may squeeze the beats after it down to this fraction of their times, no further. */
const MIN_BEAT_SCALE = 0.4;
/** Seconds into RESULT the phase's entry wipe has cleared (cover 380 + hold 140 + reveal 420 ms). */
const ENTRY_CLEAR_S = 0.95;
/** A replay of its own covers this long after it starts wiping in. */
const REPLAY_WIPE_IN_S = 0.3;
/** A loser lying above this (in the garage's water, by the platform) still shares the two-shot; one further down went off the edge. */
const LOSER_SIGHT_Y = -1.5;
/** Wall ms per frame for the two-shot's clear-angle search, while the replay plays. */
const TWO_SHOT_SEARCH_MS = 1;
/** fight_close's lens (director/shots.ts): fov, and its height and aim above the targets' centre. */
const CLOSE_FOV = 34;
const CLOSE_RISE = 1.05;
const CLOSE_AIM = 0.45;

/**
 * The clear-angle search for the two-shot after a replay. It prefers halfway
 * between side-on to the pair and the room (+z, which the winner turns to
 * face), so neither fighter hides the other.
 */
function twoShotSearch(root: Object3D | null, winner: Vector3, loser: Vector3, aspect: number): ClearShotSearch {
  const centre = winner.clone().lerp(loser, 0.5);
  let x = -(loser.z - winner.z);
  let z = loser.x - winner.x;
  const length = Math.hypot(x, z);
  if (length > 1e-4) {
    if (z < 0) {
      x = -x;
      z = -z;
    }
    x /= length;
    z = z / length + 1;
  } else z = 1;
  const v = MathUtils.degToRad(CLOSE_FOV) / 2;
  const radius = Math.max(1.05, length / 2 + 0.7);
  return new ClearShotSearch(root, centre, {
    distance: radius / Math.sin(Math.min(v, Math.atan(Math.tan(v) * aspect))),
    height: CLOSE_RISE,
    aim: CLOSE_AIM,
    preferred: new Vector3(x, 0, z).normalize(),
    depth: 1.4,
    halfWidth: 0.5,
    halfHeight: 0.3,
  });
}

/** The post-replay beats, squeezed when a late replay leaves less than their usual time before the payouts must land. */
export function fitReplayBeats(beats: ResultBeats, doneAt: number, phaseSeconds = RESULT_SECONDS): ResultBeats {
  const k = MathUtils.clamp((phaseSeconds - PAYOUT_READ_S - PAYOUT_FLIGHT_S - doneAt) / beats.payouts, MIN_BEAT_SCALE, 1);
  if (k >= 1) return beats;
  const scaled = { ...beats };
  for (const key of ["slam", "showboat", "flop", "voice", "scoreboard", "payouts"] as const) scaled[key] = beats[key] * k;
  return scaled;
}

/** The latest RESULT second a replay of `realMs` may start and still leave the (squeezed) beats after it and the payouts their time. */
export function latestReplayStart(beats: ResultBeats, realMs: number, phaseSeconds = RESULT_SECONDS): number {
  return phaseSeconds - PAYOUT_READ_S - PAYOUT_FLIGHT_S - beats.payouts * MIN_BEAT_SCALE - realMs / 1000 - REPLAY_WIPE_IN_S;
}

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
  const loser = other(winner);
  const coin = fight.decidedBySeed || outcome.decidedBySeed === true;
  const winnerName = sheets[winner].name;
  // The method slams here only when FIGHT never showed it: over the wide shot, or right after the replay.
  const [lateSlam] = useState(() => !coin && !methodSlammed.has(fight.id));
  const replayBeats = lateSlam ? REPLAY_SLAM_BEATS : REPLAY_BEATS;

  // The instant replay (a coin has no moment to show): from FIGHT's recording, else the fight recorded here first.
  const fx = useMemo(() => new FxSystem(), []);
  const [replay] = useState(() => {
    const input = coin ? null : fightInputOf(fight, sheets);
    if (!input) return null;
    return new ResultReplay({
      services,
      input,
      stored: outcome,
      fx,
      colors: { A: sparkColors(sheets.A.palette), B: sparkColors(sheets.B.palette) },
      elapsed: elapsed(),
      earliest: ENTRY_CLEAR_S,
      latestStart: (realMs) => latestReplayStart(replayBeats, realMs),
    });
  });
  // FIGHT's recording was at hand: the replay is the phase's first shot, under the entry wipe.
  const [warm] = useState(() => replay?.state === "ready");
  useEffect(() => {
    if (!replay || replay.player.recording) return;
    let alive = true;
    loadRapier()
      .then((R) => {
        if (alive) replay.start(R);
      })
      .catch((error: unknown) => console.warn("[slopfight] Rapier failed to load for the replay", error));
    return () => {
      alive = false;
    };
  }, [replay]);
  // The beats count from the cut back after a replay (from the start without one) and hold while one is to come.
  const post = useCallback(() => (replay ? replay.since(elapsed()) : elapsed()), [replay, elapsed]);
  const beats = useRef<ResultBeats>({ ...(coin ? COIN_RESULT_BEATS : lateSlam ? LATE_SLAM_BEATS : RESULT_BEATS) }).current;

  // Where both fighters ended (the recording FIGHT left in the cache, or the replay's own), else their marks.
  const [ends, setEnds] = useState(() => endStates(fight, sheets, outcome));
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
  const loserChest = useMemo(() => {
    const end = ends[loser];
    const point = new Vector3();
    return () => {
      const [x, y, z] = (end.sample ? end.pose.driver : end.driver).position;
      return point.set(x, y + end.height * 0.5, z);
    };
  }, [ends, loser]);

  // Both fighters on the wide shot (a ring-out loser is far below: the winner alone).
  const wideTargets = useMemo(
    () => (outcome.method === "RINGOUT" ? [winnerChest] : [winnerChest, loserChest]),
    [winnerChest, loserChest, outcome.method],
  );

  // A coin-decided fight holds the coin's wide shot (CoinFlip asks for the same one).
  const [first] = useState<{ shot: ShotId; targets: readonly TargetLike[] }>(() =>
    warm
      ? { shot: "replay", targets: [] }
      : coin || lateSlam
        ? { shot: "fight_wide", targets: coin ? [] : wideTargets }
        : { shot: "winner_pose", targets: [winnerFrame] },
  );
  const supersedeBase = useBaseShot(first.shot, warm && replay ? replay.request : { targets: first.targets });
  const cutToPose = useCallback(() => {
    // After a replay the two-shot already holds the winner.
    if (replay?.state === "done") return;
    supersedeBase();
    services.director.setBase("winner_pose", { targets: [winnerFrame] });
  }, [replay, supersedeBase, services, winnerFrame]);

  // The Voice's one line, on its beat. With a replay to come, its speech is fetched now and it is scheduled at the cut back.
  const voiceLine = useRef<VoiceLine | null>(null);
  const voiceScheduled = useRef(false);
  const scheduleVoice = useCallback(
    (at: number) => {
      const line = voiceLine.current;
      if (!line || voiceScheduled.current) return;
      voiceScheduled.current = true;
      services.voice.schedule([{ ...line, at }]);
    },
    [services],
  );
  useEffect(() => {
    const voice = services.voice;
    const voiceFight = voiceFightOf(feed, fight);
    if (!voiceFight) return;
    const record = recordBefore(feed, fight, winner);
    const line = voice.voice.result(voiceFight, { winner, method: outcome.method }, record);
    if (!line) return;
    voiceLine.current = line;
    if (replay && replay.doneAt === null) voice.prefetch(line);
    else scheduleVoice(startedAt + beats.voice * 1000);
    // Once per fight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, fight.id, startedAt]);

  // The replay's cuts, both under a wipe's cover.
  const twoShot = useRef<ClearShotSearch | null>(null);
  const hooks = useRef<ReplayHooks>({ cutIn: () => {}, cutBack: () => {} });
  useLayoutEffect(() => {
    hooks.current = {
      cutIn: () => {
        supersedeBase();
        // The fight was recorded here: the fighters' end states are known now.
        setEnds(endStates(fight, sheets, outcome));
      },
      cutBack: () => {
        supersedeBase();
        Object.assign(beats, fitReplayBeats(replayBeats, replay?.doneAt ?? 0));
        scheduleVoice(services.clock.now + beats.voice * 1000);
        // Both fighters in frame, unless the loser went far over the edge: then the winner's close-up.
        const sample = ends[loser].sample;
        const inSight = sample === null || sample.root.p[1] > LOSER_SIGHT_Y;
        const from = twoShot.current?.best?.from;
        if (inSight) services.director.setBase("fight_close", { targets: [winnerChest, loserChest], from });
        else services.director.setBase("winner_pose", { targets: [winnerFrame] });
      },
    };
  });
  const [bugLabel, setBugLabel] = useState(() => replay?.plan?.label ?? "");
  useFrame((_, realDelta) => {
    if (!replay) return;
    replay.frame(elapsed(), realDelta, hooks.current);
    if (replay.plan && replay.plan.label !== bugLabel) setBugLabel(replay.plan.label);
    // The fighters' ends are known once the replay rolls: find the two-shot's angle while it plays.
    if (replay.state === "playing") {
      twoShot.current ??= twoShotSearch(services.director.nodes?.root ?? null, winnerChest().clone(), loserChest().clone(), services.director.aspect);
      twoShot.current.step(TWO_SHOT_SEARCH_MS);
    }
    // No replay after all: the line keeps its own beat.
    if (replay.state === "skipped") scheduleVoice(startedAt + beats.voice * 1000);
  }, -50);
  const fxDelta = useCallback(() => (replay?.driving ? replay.simDelta : services.clock.delta), [replay, services]);
  const bugShown = useCallback(() => replay?.bugShown === true, [replay]);

  useResultBeats({
    fight,
    outcome,
    winnerName,
    elapsed: post,
    phaseElapsed: elapsed,
    replay,
    coin,
    beats,
    supersedeBase,
    cutToPose: lateSlam ? cutToPose : null,
  });

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
          <Winner side={winner} champion={sheets[winner]} end={ends[winner]} elapsed={post} beats={beats} replay={replay} />
          <Loser side={loser} champion={sheets[loser]} end={ends[loser]} method={outcome.method} elapsed={post} beats={beats} replay={replay} />
        </>
      )}
      {replay && (
        <>
          <FightFx system={fx} delta={fxDelta} />
          <ReplayBug label={bugLabel} shown={bugShown} />
        </>
      )}
      <WinnerConfetti champion={sheets[winner]} at={() => winnerChest()} elapsed={post} beats={beats} />
      {/* Its own boundary: the payout text loading must never hide (and re-run) the whole scene. */}
      <Suspense fallback={null}>
        <Payouts feed={feed} fight={fight} winnerName={winnerName} nodes={nodes} elapsed={post} beats={beats} from={winnerChest} />
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
  phaseElapsed,
  replay,
  coin,
  beats,
  supersedeBase,
  cutToPose,
}: {
  fight: FightRow;
  outcome: StoredOutcomeLike;
  winnerName: string;
  /** The beats' clock: from the cut back after a replay, -Infinity while one is to come. */
  elapsed: () => number;
  /** Seconds into RESULT. */
  phaseElapsed: () => number;
  replay: ResultReplay | null;
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
    if (process.env.NODE_ENV !== "production") {
      window.__slopResult = {
        t: phaseElapsed(),
        post: Number.isFinite(t) ? t : null,
        beats: [...done.current],
        shot: services.director.shot,
        replay: replay
          ? {
              state: replay.state,
              kind: replay.plan?.kind ?? null,
              t: replay.t,
              sim: replay.player.t,
              rate: replay.rate,
              realMs: replay.plan?.realMs ?? null,
              recorded: replay.player.recording?.recordedMs ?? null,
            }
          : undefined,
      };
    }
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
      // After a replay the crowd has just swelled into the cut back.
      if (replay?.state !== "done") sfx.play("crowdCheer", { intensity: 0.8 });
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
  // The end the recording shows (the stored one, whenever the local run matches it).
  const endMs = recording?.outcome?.endMs ?? outcome.endMs;
  const out = {} as Record<Side, EndState>;
  for (const side of ["A", "B"] as const) {
    const pose = new PoseDriver(sheets[side], side);
    const spawn = spawnOf(fight.arena, side);
    let sample: SampledFighter | null = null;
    if (recording && recording.recordedMs > 0) {
      sample = recording.createSample(side);
      recording.sample(side, Math.min(recording.recordedMs, endMs + FIGHT_OUTRO_MS), sample);
      pose.update(sample, 1);
    }
    const driver = createDriver(sample ? [...pose.driver.position] : spawn.position, sample ? pose.driver.yaw : spawn.yaw);
    out[side] = { driver, sample, pose, height: pose.height };
  }
  return out;
}

/**
 * A fighter during the replay: it follows the replay's pose driver (its
 * jiggles and squashes too), its animation slowed with the playback. The
 * speed is quantized, so a ramp re-renders a few times, not every frame; the
 * feet replant at each cut in and out (both under a wipe's cover).
 */
function useReplayDrive(replay: ResultReplay | null, side: Side, handle: RefObject<CreatureHandle | null>) {
  const [view, setView] = useState({ driving: false, timeScale: 1 });
  const current = useRef(view);
  useFrame(() => {
    if (!replay) return;
    const driving = replay.driving;
    const timeScale = driving ? Math.round(replay.rate * 10) / 10 : 1;
    if (driving !== current.current.driving || timeScale !== current.current.timeScale) {
      current.current = { driving, timeScale };
      setView(current.current);
    }
    if (!driving) return;
    const pose = replay.player.drivers[side];
    if (pose.jiggle > 0) {
      handle.current?.jiggle(pose.jiggle);
      pose.jiggle = 0;
    }
    if (pose.squash !== 0) {
      handle.current?.squash(pose.squash);
      pose.squash = 0;
    }
  }, -46);
  useLayoutEffect(() => {
    handle.current?.replant();
  }, [view.driving, handle]);
  return { driving: view.driving, timeScale: view.timeScale, driver: view.driving && replay ? replay.player.drivers[side].driver : null };
}

interface FighterProps {
  side: Side;
  champion: Champion;
  end: EndState;
  /** The beats' clock (from the cut back after a replay). */
  elapsed: () => number;
  beats: ResultBeats;
  replay: ResultReplay | null;
}

/** The winner: on its feet, turning to the room, pumping its best move. */
function Winner({ side, champion, end, elapsed, beats, replay }: FighterProps) {
  const handle = useRef<CreatureHandle>(null);
  const shown = useReplayDrive(replay, side, handle);
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
    if (replay?.driving) return;
    const t = elapsed();
    // Stand where it ended (back on the floor if it was mid-hop), face the camera side.
    driver.position[1] = MathUtils.damp(driver.position[1], 0, 10, realDelta);
    driver.velocity[0] = driver.velocity[1] = driver.velocity[2] = 0;
    driver.pose = null;
    driver.yaw = dampYaw(driver.yaw, 0, t > beats.showboat ? 6 : 2, realDelta);
    // The victory pump: windup, strike up and out, hold, recover, a beat, again.
    const cycle = 1.7;
    const local = t < beats.showboat ? -1 : (t - beats.showboat) % cycle;
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
    const hops = local < 0 ? 0 : Math.floor((t - beats.showboat) / cycle) + 1;
    if (hops > state.current.hops) {
      state.current.hops = hops;
      handle.current?.squash(0.22);
    }
  }, -45);
  return (
    <Creature
      ref={handle}
      champion={champion}
      driver={shown.driver ?? driver}
      timeScale={shown.timeScale}
      seed={41}
      specularMinLight={STAGE_SPECULAR_MIN_LIGHT}
    />
  );
}

const tmpQ = new Quaternion();
const tmpAxis = new Vector3();
const tmpV = new Vector3();

/** The loser: a KO lies where it fell, a ring-out stays down below, a points loss flops over backwards. */
function Loser({ side, champion, end, method, elapsed, beats, replay }: FighterProps & { method: StoredOutcomeLike["method"] }) {
  const services = useStage();
  const handle = useRef<CreatureHandle>(null);
  const shown = useReplayDrive(replay, side, handle);
  const flops = (method === "DECISION" || method === "SUDDEN_DEATH") && end.sample !== null;
  const base = end.sample;
  const work = useMemo(() => (base ? structuredClone(base) : null), [base]);
  const state = useRef({ thud: false });
  useFrame(() => {
    if (replay?.driving) return;
    const t = elapsed();
    if (!base || !work) {
      // No recording: a plain standing loser, eyes shut.
      end.driver.expression = t > beats.flop ? "closed" : null;
      return;
    }
    if (!flops) {
      end.pose.update(base, 0);
      return;
    }
    // Tip over backwards about the feet: gravity-eased, a small bounce, then still.
    const u = MathUtils.clamp((t - beats.flop) / 0.42, 0, 1);
    const fall = u * u;
    const bounce = u >= 1 ? Math.max(0, Math.sin(Math.min(1, (t - beats.flop - 0.42) / 0.25) * Math.PI)) * 0.12 : 0;
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
  return (
    <Creature
      ref={handle}
      champion={champion}
      driver={shown.driver ?? driver}
      timeScale={shown.timeScale}
      seed={43}
      specularMinLight={STAGE_SPECULAR_MIN_LIGHT}
    />
  );
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
