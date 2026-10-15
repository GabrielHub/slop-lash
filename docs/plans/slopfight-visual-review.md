# SlopFight visual review — 2026-10-15

The strongest gains came from correcting surface shading and compositing while
preserving the toy-diorama art direction. Review covered the three arenas, the
real fight scenes, stage fixtures, long labels and portrait framing.

## Implemented

| Finding | Change | Cost |
| --- | --- | --- |
| Kitchen cabinets flickered with diagonal patterns | Normalized reversed slab bounds in Blender, restoring outward face winding and valid bevels | Kitchen +736 triangles (3.1%) |
| Rooftop facade overlapped the floor slab | Ended the facade at the slab underside | No extra triangles |
| Broad panels looked inflated; floor tiles caught rows of bright dots | Baked face-area weighted normals; authored matte, satin and gloss finishes, with restrained practical-light highlights | Same mesh/draw counts; shared shader program |
| World effects drew black silhouettes over The Voice's caption | Put camera-overlay materials in the transparent render queue with explicit ordering | No new render pass |
| Contact shadows lagged, could disappear during blur, and could cover pits | Capture after animation, place the blur quad inside its camera, filter solid casters and use the canonical platform footprint | Same depth/blur pass count; fewer eligible casters |
| Minimal quality dropped all anti-aliasing | Retain FXAA below the full SMAA tier | One inexpensive anti-aliasing effect |
| Low quality still meshed creatures at full resolution | Connect the quality grid to creature meshing and cache identity; quality changes do not trigger forge growth animation | Reduces low-tier geometry; high tier stays at 64 cells |

## Initial asset validation

All four GLBs were authored/exported through Blender MCP and independently
re-imported for verification. All 127 non-mesh anchors, node counts, mesh counts,
floor dimensions and collision contracts remain unchanged. Repeat exports are
byte-identical. Total download growth is 11,728 bytes.

| Asset | Triangles after |
| --- | ---: |
| Garage | 25,122 |
| Kitchen | 24,254 |
| Rooftop | 25,464 |
| Held props | 8,472 |

The Blender pipeline now checks primitive winding and weighted normals, and
propagates Python failures as nonzero exit codes. See
[the asset pipeline](../../scripts/slopfight/blender/README.md) and
[the rendering contract](../../src/games/slopfight/stage3d/README.md).

## Initial validation evidence

Generated evidence is local/ignored:

- `output/slopfight-assets/`: GLB contract checks, geometry regression output,
  before/after structural comparison and repeat-export hashes.
- `output/playwright/slopfight-visual/`: matching arena before/after screenshots,
  caption/portrait screenshots, high/low quality-switch evidence, checks, tests
  and production-build logs.
- `output/playwright/slopfight-visual-live/`: the full two-player game report,
  replay hashes, performance measurements, controller checks and recap captures.

The initial 1600×900 high-tier arena checks held approximately 60 fps before and
after the pass on this development machine. This is a desktop browser check,
not a measurement on a physical phone, and does not establish spare GPU capacity.

Final validation:

- `vp check`: 0 errors, 72 warnings.
- `vp test`: 103 files / 1,147 tests passed.
- `vp run build`: passed.
- Full development game `B2FH8V`: 30 phase changes, all six fights, all three
  arenas, upgrades, phone disconnect, podium and both WebGL/non-WebGL recaps.
  All six replay hashes matched; all 404 phone mutations succeeded; no console
  or network errors and no heavy controller scripts. The two console warnings
  were Three.Clock deprecation notices; three network requests were aborted.
- At 1920×1080 on the development RTX 5090, each clean fight window measured
  about 240 fps, with 4.2 ms median and 4.3 ms p95 frame intervals. This is not
  an apples-to-apples speedup over the earlier 60 Hz fixture capture and is not
  a physical-device performance claim.
- Browser high → low → high switching reduced the two sample fighter bodies
  from 8,546/9,508 vertices to 3,464/4,046, restored the originals, and produced
  no page errors. The held prop stayed at 316 vertices.

Runtime changes received independent code and visual review. No blocking
findings remain. Changes are local; no production deployment was performed.

## Baked shading and close-up detail follow-up

The follow-up adds deterministic local ambient shading through Blender MCP.
Twenty-four hemisphere rays sample nearby geometry, with distance falloff and
darkening capped at 18% in the authored sRGB vertex colours. Moving objects,
invisible collision geometry, emissive surfaces and hidden podium pieces do not
cast permanent baked shading. Each held prop bakes independently because its
library node shares the origin with the other props.

