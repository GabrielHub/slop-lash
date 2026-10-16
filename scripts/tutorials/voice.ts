/**
 * Records the how-to-play voice-overs with ElevenLabs and writes each game's
 * real timing.
 *
 *   node --no-warnings --experimental-transform-types \
 *     --import ./scripts/quizslop/register-ts-loader.mjs \
 *     scripts/tutorials/voice.ts [slug ...] [--fresh] [--seed=N]
 *
 * (or `vp run tutorials:voice [slug ...]`). For each game it renders the whole
 * script as one performance (text-to-dialogue with timestamps, one input per
 * line), cuts every line out of it, lays the lines on the video's clock with
 * even breaths between them, levels the result and writes:
 *
 * - `public/tutorials/<slug>/voice.mp3`, the voice track from t = 0 (the lead
 *   is silence), and
 * - `src/games/<game>/tutorial/timing.ts`, every line's and word's start and
 *   end on that clock (re-checked against the MP3 with forced alignment),
 *   which the scene keys its beats on.
 *
 * Responses are cached under `node_modules/.cache/tutorial-voice`, so a re-run
 * with the same script, voice and seed re-cuts without spending characters.
 * `--fresh` records a new take; `--seed=N` records a specific one. `--stage`
 * writes the timing to the system temp folder instead of over the game's, to
 * review a take before the scene picks it up.
 * ELEVENLABS_API_KEY comes from the environment or `.env.local`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Mp3Encoder } from "@breezystack/lamejs";
import {
  captionOf,
  normalWord,
  type LineTiming,
  type TutorialScript,
  type TutorialTiming,
  type WordTiming,
} from "../../src/tutorial/timeline";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE_DIR = path.join(repoRoot, "node_modules/.cache/tutorial-voice");
const STAGE_DIR = path.join(tmpdir(), "tutorial-voice");

const MODEL_ID = "eleven_v4";
/** The best PCM the Creator tier serves; plenty for speech. */
const SAMPLE_RATE = 24_000;
const KBPS = 80;

/** Silence between one line's last word and the next line's first. */
const BREATH_S = 0.42;
/** Extra room before a line that opens a chapter, for the scene's transition. */
const CHAPTER_BREATH_S = 0.3;
/** Audio kept around the words of a cut line. */
const CUT_PRE_S = 0.08;
const CUT_POST_S = 0.3;
const FADE_S = 0.012;
/** Leveling: speech RMS target, with a peak ceiling. */
const TARGET_RMS_DB = -19;
const PEAK_CEILING_DB = -1;
/**
 * lamejs writes no gapless header, so decoders play its start delay (encoder
 * 576 + decoder 529 samples). The lead is silence, so trimming that much off
 * the front puts the words back on the clock.
 */
const MP3_DELAY_SAMPLES = 1105;

interface Cast {
  /** ElevenLabs voice id, and who it is, for whoever re-casts. */
  voiceId: string;
  voiceName: string;
  persona: string;
  /** The take that was kept; another seed records a different performance. */
  seed?: number;
}

/** A game's script and timing files, from its slug. */
const tutorialFile = (slug: string, name: "script" | "timing") =>
  `src/games/${slug}/tutorial/${name}.ts`;

/** One host per game, cast from the account's voices. */
const CASTS: Record<string, Cast> = {
  sloplash: {
    voiceId: "IKne3meq5aSn9XLyUdCD",
    voiceName: "Charlie (deep, confident, energetic)",
    persona: "a gleeful game-show MC",
  },
  matchslop: {
    voiceId: "pFZP5JQG7iQjIQuC4Bku",
    voiceName: "Lily (velvety actress)",
    persona: "the match's protective best friend, leaving a voice note",
  },
  quizslop: {
    voiceId: "BFd5oBc2DDna33pSi4Gf",
    voiceName: "Alicia (polished global anchor)",
    persona: "a polished, slightly too confident quiz host",
  },
  slopfight: {
    voiceId: "nPczCjzI2devNBz1zQrb",
    voiceName: "Brian (deep, resonant)",
    persona: "The Voice, a deadpan prizefight announcer",
  },
};

// ---------------------------------------------------------------------------
// ElevenLabs
// ---------------------------------------------------------------------------

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface VoiceSegment {
  start_time_seconds: number;
  end_time_seconds: number;
  character_start_index: number;
  character_end_index: number;
  dialogue_input_index: number;
}

interface DialogueResponse {
  audio_base64: string;
  alignment: Alignment;
  voice_segments: VoiceSegment[];
}

