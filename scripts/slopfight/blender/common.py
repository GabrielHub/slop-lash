"""Shared helpers for the SlopFight headless Blender scripts.

Everything is procedural: primitives are built with bmesh, painted with sRGB
vertex colours into one corner-domain colour attribute named ``Color``, and
merged into one mesh per named node. Scripts run with::

    blender --background --factory-startup --python <script.py> -- [args]

Coordinates in these scripts are Blender's (Z up, -Y is the front of the set
where the TV camera lives). The glTF export converts to three.js (Y up):
``three = (x, z, -y)``. See README.md for the node contract.
"""

import math
import os
import random
import re
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

# Keep the build scripts' common import surface while the primitive kernel
# remains independent of the authored scene helpers below.
from geometry import C, Geo, get_material, hexc, mat, mix, place, rot_of, shade, shade_c, to_hex

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(REPO, "public", "models", "slopfight")
ARENAS_TS = os.path.join(REPO, "src", "games", "slopfight", "arenas.ts")
VOCAB_TS = os.path.join(REPO, "src", "games", "slopfight", "vocab.ts")

# ---------------------------------------------------------------- coordinates


def three(v):
    """Blender (x, y, z) -> three.js / glTF (x, y, z)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def look_quat(pos, target, roll=0.0):
    """Camera-convention rotation: local -Z looks at target, local +Y is up."""
    d = Vector(target) - Vector(pos)
    q = d.to_track_quat("-Z", "Y")
    if roll:
        q = q @ Quaternion((0, 0, 1), math.radians(roll))
    return q


def facing_quat(normal, up=(0, 0, 1)):
    """Plane-marker rotation: local -Y faces along ``normal`` (towards the
    viewer), local +Z is up, +X is right. In three.js this becomes a plane in
    the node's local XY facing local +Z, i.e. a PlaneGeometry added as a child
    renders unrotated."""
    n = Vector(normal).normalized()
    upv = Vector(up)
    z = (upv - n * upv.dot(n)).normalized()
    y = -n
    x = y.cross(z).normalized()
    m = Matrix((x, y, z)).transposed()
    return m.to_quaternion()


# ---------------------------------------------------------------- scene helpers


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for item in list(coll):
            coll.remove(item)


def empty(name, loc=(0, 0, 0), rot=None, parent=None, props=None, size=0.3, display="PLAIN_AXES"):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = display
    ob.empty_display_size = size
    bpy.context.scene.collection.objects.link(ob)
    place(ob, mat(loc, rot), parent)
    for k, v in (props or {}).items():
        ob[k] = v
    return ob


def cam_empty(name, pos, target, fov=40.0, roll=0.0, parent=None, note=""):
    """Director anchor. Blender camera convention: local -Z looks at target,
    local +Y is up. Extras repeat the shot in three.js world coordinates so
    code can also do camera.position.set(...); camera.up.set(...);
    camera.lookAt(target)."""
    q = look_quat(pos, target, roll)
    up = q @ Vector((0, 1, 0))
    fwd = q @ Vector((0, 0, -1))
    props = {
        "fov": float(fov),
        "target": three(target),
        "up": three(up),
        "forward": three(fwd),
        "roll": float(roll),
    }
    if note:
        props["shot"] = note
    return empty(name, pos, q, parent, props, size=0.5, display="ARROWS")


EDGE_SIDE_OF = {"N": "back", "S": "front", "E": "right", "W": "left"}


EDGE_NOTE = {"N": "outside the north (back) edge", "E": "outside the east (right) edge",
             "S": "outside the south (front) edge", "W": "outside the west (left) edge"}


def edge_cams(cam_z, out, target_z, fov=55.0, lateral=1.4, look_in=0.2, sides=None, override=None):
    """Cam_Edge_N/E/S/W: low shots from just outside each edge looking back
    across it, framed for a 1-unit fighter standing 0.3 inside the rim: the
    rim near frame centre, the fighter's chest at NDC y ~0.3 and head under
    ~0.65, and the drop (pad face, facade, cabinets) filling the lower part.
    N is the back edge (Blender +Y, three.js -Z), E is +X, S the front, W is
    -X. ``sides`` maps 'N'/'E'/'S'/'W' to a dict overriding any of cam_z / out
    / target_z / fov / lateral / look_in for that side (a nearby counter or
    parapet limits how far out a camera can sit). ``override`` maps a cam name
    to (pos, target, fov, note) for a side that needs a custom shot (a wall
    side, say). Each cam carries extras edge_side (the arenas.ts side name:
    front/back/left/right)."""
    base = dict(cam_z=cam_z, out=out, target_z=target_z, fov=fov, lateral=lateral, look_in=look_in)
    shots = {}
    for side in "NESW":
        p = dict(base)
        p.update((sides or {}).get(side, {}))
        d, t, lat, cz, tz = HALF + p["out"], HALF - p["look_in"], p["lateral"], p["cam_z"], p["target_z"]
        pos, tgt = {"N": ((-lat, d, cz), (0.0, t, tz)), "E": ((d, lat, cz), (t, 0.0, tz)),
                    "S": ((lat, -d, cz), (0.0, -t, tz)), "W": ((-d, -lat, cz), (-t, 0.0, tz))}[side]
        shots["Cam_Edge_" + side] = (pos, tgt, p["fov"], EDGE_NOTE[side])
    shots.update(override or {})
    obs = {}
    for name, (pos, target, f, note) in shots.items():
        ob = cam_empty(name, pos, target, fov=f, note=note)
        ob["edge_side"] = EDGE_SIDE_OF[name[-1]]
        obs[name] = ob
    return obs


def faceoff_cams(geo, out=1.6, edge_gap=0.4, z=0.45, bias=0.62, look_z=0.55, fov=34.0, roll=5.0):
    """Cam_FaceOff_A/B: low two-shots. Each camera sits ``out`` beyond its own
    fighter's spawn along x and just ``edge_gap`` outside the front rim (so
    the lip stays under the frame), and looks at the point the director's
    face_off_low aims for (``bias`` of the way from this spawn to the other,
    ``look_z`` up). The anchor alone therefore frames both fighters feet to
    head: its own fighter large in the near third, the rival smaller across
    the frame, and in the garage the back pillar falls between them, clear of
    both."""
    out_obs = []
    sa, sb = b_from_t(geo["spawns"]["A"]), b_from_t(geo["spawns"]["B"])
    for side, own, other in (("A", sa, sb), ("B", sb, sa)):
        sx = -1.0 if own[0] < other[0] else 1.0  # outward along x from this spawn
        pos = (own[0] + sx * out, -(HALF + edge_gap), z)
        target = (own[0] + (other[0] - own[0]) * bias, own[1] + (other[1] - own[1]) * bias, look_z)
        out_obs.append(cam_empty("Cam_FaceOff_" + side, pos, target, fov=fov, roll=sx * roll,
                                 note="low two-shot, fighter %s in the foreground" % side))
    return out_obs


def plane_marker(name, loc, normal, width, height, parent=None, up=(0, 0, 1), props=None):
    """Text / canvas plane marker. In three.js the plane is the node's local XY
    facing local +Z (+Y up, +X right), so a PlaneGeometry(width, height) child
    renders unrotated."""
    p = {"width": float(width), "height": float(height), "normal": three(Vector(normal).normalized())}
    p.update(props or {})
    return empty(name, loc, facing_quat(normal, up), parent, p, size=min(width, height) / 2,
                 display="SINGLE_ARROW")


def light_empty(name, loc, kind, color, intensity, flicker=0.0, target=None, parent=None,
                distance=0.0, angle=0.0, width=0.0, height=0.0, extra=None):
    """Practical light marker; code creates the light. Spot and rect lights
    point down local -Z (Blender light convention), like the Cam_* empties."""
    props = {
        "light_kind": kind,
        "light_color": color if isinstance(color, str) else to_hex(color),
        "light_intensity": float(intensity),
        "light_flicker": float(flicker),
    }
    if distance:
        props["light_distance"] = float(distance)
    if angle:
        props["light_angle"] = float(angle)
    if width:
        props["light_width"] = float(width)
        props["light_height"] = float(height)
    q = None
    if target is not None:
        q = look_quat(loc, target)
        props["light_target"] = three(target)
        props["light_dir"] = three((Vector(target) - Vector(loc)).normalized())
    props.update(extra or {})
    return empty(name, loc, q, parent, props, size=0.4, display="SPHERE")


def count_tris(objs=None):
    objs = objs if objs is not None else [o for o in bpy.data.objects if o.type == "MESH"]
    total = 0
    for o in objs:
        if o.type != "MESH":
            continue
        total += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return total


def apply_transforms(ob, location=False, rotation=True, scale=True):
    """Bake an object's rotation/scale (and optionally location) into its mesh."""
    if ob.type != "MESH":
        return
    loc, rot, sca = ob.matrix_basis.decompose()
    m = Matrix()
    if location:
        m = Matrix.Translation(loc) @ m
    if rotation:
        m = m @ rot.to_matrix().to_4x4()
    if scale:
        m = m @ Matrix.Diagonal(sca.to_4d())
    ob.data.transform(m)
    ob.matrix_basis = Matrix.LocRotScale(None if location else loc, None if rotation else rot,
                                         None if scale else sca)


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_extras=True,
        export_apply=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_morph=False,
        export_skins=False,
        use_selection=False,
        use_visible=False,
    )
    print("EXPORTED", path, "tris=%d" % count_tris())
    rows = sorted(((count_tris([o]), o.name) for o in bpy.data.objects if o.type == "MESH"), reverse=True)
    print("TRIS BY NODE:", ", ".join("%s=%d" % (n, t) for t, n in rows[:25]))


