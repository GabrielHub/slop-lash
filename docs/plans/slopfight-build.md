# SlopFight build plan and checklist

The orchestrator's working file for building [`slopfight.md`](./slopfight.md)
end to end. The spec is the intent; this file records the decisions made while
building it, the module contracts agents build against, file ownership, and the
checklist. Update it as work lands. When this file and the spec disagree, this
file wins (it records a deliberate decision).

## 1. Decisions (deviations from and clarifications of the spec)

1. **Physics runs on `@dimforge/rapier3d-deterministic-compat@0.21.0`
   directly, not `@react-three/rapier`.** `@react-three/rapier@2.2.0` pins the
   non-deterministic `@dimforge/rapier3d-compat@0.19.2`. The fight sim is a pure
   TypeScript module that owns its Rapier world and exposes poses; the renderer
   reads poses. Probe (2026-10-10): two runs of a 20-body, 1800-step world in
   Node produced bit-identical positions in about 200 ms.
2. **The server runs the canonical fight.** The spec has the host stage report
   the result. Instead a Convex Node action runs the same sim as soon as a
   fight's inputs are final (both sheets and the matchup notes) and stores the
   outcome, the event log and a health timeline on the fight row. Every stage
   replays the identical sim from the same inputs for display, starting at the
   fight row's `startsAt` server time. This removes the "wait for a stage"
   deadline, host-report failover and the live `health` patches: phones play
   the stored health timeline against the same clock. The FIGHT phase lasts the
   fight's real length plus an outro. The seed and the outcome reach clients
   only once FIGHT starts, after bets close.
3. **Sim code never calls `Math.random`, `Date`, `performance`, or the
   transcendental `Math` functions** (`sin`, `cos`, `tan`, `atan2`, `exp`,
   `log`, `pow`, `hypot`, `cbrt`), whose results can differ between JS engines.
   It uses `sim/dmath.ts` (polynomial approximations), `Math.sqrt`, `Math.abs`,
   `Math.min/max/floor/round/sign` and a seeded PRNG (`sim/prng.ts`). Iteration
   order is fixed (arrays, never object-key or Set order of untrusted keys).
4. **The drawing is rasterized on the server from the stored strokes** in the
   forge action (pure-TS rasterizer plus `node:zlib` for the PNG). The PNG is
   never stored and never leaves the action. One path covers a phone submit, the
   lenient forge at the Build deadline (no phone in the loop), upgrades and
   retries. The phone's submit is a mutation that schedules the forge.
5. **Heavy data stays out of `views.room`.** Strokes (one row per stroke batch)
   and in-flight forge parts are served by dedicated queries that only the
   stage subscribes to, so phones drawing at 4 Hz do not resend the room view
   to every client.
6. **Arenas are built by headless Blender scripts** in
   `scripts/slopfight/blender/` (the live Blender MCP is not connected; Blender
   5.2.1 runs headless at
   `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`). They export
   GLBs to `public/models/slopfight/` and render preview PNGs for review. The
   arena's play geometry is canonical in code (`src/games/slopfight/arenas.ts`)
   because the server sim never loads a GLB; the Blender sets are built around
   it.
7. **Every game uses all three launch arenas** in a seeded order; the Final is
   the third.
8. **Palette and face are fixed vocabularies**, not free hex. The model picks
   named toy colours that the renderer maps to tuned values.
9. **The Voice is always captioned in the scene.** TTS plays only where the
   narrator is allowed (never Free Play). Captions make every narration beat
   present in the Free Play E2E.
10. **Sound is rendered offline by a checked-in synth script** (no ffmpeg or
    Fal key locally), then played through an extended `src/lib/sounds.ts`
    (pitch jitter, loops, a music bus with ducking).
11. **House champions are fighters with no owner, not AI player seats.**
    SlopFight sets `supportsAiPlayers: false`; the mode creates the house
    fighter rows itself.
12. **Models:** a new catalog entry for Claude Sonnet 5.5
    (`anthropicModelId: "claude-sonnet-5-5"`) is added for routing and pricing
    but hidden from every player and persona picker. SlopFight pins Haiku 5.5
    at `high` reasoning with Sonnet 5.5 at `medium` as the fallback, in every
    room including Free Play.

