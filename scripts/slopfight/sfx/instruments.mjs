// Instruments and foley building blocks shared by the one-shots and the music
// loops. Each returns a Float32Array; none of them normalizes (render.mjs does).

import {
  SR,
  TAU,
  ar,
  bandpass,
  between,
  decay,
  drive,
  env,
  fade,
  fm,
  formant,
  glide,
  highpass,
  lowpass,
  midiHz,
  mixInto,
  mixWrapped,
  modal,
  noise,
  osc,
  pluck,
  rng,
  samples,
  shape,
  sum,
  svf,
} from "./dsp.mjs";

// ---------------------------------------------------------------------------
// Drums
// ---------------------------------------------------------------------------

/** A round cartoon kick: a fast pitch dive into a sine thump, plus a felt click. */
export function kick(seed, { tone = 1, punch = 1, length = 0.32 } = {}) {
  const body = osc("sine", length, glide(170 * tone, 46 * tone, 0.035), {
    amp: ar(0.002, 0.11 * punch),
  });
  const click = shape(highpass(noise(0.012, seed), 2500), decay(0.003));
  return fade(drive(sum(body, [click, 0.35]), 1.6), 0.0005, 0.03);
}

/** A snappy snare: two drum-head tones plus a band-passed wire rattle. */
export function snare(seed, { tone = 1, snap = 1 } = {}) {
  const head = sum(osc("sine", 0.2, glide(260 * tone, 185 * tone, 0.02), { amp: decay(0.045) }), [
    osc("sine", 0.2, 330 * tone, { amp: decay(0.03) }),
    0.5,
  ]);
  const wires = shape(bandpass(noise(0.25, seed), 2600, 0.6), ar(0.001, 0.07 * snap));
  const air = shape(highpass(noise(0.2, seed + 1), 6000), decay(0.04));
  return fade(drive(sum([head, 0.7], [wires, 1.1], [air, 0.35]), 1.4), 0.0005, 0.02);
}

/** Hi-hat: high-passed noise with a metallic band; `open` lengthens it. */
export function hat(seed, { open = false, level = 1 } = {}) {
  const length = open ? 0.28 : 0.06;
  const metal = sum(highpass(noise(length, seed), 7500), [
    bandpass(noise(length, seed + 7), 10500, 2),
    0.6,
  ]);
  return fade(
    shape(metal, (t) => level * Math.exp(-t / (open ? 0.09 : 0.016))),
    0.0005,
    0.01,
  );
}

/** Shaker: a softer, longer-attack hat for the build loop. */
export function shaker(seed, level = 1) {
  return fade(
    shape(bandpass(noise(0.09, seed), 6500, 0.8), (t) => level * ar(0.012, 0.025)(t)),
    0.001,
    0.01,
  );
}

/** Clap: three quick noise bursts and a short tail. */
export function clap(seed) {
  const out = new Float32Array(samples(0.25));
  const burst = (offset, tau, s) =>
    mixInto(out, shape(bandpass(noise(0.2, s), 1300, 0.9), decay(tau)), offset);
  burst(0, 0.006, seed);
  burst(0.011, 0.006, seed + 1);
  burst(0.022, 0.05, seed + 2);
  return fade(out, 0.0005, 0.02);
}

/** Crash cymbal: dense inharmonic FM shimmer over noise. */
export function crash(seed, length = 1.2) {
  const shimmer = fm(length, 1180, 1.483, (t) => 9 * Math.exp(-t / 0.6), { amp: decay(0.5) });
  const hiss = shape(highpass(noise(length, seed), 5200), ar(0.002, 0.42));
  return fade(sum([highpass(shimmer, 3000), 0.35], [hiss, 0.9]), 0.0005, 0.08);
}

/** Tom: a pitched drum with a downward bend. */
export function tom(seed, hz) {
  const body = osc("sine", 0.35, glide(hz * 1.6, hz, 0.04), { amp: ar(0.001, 0.12) });
  const skin = shape(bandpass(noise(0.08, seed), hz * 4, 1), decay(0.012));
  return fade(drive(sum(body, [skin, 0.3]), 1.3), 0.0005, 0.03);
}

/** Woodblock: two short modes, the cartoon clock tick. */
export function woodblock(hz = 1050, length = 0.12) {
  return fade(
    modal(length, hz, [
      [1, 1, 0.018],
      [2.72, 0.4, 0.009],
      [4.1, 0.15, 0.005],
    ]),
    0.0003,
    0.01,
  );
}

