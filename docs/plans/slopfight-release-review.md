# SlopFight release review — 2026-10-10

The thermo-nuclear review covered the complete unfinished implementation:
Convex boundaries and phase progression, deterministic simulation, rendering,
controllers, audio, and the integration harness. Parallel backend, simulation,
and rendering reviewers inspected the combined work.

## Correctness fixes

- Forge calls use the critical Workpool, keeping concurrent AI work bounded.
- Drawing writes reject stale sequence numbers and enforce both 400 strokes
  and 25,600 simplified points per layer. The phone uses the same limits,
  supports Undo/Clear when full, and can still submit the saved drawing.
  A serialized-size test covers all four fighters and all three layers.
- Failed drawing restores surface an error instead of silently becoming a
  blank drawing. Pending flush promises settle when the controller unmounts.
- Delayed recap and modifier jobs use each fight's frozen champion sheets.
- BUILD and FOUNDRY deadlines preserve the final champion reveal.
- New SlopFight endpoints have return validators and champion storage is typed.
- Replay cache identity includes champion content, preventing stale playback
  after an upgrade that keeps the same name.
- Shader preparation uses owned material prototypes and supported
  `compileAsync` calls. Recurring title geometry is prepared ahead of time;
  effect buffers and materials have explicit disposal.
- CPU and WebGL traces identified synchronous first-use shader compilation.
  Preparation now includes the transparent, unfogged health-bar materials
  and double-sided confetti. Confetti initializes its matrices and colors
  before the first paint, avoiding a transient uncolored shader variant.
- A captured real-room reproduction isolated the remaining first-fight stall:
  Rapier's cold solver and Three.js's initial per-vertex skin bounds. A
  disposable contact-and-joint world now warms the solver during loading.
  Conservative bounds derived from bone transforms replace the redundant
  vertex pass, including separated limbs and scaled bones. The same captured
  transition fell from 112.4 ms to 24.9 ms, with no long main-thread tasks.
- The rooftop ringout camera now follows fighters below the platform instead
  of clamping its height. Matched before/after captures verify the landing
  sequence. Blender MCP inspected the rooftop GLB's camera anchors and deep
  geometry (61 meshes, 25,464 triangles); no model changes were needed.
- Prefetched audio loads no longer issue a duplicate fetch when creating the
  audio context also starts bank decoding.
- Mouth placement includes the muzzle surface, preventing a downward anchor
  ray from attaching a grin to the torso. A regression uses the real forged
  panda's anatomy; fresh panda, dog, and raccoon views verify the correction.
- Backend tests drain one timer asynchronously and settle dynamic imports
  between steps. The former synchronous timer pump raced Workpool watchdogs
  while action modules were still loading. The shared helper also covers jobs
  and rematch tests; module-preloading workarounds were removed. Existing
  assertions and timeouts are unchanged.
- Test concurrency is bounded at four workers. This avoids cold Convex and
  Rapier transforms competing for the entire five-second test budget; all
  tests still run with their original assertions and timeout limits.

## Maintainability

The simulation's 2,045-line fight module was separated into construction,
collision, motion, hit resolution, and view projection. All 24 captured
outcomes and sampled replay/outro hashes remain identical. Face rendering,
creature layout, backend tests, UI fixtures, audio loops, and the integration
script now have separate modules with concrete ownership.

Creature tests separate mesh/rig/animation behavior from recognizability, with
all existing assertions preserved. Fixture outcome construction is separate
from the authored fight night; all 39 fixtures and the finished-night view
retain the same complete JSON fingerprint. Blender's primitive geometry and
materials are separate from scene composition, preserving all 40 original
function/class bodies.
Blender MCP regenerated all four GLBs byte-for-byte identically, and the
existing node/geometry verifier passed, including all 26 props.

Narration is separated into line contracts, authored templates, deterministic
beat planning, and timing/speech scheduling. The public exports and runtime
function bodies are unchanged, with 45 narration and voice tests passing.
The forge probe's input corpus is separate from its provider runner; all 51
inputs and 48 raster outputs are preserved.

The sound recipe catalog remains large deliberately: it contains 45 authored
sound recipes, while synthesis and instruments already live in separate
modules. It is a content catalog, not a control-flow abstraction.

Shared AI execution, presence, and sound interfaces were also reviewed for
regressions. The stage uses the canonical optional room hook instead of
catching exceptions from a required-context hook.

## Verification

The integration harness now fails on missing hashes, incomplete frame data,
failed required phone interactions, heavy controller bundles, browser errors,
and non-aborted network failures. It records capture intervals separately from
game frame timings. Synthetic report tests exercise both passing and failing
evidence, including missing samples and capture interference.

Final release gates passed:

- `vp check`: zero errors (74 existing renderer/compiler warnings).
- `vp test --run`: 100 files, 1,139 tests; three consecutive full-suite passes,
  including two fresh runs of the default command.
- Integration-report regressions: 16 tests passed.
- `vp run build`: successful optimized Next.js build and TypeScript check.
- Convex code generation and the dev deployment completed successfully.

The clean live run used Free Play room `8PCW9B`, from 20:30:07 to 20:39:02 UTC
on 2026-10-10. It completed 29 phase changes and all six fights across the
rooftop, flooded garage, and kitchen. All 409 instrumented phone operations
succeeded; all six TV replay hashes matched the stored outcomes. Both phone
bundle checks covered 78 scripts with no Three.js or Rapier code. There were
zero browser errors and zero non-aborted network errors (three canceled
requests and two Three.js deprecation warnings).

| Fight | Average fps | Entry max (ms) | First contact max (ms) |
| --- | ---: | ---: | ---: |
| Round 1, first | 233.5 | 37.6 | 19.0 |
| Round 1, second | 232.8 | 20.9 | 17.0 |
| Round 2, first | 228.9 | 29.1 | 41.6 |
| Round 2, second | 234.3 | 25.0 | 16.7 |
| Third place | 233.9 | 34.8 | 25.5 |
| Final | 233.3 | 33.3 | 14.8 |

These measurements used Chromium, ANGLE/D3D11, an RTX 5090, and a 1920×1080
TV viewport. The run passed the 58 fps minimum, 20 ms p95, and 50 ms clean
entry/contact gates. Forging averaged 234.7 fps and the podium 233.9 fps.
All measured windows were complete and free of screenshot/video overhead.

The guest phone disconnected during round two; the game still reached the
podium on normal timers. Visual inspection confirmed the final replay and the
complete no-WebGL recap. The harness waits for the join form's mount focus
before filling it, preventing SSR input from racing hydration.

Local evidence is in `output/playwright/slopfight-final-acceptance-2/`
(`log.json`, `timeline.txt`, phone and TV captures). Earlier filmed signature
moments, matched ringout-camera captures, and the cold-entry CPU/GL traces are
retained in `output/playwright/`. Production publication follows these gates.

## Scope retained

Fight pacing is unchanged. The existing aggression ramp and deterministic
outcomes were preserved; balance changes need player feedback across more
matchups. Browser phone emulation verifies interaction and bundle boundaries;
it does not measure performance on a physical phone. Free Play integration
does not exercise paid narration.
