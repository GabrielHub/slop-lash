"""Re-import the exported GLBs in a fresh Blender and check the node contract.

    blender --background --factory-startup --python verify_glb.py [-- file.glb ...]

For every GLB: node names (hierarchy), triangle count (total and per node),
Floor / Collision bounding boxes in three.js coordinates, a check that every
contract node exists, and checks read straight from the GLB JSON: COLOR_0 on
every primitive, Light_* extras, emissive tagging, and that each Cam_* node's
local -Y (Blender -Z after the +Y-up conversion) matches its extras.forward.
Exits non-zero if any check fails.
"""

import json
import math
import os
import re
import struct
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, HERE)
from common import OUT_DIR, VOCAB_TS, platform_colliders, read_arena  # noqa: E402

ARENA_OF = {"garage": "FLOODED_GARAGE", "kitchen": "KITCHEN_COUNTER", "rooftop": "ROOFTOP"}
CAMS = ["Cam_Establish", "Cam_Establish_End", "Cam_Build", "Cam_Foundry", "Cam_Roster", "Cam_FaceOff_A",
        "Cam_FaceOff_B", "Cam_FightWide", "Cam_Edge_N", "Cam_Edge_E", "Cam_Edge_S", "Cam_Edge_W", "Cam_Podium",
        "Cam_Scoreboard"]
COMMON = (["Floor", "Collision", "Edge", "Pit", "Crowd"] + ["Crowd_%02d" % i for i in range(1, 21)]
          + ["Marquee", "Marquee_Text", "Scoreboard", "Scoreboard_Text", "Podium", "Podium_1", "Podium_2", "Podium_3"]
          + ["Easel_%d" % i for i in range(1, 5)] + ["Easel_%d_Canvas" % i for i in range(1, 5)]
          + ["Pedestal_%d" % i for i in range(1, 5)] + ["Pedestal_%d_Top" % i for i in range(1, 5)] + CAMS)
PER_ARENA = {
    "garage": ["Hazard_Water", "Light_Tube", "Tube_Emissive", "Probe_Ambient", "Light_Work_Build", "Light_Work_Foundry"],
    "kitchen": ["Hazard_Sink", "Hazard_Toaster", "Light_Window", "Window_Emissive", "Clock", "Probe_Ambient",
                "Light_Pendant", "Pendant_Emissive", "Light_Work_Build", "Light_Work_Foundry"],
    "rooftop": ["Hazard_Wind_Laundry_1", "Light_Neon", "Neon_Emissive", "Probe_Ambient",
                "Light_Ring_Key", "Light_Ring_Fill", "Light_Work_Build", "Light_Work_Foundry"],
}
PARENTS = {"Marquee_Text": "Marquee", "Scoreboard_Text": "Scoreboard", "Podium_1": "Podium", "Podium_2": "Podium",
           "Podium_3": "Podium"}
PARENTS.update({"Crowd_%02d" % i: "Crowd" for i in range(1, 21)})
PARENTS.update({"Easel_%d_Canvas" % i: "Easel_%d" % i for i in range(1, 5)})
PARENTS.update({"Pedestal_%d_Top" % i: "Pedestal_%d" % i for i in range(1, 5)})

FAILS = []
FLOOR_TOL = 0.02  # GEOMETRY_TOLERANCE in stage3d/arena/geometry-check.ts
PROP_LIMITS = {"briefcase": 800, "boxing_glove": 800, "trumpet": 800}


def fail(msg):
    FAILS.append(msg)
    print("  FAIL", msg)