## 2. Module map and ownership

Pure, headless, tested logic lives in `src/games/slopfight/` and never imports
three.js, React or Convex. Everything three.js lives under
`src/games/slopfight/stage3d/`, which is only ever reached through one
`next/dynamic` import. Convex code lives in `convex/slopfight/`.

| Path | What | Owner workstream |
|---|---|---|
| `src/games/slopfight/sheet.ts` | zod schema + types for the champion sheet, validation, balancing | Foundation |
| `src/games/slopfight/vocab.ts` | traits, toy colours, eyes, mouths, prop tags, phone palette | Foundation |
| `src/games/slopfight/arenas.ts` | arena catalog: names, play geometry, hazards as data | Foundation |
| `src/games/slopfight/modifiers.ts` | modifier keys, ranges, trait effects, note capping, `resolveModifiers` | Foundation |
| `src/games/slopfight/constants.ts` | timers, budgets, limits | Foundation |
| `src/games/slopfight/tournament.ts` | pairings by human count, seeding, Final pairing | Backend |
| `src/games/slopfight/scoring.ts` | fight and bet points | Backend |
| `src/games/slopfight/strokes.ts` | stroke encoding, validation, coalescing helpers | Foundation |
| `src/games/slopfight/raster.ts` | strokes → RGBA → PNG bytes (zlib injected) | Forge |
| `src/games/slopfight/body/` | anchor resolution: sheet → rest skeleton (bones, radii, mirror pairs) | Creature |
| `src/games/slopfight/sim/` | deterministic fight sim, brains, damage, event log | Sim |
| `src/games/slopfight/ai/` | prompts, few-shots, forge/house/matchup/recap call wrappers | Forge |
| `src/games/slopfight/narration.ts` | The Voice: event → line from pools + templates | Sound |
| `src/games/slopfight/samples.ts` | ~30 hand-written sample sheets for dev, tests, tuning | Creature (Sim may add) |
| `src/games/slopfight/ui/index.tsx` | `GameUi` (light; lazy Stage) | Foundation, then Stage |
| `src/games/slopfight/ui/controller/` | phone screens (React, no three.js) | Controller |
| `src/games/slopfight/stage3d/creature/` | mesher worker, skinning, toon creature, face, wobble, rig, procedural animation | Creature |
| `src/games/slopfight/stage3d/look/` | toon material, outlines, lighting rig, post stack, quality flags | Stage core |
| `src/games/slopfight/stage3d/arena/` | GLB loading, named nodes, practicals, crowd | Stage core |
| `src/games/slopfight/stage3d/director/` | shot system, phase scenes, transitions | Stage core, Stage scenes |
| `src/games/slopfight/stage3d/ui3d/` | SDF text, cards, bars, marquee, scoreboard, easels, pedestals | Stage scenes |
| `src/games/slopfight/stage3d/fight/` | live sim playback, pose → creature, impact fx | Fight scene |
| `scripts/slopfight/blender/` | arena + prop generation scripts | Arenas |
| `scripts/slopfight/sfx/` | offline synth for the sound set | Sound |
| `public/models/slopfight/` | arena and prop GLBs | Arenas |
| `public/sfx/slopfight/` | sound files | Sound |
| `convex/slopfight/` | tables, mode, play mutations, forge pipeline, jobs, sim action, view | Backend |
| `src/app/dev/slopfight/` | dev stage route: creature gallery, forge playback, seeded fights | Creature, then Fight scene |

Shared files touched outside these paths (registries, `src/lib/ai/*`,
`src/lib/models.ts`, `src/lib/sounds.ts`, `src/room/*`) are listed per
workstream; only that workstream edits them.

## 3. Contracts

### 3.1 Champion sheet (`sheet.ts`, `vocab.ts`)

The model's structured output (the forge result):

```ts
ForgeResult = {
  verdict: "FORGE" | "REJECT";
  rejection: { reason: string /* ≤ 80 chars, kind */; suggestion: string /* ≤ 80 */ } | null;
  champion: Champion | null; // null exactly when verdict is REJECT
}
```

