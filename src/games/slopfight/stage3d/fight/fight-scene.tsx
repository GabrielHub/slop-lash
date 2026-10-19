"use client";

// FIGHT: the deterministic sim played back against the server clock, the two
// creatures on their proxies, the health bars along the top of the frame and
// each fighter's side ring and chevron (fight/hud.tsx), impact VFX and the
// conductor that turns every event into its beat (fight/conduct.ts). With no
// outcome (the server sim failed or the seed decided it), the judges flip a
// coin instead.

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { ArenaId } from "../../arenas";
import type { Side } from "../../modifiers";
import { timeFightLines } from "../../narration";
import { loadRapier } from "../../sim";
import type { CreatureHandle } from "../creature/creature";
import type { PhaseSceneProps } from "../scenes/phase-scene";
import { useStage } from "../services";
import { Confetti, type ConfettiHandle } from "../ui3d/confetti";
import { FightConductor, sparkColors } from "./conduct";
import { ownersOf, playerName, sheetsOf, useFightFeed, type FightFeed, type FightRow } from "./feed";
import { FightCreature, useClockScale } from "./fighters";
import { FightFx, FxSystem, KoStars } from "./fx";
import { FightHud, SideMarker } from "./hud";
import { CoinFlip, FightMarquee, methodSlammed, StandingFighters, useBaseShot } from "./parts";
import { fightInputOf, storedEvents } from "./playback";
import { FightPlayer, inputKey } from "./player";
import { voiceFightOf, voiceOf } from "./voice";

/** Floor dust per arena (blue epoxy, cream counter, teal pavers). */
export const ARENA_DUST: Record<ArenaId, string> = {
  FLOODED_GARAGE: "#b3cad6",
  KITCHEN_COUNTER: "#f1e4c6",
  ROOFTOP: "#b8c8c1",
};

/** The fight's sim input and stored outcome, memoized on their content. */
export function usePreparedFight(feed: FightFeed | null, fight: FightRow | null) {
  const sheets = feed && fight ? sheetsOf(feed, fight) : null;
  const input = fight && sheets ? fightInputOf(fight, sheets) : null;
  const key = input ? inputKey(input) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableInput = useMemo(() => input, [key]);
  return { sheets, input: stableInput, key };
}

export function FightScene({ input, nodes }: PhaseSceneProps) {
  const feed = useFightFeed();
  const fight = feed?.current ?? null;
  const prepared = usePreparedFight(feed, fight);
  if (!feed || !fight || !prepared.sheets?.A || !prepared.sheets.B) {
    return <FightMarquee nodes={nodes} text="FIGHT!" />;
  }
  if (fight.decidedBySeed) {
    // Normally skipped straight to RESULT (where the coin lands); kept for a stray FIGHT.
    return (
      <>
        <FightMarquee nodes={nodes} text="THE JUDGES" />
        <CoinFlip feed={feed} fight={fight} phase="FIGHT" live={input.live} />
      </>
    );
  }
  if (!prepared.input || !fight.outcome || fight.startsAt === null) {
    // The sim's result has not reached the room yet: the fighters wait on their marks.
    return (
      <>
        <FightMarquee nodes={nodes} text="GET READY" />
        <StandingFighters arena={fight.arena} sheets={{ A: prepared.sheets.A, B: prepared.sheets.B }} />
      </>
    );
  }
  return (
    <>
      <FightMarquee nodes={nodes} text={fight.isFinal ? "THE FINAL" : fight.isThirdPlace ? "THIRD PLACE" : `ROUND ${fight.round}`} />
      <FightStage key={`${fight.id}:${prepared.key}`} feed={feed} fight={fight} fightInput={prepared.input} live={input.live} />
    </>
  );
}

declare global {
  interface Window {
    /** Dev builds: the fight on stage (player: hash, t, recording; conductor: beats). */
    __slopFight?: { player: FightPlayer; conductor: FightConductor; fight: FightRow; handles: Record<Side, CreatureHandle | null> };
  }
}

interface FightStageProps {
  feed: FightFeed;
  fight: FightRow;
  fightInput: NonNullable<ReturnType<typeof usePreparedFight>["input"]>;
  live: boolean;
}