def read_glb_json(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, _ver, _len = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB"
    clen, ctype = struct.unpack_from("<II", data, 12)
    return json.loads(data[20:20 + clen].decode("utf-8"))


def node_matrix(n):
    if "matrix" in n:
        m = n["matrix"]
        return Matrix([m[0:4], m[4:8], m[8:12], m[12:16]]).transposed()
    t = Vector(n.get("translation", (0, 0, 0)))
    r = n.get("rotation", (0, 0, 0, 1))
    q = Quaternion((r[3], r[0], r[1], r[2]))
    s = Vector(n.get("scale", (1, 1, 1)))
    return Matrix.LocRotScale(t, q, s)


def json_checks(path, base):
    gj = read_glb_json(path)
    nodes = gj["nodes"]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i

    def world(i):
        m = node_matrix(nodes[i])
        while i in parent:
            i = parent[i]
            m = node_matrix(nodes[i]) @ m
        return m

    # COLOR_0 on every primitive
    prims = [(m.get("name"), p) for m in gj.get("meshes", []) for p in m["primitives"]]
    no_col = [name for name, p in prims if "COLOR_0" not in p["attributes"]]
    print("  primitives: %d, with COLOR_0: %d" % (len(prims), len(prims) - len(no_col)))
    if no_col:
        fail("%s: primitives without COLOR_0: %s" % (base, no_col[:8]))
    for node in nodes:
        if node.get("name") == "Probe_Ambient":
            coefficients = node.get("extras", {}).get("sf_probe_sh", [])
            if len(coefficients) != 27 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in coefficients):
                fail("%s: invalid baked irradiance coefficients" % base)
        surface = node.get("extras", {}).get("sf_surface")
        if surface is not None and surface not in ("matte", "satin", "gloss"):
            fail("%s: %s has unknown sf_surface %r" % (base, node.get("name"), surface))
        if node.get("name") == "Floor" and surface != "matte":
            fail("%s: Floor must keep a matte finish for fight readability" % base)
        bake = node.get("extras", {}).get("sf_ao_bake")
        if bake is not None:
            radius = node.get("extras", {}).get("sf_ao_radius")
            if bake != "local-v1" or not isinstance(radius, (int, float)) or not 0 < radius <= 0.45:
                fail("%s: %s has invalid ambient bake metadata" % (base, node.get("name")))
    # emissive tagging
    emis = [n["name"] for n in nodes if n.get("name", "").endswith("_Emissive") or n.get("extras", {}).get("emissive")]
    untagged = [n["name"] for n in nodes if n.get("name", "").endswith("_Emissive")
                and not n.get("extras", {}).get("emissive")]
    print("  emissive nodes (%d): %s" % (len(emis), ", ".join(emis)))
    if untagged:
        print("  note: _Emissive by suffix only:", untagged)
    # lights
    for n in nodes:
        name = n.get("name", "")
        if not name.startswith("Light_"):
            continue
        ex = n.get("extras", {})
        ok = (ex.get("light_kind") in ("point", "spot", "rect")
              and re.fullmatch(r"#[0-9a-fA-F]{6}", str(ex.get("light_color", "")))
              and isinstance(ex.get("light_intensity"), (int, float))
              and 0.0 <= float(ex.get("light_flicker", -1)) <= 1.0)
        print("  %-16s kind=%-5s color=%s intensity=%s flicker=%s %s" % (
            name, ex.get("light_kind"), ex.get("light_color"), ex.get("light_intensity"), ex.get("light_flicker"),
            "" if ok else "<- BAD"))
        if not ok:
            fail("%s: %s extras incomplete" % (base, name))
    # cameras: local -Y must equal extras.forward, local -Z extras.up (three.js world)
    worst = 0.0
    for i, n in enumerate(nodes):
        name = n.get("name", "")
        if not name.startswith("Cam_"):
            continue
        ex = n.get("extras", {})
        m = world(i).to_3x3()
        fwd = (m @ Vector((0, -1, 0))).normalized()
        up = (m @ Vector((0, 0, -1))).normalized()
        if "forward" not in ex or "fov" not in ex:
            fail("%s: %s missing fov/forward extras" % (base, name))
            continue
        ef, eu = Vector(ex["forward"]).normalized(), Vector(ex["up"]).normalized()
        err = max(math.degrees(fwd.angle(ef)), math.degrees(up.angle(eu)))
        worst = max(worst, err)
        if err > 0.5:
            fail("%s: %s orientation off by %.2f deg" % (base, name, err))
    if any(n.get("name", "").startswith("Cam_") for n in nodes):
        print("  Cam_* orientation (local -Y fwd / -Z up vs extras): worst error %.4f deg" % worst)
    return gj