/** Cowbell: two square partials through a band-pass. */
export function cowbell(level = 1) {
  const tone = sum(osc("square", 0.3, 545), [osc("square", 0.3, 815), 0.8]);
  return fade(
    shape(bandpass(tone, 900, 1.6), (t) => level * ar(0.001, 0.07)(t)),
    0.0005,
    0.03,
  );
}

// ---------------------------------------------------------------------------
// Pitched instruments
// ---------------------------------------------------------------------------

/** Synth bass: a filtered saw/square with a squelchy envelope. */
export function bass(midi, length, { wave = "saw", bright = 1, q = 2.2, sub = 0.5 } = {}) {
  const hz = midiHz(midi);
  const tone = sum(osc(wave, length + 0.05, hz), [osc("sine", length + 0.05, hz / 2), sub]);
  const filtered = svf(tone, {
    type: "lp",
    cutoff: (t) => 180 + 2200 * bright * Math.exp(-t / 0.09),
    q,
  });
  const amp = (t) => (t < 0.004 ? t / 0.004 : 0.75 + 0.25 * Math.exp(-(t - 0.004) / 0.08));
  const gate = (t) => (t < length ? 1 : Math.max(0, 1 - (t - length) / 0.05));
  return fade(
    drive(
      shape(filtered, (t) => amp(t) * gate(t)),
      1.8,
    ),
    0.001,
    0.01,
  );
}

/** Pizzicato / plucked string via Karplus-Strong. */
export function pizz(midi, seed, { length = 0.6, damp = 0.55, pick = 0.45 } = {}) {
  return fade(
    shape(pluck(length, midiHz(midi), seed, { damp, pick }), decay(length * 0.5)),
    0.0005,
    0.03,
  );
}

/** Xylophone bar: bright modes at 1, 3 and 6.2 with a mallet tick. */
export function xylo(midi, { length = 0.5, soft = 0 } = {}) {
  const hz = midiHz(midi);
  const k = 440 / hz;
  const bar = modal(length, hz, [
    [1, 1, 0.22 * Math.min(1.6, k ** 0.4)],
    [3.0, 0.32 * (1 - soft * 0.6), 0.05],
    [6.2, 0.1 * (1 - soft), 0.015],
  ]);
  return fade(bar, 0.0004, 0.03);
}

/** Marimba: warmer bar modes at 1, 3.99 and 10.65. */
export function marimba(midi, { length = 0.7 } = {}) {
  const hz = midiHz(midi);
  return fade(
    modal(length, hz, [
      [1, 1, 0.3],
      [3.99, 0.25, 0.06],
      [10.65, 0.06, 0.012],
    ]),
    0.0006,
    0.04,
  );
}

/** Glockenspiel / toy bell: FM bell ratio for a sparkly top. */
export function glock(midi, length = 0.9) {
  const hz = midiHz(midi);
  const bell = fm(length, hz, 3.5, (t) => 2.2 * Math.exp(-t / 0.15), { amp: ar(0.001, 0.35) });
  const pure = osc("sine", length, hz * 2, { amp: ar(0.001, 0.2) });
  return fade(sum(bell, [pure, 0.3]), 0.0004, 0.05);
}

/** Chunky synth brass: three detuned saws through an opening filter. */
export function brass(midis, length, { bright = 1, attack = 0.03, release = 0.12 } = {}) {
  const notes = Array.isArray(midis) ? midis : [midis];
  const total = length + release;
  const out = new Float32Array(samples(total));
  for (const midi of notes) {
    const hz = midiHz(midi);
    for (const cents of [-9, 0, 8]) {
      const detuned = hz * 2 ** (cents / 1200);
      const vibrato = (t) => detuned * (1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.3));
      mixInto(out, osc("saw", total, vibrato), 0, 0.33 / notes.length);
    }
  }
  const filtered = svf(out, {
    type: "lp",
    cutoff: (t) =>
      400 +
      2600 * bright * (t < attack ? t / attack : 0.55 + 0.45 * Math.exp(-(t - attack) / 0.15)),
    q: 1.1,
  });
  const amp = (t) => {
    if (t < attack) return t / attack;
    if (t < length) return 0.85 + 0.15 * Math.exp(-(t - attack) / 0.1);
    return 0.85 * Math.max(0, 1 - (t - length) / release);
  };
  return fade(drive(shape(filtered, amp), 1.5), 0.001, 0.02);
}

