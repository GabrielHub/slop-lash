# SlopFight Blender sets

These scripts build the three launch arenas and the held-prop library as GLBs
in headless Blender, procedurally. They use no external assets: everything is
bmesh primitives with vertex colours.

| Script | Output |
|---|---|
| `build_garage.py` | `public/models/slopfight/garage.glb` (FLOODED_GARAGE) |
| `build_kitchen.py` | `public/models/slopfight/kitchen.glb` (KITCHEN_COUNTER) |
| `build_rooftop.py` | `public/models/slopfight/rooftop.glb` (ROOFTOP) |
| `build_props.py` | `public/models/slopfight/props.glb` (one `Prop_<tag>` per `PROP_TAGS`) |
| `verify_glb.py` | re-imports the GLBs in a fresh Blender and checks the contract |
| `render_previews.py` | EEVEE toon previews of every `Cam_*` plus the props |
| `build_all.py` | runs all of the above |
| `common.py` | shared geometry, painting, markers, arena parsing, export |

## Commands

```sh
# everything: build the four GLBs, verify them (non-zero exit on failure)
python scripts/slopfight/blender/build_all.py            # add --render for previews
python scripts/slopfight/blender/build_all.py --only kitchen,props

# one script
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup \
    --python scripts/slopfight/blender/build_kitchen.py

# verify (all GLBs, or the ones named after --)
blender --background --factory-startup --python scripts/slopfight/blender/verify_glb.py [-- file.glb ...]

# previews: 1280x720 PNGs, <name>_<Cam>.png plus a <name>__sheet.png contact sheet
blender --background --factory-startup --python scripts/slopfight/blender/render_previews.py \
    -- [--out DIR] [--res 1280x720] [--cams Cam_FightWide,Cam_Establish] [--no-sheet] [--standins] [file.glb ...]
```

`build_all.py` reads the `BLENDER` environment variable if Blender is not at
the default Windows path. By default, previews go to `%TEMP%/slopfight-previews`
(`tempfile.gettempdir()`). Pass `--out` to send them somewhere else.

`--standins` drops 1-unit bean fighters where each shot expects them and
writes `<name>_<Cam>_standins.png` (plus `<name>__sheet_standins.png`). The
beans stand on the face-off marks, the roster marks, the pedestal tops and the
podium steps, and for each `Cam_Edge_*` one bean stands 0.3 inside that rim.
Use it to judge framing; the plain previews are for set dressing.

**Rebuilds are byte-identical.** The same sources give the same GLB bytes, so
`git diff` on `public/models/slopfight/` only shows real changes. Two things
make this hold, and new code must keep them:

- Each `Geo`'s noise seed is `zlib.crc32(name)`, never `hash()`, because
  Python salts string hashes per process.
- `Geo.ingest()` emits faces and vertex noise sorted by position, because
  bmesh operators (bevel, inset) return geometry in pointer order.

## Play geometry

`src/games/slopfight/arenas.ts` is canonical. Each build script parses its
arena's entry with `common.read_arena()`; if the file cannot be read, it falls
back to a built-in copy and prints which source it used. Every arena follows
the same rules:

- The platform is 6 x 6 with its top at y = 0, centred on the origin. The
  `Floor` mesh tops out within 0.01 of y = 0 (bevels and decals included).
  `verify_glb.py` runs the stage's `checkFloor()` test on it: top within
  `GEOMETRY_TOLERANCE` (0.02) of 0, and half extents and centre matching
  `arenas.ts`. Dressing that pokes above the top, such as the kitchen crumbs,
  lives in its own `Set_*` node, not in `Floor`.
- A fighter is 1 unit tall.
- `Collision` is exactly the box list from `platformColliders()`. It is ported
  as `common.platform_colliders()`, and `verify_glb.py` checks the two match.
- Edges follow `geometry.edges`:
  - Garage: all four edges are lips (0.12 wide, 0.1 high, inside the rim).
  - Kitchen: the back edge is a wall (1.6 high, 0.2 thick, outside the rim,
    node `Wall_Back`); the other three are open.
  - Rooftop: every edge is open. The tangerine coping is 0.02 high and purely
    visual, so it never stops a ring-out.
