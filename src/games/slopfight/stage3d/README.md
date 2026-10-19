# SlopFight stage (stage3d)

One persistent R3F canvas for the whole game. Phase scenes render inside it;
they reach the clock, director, transitions, crowd and post-fx through hooks.
Nothing is drawn as DOM over the canvas (the loading card and the dev
readout are the only exceptions).

## Entry points

- `stage-root.tsx` (default export `StageRoot`): the lazy stage that
  `ui/index.tsx` loads with `next/dynamic` (`ssr: false`). It reads the room
  via `useRoom()` (R3F v9 bridges context into the canvas) and builds a
  `StageInput` with `stageInputFromView`. Outside a room it shows the lobby in
  the default arena. `?quality=high|medium|low` pins a tier; `?debug=1` shows
  the frame-time readout.
- `stage-canvas.tsx` (`StageCanvas`): the canvas itself. Props: `input`,
  `quality`, `toggles` (post), `debug`, `services` (bring your own),
  `children` (extra scene content), `scene` (replace the phase scene),
  `overlay` (dev DOM). It fills its container (`absolute inset-0` by default).
- `stage-input.ts`: `StageInput` = phase, `phaseKey` (changes on every phase
  change), arena, `arenaOrder` (preloading), round, step, roomCode,
  `clockOffsetMs`, `phaseStartedAt`, `live`.

## Frame order (useFrame priorities)

| priority | what |
| --- | --- |
| -100 | `StageLoop`: `clock.tick`, quality sampling |
| 0 | scene content (yours goes here) |
| 0.5 | `CameraRig`: `transitions.update`, `director.update/apply` |
| 0.52 | the face-off's notes wall, placed for the camera on air |
| 0.55 | `ui3d/FaceCamera` (billboards: plates, cards) |
| 0.56 | the face-off's spotlit card (camera-fixed) |
| 0.6 | `SlamTitle` (camera-fixed) |
| 0.61 | `fight/hud.tsx` `FightHud`: the fight's health bars along the top (camera-fixed) |
| 0.62 | `ui3d/Caption`: `voice.tick()`, The Voice's lower third (camera-fixed) |
| 0.7 | `PostStack` uniforms |
| 0.8 | contact-shadow depth pass, after animated transforms |
| 1 | EffectComposer renders |

Animate with `clock.elapsed` / `clock.delta` (presentation time: freezes in
hit stop, slows in slow-mo). Use `clock.realDelta` only for UI that must not
slow down.

## Shader and title preparation

`program-cache.ts` owns a bounded set of real toon, skinned, instanced,
outline, eye and mouth materials. `ProgramKeeper` prepares them with
`WebGLRenderer.compileAsync` after the arena's lights mount, using a linear
render target to match the postprocessing composer. The materials stay alive
through phase changes and are disposed when the arena changes or the canvas
unmounts. No renderer program counts or other Three.js internals are modified.

`SlamTitle` builds the fixed fight titles before their first appearance and
keeps their geometry mounted. A slam selects a title by visibility; it does
not extrude the same words again. The title light remains present at zero
intensity between slams, so its activation does not change shader variants.
Fight VFX dispose their materials, geometry and instanced buffers on unmount.

Creature rendering separates the ordered body layout (`creature/render-layout.ts`)
from face placement, geometry operations, tuning and typed contracts. The
face rig (`creature/face.ts`) owns placement and animation; `face-materials.ts`
owns eye shaders, style data and mouth textures. These boundaries preserve
the skeleton and visual geometry used by the simulation and mesher.

## Services and hooks (`services.tsx`)

`useStage()` returns the `StageServices` for the canvas. Shortcuts:
`useStageClock`, `useDirector`, `useTransitions`, `useCrowd`, `usePostFx`,
`useStageEvents`, `useQuality()` (re-renders on a rung change),
`useArenaNodes()` (re-renders on a set swap; null while loading).

- `services.impact({ point, strength, big, hitStopFrames })`: the whole feel
  package for one contact. It runs a hit stop (4 frames), the impact frame
  (one white flash plus radial lines toward `point`), and a shake scaled by
  `strength`. A `big` hit adds slow-mo (0.3x for 0.5 s) and a punch-in. Scenes
  still choose the shot; for a big hit, request `impact_pop`.