`Champion`, in generation order (schema property order is the streaming order,
so parts arrive before the name card):

| Field | Type | Notes |
|---|---|---|
| `bodyPlan` | `BIPED \| QUADRUPED \| MULTIPED \| HOPPER \| SLITHER \| FLIER` | |
| `palette` | `{ primary, secondary, accent }` of `ToyColor` | ~20 named colours in `vocab.ts` with tuned hex values |
| `parts` | `Part[]`, 1–40 | streamed; torso first, then head, legs, arms, extras |
| `face` | `{ eyes: EyeStyle; mouth: MouthStyle }` | decals on the head (or torso when headless) |
| `item` | `PropTag \| null` | the held item; an `item` part marks where it is held |
| `stats` | `{ heft, reach, chaos }` 1–5 | code balances to sum 9 |
| `moves` | exactly 3 × `{ name ≤ 28; type: STRIKE \| GRAPPLE \| TRICK; power 1–5; delivery: arm \| leg \| head \| tail \| item \| body }` | code balances power to sum 9 and forces ≥ 2 types |
| `traits` | 2–4 × `Trait` | ~40 tags in `vocab.ts` |
| `temperament` | `{ aggression, caution, showboating }` 0–1 | |
| `name` | string ≤ 24 | the model's choice always; honors a name in the input |
| `bio` | string ≤ 120 | |
| `narration` | `{ walkOn[2], landHit[3], takeHit[2], win[2], lose[2], ringOut[2] }` strings ≤ 60 | house voice |

`Part = { id: string ≤ 16; role; shape; size; elongation; parent: string | null;
anchor: Anchor | null; color: "primary" | "secondary" | "accent"; mirror: boolean }`

- `role`: `torso | head | leg | arm | wing | tail | horn | ear | fin | spike | item`.
- `shape`: `capsule | sphere | cone | box`. `size`: `S | M | L | XL`.
  `elongation`: `stubby | normal | long`.
- `anchor` (on the parent): `top | bottom | front | back | left | right |
  leg1..leg8 | arm1..arm4`. Exactly one torso, with `parent: null,
  anchor: null`; every other part has both.
- `mirror: true` adds a mirrored copy across the creature's midline. Legs and
  arms on `legN`/`armN` anchors are already placed in left/right pairs by the
  resolver (odd left, even right, front to back), so they set `mirror: false`.

Code, not the model, enforces budgets: `balanceChampion()` deterministically
rescales stats and powers to their sums and fixes the move types, clamps
temperament, trims strings, dedupes traits. `validateChampion()` reports
structural problems (no torso, two torsos, > 40 parts, unknown parent, cycle,
duplicate id) for the one repair call. `parsePartialParts()` turns a streamed
partial object into the longest valid prefix of parts for live growth.

Derived, never asked of the model: `armCount` (0, 2 or 4 from the parts),
`maxHealth = 80 + 10 × heft`, `scale` (from heft and the `tiny`/`huge`
traits), the sheet hash (stable JSON → FNV-1a, used as the mesh cache key and
in the sim seed mix).

As built (structured-output limitation): Anthropic's decoder enforces types,
enums, nullability and property order but not `minimum`/`maximum`, string
lengths or array counts, and the AI SDK validates the final output against the
full zod schema, so an enforced limit the model overshoots would fail the whole
call. The zod schemas in `sheet.ts` are therefore model-facing and lenient:
stats and powers are the enum `1 | 2 | 3 | 4 | 5`, temperament is a plain
number, and every length and count (name ≤ 24, parts 1–40, exactly 3 moves,
2–4 traits, narration counts, rejection ≤ 80) is stated in `.describe()` text
only. Always run `balanceChampion()` (and `normalizeRejection()`) on a parsed
result; it enforces all of them and is idempotent. Extras beyond the list
above: `validateChampion()` also reports `empty_id`, `missing_parent`,
`missing_anchor`, `torso_has_parent` and `too_few_moves` (`forgeResultProblems()`
adds verdict/champion consistency); `balanceChampion()` turns extra torsos
into `tail` segments, hangs orphans on the torso with default anchors, pads
missing moves with filler moves of the missing types, drops the later of
conflicting traits (`tiny`/`huge`, `cowardly`/`relentless`,
`sleepy`/`caffeinated`), and sets `item: "thing"` when an `item` part has no
tag. `PropTag` includes `thing` for held objects that match no other tag.