The shading changes existing vertex colours only: AO/no-AO exports have identical
position, normal and index bytes, vertex counts, mesh counts and textures. Large
flat faces remain free of stretched corner shadows. Export restores the source
colours afterward, and repeat builds remain byte-identical.

The detail pass improves the knife's pinned handle and blade edge, the briefcase's
panel seams and hardware, the boxing glove's rounded silhouette and cuff, and the
trumpet's hollow bell and valves. Set details include the faucet and aerator,
toaster controls and vents, work-lamp cage and rooftop AC grille. All additions
are merged into existing meshes. A small protruding knife edge was found in the
paired Blender render review and corrected before the final export.

| Asset | Final triangles | Added in this follow-up |
| --- | ---: | ---: |
| Garage | 25,354 | 232 |
| Kitchen | 25,032 | 778 |
| Rooftop | 26,208 | 744 |
| Held props | 9,330 | 858 |

The three arenas remain below 30,000 triangles. Only the briefcase, boxing glove
and trumpet use the new explicit 800-triangle cap; the other props stay below
500. The four downloads together grew by 102,636 bytes (about 100 KiB) from the
initial corrective pass. All 127 non-mesh anchors and collision contracts remain
unchanged.

### Post-effect diagnosis

The composer was running correctly. The user's open preview was on low L3 even
though the expensive effect preferences were checked. Low quality omits bloom,
depth of field and chromatic aberration. Separately, `fight_wide` has no depth of
field, chromatic aberration appears on hits, and the slam title is 3D geometry
rather than a screen effect.

There was a real quality-control bug: selecting a tier changed the rung but did
not change the controller's automatic/pinned mode. Manual selection now pins the
tier, and Auto resumes adaptation from the current rung. The lab displays the
effective quality, disables unavailable effects, identifies the SMAA/FXAA
anti-aliasing fallback, and offers reversible held effect previews. The production
effect strengths and defaults remain unchanged.

Actual in-app browser clicks also exposed a lab URL update inside a React state
updater, which triggered a Router/StageLab render warning. URL synchronization
now runs in a committed effect. All quality buttons, effect toggles, previews
and reload persistence were verified with both console-error and page-error
capture; neither reported errors after the correction.

Frozen checkbox comparisons confirm that all seven switches change rendered
pixels when their effect is active. The expected composer passes and ACES effect
were inspected directly. A slam remains visible with screen effects disabled,
as intended.

### Performance and verification

The controlled comparison uses the same runtime, camera, 1920×1080 viewport and
browser. Request interception substitutes the first-pass GLBs for the baseline;
the new GLBs then run under identical settings. GPU timer queries bracket the
whole frame, including contact shadows and post-processing. Draw counts sum all
passes rather than reporting only the final fullscreen draw. Each sample includes
180 GPU frames after warm-up. Blender and the other test browsers were closed.

| Arena | High GPU median, before → after | High draw calls | Low GPU median, before → after | Low draw calls |
| --- | --- | ---: | --- | ---: |
| Garage | 0.330 → 0.326 ms | 147 → 147 | 0.131 → 0.132 ms | 119 → 119 |
| Kitchen | 0.386 → 0.383 ms | 150 → 150 | 0.185 → 0.187 ms | 122 → 122 |
| Rooftop | 0.341 → 0.346 ms | 165 → 165 | 0.146 → 0.147 ms | 137 → 137 |

Median frame intervals remained about 16.6 ms. High-tier GPU p95 varied from
0.354–0.587 ms across the pairs, including higher tails for the new garage and
rooftop samples; no speedup is claimed. These measurements are from an RTX 5090
desktop, not a physical mobile device. They establish a small desktop cost, not
the same headroom on every target device.

- `vp check`: passed, 0 errors and 72 existing warnings.
- `vp test`: 104 files / 1,151 tests passed.
- `vp run build`: passed.
- Blender geometry, ambient-shading and GLB contract checks passed. All four
  final assets reproduce byte-identically; six paired close-up renders were
  independently reviewed.
- Matching runtime before/after/no-AO views were reviewed for all three arenas.
  The completed development game's recap and real replays across all three
  arenas loaded with the new assets without page errors.

Evidence is in `output/slopfight-assets/ao/`,
`output/slopfight-assets/hero-comparison/` and
`output/playwright/slopfight-fidelity2/`. The latter includes the repeatable GPU
benchmark, per-frame summaries, real-game replay screenshots and frozen post
comparisons under `post/comparison.html`.

Changes remain local; no production deployment was performed. The next useful
performance check is the high tier on the actual target devices before adding
costly screen-space shading or higher shadow-map resolutions.

## Clothesline, nighttime lighting and crowd follow-up