def blender_checks(path, base):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = {o.name: o for o in bpy.data.objects}
    dg = bpy.context.evaluated_depsgraph_get()

    def tris(o):
        if o.type != "MESH":
            return 0
        return sum(len(p.vertices) - 2 for p in o.data.polygons)

    total = sum(tris(o) for o in obs.values())
    print("  TOTAL TRIS: %d (%d nodes, %d meshes)" % (total, len(obs), sum(1 for o in obs.values() if o.type == "MESH")))

    def tree(o, depth):
        t = tris(o)
        out = "  " + "  " * depth + o.name + (" [%d]" % t if t else "")
        lines.append(out)
        for c in sorted(o.children, key=lambda c: c.name):
            tree(c, depth + 1)

    lines = []
    for o in sorted((o for o in obs.values() if o.parent is None), key=lambda o: o.name):
        tree(o, 0)
    print("  NODES:")
    print("\n".join("  " + ln for ln in lines))

    def bbox3(o):
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        # Blender -> three.js: (x, z, -y)
        return ((lo[0], lo[2], -hi[1]), (hi[0], hi[2], -lo[1]))

    return obs, total, bbox3, tris


def check_arena(path, base):
    print("\n== %s (%s)" % (os.path.basename(path), ARENA_OF[base]))
    json_checks(path, base)
    obs, total, bbox3, tris = blender_checks(path, base)
    if total >= 30000:
        fail("%s: %d tris >= 30000" % (base, total))
    for name in ("Floor", "Collision"):
        if name in obs:
            lo, hi = bbox3(obs[name])
            print("  %s bbox (three.js) min=(%.3f, %.3f, %.3f) max=(%.3f, %.3f, %.3f)" % ((name,) + lo + hi))
    geo = read_arena(ARENA_OF[base])
    # Floor vs arenas.ts, the same test as checkFloor() in
    # src/games/slopfight/stage3d/arena/geometry-check.ts (tolerance 0.02)
    if "Floor" in obs:
        flo, fhi = bbox3(obs["Floor"])
        half_x = max(abs(flo[0]), abs(fhi[0]))
        half_z = max(abs(flo[2]), abs(fhi[2]))
        cx, cz = (flo[0] + fhi[0]) / 2, (flo[2] + fhi[2]) / 2
        bad = []
        if abs(fhi[1] - geo["top"]) > FLOOR_TOL:
            bad.append("top y=%.3f, arenas.ts says %g" % (fhi[1], geo["top"]))
        if abs(half_x - geo["half"]) > FLOOR_TOL or abs(half_z - geo["half"]) > FLOOR_TOL:
            bad.append("half extents x=%.3f z=%.3f, arenas.ts says %g" % (half_x, half_z, geo["half"]))
        if abs(cx) > FLOOR_TOL or abs(cz) > FLOOR_TOL:
            bad.append("centred at (%.3f, %.3f)" % (cx, cz))
        print("  Floor vs arenas.ts (checkFloor, tol %.2f): %s" % (FLOOR_TOL, "; ".join(bad) or "OK"))
        if bad:
            fail("%s: Floor fails checkFloor: %s" % (base, "; ".join(bad)))
    # Collision must match platformColliders()
    boxes = platform_colliders(geo)
    lo = [min(b[0][i] for b in boxes) for i in range(3)]
    hi = [max(b[1][i] for b in boxes) for i in range(3)]
    if "Collision" in obs:
        clo, chi = bbox3(obs["Collision"])
        err = max(max(abs(a - b) for a, b in zip(lo, clo)), max(abs(a - b) for a, b in zip(hi, chi)))
        nb = obs["Collision"].get("boxes")
        print("  Collision vs platformColliders(): %d boxes (node says %s), bbox error %.4f" % (len(boxes), nb, err))
        if err > 1e-3 or nb != len(boxes):
            fail("%s: Collision does not match platformColliders()" % base)
        if tris(obs["Collision"]) != 12 * len(boxes):
            fail("%s: Collision is not %d plain boxes" % (base, len(boxes)))
    if geo["pits"] and "Pit" in obs:
        p = geo["pits"][0]
        plo, phi = bbox3(obs["Pit"])
        print("  Pit bbox (three.js) x %.3f..%.3f z %.3f..%.3f y %.3f..%.3f (arenas.ts x %.2f..%.2f z %.2f..%.2f "
              "depth %.2f)" % (plo[0], phi[0], plo[2], phi[2], plo[1], phi[1], p["minX"], p["maxX"], p["minZ"],
                               p["maxZ"], p["depth"]))
    missing = [n for n in COMMON + PER_ARENA[base] if n not in obs]
    misparented = [n for n, par in PARENTS.items() if n in obs and (obs[n].parent is None or obs[n].parent.name != par)]
    hazards = sorted(n for n in obs if n.startswith("Hazard_"))
    lights = sorted(n for n in obs if n.startswith("Light_"))
    print("  Hazards: %s" % ", ".join(hazards))
    print("  Lights: %s" % ", ".join(lights))
    print("  CONTRACT: %d/%d required nodes present%s%s" % (
        len(COMMON + PER_ARENA[base]) - len(missing), len(COMMON + PER_ARENA[base]),
        "; MISSING " + ", ".join(missing) if missing else "",
        "; MISPARENTED " + ", ".join(misparented) if misparented else ""))
    if missing:
        fail("%s: missing %s" % (base, missing))
    if misparented:
        fail("%s: misparented %s" % (base, misparented))
    crowd = obs.get("Crowd")
    if crowd and len([c for c in crowd.children if c.name.startswith("Crowd_")]) != 20:
        fail("%s: Crowd does not have 20 Crowd_NN children" % base)