### 3.2 Strokes (`strokes.ts`)

`Stroke = { c: 0..5 (phone palette index) | 6 (eraser); w: 1 (fixed brush); p:
number[] }` with points as flattened integer pairs in a 0..1000 square, at most
256 points per stroke after simplification. A stroke batch row holds up to 8
strokes; a doodle holds at most 400 strokes. `layer` is 0 for Build and the
round number for an upgrade's strokes.

As built: the 400-stroke cap is per layer (`strokeRoom`). The fixed brush is
24 grid units wide and the eraser 56 (`BRUSH_WIDTH`, `ERASER_WIDTH`); the
canvas colour is `DRAWING_CANVAS_HEX` in `vocab.ts`. Strokes paint in order
(layer, then seq), and the eraser paints the canvas colour over earlier layers
too. Undo after a stroke has been sent needs a backend mutation; the stroke
contract has no undo marker.

### 3.3 Arenas and modifiers (`arenas.ts`, `modifiers.ts`)

`ArenaId = "FLOODED_GARAGE" | "KITCHEN_COUNTER" | "ROOFTOP"`. Each arena:
`name`, `mood`, `accent` colour, `ringOutLanding` (`splash | clang | thud`),
`geometry` (the 6 × 6 platform, top at y = 0, centred on the origin, plus any
pit rectangles such as the kitchen sink; a torso below y = −0.6 or outside the
volume is rung out), `hazards` (two or three, each with card text and data
effects), and `dynamic` hazards the sim implements by id (`wind`,
`waterLanding`, `counterCrack`).

`ModifierKey`: `strikePower | grapplePower | trickPower` (additive −2..+2),
`damageDealt | damageTaken | knockbackDealt | knockbackTaken | speed |
staggerResist | hurtbox` (multipliers within ranges), `reach` (additive
−1..+1), `selfDamageOnHitTaken` (flat 0..20), and immunity flags
`grappleImmune | strikeKnockbackImmune | pushImmune`. `MatchupNote = { side: A
| B; modifies: ModifierKey; value: number; reason: string ≤ 60 }`.
`resolveModifiers(sheetA, sheetB, arena, notes)` folds trait effects, arena
hazards and notes into one clamped `FighterModifiers` per side, with a per-side
cap on the notes' total advantage so a note tilts a fight and never decides
it.

As built:
- Units, shared by trait effects, hazard rules and `MatchupNote.value`:
  additive keys take points, multiplier keys take a percent change (`speed:
  15` is ×1.15), `selfDamageOnHitTaken` takes HP, flags turn on for any value
  above 0. Per-note ranges: powers ±2, reach ±1, multipliers ±30,
  self-damage ±15. Code applies at most the first 4 notes, in order.
- The cap: each key has an advantage weight (`MODIFIER_SPECS`; about one
  point per percent of fighting strength, Strike +1 = 8). A note that helps
  its side or hurts the other spends the helped side's budget of
  `NOTE_FAVOR_CAP = 15`; past it a numeric note is scaled down and a flag is
  dropped. `resolveModifiers` returns the applied notes (effective value,
  `capped`, `dropped`) so the face-off cards can show what actually applies.
- Trait effects may target the foe (`spiky`: foe Grapple −1).
  `FighterModifiers` also carries `brain` (`retreatsWhenLow`,
  `neverRetreats`, `showboatsAfterHit`, `erratic`, `slowStarter`,
  `berserkWhenLow`) and `hazards`, the dynamic hazard ids the sim applies to
  that fighter (wind is left out for `pushImmune` fighters).
