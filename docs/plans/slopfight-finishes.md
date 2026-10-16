# SlopFight: finishes (what a part is made of)

> 2026-10-16. Plan and checklist for per-part materials ("make his arms metal",
> "make the body diamond") and the improvements around them. Read
> `docs/plans/slopfight.md` first; this extends its sheet, forge, sim and look.

## The idea

Today every part is soft painted vinyl in one of three palette slots. A
**finish** says what a part is made of. The forge picks it per part, an
upgrade can change it ("solid gold arms"), the renderer shades it so it reads
from the couch, and the fight sim feels it, so a finish is a real design
decision and not a skin.

Finishes: `vinyl` (default), `metal`, `gold`, `crystal`, `stone`, `wood`,
`ice`, `lava`, `slime`, `glow`. Ten, each with one look and one fight identity.

## Creative levers (what a finish can do)

1. **Look.** One toon shader, one program, branching on a per-vertex finish id:
   - metal: chrome horizon bands in the reflection, tight bright glints.
   - gold: the same, warm and saturated.
   - crystal: facets snapped per Voronoi cell in bind space, so they stick
     to the body and glint as it moves. Bright edges, iridescent rim, palette
     lightened (red reads ruby, blue reads sapphire, bone reads diamond).
   - stone: matte, speckled, chunky dark band.
   - wood: grain rings in bind space, warm brown.
   - ice: pale, translucent dark side, frosty rim, glossy.
   - lava: dark crust with emissive cracks that pulse; they bloom.
   - slime: glossy and saturated. It jiggles twice as much.
   - glow: emissive, pulsing palette colour; it blooms.
2. **Rigidity.** Rigid finishes (metal, gold, crystal, stone, wood, ice) barely
   jelly-wobble; slime wobbles extra. The wobble scale is smooth across seams,
   so the surface never cracks.
3. **Crisp seams.** The mesher's hard label becomes (slot, finish), so a metal
   arm meets a vinyl shoulder on a clean toon edge, like markings do.
4. **Growth beat.** A finished part lands with its own burst (sparks, shards,
   embers, goo) and sound instead of the plain puff.
5. **Hit feel.** Hit events carry the finishes involved (only when not vinyl),
   so the stage picks sparks and a clang for metal, shards and a tink for
   crystal, splinters for wood, and so on.
6. **Fight mechanics, local to the part.** A finished limb changes the hits it
   delivers (damage, knockback) and how fast strikes swing. A finished part
   changes the hits that land on it. The whole body's share of heavy finishes
   changes speed. Each finish is a trade-off near zero net, like traits, so
   prose still cannot buy power. "Metal arms" is a heavy-hitter style, and
   "a diamond body" is hard to hurt but brittle (it flies further).
7. **Matchup Notes cite finishes.** The existing MATCHUP call sees the finishes
   on each card, so "lava fists against an ice body" becomes a note. That costs
   no extra call.
8. **Discoverability on the phone.** Material chips (a swatch and a word:
   Gold, Diamond, Lava, Chrome...) sit under the upgrade's text box. A tap
   only starts the text ("solid gold ") and hands the keyboard back, so the
   player names any part, prop or detail ("solid gold teeth"). The text box
   stays the one input; there is no part picker. The rotating ideas include
   finish examples too.
9. **House champions** sometimes pick a finish upgrade.
10. **Material inks.** The drawing palette has a second row: gold, chrome,
    diamond, lava, ice, slime and glow. What is painted in one forges in that
    finish, so a material is something you draw, in a Build or an upgrade.
    See "Material inks" below.

## Contract

- `vocab.ts`: `FINISHES`, `FINISH_INFO` (prompt line and synonyms, card line).
- `sheet.ts`: `PartSchema.finish` is optional in storage and types (absent
  means vinyl, so every existing sheet, fixture and hash is unchanged) and
  required in the model-facing forge schema, between `color` and `mirror`
  (`mirror` stays the last property, the streamed "part finished" sentinel).
  `normalizePart` drops `vinyl`.
- `convex/slopfight/tables.ts`: `partValidator.finish` optional. No new
  tables, fields elsewhere, queries or writes: finishes ride the existing
  champion document and the existing forge-stream part patches.
- `finishes.ts`: `FINISH_EFFECTS` (mechanics) plus helpers (`partFinish`,
  coverage, `finishSpeed`, `finishGroups`). Renderer look constants stay in
  `stage3d/creature`.