def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


# ---------------------------------------------------------------- arena data


_NUM = r"(-?\d+(?:\.\d+)?)"

# Fallback that mirrors src/games/slopfight/arenas.ts as of 2026-10-10.
_ARENA_DEFAULTS = {
    "half": 3.0, "top": 0.0, "thickness": 0.4, "ring_out_y": -0.6,
    "lip": {"height": 0.1, "width": 0.12}, "wall": {"height": 1.6, "thickness": 0.2},
}
_ARENA_FALLBACK = {
    "FLOODED_GARAGE": {"edges": {"front": "lip", "back": "lip", "left": "lip", "right": "lip"}, "pits": [],
                       "surround": {"kind": "water", "y": -0.35},
                       "spawns": {"A": (-1.6, 0, 0), "B": (1.6, 0, 0)}},
    "KITCHEN_COUNTER": {"edges": {"front": "open", "back": "wall", "left": "open", "right": "open"},
                        "pits": [{"minX": -0.9, "maxX": 0.9, "minZ": -2.6, "maxZ": -1.4, "depth": 1.0}],
                        "surround": {"kind": "floor", "y": -9.0},
                        "spawns": {"A": (-1.6, 0, 0.5), "B": (1.6, 0, 0.5)}},
    "ROOFTOP": {"edges": {"front": "open", "back": "open", "left": "open", "right": "open"}, "pits": [],
                "surround": {"kind": "street", "y": -30.0},
                "spawns": {"A": (-1.6, 0, 0), "B": (1.6, 0, 0)}},
}