- `services.cheer(strength)`: the crowd erupts and a `cheer` event fires.
- `services.edgeAlerts.{N,E,S,W}`: 0..1 alert tint on the floor-edge lights
  (ON THE EDGE). +z (front) is S, -z is N, +x (right) is E.
- `services.wind`: `{ x, z, strength, driven }` for the laundry and windsock.
  Set `driven = true` and drive it from `windFor` / `windStrengthAt`;
  otherwise the arena runs idle gusts.
- `services.live`: mirrors `input.live` (set by the canvas). It is true in
  a live room, and false in the recap and in fixtures rendered as the recap.
  Play scene sounds through `stageSfx(services).play(name, opts)`
  (`ui3d/sound.ts`), which is silent unless `live`.
- `services.voice` / `useVoice()`: The Voice service (below).

### The Voice (`ui3d/voice.ts`, `ui3d/caption.tsx`, `ui3d/voice-narration.tsx`)

Each stage has one `VoiceService`, and it holds one `Voice`
(narration.ts) per game. `VoiceNarration` keys it to
`<room.id>:<room.gameNumber>`, so a rematch gets a fresh Voice; outside
a room the seed is `"slopfight"`.

Every line shows as a caption on the stage's single `<Caption>`. Every
line also feeds `<SlopfightNarrator lines prefetch>`, together with the
prefetches. The canvas renders the narrator once, in the DOM beside the
canvas, and it gates itself to the host with TTS on. Scenes never render the
narrator or a caption themselves.