- Kitchen pit: the sink matches `pits[0]` exactly (x -0.9..0.9, z -2.6..-1.4,
  depth 1). The pit's own rim decal sits 0.07 outside the hole, flush with the
  counter.
- What lies below the edges matches `surround`:
  - garage: water at y -0.35
  - kitchen: floor at y -9
  - rooftop: street at y -30

## Coordinate conventions

Blender is Z-up and the exporter writes +Y up. A point (x, y, z) in Blender
becomes (x, z, -y) in three.js. Blender -Y is the front of the set (three.js
+Z, downstage, where the TV camera sits), and Blender +Y is the back wall
(three.js -Z).

- **Edge sides:**
  - `N` is the back edge (three.js -Z), `S` the front (+Z), `E` is +X and
    `W` is -X.
  - `Cam_Edge_*` and `Edge_Lights_*` carry `edge_side` with the arenas.ts name
    (`back` / `front` / `right` / `left`).
- **`Cam_*` empties use Blender camera convention:** local -Z looks at the
  subject and local +Y is up. After the +Y-up export, the node's local **-Y is
  forward and local -Z is up**. To drive a three.js camera from a node:

  ```ts
  const q = new THREE.Quaternion();
  node.getWorldQuaternion(q);
  camera.quaternion.copy(q).multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  node.getWorldPosition(camera.position);
  camera.fov = node.userData.fov;            // vertical degrees
  ```

  Each cam's extras also repeat the shot in three.js world coordinates:
  `fov` (vertical degrees), `target`, `up`, `forward`, `roll` and `shot` (a
  note). That means `camera.position` + `camera.up` + `camera.lookAt(target)`
  works too. `verify_glb.py` checks that local -Y equals `forward` for every
  cam.
- **Plane markers** (`Marquee_Text`, `Scoreboard_Text`, `Easel_N_Canvas`):
  - In three.js the plane is the node's local XY plane facing local +Z (+X
    right, +Y up), so a `PlaneGeometry(width, height)` added as a child renders
    unrotated.
  - Extras: `width`, `height`, `normal` (three.js world); text markers also
    have `text_color` and `bg_color`.
  - `Easel_N_Canvas` is 1 x 1. `Easel_N_Avatar` marks a spot on the easel leg
    for the player's avatar.
- **`Light_*` empties** are markers for practicals; the stage creates the
  lights.
  - Extras:
    - `light_kind` (`point` / `spot` / `rect`)
    - `light_color` (hex)
    - `light_intensity`
    - `light_flicker` (0..1)
    - optionally `light_distance`, `light_angle` (degrees), and
      `light_width` / `light_height` (rect)
    - `light_target` / `light_dir` (three.js world)
  - Spot and rect lights point down local -Z, the same as the cams.
  - `Light_Moon` (rooftop) is meant to be read as a directional light.

## Materials

- **Vertex colours only.** Every mesh has one corner-domain sRGB attribute
  named `Color`, exported as `COLOR_0`. Colours are flat per region, with
  subtle gradients and darkening on down-facing faces. There are no textures
  and no UVs.
- **Material names are hints:** `SF_Vertex` (toon-lit), `SF_Emissive` (unlit
  glow) and `SF_Collision` (never drawn). The stage replaces them with its own
  toon material.
- **Emissive parts** have a name ending in `_Emissive` and extras
  `emissive: true`, `emissive_color`, and sometimes `emissive_strength`.
  - Big panels such as windows and the sky card use a low strength (1 to 2.5)
    so they read as colour rather than bloom.
  - `Backdrop_Sky_Emissive` also has `unlit: true`.
  - `flicker` and `chase` extras ask for animation: `Neon_Emissive` flickers,
    and `Marquee_Bulbs_Emissive` and `Festoon_Emissive` chase.
- **`Collision`** has extras `collision: true`, `visible: false` and `boxes`
  (the count). Hide it.

## Node contract (every arena GLB)

Required names never change. `verify_glb.py` fails if one is missing or has
the wrong parent.