function apiKey(): string {
  const fromEnv = process.env.ELEVENLABS_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const envFile = path.join(repoRoot, ".env.local");
  const match = existsSync(envFile)
    ? /^ELEVENLABS_API_KEY=(.+)$/m.exec(readFileSync(envFile, "utf8"))
    : null;
  const key = match?.[1].trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("Set ELEVENLABS_API_KEY (in the environment or .env.local)");
  return key;
}

async function record(
  slug: string,
  cast: Cast,
  script: TutorialScript,
  seed: number,
  fresh: boolean,
) {
  const body = {
    model_id: MODEL_ID,
    seed,
    inputs: script.lines.map((line) => ({ text: line.say, voice_id: cast.voiceId })),
  };
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${slug}-${hash}.json`);
  if (!fresh && existsSync(cacheFile)) {
    console.log(`  cached take ${hash}`);
    return JSON.parse(readFileSync(cacheFile, "utf8")) as DialogueResponse;
  }
  const characters = body.inputs.reduce((sum, input) => sum + input.text.length, 0);
  console.log(`  recording ${characters} characters with ${cast.voiceName}, seed ${seed}…`);
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=pcm_${SAMPLE_RATE}`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey(), "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const result = (await response.json()) as DialogueResponse;
  if (result.voice_segments.length !== script.lines.length) {
    throw new Error(
      `Expected ${script.lines.length} voice segments, got ${result.voice_segments.length}`,
    );
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(result));
  return result;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** The spoken words in characters [from, to) of the alignment, delivery tags skipped. */
function alignedWords(alignment: Alignment, from: number, to: number): WordTiming[] {
  const words: WordTiming[] = [];
  let current: WordTiming | null = null;
  let depth = 0;
  for (let index = from; index < to; index++) {
    const char = alignment.characters[index];
    if (char === "[") depth++;
    if (depth > 0 || /\s/.test(char)) {
      if (current) words.push(current);
      current = null;
      if (char === "]") depth = Math.max(0, depth - 1);
      continue;
    }
    const start = alignment.character_start_times_seconds[index];
    const end = alignment.character_end_times_seconds[index];
    if (current) {
      current.text += char;
      current.end = Math.max(current.end, end);
    } else {
      current = { text: char, start, end };
    }
  }
  if (current) words.push(current);
  return words;
}

/**
 * The caption's words timed from the alignment. The two normally match word
 * for word; if not, the caption's words share the spoken span by length.
 */
function timeWords(caption: string, spoken: WordTiming[], label: string): WordTiming[] {
  const words = caption.split(" ");
  const same =
    spoken.length === words.length &&
    spoken.every((word, index) => normalWord(word.text) === normalWord(words[index]));
  if (same) return words.map((text, index) => ({ ...spoken[index], text }));
  console.warn(`  ! ${label}: alignment words differ from the caption; spreading by length`);
  const start = spoken[0]?.start ?? 0;
  const end = spoken.at(-1)?.end ?? start + caption.length / 15;
  const total = words.reduce((sum, word) => sum + word.length + 1, 0);
  let clock = start;
  return words.map((text) => {
    const span = ((text.length + 1) / total) * (end - start);
    const word = { text, start: clock, end: clock + span * 0.92 };
    clock += span;
    return word;
  });
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

function pcmFromBase64(base64: string): Float32Array {
  const bytes = Buffer.from(base64, "base64");
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let index = 0; index < samples.length; index++) {
    samples[index] = bytes.readInt16LE(index * 2) / 32768;
  }
  return samples;
}

const seconds = (s: number) => Math.round(s * SAMPLE_RATE);
const db = (value: number) => 10 ** (value / 20);

function encodeMp3(samples: Float32Array): Buffer {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index++) {
    pcm[index] = Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767);
  }
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, KBPS);
  const chunks: Buffer[] = [];
  for (let index = 0; index < pcm.length; index += 1152) {
    const chunk = encoder.encodeBuffer(pcm.subarray(index, index + 1152));
    if (chunk.length) chunks.push(Buffer.from(chunk));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

/** RMS level in dB of 20 ms windows every 10 ms. */
const HOP_S = 0.01;
function envelope(samples: Float32Array): Float32Array {
  const hop = seconds(HOP_S);
  const size = hop * 2;
  const frames = new Float32Array(Math.ceil(samples.length / hop));
  for (let frame = 0; frame < frames.length; frame++) {
    let sum = 0;
    for (let index = frame * hop; index < frame * hop + size && index < samples.length; index++) {
      sum += samples[index] ** 2;
    }
    frames[frame] = 10 * Math.log10(sum / size + 1e-12);
  }
  return frames;
}

interface Span {
  start: number;
  end: number;
}

/** The quiet runs (below `quiet` dB) between `from` and `to` seconds. */
function quietRuns(env: Float32Array, quiet: number, from: number, to: number): Span[] {
  const first = Math.max(0, Math.floor(from / HOP_S));
  const last = Math.min(env.length - 1, Math.ceil(to / HOP_S));
  const runs: Span[] = [];
  let run = -1;
  for (let frame = first; frame <= last + 1; frame++) {
    const isQuiet = frame <= last && env[frame] < quiet;
    if (isQuiet && run < 0) run = frame;
    if (!isQuiet && run >= 0) {
      // A window spans two hops, so a run starts one hop after the sound stops.
      runs.push({ start: (run + 1) * HOP_S, end: frame * HOP_S });
      run = -1;
    }
  }
  return runs;
}

const LEADING_TAG = /^\s*\[[^\]]*\]/;
const TRAILING_TAG = /\[[^\]]*\]\s*$/;