- Geometry axes: y up, +z downstage toward the default camera, A spawns at −x.
  Each edge is `open`, `lip` (the garage's curb) or `wall` (the kitchen's
  backsplash closes its back edge, so the drops there are the sink, upstage
  centre, and the other three edges). `platformColliders()` gives the static
  boxes (slab tiled around pits, basin, lips, walls), `isRingOut()`,
  `ringOutDistance()` and `isOverFloor()` the tests, and `windFor(seed)` /
  `windStrengthAt()` the gusts (axis-aligned direction, ramped envelope, no
  trig).

### 3.4 Fight sim (`sim/`)

```ts
interface FightInput { seed: number /* uint32 */; arena: ArenaId; a: Champion; b: Champion;
  notes: MatchupNote[]; limitMs: number /* 30000, or 20000 for house vs house */ }
interface FightOutcome { winner: "A" | "B"; method: "KO" | "RINGOUT" | "DECISION" | "SUDDEN_DEATH";
  endMs: number; health: { A: number; B: number }; maxHealth: { A: number; B: number };
  events: FightEvent[]; healthTimeline: Array<[ms: number, a: number, b: number]>; hash: string }
loadRapier(): Promise<Rapier>            // memoized init of the deterministic build
runFight(R, input): FightOutcome         // headless, to completion
createFight(R, input): FightSim          // stepwise, for the stage
interface FightSim { readonly tMs: number; readonly done: boolean;
  step(): FightEvent[];                  // one fixed 1/60 s step; events emitted this step
  pose(side): FighterPose; live(side): FighterLive; outcome(): FightOutcome | null; dispose(): void }
```

`FighterPose` carries the physics proxy bodies (`{ key, p: [x,y,z], q:
[x,y,z,w] }`, keyed by part id), the root (torso) transform, facing, and an
animation hint (`locomotion`, gait phase, speed, `intent`, the active move
index and its 0..1 progress, `ragdoll` weight). The creature renderer blends
procedural animation with the proxies by the `ragdoll` weight.
`FightEvent = { t: ms; kind; side; ... }` with kinds `start, contact, windup,
hit, whiff, stagger, getup, grab, throw, dodge, counter, edge, ringout, ko,
selfDamage, showboat, suddenDeath, timeout, end`; `hit` carries `move`,
`type`, `damage`, `knockback`, `big`, `point`. The health timeline samples at
4 Hz plus every change. Determinism test: two `runFight` calls with the same
input produce deep-equal outcomes; the `hash` covers the event log and final
body transforms.

### 3.5 AI (`ai/`, `src/lib/ai/`)

- `src/lib/ai/run.ts` gains `runStructuredStream(task, options & { output;
  onPartial(partial) })`, guarded like `runStructured` (a `wrapStream` attempt
  guard), returning the same `AiRunResult`.
- Tasks in `src/lib/ai/tasks.ts`: `slopfight.forge` (high, streamed, critical
  pool), `slopfight.house`, `slopfight.matchup`, `slopfight.recap`.
- `forgeChampion({ mode: "submit" | "lenient" | "upgrade" | "house", text?,
  png?, previous?, addition?, arenas, keys, deadline, onPartial })` →
  `{ ok: true, result: ForgeResult, calls } | { ok: false, failReason, calls }`.
  It runs Haiku high, one repair call on structural problems, then Sonnet
  medium; a Haiku `refused` on a player forge returns a REJECT result with a
  kind reason instead of falling back.
- `inventHouseChampions({ arenas, count })` → descriptions;
  `writeMatchup({ a, b, arena })` → `{ notes, walkOn: [lineA, lineB] }`;
  `writeRecapLine({ a, b, outcome })` → one line.

### 3.6 Backend data and phases (`convex/slopfight/`)

Tables (all with a `by_gameId…` index, all listed in `GAME_TABLES`):

- `slopFightState` (one per game): `arenas[3]`, `seed`, `pairings` per round,
  `totalFights`.
- `slopFightFighters`: `slot 0..3`, `ownerId | null`, `inputKind DRAW |
  DESCRIBE | null`, `text`, `status` (`EMPTY | DRAWING | DESCRIBING | FORGING
  | READY | REJECTED | FAILED`), `forgeToken`, `attempt`, `partial` (streamed
  parts, cleared when READY), `champion` (current sheet), `previous` (the
  sheet before the latest upgrade), `rejection`, `version` (0 at Build, round
  number after an upgrade), `record` (wins, losses, health left).
