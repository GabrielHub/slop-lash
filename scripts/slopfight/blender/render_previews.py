"""Render preview PNGs of exported SlopFight GLBs from their Cam_* empties.

    blender --background --factory-startup --python render_previews.py -- \
        [--out DIR] [--res 1280x720] [--cams Cam_FightWide,Cam_Establish] [--no-sheet] [--standins] [GLB ...]

With no GLB arguments it renders every arena GLB in public/models/slopfight
(and a turntable sheet for props.glb). The material is a quick toon
approximation (two-band ramp on the vertex colour, warm rim, inverted-hull
outlines) under a warm key / cool fill / rim rig plus the arena's Light_*
practicals, so the previews read like the three.js stage will, not like a
final render.

--standins drops 1-unit bean fighters where each shot expects them (the
face-off marks, the roster marks, the pedestal tops, the podium, and 0.3
inside the rim for each Cam_Edge_*) and writes <name>_<Cam>_standins.png, to
judge framing rather than set dressing.
"""

import math
import os
import sys
import tempfile

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT_DIR, argv_after_dashes, hexc  # noqa: E402

DEFAULT_OUT = os.path.join(tempfile.gettempdir(), "slopfight-previews")

# Per-arena preview mood: world colour, key colour/strength, fill, rim.
MOODS = {
    "garage": dict(world="#2b3a36", world_s=0.55, key="#ffd9a8", key_s=2.6, fill="#9fc4d8", fill_s=0.9,
                   rim="#fff0c8", rim_s=2.2, key_dir=(55, 0, -35)),
    "kitchen": dict(world="#4a3346", world_s=0.6, key="#ffcf9a", key_s=2.8, fill="#b6b8ff", fill_s=0.8,
                    rim="#ffd0a0", rim_s=2.0, key_dir=(52, 0, 35)),
    "rooftop": dict(world="#2c2346", world_s=0.6, key="#ffc89a", key_s=2.2, fill="#8f9cff", fill_s=1.0,
                    rim="#ffe0b0", rim_s=2.4, key_dir=(50, 0, -30)),
    "props": dict(world="#3a3448", world_s=0.8, key="#ffe2bd", key_s=3.0, fill="#a9c2ff", fill_s=1.0,
                  rim="#fff2d8", rim_s=2.0, key_dir=(50, 0, -40)),
}


def parse_args():
    args = argv_after_dashes()
    opts = {"out": DEFAULT_OUT, "res": (1280, 720), "cams": None, "sheet": True, "standins": False, "files": []}
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--out":
            opts["out"] = args[i + 1]
            i += 2
        elif a == "--res":
            w, h = args[i + 1].lower().split("x")
            opts["res"] = (int(w), int(h))
            i += 2
        elif a == "--cams":
            opts["cams"] = set(args[i + 1].split(","))
            i += 2
        elif a == "--no-sheet":
            opts["sheet"] = False
            i += 1
        elif a == "--standins":
            opts["standins"] = True
            i += 1
        else:
            opts["files"].append(a)
            i += 1
    if not opts["files"]:
        opts["files"] = [os.path.join(OUT_DIR, f) for f in ("garage.glb", "kitchen.glb", "rooftop.glb",
                                                            "props.glb")
                         if os.path.exists(os.path.join(OUT_DIR, f))]
    return opts


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- materials