| Node | Notes |
|---|---|
| `Floor` | walkable top (+ pad body). Extras `surface` |
| `Collision` | `platformColliders()` boxes, hidden |
| `Edge` | the rim treatment (lip / bullnose / coping). `Edge_Lights_N/E/S/W` children are emissive studs per side for "ON THE EDGE", with no child on a wall side |
| `Pit` | kitchen: the sink basin, extras `pits_three` [minX, maxX, minZ, maxZ, depth]. Garage and rooftop: an empty with `pit: false` |
| `Crowd` > `Crowd_01`..`Crowd_20` | separate blob spectators, origin at the base, local -Y faces the platform (three.js +Z after export), extras `crowd: true` |
| `Marquee` > `Marquee_Text` (+ `Marquee_Bulbs_Emissive`) | visible from `Cam_Establish(_End)` and `Cam_FightWide` |
| `Scoreboard` > `Scoreboard_Text` | on the back wall |
| `Easel_1..4` > `Easel_N_Canvas`, `Easel_N_Avatar` | left apron, origin at the feet |
| `Pedestal_1..4` > `Pedestal_N_Top` | right apron, `Pedestal_N_Top` is where the creature stands |
| `Podium` > `Podium_1/2/3` | extras `hidden_until: "FINAL"`. Hide it until the final |
| `Hazard_*` | see below |
| `Light_*` | see above |
| `Cam_Establish`, `Cam_Establish_End`, `Cam_Build`, `Cam_Foundry`, `Cam_Roster`, `Cam_FaceOff_A`, `Cam_FaceOff_B`, `Cam_FightWide`, `Cam_Edge_N/E/S/W`, `Cam_Podium`, `Cam_Scoreboard` | shot anchors |
| `Mark_Roster_1..4`, `Mark_FaceOff_A/B` | where the four roster fighters and the two fighters stand (FaceOff marks = arenas.ts spawns) |
| `Set_*`, `Backdrop_*`, `Window_Emissive`, ... | static dressing |

Notes on the shots. The anchors are framed for what
`stage3d/director/shots.ts` does with them, checked with stand-in renders:

- **`Cam_Edge_*`** (`common.edge_cams`): each camera sits low (0.3 to 0.4) and
  2 to 3.4 outside its edge, 1.4 to 1.7 to one side, and looks at a point 0.2
  inside the rim just above or below the top. That puts a fighter standing
  0.3 inside the rim with the chest at NDC y of about 0.3 and the head under
  about 0.65. The drop (pad face, cabinets or facade, down to about y -1.2 to
  -2.2) fills the lower frame. The framing holds both for the bare anchor and
  after `edge_drama` pushes in 0.3, slides 55% along the edge toward the
  fighter, and pulls the target toward the torso.
- **`Cam_FaceOff_A/B`** (`common.faceoff_cams`): each camera sits 1.6 outboard
  of its own spawn, 0.4 outside the front rim, at height 0.45. It aims 62% of
  the way to the rival at height 0.55, with fov 34 and a 5 degree roll. That
  is where `face_off_low` aims when it has targets. In the FACE_OFF phase it
  gets none, so the anchor alone must frame the shot:
  - its own fighter is large in the near third (NDC x about ±0.72), with the
    feet in frame at about -0.5;
  - the rival is smaller on the other side of centre;
  - in the garage, the back pillar falls between the two, clear of both.
- **Kitchen `Cam_Edge_N`:** the back edge is the backsplash, so there is no
  outside to stand in. This cam looks back from high over the counter
  (1.4, -0.4, 2.0 in Blender). The rim fighter is mid-frame against the tiles
  and faucet, with the sink pit right in front of them.
- **Scoreboard:** it is in frame where the stage writes to it:
  - `Cam_Establish_End` holds the lobby's room code at the end of the crane;
  - `Cam_Scoreboard` is the STANDINGS shot.

  `Cam_FightWide`, `Cam_Roster` and `Cam_Podium` frame the fighters and the
  marquee instead.

### Per-arena extras

**Flooded Garage**

- Hazards:
  - `Hazard_Water` is the surround water, with a gradient (extras
    `water_level`). Child `Hazard_Water_Ripples` holds the ripple rings.
  - `Hazard_Wire` is a live cable sparking in the water, with child
    `Spark_Emissive`.
