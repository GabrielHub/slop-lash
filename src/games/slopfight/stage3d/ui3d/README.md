# ui3d: the in-scene UI kit

Every piece of UI on the TV is part of the set. Cards, chips, tokens, bars,
the clock and the captions are lit by the stage rig with the toon material
and an inverted-hull outline in a dark tint of their own colour (never black).
They move with one motion language: anticipation, squash and stretch,
overshoot, settle, and idle life at rest (nothing is ever perfectly still).
There is no DOM over the canvas.

Sizes are in metres. A 0.12 m line of `StageText` stays readable from 3 m at
1080p in the build, roster and fight shots. Treat 0.08 m as the floor for
secondary text (pip labels, sub-lines) on cards that sit close to the camera.

Every component uses the presentation clock (`services.clock`): it freezes
in hit stop and slows in slow-mo unless the prop says `realtime`. Sounds go
through `stageSfx(services)` and play only in a live room
(`services.live === input.live`), so fixtures, the recap and the labs stay
silent.

## Files

| file | what |
| --- | --- |
| `motion.ts` | the motion language as pure functions (poses, springs, arcs) |
| `motion-group.tsx` | `MotionGroup`, the shared mover the other components wrap |
| `card.tsx` | `Card`, `faceZ`, `cardBeatSound` |
| `chips.tsx` | `Chip`, `PipRow`, `MoveRow`, `MoveGlyph`, `MOVE_COLORS`, `chipWidth`, `moveTypeLabel` |
| `tokens.tsx` | `AvatarToken`, `AvatarTokenStatic`, `NamePlate`, `FaceCamera`, `playerTokenColor`, `tokenInitial` |
| `bar.tsx` | `Bar` (with a `BarHandle`), `CHUNK_DELAY_S` |
| `clock-ring.tsx` | `ClockRing`, `clockTone` |
| `confetti.tsx` | `Confetti` (with a `ConfettiHandle`), `CONFETTI_COLORS` |
| `caption.tsx` | `Caption` (mounted by the canvas; one per stage); re-exports `wrapCaption` |
| `caption-layout.ts` | `wrapCaption`, `CHARS_PER_LINE` (pure, tested) |
| `voice.ts` | `VoiceService` (on `services.voice`); see `../README.md` "The Voice" |
| `voice-narration.tsx` | `VoiceNarration` (DOM, mounted by the canvas), `useVoiceGame` |
| `room.ts` | `useRoomOrNull()`: the room context, or null outside a room |
| `materials.ts` | `UI_COLORS`, `uiToon`, `uiOutline`, `darkOf`, `lightOf`, `toyHex`, `nearestToy`, `luminance`, `contrastRatio`, `isLightColor`, `textOn`, `textGlowOn`, `onCardTone` |
| `geometry.ts` | cached shapes: `slabGeometry`, `pillGeometry`, `discGeometry`, `pipGeometry`, `cableGeometry`, `glyphGeometry`, `tickGeometry` |
| `sound.ts` | `stageSfx(services)`: `play(name, opts)` (live rooms only) |
| `text.tsx` | `StageText`, `TitleText`, `OnPlane`, `fitTextSize`; re-exports `sanitizeStageText` |
| `sanitize.ts` | `sanitizeStageText` (pure, tested) |

Pure logic lives in `.ts` modules so `ui3d.test.ts` and `voice.test.ts` can
test it in the node test environment.

Do not dispose shared geometry or materials: they are cached per size or
colour for the life of the page.

## Motion props (`MotionGroup`)

`Card`, `AvatarToken`, `NamePlate` and `ClockRing` accept every
`MotionGroup` prop:

| prop | default | meaning |
| --- | --- | --- |
| `position` | `[0,0,0]` | rest position (parent space). Changing it after the entrance **flies there along an arc** (fly-to). |
| `rotation` | none | rest rotation |
| `scale` | 1 | uniform rest scale |
| `enter` | `"pop"` | `"rise"` (up from below with a stretch, then settles), `"drop"` (falls from the rig and is caught by its cable: bounce, squash, swing), `"pop"` (springs from zero with a twist), `"none"` |
| `enterDistance` | rise 1.4, drop 3 | how far below/above the entrance starts |
| `delay` | 0 | seconds before the entrance (stagger a row) |
| `flyFrom` | null | arrive by a toss along an arc from this point instead of `enter` (mount-only) |
| `arcHeight` | 0.8 | arc peak above the higher end |
| `leaving` | false | plays the flick-off (anticipation dip, then flicked up and away with spin), then hides. Back to false enters again. Mounted with `leaving` = stays hidden. |
| `idle` | 1 | idle bob/sway amount (0: still) |
| `hanging` | false | idle like something on a cable (wider swing) |
| `seed` | 1 | variation (swing direction, idle phase) |
| `realtime` | false | ignore hit stop and slow-mo |
| `onBeat` | none | `"start"` (entrance or flight begins), `"land"` (impact moment: the cable catch, the token's touchdown, the rise's settle), `"gone"` (exit finished) |

Timings: `ENTER_SECONDS` = rise 1.05, drop 1.4, pop 0.7; `EXIT_SECONDS` 0.5;
`arcDuration(distance)` = min(1.25, 0.45 + 0.07 × distance) plus a 0.14 s
windup and a 0.7 s landing bounce. `enterSeconds(kind)` returns the entrance
length.

## Card

```tsx
<Card position={[x, 1.6, z]} width={1.3} height={0.9} enter="drop" cable={3}
      accent="#2f6fb0" title="Raccoon Supreme" body="Strike +1">
  <MoveRow name="Trash Bash" type="STRIKE" power={4} position={[0, -0.1, faceZ()]} />
</Card>
```

A rounded, slightly thick cardstock slab (the default is cream stock) with
an SDF title and body. Content goes on its face in card-local units: the
origin is the card's centre and the face is at `faceZ(depth)`.

| prop | default | meaning |
| --- | --- | --- |
| `width`, `height` | 1.2, 0.8 | size |
| `depth` | 0.045 | slab thickness |
| `radius` | 9% of the short side | corner radius |
| `color` | cream | stock colour |
| `accent` | null | a title band across the top in this colour, plus the edge and outline tint |
| `bandHeight` | min(height * 0.3, 0.2) | the band's height; one line of title fits the default, so give a two-line title a taller band |
| `title`, `body` | none | text (sanitized; the body wraps at 86% width) |
| `titleColor`, `bodyColor` | title: `textOn(accent)` on a band (ink or bone, whichever contrasts more; bone gets a thin outline and `textGlowOn` so it stays bright in shade), else ink; body: ink | |
| `titleSize`, `bodySize` | fits the width, at most 0.16 / 0.1 | em sizes |
| `cable` | 0 | hang from a cable this long above the top edge (use with `enter="drop"`) |
| `outline` | 2.4 | outline width in px at 1080p (0: none) |
| `glow` | 0.08 | self-glow so the stock never sinks into shadow |
| `sound` | true | default beat sounds: a whoosh at the start of rise/drop, `boing` on a drop's catch, `tap` on other landings, `trickWhiff` on the flick-off |
| `onBeat` | | as MotionGroup |
| `children` | | content on the face |

## Chip, PipRow, MoveRow, MoveGlyph (`chips.tsx`)

Static pieces placed on a card's face. Each pops in (squash, overshoot)
after `appearDelay` seconds; `sound` adds a soft tick (default off).

- `Chip`: a trait chip, a chunky pill sized to its label.
  `label`, `position`, `color` (#f28b30), `textColor` (`textOn(color)`;
  light text gets a thin outline and `textGlowOn(color)`), `size` (text em,
  0.085), `appearDelay`, `sound`.
  `chipWidth(label, size)` gives its width for layout.
