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
13. **Every fight ends with an arena finale.** With only the 30 s limit, 44%
    of fights went to a decision on health (tuner, 2,000 fights, 2026-10-19),
    the flattest finish on a TV. In the last `FINALE_MS` (10 s) before the
    limit each arena turns on both fighters: the Kitchen Counter tips toward
    a seeded side edge, the Flooded Garage's water rises and the dry floor
    shrinks from half-size 3 to 1.5, and the Rooftop's storm doubles the
    gusts and adds a steady wind. The kitchen tips sideways, not toward the
    sink as first proposed: a sink-ward tilt pins fighters on the backsplash
    and still leaves 30% decisions in that arena. In the finale a hurt
    fighter takes up to 2x knockback and a flier knocked out of the air falls
    at full gravity. A late aggression ramp and braver edge play were tried
    and moved the rate by about a point, so they are not in. Numbers in 3.4.

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
`waterLanding`, `counterCrack`), and a `finale` (decision 13).

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
- Finale: `finale: FinaleSpec` (`tilt | flood | storm`, each with a `title`,
  a face-off `card`, a `rampMs` and its own values). `finaleFor(arena, seed,
  limitMs)` gives the start (`limitMs - FINALE_MS`, or at once in a shorter
  fight) and the edge it pushes toward: the tilt's downhill side (seeded,
  left or right) or the wind's edge for the storm. `finaleStrengthAt` ramps
  0..1 with a smoothstep and holds; `dryHalfAt`, `floodedGeometry` and
  `stormWindAt` turn a strength into the flood's dry floor and the storm's
  wind. The sim, the stage and the Voice all read these, so they agree.

