// Renders the SlopFight sound set to public/sfx/slopfight/*.mp3 plus a
// manifest.json with durations, loudness and loop points.
//
//   node scripts/slopfight/sfx/render.mjs [--only=a,b] [--wav=<dir>] [--kbps=96]
//
// Deterministic: every sound is seeded from its name, so re-running
// reproduces the same audio (and the same MP3 bytes).

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mp3Encoder } from "@breezystack/lamejs";
import {
  SR,
  fade,
  gainToDb,
  hashSeed,
  integrated,
  momentaryMax,
  normalize,
  peak,
  rng,
  trimTail,
} from "./dsp.mjs";
import { SOUNDS } from "./sounds.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const OUT_DIR = path.join(repoRoot, "public/sfx/slopfight");

/**
 * Loops are stored as [last PRE samples][the loop][first POST samples]. MP3
 * decoders keep the encoder's start delay (lamejs writes no gapless tag), so
 * the loop's samples land some unknown 0..PRE samples late. Any window of
 * exactly L samples inside the padded region is the loop, so playback loops
 * [PRE, PRE + L) and is seamless for any decoder delay up to PRE samples.
 */
export const LOOP_PRE = 4096;
export const LOOP_POST = 4096;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const only = typeof args.only === "string" ? new Set(args.only.split(",")) : null;
const kbps = Number(args.kbps ?? 96);
const wavDir = typeof args.wav === "string" ? path.resolve(args.wav) : null;

function withLoopRolls(loop) {
  const L = loop.length;
  const out = new Float32Array(LOOP_PRE + L + LOOP_POST);
  for (let i = 0; i < out.length; i += 1) out[i] = loop[(((i - LOOP_PRE) % L) + L) % L];
  return out;
}

function toPcm16(x, seed) {
  const random = rng(seed);
  const out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    // TPDF dither at one LSB.
    const dither = (random() - random()) / 32768;
    const value = Math.max(-1, Math.min(1, x[i] + dither));
    out[i] = Math.round(value * 32767);
  }
  return out;
}

function encodeMp3(pcm) {
  const encoder = new Mp3Encoder(1, SR, kbps);
  const chunks = [];
  const block = 1152;
  for (let i = 0; i < pcm.length; i += block) {
    const chunk = encoder.encodeBuffer(pcm.subarray(i, i + block));
    if (chunk.length) chunks.push(Buffer.from(chunk));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

function encodeWav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.writeUInt32LE(pcm.length * 2, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);
}

mkdirSync(OUT_DIR, { recursive: true });
if (wavDir) mkdirSync(wavDir, { recursive: true });

const names = new Set();
for (const sound of SOUNDS) {
  if (names.has(sound.name)) throw new Error(`duplicate sound ${sound.name}`);
  names.add(sound.name);
}

const manifest = [];
const started = Date.now();
for (const sound of SOUNDS) {
  if (only && !only.has(sound.name)) continue;
  const seed = hashSeed(sound.name);
  const raw = sound.render(seed);
  for (let i = 0; i < raw.length; i += 1) {
    if (!Number.isFinite(raw[i])) throw new Error(`${sound.name}: non-finite sample at ${i}`);
  }
  const mode = sound.mode ?? "momentary";
  let data;
  let loop = null;
  let lufs;
  if (sound.loop) {
    const expected = Math.round(sound.loop * SR);
    if (Math.abs(raw.length - expected) > 1) {
      throw new Error(`${sound.name}: loop is ${raw.length} samples, expected ${expected}`);
    }
    const leveled = normalize(raw, sound.target, { mode, loop: true });
    lufs = integrated(leveled);
    data = withLoopRolls(leveled);
    loop = { start: LOOP_PRE / SR, end: (LOOP_PRE + leveled.length) / SR };
  } else {
    const leveled = normalize(trimTail(fade(raw, 0.0005, 0.004), -58, 0.01), sound.target, {
      mode,
      ceilingDb: sound.ceilingDb,
    });
    lufs = mode === "integrated" ? integrated(leveled) : momentaryMax(leveled);
    data = leveled;
  }
  const pcm = toPcm16(data, seed ^ 0x9e3779b9);
  const mp3 = encodeMp3(pcm);
  const file = `${sound.name}.mp3`;
  writeFileSync(path.join(OUT_DIR, file), mp3);
  if (wavDir) writeFileSync(path.join(wavDir, `${sound.name}.wav`), encodeWav(pcm));
  manifest.push({
    name: sound.name,
    group: sound.group,
    file,
    seconds: Number((data.length / SR).toFixed(4)),
    bytes: mp3.length,
    lufs: Number(lufs.toFixed(1)),
    peakDb: Number(gainToDb(peak(data)).toFixed(1)),
    loop: loop && { start: Number(loop.start.toFixed(6)), end: Number(loop.end.toFixed(6)) },
  });
}

if (!only) {
  // Drop files for sounds that no longer exist.
  for (const entry of readdirSync(OUT_DIR)) {
    if (entry.endsWith(".mp3") && !names.has(entry.slice(0, -4)))
      unlinkSync(path.join(OUT_DIR, entry));
  }
  writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    `${JSON.stringify({ sampleRate: SR, kbps, loopPre: LOOP_PRE, loopPost: LOOP_POST, sounds: manifest }, null, 2)}\n`,
  );
}

const pad = (value, width) => String(value).padEnd(width);
let total = 0;
for (const entry of manifest) {
  total += entry.bytes;
  console.log(
    `${pad(entry.name, 24)} ${pad(entry.seconds.toFixed(2) + "s", 8)} ${pad((entry.bytes / 1024).toFixed(1) + "KB", 9)} ${pad(entry.lufs + " LU", 9)} peak ${entry.peakDb} dB${entry.loop ? `  loop ${entry.loop.start}-${entry.loop.end}` : ""}`,
  );
}
console.log(
  `${manifest.length} files, ${(total / 1024).toFixed(1)} KB total, ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