def toon_material():
    m = bpy.data.materials.new("PreviewToon")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    n = nt.nodes.new
    out = n("ShaderNodeOutputMaterial")
    vc = n("ShaderNodeVertexColor")
    vc.layer_name = "Color"
    diff = n("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = n("ShaderNodeShaderToRGB")
    nt.links.new(diff.outputs[0], s2r.inputs[0])
    bw = n("ShaderNodeRGBToBW")
    nt.links.new(s2r.outputs["Color"], bw.inputs[0])
    ramp = n("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = (0.46, 0.44, 0.52, 1)
    els[1].position = 0.30
    els[1].color = (1.0, 1.0, 1.0, 1)
    mid = els.new(0.20)
    mid.color = (0.50, 0.48, 0.56, 1)
    hi = els.new(0.85)
    hi.color = (1.12, 1.1, 1.06, 1)
    nt.links.new(bw.outputs[0], ramp.inputs[0])
    # light tint: colour / brightness, half strength
    add = n("ShaderNodeMath")
    add.operation = "ADD"
    add.inputs[1].default_value = 0.08
    nt.links.new(bw.outputs[0], add.inputs[0])
    div = n("ShaderNodeVectorMath")
    div.operation = "DIVIDE"
    nt.links.new(s2r.outputs["Color"], div.inputs[0])
    nt.links.new(add.outputs[0], div.inputs[1])
    tint = n("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.inputs["Factor"].default_value = 0.45
    tint.inputs["A"].default_value = (1, 1, 1, 1)
    nt.links.new(div.outputs[0], tint.inputs["B"])
    m1 = n("ShaderNodeMix")
    m1.data_type = "RGBA"
    m1.blend_type = "MULTIPLY"
    m1.inputs["Factor"].default_value = 1.0
    nt.links.new(vc.outputs["Color"], m1.inputs["A"])
    nt.links.new(ramp.outputs["Color"], m1.inputs["B"])
    m2 = n("ShaderNodeMix")
    m2.data_type = "RGBA"
    m2.blend_type = "MULTIPLY"
    m2.inputs["Factor"].default_value = 1.0
    nt.links.new(m1.outputs["Result"], m2.inputs["A"])
    nt.links.new(tint.outputs["Result"], m2.inputs["B"])
    # warm rim
    lw = n("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.25
    rr = n("ShaderNodeValToRGB")
    rr.color_ramp.elements[0].position = 0.55
    rr.color_ramp.elements[0].color = (0, 0, 0, 1)
    rr.color_ramp.elements[1].position = 0.62
    rr.color_ramp.elements[1].color = (0.22, 0.17, 0.11, 1)
    nt.links.new(lw.outputs["Facing"], rr.inputs[0])
    m3 = n("ShaderNodeMix")
    m3.data_type = "RGBA"
    m3.blend_type = "ADD"
    m3.inputs["Factor"].default_value = 1.0
    nt.links.new(m2.outputs["Result"], m3.inputs["A"])
    nt.links.new(rr.outputs["Color"], m3.inputs["B"])
    em = n("ShaderNodeEmission")
    nt.links.new(m3.outputs["Result"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def emissive_material(strength=5.0):
    m = bpy.data.materials.new("PreviewEmissive")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Color"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = strength
    nt.links.new(vc.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def outline_material():
    m = bpy.data.materials.new("PreviewOutline")
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Color"
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    mul.inputs["B"].default_value = (0.16, 0.12, 0.16, 1)
    nt.links.new(vc.outputs["Color"], mul.inputs["A"])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(mul.outputs["Result"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def is_emissive(ob):
    return ob.name.endswith("_Emissive") or bool(ob.get("emissive"))


def dress_materials(outline_w=0.022):
    toon, outl = toon_material(), outline_material()
    emis = {}
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        if ob.name == "Collision" or ob.get("collision"):
            ob.hide_render = True
            continue
        ob.data.materials.clear()
        if is_emissive(ob):
            # big glowing panels (windows, sky cards) carry a low emissive_strength extra
            k = round(float(ob.get("emissive_strength", 5.0)), 2)
            if k not in emis:
                emis[k] = emissive_material(k)
            ob.data.materials.append(emis[k])
        else:
            ob.data.materials.append(toon)
        if is_emissive(ob) or ob.name.startswith("Hazard_Water"):
            continue
        ob.data.materials.append(outl)
        mod = ob.modifiers.new("outline", "SOLIDIFY")
        mod.thickness = outline_w
        mod.offset = 1.0
        mod.use_flip_normals = True
        mod.use_rim = False
        mod.material_offset = 1


# ---------------------------------------------------------------- lighting


def sun(name, color, strength, rot_deg, angle=8.0):
    ld = bpy.data.lights.new(name, "SUN")
    ld.color = hexc(color)
    ld.energy = strength
    ld.angle = math.radians(angle)
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = [math.radians(a) for a in rot_deg]
    return ob


def rig(mood):
    kx, ky, kz = mood["key_dir"]
    sun("Key", mood["key"], mood["key_s"], (kx, ky, kz), angle=6)
    sun("Fill", mood["fill"], mood["fill_s"], (60, 0, 150), angle=30).data.use_shadow = False
    sun("Rim", mood["rim"], mood["rim_s"], (-58, 0, 10), angle=4).data.use_shadow = False


def practicals():
    for ob in list(bpy.data.objects):
        kind = ob.get("light_kind")
        if not kind:
            continue
        color = hexc(ob.get("light_color", "#ffffff"))
        inten = float(ob.get("light_intensity", 10))
        if kind == "point":
            ld = bpy.data.lights.new(ob.name + "_L", "POINT")
            ld.energy = inten * 12
            ld.shadow_soft_size = 0.3
        elif kind == "spot":
            ld = bpy.data.lights.new(ob.name + "_L", "SPOT")
            ld.energy = inten * 14
            ld.spot_size = math.radians(float(ob.get("light_angle", 60)))
        else:
            ld = bpy.data.lights.new(ob.name + "_L", "AREA")
            ld.shape = "RECTANGLE"
            ld.size = float(ob.get("light_width", 2))
            ld.size_y = float(ob.get("light_height", 2))
            ld.energy = inten * 20
        ld.color = color
        lo = bpy.data.objects.new(ld.name, ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.matrix_world = ob.matrix_world.copy()


def world(mood):
    w = bpy.data.worlds.new("W")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    c = hexc(mood["world"])
    bg.inputs["Color"].default_value = (c[0], c[1], c[2], 1)
    bg.inputs["Strength"].default_value = mood["world_s"]


def setup_render(res):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.eevee.taa_render_samples = 24
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"
    try:
        ng = bpy.data.node_groups.new("PreviewComp", "CompositorNodeTree")
        ng.interface.new_socket("Image", in_out="INPUT", socket_type="NodeSocketColor")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        gi = ng.nodes.new("NodeGroupInput")
        go = ng.nodes.new("NodeGroupOutput")
        rl = ng.nodes.new("CompositorNodeRLayers")
        gl = ng.nodes.new("CompositorNodeGlare")
        try:
            gl.glare_type = "BLOOM"
        except Exception:
            pass
        for key, val in (("Threshold", 1.0), ("Strength", 0.6), ("Size", 0.6)):
            if key in gl.inputs:
                gl.inputs[key].default_value = val
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
        ng.links.new(gl.outputs["Image"], go.inputs[0])
        sc.compositing_node_group = ng
        sc.render.use_compositing = True
    except Exception as e:  # compositor API drift is not worth failing a preview
        print("bloom disabled:", e)


def camera_from(empty_ob):
    cd = bpy.data.cameras.new(empty_ob.name + "_cam")
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(float(empty_ob.get("fov", 40)))
    cd.clip_start = 0.05
    cd.clip_end = 400
    co = bpy.data.objects.new(empty_ob.name + "_cam", cd)
    bpy.context.scene.collection.objects.link(co)
    co.matrix_world = empty_ob.matrix_world.copy()
    return co


def contact_sheet(paths, out, cols=4, cell=(480, 270)):
    import numpy as np

    rows = (len(paths) + cols - 1) // cols
    W, H = cell[0] * cols, cell[1] * rows
    sheet = np.zeros((H, W, 4), dtype=np.float32)
    sheet[..., 3] = 1
    for i, p in enumerate(paths):
        img = bpy.data.images.load(p)
        img.scale(cell[0], cell[1])
        px = np.array(img.pixels[:], dtype=np.float32).reshape(cell[1], cell[0], 4)
        r, c = divmod(i, cols)
        y0 = H - (r + 1) * cell[1]
        sheet[y0 : y0 + cell[1], c * cell[0] : (c + 1) * cell[0]] = px
        bpy.data.images.remove(img)
    im = bpy.data.images.new("sheet", W, H, alpha=True)
    im.pixels = sheet.ravel()
    im.filepath_raw = out
    im.file_format = "PNG"
    im.save()
    print("SHEET", out)


STANDIN_COLORS = ["#ffd56a", "#c8b0f0", "#ff8a5c", "#8fd6b4"]


def standin(name, color):
    """A 1-unit bean with eyes on its -Y side, origin at its feet."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    bmesh.ops.scale(bm, vec=(0.3, 0.27, 0.5), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, 0.5), verts=bm.verts)
    body = len(bm.faces)
    for sx in (-1, 1):
        eye = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.075)
        bmesh.ops.translate(bm, vec=(sx * 0.11, -0.24, 0.68), verts=eye["verts"])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
    c = hexc(color)
    cols = []
    for p in me.polygons:
        cc = c if p.index < body else (1.0, 0.98, 0.94)
        cols.extend([cc[0], cc[1], cc[2], 1.0] * p.loop_total)
    attr.data.foreach_set("color_srgb", cols)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def standin_spots(cam_name, obs):
    """Where fighters stand for this shot: [(position, face_towards), ...]."""
    def at(n):
        o = obs.get(n)
        return o.matrix_world.translation.copy() if o else None

    if cam_name.startswith("Cam_Edge_"):
        p = {"N": (0, 2.7), "E": (2.7, 0), "S": (0, -2.7), "W": (-2.7, 0)}[cam_name[-1]]
        return [(Vector((p[0], p[1], 0.0)), Vector((0, 0, 0)))]
    if cam_name == "Cam_Roster":
        return [(at("Mark_Roster_%d" % i), None) for i in range(1, 5)]
    if cam_name == "Cam_Foundry":
        return [(at("Pedestal_%d_Top" % i), None) for i in range(1, 5)]
    if cam_name == "Cam_Podium":
        return [(at("Podium_%d" % i), None) for i in range(1, 4)]
    if cam_name in ("Cam_Build", "Cam_Scoreboard"):
        return []
    a, b = at("Mark_FaceOff_A"), at("Mark_FaceOff_B")
    return [(a, b), (b, a)] if a is not None and b is not None else []


def place_standins(beans, spots, cam):
    for i, b in enumerate(beans):
        if i >= len(spots) or spots[i][0] is None:
            b.hide_render = True
            continue
        pos, look = spots[i]
        b.hide_render = False
        b.location = pos
        # face the rival, else the camera (local -Y is the face)
        tgt = look if look is not None else cam.matrix_world.translation
        d = Vector((tgt.x - pos.x, tgt.y - pos.y, 0.0))
        b.rotation_euler = (0, 0, math.atan2(d.x, -d.y) if d.length > 1e-4 else 0.0)


def render_arena(path, opts):
    reset()
    base = os.path.splitext(os.path.basename(path))[0]
    bpy.ops.import_scene.gltf(filepath=path)
    mood = MOODS.get(base, MOODS["props"])
    dress_materials()
    rig(mood)
    practicals()
    world(mood)
    setup_render(opts["res"])
    sc = bpy.context.scene
    cams = sorted([o for o in bpy.data.objects if o.name.startswith("Cam_")], key=lambda o: o.name)
    podium = bpy.data.objects.get("Podium")
    obs = {o.name: o for o in bpy.data.objects}
    beans = []
    if opts["standins"]:
        toon = bpy.data.materials.get("PreviewToon")
        for i, c in enumerate(STANDIN_COLORS):
            b = standin("Standin_%d" % (i + 1), c)
            b.data.materials.append(toon)
            beans.append(b)
    suffix = "_standins" if opts["standins"] else ""
    written = []
    for e in cams:
        if opts["cams"] and e.name not in opts["cams"]:
            continue
        if podium is not None:
            show = e.name == "Cam_Podium"
            for o in [podium] + list(podium.children_recursive):
                o.hide_render = not show
        sc.camera = camera_from(e)
        if beans:
            place_standins(beans, standin_spots(e.name, obs), e)
        sc.render.filepath = os.path.join(opts["out"], "%s_%s%s.png" % (base, e.name, suffix))
        bpy.ops.render.render(write_still=True)
        written.append(sc.render.filepath)
        print("RENDERED", sc.render.filepath)
    if opts["sheet"] and written:
        contact_sheet(written, os.path.join(opts["out"], "%s__sheet%s.png" % (base, suffix)))


def render_props(path, opts):
    """Lay every Prop_* out on a grid and render one overview plus close-ups."""
    reset()
    bpy.ops.import_scene.gltf(filepath=path)
    dress_materials(outline_w=0.008)
    props = sorted([o for o in bpy.data.objects if o.name.startswith("Prop_") and o.parent is None],
                   key=lambda o: o.name)
    cols = 7
    for i, o in enumerate(props):
        r, c = divmod(i, cols)
        o.location = Vector(((c - (cols - 1) / 2) * 0.9, r * 0.9, 0.35))
        o.rotation_euler = (0, 0, math.radians(-25))
    # ground card
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    g = bpy.context.active_object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.25, 0.36, 1)
    g.data.materials.append(gm)
    mood = MOODS["props"]
    rig(mood)
    world(mood)
    setup_render(opts["res"])
    rows = (len(props) + cols - 1) // cols
    cd = bpy.data.cameras.new("pc")
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(30)
    co = bpy.data.objects.new("pc", cd)
    bpy.context.scene.collection.objects.link(co)
    target = Vector((0, (rows - 1) * 0.45, 0.35))
    co.location = target + Vector((0, -6.2, 4.2))
    co.rotation_euler = (target - co.location).to_track_quat("-Z", "Y").to_euler()
    sc = bpy.context.scene
    sc.camera = co
    sc.render.filepath = os.path.join(opts["out"], "props_overview.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", sc.render.filepath)
    # close-ups: hide all but one prop, frame its bounds from the front-left
    sc.render.resolution_x, sc.render.resolution_y = 480, 480
    cd.angle_y = math.radians(26)
    written = []
    for o in props:
        for other in props:
            other.hide_render = other is not o
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        c = (lo + hi) / 2
        size = max((hi - lo).length, 0.2)
        d = size / (2 * math.tan(cd.angle_y / 2)) * 1.25
        co.location = c + Vector((-0.45, -1.0, 0.45)).normalized() * d
        co.rotation_euler = (c - co.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(opts["out"], "props_%s.png" % o.name)
        bpy.ops.render.render(write_still=True)
        written.append(sc.render.filepath)
    for other in props:
        other.hide_render = False
    if opts["sheet"] and written:
        contact_sheet(written, os.path.join(opts["out"], "props__sheet.png"), cols=7, cell=(240, 240))


def main():
    opts = parse_args()
    os.makedirs(opts["out"], exist_ok=True)
    for f in opts["files"]:
        if os.path.basename(f).startswith("props"):
            render_props(f, opts)
        else:
            render_arena(f, opts)


main()