def read_arena(arena_id):
    """Play geometry for one arena, parsed from src/games/slopfight/arenas.ts
    (three.js coordinates: y up, +z downstage/front, -z the back wall).
    Falls back to a built-in copy if the file or a field is missing, and says
    so. Returns a dict with half, top, thickness, ring_out_y, lip, wall,
    edges{front,back,left,right}, pits[{minX,maxX,minZ,maxZ,depth}],
    surround{kind,y}, spawns{A,B}, source."""
    geo = dict(_ARENA_DEFAULTS)
    geo.update({k: v for k, v in _ARENA_FALLBACK[arena_id].items()})
    geo["source"] = "fallback"
    try:
        src = open(ARENAS_TS, encoding="utf-8").read()
    except OSError:
        print("arenas.ts not found; using built-in geometry for", arena_id)
        return geo
    bi = src.find("const BASE_GEOMETRY")
    if bi >= 0:
        base = src[bi: src.find("} as const", bi)]
        # top-level `halfSize:` line only (outOfBounds also has a halfSize)
        m = re.search(r"^\s*halfSize:\s*(\w+|" + _NUM + ")", base, re.M)
        hm = re.search(r"const HALF\s*=\s*" + _NUM, src)
        if m and re.fullmatch(_NUM, m.group(1)):
            geo["half"] = float(m.group(1))
        elif hm:
            geo["half"] = float(hm.group(1))
        m = re.search(r"^\s*thickness:\s*" + _NUM, base, re.M)
        if m:
            geo["thickness"] = float(m.group(1))
        m = re.search(r"lip:\s*\{\s*height:\s*" + _NUM + r",\s*width:\s*" + _NUM, base)
        if m:
            geo["lip"] = {"height": float(m.group(1)), "width": float(m.group(2))}
        m = re.search(r"wall:\s*\{\s*height:\s*" + _NUM + r",\s*thickness:\s*" + _NUM, base)
        if m:
            geo["wall"] = {"height": float(m.group(1)), "thickness": float(m.group(2))}
        m = re.search(r"ringOutY:\s*" + _NUM, base)
        if m:
            geo["ring_out_y"] = float(m.group(1))
    # the arena's own object entry (not the ARENA_IDS list line)
    key = 'id: "%s"' % arena_id
    i = src.find(key)
    if i < 0:
        print("arena entry", key, "not found in arenas.ts; using built-in geometry")
        return geo
    ends = [src.find('id: "%s"' % other, i + len(key)) for other in _ARENA_FALLBACK if other != arena_id]
    ends = [e for e in ends if e > i]
    j = min(ends) if ends else src.find("export function", i)
    block = src[i:j]
    m = re.search(r"edges:\s*\{([^}]*)\}", block)
    if m:
        geo["edges"] = dict(re.findall(r"(front|back|left|right):\s*\"(\w+)\"", m.group(1)))
    m = re.search(r"pits:\s*\[(.*?)\]\s*,", block, re.S)
    pits = []
    if m:
        for obj in re.findall(r"\{([^{}]*)\}", m.group(1)):
            vals = dict((k, float(v)) for k, v in re.findall(r"(minX|maxX|minZ|maxZ|depth):\s*" + _NUM, obj))
            if {"minX", "maxX", "minZ", "maxZ"} <= set(vals):
                vals.setdefault("depth", 1.0)
                pits.append(vals)
    geo["pits"] = pits
    m = re.search(r"surround:\s*\{\s*kind:\s*\"(\w+)\",\s*y:\s*" + _NUM, block)
    if m:
        geo["surround"] = {"kind": m.group(1), "y": float(m.group(2))}
    m = re.search(r"spawns:\s*\{\s*A:\s*\[([^\]]*)\],\s*B:\s*\[([^\]]*)\]", block)
    if m:
        geo["spawns"] = {"A": tuple(float(v) for v in m.group(1).split(",")),
                         "B": tuple(float(v) for v in m.group(2).split(","))}
    geo["source"] = "arenas.ts"
    print("ARENA", arena_id, "from", geo["source"], {k: geo[k] for k in ("edges", "pits", "surround", "spawns")})
    return geo