/** Square lead with delayed vibrato and a touch of portamento from `fromMidi`. */
export function lead(midi, length, { fromMidi = null, pw = 0.32, bright = 1 } = {}) {
  const target = midiHz(midi);
  const start = fromMidi === null ? target : midiHz(fromMidi);
  const total = length + 0.08;
  const freq = (t) => {
    const base = target + (start - target) * Math.exp(-t / 0.025);
    const depth = 0.012 * Math.min(1, Math.max(0, (t - 0.12) / 0.2));
    return base * (1 + depth * Math.sin(TAU * 6 * t));
  };
  const tone = osc("square", total, freq, { pw });
  const filtered = lowpass(tone, 1800 * bright + 600, 0.9);
  const amp = (t) =>
    t < 0.006
      ? t / 0.006
      : t < length
        ? 0.8 + 0.2 * Math.exp(-t / 0.08)
        : 0.8 * Math.max(0, 1 - (t - length) / 0.08);
  return fade(shape(filtered, amp), 0.001, 0.01);
}

/** Tuba-ish oom: a low saw with a soft attack and a dark filter. */
export function tuba(midi, length) {
  const hz = midiHz(midi);
  const tone = sum(osc("saw", length + 0.1, hz), [osc("sine", length + 0.1, hz), 0.8]);
  const filtered = lowpass(tone, (t) => 300 + 500 * Math.exp(-t / 0.08), 1.2);
  const amp = (t) =>
    t < 0.02
      ? t / 0.02
      : t < length
        ? 0.8 + 0.2 * Math.exp(-t / 0.1)
        : 0.8 * Math.max(0, 1 - (t - length) / 0.1);
  return fade(drive(shape(filtered, amp), 1.3), 0.001, 0.02);
}

/** Toy organ: sine + octave + twelfth, for soft pads and chords. */
export function organ(midis, length, level = 1) {
  const notes = Array.isArray(midis) ? midis : [midis];
  const total = length + 0.15;
  const out = new Float32Array(samples(total));
  for (const midi of notes) {
    const hz = midiHz(midi);
    mixInto(out, osc("sine", total, hz), 0, 0.5 / notes.length);
    mixInto(out, osc("sine", total, hz * 2), 0, 0.25 / notes.length);
    mixInto(out, osc("tri", total, hz * 3), 0, 0.08 / notes.length);
  }
  const amp = (t) =>
    level * (t < 0.04 ? t / 0.04 : t < length ? 1 : Math.max(0, 1 - (t - length) / 0.15));
  return fade(shape(out, amp), 0.002, 0.02);
}

// ---------------------------------------------------------------------------
// Foley
// ---------------------------------------------------------------------------

/** A cartoon body thump: low sine dive plus a muffled noise slap. */
export function thump(seed, { hz = 95, length = 0.35, weight = 1 } = {}) {
  const body = osc("sine", length, glide(hz * 2.2, hz, 0.025), { amp: ar(0.001, 0.07 * weight) });
  const slap = shape(lowpass(noise(length, seed), 1400, 0.8), ar(0.001, 0.025));
  return fade(drive(sum(body, [slap, 0.8]), 2), 0.0005, 0.03);
}

/** A fast whoosh: noise through a band-pass that sweeps with an envelope. */
export function whoosh(seed, length, { from = 400, to = 2500, q = 1.4, peakAt = 0.6 } = {}) {
  const sweep = (t) => {
    const u = Math.min(1, t / length);
    return from * (to / from) ** u;
  };
  const amp = (t) => {
    const u = t / length;
    return u < peakAt ? (u / peakAt) ** 2 : Math.max(0, 1 - (u - peakAt) / (1 - peakAt)) ** 1.5;
  };
  return fade(
    shape(svf(noise(length, seed, "pink"), { type: "bpn", cutoff: sweep, q }), amp),
    0.002,
    0.02,
  );
}

/** A rubbery squeak: a triangle with a jittery, rising pitch. */
export function squeak(seed, length, { from = 700, to = 1400, wobble = 0.06 } = {}) {
  const random = rng(seed);
  const jitterRate = between(random, 18, 26);
  const freq = (t) => {
    const u = Math.min(1, t / length);
    const base = from * (to / from) ** (u ** 0.8);
    return (
      base * (1 + wobble * Math.sin(TAU * jitterRate * t) * (0.5 + 0.5 * Math.sin(TAU * 3.1 * t)))
    );
  };
  const tone = sum(osc("tri", length, freq), [osc("sine", length, (t) => freq(t) * 2), 0.25]);
  return fade(
    shape(
      bandpass(tone, (t) => freq(t) * 1.5, 0.9),
      env([
        [0, 0],
        [0.03, 1],
        [length * 0.7, 0.85],
        [length, 0],
      ]),
    ),
    0.002,
    0.02,
  );
}