The reported black cloth patches came from `createHazardAnimators` matching
the garment's outline child as well as the garment. The child rotated a second
time and intersected the fabric. Exact contract matching fixes that; a regression
test follows a full gust cycle. The towel also consisted of seven adjoining
closed slabs. Blender now exports a continuous folded shell with matte cloth
finishes, correctly placed dress pegs and enough distance from the audience
to avoid eye/body intersections during jumps and maximum wind. Rooftop geometry
decreases from 26,208 to 26,184 triangles.

Incident lights are now steady. The old 14 Hz dropout function is replaced
with slow emissive-only variation, bounded to 10% even at maximum authored
strength. The shared presentation `hash01` also returned signed values despite
promising 0..1; unsigned conversion fixes negative crowd delays and out-of-range
noise. Simulation randomness and recorded fight inputs are separate.

Blender bakes 3,072 environment samples into one nine-coefficient RGB diffuse
light probe. It includes sky, emissive surfaces and a coarse single reflection
from lit static scenery. This gives cool sky fill and warm reflected colour on
both moving characters and scenery. It replaces the rooftop hemisphere with no
extra texture, mesh or pass. It is a global single-bounce approximation, not
dynamic ray-traced GI. The direct rig is balanced around the softer fill.

The crowd now breathes and shifts its weight slowly while grounded. Cheers
have varied delays, a preparatory crouch, a hop and a soft landing; a few
spectators add a smaller second hop. No frame-dependent random jumps or abrupt
energy-driven phase changes remain. Reset restores position, scale and facing.
Replay arenas use the same crowd animation and rooftop probe.

### Verification

- `vp check`: 0 errors, 72 existing warnings.
- `vp test`: 106 files, 1,160 tests passed, including equal poses at 30/120 Hz,
  continuous landing scale, grounded idle, hit-stop freeze, rest restoration,
  unsigned noise, bounded emissives and valid shipped SH lighting.
- `vp run build`: passed.
- Blender GLB contract: 67/67 required rooftop nodes; repeated MCP builds are
  byte-identical (SHA-256 `96a1fe9abcf4412632790baf8ef8d625340677810f3703197305c1f37ec079ef`).
- Close-up gust and jump poses reviewed in both wind directions. A 120-second
  presentation-time sweep measured zero intensity change across eight incident
  lights and zero independent rotation of the five cloth outlines.
- All three arenas checked at high and low quality, real recap replays switched
  across all arenas, and a 390×844 phone viewport checked without console/page
  errors. Probe on/off screenshots confirm its rendered contribution.

At 1920×1080 on the same RTX 5090/D3D11 browser, the rooftop's 180-sample GPU
median is 0.352 ms before and 0.350 ms after; p95 is 0.366/0.363 ms. Median draw
calls remain 165, with 70 geometries, 38 textures and 38 programs. Median frame
interval stays 16.5 ms. Final high-tier GPU medians are 0.329 ms for garage and
0.385 ms for kitchen; low-tier medians are 0.153/0.131/0.186 ms for
rooftop/garage/kitchen. These are desktop measurements, not physical-phone
performance claims. No meaningful desktop regression was observed.

Evidence: `output/playwright/slopfight-night/` and
`output/slopfight-assets/night-*.{json,log}`. Changes remain local.

## Fourth pass: stadium-style nighttime focus

Two Blender-authored floodlights now cross-light the ring, replacing the
rooftop's global directional key and rim. Dim moonlight, darker city windows
and reduced terrace illumination leave the audience visible while concentrating
the brightest surfaces on the fighters and platform. The indirect probe was
rebaked around the aimed cones, their falloff and occlusion; the blue platform
now contributes more bounce than the dark sky.

Smaller work lights on the same masts illuminate the easels during BUILD/UPGRADE
and the pedestals during FOUNDRY, then switch off for fights. Their exposure is
limited so printed names remain legible. Masts stand outside the station camera
sightlines. Recap replays use the same authored practical-light renderer.

Only the ring key casts shadows. Live quality changes now compare the actual
shadow render-target dimensions, fixing a stale allocation when R3F had already
updated `mapSize`. Confirmed 2048 -> 512 -> 2048 without reloading. Rooftop
geometry is 26,912 triangles (+728, two mesh batches); floor, collision and
camera anchors are unchanged. No additional shadow pass or lightmap texture.

### Verification

- `vp check`: 0 errors, 72 existing warnings.
- `vp test --run`: 106 files, 1,161 tests passed. Shipped-asset tests verify the
  probe's Y-up response, aimed floodlights, one shadow caster and station phases.
