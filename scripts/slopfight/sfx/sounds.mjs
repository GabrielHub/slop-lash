// The SlopFight sound set: one entry per file. Direction: cartoon foley with a
// chunky synth layer, like a Saturday-morning show scored by someone with one
// good synthesizer. Punchy, warm, never harsh; short tails.
//
// Each entry: { name, group, target, render(seed) } for a one-shot, or
// { ..., loop: seconds } for a seamless loop whose render returns exactly that
// many samples and repeats without a seam. `target` is the loudness goal in
// LUFS-ish units: momentary max for one-shots, integrated for loops. An
// optional `ceilingDb` lowers the sample-peak ceiling (default -1.5 dBFS) for
// sounds whose sharp transients overshoot after MP3 coding.

import {
  SR,
  TAU,
  ar,
  bandpass,
  between,
  crossfadeLoop,
  crush,
  decay,
  drive,
  echo,
  env,
  fade,
  glide,
  highpass,
  lowpass,
  midiHz,
  mixInto,
  mixWrapped,
  modal,
  noise,
  osc,
  reverb,
  rng,
  samples,
  shape,
  sum,
  svf,
  trimTail,
  vowelMorph,
  wrapEffect,
} from "./dsp.mjs";
import {
  bass,
  bloop,
  brass,
  clang,
  clap,
  cowbell,
  crash,
  crowd,
  glock,
  hat,
  kick,
  lead,
  organ,
  pizz,
  sequence,
  shaker,
  snare,
  squeak,
  thump,
  tom,
  tuba,
  whoosh,
  woodblock,
  xylo,
} from "./instruments.mjs";

const room = (x, mix = 0.12, size = 0.35) =>
  reverb(x, { size, damp: 0.55, mix, tail: 0.35, scale: 0.6 });

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const ui = [
  {
    name: "ui-tap",
    group: "UI",
    target: -24,
    render: (seed) =>
      sum(bloop(1350, 720, 0.07, { tau: 0.012 }), [
        shape(highpass(noise(0.01, seed), 3000), decay(0.002)),
        0.25,
      ]),
  },
  {
    name: "ui-confirm",
    group: "UI",
    target: -21,
    render: () => {
      const out = new Float32Array(samples(0.42));
      mixInto(out, xylo(84, { length: 0.3 }), 0, 1.15);
      mixInto(out, xylo(91, { length: 0.34 }), 0.075, 1);
      return room(out, 0.08);
    },
  },
  {
    name: "ui-tick",
    group: "UI",
    target: -24,
    render: () => woodblock(1480, 0.09),
  },
  {
    name: "ui-bet",
    group: "UI",
    target: -20,
    render: (seed) => {
      const out = new Float32Array(samples(0.55));
      const chip = (at, hz) =>
        mixInto(
          out,
          sum(
            modal(0.05, hz, [
              [1, 1, 0.012],
              [2.13, 0.6, 0.008],
              [3.7, 0.3, 0.005],
            ]),
            [shape(highpass(noise(0.01, seed + hz), 4000), decay(0.002)), 0.3],
          ),
          at,
          0.7,
        );
      chip(0, 2300);
      chip(0.035, 2650);
      mixInto(out, glock(93, 0.45), 0.06, 0.8);
      mixInto(out, glock(100, 0.4), 0.12, 0.45);
      return room(out, 0.1);
    },
  },
  {
    name: "ui-hype",
    group: "UI",
    target: -19,
    render: (seed) =>
      crowd(seed, 0.62, {
        voices: 6,
        vowels: ["o", "u"],
        low: 170,
        high: 320,
        rise: [1.35, 1.65],
        spread: 0.04,
        whistles: 1,
        envelope: env([
          [0, 0],
          [0.05, 1],
          [0.32, 0.85],
          [0.62, 0],
        ]),
      }),
  },
];

// ---------------------------------------------------------------------------
// Foundry
// ---------------------------------------------------------------------------

function partPop(seed, from, to, { second = false, puff = 1 } = {}) {
  const out = new Float32Array(samples(0.26));
  mixInto(out, bloop(from, to, 0.16, { tau: 0.028 }), 0, 1);
  mixInto(out, shape(lowpass(noise(0.12, seed), 2200, 0.7), ar(0.002, 0.025)), 0, 0.45 * puff);
  mixInto(out, shape(highpass(noise(0.01, seed + 1), 5000), decay(0.002)), 0, 0.25);
  if (second) mixInto(out, bloop(to * 0.9, to * 1.35, 0.1, { tau: 0.02 }), 0.065, 0.45);
  return out;
}