/** A wet "bloop": a sine pitch chirp upward, the part-pop core. */
export function bloop(from, to, length, { tau = 0.04 } = {}) {
  const freq = (t) => to + (from - to) * Math.exp(-t / tau);
  return fade(osc("sine", length, freq, { amp: ar(0.002, length * 0.35) }), 0.0005, 0.02);
}

/** A metallic clang: inharmonic modes like a struck can or pipe. */
export function clang(hz, length = 0.9, brightness = 1) {
  return fade(
    modal(length, hz, [
      [1, 1, 0.35],
      [1.41, 0.7, 0.28],
      [2.31, 0.55 * brightness, 0.2],
      [2.93, 0.4 * brightness, 0.15],
      [3.87, 0.3 * brightness, 0.1],
      [5.12, 0.2 * brightness, 0.06],
    ]),
    0.0003,
    0.05,
  );
}

/** One crowd voice: a buzzy glottal tone through a vowel, with drift and vibrato. */
export function voice(
  seed,
  length,
  { hz = 180, vowel = "a", rise = 1, vib = 0.02, shift = 1, breath = 0.25 } = {},
) {
  const random = rng(seed);
  const rate = between(random, 4.5, 6.5);
  const drift = between(random, -0.03, 0.03);
  const freq = (t) => {
    const u = Math.min(1, t / length);
    return (
      hz *
      (1 + (rise - 1) * Math.sin((Math.PI / 2) * Math.min(1, u * 2))) *
      (1 + drift * u) *
      (1 + vib * Math.sin(TAU * rate * t))
    );
  };
  const glottal = sum(osc("saw", length, freq), [noise(length, seed + 3, "pink"), breath]);
  return formant(glottal, vowel, shift);
}

/**
 * A crowd: many voices with staggered entries and swells, plus optional
 * claps and whistles. `envelope(t)` shapes the whole crowd.
 */
export function crowd(
  seed,
  length,
  {
    voices = 28,
    vowels = ["a", "o", "e"],
    low = 110,
    high = 300,
    rise = [1, 1.25],
    envelope = () => 1,
    claps = 0,
    whistles = 0,
    syllables = 0,
    spread = 0.25,
  } = {},
) {
  const random = rng(seed);
  const out = new Float32Array(samples(length));
  for (let index = 0; index < voices; index += 1) {
    const start = between(random, 0, spread);
    const dur = length - start;
    const vowel = vowels[Math.floor(random() * vowels.length)];
    const female = random() < 0.45;
    const hz = between(random, female ? low * 1.7 : low, female ? high * 1.4 : high);
    const v = voice(Math.floor(random() * 1e9), dur, {
      hz,
      vowel,
      rise: between(random, rise[0], rise[1]),
      shift: female ? 1.15 : 1,
    });
    const rate = between(random, 3.5, 6.5);
    const phase = random() * TAU;
    const level = between(random, 0.4, 1);
    const syll = (t) =>
      syllables > 0
        ? 1 - syllables + syllables * (0.5 + 0.5 * Math.sin(TAU * rate * t + phase)) ** 2
        : 1;
    mixInto(
      out,
      shape(v, (t) => level * syll(t) * Math.min(1, t / 0.06)),
      start,
      1 / Math.sqrt(voices),
    );
  }
  for (let index = 0; index < claps; index += 1) {
    const at = between(random, 0, length * 0.85);
    const c = shape(
      bandpass(noise(0.06, Math.floor(random() * 1e9)), between(random, 900, 2200), 1.2),
      decay(0.008),
    );
    mixInto(out, c, at, between(random, 0.15, 0.4));
  }
  for (let index = 0; index < whistles; index += 1) {
    const at = between(random, 0, length * 0.5);
    const dur = between(random, 0.35, 0.7);
    const base = between(random, 1900, 2800);
    const w = osc(
      "sine",
      dur,
      (t) =>
        base *
        (1 + 0.25 * Math.sin(Math.PI * Math.min(1, t / dur))) *
        (1 + 0.01 * Math.sin(TAU * 7 * t)),
      {
        amp: env([
          [0, 0],
          [0.03, 1],
          [dur * 0.8, 0.8],
          [dur, 0],
        ]),
      },
    );
    mixInto(out, w, at, between(random, 0.06, 0.12));
  }
  return shape(lowpass(out, 6500), envelope);
}

/** Places notes [beat, midi, beats, vel] into a loop buffer (wrapping tails). */
export function sequence(loop, bpm, notes, render) {
  const beat = 60 / bpm;
  for (const [at, midi, beats, vel = 1] of notes) {
    mixWrapped(loop, render(midi, beats * beat, at), at * beat, vel);
  }
  return loop;
}

export { SR, TAU };