- `PipRow`: a stat, with its label on the left and `max` pips on the right.
  `label`, `value` (1..max), `max` (5), `position`, `width` (1), `color`
  (#e8553d), `emptyColor`, `labelColor`, `size` (0.08), `appearDelay`,
  `sound`.
- `MoveRow`: one move, shown as a type glyph, the move's name and power pips.
  `name`, `type` (`MoveType`), `power?` (1..5), `position`, `width` (1.1),
  `size` (0.075; the name shrinks to fit), `textColor`, `appearDelay`,
  `sound`.
- `MoveGlyph`: STRIKE is an impact star, GRAPPLE is two linked chain rings,
  TRICK is a swirl. They are modelled meshes, never emoji. Props: `type`,
  `size` (0.12), `position`, `alive` (true: idle spin), `seed`.
  `MOVE_COLORS[type]` gives the type's colour, and `moveTypeLabel(type)`
  gives the player-facing word.

## AvatarToken, NamePlate, FaceCamera (`tokens.tsx`)

- `AvatarToken`: a chunky disc in the player's colour with their initial.
  Toss it with `flyFrom` (the arc flight lands with a squash and a bounce),
  or move it with `position` (fly-to).
  Props: `name`, `color` (default `playerTokenColor(name)`, the phone colour
  moved to the nearest toy colour), `radius` (0.16), `thickness`,
  `faceCamera` (true: turns about Y toward the camera), `landSound` (`"tap"`;
  null for none), `onBeat`, `children`, plus every motion prop (`enter`
  defaults to `"pop"`).
- `AvatarTokenStatic`: the same token with no motion, for use inside plates
  and cards. Props: `name`, `color`, `radius` (0.12), `position`.
- `NamePlate`: a plaque with a name, an optional sub-line and an avatar
  token. Props: `name`, `sub`, `color` (gold accent strip), `avatar` (a
  player name: shows their token at the left end), `width` (1.3), `height`
  (0.36), `dim` (an empty seat), `faceCamera` (false), `sound` (true: a tap
  on landing), `onBeat`, `children`, plus every motion prop.
- `FaceCamera`: turns its children toward the camera every frame (priority
  0.55, after the scene, before the camera rig applies). `mode="yaw"`
  (upright) or `"full"` (square-on, for health bars). `amount` < 1 turns
  only part of the way. `position` is also accepted.

## Bar (`bar.tsx`)

```tsx
const hp = useRef<BarHandle>(null);
<FaceCamera mode="full"><Bar ref={hp} value={1} color="#7fc45a" label="Raccoon" flip={side === "B"} /></FaceCamera>
// per frame or on a hit: hp.current?.set(health / max)
```

The fill drops at once. The lost part lingers as a pale chunk for
`CHUNK_DELAY_S` (0.32 s), then crunches off: the chunk breaks away as its own
piece that tumbles and falls, the bar shakes, and `healthCrunch` plays (live
only, louder for bigger losses). A heal grows the fill.

Props:

| prop | default | meaning |
| --- | --- | --- |
| `value` | | 0..1 |
| `width` | 1.1 | |
| `height` | 0.12 | |
| `color` | | fill colour |
| `chunkColor` | a pale `color` | |
| `trackColor` | | |
| `label` | | text above the bar |
| `labelColor` | | |
| `flip` | | drains toward the outer end (B side) |
| `onChunk(lost)` | | called when a chunk crunches off |
| `sound` | true | |
| `position` | | |

`BarHandle` methods:
- `set(value)`: changes the value with no React render
- `shake(strength = 0.6)`
- `value`

## ClockRing (`clock-ring.tsx`)

```tsx
<ClockRing position={[x, y, z]} radius={0.45} label="BUILD" />
```

A plum disc with 24 ticks that go dark clockwise from 12 o'clock around a
big number of seconds. The ring is teal, turns gold at 10 s and tomato at
5 s. In the last 5 s it throbs, and `countdownTick` plays (live only).

By default it reads the room's `phaseDeadline` and `phaseStartedAt`. It
pops away when there is no deadline (timers off, or a phase that waits for
players).

Props:

| prop | default | meaning |
| --- | --- | --- |
| `deadline` | the room's | server ms; null hides the ring |
| `startedAt` | the room's phase start | |
| `radius` | 0.45 | |
| `label` | none | small text under the number |
| `sound` | true | |
| `hidden` | false | |
| motion props | | `enter` defaults to `"pop"` |

`clockTone(seconds)` returns `"normal" | "warning" | "urgent"`.

## Confetti (`confetti.tsx`)

```tsx
const confetti = useRef<ConfettiHandle>(null);
<Confetti ref={confetti} />
confetti.current?.burst({ origin: [0, 1.4, -0.4], count: 160, colors: winnerPalette });
```

One instanced mesh (a fixed pool, one draw call) of lit, double-sided paper
scraps. They launch in a cone, tumble, flutter down with drag and sway, rest
on the floor (y = 0), and shrink away at the end of `life`.

`Confetti` props:

| prop | default | meaning |
| --- | --- | --- |
| `capacity` | 600 | pool size |
| `life` | 4.5 | seconds |
| `realtime` | false | |

`burst` options:

| option | default | meaning |
| --- | --- | --- |
| `origin` | | |
| `count` | 120 | |
| `colors` | `CONFETTI_COLORS`, a toy-colour party mix | |
| `speed` | 4 | m/s |
| `spread` | 0.75 | cone half-angle, radians |
| `direction` | up | |
| `size` | 0.06 | m |

`clear()` removes every scrap.

## Caption (`caption.tsx`)

The canvas mounts `Caption` once (frame priority 0.62, after the camera
rig). It is the lower third for The Voice: a plum slab fixed to the camera,
with a gold "THE VOICE" tab. Its text types on at 42 characters a second
with a soft blip, shows one caption at a time (at most two balanced lines,
see `wrapCaption`), rises in, squashes on a new line and flicks down when
the line's time is up.

It draws over the set (no depth test, no fog) at the depth-of-field focus
distance, so it stays sharp in hero shots, and it moves up with the
letterbox. Do not mount another one. Show lines through the Voice service
(`services.voice.say` / `schedule`, see `../README.md`).

## Materials and colours (`materials.ts`)

- `UI_COLORS`: `card`, `cardEdge`, `ink`, `inkDim`, `plum`, `plumEdge`,
  `bone`, `gold`, `tomato`, `track`.
- `uiToon(color, { glow, doubleSide, overlay, specular })`: a cached toon
  material.
- `uiOutline(color, widthPx, { overlay })`: a cached outline in
  `darkOf(color, 0.62)`.
- Colour helpers:
  - `darkOf(color, amount)` and `lightOf(color, amount)`
  - `toyHex(toyColor)`
  - `nearestToy(hex)`: maps any colour onto the toy palette (skips charcoal,
    bone and sand)
  - `luminance(color)` (relative, linear 0..1) and `contrastRatio(a, b)`
    (WCAG, 1..21).
  - `isLightColor(color)` and `textOn(color)`: ink or bone, whichever has
    the higher contrast on the colour (so mid tones such as tomato, moss and
    teal take ink; every toy colour gets more than 3:1). Use it for text on
    a coloured band, chip or badge.
  - `textGlowOn(color, base = 0.12)`: the `glow` for text on that surface.
    Bone on a dark surface gets 0.62, so it reads near white even where the
    rig leaves a card in shade; ink on a light surface keeps `base`.
  - `onCardTone(color)`: a colour that still reads on cream card stock. Light
    colours (luminance over 0.3) are darkened in proportion; dark ones pass
    through. Use it for pips, glyphs or chips in a fighter's colour on a
    card.

## Text (`text.tsx`)

`StageText` and `TitleText` sanitize what they draw (`sanitizeStageText`,
in `sanitize.ts`):
- Smart quotes and dashes become plain ones.
- Accents fold to the base letter ("Café" becomes "Cafe").
- Anything the Latin font cannot draw (emoji, CJK) is dropped, and the
  result falls back to "?" if nothing is left.

This keeps troika from fetching CDN fallback fonts.

Extra `StageText` props:
- `overlay`: no depth test or fog, and unlit
- `unlit`: flat colour the rig never touches (self-lit signs; `MARQUEE_TEXT`
  bundles it with no outline and no shadow for marquee letters)
- `opacity`
- `renderOrder`
- `whiteSpace`
- `textRef`: the troika mesh, with `clipRect` and `textRenderInfo`
- `onSync`