const foundry = [
  {
    name: "foundry-pop-1",
    group: "Foundry",
    target: -19,
    render: (seed) => partPop(seed, 260, 820),
  },
  {
    name: "foundry-pop-2",
    group: "Foundry",
    target: -19,
    render: (seed) => partPop(seed, 340, 1120, { puff: 0.7 }),
  },
  {
    name: "foundry-pop-3",
    group: "Foundry",
    target: -19,
    render: (seed) => partPop(seed, 210, 640, { second: true, puff: 1.2 }),
  },
  {
    name: "foundry-inflate",
    group: "Foundry",
    target: -21,
    render: (seed) => {
      const squeal = squeak(seed, 0.55, { from: 430, to: 980, wobble: 0.05 });
      const air = shape(
        svf(noise(0.55, seed + 2, "pink"), {
          type: "bpn",
          cutoff: (t) => 900 + 2600 * (t / 0.55),
          q: 1.2,
        }),
        env([
          [0, 0],
          [0.08, 0.6],
          [0.45, 0.4],
          [0.55, 0],
        ]),
      );
      return sum(squeal, [air, 0.35]);
    },
  },
  {
    name: "foundry-ding",
    group: "Foundry",
    target: -19,
    render: () => {
      const out = new Float32Array(samples(1.1));
      mixInto(out, glock(93, 1.0), 0, 1);
      mixInto(out, osc("sine", 0.9, midiHz(100), { amp: ar(0.001, 0.25) }), 0, 0.25);
      mixInto(out, modal(0.05, 3000, [[1, 1, 0.006]]), 0, 0.3);
      return trimTail(room(out, 0.12, 0.45), -50);
    },
  },
  {
    name: "foundry-shimmer",
    group: "Foundry",
    target: -21,
    render: (seed) => {
      const random = rng(seed);
      const out = new Float32Array(samples(1.7));
      // F major pentatonic, climbing as the doodle dissolves.
      const scale = [77, 79, 81, 84, 86, 89, 91, 93, 96, 98, 101, 103];
      for (let index = 0; index < 26; index += 1) {
        const u = index / 25;
        const at = 1.15 * u ** 0.9 + between(random, -0.03, 0.03);
        const step = Math.min(
          scale.length - 1,
          Math.floor(u * scale.length + between(random, -1, 1)),
        );
        const midi = scale[Math.max(0, step)];
        const ping = osc("sine", 0.25, midiHz(midi), { amp: ar(0.001, 0.05) });
        mixInto(out, ping, Math.max(0, at), between(random, 0.25, 0.5));
      }
      const air = shape(
        highpass(noise(1.7, seed + 9, "pink"), 4500),
        env([
          [0, 0],
          [0.6, 0.12],
          [1.3, 0.05],
          [1.7, 0],
        ]),
      );
      return trimTail(
        reverb(sum(out, air), { size: 0.6, damp: 0.4, mix: 0.3, tail: 0.4, scale: 0.8 }),
        -50,
      );
    },
  },
  {
    name: "loop-foundry-conveyor",
    group: "Foundry",
    target: -27,
    mode: "integrated",
    loop: 4,
    render: (seed) => {
      const L = samples(4);
      const loop = new Float32Array(L);
      // Motor hum: a low saw with a slow wobble (8 cycles per loop).
      const hum = lowpass(
        osc("saw", 4, (t) => 55 * (1 + 0.004 * Math.sin(TAU * 2 * t)), {
          amp: (t) => 0.8 + 0.2 * Math.sin(TAU * 2 * t),
        }),
        380,
        1.2,
      );
      mixWrapped(loop, hum, 0, 0.5);
      // Servo whine, faint.
      mixWrapped(
        loop,
        osc("sine", 4, (t) => 880 * (1 + 0.003 * Math.sin(TAU * 0.5 * t))),
        0,
        0.012,
      );
      // Belt rumble: filtered noise, wrapped so the filter has no seam.
      const rumble = wrapEffect(noise(4, seed, "brown"), (x) => lowpass(x, 260, 0.8));
      mixWrapped(loop, rumble, 0, 0.5);
      // Roller ticks every half second, a ka-chunk every two seconds.
      for (let index = 0; index < 8; index += 1) {
        mixWrapped(loop, clang(index % 2 ? 2350 : 2650, 0.08, 0.5), index * 0.5, 0.05);
      }
      for (const at of [0, 2]) {
        mixWrapped(loop, thump(seed + at, { hz: 120, length: 0.2, weight: 0.6 }), at + 0.02, 0.22);
        mixWrapped(loop, clang(620, 0.25, 0.7), at + 0.05, 0.08);
      }
      return wrapEffect(loop, (x) =>
        reverb(x, { size: 0.4, damp: 0.6, mix: 0.12, tail: 0, scale: 0.7 }),
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Fight
// ---------------------------------------------------------------------------

function strike(
  seed,
  {
    lowFrom = 220,
    lowTo = 70,
    body = 0.045,
    crack = 0.5,
    slapHz = 1200,
    pow = 180,
    heavy = 0,
  } = {},
) {
  const length = 0.32 + heavy * 0.12;
  const thud = osc("sine", length, glide(lowFrom, lowTo, 0.02 + heavy * 0.01), {
    amp: ar(0.0005, body),
  });
  const crackle = shape(highpass(noise(0.04, seed), 2600), decay(0.007));
  const slap = shape(bandpass(noise(0.18, seed + 1), slapHz, 0.8), ar(0.0008, 0.03 + heavy * 0.02));
  const punch = lowpass(
    osc("square", 0.3, glide(pow * 1.6, pow * 0.6, 0.03), { amp: decay(0.04) }),
    1600,
    1,
  );
  const sub = osc("sine", length, glide(90, 45, 0.05), { amp: ar(0.001, 0.12) });
  return trimTail(
    drive(sum([thud, 0.9], [crackle, crack], [slap, 1.0], [punch, 0.35], [sub, heavy * 0.7]), 2.4),
    -55,
  );
}

function boxingBell(hz) {
  return modal(1.0, hz, [
    [1, 1, 0.45],
    [2.76, 0.5, 0.25],
    [5.4, 0.3, 0.12],
    [8.93, 0.15, 0.06],
  ]);
}

function splashDroplets(seed, out, from, to, count) {
  const random = rng(seed);
  for (let index = 0; index < count; index += 1) {
    const u = index / count;
    const at = from + (to - from) * u ** 1.6 + between(random, -0.02, 0.02);
    const f0 = between(random, 450, 900);
    const drop = osc("sine", 0.05, (t) => f0 * (1 + 2.2 * Math.min(1, t / 0.03)), {
      amp: ar(0.001, 0.012),
    });
    mixInto(out, drop, Math.max(0, at), between(random, 0.15, 0.45) * (1 - u * 0.6));
  }
}

/** A timpani: near-harmonic drum-head modes that sag a touch in pitch, plus a felt-mallet thump. */
function timpani(seed, hz, { length = 0.9, hard = 1 } = {}) {
  const head = modal(
    length,
    hz,
    [
      [1, 1, 0.42],
      [1.5, 0.55, 0.3],
      [1.98, 0.32, 0.22],
      [2.44, 0.16, 0.14],
      [2.9, 0.08, 0.09],
    ],
    { pitch: glide(1.035, 1, 0.05) },
  );
  const mallet = shape(lowpass(noise(0.06, seed), 700 + 900 * hard, 0.8), ar(0.001, 0.012));
  return fade(drive(sum(head, [mallet, 0.5 * hard]), 1.3), 0.0005, 0.05);
}

/** A game-show alarm whoop: a chunky square sweeping up that cuts off at the top. */
function whoop(length, from, to) {
  const freq = (t) => from * (to / from) ** (Math.min(1, t / length) ** 0.7);
  const tone = sum(osc("square", length, freq, { pw: 0.42 }), [
    osc("saw", length, (t) => freq(t) * 1.007),
    0.5,
  ]);
  return shape(
    lowpass(tone, (t) => Math.min(5000, freq(t) * 2.5), 0.9),
    env([
      [0, 0],
      [0.03, 0.6],
      [length * 0.8, 1],
      [length, 0],
    ]),
  );
}

/**
 * A wooden creak: stick-slip clicks at a wandering rate (`rate(t)` per
 * second, jittered) ringing a few body resonances [hz, q, gain], which
 * `bend(t)` can drift. A slow rate is a groan; a fast one is a squeal.
 */
function creak(seed, length, { rate, amp, bodies, jitter = 0.2, bend = () => 1 }) {
  const random = rng(seed);
  const clicks = new Float32Array(samples(length));
  for (let t = 0.002; t < length; t += (1 + between(random, -jitter, jitter)) / rate(t)) {
    const at = Math.round(t * SR);
    const level = amp(t) * between(random, 0.5, 1);
    // A slip is a spike and a few samples of grit, not a clean impulse.
    clicks[at] += level;
    for (let k = 1; k < 6 && at + k < clicks.length; k += 1) {
      clicks[at + k] += level * 0.4 * (random() * 2 - 1) * Math.exp(-k / 2);
    }
  }
  const out = new Float32Array(clicks.length);
  for (const [hz, q, gain] of bodies) {
    // A click rings a band-pass at about 2*pi*bandwidth/SR, so each body is
    // scaled back up to ring at roughly `gain`.
    const ring = (TAU * hz) / (q * SR);
    mixInto(out, svf(clicks, { type: "bpn", cutoff: (t) => hz * bend(t), q }), 0, gain / ring);
  }
  return out;
}

/** A china clink: a cup or plate knocked, bright modes that die fast. */
function clink(hz, length = 0.12) {
  return fade(
    modal(length, hz, [
      [1, 1, 0.05],
      [1.58, 0.55, 0.035],
      [2.31, 0.35, 0.022],
      [3.12, 0.18, 0.012],
    ]),
    0.0003,
    0.02,
  );
}

// The noise crack of a strike overshoots by up to ~3 dB after 96 kbps coding,
// so strikes keep extra headroom (the browser decode check flags clipping).
const STRIKE_CEILING_DB = -4.5;

const fight = [
  {
    name: "fight-strike-1",
    group: "Fight",
    target: -14,
    ceilingDb: STRIKE_CEILING_DB,
    render: (seed) => strike(seed),
  },
  {
    name: "fight-strike-2",
    group: "Fight",
    target: -14,
    ceilingDb: STRIKE_CEILING_DB,
    render: (seed) => strike(seed, { lowFrom: 270, lowTo: 92, crack: 0.8, slapHz: 1700, pow: 230 }),
  },
  {
    name: "fight-strike-3",
    group: "Fight",
    target: -13,
    ceilingDb: STRIKE_CEILING_DB,
    render: (seed) =>
      strike(seed, {
        lowFrom: 190,
        lowTo: 55,
        body: 0.09,
        crack: 0.4,
        slapHz: 950,
        pow: 140,
        heavy: 1,
      }),
  },
  {
    name: "fight-grapple-lift",
    group: "Fight",
    target: -19,
    render: (seed) => {
      const out = new Float32Array(samples(0.5));
      mixInto(out, whoosh(seed, 0.42, { from: 300, to: 2600, q: 1.6, peakAt: 0.75 }), 0, 1);
      mixInto(out, squeak(seed + 1, 0.32, { from: 300, to: 720, wobble: 0.08 }), 0.04, 0.45);
      mixInto(out, shape(bandpass(noise(0.2, seed + 2), 3200, 1.5), ar(0.01, 0.05)), 0, 0.3);
      return out;
    },
  },
  {
    name: "fight-grapple-slam",
    group: "Fight",
    target: -13,
    render: (seed) => {
      const out = new Float32Array(samples(0.8));
      mixInto(out, thump(seed, { hz: 58, length: 0.6, weight: 2.2 }), 0, 1);
      mixInto(out, osc("sine", 0.8, glide(70, 40, 0.1), { amp: ar(0.002, 0.16) }), 0, 0.7);
      mixInto(out, shape(lowpass(noise(0.6, seed + 1), 3000), ar(0.001, 0.12)), 0, 0.5);
      mixInto(
        out,
        modal(0.3, 175, [
          [1, 1, 0.06],
          [2.3, 0.6, 0.04],
          [3.9, 0.3, 0.02],
        ]),
        0.003,
        0.5,
      );
      mixInto(out, shape(highpass(noise(0.05, seed + 2), 2500), decay(0.008)), 0, 0.5);
      return trimTail(drive(room(out, 0.08), 2), -55);
    },
  },
  {
    name: "fight-trick-whiff",
    group: "Fight",
    target: -19,
    render: (seed) =>
      sum(whoosh(seed, 0.28, { from: 500, to: 3600, q: 2, peakAt: 0.55 }), [
        osc("sine", 0.28, (t) => 1100 * 2 ** (t / 0.28), {
          amp: env([
            [0, 0],
            [0.15, 1],
            [0.28, 0],
          ]),
        }),
        0.06,
      ]),
  },
  {
    name: "fight-trick-bonk",
    group: "Fight",
    target: -16,
    render: (seed) => {
      const out = new Float32Array(samples(0.45));
      const knock = modal(
        0.35,
        520,
        [
          [1, 1, 0.07],
          [2.95, 0.45, 0.03],
          [5.2, 0.15, 0.012],
        ],
        { pitch: glide(1.3, 1, 0.015) },
      );
      mixInto(out, knock, 0, 1);
      mixInto(
        out,
        osc("sine", 0.42, (t) => 640 * (1 + 0.07 * Math.sin(TAU * 15 * t) * Math.exp(-t / 0.15)), {
          amp: ar(0.005, 0.07),
        }),
        0.02,
        0.35,
      );
      mixInto(out, shape(highpass(noise(0.01, seed), 3000), decay(0.002)), 0, 0.35);
      return drive(out, 1.5);
    },
  },
  {
    name: "fight-slowmo",
    group: "Fight",
    target: -18,
    render: (seed) => {
      const length = 1.35;
      const swell = env(
        [
          [0, 0],
          [0.35, 1],
          [0.8, 0.55],
          [length, 0],
        ],
        1,
      );
      const tone = osc("saw", length, (t) => 210 * (70 / 210) ** Math.min(1, t / 1.2), {
        amp: swell,
      });
      const sweep = shape(
        svf(noise(length, seed, "pink"), {
          type: "bpn",
          cutoff: (t) => 1900 * (180 / 1900) ** Math.min(1, t / 1.25),
          q: 1.3,
        }),
        swell,
      );
      const mix = sum([lowpass(tone, 900, 1.5), 0.35], [sweep, 1]);
      return trimTail(echo(mix, 0.085, 0.35, 0.35, 0.2), -50);
    },
  },
  {
    name: "fight-thud-1",
    group: "Fight",
    target: -16,
    render: (seed) =>
      trimTail(
        sum(thump(seed, { hz: 80, length: 0.4, weight: 1.2 }), [
          shape(lowpass(noise(0.35, seed + 1), 900), ar(0.004, 0.08)),
          0.35,
        ]),
        -55,
      ),
  },
  {
    name: "fight-thud-2",
    group: "Fight",
    target: -16,
    render: (seed) => {
      const out = new Float32Array(samples(0.5));
      mixInto(out, thump(seed, { hz: 74, length: 0.35, weight: 1 }), 0, 1);
      mixInto(out, thump(seed + 1, { hz: 96, length: 0.25, weight: 0.6 }), 0.15, 0.45);
      mixInto(out, shape(lowpass(noise(0.4, seed + 2), 800), ar(0.004, 0.09)), 0, 0.3);
      return trimTail(out, -55);
    },
  },
  {
    name: "fight-boing",
    group: "Fight",
    target: -18,
    render: () => {
      const length = 0.7;
      const pitch = (t) =>
        150 * (1 + 0.28 * (1 - Math.exp(-t / 0.12))) * (1 + 0.012 * Math.sin(TAU * 7 * t));
      const twang = svf(osc("saw", length, pitch), {
        type: "bpn",
        cutoff: (t) => 380 + 1000 * (0.5 + 0.5 * Math.sin(TAU * 8.5 * t)) * Math.exp(-t / 0.3),
        q: 5,
      });
      const body = osc("sine", length, pitch, { amp: 0.4 });
      return fade(shape(sum(twang, body), ar(0.003, 0.22)), 0.001, 0.05);
    },
  },
  {
    name: "fight-crunch",
    group: "Fight",
    target: -17,
    render: (seed) => {
      const out = new Float32Array(samples(0.3));
      const grit = crush(bandpass(noise(0.18, seed), 1500, 0.7), 5, 6);
      mixInto(out, shape(grit, ar(0.001, 0.04)), 0, 0.9);
      mixInto(
        out,
        lowpass(osc("square", 0.16, glide(880, 200, 0.04), { amp: decay(0.05) }), 2500),
        0,
        0.4,
      );
      const random = rng(seed + 1);
      for (let index = 0; index < 14; index += 1) {
        const at = between(random, 0, 0.14);
        mixInto(
          out,
          shape(highpass(noise(0.004, seed + 10 + index), 2000), decay(0.001)),
          at,
          between(random, 0.3, 0.8),
        );
      }
      return trimTail(drive(out, 1.8), -55);
    },
  },
  {
    name: "fight-edge-alarm",
    group: "Fight",
    target: -19,
    render: () => {
      const out = new Float32Array(samples(0.95));
      for (let index = 0; index < 6; index += 1) {
        const hz = index % 2 === 0 ? 988 : 740;
        const note = sum(osc("tri", 0.14, hz), [osc("square", 0.14, hz, { pw: 0.5 }), 0.25]);
        mixInto(
          out,
          shape(
            lowpass(note, 2600),
            env([
              [0, 0],
              [0.01, 1],
              [0.11, 0.8],
              [0.14, 0],
            ]),
          ),
          index * 0.15,
          1,
        );
      }
      return out;
    },
  },
  {
    name: "fight-ringout-scream",
    group: "Fight",
    target: -17,
    render: () => {
      const length = 2.0;
      const fall = (t) => Math.min(1, t / 1.85);
      const whistle = osc(
        "sine",
        length,
        (t) => 1750 * (330 / 1750) ** (fall(t) ** 0.85) * (1 + 0.015 * Math.sin(TAU * 6 * t)),
        {
          amp: env([
            [0, 0],
            [0.04, 1],
            [1.5, 0.75],
            [length, 0],
          ]),
        },
      );
      const yellFalling = shape(
        vowelMorph(
          osc(
            "saw",
            length,
            (t) => 430 * (170 / 430) ** fall(t) * (1 + 0.03 * Math.sin(TAU * 6.5 * t)),
          ),
          "a",
          "o",
          (t) => t / length,
          1.2,
        ),
        env([
          [0, 0],
          [0.06, 1],
          [1.4, 0.7],
          [length, 0],
        ]),
      );
      // Distance: the whole thing darkens as it falls away.
      const mix = sum([whistle, 0.55], [yellFalling, 0.5]);
      return trimTail(
        lowpass(mix, (t) => 9000 * (1400 / 9000) ** Math.min(1, t / length), 0.8),
        -50,
      );
    },
  },
  {
    name: "fight-finale",
    group: "Fight",
    target: -14,
    render: (seed) => {
      const out = new Float32Array(samples(1.9));
      // "Uh-oh": a diminished brass stab with the title slam (which brings the boom)...
      mixInto(
        out,
        brass([49, 55, 61, 64, 67], 0.16, { attack: 0.01, release: 0.12, bright: 1.25 }),
        0,
        0.8,
      );
      // ...an alarm whooping twice over a timpani and snare roll that swells...
      for (const at of [0.2, 0.5]) mixInto(out, whoop(0.27, 420, 1250), at, 0.28);
      const random = rng(seed + 1);
      for (let index = 0; index < 15; index += 1) {
        const u = index / 14;
        const at = 0.2 + index * 0.044 + between(random, -0.006, 0.006);
        mixInto(
          out,
          timpani(seed + 20 + index, midiHz(45), { length: 0.4, hard: 0.4 + 0.5 * u }),
          at,
          0.05 + 0.15 * u * u,
        );
        mixInto(out, snare(seed + 40 + index, { snap: 0.6 }), at + 0.02, 0.05 + 0.2 * u * u);
      }
      // ...into the same stab a half step up: the arena just turned on you.
      const hit = 0.86;
      mixInto(
        out,
        brass([50, 56, 62, 65, 68], 0.42, { attack: 0.012, release: 0.28, bright: 1.35 }),
        hit,
        1.2,
      );
      mixInto(out, timpani(seed + 2, midiHz(38), { hard: 1.2 }), hit, 0.45);
      mixInto(out, kick(seed + 3, { tone: 0.9 }), hit, 0.4);
      mixInto(out, snare(seed + 4), hit, 0.4);
      mixInto(out, crash(seed + 5, 0.95), hit, 0.22);
      return trimTail(highpass(room(out, 0.12, 0.42), 40), -50);
    },
  },
  {
    name: "finale-tilt",
    group: "Fight",
    target: -16.5,
    render: (seed) => {
      const out = new Float32Array(samples(2.3));
      // The laminate squeals under the strain...
      mixInto(
        out,
        creak(seed, 0.42, {
          rate: env([
            [0, 150],
            [0.28, 250],
            [0.42, 210],
          ]),
          amp: env([
            [0, 0],
            [0.06, 0.5],
            [0.3, 1],
            [0.42, 0],
          ]),
          bodies: [
            [950, 9, 0.6],
            [1600, 10, 1],
            [2500, 10, 0.45],
          ],
        }),
        0,
        0.6,
      );
      // ...the counter lurches over with a wooden klunk...
      const lurch = 0.3;
      mixInto(out, thump(seed + 1, { hz: 72, length: 0.45, weight: 1.6 }), lurch, 0.6);
      mixInto(
        out,
        modal(0.35, 150, [
          [1, 1, 0.07],
          [2.3, 0.6, 0.04],
          [3.7, 0.25, 0.02],
        ]),
        lurch + 0.004,
        0.5,
      );
      // ...and groans as it tips, the creak slowing as it settles.
      const groanRate = env([
        [0, 55],
        [0.3, 80],
        [0.9, 58],
        [1.65, 30],
      ]);
      mixInto(
        out,
        creak(seed + 2, 1.65, {
          rate: (t) => groanRate(t) * (1 + 0.07 * Math.sin(TAU * 3.3 * t)),
          amp: env([
            [0, 0],
            [0.08, 1],
            [0.9, 0.85],
            [1.65, 0],
          ]),
          bodies: [
            [210, 3, 1],
            [380, 5, 0.9],
            [690, 7, 0.6],
            [1150, 8, 0.35],
            [1900, 8, 0.15],
          ],
          bend: (t) => 1.05 - 0.1 * Math.min(1, t / 1.65),
        }),
        lurch + 0.02,
        0.8,
      );
      // A chunky synth slides down under it: the whole world tipping.
      mixInto(
        out,
        shape(
          lowpass(
            osc("saw", 0.95, (t) => 110 * 0.5 ** Math.min(1, t / 0.8)),
            520,
            1.1,
          ),
          env([
            [0, 0],
            [0.04, 1],
            [0.6, 0.6],
            [0.95, 0],
          ]),
        ),
        lurch,
        0.2,
      );
      // Everything on it slides: a low scrape, a plate skating, crockery rattling downhill.
      mixInto(
        out,
        shape(
          lowpass(noise(1.5, seed + 3, "pink"), 380, 0.8),
          env([
            [0, 0],
            [0.2, 1],
            [0.9, 0.7],
            [1.5, 0],
          ]),
        ),
        lurch + 0.05,
        0.35,
      );
      const skate = env([
        [0, 0],
        [0.15, 1],
        [0.6, 0],
      ]);
      mixInto(
        out,
        shape(
          svf(noise(0.6, seed + 4, "pink"), { type: "bpn", cutoff: (t) => 2100 - 700 * t, q: 1.6 }),
          (t) => skate(t) * (0.6 + 0.4 * Math.abs(Math.sin(TAU * 23 * t))),
        ),
        lurch + 0.25,
        0.12,
      );
      const random = rng(seed + 5);
      for (let index = 0; index < 11; index += 1) {
        const u = index / 11;
        const at = lurch + 0.12 + 1.25 * u ** 1.15 + between(random, -0.03, 0.03);
        const hz = between(random, 1500, 2600);
        const level = between(random, 0.5, 1) * (1 - 0.5 * u);
        mixInto(out, clink(hz), at, 0.35 * level);
        if (random() < 0.6) {
          const bounce = clink(hz * between(random, 0.97, 1.04), 0.08);
          mixInto(out, bounce, at + between(random, 0.025, 0.045), 0.2 * level);
        }
      }
      // Something fetches up at the low end.
      mixInto(out, thump(seed + 6, { hz: 90, length: 0.2, weight: 0.5 }), 1.85, 0.3);
      mixInto(out, clink(1900), 1.86, 0.15);
      return trimTail(highpass(drive(room(out, 0.1, 0.4), 1.4), 30), -50);
    },
  },
  {
    name: "finale-flood",
    group: "Fight",
    target: -16.5,
    render: (seed) => {
      const length = 2.2;
      const out = new Float32Array(samples(length));
      // The pipe bursts: a dull clank and a spray...
      mixInto(out, clang(185, 0.45, 0.6), 0, 0.3);
      mixInto(out, thump(seed, { hz: 80, length: 0.3, weight: 0.9 }), 0, 0.4);
      mixInto(
        out,
        shape(lowpass(bandpass(noise(0.5, seed + 1), 2400, 0.7), 6500), ar(0.004, 0.11)),
        0.005,
        1,
      );
      // ...and glugs: big low bubbles out of the pipe.
      const glugs = [
        [0.07, 130, 330],
        [0.17, 160, 400],
        [0.26, 140, 350],
        [0.36, 175, 430],
      ];
      for (const [index, [at, from, to]] of glugs.entries()) {
        mixInto(out, bloop(from, to, 0.11, { tau: 0.025 }), at, 0.5);
        mixInto(
          out,
          shape(lowpass(noise(0.08, seed + 10 + index), 900, 2), ar(0.004, 0.02)),
          at,
          0.25,
        );
      }
      // The surge: rushing water swelling as it rises, its colour climbing.
      const swell = env([
        [0, 0],
        [0.15, 0.22],
        [1.1, 1],
        [1.4, 0.85],
        [1.95, 0],
      ]);
      const random = rng(seed + 2);
      const phases = [random() * TAU, random() * TAU, random() * TAU];
      const churn = (t) =>
        1 +
        0.25 * Math.sin(TAU * 5.3 * t + phases[0]) +
        0.15 * Math.sin(TAU * 8.7 * t + phases[1]) +
        0.1 * Math.sin(TAU * 13.1 * t + phases[2]);
      const rush = svf(noise(length, seed + 3, "pink"), {
        type: "bpn",
        cutoff: (t) => 650 * (2000 / 650) ** Math.min(1, t / 1.5),
        q: 0.6,
      });
      mixInto(
        out,
        shape(rush, (t) => swell(t) * churn(t)),
        0,
        2.2,
      );
      mixInto(out, shape(lowpass(noise(length, seed + 4, "brown"), 260, 0.8), swell), 0, 0.55);
      // Bubbles all through it, climbing with the water.
      for (let index = 0; index < 70; index += 1) {
        const at = between(random, 0.12, 1.95);
        const f0 = between(random, 450, 800) * (1 + 0.9 * (at / 1.95));
        const bubble = osc("sine", 0.05, (t) => f0 * (1 + 1.6 * Math.min(1, t / 0.025)), {
          amp: ar(0.001, 0.01),
        });
        mixInto(out, bubble, at, swell(at) * between(random, 0.2, 0.5));
      }
      // Waves slop over the pad.
      for (const [index, at] of [0.6, 0.98, 1.32].entries()) {
        mixInto(
          out,
          shape(lowpass(noise(0.2, seed + 20 + index), 2400), ar(0.002, 0.045)),
          at,
          0.5,
        );
        const wash = svf(noise(0.4, seed + 30 + index, "pink"), {
          type: "bpn",
          cutoff: (t) => 1300 * (600 / 1300) ** Math.min(1, t / 0.3),
          q: 0.8,
        });
        mixInto(out, shape(wash, ar(0.008, 0.12)), at, 0.5);
        splashDroplets(seed + 40 + index, out, at + 0.03, at + 0.35, 8);
      }
      // A chunky synth rising underneath: the tide coming up.
      mixInto(
        out,
        shape(
          lowpass(
            osc("tri", 1.5, (t) => 62 * 2 ** Math.min(1, t / 1.3)),
            400,
          ),
          env([
            [0, 0],
            [0.3, 1],
            [1.2, 0.9],
            [1.5, 0],
          ]),
        ),
        0.2,
        0.2,
      );
      return trimTail(
        highpass(reverb(out, { size: 0.6, damp: 0.4, mix: 0.25, tail: 0.3 }), 30),
        -50,
      );
    },
  },
  {
    name: "finale-storm",
    group: "Fight",
    target: -16,
    ceilingDb: -3,
    render: (seed) => {
      const length = 2.9;
      const out = new Float32Array(samples(length));
      const random = rng(seed);
      // The crack: a ripping cluster of snaps over a broad bang...
      const crack = new Float32Array(samples(0.5));
      for (let index = 0; index < 24; index += 1) {
        const at = 0.16 * (index / 24) ** 1.4 + between(random, 0, 0.004);
        const snap = shape(
          highpass(noise(0.02, seed + 10 + index), between(random, 700, 1600)),
          decay(between(random, 0.002, 0.006)),
        );
        mixInto(crack, snap, at, between(random, 0.3, 1) * (1 - index / 32));
      }
      mixInto(crack, shape(noise(0.4, seed + 1), ar(0.002, 0.09)), 0, 0.6);
      mixInto(out, lowpass(crack, 6500, 0.7), 0, 1.5);
      // ...then the boom, and a rumble that rolls a few times as it dies away.
      mixInto(out, osc("sine", 0.9, glide(140, 45, 0.07), { amp: ar(0.004, 0.3) }), 0.01, 0.5);
      const roll = env([
        [0, 0],
        [0.06, 1],
        [0.4, 0.6],
        [0.7, 0.8],
        [1.1, 0.45],
        [1.45, 0.55],
        [2.3, 0],
      ]);
      const phases = [random() * TAU, random() * TAU];
      const flutter = (t) =>
        1 +
        0.18 * Math.sin(TAU * 7.3 * t + phases[0]) +
        0.12 * Math.sin(TAU * 11.9 * t + phases[1]);
      mixInto(
        out,
        shape(
          svf(noise(2.4, seed + 2, "pink"), { type: "bpn", cutoff: 95, q: 0.7 }),
          (t) => roll(t) * flutter(t),
        ),
        0.02,
        2.6,
      );
      mixInto(
        out,
        shape(lowpass(noise(2.4, seed + 3, "pink"), 420, 0.7), (t) => roll(t) ** 1.5 * flutter(t)),
        0.02,
        1.2,
      );
      // The wind howls up behind it and doesn't let go.
      const wind = env([
        [0, 0],
        [0.25, 0.05],
        [1.7, 1],
        [2.25, 0.85],
        [2.9, 0],
      ]);
      const gusts = (t) => 0.78 + 0.22 * Math.sin(TAU * 1.3 * t + phases[0]);
      const howlHz = (t) =>
        560 * (1 + 0.6 * Math.min(1, t / 1.7) ** 1.5) * (1 + 0.04 * Math.sin(TAU * 2.1 * t));
      const gust = svf(noise(length, seed + 4, "pink"), {
        type: "bpn",
        cutoff: (t) => 380 + 320 * Math.min(1, t / 1.8),
        q: 0.85,
      });
      mixInto(
        out,
        shape(gust, (t) => wind(t) * gusts(t)),
        0,
        1.6,
      );
      const howl = svf(noise(length, seed + 5), { type: "bpn", cutoff: howlHz, q: 10 });
      mixInto(
        out,
        shape(howl, (t) => wind(t) ** 1.5 * gusts(t)),
        0,
        3.3,
      );
      mixInto(
        out,
        osc("sine", length, (t) => howlHz(t) * (1 + 0.006 * Math.sin(TAU * 5 * t)), {
          amp: (t) => wind(t) ** 2,
        }),
        0,
        0.05,
      );
      return trimTail(highpass(out, 40), -50);
    },
  },
  {
    name: "land-splash",
    group: "Fight",
    target: -15,
    render: (seed) => {
      const out = new Float32Array(samples(1.0));
      mixInto(out, thump(seed, { hz: 70, length: 0.3, weight: 0.8 }), 0, 0.6);
      mixInto(out, shape(lowpass(noise(0.2, seed + 1), 2600), ar(0.001, 0.05)), 0, 0.8);
      mixInto(
        out,
        shape(
          svf(noise(0.8, seed + 2, "pink"), {
            type: "bpn",
            cutoff: (t) => 1600 * (550 / 1600) ** Math.min(1, t / 0.6),
            q: 0.8,
          }),
          ar(0.01, 0.22),
        ),
        0.01,
        1.1,
      );
      splashDroplets(seed + 3, out, 0.06, 0.85, 22);
      return trimTail(room(out, 0.1), -50);
    },
  },
  {
    name: "land-clang",
    group: "Fight",
    target: -15,
    render: (seed) => {
      const out = new Float32Array(samples(1.0));
      mixInto(out, clang(330, 0.95), 0, 1);
      mixInto(out, clang(470, 0.5, 0.7), 0.075, 0.45);
      mixInto(out, thump(seed, { hz: 90, length: 0.25, weight: 0.7 }), 0, 0.6);
      const random = rng(seed + 1);
      for (let index = 0; index < 6; index += 1) {
        mixInto(
          out,
          clang(between(random, 900, 1500), 0.06, 0.6),
          0.12 + index * 0.06 + between(random, 0, 0.02),
          0.18 * (1 - index / 7),
        );
      }
      return trimTail(out, -50);
    },
  },
  {
    name: "land-thud",
    group: "Fight",
    target: -15,
    render: (seed) => {
      const out = new Float32Array(samples(0.8));
      mixInto(out, thump(seed, { hz: 52, length: 0.6, weight: 2.6 }), 0, 1);
      mixInto(out, osc("sine", 0.6, glide(60, 38, 0.1), { amp: ar(0.002, 0.2) }), 0, 0.6);
      mixInto(out, shape(lowpass(noise(0.7, seed + 1), 1200), ar(0.02, 0.22)), 0.01, 0.35);
      const random = rng(seed + 2);
      for (let index = 0; index < 7; index += 1) {
        mixInto(
          out,
          woodblock(between(random, 1800, 3200), 0.04),
          0.08 + between(random, 0, 0.35),
          between(random, 0.05, 0.12),
        );
      }
      return trimTail(drive(out, 1.8), -55);
    },
  },
  {
    name: "fight-ko",
    group: "Fight",
    target: -13,
    render: (seed) => {
      const out = new Float32Array(samples(1.7));
      mixInto(
        out,
        strike(seed, {
          lowFrom: 180,
          lowTo: 50,
          body: 0.12,
          crack: 0.5,
          slapHz: 900,
          pow: 120,
          heavy: 1,
        }),
        0,
        1,
      );
      mixInto(out, crash(seed + 1, 1.2), 0, 0.35);
      mixInto(
        out,
        brass([50, 57, 62], 0.32, { bright: 1.2, attack: 0.015, release: 0.2 }),
        0.0,
        0.45,
      );
      for (const at of [0.22, 0.42, 0.62]) mixInto(out, boxingBell(1320), at, 0.55);
      return trimTail(out, -50);
    },
  },
  {
    name: "fight-win",
    group: "Fight",
    target: -15,
    render: (seed) => {
      const out = new Float32Array(samples(2.5));
      const pickup = [
        [0, [65]],
        [0.13, [69]],
        [0.26, [72]],
      ];
      for (const [at, notes] of pickup) {
        mixInto(out, brass(notes, 0.1, { attack: 0.012, release: 0.06 }), at, 0.7);
        mixInto(out, glock(notes[0] + 12, 0.3), at, 0.25);
      }
      mixInto(
        out,
        brass([65, 69, 72, 77], 1.25, { attack: 0.02, release: 0.4, bright: 1.15 }),
        0.4,
        1,
      );
      mixInto(out, glock(89, 1.0), 0.4, 0.35);
      mixInto(out, crash(seed, 1.6), 0.4, 0.35);
      mixInto(out, kick(seed + 1), 0.4, 0.5);
      for (let index = 0; index < 8; index += 1)
        mixInto(
          out,
          snare(seed + 10 + index, { snap: 0.5 }),
          0.05 + index * 0.044,
          0.12 + index * 0.03,
        );
      return trimTail(room(out, 0.12, 0.45), -50);
    },
  },
  {
    name: "fight-lose",
    group: "Fight",
    target: -16,
    render: () => {
      const notes = [
        [0, 60, 0.36],
        [0.42, 59, 0.36],
        [0.84, 58, 0.36],
        [1.26, 57, 1.15],
      ];
      const out = new Float32Array(samples(2.7));
      for (const [at, midi, length] of notes) {
        const last = midi === 57;
        const hz = midiHz(midi);
        const freq = (t) => {
          const vibrato = last
            ? 0.022 * Math.min(1, Math.max(0, (t - 0.25) / 0.3)) * Math.sin(TAU * 5.2 * t)
            : 0.004 * Math.sin(TAU * 5 * t);
          const droop = last ? 1 - 0.035 * Math.max(0, (t - 0.8) / 0.4) : 1;
          return hz * (1 + vibrato) * droop;
        };
        const tone = sum(osc("saw", length + 0.1, freq), [osc("sine", length + 0.1, freq), 0.5]);
        const wah = svf(tone, {
          type: "lp",
          cutoff: (t) =>
            350 + 1300 * Math.min(1, t / 0.12) * (last ? 0.75 + 0.25 * Math.sin(TAU * 2.6 * t) : 1),
          q: 1.6,
        });
        const amp = (t) =>
          t < 0.04 ? t / 0.04 : t < length ? 0.85 : 0.85 * Math.max(0, 1 - (t - length) / 0.1);
        mixInto(out, drive(shape(wah, amp), 1.4), at, 1);
      }
      return trimTail(room(out, 0.1), -50);
    },
  },
  {
    name: "crowd-cheer",
    group: "Fight",
    target: -16,
    render: (seed) =>
      trimTail(
        crowd(seed, 2.6, {
          voices: 36,
          vowels: ["a", "e", "o"],
          rise: [1.1, 1.4],
          spread: 0.12,
          claps: 45,
          whistles: 3,
          envelope: env([
            [0, 0],
            [0.14, 1],
            [1.2, 0.85],
            [2.6, 0],
          ]),
        }),
        -50,
      ),
  },
  {
    name: "crowd-gasp",
    group: "Fight",
    target: -18,
    render: (seed) => {
      const voices = crowd(seed, 1.0, {
        voices: 22,
        vowels: ["o", "u"],
        low: 130,
        high: 280,
        rise: [1.15, 1.35],
        spread: 0.06,
        envelope: env([
          [0, 0],
          [0.12, 1],
          [0.45, 0.65],
          [1.0, 0],
        ]),
      });
      const inhale = shape(
        highpass(noise(0.3, seed + 1, "pink"), 1800),
        env([
          [0, 0],
          [0.12, 0.35],
          [0.22, 0],
        ]),
      );
      return trimTail(sum(voices, inhale), -50);
    },
  },
  {
    name: "loop-crowd-murmur",
    group: "Fight",
    target: -28,
    mode: "integrated",
    loop: 8,
    render: (seed) => {
      const raw = crowd(seed, 8.7, {
        voices: 30,
        vowels: ["a", "e", "o", "u", "i"],
        low: 100,
        high: 230,
        rise: [0.95, 1.05],
        syllables: 0.85,
        spread: 0.01,
      });
      const murmur = lowpass(raw, 2800, 0.7);
      return crossfadeLoop(murmur, 8, 0.6);
    },
  },
];

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

const transitions = [
  {
    name: "trans-slam",
    group: "Transitions",
    target: -14,
    render: (seed) => {
      const out = new Float32Array(samples(1.0));
      mixInto(out, osc("sine", 0.9, glide(130, 40, 0.06), { amp: ar(0.001, 0.16) }), 0, 1);
      mixInto(out, snare(seed, { tone: 0.8 }), 0, 0.7);
      mixInto(out, clang(210, 0.6, 0.8), 0.002, 0.35);
      mixInto(out, crash(seed + 1, 0.8), 0, 0.25);
      return trimTail(drive(room(out, 0.1, 0.4), 1.8), -50);
    },
  },
  {
    name: "trans-wipe",
    group: "Transitions",
    target: -19,
    render: (seed) =>
      sum(whoosh(seed, 0.62, { from: 280, to: 5200, q: 0.9, peakAt: 0.5 }), [
        osc("sine", 0.62, (t) => 380 * 4 ** (t / 0.62), {
          amp: env([
            [0, 0],
            [0.3, 1],
            [0.62, 0],
          ]),
        }),
        0.05,
      ]),
  },
  {
    name: "trans-letterbox",
    group: "Transitions",
    target: -19,
    render: (seed) => {
      const out = new Float32Array(samples(0.35));
      mixInto(
        out,
        modal(0.3, 140, [
          [1, 1, 0.05],
          [2.3, 0.5, 0.03],
          [3.7, 0.2, 0.015],
        ]),
        0,
        1,
      );
      mixInto(out, woodblock(2200, 0.05), 0, 0.4);
      mixInto(out, thump(seed, { hz: 85, length: 0.2, weight: 0.5 }), 0.005, 0.6);
      return trimTail(out, -55);
    },
  },
];

// ---------------------------------------------------------------------------
// Ambience loops (8 s each)
// ---------------------------------------------------------------------------

function events(seed, count, length, minGap) {
  const random = rng(seed);
  const times = [];
  let guard = 0;
  while (times.length < count && guard < 1000) {
    guard += 1;
    const t = random() * length;
    if (
      times.every((other) => Math.min(Math.abs(other - t), length - Math.abs(other - t)) >= minGap)
    )
      times.push(t);
  }
  return times.sort((a, b) => a - b);
}

const ambience = [
  {
    name: "loop-amb-garage",
    group: "Ambience",
    target: -29,
    mode: "integrated",
    loop: 8,
    render: (seed) => {
      const L = samples(8);
      const loop = new Float32Array(L);
      // Room tone and slow water lapping (two swells per loop).
      const tone = wrapEffect(noise(8, seed, "brown"), (x) => lowpass(x, 420, 0.7));
      mixWrapped(
        loop,
        shape(tone, (t) => 0.75 + 0.25 * Math.sin(TAU * (t / 4))),
        0,
        0.6,
      );
      const lap = wrapEffect(noise(8, seed + 1, "pink"), (x) => bandpass(x, 700, 0.8));
      mixWrapped(
        loop,
        shape(lap, (t) => 0.3 + 0.7 * Math.max(0, Math.sin(TAU * (t / 4) + 1)) ** 3),
        0,
        0.05,
      );
      // The buzzing tube: 120 Hz harmonics with a flicker and two "zzt" sputters.
      const flicker = (t) => {
        let level = 0.85 + 0.15 * Math.sin(TAU * 0.75 * t) * Math.sin(TAU * 1.25 * t);
        for (const at of [2.1, 5.7]) {
          const d = t - at;
          if (d > 0 && d < 0.35) level *= 0.35 + 0.65 * Math.abs(Math.sin(TAU * 22 * d));
        }
        return level;
      };
      const buzz = lowpass(osc("square", 8, 120, { pw: 0.18 }), 1800, 0.9);
      mixWrapped(loop, shape(buzz, flicker), 0, 0.035);
      mixWrapped(
        loop,
        shape(highpass(noise(8, seed + 2), 6000), (t) => 0.2 * flicker(t) ** 4),
        0,
        0.03,
      );
      // Drips: a quick upward chirp each, at seeded times.
      for (const at of events(seed + 3, 9, 8, 0.45)) {
        const f0 = 700 + ((at * 97) % 500);
        const drip = osc("sine", 0.06, (t) => f0 * (1 + 1.4 * Math.min(1, t / 0.022)), {
          amp: ar(0.001, 0.014),
        });
        mixWrapped(loop, drip, at, 0.35);
      }
      return wrapEffect(loop, (x) =>
        reverb(x, { size: 0.75, damp: 0.35, mix: 0.35, tail: 0, scale: 1.1 }),
      );
    },
  },
  {
    name: "loop-amb-kitchen",
    group: "Ambience",
    target: -29,
    mode: "integrated",
    loop: 8,
    render: (seed) => {
      const L = samples(8);
      const loop = new Float32Array(L);
      // Fridge hum: mains and its harmonic with a slow beat, plus a soft hiss.
      mixWrapped(
        loop,
        osc("sine", 8, 60, { amp: (t) => 0.8 + 0.2 * Math.sin(TAU * (t / 8)) }),
        0,
        0.22,
      );
      mixWrapped(loop, osc("sine", 8, 120.25), 0, 0.12);
      mixWrapped(loop, osc("sine", 8, 180), 0, 0.03);
      const hiss = wrapEffect(noise(8, seed, "pink"), (x) => lowpass(x, 1200, 0.7));
      mixWrapped(loop, hiss, 0, 0.05);
      // The clock: tick, tock, once a second.
      for (let index = 0; index < 8; index += 1) {
        mixWrapped(loop, woodblock(index % 2 ? 2050 : 2550, 0.05), index, 0.32);
      }
      // A faraway bird outside the window, twice.
      for (const at of [2.6, 6.35]) {
        for (let k = 0; k < 2; k += 1) {
          const chirp = osc(
            "sine",
            0.09,
            (t) => 3400 * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, t / 0.09))),
            {
              amp: env([
                [0, 0],
                [0.01, 1],
                [0.09, 0],
              ]),
            },
          );
          mixWrapped(loop, chirp, at + k * 0.13, 0.02);
        }
      }
      return wrapEffect(loop, (x) =>
        reverb(x, { size: 0.35, damp: 0.6, mix: 0.15, tail: 0, scale: 0.6 }),
      );
    },
  },
  {
    name: "loop-amb-rooftop",
    group: "Ambience",
    target: -29,
    mode: "integrated",
    loop: 8,
    render: (seed) => {
      const L = samples(8);
      const loop = new Float32Array(L);
      // Wind: band-passed noise whose centre sways (periodic in the loop) with gusts.
      const sway = (t) =>
        520 + 220 * Math.sin(TAU * (t / 8)) + 140 * Math.sin((TAU * (3 * t)) / 8 + 1.3);
      const gust = (t) =>
        0.55 + 0.3 * Math.sin(TAU * (t / 8) + 0.6) + 0.15 * Math.sin((TAU * (2 * t)) / 8 + 2.1);
      const wind = wrapEffect(noise(8, seed, "pink"), (x) =>
        svf(x, { type: "bpn", cutoff: (t) => sway(t % 8), q: 0.9 }),
      );
      mixWrapped(
        loop,
        shape(wind, (t) => gust(t)),
        0,
        0.5,
      );
      const whistle = wrapEffect(noise(8, seed + 1), (x) =>
        svf(x, {
          type: "bpn",
          cutoff: (t) => 1150 + 180 * Math.sin(TAU * ((t % 8) / 8) * 2),
          q: 9,
        }),
      );
      mixWrapped(
        loop,
        shape(whistle, (t) => gust(t) ** 3),
        0,
        0.03,
      );
      // Distant traffic: a low rumble that swells twice, one car passing, one far horn.
      const rumble = wrapEffect(noise(8, seed + 2, "brown"), (x) => lowpass(x, 240, 0.7));
      mixWrapped(
        loop,
        shape(rumble, (t) => 0.7 + 0.3 * Math.sin(TAU * (t / 4))),
        0,
        0.45,
      );
      const pass = shape(
        bandpass(noise(3, seed + 3, "pink"), 650, 0.7),
        env(
          [
            [0, 0],
            [1.6, 1],
            [3, 0],
          ],
          1,
        ),
      );
      mixWrapped(loop, pass, 2.0, 0.08);
      const horn = lowpass(sum(osc("square", 0.5, 349), [osc("square", 0.5, 440), 0.8]), 700);
      mixWrapped(
        loop,
        shape(
          horn,
          env([
            [0, 0],
            [0.04, 1],
            [0.42, 0.8],
            [0.5, 0],
          ]),
        ),
        6.1,
        0.01,
      );
      return loop;
    },
  },
];

// ---------------------------------------------------------------------------
// Music loops (one key family: F major / D minor)
// ---------------------------------------------------------------------------

const bars = (bpm, count) => (60 / bpm) * 4 * count;

function drumLoop(loop, bpm, hits, seed) {
  const beat = 60 / bpm;
  for (const [at, kind, level = 1] of hits) {
    const s = seed + Math.round(at * 100);
    const sound =
      kind === "k"
        ? kick(s)
        : kind === "s"
          ? snare(s)
          : kind === "h"
            ? hat(s, { level })
            : kind === "o"
              ? hat(s, { open: true, level })
              : kind === "c"
                ? clap(s)
                : kind === "x"
                  ? crash(s, 1.4)
                  : kind === "sh"
                    ? shaker(s, level)
                    : kind === "wb"
                      ? woodblock(1250, 0.08)
                      : kind === "cb"
                        ? cowbell(level)
                        : tom(s, kind === "t1" ? 180 : 130);
    mixWrapped(loop, sound, at * beat, kind === "h" || kind === "o" || kind === "sh" ? 1 : level);
  }
}

function every(stepBeats, totalBeats, kind, level = 1, offset = 0) {
  const out = [];
  for (let at = offset; at < totalBeats - 1e-9; at += stepBeats) out.push([at, kind, level]);
  return out;
}

const music = [
  {
    name: "loop-music-build",
    group: "Music",
    target: -20,
    mode: "integrated",
    loop: bars(108, 4),
    render: (seed) => {
      const bpm = 108;
      const loop = new Float32Array(samples(bars(bpm, 4)));
      // Walking pizzicato bass: F | Bb | C | F.
      const bassline = [53, 60, 57, 60, 58, 53, 62, 58, 48, 55, 52, 55, 53, 60, 57, 48];
      sequence(
        loop,
        bpm,
        bassline.map((midi, index) => [index, midi - 12, 0.9, 0.9]),
        (midi, length, at) => pizz(midi, seed + at * 10, { length: 0.7, damp: 0.5 }),
      );
      // Xylophone hook, staccato eighths.
      const hook = [
        [0, 77],
        [0.5, 81],
        [1, 84],
        [1.5, 81],
        [2.5, 79],
        [3, 77],
        [4, 82],
        [4.5, 81],
        [5, 79],
        [5.5, 77],
        [6, 74],
        [7, 77],
        [8, 79],
        [8.5, 81],
        [9, 84],
        [9.5, 86],
        [10.5, 84],
        [11, 79],
        [12, 81],
        [12.5, 79],
        [13, 77],
        [14, 72],
        [14.5, 74],
        [15, 77],
      ];
      sequence(
        loop,
        bpm,
        hook.map(([at, midi]) => [at, midi, 0.4, 0.55]),
        (midi) => xylo(midi, { length: 0.35 }),
      );
      // Soft organ chords on each bar.
      const chords = [
        [65, 69, 72],
        [65, 70, 74],
        [64, 67, 72],
        [65, 69, 72],
      ];
      chords.forEach((chord, index) =>
        mixWrapped(loop, organ(chord, (60 / bpm) * 3.6, 1), index * (60 / bpm) * 4, 0.16),
      );
      drumLoop(
        loop,
        bpm,
        [
          ...every(2, 16, "k", 0.55),
          ...every(1, 16, "wb", 0.18, 0.5),
          ...every(0.5, 16, "sh", 0.5),
          ...every(1, 16, "sh", 0.9, 0.5),
          [3.5, "k", 0.3],
          [11.5, "k", 0.3],
        ],
        seed,
      );
      return wrapEffect(loop, (x) =>
        reverb(x, { size: 0.45, damp: 0.5, mix: 0.12, tail: 0, scale: 0.8 }),
      );
    },
  },
  {
    name: "loop-music-foundry",
    group: "Music",
    target: -20,
    mode: "integrated",
    loop: bars(100, 4),
    render: (seed) => {
      const bpm = 100;
      const loop = new Float32Array(samples(bars(bpm, 4)));
      // Machine arp in sixteenths: Dm7 | Bbmaj7 | C | Dm.
      const shapes = [
        [62, 65, 69, 72],
        [58, 62, 65, 69],
        [60, 64, 67, 72],
        [62, 65, 69, 74],
      ];
      const arp = [];
      shapes.forEach((chord, bar) => {
        for (let step = 0; step < 16; step += 1) {
          const order = [0, 1, 2, 3, 2, 1, 2, 3];
          arp.push([
            bar * 4 + step * 0.25,
            chord[order[step % 8]] + 12,
            0.2,
            step % 4 === 0 ? 0.55 : 0.38,
          ]);
        }
      });
      sequence(loop, bpm, arp, (midi, length) => lead(midi, length, { pw: 0.25, bright: 0.5 }));
      // Pumping bass on eighths.
      const roots = [38, 34, 36, 38];
      const bassNotes = [];
      roots.forEach((root, bar) => {
        for (let step = 0; step < 8; step += 1)
          bassNotes.push([bar * 4 + step * 0.5, root + (step % 2 ? 12 : 0), 0.4, 0.75]);
      });
      sequence(loop, bpm, bassNotes, (midi, length) =>
        bass(midi, length, { wave: "square", bright: 0.6, q: 1.6 }),
      );
      // Clanky factory percussion: kick on quarters, metal on the offbeats.
      drumLoop(
        loop,
        bpm,
        [
          ...every(1, 16, "k", 0.6),
          ...every(0.5, 16, "h", 0.6, 0.5),
          [6.75, "k", 0.35],
          [14.75, "k", 0.35],
        ],
        seed,
      );
      for (let beat = 0; beat < 16; beat += 1) {
        mixWrapped(
          loop,
          clang(beat % 4 === 1 ? 1180 : 1560, 0.12, 0.6),
          (beat + 0.5) * (60 / bpm),
          beat % 2 ? 0.05 : 0.08,
        );
      }
      for (const at of [3.5, 7.5, 11.5, 15.25])
        mixWrapped(loop, clap(seed + at * 10), at * (60 / bpm), 0.45);
      return wrapEffect(loop, (x) =>
        reverb(x, { size: 0.4, damp: 0.6, mix: 0.1, tail: 0, scale: 0.7 }),
      );
    },
  },
  {
    name: "loop-music-fight",
    group: "Music",
    target: -20,
    mode: "integrated",
    loop: bars(160, 8),
    render: (seed) => {
      const bpm = 160;
      const beats = 32;
      const loop = new Float32Array(samples(bars(bpm, 8)));
      // Driving octave bass: Dm Dm Bb C | Dm Dm Bb A.
      const roots = [38, 38, 34, 36, 38, 38, 34, 33];
      const bassNotes = [];
      roots.forEach((root, bar) => {
        for (let step = 0; step < 8; step += 1)
          bassNotes.push([
            bar * 4 + step * 0.5,
            root + (step % 2 ? 12 : 0),
            0.36,
            step % 4 === 0 ? 1 : 0.8,
          ]);
      });
      sequence(loop, bpm, bassNotes, (midi, length) =>
        bass(midi, length, { wave: "saw", bright: 0.9, q: 2.6 }),
      );
      // Brass stabs on the syncopations.
      const stabChords = { 38: [62, 65, 69], 34: [62, 65, 70], 36: [60, 64, 67], 33: [61, 64, 69] };
      roots.forEach((root, bar) => {
        for (const at of [1.5, 3])
          mixWrapped(
            loop,
            brass(stabChords[root], 0.14, { attack: 0.01, release: 0.08, bright: 1.1 }),
            (bar * 4 + at) * (60 / bpm),
            0.32,
          );
      });
      // Lead hook in the back half.
      const hook = [
        [16, 74, 0.5],
        [16.5, 77, 0.5],
        [17, 79, 0.75],
        [18, 77, 0.5],
        [18.5, 74, 1.25],
        [20, 74, 0.5],
        [20.5, 77, 0.5],
        [21, 81, 0.75],
        [22, 79, 0.5],
        [22.5, 77, 1.25],
        [24, 74, 0.5],
        [24.5, 77, 0.5],
        [25, 79, 0.75],
        [26, 82, 0.5],
        [26.5, 81, 1.25],
        [28, 79, 0.5],
        [28.5, 77, 0.5],
        [29, 76, 0.75],
        [30, 73, 0.5],
        [30.5, 76, 1.25],
      ];
      let previous = null;
      const leadNotes = hook.map(([at, midi, length]) => {
        const note = [at, midi, length, 0.42, previous];
        previous = midi;
        return note;
      });
      const beat = 60 / bpm;
      for (const [at, midi, length, vel, from] of leadNotes) {
        mixWrapped(
          loop,
          lead(midi, length * beat * 0.92, {
            fromMidi: from && Math.abs(from - midi) <= 3 ? from : null,
            bright: 1,
          }),
          at * beat,
          vel,
        );
      }
      // Drums: kick, snare on 2 and 4, eighth hats, a crash on the top and a fill at the end.
      drumLoop(
        loop,
        bpm,
        [
          ...every(2, beats, "k", 0.9),
          ...every(2, beats, "k", 0.55, 1.5),
          ...every(2, beats, "s", 0.75, 1),
          ...every(0.5, beats, "h", 0.55),
          ...every(1, beats, "h", 0.8, 0.5),
          [0, "x", 0.35],
          [16, "x", 0.25],
          [30, "t1", 0.6],
          [30.5, "t1", 0.55],
          [31, "t2", 0.6],
          [31.5, "t2", 0.65],
        ],
        seed,
      );
      return wrapEffect(loop, (x) =>
        reverb(x, { size: 0.35, damp: 0.55, mix: 0.08, tail: 0, scale: 0.7 }),
      );
    },
  },
  {
    name: "loop-music-result",
    group: "Music",
    target: -20,
    mode: "integrated",
    loop: bars(100, 4),
    render: (seed) => {
      const bpm = 100;
      const beat = 60 / bpm;
      const loop = new Float32Array(samples(bars(bpm, 4)));
      // Oom-pah: tuba on 1 and 3, brass chords on 2 and 4. F | C | Bb | C-F.
      const plan = [
        { oom: [41, 48], pah: [65, 69, 72] },
        { oom: [36, 43], pah: [64, 67, 72] },
        { oom: [34, 41], pah: [65, 70, 74] },
        { oom: [36, 41], pah: [64, 67, 70] },
      ];
      plan.forEach(({ oom, pah }, bar) => {
        mixWrapped(loop, tuba(oom[0], beat * 0.8), bar * 4 * beat, 0.7);
        mixWrapped(loop, tuba(oom[1], beat * 0.8), (bar * 4 + 2) * beat, 0.6);
        for (const at of [1, 3])
          mixWrapped(
            loop,
            brass(pah, beat * 0.35, { attack: 0.012, release: 0.08, bright: 0.8 }),
            (bar * 4 + at) * beat,
            0.28,
          );
      });
      // A strutting glockenspiel melody.
      const melody = [
        [0, 72],
        [0.5, 77],
        [1, 81],
        [2, 79],
        [2.5, 77],
        [3, 79],
        [4, 76],
        [4.5, 79],
        [5, 84],
        [6, 82],
        [7, 79],
        [8, 77],
        [8.5, 81],
        [9, 86],
        [10, 84],
        [10.5, 82],
        [11, 81],
        [12, 79],
        [13, 76],
        [13.5, 79],
        [14, 77],
      ];
      sequence(
        loop,
        bpm,
        melody.map(([at, midi]) => [at, midi, 0.5, 0.42]),
        (midi) => glock(midi, 0.7),
      );
      drumLoop(
        loop,
        bpm,
        [
          ...every(1, 16, "k", 0.45),
          ...every(2, 16, "s", 0.45, 1),
          ...every(0.5, 16, "h", 0.4),
          [15, "s", 0.3],
          [15.5, "s", 0.4],
          [0, "x", 0.2],
        ],
        seed,
      );
      for (const at of [0, 8]) mixWrapped(loop, cowbell(0.6), (at + 3.5) * beat, 0.35);
      return wrapEffect(loop, (x) =>
        reverb(x, { size: 0.45, damp: 0.5, mix: 0.12, tail: 0, scale: 0.8 }),
      );
    },
  },
];

export const SOUNDS = [...ui, ...foundry, ...fight, ...transitions, ...ambience, ...music];
export { SR };
