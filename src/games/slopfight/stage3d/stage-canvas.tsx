"use client";

// The persistent stage canvas: one <Canvas> for the whole game that fills its
// container (full-bleed on the TV, the docked column on /game, the recap).
// It hosts, in frame order:
//
//   -100  StageLoop      presentation clock + quality sampling
//      0  scene: lighting, arena set, phase scene (+ caller's children)
//    0.5  CameraRig      transitions, director, camera
//    0.6  SlamTitle      camera-fixed title
//    0.7  PostStack      post-fx uniforms
//    0.8  contact shadows depth pass (after animated transforms)
//      1  EffectComposer renders the frame
//
// A phase change keeps the old phase on stage (scene, lighting, set) until its
// entry transition covers the swap (useStagedPhase). The arena swaps under a
// deferred value, so the old set stays up while the next one loads; only the
// very first load shows the loading card. The title
// font warms up in parallel, outside that Suspense: a slow or broken font must
// never hold the loading card or take the canvas down.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace, type Group, type Object3D, type PerspectiveCamera } from "three";
import { useOptionalRoom } from "@/room/context";
import { ARENAS } from "../arenas";
import { ArenaSet } from "./arena/arena";
import { StageBoundary } from "./boundary";
import { SlamTitle } from "./director/slam";
import { warmFightPhysics } from "./fight/warmup";
import { StageLighting } from "./look/lighting";
import { moodFor } from "./look/moods";
import { PostStack } from "./look/post";
import { ALL_POST_ON, type PostToggles } from "./look/post-fx";
import type { QualityTier } from "./look/quality";
import { FINISH_DETAIL } from "./look/toon";
import { compileStageObjects, createProgramWarmup } from "./program-cache";
import { PHASE_DIRECTION, PhaseScene, StagedRoom, useStagedPhase } from "./scenes/phase-scene";
import { StageProvider, useArenaNodes, useCreateStageServices, useQuality, useStage, type StageServices } from "./services";
import type { StageInput } from "./stage-input";
import { Caption } from "./ui3d/caption";
import { MARQUEE_TEXT, StageText, useTitleFont } from "./ui3d/text";
import { VoiceNarration } from "./ui3d/voice-narration";

/** Rolling frame-time stats for the debug readout and the fps measurement. */
export class FrameStats {
  private readonly samples = new Float32Array(240);
  private count = 0;
  private cursor = 0;
  frames = 0;

  push(ms: number): void {
    this.samples[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
    this.frames += 1;
  }

  /** [median, p95] of the last few seconds, ms. */
  summary(): { median: number; p95: number } {
    if (this.count === 0) return { median: 0, p95: 0 };
    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    return {
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    };
  }
}

function StageLoop({ stats }: { stats: FrameStats }) {
  const services = useStage();
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") services.quality.rest(performance.now());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [services]);
  useFrame((_, delta) => {
    services.clock.tick(delta);
    const ms = delta * 1000;
    stats.push(ms);
    services.quality.sampleFrame(ms, performance.now());
  }, -100);
  return null;
}

function CameraRig() {
  const services = useStage();
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  useEffect(() => {
    services.camera = camera;
    return () => {
      if (services.camera === camera) services.camera = null;
    };
  }, [services, camera]);
  useFrame(() => {
    const { director, transitions, clock } = services;
    director.aspect = size.width / Math.max(1, size.height);
    transitions.update(clock.realDelta);
    director.update(clock.realDelta);
    director.apply(camera);
  }, 0.5);
  return null;
}

/** Follow the quality ladder's DPR cap and creature finish detail. */
function QualityFollower() {
  const quality = useQuality();
  const setDpr = useThree((state) => state.setDpr);
  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, quality.maxDpr));
  }, [quality.maxDpr, setDpr]);
  useEffect(() => {
    FINISH_DETAIL.value = quality.finishDetail;
  }, [quality.finishDetail]);
  return null;
}