As built (balance, after the Sim tuner): explosive is knockback +20% and
self-damage 2 per hit taken (was +25% and 6); the Flooded Garage shocks
electric fighters for 5 per hit taken (the spec says 15). Both were the main
reasons electric and explosive champions sat at 6–26% win rates.

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
selfDamage, showboat, finale, suddenDeath, timeout, end`; `hit` carries `move`,
`type`, `damage`, `knockback`, `big`, `point`. The health timeline samples at
4 Hz plus every change. Determinism test: two `runFight` calls with the same
input produce deep-equal outcomes; the `hash` covers the event log and final
body transforms.

As built (Sim workstream): contract 3.4 plus `FightSim.layout(side)`. The
first `step()` also returns `start`; stepping past the end records nothing.
Throws emit `throw` (with damage), not `hit`. Extra fields: `hit.health`,
`hit.counter`, `hit.miracle`, `throw.health`, `whiff.reason` (`miss`,
`dodged`, `immune`, `slipped`, `broken`), `stagger.cause`. Slithers are hard
to grab (30% slip) rather than immune. Decisions and sudden death go by share
of the health bar. `createFight` throws on an unknown arena. Hits on a downed
fighter do 60% damage and never re-stagger. Every limb weighs at least 15% of
the torso, and downed ragdolls get floor drag (stops long slides).

As built (arena finale, decision 13): each step moves an `ArenaField`
(`motion.ts`: the live play geometry, the wind push and the slope push) on
from the finale. The tilt is a downhill pull on a flat floor (the stage tips
the drawn counter and the fighters together); the flood resizes the slab
colliders to the dry square and rings out a torso 0.1 past the waterline
(hovering fliers excepted); active fighters drift with any push
(`PUSH_DRIFT`), inactive ones take it as an impulse. The finale freezes at
the fight's end. `finale` is logged once, on its first step, if the fight is
still on (not after a bell). Tuner (2,000 fights over 3 seeds): before, KO 24% /
ring-out 32% / decision 44%; after, KO 13% / ring-out 77% / decision 10%
(garage 9%, kitchen 11%, rooftop 10%). Body-plan win rates 42-58% (were
43-61%), champions 32-66% (were 30-73%), mean fight 22.5 s (was 24.5 s).
Fights decided before the finale are unchanged. The decisive moment
moved later (median 23 s, was 19 s among decisive fights) because the finale
is now where most close fights end.

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

As built (Forge workstream):

- `runStructuredStream` in `src/lib/ai/run.ts` streams partial output through
  the same attempt guard as `runStructured`; `onPartial` gets a second `info`
  argument (attempt, stage, model) so the backend restarts growth when a
  repair or fallback stream begins.
- Each call has a Haiku task at `high` and a Sonnet fallback task at `medium`
  (`slopfight.forge`/`forgeFallback`, `house`, `matchup`, `recap`), timeouts
  set from measured latency (forge 12–45 s). Sonnet 5.5 lives in
  `INTERNAL_MODELS`, read only by routing and pricing.
- The repair check runs on the raw reply before balancing; the unrepaired
  Sonnet path gets the body plan its leg count implies (`planForLegs`).
  Overlong model text is cut at the last whole sentence or clause.
- `armCount` rounds 1 arm to 2 and 3 to 4; renderers and the sim build from
  the actual parts. `writeMatchup` can return a single surviving note.
- Latency: the first visible part arrives after 10–18 s (Haiku thinks first)
  and sometimes in one burst at the end, so the stage queues parts and fills
  the wait with a pre-growth beat.

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

As built (Backend workstream):

- Fights: round-2 fights are created when STANDINGS opens after round 1;
  round-3 seeding and fights when STANDINGS opens after round 2. UPGRADE is
  entered with `round + 1`. With 2 humans, round 2 plays the house fight
  first and the human fight last as the headliner.
- FOUNDRY's 60 s watchdog deadline is hidden like every watchdog;
  `foundryParked` in the view tells the stage it is waiting on the host.
- The sim runs on the server (`fightSim.ts`, Node action) with one retry; if
  it still fails, or the host skips FIGHT before an outcome exists, the seed
  decides (`decidedBySeed`) and the game goes straight to RESULT. A matchup
  still pending when FIGHT starts is dropped and the fight runs without notes.
- Forging: a blank drawing is rejected with no model call; a REJECT after
  BUILD has ended starts an automatic lenient forge. Upgrades always use the
  `"upgrade"` mode: no addition keeps the champion (version bumped), unsent
  strokes on the new layer are forged as the addition, and an addition
  rejected after the clock keeps the champion unchanged. House upgrades pick a
  seeded addition from `HOUSE_ADDITIONS` with no call. A failed HOUSE call
  falls back to seeded `HOUSE_FALLBACK_DESCRIPTIONS`, which still go through
  the forge. Streamed parts are patched at most 4×/s; a fallback that streams
  from scratch restarts `partial`.
- Bets and hype: owners may bet on either side. Hype goes to the side given,
  else the player's bet, else the side with less hype; capped at 20 per call.
- Views: bets are public (`bets: { A: playerId[], B: playerId[] }` plus
  `mine`); each player sees their own champion's full sheet; seed, outcome
  and awards stay hidden until FIGHT. Every fight carries `sheets: { A, B }`
  frozen when its sim first ran, so the recap re-simulates a round-1 fight
  with round-1 champions. Recap logs are capped at 500 events and 400 health
  samples (`truncated: true`); a WebGL recap re-simulates instead of relying
  on the log. Public stage queries: `stage.strokes({ roomCode, gameNumber? })`
  and `stage.foundry({ roomCode })`.
- `ports.ts` exposes the sim lazily as `loadFightSim()` so the job runners do
  not import Rapier.
- Review follow-ups, closed (Sonnet review SHIP):
  - `retryForges` is host-only and a no-op (`{ restarted: 0 }`) outside
    FOUNDRY. A FAILED fighter in BUILD or UPGRADE can still resubmit, and the
    deadline forges it leniently.
  - Strokes are read per fighter through `by_fighterId_and_layer_and_seq`,
    capped at `MAX_FIGHTER_STROKE_ROWS` (400 strokes × 3 layers = 1,200
    rows). `stage.strokes` and the recap `doodles` keep their shapes; rows
    come in slot, layer, seq order.
  - `play.myStrokes({ capability, layer? })` returns only the caller's rows
    up to `layer`; the controller restores its canvas from it once on mount.
  - Each fighter in the view carries `forgeParts: { streamed, target } |
    null`, filled only for the viewer's own forging fighter. The target is
    the old part count + 2 for upgrades, else a per-plan median (biped 8,
    quadruped 9, multiped 11, hopper 4, slither 6, flier 6; 8 before the
    plan streams). The plan streams into the optional `partialPlan` field.
  - An identical resubmission (same kind and sanitized text, or the same
    last stroke row `seq:total`) while that forge runs is a no-op, stored as
    the optional, server-only `forgeInput`.
  - The Voice has `slipped` (priority 40) and `broken` (priority 25, 250 ms
    after the breaking hit) beats, one each per fight.

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

- [x] Foundation: deps, `SLOPFIGHT` registered end to end with stubs, contracts
      (sheet, vocab, arenas, modifiers, constants, strokes), shell flags
      (commit 410e75b; Sonnet review PASS; `next.config.ts` sets
      `agentRules: false` so `next dev` stops appending to AGENTS.md)
- [x] Creature: anchors, mesher, toon look, rig and animation, `/dev/slopfight`
      gallery with growth playback (surface-nets mesher in a 2-worker pool,
      growth remesh p50 ~12 ms at 48³; 30 samples, about 20 read clearly;
      Sonnet review SHIP)
  - [x] Visual review of real forged champions. Earlier Sonnet judges scored each
        probe champion 0–3 ("would the player say that's mine?") from two
        angles against the input and doodle. Round 0 (first real forges):
        1.34, charm 2.11; cones as onions, items as primitive blobs, clothing
        as boxes, stick figures as marshmallows. Round 1: 1.69, charm 2.29
        after an additive optional `markings` field (`MARKINGS_MAX` 4:
        mask, belly, stripes, spots, band, tip, panel…), a render-layout step
        (flat-based cones, crisp boxes, tapered wings, same-anchor fans, S-curve
        slithers, face plates, second-head faces), held items as `props.glb`
        models, and a `<looks>` section in the forge prompt
        (`FORGE_PROMPT_VERSION` 2; first part p50 rose from 10.3 s to 12.9 s).
        Cone, stool, spider, stick cat and panda now read; buried claws,
        sideways packs, pipe muzzles, blurry markings and upgrade colour
        drift were open at that point. Round 2 fixes are now implemented and
        regression-covered: exposed appendages, centered packs, shorter
        muzzles, crisp marking boundaries, and deterministic upgrade identity
        carry. The final 51-input probe produced 43 champions, including eight
        held-out subjects and four upgrades; automatic checks pass. The release
        review inspected all 43 from two angles, plus the panda separately and
        the live two-player forges. No new numerical Sonnet recognition score
        is claimed. See [release review](./slopfight-release-review.md).
- [x] Forge: streaming call, prompts and few-shots, rasterizer, Sonnet entry,
      dozens of inputs judged (texts and doodles, bad ones included) (8 probe
      runs, 338 Haiku forges through the gateway; final 43/43 verdicts
      correct; first visible part p50 12 s / p90 18 s because Haiku thinks
      first, full forge p50 13 s / p90 22 s, 45 s cap then Sonnet; Sonnet
      recheck SHIP. Final Round 2 probe: first-part p50 9.1 s / p90 15.0 s,
      total p50 11.2 s / p90 19.5 s; 51 inputs, one repair, no fallback;
      current renderer visually reviewed in the release pass)
- [x] Sim: deterministic ragdolls, brains, moves, damage, hazards, determinism
      test, pacing stats (tuner at 6 seeds, 7,830 fights: KO 28% / ring-out
      34% / decision 37%, first contact median 1.0 s, mean fight 23 s, every
      plan/stat/move-type win rate within 35–65%, whiff rate and miracles rise
      with chaos; Chromium and Node hashes match; ~113 ms per 30 s fight;
      Sonnet recheck SHIP)
- [x] Arena finale (decision 13, 2026-10-19): Tip Over, High Tide and The
      Storm in the last 10 s; decisions 44% to 10% (2,000-fight tuner), body
      plans 42-58%. Stage: the counter and its fighters tip, the flood sheet's
      waterline matches the sim, storm rain, grade and lightning, a title
      slam, a finale `edge_drama` shot, pulsing edge lights. Sound:
      `fight-finale` plus `finale-tilt` / `finale-flood` / `finale-storm`.
      Voice: a `finale` beat per arena. Left: the RESULT instant replay and
      the recap reel show a calm arena (only the live fight publishes
      `services.finale`), and the kitchen cabinet does not tip with the
      counter (the uphill side lifts off it in low shots)
- [x] Arenas and props in Blender (`build_all.py` rebuilds byte-identical GLBs
      and runs `verify_glb.py`, which checks the node contract, `COLOR_0`, the
      camera axes, Collision against `platformColliders()` and Floor against
      `checkFloor()`; 23–25k tris per arena, props under 500; Sonnet review
      fixes applied. The scoreboard is only in frame from `Cam_Scoreboard` and
      `Cam_Establish_End`, so anything shown on it needs a cut to one of them)
- [x] Backend mode: tables, phases, forge pipeline, house, matchup, recap, sim
      action, bets, hype, scoring, seeding, view, cleanup, Free Play, rematch,
      tests (426 tests; Sonnet review SHIP; dev push only; server and local
      fight hashes match; follow-ups listed in 3.6)
- [x] Stage: canvas root, look, arena, director, in-scene UI, every phase
      scene, transitions, crowd, podium
  - [x] Stage core: canvas, quality tiers, lighting moods, post stack with
        letterbox/iris/wipe/impact frame, GLB sets with practicals, crowd and
        hazards, presentation clock (hit stop and slow-mo as a debt repaid on
        settled cuts and phase covers), shot director, transitions, lit SDF
        and extruded title text, `PHASE_SCENES` registry, `/dev/slopfight/stage`
        lab, `stage3d/README.md` (Sonnet recheck SHIP)
  - [x] Stage scenes and in-scene UI kit: `ui3d` kit (Card, Chip, PipRow,
        MoveRow, AvatarToken, Bar, ClockRing, Caption, Confetti, NamePlate;
        text colours picked by contrast ratio), the Voice service
        (`services.voice`: one `Voice` per game, captions one line at a
        time, TTS feed), stage feeds that never hit Convex in fixtures or
        the lab, and scenes for LOBBY (in-scene START, QR, name plates),
        BUILD (live easels, typing pad, pre-growth lump, growth, name card
        drop, sketch-to-champion dissolve, reject card, jammed card),
        FOUNDRY, ROSTER (walk-ons with tracked cuts, rising cards), STANDINGS
        (in-scene board with occlusion-aware columns), UPGRADE (old vs new)
        and FINISHED (podium, confetti, final scores, recap reel slot). One
        persistent canvas across START and rematch (`LobbyBridge` keeps a
        stable tree). Lab at `/dev/slopfight/scenes`. ~225 fps at 1080p
        high on the RTX 5090 in BUILD with 4 easels and 4 forges. Sonnet
        recheck SHIP; left: dim light text on dark chips, rooftop marquee
        sub-line softened by the arena's string lights and depth of field
  - [x] Fight scene and recap replays: local re-sim from the fight row
        (Rapier preloaded in FACE_OFF), recorded ahead in time-boxed steps
        and played interpolated at `serverNow − startsAt` (catches up, never
        ahead); a hash mismatch warns and presents the stored health
        timeline. FACE_OFF owns its direction (match cut, letterboxed Dutch
        low shot, walk-ons on the Voice, hazard and note cards placed off the
        fighters' outlines, bettor avatars). FIGHT: health bars on dark plates
        that stack and hide under title slams, hit stop, impact frame,
        fringe, slow-mo rationed to one per 4 s, ON THE EDGE forcing the edge
        shot, ring-out with an iris and a pre-cut to deep landings, KO / RING
        OUT / DECISION / SUDDEN DEATH slams. RESULT: winner framed by its
        body, payouts on the scoreboard, the judges' coin. Recap: `RecapReel`
        replays a picked fight in its arena, and `RecapFallback` (DOM) is
        mounted by `ui/stage.tsx` for a recap without WebGL2. Additive edits
        outside the folder: `fight_close` takes an optional `from`
        (`director/shots.ts`), `creature-view.ts` `dispose()` resets its
        source (StrictMode), FACE_OFF `ownsDirection: true`. Lab at
        `/dev/slopfight/fight`. Sonnet recheck SHIP. Release tracing resolved
        the first-use shader, physics-solver, and skin-bound stalls: owned
        shader prototypes and title geometry prepare ahead of use, a disposable
        world warms Rapier during loading, and conservative bone bounds avoid
        per-vertex skinning on first draw. The captured real-room first entry
        fell from 112.4 ms to 24.9 ms. See the release review for full live-run
        evidence. Pacing accepted as tuned (superseded by the arena finale,
        decision 13): the decision rate depends on the
        matchup (2–5 of 12–30 seeds in the fixer's scans, 17 of 30 for
        cat/elephant in the reviewer's); the sim already ramps aggression
        with time, so revisit after a real playtest
- [x] Controller: draw, describe, rejection, forge card, bet, hype, result,
      upgrade, host retry (38 `/dev/ui` fixtures for every phase built on the
      real scoring and bracket; strokes batched every 250 ms with wall-clock
      seq; hype batched to ≤4 calls/s; health bars from the stored timeline
      against the server clock; SVG silhouettes from the skeleton; no three.js
      in any `/controller` chunk; Sonnet review SHIP). Its follow-ups are
      closed: the canvas restores from `play.myStrokes`, and the Forging bar
      follows `forgeParts` ("N parts of about M")
- [x] Sound and narration (45 synthesized files, 1.29 MB, byte-identical
      re-renders, seamless padded loops; `sounds.ts` gains buses, loops,
      ducking and lazy `createSoundBank`; The Voice plans whole fights from the
      event log with per-beat priorities and caps; TTS via `slopfight_line`
      verbatim cues, never in Free Play, opening line prefetched at FACE_OFF
      with `Voice.fightStart`; Sonnet recheck SHIP; mix not yet checked by ear,
      no real TTS call yet)
- [x] Integration: dev Convex E2E with 2 human seats and timers on, signature
      moment captures, 228.9–234.3 fps across all six fights, all replay hashes
      matched, controller bundles free of Three.js/Rapier. Room `8PCW9B`
      finished after one phone disconnected; both recap modes passed.
      See [release review](slopfight-release-review.md) for measurements.
- [x] `vp check` (zero errors), `vp test --run` (1,139 tests), and
      `vp run build` passed. Full tests passed three consecutive runs.