/**
 * Where one line's sound stops and the next one's starts, in the gap between
 * the last word of one and the first word of the next. A tag at either edge
 * may be a sound of its own (a sigh before a line, a laugh after one), so the
 * line it belongs to keeps it: the cut goes at the first quiet after the
 * earlier line, or the last quiet before the later one. Otherwise it goes in
 * the longest quiet; with none, at the quietest moment.
 */
function lineBreak(
  env: Float32Array,
  quiet: number,
  earlier: { say: string; end: number },
  later: { say: string; start: number },
): Span {
  if (later.start <= earlier.end) {
    const middle = (earlier.end + later.start) / 2;
    return { start: middle, end: middle };
  }
  const runs = quietRuns(env, quiet, earlier.end - 0.02, later.start + 0.02);
  if (runs.length > 0) {
    if (LEADING_TAG.test(later.say)) return runs[0];
    if (TRAILING_TAG.test(earlier.say)) return runs.at(-1)!;
    return runs.reduce((best, run) => (run.end - run.start > best.end - best.start ? run : best));
  }
  const first = Math.floor(earlier.end / HOP_S);
  const last = Math.ceil(later.start / HOP_S);
  let quietest = first;
  for (let frame = first; frame <= last; frame++) if (env[frame] < env[quietest]) quietest = frame;
  return { start: (quietest + 1) * HOP_S, end: (quietest + 1) * HOP_S };
}

/**
 * Lays the recorded lines on the video's clock: each line's sound is cut out
 * of the take, its first sound lands on the clock, and a breath follows its
 * last. `words` are each line's words in take time.
 */
function assemble(script: TutorialScript, source: Float32Array, words: WordTiming[][]) {
  const env = envelope(source);
  const quiet = Math.max(-55, Math.max(...env) - 36);
  const sourceEnd = source.length / SAMPLE_RATE;

  const breaks = script.lines
    .slice(0, -1)
    .map((line, index) =>
      lineBreak(
        env,
        quiet,
        { say: line.say, end: words[index].at(-1)!.end },
        { say: script.lines[index + 1].say, start: words[index + 1][0].start },
      ),
    );
  // The first sound before the first word, and the last after the last word.
  const opening = quietRuns(env, quiet, 0, words[0][0].start)[0];
  const firstSound = opening && opening.start <= HOP_S * 2 ? opening.end : 0;
  const closing = quietRuns(env, quiet, words.at(-1)!.at(-1)!.end - 0.02, sourceEnd).at(-1);
  const lastSound = closing && closing.end >= sourceEnd - HOP_S * 2 ? closing.start : sourceEnd;

  const placed: { from: number; to: number; at: number }[] = [];
  const lines: LineTiming[] = [];
  let clock = script.lead;

  script.lines.forEach((line, index) => {
    const before = index === 0 ? { start: 0, end: firstSound } : breaks[index - 1];
    const after = index === breaks.length ? { start: lastSound, end: sourceEnd } : breaks[index];
    const soundStart = before.end;
    const soundEnd = after.start;
    const from = Math.max((before.start + before.end) / 2, soundStart - CUT_PRE_S);
    const to = Math.min((after.start + after.end) / 2, soundEnd + CUT_POST_S);

    if (index > 0 && line.chapter) clock += CHAPTER_BREATH_S;
    const shift = clock - soundStart;
    placed.push({ from, to, at: from + shift });
    const timed = words[index].map((word) => ({
      ...word,
      start: word.start + shift,
      end: word.end + shift,
    }));
    lines.push({
      id: line.id,
      text: captionOf(line.say),
      start: timed[0].start,
      end: timed.at(-1)!.end,
      words: timed,
    });
    clock = soundEnd + shift + BREATH_S + (line.pause ?? 0);
  });

  const out = new Float32Array(seconds(Math.max(...placed.map((p) => p.at + (p.to - p.from)))) + 1);
  const fade = seconds(FADE_S);
  for (const { from, to, at } of placed) {
    const begin = seconds(from);
    const length = seconds(to) - begin;
    const offset = seconds(at);
    for (let index = 0; index < length; index++) {
      const edge = Math.min(1, index / fade, (length - 1 - index) / fade);
      out[offset + index] += (source[begin + index] ?? 0) * edge;
    }
  }

  // Level on the speech, not the silences.
  let energy = 0;
  let counted = 0;
  let peak = 0;
  for (const value of out) {
    const magnitude = Math.abs(value);
    peak = Math.max(peak, magnitude);
    if (magnitude > db(-45)) {
      energy += value * value;
      counted++;
    }
  }
  const rms = Math.sqrt(energy / Math.max(1, counted));
  const gain = Math.min(db(TARGET_RMS_DB) / rms, db(PEAK_CEILING_DB) / peak);
  for (let index = 0; index < out.length; index++) out[index] *= gain;

  return { samples: out.subarray(MP3_DELAY_SAMPLES), lines, gainDb: 20 * Math.log10(gain) };
}

