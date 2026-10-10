"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { SAMPLES } from "@/games/slopfight/samples";
import {
  SFX_CUES,
  SFX_LOOPS,
  SLOPFIGHT_FILES,
  sfx,
  slopfightBank,
  type LoopName,
  type SfxName,
  type SlopfightFile,
} from "@/games/slopfight/audio";
import { Voice, toVoiceFighter, type VoiceLine } from "@/games/slopfight/narration";
import type { FightEvent } from "@/games/slopfight/sim/types";
import {
  activateAudio,
  getAudioStatus,
  getBusGain,
  isMuted,
  setBusGain,
  setNarratorDucking,
  subscribeAudio,
  toggleMute,
} from "@/lib/sounds";

interface ManifestEntry {
  name: string;
  group: string;
  file: string;
  seconds: number;
  bytes: number;
  lufs: number;
  peakDb: number;
  loop: { start: number; end: number } | null;
}

/** One file's decode result in the browser. */
export interface DecodeResult {
  name: string;
  ok: boolean;
  seconds?: number;
  peak?: number;
  /** Samples at full scale after decode: the MP3 overshot its headroom and clipped. */
  clipped?: number;
  /** Loops: how far the audio after the loop end strays from the loop start (RMS ratio; 0 is identical). */
  seamMismatch?: number;
  /** Loops: the jump across the seam relative to the typical sample step there (about 1 is invisible). */
  seamJump?: number;
  /** Loops: the shift (samples) that best lines the loop end up with its start; 0 means the loop length is exact. */
  seamLag?: number;
  problem?: string;
}

declare global {
  interface Window {
    __slopfightSoundCheck?: () => Promise<{
      total: number;
      failed: DecodeResult[];
      results: DecodeResult[];
    }>;
  }
}

const SAMPLE_RATE = 44_100;
const SEAM_WINDOW = 2_048;
const SEAM_LAGS = 32;
/** A decoded sample at or above this is clipped (decoders clamp to 1). */
const CLIP_LEVEL = 0.999;