- `voice.voice`: the game's `Voice`. Write lines with its beat methods:
  - `arenas`, `forged`, `upgradeReveal`
  - `lineup` (the roster's one line for the round), `faceOff`
  - `fightStart`, `fight`, `result`
  - `standings`, `upgrade`, `podium`
- `voice.say(lineOrLines)`: a live beat (a forge finished, the roster,
  the standings). Lines are queued so they never talk over each other:
  - The most important waiting line goes first.
  - A line goes up `SAY_LEAD_MS` (600 ms) after it is released. Its voice
    is prefetched at once, so TTS has that long to arrive.
  - Each line waits `SAY_GAP_MS` (700 ms) after the previous speech ends.
  - A line that waited more than `SAY_STALE_MS` (12 s) is dropped.
  - Saying the same line again (same `key`) does nothing, so it is safe
    to call from an effect.
- `voice.schedule(timedLines)`: lines with their own moment, for example
  a fight's plan:
  `voice.schedule(timeFightLines(voice.voice.fight(fight, events), fight.startsAt))`.
  - `at` is in presentation-clock ms, which are server ms.
  - Keys that are already scheduled or shown are ignored.
  - After a clock jump only the newest due line shows, and a line more than
    2.5 s late is not shown.
- `voice.prefetch(lineOrLines)`: warms TTS without a caption (the fight's
  opening call during FACE_OFF).
- `voice.cancel(match?)`: drops waiting lines, all of them or the ones
  that match (a fight skipped mid-plan).
- `voice.dropQueued()`: drops the live beats still waiting their turn. The
  stage calls it at the cover of a phase change that changes scenes, so a
  backlog (forge lines) never spills into the next scene; lines already
  released keep their moment.
- `voice.hideCaption()`: flicks the current caption away now.
- `voice.waiting`: how many lines are still queued or scheduled.

A caption stays up for `max(2.6 s, speechMs(text) + 0.9 s)`, or until the
next line falls due.

### Clock (`director/clock.ts`)

The presentation clock follows server time (`clockOffsetMs`):
`now = serverNow() - debtMs`.

- `hitStop(frames)` and `slowMo({ scale, durationMs, rampInMs, rampOutMs })`
  add to the debt. Speed ramps happen only inside slow-mo windows.
- `pause()` and `resume()`.
- `resync()` pays the debt off (returns the ms skipped and fires a `resync`
  event). You rarely call it yourself. It happens automatically:
  - on every director cut made while the clock is `settled` (no hit stop,
    slow-mo or pause running). A big hit's `impact_pop` cut lands during
    the slow-mo, so the debt is repaid on the cut back to the base shot.
    Match cuts never repay (they promise continuity).
  - on every phase cover (PhaseScene).
- In FIGHT, keep cutting: each small hit's hit stop adds ~4 frames of debt,
  and only a cut repays it. If `debtMs` climbs past ~1 s with no cut coming,
  request one (e.g. `fight_close`). On a `resync` event, settle the skipped
  span of sim playback without replaying its effects (no new hit stops).
- Read `elapsed`, `delta`, `realDelta`, `scale`, `frozen`, `slowMotion`,
  `paused`, `settled` and `debtMs`.

### Director (`director/director.ts`, `director/shots.ts`)

Shots:
- spec shots: `crane_establish`, `walk_on_track`, `face_off_low`,
  `fight_wide`, `fight_close`, `impact_pop`, `ragdoll_follow`, `edge_drama`,
  `slowmo_orbit`, `winner_pose`, `podium`
- anchor holds: `easels`, `foundry`, `roster`, `scoreboard`, `anchor` (with
  `{ anchor: "Cam_*" }`)

Each shot reads its framing from the set's `Cam_*` anchors.

- `director.setBase(shot, req)` sets the shot to return to (the phase
  default).
- `director.request(shot, { targets, priority, hold, side, focus, force, ttl })`
  returns one of:
  - `cut`
  - `queued`: inside the 1.2 s minimum shot length, so it waits
  - `refreshed`: the same shot, so the hold extends
  - `ignored`: a higher-priority shot is holding
  Targets are `Vector3 | Object3D | () => Vector3 | null`.
- An `impact_pop` that cannot cut punches in instead.
- `shake(0..1)` adds trauma (square law). `punchIn()` zooms in 10%.
- Constant drift: `director.driftScale = 0` locks it off.
- Letterbox and DoF follow the shot: `face_off_low` and `winner_pose` are
  letterboxed; DoF is on hero shots only, and off while a slam is up.
- Two-shots (`director/framing.ts`): `fight_wide` and `fight_close` on two
  targets (the conductor's `pair`: both torsos and the taller fighter's
  `subjectHeight`) frame the pair's box inside `FIGHT_SAFE`, under the HUD
  and over the caption, at a set share (`TWO_SHOTS` in `shots.ts`). They
  turn toward side-on to the line between the fighters (the close shot
  nearly all the way, the wide part of the way from its anchor) and keep A
  on the left across cuts in the director's `ShotMemory`. `fight_close` on
  one target, or with `from`, keeps its old three-quarter framing (the deep
  drop's landing shot).
- `director.targets` and `director.subjectHeight`: this frame's resolved
  targets, read by the caption to keep off the fighters.
- `edge_drama` is the spec's low angle from outside the edge, except over a
  shallow drop (under 1.5 m from the platform top to `surround.y`, i.e. the
  garage's water). There it rises to chest height (0.95) and looks down over
  the rim, because from floor height a 0.35 m pad face does not read as a
  drop.
- Every cut repays the clock's debt when the clock is settled (see Clock).

### Transitions (`director/transitions.ts`)

`transitions.play(kind, opts)` returns a promise that resolves when the
transition ends. `opts.onCover` runs at the covered moment, which is where
you swap what is underneath. `opts.freezeAt` (0..1) stops the timeline, for
screenshots.

- `slam`: `{ text, sub?, color?, edgeColor?, holdMs?, shake? }`. A
  camera-fixed, lit, extruded 3D title.
- `wipe`: `{ color?, angle?, coverMs?, holdMs?, revealMs? }`. Wavy halftone
  band in the arena accent.
- `letterboxIn` / `letterboxOut`: `{ ms? }`.
- `iris`: `{ target, radius?, full?, closeMs?, holdMs?, openMs?, color? }`.
  Closes on a world point.
- `matchCut`: `{ to, request?, target, seconds? }`.
- `cut`.

Nothing fades to black.

### Post (`look/post.tsx`, `look/post-fx.ts`)

The stack runs in this order:
1. Bloom (emissives only: the threshold sits above lit surfaces)
2. DoF (hero shots)
3. Chromatic aberration (impact frames only)
4. ACES
5. Grade (contrast, saturation, tint) and vignette
6. Stage fx (letterbox, iris, wipe, impact frame)
7. SMAA on high; FXAA on every lower rung

Direct control goes through `usePostFx()`: `setLetterbox(0..1, seconds)`,
`setDof(strength, focus)`, `impactFrame(point, strength)`.

### Quality (`look/quality.ts`)

| rung | tier | post | shadow map | contact shadows | mesh grid | max DPR |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | high | full | 2048 | 512 | high | 2 |
| 1 | medium | reduced | 2048 | 512 | high | 1.5 |
| 2 | medium | minimal | 1024 | 256 | high | 1.5 |
| 3 | low | minimal | 512 | 256 | low | 1 |

Auto mode drops one rung after two 2 s windows with a median frame over
20 ms. It never steps back up. Read `useQuality().meshResolution` /
`.meshGrid` for creature meshing.

Contact shadows capture only opaque meshes marked `castShadow`, so outline
hulls, UI overlays and transparent effects never project solid silhouettes.
The receiver uses the canonical platform's top rectangles: shadows stop at
the rim and leave the kitchen sink open. Capture runs after animation so it
tracks the fighters in the same frame; depth testing keeps the nearest
underside when casters overlap. Capture then restores renderer and mesh state.

## Arena (`arena/`)

`ArenaSet` loads `/models/slopfight/{garage,kitchen,rooftop}.glb` and
preloads the next arena. It dresses the set:
- the toon material (`look/toon.ts`) on vertex-coloured meshes
- outlines (`look/outline.ts`) on props and crowd
- HDR glow on `*_Emissive`
- the water shader on `Hazard_Water`
- Collision hidden, and the podium hidden until FINISHED

It also animates the set: laundry and windsock in the wind, toast pops, the
sink drip, floaters, grounded crowd breathing/turning and staggered cheer
jumps. Cheers use absolute timestamps for anticipation, takeoff and landing,
so their poses agree across frame rates and freeze with presentation time.
Only exact garment nodes animate; their outline children inherit the motion.

Practical illumination stays constant. Emissive surfaces can vary slowly by
at most 10%, without the old abrupt dropouts. Each arena's `Probe_Ambient`
provides Blender-baked diffuse sky and reflected scenery colour through a
single SH light probe (`look/irradiance.ts`), replacing its hemisphere on all
quality tiers and in recap replays. Local baked vertex AO supplies contact
detail. This is a coarse single-bounce approximation with no extra draw calls
or textures; arenas without a probe keep their hemisphere.

Authored practicals replace the broad key/rim lights: rooftop ring floods,
a cool garage fluorescent and a warm kitchen pendant. Softer surrounding light
keeps attention on the fight while preserving each room's atmosphere. Only the
main practical casts a shadow (`Light_Ring_Key`, `Light_Tube` or `Light_Pendant`);
its allocation follows quality changes (2048 to 512). The shared
`ArenaPracticals` renderer also supplies the same cones to recap replays,
without replay shadow maps. `light_phases` keeps the smaller build/upgrade and
foundry work lights off during fights. `StageLighting` receives the phase from
the canvas so changing phases does not require reloading the set. Garage water
reflections omit phase-only lights, so inactive station lamps do not glow in
the water or displace the visible work lamp from the four-light budget.
If the arena asset fails to load, a basic directional light keeps the canonical
stand-in and fighters visible until the authored practicals are available.

Blender's `sf_surface` mesh extra selects a shared matte, satin, gloss or toy
material. These profiles vary the toon uniforms, so concrete, metal and
enamel can respond differently without adding shader variants.

`useArenaNodes()` gives the typed registry (`arena/nodes.ts`):
- `cameras.Cam_*`
- `floor`, `floorBounds`, `edge`, `pit`
- `marqueeText`, `scoreboardText` (plane markers: width, height, colours)
- `easels[i].canvas/avatar`, `pedestals[i].top/color`, `podium.tops`
- `marks.roster` and `marks.faceOff.{A,B}`
- `crowd`, `lights`, `emissives`, `edgeLights`, `hazards`
- `get(name)` for any node

In development the set is checked against `arenas.ts` (Floor top at y = 0,
6 x 6 footprint); gaps are logged. A set that fails to load falls back to a
stand-in built from `platformColliders`.

## Text (`ui3d/text.tsx`)

- `StageText`: SDF text (troika) in Fredoka, lit, shadowed, with a tinted
  outline. Use a size of at least 0.12 to stay readable from 3 m.
- `TitleText`: an extruded, bevelled title built from the WOFF outlines
  (`ui3d/font-geometry.ts`, kerned; tables inflated with the pure-JS fflate
  that ships in three, so it works without `DecompressionStream`). If the
  font fails to load or parse, it falls back to a flat `StageText` title.
- `OnPlane plane={nodes.marqueeText}`: places children on a set's plane
  marker.
- `fitTextSize(text, width, maxSize)`.
- Both run `sanitizeStageText` on their text. It replaces curly quotes
  and dashes with plain ones, strips accents, and drops anything the Latin
  font cannot draw (such as emoji), so troika never fetches CDN fallback
  fonts.

The rest of the in-scene UI kit is documented, every prop of every
component, in `ui3d/README.md`:
- cards and their parts: Card, Chip, PipRow, MoveRow
- tokens and labels: AvatarToken, NamePlate, FaceCamera
- live readouts: Bar, ClockRing, Caption
- effects: Confetti

To read the room inside the canvas, use `useRoomOrNull()`
(`ui3d/room.ts`). The room context is bridged into the canvas; in a lab
with no room the hook returns null.

## Phase scenes (`scenes/`)

Register a scene in `scenes/registry.ts`:
`PHASE_SCENES.FIGHT = FightScene`. It receives `{ input, nodes }`.

`PHASE_DIRECTION` in `phase-scene.tsx` sets each phase's marquee text, base
shot and entry transition (slam / wipe / cut); `slamFor` builds a slam from
the room (the face-off's title and names). The canvas calls
`useStagedPhase`, which plays the entry transition when `phaseKey` changes
and, at the cover, cuts to the base shot, resyncs the clock and drops the
Voice's queued beats when the scene changes. Until that cover the stage
keeps showing the phase it is leaving (its scene, lighting and set) on the
room as it last was (`StagedRoom`), so the new scene mounts under the cover
instead of the old one popping out before it. Phases in one scene group
(BUILD, FOUNDRY and UPGRADE share the forge floor) keep their scene mounted.
Set `ownsDirection: true` to run your own (FOUNDRY does: the forge floor
turns to the foundry itself). `PlaceholderScene`, `MarqueeSign` and
`ScoreboardSign` are reusable. `useBaseShot` (fight scenes) sets a base shot
with live targets at once, or at the cover when a transition is still
covering.

### The non-fight scenes

| phase | scene | files |
| --- | --- | --- |
| LOBBY | `LobbyScene`: the room sign, the join card, a seat per player with their token, the how-to steps, the START button on the host's stage, and the back-wall sign (tonight's seats). | `lobby.tsx`, `lobby-bridge.tsx` |
| BUILD, FOUNDRY, UPGRADE | `ForgeFloorScene`: an easel per player (the live doodle, "Describing...", the rejection note, the sketch that dissolves once sent), and a pedestal per fighter (the lump, the shimmer, parts popping in, the name card). It cuts to the foundry for each beat, and once every player's champion is in (after the last drawing's peel, `foundryTurnAt`) the base stays on the foundry, so FOUNDRY and the reveals play there. Lines: the arenas at BUILD, the upgrade call at UPGRADE, and one per finished forge. | `forge-floor.tsx`, `easel.tsx`, `forge.tsx`, `forge-plan.ts`, `doodle-texture.ts`, `doodle-material.ts`, `fx.tsx` |
| ROSTER | `RosterScene`: the line-up on the roster wide. All four champions hop off their pedestals and walk to their roster marks together, a step apart; each card rises behind its mark as the champion arrives. The Voice says one line for the round (`lineup`: who opens it, the Final's double points). | `roster.tsx`, `walk.ts`, `champions.tsx` |
| STANDINGS | `StandingsScene`: the back-wall scoreboard. Rows slide from their order before the round, then the points count up, and the leader's row turns gold. Figurines walk the shelf into rank order. The Voice names the leader, or calls a tie. The columns and figurines stay inside the part of the board `Cam_Scoreboard` can see (see below). | `standings.tsx`, `scoreboard.tsx`, `board.ts`, `board-visibility.ts` |
| FINISHED | `PodiumScene`: the podium crane, then fanfare and confetti cannons. The champions stand on the steps (the winner showboats), and each runner-up hangs under a place card, slid outward until it clears the marquee's lines in the final framing. The Voice calls the podium. The camera visits the FINAL SCORES board at 15 s, then every 22 s. In the recap, the recap reel mounts after the crane. | `podium.tsx`, `clearance.ts`, `scoreboard.tsx`, `champions.tsx` |

How the scenes are built:
- Only the forge floor's FOUNDRY sets `ownsDirection`. They keep the
  stage's base shot and entry transition, and add transient
  `director.request` cuts for their beats.
- Shared helpers are in `common.tsx`: `useSceneData`, `usePhaseSeconds`,
  `SceneMarquee`, the node lookups, `fighterColor` and `yawToward`.
- `scene-data.ts` (pure) turns the room view and the feeds into
  `SceneData`: fighters in slot order with owners, the standings and the
  podium.
- Timing and layout logic is pure and tested in `scenes.test.ts`:
  - `walk.ts`: walk paths and the roster schedule
  - `board.ts`: the rows before and after the round, the slide and the
    count-up
  - `forge-plan.ts`: the part pop cadence and who stands on a pedestal
  - `beds.ts`: the music per phase
  - `dev-feed.ts`: the synthetic doodles and part streams
  - `board-visibility.ts` (`visibleSpan`) and `clearance.ts`: the
    scoreboard's visible span and the podium cards' slide
- The scoreboard is laid out against what the shot sees. A set can put a
  prop between `Cam_Scoreboard` and the board (the rooftop's neighbouring
  parapet covers its lower right). `boardVisibility()` tests segments from
  the shot's eye, at the start and at the end of its push, to sample points
  on the rows and the shelf. It tests only the set's triangles inside the
  box that holds the eyes and the board, takes about 2 ms, and is cached per
  set. The text columns and the figurines then sit inside the visible span,
  and the strips still run behind the prop. The board's title is centred,
  clear of the props that sets tape to its corners (the kitchen's tape).
- Each scene owns its `Creature`s, standing or walking (`champions.tsx`).
  Footsteps and hop landings play `tap` and `boing`.
- `forge-floor.tsx` calls `warmMesher()` from `creature/creature` on
  mount, so the mesher workers are warm before the first forge streams.

### Feeds (`feeds.ts`)

Easel strokes and the foundry's streamed parts are not in the room view:
- `useStageStrokes()` and `useStageFoundry()` subscribe to
  `api.slopfight.stage.strokes` and `.foundry` only in a live room.
- Fixtures and the recap read strokes from the view's `doodles`.
- A `DevFeedProvider` feed wins over everything (the labs).
- Without a feed, a FORGING fighter in a fixture grows from a synthetic part
  stream. `useSceneData` loads `dev-feed.ts` with a dynamic `import()` only
  then, so the sample champions stay out of the production stage chunk.

Stroke rows are immutable once streamed. The easel paints each
`layer:seq` row once, so a feed must never re-send a row with more
strokes in it.

### Lobby bridge and sound beds

- `ui/stage.tsx` wraps the canvas in `LobbyBridge`
  (`scenes/lobby-bridge.tsx`, DOM only). It runs the shell's lobby hooks:
  - the join and leave sounds
  - Enter or Space on the host's stage presses START
  The bridge shares the result with the in-canvas lobby through
  `useLobbyStage()`.
- The bridge's element tree never changes shape: one context provider,
  with the canvas always its last child. Only the hook-holding
  `LobbyDriver` mounts in LOBBY and unmounts after START, so a phase change
  never remounts `StageRoot` (GL context, services, clock and arena).
- `ui/stage-effects.tsx` plays the beds on live stages only. It applies
  `PHASE_MUSIC` (`scenes/beds.ts`) through `sfx.music`, sets the
  arena's ambience, and runs a crowd murmur loop in the lobby. Everything
  stops on unmount.
- In-scene beats go through `stageSfx(services)`, which is silent unless
  `services.live`.

## Events (`events.ts`)

`useStageEvents().on(name, fn)` delivers these events: `cut`, `transition`
(start / cover / end), `slam`, `impact`, `slowmo`, `cheer`, `resync`
(`{ droppedMs }`). The audio layer hooks here.

## First-use preparation

The stage starts `fight/warmup.ts` once while loading. A disposable Rapier
world executes contact and joint solver paths that WASM initialization alone
does not warm. It uses no champion data or hidden fight seed and always frees
the world.

`creature/bounds.ts` unions the rest sphere transformed by each bone. These
conservative bounds include separated ragdoll limbs and blended skin vertices,
without Three.js skinning every vertex on the first draw. Body and outline
share the updated bounds.

`program-cache.ts` owns material prototypes across phase changes and compiles
them against the actual arena lights. Titles prepare their recurring geometry
before use; confetti initializes matrices and colors before its first paint.

## Failure containment (`boundary.tsx`)

`StageBoundary` (`label`, `fallback`, `resetKey`) keeps one failing part
from taking the canvas down; it warns once per label. In place:
- a set that fails to load: the stand-in set
- a registered phase scene that throws: `PlaceholderScene`, retried on the
  next phase
- the title font: the flat title (`TitleText`), and nothing for the warm-up
  and the slam title

The canvas also wraps the phase scene, `scene` and `children` in their own
Suspense, so a font or model that never arrives cannot block the canvas or
hold the loading card. Troika (`StageText`) never resolves a font that 404s:
that text stays hidden, but nothing else is affected.

## Dev lab

`/dev/slopfight/stage` takes these query params:
- `arena`: `garage`, `kitchen` or `rooftop`
- `phase`, `shot`, `anchor`, `transition`
- `at`: freezes the transition there (0..1)
- `quality`
- `nopost`: comma list
- `preview=dof|chromatic|stageFx`: temporarily use a hero shot or hold a hit/wipe for A/B comparisons
- `drift=0`, `ui=0`, `debug=1`

Keys: `[` and `]` cycle shots, `r` replays.

The lab shows the actual quality rung and disables effect switches that its
budget withholds. Choosing a tier pins it; choosing auto resumes adaptation
from that rung. Preview returns to the selected shot when set to Current scene.
DoF is idle on fight-wide shots, chromatic is normally brief and hit-driven,
and the slam title is 3D geometry rather than the screen-space stage-FX layer.
In development, `window.__slopPost()` exposes the composer's active passes and
effective switches; the renderer's tone mapping is off because the stack owns ACES.

`/dev/slopfight/scenes` renders the real stage (`StageRoot` with every
registered scene) inside a static room, using a synthetic clock and a dev
feed (`scenes/dev/scene-lab.tsx`). Query params:
- `fixture=<slopfight fixture id>`: any Controller fixture's view
- `scenario=forge`: BUILD, with every player drawing or describing,
  submitting and forging live
- `players=2..4`: the number of humans (lobby, forge)
- `arena=garage|kitchen|rooftop`
- `t=<seconds>`: start this far into the timeline. A negative `t` gives
  the assets time to load before a timed beat.
- `fresh=1`: a fixture's phase starts at the lab's `t=0`
- `recap=1`: not live (no sounds, no podium lines; the recap's podium)
- `host=0`: the lobby as a guest sees it
- `then=<fixture id>&switch=<s>`: at lab time `switch` seconds, change to
  that fixture's view, with its phase starting then (for example START from
  the lobby). `window.__sceneLab.canvas` holds the stage canvas from load,
  so a script can check that the phase change kept it.
- `quality`, `debug=1`