/** Compile `objects` against the stage's lights, again whenever the arena (its lights) changes. */
function useStageCompile(objects: () => Object3D | null, label: string) {
  const { gl, camera, scene } = useThree();
  const nodes = useArenaNodes();
  useEffect(() => {
    // The arena's practical lights mount in the same commit as its nodes.
    const timer = window.setTimeout(() => {
      const root = objects();
      if (!root) return;
      void compileStageObjects(gl, root, camera, scene).catch((error: unknown) => {
        console.warn(`[slopfight] ${label} warmup failed`, error);
      });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [gl, camera, scene, nodes, objects, label]);
}

/**
 * Keep compiled shader programs across phase changes (see program-cache.ts).
 * One warmup set lives as long as the canvas: disposing it while its programs
 * were still linking (as the arena's nodes arrived) deleted them mid-link.
 */
function ProgramKeeper() {
  const warmup = useRef<ReturnType<typeof createProgramWarmup> | null>(null);
  useEffect(() => {
    const created = createProgramWarmup();
    warmup.current = created;
    return () => {
      warmup.current = null;
      created.dispose();
    };
  }, []);
  useStageCompile(useCallback(() => warmup.current?.root ?? null, []), "Shader");
  return null;
}

/**
 * Keep the SDF text programs too: a lit label, a sign's unlit letters and a
 * camera-fixed caption, hidden. Troika derives each text's material, so these
 * are real StageTexts rather than entries in createProgramWarmup.
 */
function TextPrograms() {
  const texts = useRef<Group>(null);
  useStageCompile(useCallback(() => texts.current, []), "Text shader");
  return (
    <group ref={texts} visible={false}>
      <StageText glow={0.1}>Aa</StageText>
      <StageText {...MARQUEE_TEXT}>Aa</StageText>
      <StageText overlay>Aa</StageText>
    </group>
  );
}

/** Parse the slam font before the first slam needs it (a failure only costs the 3D title). */
function TitleFontWarmup() {
  useTitleFont();
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export interface StageCanvasProps {
  input: StageInput;
  /** Pin a quality tier (`?quality=`); null is auto. */
  quality?: QualityTier | null;
  toggles?: PostToggles;
  /** Frame-time readout (`?debug=1`). */
  debug?: boolean;
  /** Bring your own services (the dev lab drives them); otherwise the canvas makes its own. */
  services?: StageServices;
  /** Extra scene content (inside the canvas, after the phase scene). */
  children?: ReactNode;
  /** Replace the phase scene (null renders none). */
  scene?: ReactNode | null;
  /** DOM over the canvas (dev tools only; the game draws everything in 3D). */
  overlay?: ReactNode;
  className?: string;
}

function StageContents({
  input,
  toggles,
  stats,
  scene,
  children,
  onReady,
}: {
  input: StageInput;
  toggles: PostToggles;
  stats: FrameStats;
  scene: ReactNode | null | undefined;
  children?: ReactNode;
  onReady: () => void;
}) {
  const room = useOptionalRoom();
  const staged = useStagedPhase(input, room, scene === undefined);
  const shown = staged.input;
  const arena = useDeferredValue(shown.arena);
  const mood = moodFor(arena);
  return (
    <>
      <StageLoop stats={stats} />
      <ProgramKeeper />
      <CameraRig />
      <QualityFollower />
      <StageLighting mood={mood} geometry={ARENAS[arena].geometry} phase={shown.phase} />
      <Suspense fallback={null}>
        <ArenaSet
          arena={arena}
          mood={mood}
          order={input.arenaOrder}
          showPodium={PHASE_DIRECTION[shown.phase].showPodium === true}
        />
        <Ready onReady={onReady} />
      </Suspense>
      <StageBoundary label="title font warm-up" fallback={null}>
        <Suspense fallback={null}>
          <TitleFontWarmup />
        </Suspense>
      </StageBoundary>
      <StageBoundary label="text warm-up" fallback={null}>
        <Suspense fallback={null}>
          <TextPrograms />
        </Suspense>
      </StageBoundary>
      {/* Scene content suspends on its own (fonts, models): it must never block the canvas. */}
      <Suspense fallback={null}>
        {scene === undefined ? (
          <StagedRoom room={staged.room}>
            <PhaseScene input={shown} />
          </StagedRoom>
        ) : (
          scene
        )}
      </Suspense>
      <Suspense fallback={null}>{children}</Suspense>
      <StageBoundary label="slam title" fallback={null}>
        <SlamTitle />
      </StageBoundary>
      <StageBoundary label="captions" fallback={null}>
        <Caption />
      </StageBoundary>
      <PostStack mood={mood} toggles={toggles} />
    </>
  );
}

function LoadingCard() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <p className="rounded-2xl border-2 border-edge bg-surface px-[1.5rem] py-[1rem] font-display text-[1.25rem] font-bold text-ink-dim">
        Setting up the arena...
      </p>
    </div>
  );
}

function DebugReadout({ services, stats }: { services: StageServices; stats: FrameStats }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => {
      const { median, p95 } = stats.summary();
      const q = services.quality.settings;
      setText(
        `${median.toFixed(1)} ms (p95 ${p95.toFixed(1)}) ${median > 0 ? Math.round(1000 / median) : 0} fps | ` +
          `${q.tier} L${q.level}${services.quality.auto ? " auto" : ""} | ${services.director.shot}`,
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [services, stats]);
  return (
    <div
      data-stage-debug
      className="pointer-events-none absolute top-[0.5rem] left-[0.5rem] z-10 rounded bg-black/55 px-[0.5rem] py-[0.25rem] font-mono text-[0.75rem] text-white"
    >
      {text}
    </div>
  );
}

declare global {
  interface Window {
    /** Dev builds: the live stage's services (screenshots and console pokes). */
    __slopStage?: { services: StageServices; stats: FrameStats };
  }
}

export function StageCanvas({
  input,
  quality = null,
  toggles = ALL_POST_ON,
  debug = false,
  services: external,
  children,
  scene,
  overlay,
  className,
}: StageCanvasProps) {
  const own = useCreateStageServices({ clockOffsetMs: input.clockOffsetMs, quality });
  const services = external ?? own;
  const [stats] = useState(() => new FrameStats());
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  const [initialDpr] = useState(() => services.quality.settings.maxDpr);

  useEffect(() => {
    void warmFightPhysics().catch((error: unknown) => {
      console.warn("[slopfight] Physics warmup failed", error);
    });
  }, []);

  useEffect(() => {
    services.clock.offsetMs = input.clockOffsetMs;
  }, [services, input.clockOffsetMs]);

  // In-scene beats play their sounds only in a live room (ui3d/sound.ts).
  useEffect(() => {
    services.live = input.live;
  }, [services, input.live]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__slopStage = { services, stats };
    return () => {
      if (window.__slopStage?.services === services) delete window.__slopStage;
    };
  }, [services, stats]);

  const background = moodFor(input.arena).fog.color;
  return (
    <StageProvider services={services}>
      <div className={className ?? "absolute inset-0"} style={{ background }} data-stage-ready={ready ? "1" : "0"}>
        <Canvas
          shadows="percentage"
          dpr={[1, initialDpr]}
          camera={{ fov: 40, near: 0.1, far: 260, position: [0, 3, 9] }}
          gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping;
            gl.outputColorSpace = SRGBColorSpace;
          }}
        >
          <StageContents input={input} toggles={toggles} stats={stats} scene={scene} onReady={markReady}>
            {children}
          </StageContents>
        </Canvas>
        {!ready && <LoadingCard />}
        {debug && <DebugReadout services={services} stats={stats} />}
        {/* The Voice's TTS on the host stage (renders nothing elsewhere) and its per-game seed. */}
        <VoiceNarration voice={services.voice} />
        {overlay}
      </div>
    </StageProvider>
  );
}