def b_from_t(v):
    """three.js point -> Blender point."""
    return (v[0], -v[2], v[1])


def pit_rect_b(p):
    """three.js pit dict -> Blender (x0, x1, y0, y1)."""
    return (p["minX"], p["maxX"], -p["maxZ"], -p["minZ"])


def platform_colliders(geo):
    """Python port of platformColliders() in arenas.ts. Returns three.js
    boxes as (min(x, y, z), max(x, y, z))."""
    half, top, thick = geo["half"], geo["top"], geo["thickness"]
    bottom = top - thick
    pits = geo["pits"]

    def over_floor(x, z):
        if abs(x) > half or abs(z) > half:
            return False
        return not any(p["minX"] < x < p["maxX"] and p["minZ"] < z < p["maxZ"] for p in pits)

    def clamp(v):
        return min(half, max(-half, v))

    xs = sorted({-half, half, *[clamp(p[k]) for p in pits for k in ("minX", "maxX")]})
    zs = sorted({-half, half, *[clamp(p[k]) for p in pits for k in ("minZ", "maxZ")]})
    boxes = []
    for zi in range(len(zs) - 1):
        z0, z1 = zs[zi], zs[zi + 1]
        run = None
        for xi in range(len(xs)):
            x0 = xs[xi]
            solid = xi < len(xs) - 1 and over_floor((x0 + xs[xi + 1]) / 2, (z0 + z1) / 2)
            if solid and run is None:
                run = x0
            if not solid and run is not None:
                boxes.append(((run, bottom, z0), (x0, top, z1)))
                run = None
    skin = 0.05
    for p in pits:
        fy = top - p["depth"]
        boxes.append(((p["minX"], fy - skin, p["minZ"]), (p["maxX"], fy, p["maxZ"])))
        if fy >= bottom:
            continue
        boxes.append(((p["minX"] - skin, fy, p["minZ"]), (p["minX"], bottom, p["maxZ"])))
        boxes.append(((p["maxX"], fy, p["minZ"]), (p["maxX"] + skin, bottom, p["maxZ"])))
        boxes.append(((p["minX"], fy, p["minZ"] - skin), (p["maxX"], bottom, p["minZ"])))
        boxes.append(((p["minX"], fy, p["maxZ"]), (p["maxX"], bottom, p["maxZ"] + skin)))
    lh, lw = geo["lip"]["height"], geo["lip"]["width"]
    wh, wt = geo["wall"]["height"], geo["wall"]["thickness"]
    for side in ("front", "back", "left", "right"):
        kind = geo["edges"].get(side, "open")
        if kind == "open":
            continue
        t = top + (lh if kind == "lip" else wh)
        inner = half - lw if kind == "lip" else half
        outer = half if kind == "lip" else half + wt
        lo = top if kind == "lip" else bottom
        if side == "front":
            boxes.append(((-half, lo, inner), (half, t, outer)))
        elif side == "back":
            boxes.append(((-half, lo, -outer), (half, t, -inner)))
        elif side == "left":
            boxes.append(((-outer, lo, -half), (-inner, t, half)))
        else:
            boxes.append(((inner, lo, -half), (outer, t, half)))
    return boxes


# ---------------------------------------------------------------- shared set pieces

HALF = 3.0  # half of the 6 x 6 platform


def platform_collision(geo):
    """Collision node: one box per platformColliders() box (the sim's exact
    static geometry), in Blender coordinates. Hidden in three.js."""
    g = Geo("Collision")
    boxes = platform_colliders(geo)
    for (x0, y0, z0), (x1, y1, z1) in boxes:
        g.slab(x0, x1, -z1, -z0, y0, y1, bevel=0, color="#ff7a3d", shade=(1, 1), jit=0, noise=0, flat=True)
    return g.build(material="SF_Collision", smooth_angle=0,
                   props={"collision": True, "visible": False, "boxes": len(boxes)})


