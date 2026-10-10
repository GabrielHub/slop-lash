// A small offline DSP kit for the SlopFight sound set. Everything is mono
// Float32 at 44.1 kHz and deterministic: noise comes from seeded PRNGs, never
// Math.random, so re-rendering reproduces the files bit for bit.

export const SR = 44100;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit, for turning a sound's name into its seed. */
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a tiny seeded PRNG returning [0, 1). */
export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniform value in [lo, hi). */
export const between = (random, lo, hi) => lo + (hi - lo) * random();

// ---------------------------------------------------------------------------
// Buffers and parameters
// ---------------------------------------------------------------------------

export const samples = (seconds) => Math.max(1, Math.round(seconds * SR));
export const buffer = (seconds) => new Float32Array(samples(seconds));
export const durationOf = (x) => x.length / SR;
export const midiHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (gain) => 20 * Math.log10(Math.max(gain, 1e-12));

/** A parameter is a number or a function of time in seconds. */
const param = (value) => (typeof value === "function" ? value : () => value);

// ---------------------------------------------------------------------------
// Envelopes (functions of t in seconds)
// ---------------------------------------------------------------------------

/** Linear attack, then exponential decay with time constant `tau`. */
export const ar = (attack, tau) => (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / tau));

/** Exponential decay from 1 with time constant `tau`. */
export const decay = (tau) => (t) => Math.exp(-t / tau);

/**
 * Breakpoint envelope: [[t, value], ...] with linear segments, or
 * exponential-ish segments when `curve` > 1 (fast start, slow end).
 */
export function env(points, curve = 1) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let index = 1; index < points.length; index += 1) {
      const [t1, v1] = points[index];
      if (t <= t1) {
        const [t0, v0] = points[index - 1];
        const u = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
        const shaped = curve === 1 ? u : 1 - (1 - u) ** curve;
        return v0 + (v1 - v0) * shaped;
      }
    }
    return points[points.length - 1][1];
  };
}

/** Exponential glide from `from` to `to` (Hz or any ratio scale) with time constant `tau`. */
export const glide = (from, to, tau) => (t) => to + (from - to) * Math.exp(-t / tau);

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function polyBlep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) {
    const u = t / dt;
    return u + u - u * u - 1;
  }
  if (t > 1 - dt) {
    const u = (t - 1) / dt;
    return u * u + u + u + 1;
  }
  return 0;
}

/**
 * Band-limited-ish oscillator. `freq` and `amp` are numbers or functions of
 * t. Types: sine, tri, saw, square (with pulse width `pw`).
 */
export function osc(type, seconds, freq, { amp = 1, phase = 0, pw = 0.5 } = {}) {
  const n = samples(seconds);
  const out = new Float32Array(n);
  const f = param(freq);
  const a = param(amp);
  const width = param(pw);
  let ph = phase;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const dt = Math.max(0, f(t)) / SR;
    let value;
    if (type === "sine") value = Math.sin(TAU * ph);
    else if (type === "tri") value = 4 * Math.abs(ph - 0.5) - 1;
    else if (type === "saw") value = 2 * ph - 1 - polyBlep(ph, dt);
    else {
      const w = width(t);
      value = ph < w ? 1 : -1;
      value += polyBlep(ph, dt);
      value -= polyBlep((ph + 1 - w) % 1, dt);
    }
    out[i] = value * a(t);
    ph += dt;
    ph -= Math.floor(ph);
  }
  return out;
}

/** White, pink or brown noise from a seeded PRNG. */
export function noise(seconds, seed, color = "white") {
  const n = samples(seconds);
  const out = new Float32Array(n);
  const random = rng(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let brown = 0;
  for (let i = 0; i < n; i += 1) {
    const white = random() * 2 - 1;
    if (color === "white") out[i] = white;
    else if (color === "pink") {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      out[i] = brown * 3.5;
    }
  }
  return out;
}

/**
 * Two-operator FM: a sine carrier at `freq` phase-modulated by a sine at
 * `freq * ratio` with modulation index `index` (number or function of t).
 */
export function fm(seconds, freq, ratio, index, { amp = 1, feedback = 0 } = {}) {
  const n = samples(seconds);
  const out = new Float32Array(n);
  const f = param(freq);
  const r = param(ratio);
  const k = param(index);
  const a = param(amp);
  let pc = 0;
  let pm = 0;
  let last = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const fc = f(t);
    const mod = Math.sin(TAU * pm + feedback * last);
    last = mod;
    out[i] = Math.sin(TAU * pc + k(t) * mod) * a(t);
    pc += fc / SR;
    pm += (fc * r(t)) / SR;
    pc -= Math.floor(pc);
    pm -= Math.floor(pm);
  }
  return out;
}

