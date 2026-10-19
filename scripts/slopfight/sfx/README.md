# SlopFight sound synth

The SlopFight sound set is rendered offline by this script: plain DSP written
here (oscillators, seeded noise, state-variable filters, FM, modal and
Karplus-Strong synthesis, formant voices, saturation, a Freeverb-style reverb,
a look-ahead limiter and BS.1770-style loudness normalization) and encoded to
44.1 kHz mono MP3 with `@breezystack/lamejs`. Direction: cartoon foley with a
chunky synth layer, like a Saturday-morning show scored by someone with one
good synthesizer.

```sh
node scripts/slopfight/sfx/render.mjs                 # render every file
node scripts/slopfight/sfx/render.mjs --only=fight-strike-1,fight-ko
node scripts/slopfight/sfx/render.mjs --wav=<dir>     # also write 16-bit WAVs for inspection
```

It writes `public/sfx/slopfight/<name>.mp3` (96 kbps) and
`public/sfx/slopfight/manifest.json` (duration, bytes, loudness, peak, loop
points). Rendering is deterministic: every sound is seeded from its name, so a
re-run reproduces the files. A full render takes about 6 seconds; the set is
about 1.4 MB. `--only` rewrites just those MP3s and leaves the manifest alone,
so finish with a full render when a sound is added or changes length. After
changing a loop's length, update its loop points in
`src/games/slopfight/audio.ts` (the audio test checks them against the
manifest).

## Files

| Module | Role |
| --- | --- |
| `dsp.mjs` | sources, filters, effects, loudness, limiter |
| `instruments.mjs` | drums, bass, brass, mallets, plucks, foley parts, crowd voices, sequencer |
| `sounds.mjs` | one recipe per file, with its loudness target |
| `render.mjs` | normalize, pad loops, dither, encode, write the manifest |

## Loudness

One-shots are normalized to a momentary-max loudness target (K-weighted,
400 ms windows) under a -1.5 dBFS sample-peak ceiling, limited when needed;
loops to an integrated target. MP3 coding overshoots sharp transients by up to
about 3 dB, so a sound can set a lower `ceilingDb` (the strikes use -4.5 and
`src/games/slopfight/audio.ts` trims them back up in the float graph). Targets: UI -24 to -19, Foundry -21 to -19,
impacts -16 to -13, crowd -18 to -16, transitions -20 to -14, conveyor -27,
crowd murmur -28, ambience -29, music -20. The browser's SFX bus compressor
then evens out stacking; music and ambience run on their own buses.

## Loops

lamejs writes no gapless (LAME/Xing) tag, so a decoder keeps the encoder's
start delay and the loop's first sample lands an unknown 0..4096 samples into
the file. Each loop is therefore stored as `[last 4096 samples][loop][first
4096 samples]`, and playback loops the window `[4096, 4096 + L)` samples
(`loop.start`/`loop.end` in the manifest, in seconds). Any window of exactly
`L` samples inside the padded region is the loop, so it is seamless for any
decoder delay up to 4096 samples. Loop content is made periodic by wrapping
note tails (`mixWrapped`), running filters and reverbs over three tiled
periods and keeping the middle (`wrapEffect`), using modulation with whole
cycles per loop, or crossfading an overrun (`crossfadeLoop`).

## The set

| Group | Files |
| --- | --- |
| UI | `ui-tap`, `ui-confirm`, `ui-tick` (countdown), `ui-bet`, `ui-hype` (a crowd whoop; the player stacks it) |
| Foundry | `foundry-pop-1..3` (part pops), `foundry-inflate` (mesh re-form squeak), `foundry-ding` (name card), `foundry-shimmer` (sketch dissolve), `loop-foundry-conveyor` (4 s) |
| Fight | `fight-strike-1..3` (Strike thwacks), `fight-grapple-lift`, `fight-grapple-slam`, `fight-trick-whiff`, `fight-trick-bonk`, `fight-slowmo`, `fight-thud-1..2` and `fight-boing` (ragdoll), `fight-crunch` (health chunk), `fight-edge-alarm`, `fight-ringout-scream` (slide whistle and a cartoon yell), `fight-finale` (the arena finale sting: a diminished brass stab, two alarm whoops over a timpani and snare roll, the stab a half step up), `finale-tilt` / `finale-flood` / `finale-storm` (each arena's layer under the sting: the counter's squeal, klunk and groan with crockery sliding; a pipe bursting and glugging into a rising surge; a thunder crack and rolling rumble with a howling wind swelling), `land-splash` / `land-clang` / `land-thud` (ring-out landing per arena), `fight-ko` (hit, stab and boxing bell), `fight-win` (fanfare), `fight-lose` (sad trombone), `crowd-cheer`, `crowd-gasp`, `loop-crowd-murmur` (8 s) |
| Transitions | `trans-slam`, `trans-wipe`, `trans-letterbox` |
| Ambience (8 s loops) | `loop-amb-garage` (drips, buzzing tube, water), `loop-amb-kitchen` (clock, fridge hum, a bird outside), `loop-amb-rooftop` (wind, distant traffic, a far horn) |
| Music (loops, F major / D minor) | `loop-music-build` (108 BPM, 4 bars, pizzicato and xylophone), `loop-music-foundry` (100 BPM, 4 bars, machine arp), `loop-music-fight` (160 BPM, 8 bars, chase), `loop-music-result` (100 BPM, 4 bars, oom-pah) |

Hit stop is a gap in the mix, not a file. Audition everything at
`/dev/slopfight/sound`: every cue, loop and file, the bus gains and ducks, and
a scripted fight medley with the Voice's captions. Its "Run decode check"
button (also `window.__slopfightSoundCheck()`) fetches and decodes every file
in the browser, fails any file with samples clipped at full scale after
decode, and checks each loop seam: the audio after the loop end must
match the loop start at a shift of exactly 0 samples.