def no_pit():
    """Arenas without pits still carry a Pit node (an empty) so every arena
    GLB has the same contract nodes."""
    return empty("Pit", (0, 0, 0), props={"pit": False, "pits_three": [], "note": "no pits in this arena"},
                 size=0.2)


def edge_lights(parent, color="#ffd27a", n_per_side=9, inset=0.08, z=0.0, size=0.09, edges=None):
    """Rows of lamp studs on the lip, one node per side, so code can flash the
    side a fighter is teetering on ('ON THE EDGE')."""
    sides = {
        "N": [((-HALF + (i + 0.5) * 2 * HALF / n_per_side), HALF - inset) for i in range(n_per_side)],
        "S": [((-HALF + (i + 0.5) * 2 * HALF / n_per_side), -HALF + inset) for i in range(n_per_side)],
        "E": [(HALF - inset, (-HALF + (i + 0.5) * 2 * HALF / n_per_side)) for i in range(n_per_side)],
        "W": [(-HALF + inset, (-HALF + (i + 0.5) * 2 * HALF / n_per_side)) for i in range(n_per_side)],
    }
    out = []
    for side, pts in sides.items():
        if edges and edges.get(EDGE_SIDE_OF[side]) == "wall":
            continue  # no rim to teeter on along a wall
        g = Geo("Edge_Lights_" + side)
        for x, y in pts:
            g.cyl(size, 0.035, base=(x, y, z - 0.005), segs=6, color=color,
                  shade=(1, 1.05), jit=0.0)
        out.append(g.build(parent=parent, material="SF_Emissive",
                           props={"emissive": True, "edge": side, "edge_side": EDGE_SIDE_OF[side],
                                  "emissive_color": color}))
    return out


def podium(colors, center=(0, 0.4, 0), parent=None):
    """3-step podium on the platform; hidden until the final. Steps: 1st centre
    (tallest), 2nd left, 3rd right. Podium_N empties mark the tops."""
    g = Geo("Podium", max_seg=1)
    cx, cy, cz = center
    steps = [(1, 0.0, 0.62), (2, -1.15, 0.42), (3, 1.15, 0.26)]
    tops = []
    for rank, dx, h in steps:
        g.slab(cx + dx - 0.55, cx + dx + 0.55, cy - 0.5, cy + 0.5, cz, cz + h, bevel=0.07,
               color=colors["body"])
        g.slab(cx + dx - 0.58, cx + dx + 0.58, cy - 0.53, cy + 0.53, cz + h - 0.06, cz + h + 0.02,
               bevel=0.035, color=colors["trim"][rank - 1])
        # big rank pip on the front face
        for k in range(rank):
            off = (k - (rank - 1) / 2) * 0.16
            g.disc(0.06, loc=(cx + dx + off, cy - 0.505, cz + h * 0.5), normal=(0, -1, 0), segs=10,
                   color=colors["pip"])
        tops.append((rank, (cx + dx, cy, cz + h + 0.02)))
    ob = g.build(origin=center, parent=parent, props={"hidden_until": "FINAL"})
    for rank, p in tops:
        empty("Podium_%d" % rank, p, parent=ob, size=0.25)
    return ob