// ---------------------------------------------------------------------------
// Forced alignment
// ---------------------------------------------------------------------------

/** Words further than this from the cut's own timing are a misalignment, not a refinement. */
const ALIGN_TOLERANCE_S = 1;

interface AlignedWord {
  text: string;
  start: number;
  end: number;
}

/**
 * ElevenLabs forced alignment: where each word of `text` is said in `audio`,
 * or null when it fails or hears different words. Cached by audio and text.
 */
async function forcedAlignment(
  slug: string,
  audio: Buffer,
  type: string,
  text: string,
): Promise<AlignedWord[] | null> {
  const hash = createHash("sha256").update(audio).update(text).digest("hex").slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${slug}-align-${hash}.json`);
  let words: AlignedWord[];
  if (existsSync(cacheFile)) {
    words = JSON.parse(readFileSync(cacheFile, "utf8")) as AlignedWord[];
  } else {
    const form = new FormData();
    const name = type === "audio/wav" ? "take.wav" : "voice.mp3";
    form.append("file", new Blob([new Uint8Array(audio)], { type }), name);
    form.append("text", text);
    const response = await fetch("https://api.elevenlabs.io/v1/forced-alignment", {
      method: "POST",
      headers: { "xi-api-key": apiKey() },
      body: form,
    });
    if (!response.ok) {
      console.warn(`  ! forced alignment failed (${response.status})`);
      return null;
    }
    const body = (await response.json()) as { words: AlignedWord[] };
    words = body.words.filter((word) => word.text.trim() !== "");
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(words));
  }
  const expected = text.split(" ");
  if (
    words.length !== expected.length ||
    words.some((word, index) => normalWord(word.text) !== normalWord(expected[index]))
  ) {
    console.warn("  ! forced alignment heard different words from the captions");
    return null;
  }
  return words;
}

function encodeWav(samples: Float32Array): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length * 2, 40);
  const data = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767), index * 2);
  }
  return Buffer.concat([header, data]);
}

/**
 * Each line's words in the take. The dialogue's own alignment is good inside
 * a line but drifts at its edges (a last word stretched to the segment's end,
 * a first word pinned to its start), and the edges are where the take gets
 * cut, so the whole take is forced-aligned and the dialogue's alignment is
 * only the fallback.
 */
async function wordsInTake(
  slug: string,
  script: TutorialScript,
  take: DialogueResponse,
  source: Float32Array,
): Promise<WordTiming[][]> {
  const captions = script.lines.map((line) => captionOf(line.say));
  const heard = await forcedAlignment(slug, encodeWav(source), "audio/wav", captions.join(" "));
  if (heard) {
    let index = 0;
    return captions.map((caption) =>
      caption.split(" ").map((text) => {
        const word = heard[index++];
        return { text, start: word.start, end: word.end };
      }),
    );
  }
  console.warn("  ! cutting on the dialogue's own alignment");
  return script.lines.map((line, index) => {
    const segment = take.voice_segments.find((s) => s.dialogue_input_index === index);
    if (!segment) throw new Error(`No voice segment for line "${line.id}"`);
    const spoken = alignedWords(
      take.alignment,
      segment.character_start_index,
      segment.character_end_index,
    );
    return timeWords(captions[index], spoken, line.id);
  });
}

/**
 * Re-times every word against the finished MP3, which the aligner hears as
 * a browser will play it (decoder delay and all).
 */
async function alignToFile(slug: string, mp3: Buffer, lines: LineTiming[]): Promise<LineTiming[]> {
  const words = await forcedAlignment(
    slug,
    mp3,
    "audio/mpeg",
    lines.map((line) => line.text).join(" "),
  );
  if (!words) {
    console.warn("  ! keeping the cut's timing");
    return lines;
  }
  let index = 0;
  let refined = 0;
  const result = lines.map((line) => {
    const timed = line.words.map((word) => {
      const heard = words[index++];
      const close =
        Math.abs(heard.start - word.start) < ALIGN_TOLERANCE_S &&
        Math.abs(heard.end - word.end) < ALIGN_TOLERANCE_S &&
        heard.end > heard.start;
      if (!close) return word;
      refined++;
      return { ...word, start: heard.start, end: heard.end };
    });
    return { ...line, start: timed[0].start, end: timed.at(-1)!.end, words: timed };
  });
  console.log(`  aligned ${refined}/${index} words to the file`);
  return result;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const round = (value: number) => Math.round(value * 1000) / 1000;

function timingModule(cast: Cast, timing: TutorialTiming): string {
  const lines = timing.lines.map((line) => ({
    ...line,
    start: round(line.start),
    end: round(line.end),
    words: line.words.map((word) => ({ ...word, start: round(word.start), end: round(word.end) })),
  }));
  return `// Written by scripts/tutorials/voice.ts from the recorded voice-over (${cast.voiceName},
// ${MODEL_ID}). Re-run it after editing script.ts. Relative imports: Convex reads it too.
import type { TutorialTiming } from "../../../tutorial/timeline";

export const timing: TutorialTiming = ${JSON.stringify({ ...timing, lines }, null, 2)};
`;
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  const stage = args.includes("--stage");
  const seedArg = args.find((arg) => arg.startsWith("--seed="));
  const slugs = args.filter((arg) => !arg.startsWith("--"));
  const chosen = slugs.length > 0 ? slugs : Object.keys(CASTS);

  for (const slug of chosen) {
    const cast = CASTS[slug];
    if (!cast) throw new Error(`No game "${slug}" (have: ${Object.keys(CASTS).join(", ")})`);
    console.log(`${slug}: ${cast.persona}`);
    const { script } = (await import(pathToFileURL(path.join(repoRoot, tutorialFile(slug, "script"))).href)) as {
      script: TutorialScript;
    };
    const seed = seedArg
      ? Number(seedArg.slice("--seed=".length))
      : fresh
        ? Math.floor(Math.random() * 1e9)
        : (cast.seed ?? 1);
    const take = await record(slug, cast, script, seed, fresh);
    const source = pcmFromBase64(take.audio_base64);
    const words = await wordsInTake(slug, script, take, source);
    const { samples, lines: cut, gainDb } = assemble(script, source, words);

    const mp3 = encodeMp3(samples);
    const lines = await alignToFile(slug, mp3, cut);
    const durationMs = Math.round((lines.at(-1)!.end + script.tail) * 1000);
    const publicDir = path.join(repoRoot, "public/tutorials", slug);
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(path.join(publicDir, "voice.mp3"), mp3);
    const version = createHash("sha256").update(mp3).digest("hex").slice(0, 8);
    const timing: TutorialTiming = {
      durationMs,
      audio: `/tutorials/${slug}/voice.mp3?v=${version}`,
      lines,
    };
    if (stage) mkdirSync(STAGE_DIR, { recursive: true });
    const timingFile = stage
      ? path.join(STAGE_DIR, `${slug}-timing.ts`)
      : path.join(repoRoot, tutorialFile(slug, "timing"));
    writeFileSync(timingFile, timingModule(cast, timing));
    console.log(
      `  ${(durationMs / 1000).toFixed(1)}s video, ${(samples.length / SAMPLE_RATE).toFixed(1)}s of voice, ` +
        `${Math.round(mp3.length / 1024)} KB, gain ${gainDb.toFixed(1)} dB` +
        (fresh || seedArg ? ` (seed ${seed}: set it in CASTS to keep this take)` : ""),
    );
  }
}

await main();