/**
 * Modal synthesis: a sum of exponentially decaying sines. `modes` is a list
 * of [ratio, gain, tau]. Good for bars, blocks, bells and cans.
 */
export function modal(seconds, freq, modes, { pitch = null } = {}) {
  const n = samples(seconds);
  const out = new Float32Array(n);
  const bend = pitch ? param(pitch) : () => 1;
  const attack = samples(0.0005);
  for (const [ratio, gain, tau] of modes) {
    let ph = 0;
    const hz = freq * ratio;
    if (hz >= SR * 0.45) continue;
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      const onset = i < attack ? i / attack : 1;
      out[i] += Math.sin(TAU * ph) * gain * onset * Math.exp(-t / tau);
      ph += (hz * bend(t)) / SR;
      ph -= Math.floor(ph);
    }
  }
  return out;
}

/**
 * Karplus-Strong plucked string with a fractional (linear) delay so notes
 * stay in tune. `damp` 0..1 darkens and shortens the tone.
 */
export function pluck(seconds, freq, seed, { damp = 0.4, pick = 0.5 } = {}) {
  const n = samples(seconds);
  const out = new Float32Array(n);
  const period = SR / freq;
  const burst = Math.round(period);
  const random = rng(seed);
  // Excitation: a one-period noise burst, brighter with a higher pick value.
  const excite = new Float32Array(burst);
  let lp = 0;
  for (let i = 0; i < burst; i += 1) {
    lp += (random() * 2 - 1 - lp) * (0.2 + 0.8 * pick);
    excite[i] = lp;
  }
  const loss = 0.997 - damp * 0.01;
  const s = 0.5 + damp * 0.25;
  // The two-tap average delays by `s` samples, so the line is shortened to match.
  const delay = period - s;
  const read = (pos) => {
    if (pos < 0) return 0;
    const base = Math.floor(pos);
    const frac = pos - base;
    return out[base] * (1 - frac) + (base + 1 < n ? out[base + 1] : 0) * frac;
  };
  for (let i = 0; i < n; i += 1) {
    const feedback = loss * ((1 - s) * read(i - delay) + s * read(i - delay - 1));
    out[i] = (i < burst ? excite[i] : 0) + feedback;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Topology-preserving state-variable filter (stable under modulation).
 * `cutoff` and `q` are numbers or functions of t. Types: lp, bp, hp, notch, bpn
 * (band-pass normalized to unity gain at the centre).
 */
export function svf(x, { type = "lp", cutoff, q = 0.707 }) {
  const out = new Float32Array(x.length);
  const fc = param(cutoff);
  const res = param(q);
  let ic1 = 0;
  let ic2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const t = i / SR;
    const f = Math.min(Math.max(fc(t), 10), SR * 0.45);
    const g = Math.tan((Math.PI * f) / SR);
    const k = 1 / Math.max(res(t), 0.05);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    if (type === "lp") out[i] = v2;
    else if (type === "bp") out[i] = v1;
    else if (type === "bpn") out[i] = v1 * k;
    else if (type === "hp") out[i] = x[i] - k * v1 - v2;
    else out[i] = x[i] - k * v1;
  }
  return out;
}

export const lowpass = (x, cutoff, q = 0.707) => svf(x, { type: "lp", cutoff, q });
export const highpass = (x, cutoff, q = 0.707) => svf(x, { type: "hp", cutoff, q });
export const bandpass = (x, cutoff, q = 1) => svf(x, { type: "bpn", cutoff, q });

/** Direct-form biquad with fixed coefficients. */
export function biquad(x, [b0, b1, b2, a1, a2]) {
  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/** RBJ cookbook coefficients, normalized by a0. */
export function rbj(type, f0, q, gainDb = 0) {
  const w0 = (TAU * f0) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let c;
  if (type === "highpass") {
    c = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === "lowpass") {
    c = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === "peak") {
    c = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
  } else if (type === "highshelf") {
    const s = 2 * Math.sqrt(A) * alpha;
    c = [
      A * (A + 1 + (A - 1) * cos + s),
      -2 * A * (A - 1 + (A + 1) * cos),
      A * (A + 1 + (A - 1) * cos - s),
      A + 1 - (A - 1) * cos + s,
      2 * (A - 1 - (A + 1) * cos),
      A + 1 - (A - 1) * cos - s,
    ];
  } else if (type === "lowshelf") {
    const s = 2 * Math.sqrt(A) * alpha;
    c = [
      A * (A + 1 - (A - 1) * cos + s),
      2 * A * (A - 1 - (A + 1) * cos),
      A * (A + 1 - (A - 1) * cos - s),
      A + 1 + (A - 1) * cos + s,
      -2 * (A - 1 + (A + 1) * cos),
      A + 1 + (A - 1) * cos - s,
    ];
  } else throw new Error(`unknown biquad ${type}`);
  return [c[0] / c[3], c[1] / c[3], c[2] / c[3], c[4] / c[3], c[5] / c[3]];
}

export const eq = (x, type, f0, q, gainDb) => biquad(x, rbj(type, f0, q, gainDb));

/** Formant filter: a parallel bank of band-passes for vowel-ish colour. */
const VOWELS = {
  a: [
    [800, 1, 80],
    [1150, 0.5, 90],
    [2900, 0.25, 120],
  ],
  e: [
    [400, 1, 60],
    [1700, 0.4, 80],
    [2600, 0.25, 100],
  ],
  o: [
    [450, 1, 70],
    [800, 0.4, 80],
    [2830, 0.12, 100],
  ],
  u: [
    [325, 1, 50],
    [700, 0.25, 60],
    [2530, 0.08, 100],
  ],
  i: [
    [270, 1, 60],
    [2140, 0.3, 90],
    [2950, 0.2, 100],
  ],
};

/** Vowel colour; `shift` scales the formant frequencies (or is a function of t). */
export function formant(x, vowel, shift = 1) {
  const out = new Float32Array(x.length);
  const s = param(shift);
  for (const [f, gain, bw] of VOWELS[vowel]) {
    const band = svf(x, { type: "bpn", cutoff: (t) => f * s(t), q: f / bw });
    for (let i = 0; i < x.length; i += 1) out[i] += band[i] * gain;
  }
  return out;
}

/** Morph between two vowels with `mix(t)` going 0 → 1. */
export function vowelMorph(x, from, to, mix, shift = 1) {
  const a = formant(x, from, shift);
  const b = formant(x, to, shift);
  const m = param(mix);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    const u = Math.min(1, Math.max(0, m(i / SR)));
    out[i] = a[i] * (1 - u) + b[i] * u;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** tanh saturation normalized so ±1 stays ±1. */
export function drive(x, amount) {
  const out = new Float32Array(x.length);
  const norm = Math.tanh(amount);
  for (let i = 0; i < x.length; i += 1) out[i] = Math.tanh(x[i] * amount) / norm;
  return out;
}

/** Sample-rate and bit-depth reduction, for crunch. */
export function crush(x, bits, hold) {
  const out = new Float32Array(x.length);
  const steps = 2 ** (bits - 1);
  let held = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (i % hold === 0) held = Math.round(x[i] * steps) / steps;
    out[i] = held;
  }
  return out;
}

/** Feedback echo; the output is longer by `tail` seconds. */
export function echo(x, time, feedback, mix, tail = 0.5) {
  const out = new Float32Array(x.length + samples(tail));
  const d = samples(time);
  const line = new Float32Array(out.length);
  for (let i = 0; i < out.length; i += 1) {
    const dry = i < x.length ? x[i] : 0;
    const wet = i >= d ? line[i - d] : 0;
    line[i] = dry + wet * feedback;
    out[i] = dry + wet * mix;
  }
  return out;
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];

/**
 * Freeverb-style mono reverb. `size` 0..1 sets the decay, `damp` 0..1 the
 * darkness, `mix` the wet level. The output is longer by `tail` seconds.
 */
export function reverb(x, { size = 0.5, damp = 0.5, mix = 0.2, tail = 0.6, scale = 1 } = {}) {
  const n = x.length + samples(tail);
  const wet = new Float32Array(n);
  const feedback = 0.7 + size * 0.28;
  for (const length of COMBS) {
    const len = Math.max(8, Math.round(length * scale));
    const line = new Float32Array(len);
    let index = 0;
    let store = 0;
    for (let i = 0; i < n; i += 1) {
      const input = i < x.length ? x[i] : 0;
      const y = line[index];
      store = y * (1 - damp) + store * damp;
      line[index] = input + store * feedback;
      index = (index + 1) % len;
      wet[i] += y;
    }
  }
  for (const length of ALLPASSES) {
    const len = Math.max(8, Math.round(length * scale));
    const line = new Float32Array(len);
    let index = 0;
    for (let i = 0; i < n; i += 1) {
      const buffered = line[index];
      const input = wet[i];
      line[index] = input + buffered * 0.5;
      wet[i] = buffered - input;
      index = (index + 1) % len;
    }
  }
  const out = new Float32Array(n);
  const wetGain = (mix * 0.12) / Math.sqrt(COMBS.length / 8);
  for (let i = 0; i < n; i += 1) out[i] = (i < x.length ? x[i] : 0) + wet[i] * wetGain;
  return out;
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/** Layers never end on a cliff: the last few ms of every mixed layer ramp to zero. */
const LAYER_FADE = samples(0.01);
const tailGain = (i, length) => {
  const left = length - 1 - i;
  return left >= LAYER_FADE ? 1 : left / LAYER_FADE;
};

/** Adds `src` into `dst` at `at` seconds with gain; grows nothing, clips at the end. */
export function mixInto(dst, src, at = 0, gain = 1) {
  const offset = Math.round(at * SR);
  for (let i = 0; i < src.length; i += 1) {
    const j = offset + i;
    if (j < 0) continue;
    if (j >= dst.length) break;
    dst[j] += src[i] * gain * tailGain(i, src.length);
  }
  return dst;
}

/** Adds `src` into a loop buffer at `at` seconds, wrapping around the end. */
export function mixWrapped(loop, src, at = 0, gain = 1) {
  const L = loop.length;
  const offset = Math.round(at * SR);
  // A layer as long as the loop (a bed) wraps onto itself and must not fade.
  const fades = src.length < L;
  for (let i = 0; i < src.length; i += 1) {
    const j = (((offset + i) % L) + L) % L;
    loop[j] += src[i] * gain * (fades ? tailGain(i, src.length) : 1);
  }
  return loop;
}

/** Sums buffers (with optional gains) into one as long as the longest. */
export function sum(...layers) {
  let n = 0;
  for (const layer of layers) n = Math.max(n, (Array.isArray(layer) ? layer[0] : layer).length);
  const out = new Float32Array(n);
  for (const layer of layers) {
    const [x, gain] = Array.isArray(layer) ? layer : [layer, 1];
    const fades = x.length < n;
    for (let i = 0; i < x.length; i += 1)
      out[i] += x[i] * gain * (fades ? tailGain(i, x.length) : 1);
  }
  return out;
}

/** Multiplies by an envelope function of t (or a constant). */
export function shape(x, envelope) {
  const e = param(envelope);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) out[i] = x[i] * e(i / SR);
  return out;
}

export const scale = (x, gain) => shape(x, gain);

/** Short linear fades at both ends to kill clicks. */
export function fade(x, fadeIn = 0.002, fadeOut = 0.01) {
  const out = Float32Array.from(x);
  const a = Math.min(samples(fadeIn), out.length);
  const b = Math.min(samples(fadeOut), out.length);
  for (let i = 0; i < a; i += 1) out[i] *= i / a;
  for (let i = 0; i < b; i += 1) out[out.length - 1 - i] *= i / b;
  return out;
}

/** Cuts the trailing part below `thresholdDb` (relative to peak) and fades the end. */
export function trimTail(x, thresholdDb = -60, fadeOut = 0.02) {
  const limit = peak(x) * dbToGain(thresholdDb);
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]) < limit) end -= 1;
  const cut = Math.min(x.length, end + samples(fadeOut));
  return fade(x.subarray(0, cut), 0, fadeOut);
}