def blob_spectator(name, base, face_to, body, belly, accent, rng, parent=None, height=None, kind=None):
    """Low-poly blob spectator with decal eyes and cheering nubs. Origin at
    the base so code can bounce and squash it."""
    g = Geo(name, seed=rng.randint(0, 99999), max_seg=1)
    h = height or rng.uniform(0.75, 1.1)
    w = h * rng.uniform(0.5, 0.62)
    kind = kind or rng.choice(["bean", "bean", "tall", "squat", "pear"])
    if kind == "tall":
        h *= 1.15
        w *= 0.85
    if kind == "squat":
        h *= 0.82
        w *= 1.12
    prof = [(0.0, 0.0), (w * 0.72, 0.0), (w * 0.95, h * 0.12), (w, h * 0.32), (w * 0.94, h * 0.55),
            (w * 0.78, h * 0.76), (w * 0.5, h * 0.93), (0.0, h)]
    if kind == "pear":
        prof = [(0.0, 0.0), (w * 0.85, 0.0), (w * 1.05, h * 0.18), (w * 1.0, h * 0.38),
                (w * 0.78, h * 0.6), (w * 0.62, h * 0.8), (w * 0.4, h * 0.95), (0.0, h)]
    g.lathe(prof, base=(0, 0, 0), segs=9, color=body, shade=(0.72, 1.06))

    def rad_at(z):
        for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
            if z0 <= z <= z1 and z1 > z0:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return w * 0.5

    def front_y(x, z, lift=0.02):
        # facets sit inside the vertex radius; push decals just proud of the vertex surface
        r = rad_at(z)
        return -math.sqrt(max(r * r - x * x, 0.0025)) - lift

    # belly patch (low, so it never covers the face)
    bz = h * 0.26
    g.sphere((w * 0.6, w * 0.32, h * 0.2), loc=(0, front_y(0, bz, 0.0) + w * 0.2, bz), segs=7, rings=4,
             color=belly, shade=(0.85, 1.05))
    # eyes (decals): big whites with pupils looking slightly up, toward the action
    ez = h * 0.68
    ex = w * 0.34
    eyr = w * 0.26
    for sx in (-1, 1):
        nrm = (sx * 0.3, -1, 0.08)
        y = front_y(ex, ez, 0.035)
        g.disc(eyr, loc=(sx * ex, y, ez), normal=nrm, segs=9, color="#fff8ec", shade=(1, 1), jit=0)
        g.disc(eyr * 0.55, loc=(sx * ex * 0.95, y - 0.015, ez + eyr * 0.1), normal=nrm, segs=7,
               color="#2a1a2e", shade=(1, 1), jit=0)
        g.disc(eyr * 0.16, loc=(sx * ex * 0.95 + 0.03, y - 0.022, ez + eyr * 0.32), normal=nrm, segs=5,
               color="#ffffff", shade=(1, 1), jit=0)
    # mouth: a cheering open mouth
    mz = h * 0.5
    g.disc(w * 0.16, loc=(0, front_y(0, mz, 0.03), mz), normal=(0, -1, -0.1), segs=7, color="#5a1f2c",
           shade=(1, 1), jit=0)
    # cheering arm nubs
    for sx in (-1, 1):
        up = rng.uniform(0.2, 1.0)
        a0 = Vector((sx * w * 0.85, 0, h * 0.42))
        a1 = a0 + Vector((sx * 0.22, -0.05, 0.12 + up * 0.25))
        g.stick(a0, a1, w * 0.17, segs=5, color=body, capsule=True, rings=3)
    # accessory
    acc = rng.choice(["none", "antenna", "horns", "cap", "ears", "tuft", "bow"])
    if acc == "antenna":
        g.stick((0, 0, h * 0.95), (0.05, 0, h * 1.25), 0.025, segs=5, color=shade(C(body), 0.7))
        g.sphere(0.07, loc=(0.05, 0, h * 1.28), segs=6, rings=4, color=accent)
    elif acc == "horns":
        for sx in (-1, 1):
            g.cyl(0.07, 0.2, base=(sx * w * 0.4, 0, h * 0.86), rot=(0, sx * 25, 0), segs=6, r2=0.0,
                  color=accent)
    elif acc == "cap":
        g.cyl(w * 0.62, 0.16, base=(0, 0, h * 0.86), segs=9, color=accent)
        g.box((w * 0.7, w * 0.6, 0.04), loc=(0, -w * 0.62, h * 0.88), bevel=0.015, color=accent)
    elif acc == "ears":
        for sx in (-1, 1):
            g.sphere((0.12, 0.05, 0.16), loc=(sx * w * 0.6, 0, h * 0.92), segs=6, rings=4, color=body)
    elif acc == "tuft":
        for k in range(3):
            g.cyl(0.05, 0.18, base=((k - 1) * 0.07, 0, h * 0.94), rot=(0, (k - 1) * 22, 0), segs=5,
                  r2=0.0, color=accent)
    elif acc == "bow":
        g.sphere((0.12, 0.05, 0.08), loc=(-0.1, 0, h * 0.97), segs=6, rings=4, color=accent)
        g.sphere((0.12, 0.05, 0.08), loc=(0.1, 0, h * 0.97), segs=6, rings=4, color=accent)
    d = Vector(face_to) - Vector(base)
    yaw = math.degrees(math.atan2(d.x, -d.y))  # local -Y faces the target
    # build at origin, then rotate the whole node to face the platform
    ob = g.build(origin=(0, 0, 0), parent=None)
    ob.matrix_basis = mat(base, (0, 0, yaw))
    if parent is not None:
        place(ob, mat(base, (0, 0, yaw)), parent)
    ob["crowd"] = True
    return ob


def crowd(positions, face_to, palette, seed=7):
    """Crowd parent with Crowd_01..Crowd_20, each a separate node."""
    rng = random.Random(seed)
    parent = empty("Crowd", (0, 0, 0), size=1.0, display="CUBE")
    obs = []
    for i, (pos, look) in enumerate(positions):
        body, belly, acc = palette[i % len(palette)]
        obs.append(blob_spectator("Crowd_%02d" % (i + 1), pos, look or face_to, body, belly, acc, rng,
                                  parent=parent))
    return parent, obs