- Practicals:
  - `Tube_Emissive` and `Light_Tube` (rect light, flicker 0.35), plus
    `TubeL_Emissive` and `TubeR_Emissive`.
  - `Light_Spark`, and `Light_Worklamp` with `Lamp_Emissive`.
- Dressing:
  - Floaters `Floater_1..5`.
  - The half-sunk sedan, oil drums, tool wall, pillars and garage door are
    in `Set_Room`.

**Kitchen Counter**

- Structure:
  - `Wall_Back` is the backsplash. `Set_Ledge_Jars` sits on its ledge.
- Hazards:
  - `Hazard_Sink` is the wall faucet, with extras `spout_tip` (three.js).
    Child `Hazard_Sink_Drip` falls to `fall_to`.
  - `Hazard_Toaster` has `Hazard_Toaster_Toast_1/2`, which pop by
    `pop_height` along local +Y, and `Toaster_Glow_Emissive`.
- Practicals:
  - `Light_Toaster`.
  - `Window_Emissive` and `Light_Window` (rect).
  - `Pendant_Emissive` and `Light_Pendant`.
- Dressing:
  - `Clock` has `Clock_Hand_Hour` and `Clock_Hand_Minute`, which spin about
    local Z in three.js (local Y in Blender).
  - `Set_Crumbs` holds the crumbs scattered on the counter. They are kept out
    of `Floor` so its top stays at 0.
  - The fridge and cabinets are in `Set_Room`.

**Rooftop**

- Hazards:
  - `Hazard_Wind_Laundry_1..5` are separate nodes with the origin on the
    line, so they swing about local X. Extras `laundry` gives the kind.
  - `Hazard_Wind_Sock` has its origin at the pivot and streams along local +X.
  - `Wind_Origin` is an empty. The direction comes from the fight seed.
- Neon and lights:
  - `Neon_Emissive` ("EAT" and an arrow, warm tangerine/amber) and
    `Light_Neon` (flicker 0.3).
  - `Festoon_Emissive` and `Light_Festoon`.
  - `Light_Billboard` and `Light_Moon`.
- Dressing:
  - `AC_1..3_Fan` spin.
  - The water tower, AC units and fire escape are in `Set_City`.
  - The backdrop is `Backdrop_Sky_Emissive` (a sky box on all four sides),
    `Moon_Emissive`, `Backdrop_Skyline` and `Backdrop_Windows_Emissive`.

## Props (`props.glb`)

There is one node per `PROP_TAGS` entry, `Prop_<tag>`, including `Prop_thing`.

- **Placement:** every node sits at the world origin with its origin **at the
  grip**.
- **Scale:** sized for a 1-unit fighter (the bat is about 0.55).
- **Budget:** under 500 tris each.
- **Extras:**
  - `prop` (the tag)
  - `kind` (PROP_INFO kind)
  - `hold`:
    - `upright`: the long axis runs up the fist (+Y)
    - `aim`: a pistol grip, with the business end along +Z
    - `hanging`: briefcase
    - `worn`: boxing glove, with the origin at the wrist
    - `front`: shield, laptop
  - `grip_axis`: the local axis the fist closes around
  - `tip`: the working end, in local coordinates
  - `length`
- **Facing:** the broad or striking face looks along local +Z.
- **`Prop_thing`** is a white lump with `tint: "accent"`. Multiply it by the
  accent colour.

## Modelling helpers (`common.py`)

- `Geo.box(..., top_only=True)` bevels only the edges round the +Z face. Use
  it for flat-laid parts seen from above, such as tiles, pavers, planks and
  stacked bands: the read is the same at about half the triangles.
- `Geo.box(..., skip=("-z", "+y"))` drops whole faces by local direction, and
  turns off bevelling. Use it for faces nobody sees: backs against a wall,
  undersides on the ground, the far side of skyline cut-outs.
- Set `Geo.max_seg` to cap bevel segments for every later part of a node. The
  sedan, for example, caps its detail parts at 1.

## Budgets (last build)

| GLB | Tris | Headroom to 30k |
|---|---|---|
| garage | 25,122 | 4,878 |
| kitchen | 23,518 | 6,482 |
| rooftop | 25,464 | 4,536 |
| props | 8,472 total, largest 472 (trumpet), leaf blower 468 | each under 500 |
