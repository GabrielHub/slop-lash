"use client";

// The stage's services: one object per canvas holding the presentation clock,
// quality, post-fx state, the director, the transitions, the crowd, the
// arena's node registry and the event bus. Plain classes (they change every
// frame); React components reach them through the hooks below. R3F v9 bridges
// React context into the canvas, so the hooks work inside and outside it.

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { Vector3, type PerspectiveCamera } from "three";
import type { ArenaNodes } from "./arena/nodes";
import { CrowdController } from "./arena/crowd";
import type { WindState } from "./arena/hazards";
import { StageClock } from "./director/clock";
import { Director } from "./director/director";
import { TransitionController } from "./director/transitions";
import { StageEvents } from "./events";
import { PostFx } from "./look/post-fx";
import { QualityController, type QualitySettings, type QualityTier } from "./look/quality";
import { VoiceService } from "./ui3d/voice";

/** Holds the current set's node registry with change notifications. */
export class ArenaStore {
  private value: ArenaNodes | null = null;
  private readonly listeners = new Set<() => void>();

  get nodes(): ArenaNodes | null {
    return this.value;
  }

  set(nodes: ArenaNodes | null): void {
    if (this.value === nodes) return;
    this.value = nodes;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ArenaNodes | null => this.value;
}

/** "Floor" alert strips per edge, 0..1 (ON THE EDGE). The arena applies them. */
export type EdgeAlerts = Record<"N" | "E" | "S" | "W", number>;

/**
 * Wind for the set dressing (laundry, windsock). A fight scene drives it from
 * the sim (`windFor` + `windStrengthAt`) and sets `driven`; otherwise the
 * arena runs idle gusts.
 */
export interface StageWind extends WindState {
  driven: boolean;
}

export interface ImpactOptions {
  /** World point of the contact (impact frame lines converge here). */
  point?: Vector3 | null;
  /** 0..1, e.g. damage / 30 clamped. Scales shake and the aberration spike. */
  strength?: number;
  /** A big hit: adds the slow-motion window (0.3x for 0.5 s) and a punch-in. */
  big?: boolean;
  /** Hit stop length in frames (default 4). */
  hitStopFrames?: number;
}

export interface StageServicesOptions {
  clockOffsetMs?: number;
  quality?: QualityTier | null;
}

export class StageServices {
  readonly events = new StageEvents();
  readonly clock: StageClock;
  readonly quality: QualityController;
  readonly fx = new PostFx();
  readonly director: Director;
  readonly transitions: TransitionController;
  readonly crowd = new CrowdController();
  readonly arena = new ArenaStore();
  readonly edgeAlerts: EdgeAlerts = { N: 0, E: 0, S: 0, W: 0 };
  readonly wind: StageWind = { x: 1, z: 0, strength: 0, driven: false };
  /** The canvas camera, set by the camera rig. */
  camera: PerspectiveCamera | null = null;
  /**
   * A live room (the canvas copies `input.live`): in-scene beats play their
   * sounds only when set (ui3d/sound.ts `stageSfx`). Recaps and dev views stay quiet.
   */
  live = false;
  /** The Voice: captions in the scene and the host's TTS feed (ui3d/voice.ts). */
  readonly voice: VoiceService;

  constructor(options: StageServicesOptions = {}) {
    this.clock = new StageClock({
      offsetMs: options.clockOffsetMs ?? 0,
      onResync: (droppedMs) => this.events.emit("resync", { droppedMs }),
    });
    this.quality = new QualityController({ tier: options.quality ?? null });
    this.voice = new VoiceService(() => this.clock.now);
    // The director repays the clock's hit-stop / slow-mo debt on its hard cuts.
    this.director = new Director({ events: this.events, fx: this.fx, clock: this.clock });
    this.transitions = new TransitionController({
      fx: this.fx,
      director: this.director,
      events: this.events,
      camera: () => this.camera,
    });
  }

  /**
   * One meaningful contact, the whole feel package at once (spec 6): hit stop
   * (four frozen frames), the impact frame (one white flash + radial lines),
   * shake scaled by `strength`, and for a big hit a slow-motion window and a
   * punch-in. Scenes still choose the shot (e.g. request impact_pop).
   */
  impact(options: ImpactOptions = {}): void {
    const strength = Math.min(1, Math.max(0, options.strength ?? 0.5));
    this.clock.hitStop(options.hitStopFrames);
    this.fx.impactFrame(options.point ?? null, strength);
    this.director.shake(0.25 + 0.6 * strength);
    if (options.big) {
      this.clock.slowMo();
      this.director.punchIn(1);
      this.events.emit("slowmo", { scale: 0.3, durationMs: 500 });
    }
    this.events.emit("impact", { strength, big: options.big === true });
  }

  /** The crowd erupts (and tells the audio layer). */
  cheer(strength = 1): void {
    this.crowd.cheer(strength);
    this.events.emit("cheer", { strength });
  }
}

const StageContext = createContext<StageServices | null>(null);

export function StageProvider({ services, children }: { services: StageServices; children: ReactNode }) {
  return <StageContext.Provider value={services}>{children}</StageContext.Provider>;
}

/** Create the services once for a canvas's lifetime. */
export function useCreateStageServices(options: StageServicesOptions): StageServices {
  const [services] = useState(() => new StageServices(options));
  return services;
}

export function useStage(): StageServices {
  const services = useContext(StageContext);
  if (!services) throw new Error("useStage must be used inside a SlopFight stage");
  return services;
}

export const useStageClock = () => useStage().clock;
export const useDirector = () => useStage().director;
export const useTransitions = () => useStage().transitions;
export const useCrowd = () => useStage().crowd;
export const usePostFx = () => useStage().fx;
export const useStageEvents = () => useStage().events;
export const useVoice = () => useStage().voice;

const standaloneQuality = new QualityController({ tier: "high" });

/** The current quality rung; standalone creature labs use the full-quality preset. */
export function useQuality(): QualitySettings {
  const quality = useContext(StageContext)?.quality ?? standaloneQuality;
  return useSyncExternalStore(quality.subscribe, quality.getSnapshot, quality.getSnapshot);
}

/** The current set's named nodes (null until the set has loaded); re-renders on a set swap. */
export function useArenaNodes(): ArenaNodes | null {
  const { arena } = useStage();
  return useSyncExternalStore(arena.subscribe, arena.getSnapshot, arena.getSnapshot);
}