def rect_sweep(g, profile, fn, nseg=24, half=HALF, color="#ffffff", **kw):
    """Sweep a cross-section around the square platform boundary (mitred
    corners). profile: [(out, z), ...] where out is the outward offset from the
    boundary line; ordered so the surface faces outwards/up."""
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    bm = bmesh.new()
    rings = []
    for o, z in profile:
        h = half + o
        ring = []
        for ci in range(4):
            ax, ay = corners[ci]
            bx, by = corners[(ci + 1) % 4]
            for s in range(nseg):
                t = s / nseg
                ring.append(bm.verts.new(((ax + (bx - ax) * t) * h, (ay + (by - ay) * t) * h, z)))
        rings.append(ring)
    n = len(rings[0])
    # profile runs inner-top -> outer -> down, so this winding faces outward/up
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], b[i], b[j], a[j]))
    bm.normal_update()
    return g.ingest(bm, Matrix(), color, fn=fn, **kw)


def perimeter_u(c, half=HALF):
    """Perimeter coordinate (0..8*half) of a point near the square boundary,
    counter-clockwise from the front-left corner."""
    x, y = c[0], c[1]
    if abs(y) >= abs(x):
        return (x + half) if y < 0 else (2 * half + 2 * half + (half - x))
    return (2 * half + (y + half)) if x > 0 else (6 * half + (half - y))


def make_easel(idx, base, face_dir, colors, parent=None, height=2.05, board=1.15):
    """A-frame easel; Easel_N origin at its feet. Child Easel_N_Canvas marks the
    1 x 1 drawing plane (three.js: local XY, facing +Z) and Easel_N_Avatar the
    spot on the front leg for the player's avatar."""
    g = Geo("Easel_%d" % idx, seed=idx * 31, max_seg=1)
    wood, board_c, trim = colors["wood"], colors["board"], colors["trim"]
    tilt = 9.0
    for sx in (-1, 1):
        g.stick((sx * 0.46, -0.24, 0.0), (sx * 0.3, 0.02, height), 0.045, segs=6, color=wood)
        g.cyl(0.07, 0.06, base=(sx * 0.46, -0.24, 0.0), segs=6, color=trim)
    g.stick((0, 0.62, 0.0), (0, 0.06, height - 0.08), 0.04, segs=6, color=wood)
    g.box((0.78, 0.12, 0.1), loc=(0, 0.02, height), bevel=0.04, color=trim)
    # tray / ledge
    g.box((1.36, 0.2, 0.07), loc=(0, -0.2, 0.6), bevel=0.03, color=trim)
    g.box((1.36, 0.04, 0.09), loc=(0, -0.29, 0.66), bevel=0.015, color=trim)
    # crossbar behind the board
    g.box((0.74, 0.06, 0.06), loc=(0, 0.0, 1.7), bevel=0.02, color=wood)
    # canvas board, tilted back
    cz = 0.66 + board / 2 + 0.02
    cy = -0.12
    g.box((board, 0.06, board), loc=(0, cy, cz), rot=(-tilt, 0, 0), bevel=0.025, color=board_c,
          shade=(0.94, 1.03))
    # a few paint dabs on the tray for charm
    for k, c in enumerate(colors.get("dabs", [])):
        g.sphere((0.06, 0.05, 0.03), loc=(-0.45 + k * 0.2, -0.22, 0.645), segs=6, rings=3, color=c)
    d = Vector(face_dir).normalized()
    yaw = math.degrees(math.atan2(d.x, -d.y))
    ob = g.build(origin=(0, 0, 0))
    place(ob, mat(base, (0, 0, yaw)), parent)
    bpy.context.view_layer.update()
    # canvas marker, in the easel's local frame then to world
    q = Euler((0, 0, math.radians(yaw))).to_quaternion()
    n_local = Euler((math.radians(-tilt), 0, 0)).to_matrix() @ Vector((0, -1, 0))
    up_local = Euler((math.radians(-tilt), 0, 0)).to_matrix() @ Vector((0, 0, 1))
    c_local = Vector((0, cy, cz)) + n_local * 0.035
    wpos = Vector(base) + q @ c_local
    plane_marker("Easel_%d_Canvas" % idx, wpos, q @ n_local, 1.0, 1.0, parent=ob, up=q @ up_local)
    empty("Easel_%d_Avatar" % idx, Vector(base) + q @ Vector((-0.42, -0.3, 0.32)),
          rot=Euler((0, 0, math.radians(yaw))), parent=ob, size=0.15)
    return ob


def make_pedestal(idx, base, g, top_h, parent=None, props=None):
    """Finish a themed pedestal Geo: Pedestal_N origin at its base with a child
    Pedestal_N_Top where the creature stands."""
    ob = g.build(origin=base, parent=parent, props=props)
    empty("Pedestal_%d_Top" % idx, (base[0], base[1], base[2] + top_h), parent=ob, size=0.3)
    return ob