- `vp run build`: passed.
- Blender contract: 71/71 rooftop nodes, under the 30k triangle budget. Repeated
  MCP builds are byte-identical (SHA-256
  `167621afeb6e379a1f89556549f5f6f5e7869e039ebc28824748bf45fab6fffc`).
- Reviewed fight-wide, actual fighters, easels, foundry, roster and podium;
  recorded replays across all three arenas and a 390x844 low-tier viewport.
  No browser errors. The final work-light exposure adjustment was followed by
  a fresh build view and shipped-asset tests.

At 1920x1080 on RTX 5090/D3D11, 180-frame whole-render GPU medians were
0.349 ms before and 0.354 ms after; p95 0.543/0.376 ms. Median frame interval
remained 16.7 ms. Draw calls rose from 165 to 176 (including the changed shadow
frustum); textures and programs stayed at 38 each. Low-tier GPU median was
0.160 ms with 146 calls. This is desktop evidence, not a physical-phone result.
The final adjustment affects only station phases, not the measured fight rig.

Evidence: `output/playwright/slopfight-ring-light/`. Changes remain local.

## Fifth pass: indoor practical lighting

The garage's overhead fluorescent now aims a cool pool of light at the ring.
The caged work lamp and a soft marquee wash provide warm accents, while the
water and outer room stay dim. The kitchen uses a warm pendant over the counter,
softer evening light from its window and a trace of lavender fill. Both replace
the broad directional key/rim with one shadow-casting practical and their own
Blender-baked diffuse probe.

Blender now builds open pendant shades instead of a closed bottom that hid the
bulb. Two smaller kitchen pendants illuminate the drawing and foundry stations;
the garage uses its existing side tubes. Station lights turn on only in their
corresponding phases. They are excluded from the fight bake and static water
reflections, fixing reflections from disabled lamps. Kitchen geometry increases
by 872 triangles to 25,904; garage remains 25,354. There are no new mesh batches,
shadow maps or lightmap textures.

### Verification

- `vp check`: 0 errors, 72 existing warnings.
- `vp test --run`: 106 files, 1,166 tests passed.
- `vp run build`: passed.
- Blender contracts: garage 69/69 and kitchen 73/73 required nodes. Both are
  under the 30k triangle budget and reproduce byte-identically through MCP.
  The generalized bake also reproduces the rooftop byte-identically.
- Reviewed establishing, fight, roster, podium, drawing and foundry views,
  actual fighters, both recorded-game replays and a 390x844 low-tier viewport.
  No browser errors. Live phase switches select the correct station lamp;
  each arena keeps one shadow caster and resizes 2048 -> 512 -> 2048.

At 1920x1080 on RTX 5090/D3D11, 180-frame whole-render GPU medians were
0.332 -> 0.329 ms for garage and 0.388 -> 0.378 ms for kitchen. High-tier p95
rose from 0.345 -> 0.526 ms and 0.405 -> 0.571 ms respectively; no speedup is
claimed. Median frame intervals stayed 16.6 ms. Draw calls increased from
147 -> 150 and 148 -> 158; texture counts stayed at 38. Low-tier GPU medians
were 0.133/0.177 ms. These are desktop measurements, not physical-phone results.

Final SHA-256:

- Garage: `74feee79f30adc7f1c1e747b0ea6ffc61642d167e520f58f4949e52dd4dc8f8b`
- Kitchen: `d63329fa0455815e936fabbb4038076ad852ce38d411bed0b8893c0dba46371b`

Evidence: `output/playwright/slopfight-indoor-light/`.

## Final review and simplification

Reviewed the complete asset, rendering, animation, quality and UI diff before
release. Consolidated shadow-map resizing into one hook, removed the obsolete
emissive-channel import from the lighting component, simplified AA selection,
and shared the shipped-asset test parsing and irradiance sampling. These
refactors preserve the tuned visuals and quality behavior.

The review found and fixed one fallback regression: replacing global keys with
asset-authored lights left a missing-asset stand-in almost black. A directional
fallback now illuminates the canonical arena and fighters when no practicals
are available. Verified by intentionally returning 404 for the kitchen GLB;
the normal asset path still uses exactly one practical shadow caster.

After cleanup, `vp check` passed with 0 errors and 72 existing warnings, all
1,166 tests passed, and the production build passed. Blender asset contracts,
geometry normals and winding, and ambient-bake verification also passed.
The optimized build was visually checked in all three arenas and their
recorded-game replays, with no application or rendering errors. The only local
console errors were the expected missing Vercel Analytics script on localhost.
Live quality changes still resize the single shadow map 2048 -> 512 -> 2048.