/** Fetches and decodes every registered file the way the runtime will, and checks each loop's seam. */
async function decodeAll(): Promise<DecodeResult[]> {
  const results: DecodeResult[] = [];
  for (const [name, asset] of Object.entries(SLOPFIGHT_FILES)) {
    try {
      const response = await fetch(asset.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const data = buffer.getChannelData(0);
      let peak = 0;
      let clipped = 0;
      for (const value of data) {
        const level = Math.abs(value);
        if (level > peak) peak = level;
        if (level >= CLIP_LEVEL) clipped += 1;
      }
      const result: DecodeResult = {
        name,
        ok: true,
        seconds: +buffer.duration.toFixed(3),
        peak: +peak.toFixed(3),
        clipped,
      };
      if (buffer.duration <= 0 || peak < 0.01) {
        result.ok = false;
        result.problem = "silent or empty";
      } else if (clipped > 0) {
        result.ok = false;
        result.problem = `clips after decode (${clipped} samples)`;
      }
      const loop = "loop" in asset ? asset.loop : undefined;
      if (loop) {
        const start = Math.round(loop.start * buffer.sampleRate);
        const end = Math.round(loop.end * buffer.sampleRate);
        if (end + SEAM_WINDOW + SEAM_LAGS > data.length || start < SEAM_LAGS) {
          result.ok = false;
          result.problem = `buffer ends before the loop window (${data.length} < ${end + SEAM_WINDOW})`;
        } else {
          const mismatchAt = (lag: number) => {
            let total = 0;
            for (let k = 0; k < SEAM_WINDOW; k += 1)
              total += (data[end + lag + k]! - data[start + k]!) ** 2;
            return total;
          };
          let energy = 0;
          for (let k = 0; k < SEAM_WINDOW; k += 1) energy += data[start + k]! ** 2;
          const diff = mismatchAt(0);
          let bestLag = 0;
          let best = diff;
          for (let lag = -SEAM_LAGS; lag <= SEAM_LAGS; lag += 1) {
            const here = mismatchAt(lag);
            if (here < best) [best, bestLag] = [here, lag];
          }
          result.seamLag = bestLag;
          let step = 0;
          for (let k = 1; k <= 64; k += 1)
            step += Math.abs(data[start + k]! - data[start + k - 1]!);
          step = step / 64 || 1e-6;
          result.seamMismatch = +Math.sqrt(diff / Math.max(energy, 1e-9)).toFixed(3);
          result.seamJump = +(Math.abs(data[start]! - data[end - 1]!) / step).toFixed(2);
          if (result.seamMismatch > 0.35 || result.seamJump > 6 || bestLag !== 0) {
            result.ok = false;
            result.problem = "loop seam does not line up";
          }
        }
      }
      results.push(result);
    } catch (error) {
      results.push({
        name,
        ok: false,
        problem: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// The fight medley: a scripted fight with its sounds and the Voice's captions
// ---------------------------------------------------------------------------

const P: [number, number, number] = [0, 0, 0];
const hit = (
  t: number,
  side: "A" | "B",
  type: "STRIKE" | "TRICK",
  big: boolean,
  counter = false,
): FightEvent => ({
  t,
  kind: "hit",
  side,
  move: type === "STRIKE" ? 0 : 2,
  type,
  damage: big ? 18 : 8,
  knockback: big ? 7 : 3,
  big,
  point: P,
  health: 60,
  counter,
  miracle: false,
});

const MEDLEY_EVENTS: FightEvent[] = [
  { t: 0, kind: "start", side: null },
  { t: 900, kind: "contact", side: null, point: P },
  hit(1_400, "A", "STRIKE", false),
  hit(2_600, "B", "STRIKE", true),
  { t: 4_000, kind: "whiff", side: "A", move: 2, type: "TRICK", reason: "miss" },
  { t: 5_200, kind: "grab", side: "B", move: 1, point: P },
  { t: 5_800, kind: "throw", side: "B", move: 1, damage: 12, knockback: 6, point: P, health: 50 },
  { t: 7_000, kind: "edge", side: "A", point: P },
  hit(8_600, "A", "TRICK", true, true),
  { t: 10_200, kind: "showboat", side: "B" },
  hit(11_500, "A", "STRIKE", true),
  { t: 12_600, kind: "edge", side: "B", point: P },
  { t: 13_600, kind: "ringout", side: "B", point: P },
  { t: 13_600, kind: "end", side: "A", method: "RINGOUT" },
];
/** Face-off lead-in before the fight's t = 0. */
const MEDLEY_LEAD_MS = 3_000;
const MEDLEY_ARENA = "FLOODED_GARAGE" as const;
const MEDLEY_A = toVoiceFighter(SAMPLES[0]!.champion, "Player 1");
const MEDLEY_B = toVoiceFighter(SAMPLES[1]!.champion, "Player 2");

/** What each event sounds like. Pan follows the side: A on the left, B on the right. */
function soundFor(event: FightEvent): void {
  const pan = event.side === "A" ? -0.4 : event.side === "B" ? 0.4 : 0;
  switch (event.kind) {
    case "start":
      sfx.play("slam");
      sfx.play("crowdCheer", { intensity: 0.3 });
      break;
    case "contact":
      sfx.play("strikeThwack", { intensity: 0.3 });
      break;
    case "hit":
      if (event.big) sfx.hitStop(90);
      if (event.type === "TRICK") sfx.play("trickBonk", { intensity: event.big ? 0.9 : 0.4, pan });
      else sfx.play("strikeThwack", { intensity: event.big ? 0.95 : 0.4, pan });
      if (event.big) {
        sfx.play("healthCrunch", { pan, at: 0.05 });
        sfx.play("crowdGasp", { intensity: 0.5, at: 0.1 });
      }
      break;
    case "whiff":
      sfx.play("trickWhiff", { pan });
      break;
    case "grab":
      sfx.play("grappleLift", { pan });
      break;
    case "throw":
      sfx.play("grappleSlam", { intensity: 0.8, pan });
      sfx.play("ragdollThud", { intensity: 0.7, pan, at: 0.35 });
      break;
    case "edge":
      sfx.play("edgeAlarm", { pan });
      sfx.play("crowdGasp", { intensity: 0.4 });
      break;
    case "showboat":
      sfx.play("boing", { pan });
      break;
    case "ringout":
      sfx.play("slowMo");
      sfx.play("ringOutScream", { pan, at: 0.2 });
      sfx.landing(MEDLEY_ARENA, { at: 1.1 });
      sfx.play("crowdCheer", { intensity: 0.9, at: 1.3 });
      break;
    case "ko":
      sfx.play("koSting");
      break;
    case "end":
      sfx.play("winFanfare", { at: 2.2 });
      break;
    default:
      break;
  }
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`cursor-pointer rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
        active
          ? "border-teal bg-teal-soft text-ink"
          : "border-edge bg-surface text-ink-dim hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="rounded-xl border border-edge bg-surface/80 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink">{title}</h2>
      {note && <p className="mt-1 text-xs text-ink-dim">{note}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-dim">
      <span className="w-20">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-36"
      />
      <span className="w-10 tabular-nums text-ink">{value.toFixed(2)}</span>
    </label>
  );
}

const getServerStatus = () => "idle" as const;

/**
 * The SlopFight listening room: every cue (with intensity and pan), every
 * loop on its bus, every raw file, the ducks, a scripted fight medley with
 * the Voice's captions, and a decode check of every file.
 */
export function SoundLab() {
  const status = useSyncExternalStore(subscribeAudio, getAudioStatus, getServerStatus);
  const muted = useSyncExternalStore(subscribeAudio, isMuted, () => false);
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [intensity, setIntensity] = useState(0.5);
  const [pan, setPan] = useState(0);
  const [music, setMusic] = useState(() => getBusGain("music"));
  const [ambience, setAmbience] = useState(() => getBusGain("ambience"));
  const [running, setRunning] = useState<Set<LoopName>>(() => new Set());
  const [narratorDuck, setNarratorDuck] = useState(false);
  const [caption, setCaption] = useState<VoiceLine | null>(null);
  const [medleyOn, setMedleyOn] = useState(false);
  const [check, setCheck] = useState<DecodeResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    void fetch("/sfx/slopfight/manifest.json")
      .then((response) => response.json() as Promise<{ sounds: ManifestEntry[] }>)
      .then((data) => setManifest(data.sounds))
      .catch(() => setManifest([]));
    sfx.preload();
    const runCheck = async () => {
      setChecking(true);
      const results = await decodeAll();
      setCheck(results);
      setChecking(false);
      return { total: results.length, failed: results.filter((result) => !result.ok), results };
    };
    window.__slopfightSoundCheck = runCheck;
    return () => {
      delete window.__slopfightSoundCheck;
      for (const timer of timers.current) window.clearTimeout(timer);
      sfx.stopAll(0.2);
      setNarratorDucking(false);
    };
  }, []);

  const toggleLoop = (name: LoopName) => {
    void activateAudio();
    setRunning((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        sfx.stopLoop(name);
        next.delete(name);
      } else {
        sfx.loop(name, { fadeIn: 0.4 });
        next.add(name);
      }
      return next;
    });
  };

  const stopMedley = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
    sfx.stopAll(0.8);
    setRunning(new Set());
    setCaption(null);
    setMedleyOn(false);
  };

  const playMedley = async () => {
    stopMedley();
    await activateAudio();
    setMedleyOn(true);
    const later = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms));
    const fight = { round: 1, step: 1, arena: MEDLEY_ARENA, a: MEDLEY_A, b: MEDLEY_B };
    const voice = new Voice("medley");
    const [versus] = voice.faceOff(fight);
    const plan = voice.fight(fight, MEDLEY_EVENTS);
    const result = voice.result(fight, { winner: "A", method: "RINGOUT" });

    sfx.music("fight", 0.8);
    sfx.ambience(MEDLEY_ARENA, 0.8);
    sfx.loop("crowdMurmur", { fadeIn: 1 });
    sfx.play("letterbox");
    if (versus) setCaption(versus);
    for (const ms of [900, 1_600, 2_300]) later(ms, () => sfx.play("countdownTick"));
    for (const event of MEDLEY_EVENTS) later(MEDLEY_LEAD_MS + event.t, () => soundFor(event));
    for (const line of plan) later(MEDLEY_LEAD_MS + (line.atMs ?? 0), () => setCaption(line));
    const end = MEDLEY_LEAD_MS + MEDLEY_EVENTS.at(-1)!.t;
    later(end + 3_500, () => {
      sfx.play("wipe");
      sfx.music("result", 1);
      sfx.stopLoop("crowdMurmur", 1.5);
      if (result) setCaption(result);
    });
    later(end + 12_000, stopMedley);
  };

  const groups = new Map<string, ManifestEntry[]>();
  for (const entry of manifest)
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  const failed = check?.filter((result) => !result.ok) ?? [];

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-4 px-4 py-6 text-ink">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black">SlopFight sound</h1>
        <span className="text-xs text-ink-dim">audio: {status}</span>
        {status !== "ready" && <Chip onClick={() => void activateAudio()}>Enable audio</Chip>}
        <Chip active={muted} onClick={() => toggleMute()}>
          {muted ? "Muted" : "Mute"}
        </Chip>
        <Chip onClick={stopMedley}>Stop everything</Chip>
      </header>

      <Section
        title="Mix"
        note="Bus gains are the runtime defaults until moved. Intensity and pan apply to the cue buttons."
      >
        <div className="flex flex-col gap-2">
          <Slider
            label="Music bus"
            value={music}
            onChange={(value) => {
              setMusic(value);
              setBusGain("music", value);
            }}
          />
          <Slider
            label="Ambience bus"
            value={ambience}
            onChange={(value) => {
              setAmbience(value);
              setBusGain("ambience", value);
            }}
          />
          <Slider label="Intensity" value={intensity} onChange={setIntensity} />
          <Slider label="Pan" value={pan} min={-1} max={1} onChange={setPan} />
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Chip onClick={() => sfx.hitStop(90)}>Hit stop 90 ms</Chip>
          <Chip onClick={() => sfx.duck(0.3, 900)}>Duck beds 0.3 for 900 ms</Chip>
          <Chip
            active={narratorDuck}
            onClick={() => {
              setNarratorDucking(!narratorDuck);
              setNarratorDuck(!narratorDuck);
            }}
          >
            Narrator ducking
          </Chip>
        </div>
      </Section>

      <Section
        title="Fight medley"
        note="A scripted 17 s fight in the Flooded Garage: music, ambience, crowd, every fight cue, and the Voice's plan as captions."
      >
        <Chip active={medleyOn} onClick={() => void (medleyOn ? stopMedley() : playMedley())}>
          {medleyOn ? "Stop medley" : "Play fight medley"}
        </Chip>
        <p
          aria-live="polite"
          className="min-h-[2.5rem] w-full rounded-lg bg-ink/5 px-3 py-2 text-lg font-bold text-ink"
        >
          {caption ? (
            <>
              {caption.text}{" "}
              <span className="align-middle text-[0.65rem] font-semibold uppercase text-ink-dim">
                {caption.beat} {caption.speak ? "spoken" : "caption only"}
              </span>
            </>
          ) : (
            <span className="text-ink-dim">Captions show here.</span>
          )}
        </p>
      </Section>

      <Section
        title="Cues"
        note="sfx.play(name): picks a variant and a fresh pitch every time. Press one repeatedly."
      >
        {(Object.keys(SFX_CUES) as SfxName[]).map((name) => (
          <Chip
            key={name}
            onClick={() => {
              void activateAudio();
              sfx.play(name, { intensity, pan });
            }}
          >
            {name}
          </Chip>
        ))}
      </Section>

      <Section
        title="Loops"
        note="Music loops play on the music bus, the rest on ambience. Toggle to start and stop with a fade."
      >
        {(Object.keys(SFX_LOOPS) as LoopName[]).map((name) => (
          <Chip key={name} active={running.has(name)} onClick={() => toggleLoop(name)}>
            {name}
          </Chip>
        ))}
      </Section>

      {[...groups.entries()].map(([group, entries]) => (
        <Section key={group} title={`Files: ${group}`}>
          {entries.map((entry) => (
            <Chip
              key={entry.name}
              title={`${entry.seconds}s, ${(entry.bytes / 1024).toFixed(1)} KB, ${entry.lufs} LUFS, peak ${entry.peakDb} dB`}
              onClick={() => {
                void activateAudio();
                if (entry.loop) toggleLoop(loopNameFor(entry.name as SlopfightFile));
                else slopfightBank.play(entry.name as SlopfightFile);
              }}
            >
              {entry.name}
              <span className="ml-1 font-normal text-ink-dim">{entry.seconds.toFixed(2)}s</span>
            </Chip>
          ))}
        </Section>
      ))}

      <Section
        title="Decode check"
        note="Fetches and decodes every file in this browser, checks for clipping, and checks each loop's seam."
      >
        <Chip onClick={() => void window.__slopfightSoundCheck?.()}>
          {checking ? "Checking..." : "Run decode check"}
        </Chip>
        {check && (
          <div className="w-full">
            <p
              className={`text-sm font-bold ${failed.length ? "text-fail" : "text-teal"}`}
              data-testid="decode-summary"
            >
              {failed.length
                ? `${failed.length} of ${check.length} failed`
                : `All ${check.length} files decode`}
            </p>
            {/* Scrolls sideways inside its card on a phone instead of squashing the columns. */}
            <div className="mt-2 w-full overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-xs tabular-nums [&_td]:pr-3 [&_th]:pr-3">
                <thead className="text-ink-dim">
                  <tr>
                    <th className="py-1">file</th>
                    <th>seconds</th>
                    <th>peak</th>
                    <th>clipped</th>
                    <th>seam mismatch</th>
                    <th>seam jump</th>
                    <th>seam lag</th>
                    <th>result</th>
                  </tr>
                </thead>
                <tbody>
                  {check.map((result) => (
                    <tr key={result.name} className="border-t border-edge/60">
                      <td className="py-0.5">{result.name}</td>
                      <td>{result.seconds ?? ""}</td>
                      <td>{result.peak ?? ""}</td>
                      <td>{result.clipped ?? ""}</td>
                      <td>{result.seamMismatch ?? ""}</td>
                      <td>{result.seamJump ?? ""}</td>
                      <td>{result.seamLag ?? ""}</td>
                      <td className={result.ok ? "text-teal" : "text-fail"}>
                        {result.ok ? "ok" : result.problem}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>
    </main>
  );
}

function loopNameFor(file: SlopfightFile): LoopName {
  const found = (Object.entries(SFX_LOOPS) as [LoopName, { file: string }][]).find(
    ([, loop]) => loop.file === file,
  );
  return found ? found[0] : "musicFight";
}