# Stroke font for neon / sign letters, glyphs on a 0..1 x 0..1.4 box.
GLYPHS = {
    "A": [[(0, 0), (0.5, 1.4), (1, 0)], [(0.22, 0.6), (0.78, 0.6)]],
    "E": [[(1, 1.4), (0, 1.4), (0, 0), (1, 0)], [(0, 0.7), (0.75, 0.7)]],
    "T": [[(0, 1.4), (1, 1.4)], [(0.5, 1.4), (0.5, 0)]],
    "O": [[(0.5, 0), (0.15, 0.15), (0, 0.7), (0.15, 1.25), (0.5, 1.4), (0.85, 1.25), (1, 0.7),
           (0.85, 0.15), (0.5, 0)]],
    "P": [[(0, 0), (0, 1.4), (0.75, 1.4), (1, 1.15), (1, 0.95), (0.75, 0.7), (0, 0.7)]],
    "N": [[(0, 0), (0, 1.4), (1, 0), (1, 1.4)]],
    "S": [[(1, 1.2), (0.75, 1.4), (0.25, 1.4), (0, 1.15), (0.1, 0.85), (0.9, 0.55), (1, 0.25),
           (0.75, 0), (0.25, 0), (0, 0.2)]],
    "L": [[(0, 1.4), (0, 0), (0.9, 0)]],
    "I": [[(0.5, 0), (0.5, 1.4)]],
    "F": [[(1, 1.4), (0, 1.4), (0, 0)], [(0, 0.75), (0.7, 0.75)]],
    "G": [[(1, 1.15), (0.75, 1.4), (0.25, 1.4), (0, 1.1), (0, 0.3), (0.25, 0), (0.75, 0), (1, 0.3),
           (1, 0.65), (0.55, 0.65)]],
    "H": [[(0, 0), (0, 1.4)], [(1, 0), (1, 1.4)], [(0, 0.7), (1, 0.7)]],
    "K": [[(0, 0), (0, 1.4)], [(1, 1.4), (0, 0.6)], [(0.3, 0.85), (1, 0)]],
    "C": [[(1, 1.15), (0.75, 1.4), (0.25, 1.4), (0, 1.1), (0, 0.3), (0.25, 0), (0.75, 0), (1, 0.25)]],
    "R": [[(0, 0), (0, 1.4), (0.75, 1.4), (1, 1.15), (1, 0.95), (0.75, 0.7), (0, 0.7)], [(0.5, 0.7), (1, 0)]],
    "U": [[(0, 1.4), (0, 0.3), (0.25, 0), (0.75, 0), (1, 0.3), (1, 1.4)]],
    "B": [[(0, 0), (0, 1.4), (0.7, 1.4), (0.95, 1.2), (0.7, 0.72), (0, 0.72)],
          [(0.7, 0.72), (1, 0.45), (1, 0.25), (0.75, 0), (0, 0)]],
    "D": [[(0, 0), (0, 1.4), (0.6, 1.4), (1, 1.0), (1, 0.4), (0.6, 0), (0, 0)]],
    "M": [[(0, 0), (0, 1.4), (0.5, 0.6), (1, 1.4), (1, 0)]],
    "W": [[(0, 1.4), (0.22, 0), (0.5, 0.8), (0.78, 0), (1, 1.4)]],
    "Y": [[(0, 1.4), (0.5, 0.7), (1, 1.4)], [(0.5, 0.7), (0.5, 0)]],
    "!": [[(0.5, 1.4), (0.5, 0.45)], [(0.5, 0.15), (0.5, 0.0)]],
}


def stroke_text(g, text, origin, height, color, r, axis_x=(1, 0, 0), axis_z=(0, 0, 1), spacing=0.35,
                segs=6, **kw):
    """Draw text as tubes (neon) on the plane spanned by axis_x / axis_z."""
    s = height / 1.4
    ax, az = Vector(axis_x).normalized(), Vector(axis_z).normalized()
    o = Vector(origin)
    widths = [(0.3 if ch == " " else (0.35 if ch in "I!" else 1.0)) for ch in text]
    total = sum(widths) * s + spacing * s * (len(text) - 1)
    cursor = -total / 2
    for ch, wch in zip(text, widths):
        for stroke in GLYPHS.get(ch, []):
            pts = []
            for x, z in stroke:
                xx = (x - 0.5) * wch if ch in "I!" else x
                if ch in "I!":
                    xx = wch / 2 + (x - 0.5) * 0.0
                pts.append(o + ax * (cursor + xx * s) + az * (z * s))
            if len(pts) >= 2:
                g.tube(pts, r, segs=segs, color=color, **kw)
        cursor += wch * s + spacing * s
    return g