function FightStage({ feed, fight, fightInput, live }: FightStageProps) {
  const services = useStage();
  const stored = fight.outcome;
  const startsAt = fight.startsAt ?? 0;
  const player = useMemo(
    () => new FightPlayer(fightInput, stored, { label: `fight ${fight.round}.${fight.step}` }),
    // The stored outcome never changes once FIGHT starts; key on its hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fightInput, stored?.hash],
  );
  const fx = useMemo(() => new FxSystem(), []);
  const handles = useRef<Record<Side, CreatureHandle | null>>({ A: null, B: null });
  const owners = ownersOf(feed, fight);
  const names = useMemo(() => ({ A: fightInput.a.name, B: fightInput.b.name }), [fightInput]);
  const ownerNames = { A: playerName(feed, owners.A), B: playerName(feed, owners.B) };

  const head = useCallback(
    (side: Side, out: Vector3) => {
      const handle = handles.current[side];
      if (handle?.facePosition(out)) return out;
      const sample = player.samples?.[side];
      const p = sample?.root.p ?? [0, 0.5, 0];
      return out.set(p[0], p[1] + player.drivers[side].height * 0.45, p[2]);
    },
    [player],
  );

  const conductor = useMemo(
    () =>
      new FightConductor({
        services,
        player,
        fx,
        arena: fightInput.arena,
        startsAt,
        live,
        names,
        colors: { A: sparkColors(fightInput.a.palette), B: sparkColors(fightInput.b.palette) },
        dust: ARENA_DUST[fightInput.arena],
        head,
        onMethodShown: () => methodSlammed.add(fight.id),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, player, fx, fightInput, startsAt, live, names, head],
  );

  useEffect(() => {
    conductor.attach();
    return () => conductor.detach();
  }, [conductor]);

  useEffect(() => {
    let alive = true;
    loadRapier()
      .then((R) => {
        if (alive) player.start(R);
      })
      .catch((error: unknown) => console.warn("[slopfight] Rapier failed to load for playback", error));
    return () => {
      alive = false;
    };
  }, [player]);

  // The base shot frames both fighters (re-applied after the phase's entry cover).
  useBaseShot("fight_wide", conductor.pair);

  // The Voice: the whole fight's lines, timed from the stored log.
  useEffect(() => {
    const voice = voiceOf(services);
    const voiceFight = voiceFightOf(feed, fight);
    if (!voiceFight || !stored) return;
    voice.schedule(timeFightLines(voice.voice.fight(voiceFight, storedEvents(stored)), startsAt));
    // Scheduled once per fight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, fight.id, stored?.hash, startsAt]);

  // Hype from the room: the crowd gets louder and confetti flies (nothing else).
  const confetti = useRef<ConfettiHandle>(null);
  const lastHype = useRef(fight.hype);
  useEffect(() => {
    const previous = lastHype.current;
    lastHype.current = fight.hype;
    for (const side of ["A", "B"] as const) {
      const delta = fight.hype[side] - previous[side];
      if (delta <= 0) continue;
      services.cheer(Math.min(1, 0.25 + delta * 0.06));
      const torso = conductor.torso[side];
      const colors = sparkColors(fightInput[side === "A" ? "a" : "b"].palette);
      confetti.current?.burst({ origin: [torso.x, Math.max(0, torso.y) + 1.4, torso.z], colors, count: Math.min(60, 16 + delta * 6), speed: 3.2 });
    }
  }, [fight.hype, services, conductor, fightInput]);

  useFrame((_, delta) => conductor.frame(delta), -50);

  // Dev builds: the playback on window for scripted screenshots and checks.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__slopFight = { player, conductor, fight, handles: handles.current };
    return () => {
      if (window.__slopFight?.player === player) delete window.__slopFight;
    };
  }, [player, conductor, fight]);

  const timeScale = useClockScale();
  const setHandle = useCallback((side: Side, handle: CreatureHandle | null) => {
    handles.current[side] = handle;
  }, []);
  const koHead = useCallback(() => {
    const side = conductor.koSide;
    return side ? head(side, new Vector3()) : null;
  }, [conductor, head]);
  const roots = useMemo(
    () => ({ A: () => (player.samples ? conductor.torso.A : null), B: () => (player.samples ? conductor.torso.B : null) }),
    [player, conductor],
  );

  return (
    <>
      {(["A", "B"] as const).map((side) => (
        <group key={side}>
          <FightCreature player={player} side={side} timeScale={timeScale} handleRef={setHandle} />
          <SideMarker side={side} champion={player.champion(side)} arena={fightInput.arena} root={roots[side]} height={player.drivers[side].height} />
        </group>
      ))}
      <FightHud player={player} conductor={conductor} names={names} owners={ownerNames} />
      <KoStars head={koHead} visible={() => conductor.koSide !== null} />
      <FightFx system={fx} />
      <Confetti ref={confetti} capacity={300} />
    </>
  );
}