## Upgrades

`preserveUpgrade` restores an old part exactly unless the text names it. The
finish follows its own rule: a part's finish may change when the text names
the part, or when the text has a finish word and names no part (a whole-body
transformation). Otherwise it comes back. `preserveUpgradePartial` does the
same for streamed parts so nothing flickers.

## Convex

Finishes add no writes or subscriptions. An audit of the SlopFight backend for
read and write amplification ran alongside; the verified findings are fixed:

- **Typing** stamps moved off the fighter row into `slopFightTyping`, read only
  by `stage.typing`. A keystroke no longer re-runs `views.room` for every
  screen; the fighter row changes once, when the first keystroke picks the
  describe input. (`typingAt` stays in the schema for old rows, unread.)
- **Fight replays** moved off the fight row into `slopFightReplays`: the
  frozen sheets, the event log and the health timeline. The fight row keeps
  who won and how. A live room view reads one replay (the fight in play, once
  revealed) instead of every fight's log and sheets on each re-run; other
  fights go out with an empty log. The recap reads them all.
- **Doodles** load only in `views.recap`, not in finished live rooms (the
  stage reads strokes from `stage.strokes` there).
- **Strokes**: `stage.strokes` is one subscription per fighter, so a batch
  re-reads and resends only its drawer's rows. Stroke rows carry the layer's
  running point total, so `addStrokes` checks the cap from the last row
  instead of reading the whole layer on every batch.
- **Forge streams**: `stage.foundry` became `stage.forges`, which reads only
  the stream rows (no fighter rows or champion sheets) and sends only parts.
  Status and sheets come from the room view, updated in the same transaction.
- **Over-subscription**: the roster, standings and podium scenes subscribe to
  no stage feeds (`useSceneData({ feeds: false })`).
- **Own fighter** lookups use a `by_gameId_and_ownerId` index instead of
  reading all four fighters (every stroke batch and keystroke did that).
- **Bets** before the face-off minimum skip `settle`; the face-off check reads
  the clock before the fight. The house upgrade loads the state once.

Left alone: presence heartbeats (shared engine code) and the owner's
`myForgeProgress` read of the stream row (one small row per patch).

## Material inks

- **Strokes**: colour indices 7..13 (`MATERIAL_INKS` in vocab.ts, each with a
  finish, a colour and a bright core). The Convex stroke validator already
  takes any number; `StrokeColorSchema` takes the new indices.
- **Look**: a glossy tube, the ink's colour with its core down the middle
  (`MATERIAL_CORE_WIDTH` of the brush), the same on the phone canvas
  (canvas.tsx) and in raster.ts, which paints both the forge PNG and the
  stage easel. Picking one shows a short hint on the canvas.
- **Forge**: `materialInkPatches` paints the forged layer on the coverage grid
  (paint over gold or erase it and it is gone), finds each ink's patches and
  sends the biggest six with their bounds. The user text says where each
  shows ("gold at x 30-70%, y 10-12%"), and the reading rules say what the
  tube looks like and that the ink sets the finish, not the colour. An
  upgrade sends only its new layer's patches.
- **Upgrades**: `preserveUpgrade` and its partial take the ink finishes; an
  existing part may change to one of them (and only those), so gold paint on
  an arm makes it gold while the drawing can never turn anything else lava.
- No new Convex reads or writes: the patches come from the batches the forge
  action already loads.

## Checklist

- [x] Contract: vocab, sheet, validators, finishes.ts, tests
- [x] Forge prompt, examples, FORGE_PROMPT_VERSION bump; championCard and matchup prompt
- [x] Upgrade preservation of finishes, with tests
- [x] Sim: per-hit finish multipliers, swing, coverage speed; golden unchanged without finishes; tuning check
  (`scripts/slopfight/tune-finishes.ts`: every finish 47-55% against its vinyl twin)
- [ ] Renderer: mesher labels and attributes, toon shader finishes, rigidity, props, growth bursts, hit FX
- [x] Phone: "Made of" on the champion card, material chips, idea text
- [x] 3D roster card shows finishes
- [x] House upgrades with finishes
- [x] Convex audit fixes
- [x] Material inks: strokes, phone picker and canvas, raster, forge text and reading rules, upgrade finishes
- [ ] `vp check`, `vp test`, `vp run build`; creature lab and fight lab screenshots