- `slopFightStrokes`: one row per stroke batch: `fighterId`, `layer`, `seq`,
  `strokes`.
- `slopFightFights`: `round`, `step`, `a`/`b` fighter ids, `arena`, `notes`,
  `walkOn`, `seed`, `startsAt`, `outcome` (with events and timeline),
  `recapLine`, `hype { A, B }`, `isFinal`, `isThirdPlace`.
- Bets: rows in a `slopFightBets` table (`fightId`, `playerId`, `side`) rather
  than the shared `votes` table, which has no kind field and is keyed to
  SlopLash prompts.

Phases: `BUILD → FOUNDRY (watchdog, only if a forge is unfinished) → ROSTER →
[FACE_OFF → FIGHT → RESULT] × fights in the round → STANDINGS → UPGRADE →
FOUNDRY? → ROSTER → … → FINAL`. Round 3 plays the third-place fight first and
the Final last. The FIGHT phase is a watchdog sized to `startsAt + endMs +
outro`. A forge that fails on both models parks FOUNDRY (no deadline) with a
host retry.

### 3.7 Screens

- `GameUi` gains optional `ownsLobby?: boolean` (the shell renders `ui.Stage`
  and `ui.Controller` in LOBBY too, keeps one scene key, and skips the game
  start title card) and `chrome?(view): { stageRail: boolean; phoneBar:
  boolean }` so the SlopFight stage is one full-bleed canvas with the shell's
  header and countdown hidden. The host dock and the phone ⋯ menu stay.
- The ⋯ sheet gains a `HostExtras?: ComponentType` slot for the forge retry.
- The SlopFight `Stage` is `next/dynamic(() => import("../stage3d/stage-root"),
  { ssr: false, loading: <plain loading card> })`. The controller and lobby
  routes never fetch the 3D chunk; the build check greps the controller's
  chunks for `WebGLRenderer`.

## 4. Rules for every agent

- Read `AGENTS.md`, this file, and the spec sections named in your brief.
  Codebase maps from the exploration pass are in the session scratchpad
  `map/*.md` (engine, ai, views-schema, frontend-shell, sound-narrator,
  dev-fixtures, toolchain, matchslop).
- Stay inside your owned paths. If you need a change elsewhere, make the
  smallest one and report it.
- Other agents are editing the tree at the same time. Do not revert, format or
  "fix" files you do not own. If a check fails only because of another
  workstream's in-progress files, say so instead of editing them.
- Use `vp` for everything (`vp test <path>`, `vp check`, `vp exec tsc
  --noEmit`). Do not run `vp install`/`vp add` (Foundation installs every
  dependency up front); ask the orchestrator in your report if one is missing.
- Never push, never deploy Convex prod, never set or print secrets.

## 5. Checklist

- [ ] Foundation: deps, `SLOPFIGHT` registered end to end with stubs, contracts
      (sheet, vocab, arenas, modifiers, constants, strokes), shell flags
- [ ] Creature: anchors, mesher, toon look, rig and animation, `/dev/slopfight`
      gallery with growth playback
- [ ] Forge: streaming call, prompts and few-shots, rasterizer, Sonnet entry,
      dozens of inputs judged (texts and doodles, bad ones included)
- [ ] Sim: deterministic ragdolls, brains, moves, damage, hazards, determinism
      test, pacing stats
- [ ] Arenas and props in Blender
- [ ] Backend mode: tables, phases, forge pipeline, house, matchup, recap, sim
      action, bets, hype, scoring, seeding, view, cleanup, Free Play, rematch,
      tests
- [ ] Stage: canvas root, look, arena, director, in-scene UI, every phase
      scene, transitions, crowd, podium
- [ ] Controller: draw, describe, rejection, forge card, bet, hype, result,
      upgrade, host retry
- [ ] Sound and narration
- [ ] Integration: dev Convex E2E with 2 humans and timers on, every signature
      moment, 60 fps, controller bundle free of three.js
- [ ] `vp check`, `vp test`, `vp run build` clean