def check_props(path):
    print("\n== %s" % os.path.basename(path))
    gj = json_checks(path, "props")
    obs, total, bbox3, tris = blender_checks(path, "props")
    src = open(VOCAB_TS, encoding="utf-8").read()
    tags = re.findall(r'"(\w+)"', re.search(r"export const PROP_TAGS = \[(.*?)\]", src, re.S).group(1))
    rows = []
    for tag in tags:
        name = "Prop_" + tag
        o = obs.get(name)
        if o is None:
            fail("props: missing %s" % name)
            continue
        t = tris(o)
        lo, hi = bbox3(o)
        loc = o.matrix_world.translation
        rows.append("  %-20s tris=%3d kind=%-10s hold=%-8s size=(%.2f x %.2f x %.2f) origin=(%.2f, %.2f, %.2f)" % (
            name, t, o.get("kind"), o.get("hold"), hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], loc.x, loc.z, -loc.y))
        limit = PROP_LIMITS.get(tag, 500)
        if t >= limit:
            fail("props: %s has %d tris (limit %d)" % (name, t, limit))
    print("\n".join(rows))
    print("  CONTRACT: %d/%d Prop_<tag> nodes present" % (sum(1 for t in tags if "Prop_" + t in obs), len(tags)))


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    files = args or [os.path.join(OUT_DIR, f) for f in ("garage.glb", "kitchen.glb", "rooftop.glb", "props.glb")]
    for f in files:
        base = os.path.splitext(os.path.basename(f))[0]
        if not os.path.exists(f):
            fail("missing file %s" % f)
            continue
        if base == "props":
            check_props(f)
        else:
            check_arena(f, base)
    print("\nVERIFY:", "OK" if not FAILS else "%d FAILURE(S)" % len(FAILS))
    for m in FAILS:
        print("  -", m)
    sys.stdout.flush()
    if FAILS:
        os._exit(1)


main()