/** Pads a buffer to `seconds` long with silence. */
export function pad(x, seconds) {
  const out = new Float32Array(Math.max(x.length, samples(seconds)));
  out.set(x);
  return out;
}

/** Repeats a buffer `times` times back to back. */
export function tile(x, times) {
  const out = new Float32Array(x.length * times);
  for (let index = 0; index < times; index += 1) out.set(x, index * x.length);
  return out;
}

/**
 * Applies an effect to a loop so the result is still seamless: the loop is
 * tiled three times, processed, and the middle period kept, so tails from the
 * previous period wrap into the start.
 */
export function wrapEffect(loop, effect) {
  const L = loop.length;
  const processed = effect(tile(loop, 3));
  return processed.slice(L, 2 * L);
}

/** Seamless loop from a longer render by crossfading the overrun into the start. */
export function crossfadeLoop(x, loopSeconds, fadeSeconds) {
  const L = samples(loopSeconds);
  const F = samples(fadeSeconds);
  if (x.length < L + F) throw new Error("crossfadeLoop needs loop + fade samples");
  const out = x.slice(0, L);
  for (let i = 0; i < F; i += 1) {
    const u = i / F;
    // Equal-power crossfade between the overrun and the head.
    out[i] = x[L + i] * Math.cos((u * Math.PI) / 2) + x[i] * Math.sin((u * Math.PI) / 2);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Analysis and loudness
// ---------------------------------------------------------------------------

export function peak(x) {
  let max = 0;
  for (let i = 0; i < x.length; i += 1) max = Math.max(max, Math.abs(x[i]));
  return max;
}

/** ITU BS.1770 K-weighting (pre-filter shelf + RLB high-pass) at 44.1 kHz. */
export function kWeight(x) {
  const shelf = biquad(x, rbj("highshelf", 1681.974450955533, 0.7071752369554196, 3.99984385397));
  return biquad(shelf, rbj("highpass", 38.13547087602444, 0.5003270373238773));
}

const lufsOf = (meanSquare) => -0.691 + 10 * Math.log10(Math.max(meanSquare, 1e-12));

/** Loudest 400 ms window (100 ms hop) of K-weighted power, in LUFS-ish units. */
export function momentaryMax(x) {
  const k = kWeight(x);
  const window = samples(0.4);
  const hop = samples(0.1);
  if (k.length <= window) {
    let total = 0;
    for (let i = 0; i < k.length; i += 1) total += k[i] * k[i];
    return lufsOf(total / window);
  }
  let best = 0;
  for (let start = 0; start + window <= k.length; start += hop) {
    let total = 0;
    for (let i = start; i < start + window; i += 1) total += k[i] * k[i];
    best = Math.max(best, total / window);
  }
  return lufsOf(best);
}

/** Mean K-weighted power over the whole buffer (for steady loops). */
export function integrated(x) {
  const k = kWeight(x);
  let total = 0;
  for (let i = 0; i < k.length; i += 1) total += k[i] * k[i];
  return lufsOf(total / k.length);
}

/**
 * Look-ahead peak limiter: the gain needed to keep |x| under `ceiling`
 * is spread back over the look-ahead window and released smoothly.
 */
export function limit(x, ceiling, { lookahead = 0.004, release = 0.08 } = {}) {
  const n = x.length;
  const need = new Float32Array(n).fill(1);
  const L = samples(lookahead);
  for (let i = 0; i < n; i += 1) {
    const a = Math.abs(x[i]);
    if (a <= ceiling) continue;
    const g = ceiling / a;
    for (let j = Math.max(0, i - L); j <= i; j += 1) {
      // Ramp into the reduction across the look-ahead window.
      const u = (i - j) / (L + 1);
      const ramp = g + (1 - g) * u;
      if (ramp < need[j]) need[j] = ramp;
    }
  }
  const out = new Float32Array(n);
  const coef = Math.exp(-1 / (release * SR));
  let gain = 1;
  for (let i = 0; i < n; i += 1) {
    gain = need[i] < gain ? need[i] : need[i] + (gain - need[i]) * coef;
    out[i] = x[i] * Math.min(gain, need[i]);
  }
  return out;
}

/**
 * Normalizes to a loudness target (momentary max for one-shots, integrated
 * for loops) under a sample-peak ceiling, limiting peaks when the target
 * would push past it.
 */
export function normalize(x, target, { mode = "momentary", ceilingDb = -1.5, loop = false } = {}) {
  const measure = mode === "integrated" ? integrated : momentaryMax;
  const ceiling = dbToGain(ceilingDb);
  let y = x;
  for (let pass = 0; pass < 3; pass += 1) {
    const gain = dbToGain(target - measure(y));
    y = scale(y, gain);
    if (peak(y) > ceiling) {
      y = loop ? wrapEffect(y, (z) => limit(z, ceiling)) : limit(y, ceiling);
    }
  }
  // A last hard safety for any overshoot the release left behind.
  const p = peak(y);
  if (p > ceiling) y = scale(y, ceiling / p);
  return y;
}
