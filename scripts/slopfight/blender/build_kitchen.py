"""Kitchen Counter arena -> public/models/slopfight/kitchen.glb

    blender --background --factory-startup --python build_kitchen.py

The platform is a giant kitchen peninsula: a cream boomerang-laminate counter
(top at y = 0) with chrome banding on its three open sides and a tiled
backsplash wall closing the back edge, exactly as arenas.ts KITCHEN_COUNTER
says. The sink is cut into the counter upstage centre as the pit, with a
wall-mounted faucet (Hazard_Sink). Toy-sized fighters, giant kitchen: the
checker floor is nine units down. Easels stand on the left counter run,
pedestals (cake stands) on the right one; the crowd perches on the back
counter, the toaster, the fridge and two wall shelves. The marquee is a
back-bar sign standing on the backsplash ledge; the scoreboard is a menu
chalkboard on the back wall. Evening light pours through the window.
"""

import math
import os
import random
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (HALF, OUT_DIR, C, Geo, Vector, cam_empty, count_tris, crowd, edge_cams,  # noqa: E402
                    edge_lights, empty, export_glb, faceoff_cams, light_empty, make_easel, make_pedestal,
                    pit_rect_b, plane_marker, platform_collision, podium, read_arena, rect_sweep, reset_scene,
                    shade, b_from_t)

GEO = read_arena("KITCHEN_COUNTER")
TOP_Z = GEO["top"]
THICK = GEO["thickness"]
FLOOR_Z = GEO["surround"]["y"]  # -9: the kitchen floor
WALL_H = GEO["wall"]["height"]  # backsplash height above the top
WALL_T = GEO["wall"]["thickness"]
PITS_B = [pit_rect_b(p) for p in GEO["pits"]]  # Blender (x0, x1, y0, y1)
PIT_DEPTH = [p["depth"] for p in GEO["pits"]]

ROOM_X = 12.0
ROOM_BACK = 11.0
ROOM_FRONT = -14.0
CEIL = 14.0
SIDE_X0 = 5.6  # inner edge of the side counter runs
BACK_Y0 = 7.3  # front edge of the back counter run
FRIDGE_X0 = 7.2
STATION_X = 7.5
ROW_Y = (2.75, 0.92, -0.92, -2.75)
SIGN = (0.0, HALF + WALL_T / 2 + 0.12, TOP_Z + WALL_H + 0.95)  # marquee centre, on the backsplash ledge
WINDOW = (-4.5, 4.5, 1.9, 9.2)  # x0, x1, z0, z1 on the back wall

P = {
    "lam": "#f7ecd2",
    "lam_dk": "#eadbb8",
    "boom": ["#f3c4b2", "#c4e2d2", "#f2dca2", "#c9d6ee"],
    "edge": "#e4523f",
    "chrome": "#ece8f4",
    "chrome_dk": "#b9b4cf",
    "island": "#ffe2a8",
    "island_dk": "#f2c983",
    "cab": "#8fd6b4",
    "cab_dk": "#72c39f",
    "knob": "#fff1d6",
    "steel": "#d8d4e6",
    "steel_dk": "#9f9ab8",
    "suds": "#d6eef6",
    "basin": "#4a5676",
    "basin_dk": "#1e2232",
    "floor_a": "#fff1d6",
    "floor_b": "#6a4479",
    "wall": "#f9e3a8",
    "wall_lo": "#f3cf8e",
    "tile_a": "#fdf6e6",
    "tile_b": "#9fd9c4",
    "tile_c": "#e4523f",
    "grout": "#e7dcc6",
    "counter_top": "#f6eedc",
    "toaster": "#e4473c",
    "toast": "#e9a64e",
    "toast_crust": "#a8622e",
    "fridge": "#ffd56a",
    "fridge_dk": "#e9b94e",
    "board": "#3d4b3f",
    "board_rim": "#c98a52",
    "marquee": "#7a2a4a",
    "marquee_rim": "#ffd56a",
    "bulb": "#fff2c2",
    "glass_lo": "#ffb862",
    "glass_mid": "#f69a8c",
    "glass_hi": "#c99ae6",
    "skyline": "#8a4a6a",
    "curtain_a": "#e4523f",
    "curtain_b": "#fff6e4",
    "ink": "#4a3456",
}


# ---------------------------------------------------------------- platform


def _in_pit(x, y, pad=0.0):
    return any(x0 - pad < x < x1 + pad and y0 - pad < y < y1 + pad for (x0, x1, y0, y1) in PITS_B)


def _split(lo, hi, cuts, step):
    vals = {lo, hi, *[c for c in cuts if lo < c < hi]}
    n = int(round((hi - lo) / step))
    vals.update(lo + (hi - lo) * k / n for k in range(1, n))
    return sorted(vals)


def countertop():
    """Floor = laminate top (cells split around the sink, darker by the
    backsplash and the sink rim) + the counter body under it."""
    g = Geo("Floor", seed=3)
    xs = _split(-HALF, HALF, [v for p in PITS_B for v in p[:2]], 0.5)
    ys = _split(-HALF, HALF, [v for p in PITS_B for v in p[2:]], 0.5)
    lam = C(P["lam"])
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            x0, x1, y0, y1 = xs[i], xs[i + 1], ys[j], ys[j + 1]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if _in_pit(cx, cy):
                continue
            # AO: darker into the backsplash corner and around the sink
            k = 1.0 - 0.13 * max(0.0, 1.0 - (HALF - cy) / 1.4) ** 2
            for (px0, px1, py0, py1) in PITS_B:
                d = max(px0 - cx, cx - px1, py0 - cy, cy - py1, 0.0)
                k *= 1.0 - 0.16 * max(0.0, 1.0 - d / 0.7) ** 1.5
            g.quad([(x0, y0, TOP_Z), (x1, y0, TOP_Z), (x1, y1, TOP_Z), (x0, y1, TOP_Z)],
                   color=shade(lam, k), shade=(1, 1), jit=0, noise=0.006, flat=True)
    # counter body under the top (split around the sink so the hole stays open)
    bottom = TOP_Z - THICK
    for (x0, x1, y0, y1) in _solid_rects():
        g.slab(x0, x1, y0, y1, bottom, TOP_Z - 0.01, bevel=0.0, color=P["lam_dk"], shade=(0.8, 1.0), jit=0)
    # boomerang laminate pattern (decals) and a few crumbs (Crumb Cover)
    rng = random.Random(21)
    placed = 0
    while placed < 18:
        x, y = rng.uniform(-HALF + 0.25, HALF - 0.25), rng.uniform(-HALF + 0.25, HALF - 0.35)
        if _in_pit(x, y, 0.3):
            continue
        a = rng.uniform(0, 2 * math.pi)
        col = rng.choice(P["boom"])
        arm, wdt = rng.uniform(0.16, 0.24), 0.045
        for s in (-1, 1):
            b = a + s * 0.55
            d = Vector((math.cos(b), math.sin(b), 0))
            n = Vector((-d.y, d.x, 0)) * wdt * s
            p0 = Vector((x, y, TOP_Z + 0.004))
            p1 = p0 + d * arm
            pts = [p0 - n, p1 - n * 0.4, p1 + n * 0.4, p0 + n]
            if s < 0:
                pts.reverse()
            g.quad([tuple(v) for v in pts], color=col, shade=(1, 1), jit=0.02, noise=0)
        placed += 1
    floor = g.build(props={"surface": "laminate", "sf_surface": "matte"})
    # crumbs: their own node, because Floor's top must stay at y = 0 (the
    # stage's geometry check allows 0.02, and a crumb stands ~0.035 proud)
    crumbs = Geo("Set_Crumbs", seed=22, max_seg=1)
    for k in range(8):
        x, y = rng.uniform(-2.6, 2.6), rng.uniform(-2.6, 1.0)
        r = rng.uniform(0.035, 0.07)
        crumbs.sphere((r, r * 0.8, r * 0.42), loc=(x, y, TOP_Z + r * 0.08), rot=(0, 0, rng.uniform(0, 90)), segs=5,
                      rings=3, color=rng.choice(["#d99a52", "#c27d3c", "#e8b26a"]), shade=(0.8, 1.05))
    crumbs.build(props={"static": True, "sf_surface": "matte", "decor": "crumbs on the counter; not walkable geometry"})

    # Edge: chrome banding round the open sides with a tomato rim stripe on
    # top; along the back the stripe gives way to a cove into the backsplash.
    e = Geo("Edge")
    prof = [(-0.11, 0.004), (-0.005, 0.004), (0.012, -0.004), (0.03, -0.025), (0.035, -0.05),
            (0.025, -0.065), (0.035, -0.08), (0.035, -0.12), (0.028, -0.14), (0.028, -0.37), (0.0, -0.4)]

    def band(c, nrm, col):
        if c.y > HALF - 0.15 and abs(c.x) < HALF - 0.05:
            return C(P["chrome_dk"]) if c.z < -0.01 else shade(C(P["lam"]), 0.82)
        if c.z > 0.0 and nrm.z > 0.5:
            return C(P["edge"])
        if -0.13 < c.z <= 0.0:
            return C(P["chrome"])
        return C(P["edge"])

    rect_sweep(e, prof, band, nseg=6, shade=(0.85, 1.05), jit=0, noise=0)
    edge = e.build(props={"lip": False, "edges": "front/left/right open, back wall", "sf_surface": "satin"})
    edge_lights(edge, color="#ffd27a", n_per_side=8, inset=0.055, z=TOP_Z + 0.004, size=0.032,
                edges=GEO["edges"])
    return floor, edge


def _solid_rects():
    """The counter footprint minus the pits, as rectangles (Blender)."""
    out = []
    ys = sorted({-HALF, HALF, *[v for p in PITS_B for v in p[2:]]})
    for j in range(len(ys) - 1):
        y0, y1 = ys[j], ys[j + 1]
        cy = (y0 + y1) / 2
        spans = [(-HALF, HALF)]
        for (px0, px1, py0, py1) in PITS_B:
            if py0 < cy < py1:
                nxt = []
                for a, b in spans:
                    if px1 <= a or px0 >= b:
                        nxt.append((a, b))
                        continue
                    if px0 > a:
                        nxt.append((a, px0))
                    if px1 < b:
                        nxt.append((px1, b))
                spans = nxt
        out.extend((a, b, y0, y1) for a, b in spans)
    return out


def backsplash():
    """Wall_Back: the arenas.ts back-edge wall (1.6 high, 0.2 thick, outside
    the rim) as a tiled backsplash with a chrome-capped ledge on top."""
    g = Geo("Wall_Back", seed=8)
    y0, y1 = HALF, HALF + WALL_T
    top = TOP_Z + WALL_H
    bottom = TOP_Z - THICK
    g.slab(-HALF, HALF, y0, y1, bottom, top, bevel=0.0, color=P["grout"], shade=(0.85, 1.0), jit=0)
    # checker tiles proud of the face (2.97..3.0)
    cols, rows = 15, 4
    tw, th = 2 * HALF / cols, WALL_H / rows
    for r in range(rows):
        for c in range(cols):
            x0 = -HALF + c * tw
            z0 = TOP_Z + r * th
            col = P["tile_a"] if (r + c) % 2 == 0 else P["tile_b"]
            if r == rows - 1 and c % 2 == 1:
                col = P["tile_c"]
            g.slab(x0 + 0.018, x0 + tw - 0.018, y0 - 0.03, y0, z0 + 0.018, z0 + th - 0.018, bevel=0.0,
                   color=col, shade=(0.93, 1.03), jit=0.015)
    # ledge + chrome cap; rounded end caps
    g.slab(-HALF - 0.06, HALF + 0.06, y0 - 0.06, y1 + 0.45, top, top + 0.1, bevel=0.04, seg=1,
           color=P["chrome"], shade=(0.85, 1.05))
    for xa, xb in ((-HALF - 0.06, -HALF + 0.02), (HALF - 0.02, HALF + 0.06)):
        g.slab(xa, xb, y0 - 0.04, y1 + 0.02, bottom, top, bevel=0.02, seg=1, color=P["chrome"])
    # back face (seen from behind): mint panelling
    g.slab(-HALF, HALF, y1, y1 + 0.02, bottom, top, bevel=0.0, color=P["cab"], shade=(0.8, 1.0))
    ob = g.build(props={"edge_side": "back", "edge_kind": "wall", "collider": "wall", "sf_surface": "gloss"})
    # spice jars at the ledge ends (decor)
    jars = Geo("Set_Ledge_Jars", seed=4, max_seg=1)
    for k, (x, c) in enumerate(((-2.75, "#e4523f"), (-2.4, "#f1c24a"), (2.45, "#7fc45a"), (2.8, "#b35ac8"))):
        jars.cyl(0.13, 0.32, base=(x, y1 + 0.18, top + 0.1), segs=8, color="#fff6e4", shade=(0.85, 1.05))
        jars.cyl(0.14, 0.09, base=(x, y1 + 0.18, top + 0.42), segs=8, bevel=0.03, seg=1, color=c)
    jars.build(props={"static": True, "sf_surface": "gloss"})
    return ob


def sink():
    """Pit = the basin for each pit rect; Hazard_Sink = the wall faucet."""
    g = Geo("Pit", seed=6)
    rng = random.Random(9)
    for (x0, x1, y0, y1), depth in zip(PITS_B, PIT_DEPTH):
        t = 0.05
        fz = TOP_Z - depth
        for (a0, a1, b0, b1) in ((x0, x1, y0, y0 + t), (x0, x1, y1 - t, y1), (x0, x0 + t, y0, y1),
                                 (x1 - t, x1, y0, y1)):
            g.slab(a0, a1, b0, b1, fz, TOP_Z - 0.002, bevel=0.0, color=P["basin"], shade=(0.22, 0.78), jit=0)
        g.slab(x0, x1, y0, y1, fz - 0.06, fz, bevel=0.0, color=P["basin_dk"], shade=(1, 1))
        # dishwater + suds; the drain sits under the water
        wz = fz + 0.2
        g.slab(x0 + t, x1 - t, y0 + t, y1 - t, fz, wz, bevel=0.0, color="#2f6274", shade=(0.55, 0.8), jit=0)
        for k in range(9):
            r = rng.uniform(0.07, 0.15)
            g.sphere(r, loc=(rng.uniform(x0 + 0.18, x1 - 0.18), rng.uniform(y0 + 0.18, y1 - 0.18), wz + r * 0.2),
                     segs=7, rings=4, color="#f6fbff", shade=(0.85, 1.05))
        # a plate standing in the water and a mug, for scale
        g.cyl(0.32, 0.04, base=(x0 + 0.55, (y0 + y1) / 2 + 0.15, wz + 0.12), rot=(70, 0, 15), segs=12,
              color="#fff6e4", shade=(0.9, 1.05))
        g.cyl(0.13, 0.26, base=(x1 - 0.35, y0 + 0.35, wz - 0.1), rot=(0, 25, 0), segs=9, color=P["tile_b"],
              shade=(0.8, 1.05))
        # chrome rim, flush with the counter, just outside the hole
        rim = 0.07
        for (a0, a1, b0, b1) in ((x0 - rim, x1 + rim, y0 - rim, y0), (x0 - rim, x1 + rim, y1, y1 + rim),
                                 (x0 - rim, x0, y0, y1), (x1, x1 + rim, y0, y1)):
            g.quad([(a0, b0, TOP_Z + 0.003), (a1, b0, TOP_Z + 0.003), (a1, b1, TOP_Z + 0.003),
                    (a0, b1, TOP_Z + 0.003)], color=P["chrome"], shade=(1, 1), jit=0)
        # shadow throat: a dark band down the first few cm of the inner walls
        for (a0, a1, b0, b1) in ((x0, x1, y0, y0 + t + 0.004), (x0, x1, y1 - t - 0.004, y1),
                                 (x0, x0 + t + 0.004, y0, y1), (x1 - t - 0.004, x1, y0, y1)):
            g.slab(a0, a1, b0, b1, TOP_Z - 0.09, TOP_Z - 0.001, bevel=0.0, color=P["basin_dk"], shade=(1, 1), jit=0)
    pit = g.build(props={"pit": True, "ring_out": "sink", "sf_surface": "satin", "pits_three": [
        [p["minX"], p["maxX"], p["minZ"], p["maxZ"], p["depth"]] for p in GEO["pits"]]})

    # faucet on the backsplash face, spout over the basin
    x0, x1, y0, y1 = PITS_B[0]
    fx, wy = (x0 + x1) / 2, HALF - 0.03
    mz = TOP_Z + 0.95
    h = Geo("Hazard_Sink", seed=2)
    h.cyl(0.18, 0.018, base=(fx, wy + 0.01, mz), rot=(90, 0, 0), segs=16, color=P["chrome_dk"])
    h.cyl(0.17, 0.08, base=(fx, wy, mz), rot=(90, 0, 0), segs=16, bevel=0.025, seg=2, color=P["chrome"])
    tip = Vector((fx, (y0 + y1) / 2 - 0.05, mz + 0.05))
    # Smooth gooseneck, still ending at the original animated drip marker.
    p0, p1 = Vector((fx, wy - 0.05, mz)), Vector((fx, wy - 0.2, mz + 0.38))
    p2 = Vector((fx, tip.y, mz + 0.52))
    pts = []
    for i in range(13):
        t = i / 12
        pts.append(p0 * (1 - t) ** 3 + p1 * (3 * (1 - t) ** 2 * t) + p2 * (3 * (1 - t) * t ** 2) + tip * t ** 3)
    h.tube(pts, 0.06, segs=12, color=P["chrome"])
    h.cyl(0.075, 0.07, base=tip + Vector((0, 0, -0.06)), segs=12, bevel=0.008, seg=1, color=P["chrome_dk"])
    h.disc(0.049, loc=tip + Vector((0, 0, -0.061)), normal=(0, 0, -1), segs=12, color=P["ink"])
    for sx, col in ((-1, P["edge"]), (1, "#5a9be6")):
        hx = fx + sx * 0.5
        h.cyl(0.09, 0.14, base=(hx, wy, mz + 0.05), rot=(90, 0, 0), segs=8, color=P["chrome"])
        for a in (0, 90):
            h.box((0.34, 0.07, 0.07), loc=(hx, wy - 0.17, mz + 0.05), rot=(0, a, 0), bevel=0.025, seg=1, color=col)
        h.sphere(0.06, loc=(hx, wy - 0.2, mz + 0.05), segs=7, rings=4, color=P["chrome"])
        h.disc(0.033, loc=(hx, wy - 0.261, mz + 0.05), normal=(0, -1, 0), segs=10, color=col)
    sink_ob = h.build(origin=(fx, wy, mz), props={"hazard": "sink", "sf_surface": "gloss"})
    sink_ob["spout_tip"] = [tip.x, tip.z, -tip.y]  # three.js world
    drip = Geo("Hazard_Sink_Drip")
    drip.sphere((0.045, 0.045, 0.07), loc=(tip.x, tip.y, tip.z - 0.16), segs=7, rings=5, color="#bfe6ff",
                shade=(1, 1.05))
    drip.build(origin=(tip.x, tip.y, tip.z - 0.12), parent=sink_ob, props={"drip": True, "fall_to": TOP_Z - 0.7})
    return pit, sink_ob


# ---------------------------------------------------------------- room


def doors_row(g, x0, x1, y_face, z0, z1, n, face_sign, color, knob_dz=0.0):
    """Cabinet doors (bevelled panels) and knobs on a face at y = y_face."""
    for k in range(n):
        u0 = x0 + (x1 - x0) * k / n
        u1 = x0 + (x1 - x0) * (k + 1) / n
        g.slab(u0 + 0.12, u1 - 0.12, y_face + face_sign * 0.0, y_face + face_sign * 0.08, z0, z1,
               bevel=0.07, seg=1, color=color, shade=(0.78, 1.02))
        kx = u1 - 0.45 if k % 2 == 0 else u0 + 0.45
        g.sphere(0.13, loc=(kx, y_face + face_sign * 0.16, z1 - 0.55 + knob_dz), segs=7, rings=4,
                 color=P["knob"])


def doors_col(g, y0, y1, x_face, z0, z1, n, face_sign, color):
    for k in range(n):
        u0 = y0 + (y1 - y0) * k / n
        u1 = y0 + (y1 - y0) * (k + 1) / n
        g.slab(x_face, x_face + face_sign * 0.08, u0 + 0.12, u1 - 0.12, z0, z1, bevel=0.07, seg=1, color=color,
               shade=(0.78, 1.02))
        ky = u1 - 0.45 if k % 2 == 0 else u0 + 0.45
        g.sphere(0.13, loc=(x_face + face_sign * 0.16, ky, z1 - 0.55), segs=7, rings=4, color=P["knob"])


def island_body(g):
    """Cabinets under the counter, flush with the backsplash at the back."""
    ins = 0.25
    x0, x1, y0, y1 = -HALF + ins, HALF - ins, -HALF + ins, HALF + WALL_T
    # the basins hang below the counter, so the body's top band is cut round them
    deep = TOP_Z - max(PIT_DEPTH) - 0.08
    g.slab(x0, x1, y0, y1, FLOOR_Z + 0.7, deep, bevel=0.06, seg=1, color=P["island"], shade=(0.62, 1.0),
           zr=(FLOOR_Z + 0.7, TOP_Z - THICK))
    xs = sorted({x0, x1, *[min(x1, max(x0, v)) for p in PITS_B for v in p[:2]]})
    ys = sorted({y0, y1, *[min(y1, max(y0, v)) for p in PITS_B for v in p[2:]]})
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            if _in_pit((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2):
                continue
            g.slab(xs[i], xs[i + 1], ys[j], ys[j + 1], deep - 0.01, TOP_Z - THICK, bevel=0.0, color=P["island"],
                   shade=(0.97, 1.0), jit=0)
    g.slab(x0 + 0.25, x1 - 0.25, y0 + 0.25, y1 - 0.25, FLOOR_Z, FLOOR_Z + 0.7, bevel=0.03, seg=1,
           color=P["island_dk"], shade=(0.55, 0.8))
    dz0, dz1 = FLOOR_Z + 1.1, TOP_Z - THICK - 0.35
    doors_row(g, x0, x1, y0, dz0, dz1, 3, -1, P["island_dk"])
    doors_col(g, y0, y1, x0, dz0, dz1, 3, -1, P["island_dk"])
    doors_col(g, y0, y1, x1, dz0, dz1, 3, 1, P["island_dk"])
    doors_row(g, x0, x1, y1, dz0, dz1, 3, 1, P["cab_dk"])
    # drawer band under the counter on the front
    for k in range(3):
        u0 = x0 + (x1 - x0) * k / 3
        g.slab(u0 + 0.12, u0 + (x1 - x0) / 3 - 0.12, y0 - 0.08, y0, TOP_Z - THICK - 0.3, TOP_Z - THICK - 0.06,
               bevel=0.04, seg=1, color=P["edge"])


def counter_run(g, x0, x1, y0, y1, faces):
    """Counter: laminate top at TOP_Z, tomato edge band, mint cabinets.
    faces: which sides get doors ('-y', '+x', '-x')."""
    g.slab(x0, x1, y0, y1, TOP_Z - 0.32, TOP_Z, bevel=0.06, seg=1, color=P["counter_top"], shade=(0.9, 1.02))
    g.slab(x0 - 0.02, x1 + 0.02, y0 - 0.02, y1 + 0.02, TOP_Z - 0.38, TOP_Z - 0.3, bevel=0.03, seg=1, color=P["edge"])
    bx0 = x0 + (0.3 if "-x" in faces else 0.0)
    bx1 = x1 - (0.3 if "+x" in faces else 0.0)
    by0 = y0 + (0.3 if "-y" in faces else 0.0)
    g.slab(bx0, bx1, by0, y1, FLOOR_Z + 0.7, TOP_Z - 0.38, bevel=0.05, seg=1, color=P["cab"], shade=(0.62, 1.0))
    g.slab(bx0 + (0.3 if "-x" in faces else 0), bx1 - (0.3 if "+x" in faces else 0), by0 + (0.3 if "-y" in faces else 0),
           y1, FLOOR_Z, FLOOR_Z + 0.7, bevel=0.0, color=P["cab_dk"], shade=(0.5, 0.75))
    dz0, dz1 = FLOOR_Z + 1.1, TOP_Z - 0.75
    if "-y" in faces:
        doors_row(g, bx0, bx1, by0, dz0, dz1, max(1, int((bx1 - bx0) / 2.6)), -1, P["cab_dk"])
    if "+x" in faces:
        doors_col(g, by0, y1, bx1, dz0, dz1, max(1, int((y1 - by0) / 2.6)), 1, P["cab_dk"])
    if "-x" in faces:
        doors_col(g, by0, y1, bx0, dz0, dz1, max(1, int((y1 - by0) / 2.6)), -1, P["cab_dk"])


def room():
    g = Geo("Set_Room", seed=11, lod=0.7, max_seg=1)
    # checker floor
    tile = 2.0
    nx, ny = int(2 * ROOM_X / tile), int(math.ceil((ROOM_BACK - ROOM_FRONT) / tile))
    for i in range(nx):
        for j in range(ny):
            x0, y0 = -ROOM_X + i * tile, ROOM_FRONT + j * tile
            y1 = min(y0 + tile, ROOM_BACK)
            g.quad([(x0, y0, FLOOR_Z), (x0 + tile, y0, FLOOR_Z), (x0 + tile, y1, FLOOR_Z), (x0, y1, FLOOR_Z)],
                   color=P["floor_a"] if (i + j) % 2 == 0 else P["floor_b"], shade=(1, 1), jit=0.015, flat=True)
    # walls with a wainscot band, ceiling, crown moulding
    walls = ((-ROOM_X - 0.5, ROOM_X + 0.5, ROOM_BACK, ROOM_BACK + 0.5),
             (-ROOM_X - 0.5, ROOM_X + 0.5, ROOM_FRONT - 0.5, ROOM_FRONT),
             (-ROOM_X - 0.5, -ROOM_X, ROOM_FRONT, ROOM_BACK),
             (ROOM_X, ROOM_X + 0.5, ROOM_FRONT, ROOM_BACK))
    for (x0, x1, y0, y1) in walls:
        g.slab(x0, x1, y0, y1, FLOOR_Z, CEIL, bevel=0.0, color=P["wall"], shade=(0.7, 1.04), zr=(FLOOR_Z, CEIL))
    g.slab(-ROOM_X, ROOM_X, ROOM_FRONT, ROOM_BACK + 0.5, CEIL, CEIL + 0.3, bevel=0.0, color="#f5dfab", shade=(1, 1))
    for (x0, x1, y0, y1) in ((-ROOM_X, ROOM_X, ROOM_BACK - 0.3, ROOM_BACK),
                             (-ROOM_X, -ROOM_X + 0.3, ROOM_FRONT, ROOM_BACK),
                             (ROOM_X - 0.3, ROOM_X, ROOM_FRONT, ROOM_BACK),
                             (-ROOM_X, ROOM_X, ROOM_FRONT, ROOM_FRONT + 0.3)):
        g.slab(x0, x1, y0, y1, CEIL - 0.55, CEIL, bevel=0.05, seg=1, color=P["edge"])
    # front wall: a doorway and a calendar (seen from the reverse shots)
    g.slab(-2.4, 2.4, ROOM_FRONT, ROOM_FRONT + 0.15, FLOOR_Z, FLOOR_Z + 21.0, bevel=0.0, color="#7a5390",
           shade=(0.7, 1.0))
    g.slab(-2.9, 2.9, ROOM_FRONT, ROOM_FRONT + 0.25, FLOOR_Z + 21.0, FLOOR_Z + 21.6, bevel=0.06, color=P["knob"])
    g.slab(5.0, 8.0, ROOM_FRONT, ROOM_FRONT + 0.08, 3.0, 7.0, bevel=0.0, color="#fff6e4", shade=(1, 1))
    g.slab(5.0, 8.0, ROOM_FRONT, ROOM_FRONT + 0.1, 5.6, 7.0, bevel=0.0, color=P["edge"], shade=(1, 1))

    # counter runs: U round the island (left run joins the back run)
    counter_run(g, -ROOM_X, -SIDE_X0, -6.0, BACK_Y0, ("+x", "-y"))
    counter_run(g, SIDE_X0, ROOM_X, -6.0, BACK_Y0 - 0.1, ("-x", "-y"))
    counter_run(g, -ROOM_X, FRIDGE_X0 - 0.1, BACK_Y0, ROOM_BACK, ("-y",))
    # backsplash band along the back run and the side walls (low tiles)
    for (x0, x1) in ((-ROOM_X, WINDOW[0] - 0.4), (WINDOW[1] + 0.4, FRIDGE_X0 - 0.1)):
        g.slab(x0, x1, ROOM_BACK - 0.06, ROOM_BACK, TOP_Z, TOP_Z + 1.4, bevel=0.0, color=P["tile_b"], shade=(0.9, 1.0))
        g.slab(x0, x1, ROOM_BACK - 0.1, ROOM_BACK, TOP_Z + 1.4, TOP_Z + 1.55, bevel=0.03, seg=1, color=P["edge"])
    for sx in (-1, 1):
        g.slab(sx * ROOM_X - (0.06 if sx > 0 else -0.06), sx * ROOM_X, -6.0, ROOM_BACK, TOP_Z, TOP_Z + 1.4,
               bevel=0.0, color=P["tile_b"], shade=(0.9, 1.0))
    # upper cabinets either side of the window
    for (x0, x1) in ((-ROOM_X, -5.4), (5.3, FRIDGE_X0 - 0.1)):
        g.slab(x0, x1, ROOM_BACK - 2.4, ROOM_BACK, 8.8, 12.9, bevel=0.1, seg=1, color=P["cab"], shade=(0.75, 1.02))
        nd = max(1, int((x1 - x0) / 2.3))
        for k in range(nd):
            u0 = x0 + (x1 - x0) * k / nd
            u1 = x0 + (x1 - x0) * (k + 1) / nd
            g.slab(u0 + 0.14, u1 - 0.14, ROOM_BACK - 2.5, ROOM_BACK - 2.38, 9.0, 12.7, bevel=0.07, seg=1,
                   color=P["cab_dk"])
            g.sphere(0.14, loc=((u1 - 0.45) if k % 2 == 0 else (u0 + 0.45), ROOM_BACK - 2.58, 9.4), segs=7, rings=4,
                     color=P["knob"])
    # window: frame, mullions, sill (glass is Window_Emissive)
    wx0, wx1, wz0, wz1 = WINDOW
    win = Geo("Window_Emissive")
    lo, mid, hi = C(P["glass_lo"]), C(P["glass_mid"]), C(P["glass_hi"])

    def sky(c, nrm, col):
        t = min(1.0, max(0.0, (c.z - wz0) / (wz1 - wz0)))
        if t < 0.45:
            u = t / 0.45
            return tuple(lo[i] + (mid[i] - lo[i]) * u for i in range(3))
        u = (t - 0.45) / 0.55
        return tuple(mid[i] + (hi[i] - mid[i]) * u for i in range(3))

    win.grid(wx1 - wx0, wz1 - wz0, 1, 10, loc=(0, ROOM_BACK - 0.02, (wz0 + wz1) / 2), rot=(90, 0, 0),
             color=P["glass_lo"], fn=sky, shade=(1, 1), jit=0, noise=0, flat=True)
    win.disc(1.25, loc=(1.6, ROOM_BACK - 0.05, wz0 + 2.4), normal=(0, -1, 0), segs=20, color="#fff2b8",
             shade=(1, 1), jit=0)
    win.build(material="SF_Emissive", props={"emissive": True, "emissive_color": P["glass_lo"],
                                             "emissive_strength": 0.38, "unlit": True})
    # skyline silhouettes in front of the glass, a few warm windows
    rng = random.Random(4)
    x = wx0
    while x < wx1 - 0.1:
        wdt = rng.uniform(0.7, 1.5)
        hgt = rng.uniform(0.8, 2.6)
        xe = min(x + wdt, wx1)
        g.slab(x, xe, ROOM_BACK - 0.09, ROOM_BACK - 0.06, wz0, wz0 + hgt, bevel=0.0, color=P["skyline"],
               shade=(0.85, 1.0), jit=0.04)
        for k in range(int(hgt / 0.5)):
            if rng.random() < 0.45:
                wx = rng.uniform(x + 0.15, max(x + 0.2, xe - 0.25))
                g.slab(wx, wx + 0.12, ROOM_BACK - 0.1, ROOM_BACK - 0.09, wz0 + 0.3 + k * 0.5, wz0 + 0.45 + k * 0.5,
                       bevel=0.0, color="#ffd27a", shade=(1, 1), jit=0)
        x = xe
    fr = P["knob"]
    g.slab(wx0 - 0.45, wx1 + 0.45, ROOM_BACK - 0.55, ROOM_BACK, wz0 - 0.3, wz0, bevel=0.08, seg=1, color=fr)
    g.slab(wx0 - 0.3, wx0, ROOM_BACK - 0.25, ROOM_BACK, wz0, wz1, bevel=0.05, seg=1, color=fr)
    g.slab(wx1, wx1 + 0.3, ROOM_BACK - 0.25, ROOM_BACK, wz0, wz1, bevel=0.05, seg=1, color=fr)
    g.slab(wx0 - 0.3, wx1 + 0.3, ROOM_BACK - 0.25, ROOM_BACK, wz1, wz1 + 0.3, bevel=0.05, seg=1, color=fr)
    g.slab(-0.09, 0.09, ROOM_BACK - 0.2, ROOM_BACK, wz0, wz1, bevel=0.03, seg=1, color=fr)
    g.slab(wx0, wx1, ROOM_BACK - 0.2, ROOM_BACK, wz0 + 4.0, wz0 + 4.18, bevel=0.03, seg=1, color=fr)

    def gingham(c, nrm, col):
        a = int(math.floor(c.x / 0.4)) + int(math.floor(c.z / 0.4))
        return C(P["curtain_a"]) if a % 2 == 0 else C(P["curtain_b"])

    for sx in (-1, 1):
        cx = sx * (wx1 + 0.35)
        for k in range(3):
            g.box((0.6, 0.25, wz1 - wz0 - 2.4), loc=(cx - sx * 0.25 + sx * k * 0.42, ROOM_BACK - 0.55 - k * 0.06,
                                                     (wz0 + wz1) / 2 + 1.2), bevel=0.12, seg=1, color=P["curtain_a"],
                  fn=gingham)
        g.sphere((0.55, 0.3, 0.25), loc=(cx, ROOM_BACK - 0.6, (wz0 + wz1) / 2 - 0.1), segs=8, rings=4,
                 color=P["curtain_a"])
    g.cyl(0.09, wx1 - wx0 + 2.6, base=(wx0 - 1.3, ROOM_BACK - 0.55, wz1 + 0.25), rot=(0, 90, 0), segs=8,
          color=P["edge"])

    # fridge (back right corner), rounded retro
    fx0, fx1 = FRIDGE_X0, ROOM_X - 0.15
    fy0 = BACK_Y0 + 0.1
    ftop = FLOOR_Z + 18.4
    g.box((fx1 - fx0, ROOM_BACK - fy0, ftop - FLOOR_Z), loc=((fx0 + fx1) / 2, (fy0 + ROOM_BACK) / 2, (FLOOR_Z + ftop) / 2),
          bevel=0.7, seg=2, color=P["fridge"], shade=(0.68, 1.05))
    g.slab(fx0 + 0.2, fx1 - 0.2, fy0 - 0.06, fy0 + 0.1, FLOOR_Z + 12.2, FLOOR_Z + 12.32, bevel=0.0, color=P["fridge_dk"])
    for zz, hh in ((FLOOR_Z + 14.0, 2.2), (FLOOR_Z + 8.2, 3.6)):
        g.box((0.36, 0.42, hh), loc=(fx0 + 0.65, fy0 - 0.2, zz), bevel=0.16, seg=1, color=P["chrome"])
    g.slab(fx0 + 0.6, fx1 - 0.6, fy0 - 0.05, fy0 + 0.1, FLOOR_Z + 0.5, FLOOR_Z + 1.0, bevel=0.03, seg=1,
           color=P["chrome_dk"])
    for k in range(7):  # magnets
        g.cyl(0.2, 0.1, base=(rng.uniform(fx0 + 1.3, fx1 - 0.6), fy0 - 0.05, rng.uniform(FLOOR_Z + 9.0, FLOOR_Z + 16.5)),
              rot=(90, 0, 0), segs=8, color=rng.choice(["#e4523f", "#5a9be6", "#7fc45a", "#b35ac8", "#ef8a3a"]))
    # a kid's doodle on the fridge (nod to the drawings)
    g.slab(fx0 + 1.4, fx0 + 3.4, fy0 - 0.06, fy0 - 0.02, FLOOR_Z + 9.4, FLOOR_Z + 11.4, bevel=0.0,
           color="#fff6e4", shade=(1, 1), jit=0)
    g.sphere((0.5, 0.02, 0.45), loc=(fx0 + 2.4, fy0 - 0.08, FLOOR_Z + 10.3), segs=10, rings=4, color="#7fc45a")
    for sx in (-1, 1):
        g.disc(0.1, loc=(fx0 + 2.4 + sx * 0.18, fy0 - 0.11, FLOOR_Z + 10.45), normal=(0, -1, 0), segs=6,
               color=P["ink"], shade=(1, 1))
    # utensil rail between window and fridge
    g.cyl(0.05, 1.5, base=(5.45, ROOM_BACK - 0.25, 4.4), rot=(0, 90, 0), segs=6, color=P["chrome"])
    for k, (c, kind) in enumerate((("#e4523f", "ladle"), ("#5a9be6", "spatula"), ("#f1c24a", "whisk"))):
        ux = 5.65 + k * 0.5
        g.stick((ux, ROOM_BACK - 0.3, 4.35), (ux, ROOM_BACK - 0.3, 3.0), 0.045, segs=5, color=c)
        if kind == "ladle":
            g.sphere((0.2, 0.2, 0.12), loc=(ux, ROOM_BACK - 0.33, 2.9), segs=8, rings=4, color=P["chrome"])
        elif kind == "spatula":
            g.box((0.3, 0.04, 0.38), loc=(ux, ROOM_BACK - 0.3, 2.85), bevel=0.04, seg=1, color=c)
        else:
            g.sphere((0.15, 0.15, 0.3), loc=(ux, ROOM_BACK - 0.33, 2.8), segs=6, rings=4, color=P["chrome"])
    return g


def toaster():
    """Hazard_Toaster with two toast children (pop along local +Z by
    pop_height) and a glowing slot strip."""
    g = Geo("Hazard_Toaster", seed=5)
    cx, cy = -8.4, 9.2
    w, d, h = 3.4, 1.9, 2.3
    g.box((w, d, h), loc=(cx, cy, TOP_Z + h / 2 + 0.02), bevel=0.55, seg=3, color=P["toaster"], shade=(0.68, 1.08))
    g.box((w * 0.94, d * 1.03, 0.28), loc=(cx, cy, TOP_Z + 0.3), bevel=0.1, seg=2, color=P["chrome"])
    for sx in (-1, 1):
        g.slab(cx + sx * 0.55 - 0.33, cx + sx * 0.55 + 0.33, cy - 0.64, cy + 0.64, TOP_Z + h - 0.05, TOP_Z + h + 0.045,
               bevel=0.03, seg=1, color=P["ink"])
    g.box((0.26, 0.3, 1.0), loc=(cx + w / 2 + 0.05, cy - 0.2, TOP_Z + h * 0.6), bevel=0.08, seg=1, color=P["ink"])
    g.box((0.36, 0.5, 0.22), loc=(cx + w / 2 + 0.2, cy - 0.2, TOP_Z + h * 0.78), bevel=0.08, seg=1, color=P["chrome"])
    g.cyl(0.3, 0.12, base=(cx - 0.9, cy - d / 2 - 0.02, TOP_Z + h * 0.42), rot=(90, 0, 0), segs=12, bevel=0.03, seg=1,
          color=P["chrome"])
    g.box((0.08, 0.05, 0.22), loc=(cx - 0.9, cy - d / 2 - 0.16, TOP_Z + h * 0.42 + 0.12), bevel=0.02, seg=1,
          color=P["ink"])
    # Front controls stay readable behind the fighters: broad dial ticks and
    # a small inset badge, all merged with the existing toaster shell.
    for angle in (-65, -32, 0, 32, 65):
        a = math.radians(angle)
        g.box((0.045, 0.016, 0.08), loc=(cx - 0.9 + math.sin(a) * 0.39, cy - d / 2 - 0.025,
              TOP_Z + h * 0.42 + math.cos(a) * 0.39), rot=(0, angle, 0), bevel=0,
              color=P["chrome_dk"], shade=(1, 1))
    g.box((0.64, 0.04, 0.22), loc=(cx + 0.45, cy - d / 2 - 0.02, TOP_Z + h * 0.57),
          bevel=0.07, seg=2, color=P["chrome"])
    g.box((0.4, 0.006, 0.045), loc=(cx + 0.45, cy - d / 2 - 0.043, TOP_Z + h * 0.57),
          bevel=0, color=P["toaster"], shade=(1, 1))
    for zz in (0.55, 0.67, 0.79):
        g.box((0.68, 0.014, 0.032), loc=(cx + 0.5, cy - d / 2 - 0.018, TOP_Z + zz), bevel=0,
              color=P["chrome_dk"], shade=(1, 1))
    for sx in (-1, 1):
        g.box((0.36, 0.3, 0.18), loc=(cx + sx * (w / 2 - 0.5), cy, TOP_Z + 0.07), bevel=0.06, seg=1, color=P["ink"])
    ob = g.build(origin=(cx, cy, TOP_Z), props={"hazard": "toaster", "sf_surface": "gloss"})
    glow = Geo("Toaster_Glow_Emissive")
    for sx in (-1, 1):
        glow.slab(cx + sx * 0.55 - 0.22, cx + sx * 0.55 + 0.22, cy - 0.55, cy + 0.55, TOP_Z + h + 0.045,
                  TOP_Z + h + 0.05, bevel=0.0, color="#ff9a3c", shade=(1, 1), jit=0)
    glow.build(origin=(cx, cy, TOP_Z), parent=ob, material="SF_Emissive",
               props={"emissive": True, "emissive_color": "#ff9a3c"})
    for i, sx in enumerate((-1, 1)):
        t = Geo("Hazard_Toaster_Toast_%d" % (i + 1), seed=40 + i)
        tx = cx + sx * 0.55
        t.box((0.46, 1.12, 1.2), loc=(tx, cy, TOP_Z + h - 0.3), bevel=0.18, seg=2, color=P["toast_crust"])
        t.box((0.48, 0.96, 1.04), loc=(tx, cy, TOP_Z + h - 0.35), bevel=0.14, seg=2, color=P["toast"])
        for side in (-1, 1):
            for yy, zz, rr in ((-0.23, -0.3, 0.04), (0.18, -0.12, 0.035), (0.03, -0.48, 0.045),
                               (0.28, -0.36, 0.025), (-0.12, -0.03, 0.025)):
                t.disc(rr, loc=(tx + side * 0.241, cy + yy, TOP_Z + h + zz), normal=(side, 0, 0),
                       segs=7, color=P["toast_crust"], shade=(1, 1), jit=0)
        t.build(origin=(tx, cy, TOP_Z + h - 0.9), parent=ob, props={"pop_height": 1.3, "pop_axis": "local +Y", "sf_surface": "matte"})
    return ob


def clock():
    """Big clock above the window; hands spin about local Y (Blender -Y
    faces the room)."""
    g = Geo("Clock", seed=13)
    cx, cy, cz = 0.0, ROOM_BACK - 0.25, WINDOW[3] + 2.0
    r = 1.45
    g.cyl(r + 0.2, 0.3, base=(cx, cy, cz), rot=(90, 0, 0), segs=24, bevel=0.1, seg=2, color="#5a9be6")
    g.cyl(r, 0.12, base=(cx, cy - 0.28, cz), rot=(90, 0, 0), segs=24, color="#fff6e4", shade=(1, 1))
    for k in range(12):
        a = 2 * math.pi * k / 12
        big = k % 3 == 0
        g.box((0.1 if big else 0.06, 0.03, 0.28 if big else 0.15),
              loc=(cx + math.sin(a) * (r - 0.26), cy - 0.42, cz + math.cos(a) * (r - 0.26)),
              rot=(0, math.degrees(a), 0), bevel=0, color=P["ink"], shade=(1, 1))
    g.sphere(0.12, loc=(cx, cy - 0.5, cz), segs=8, rings=5, color=P["edge"])
    for sx in (-1, 1):  # bells on top: alarm-clock charm
        g.sphere((0.42, 0.3, 0.32), loc=(cx + sx * 0.95, cy, cz + r + 0.3), rot=(0, sx * 30, 0), segs=10, rings=5,
                 color="#5a9be6")
    ob = g.build(origin=(cx, cy, cz), props={"clock": True, "sf_surface": "satin"})
    for name, length, wdt, ang in (("Clock_Hand_Hour", 0.8, 0.13, 300), ("Clock_Hand_Minute", 1.15, 0.08, 60)):
        hg = Geo(name)
        hg.box((wdt, 0.03, length), loc=(cx, cy - 0.45, cz + length / 2 - 0.1), bevel=0.02, seg=1, color=P["ink"])
        hob = hg.build(origin=(cx, cy - 0.45, cz), parent=ob, props={"pivot": "clock centre; spins about local Z (three.js)"})
        hob.rotation_euler = (0, math.radians(ang), 0)
    return ob


def marquee():
    """Back-bar sign standing on the backsplash ledge, right behind the fight."""
    g = Geo("Marquee", seed=17)
    cx, cy, cz = SIGN
    w, h = 5.6, 1.3
    g.box((w + 0.44, 0.34, h + 0.44), loc=(cx, cy, cz), bevel=0.2, seg=2, color=P["marquee_rim"], shade=(0.85, 1.05))
    g.box((w, 0.3, h), loc=(cx, cy - 0.05, cz), bevel=0.06, seg=1, color=P["marquee"], shade=(0.85, 1.05))
    ledge = TOP_Z + WALL_H + 0.1
    for sx in (-1, 1):  # chunky feet on the ledge
        g.slab(cx + sx * (w / 2 - 0.6) - 0.18, cx + sx * (w / 2 - 0.6) + 0.18, cy - 0.12, cy + 0.12, ledge,
               cz - h / 2 - 0.2, bevel=0.05, seg=1, color=P["chrome_dk"])
        g.cyl(0.26, 0.08, base=(cx + sx * (w / 2 - 0.6), cy, ledge), segs=10, bevel=0.03, seg=1, color=P["chrome"])
    # little chef-hat crest on top
    g.sphere((0.5, 0.2, 0.32), loc=(cx, cy, cz + h / 2 + 0.42), segs=10, rings=5, color="#fff6e4")
    g.box((0.62, 0.22, 0.18), loc=(cx, cy, cz + h / 2 + 0.22), bevel=0.06, seg=1, color="#fff6e4")
    ob = g.build(origin=(cx, cy, cz), props={"ui": "marquee", "sf_surface": "satin"})
    bulbs = Geo("Marquee_Bulbs_Emissive")
    nb = 10
    for k in range(nb):
        x = cx - w / 2 - 0.02 + (w + 0.04) * k / (nb - 1)
        for zz in (cz + h / 2 + 0.11, cz - h / 2 - 0.11):
            bulbs.sphere(0.075, loc=(x, cy - 0.18, zz), segs=6, rings=4, color=P["bulb"], shade=(1, 1), jit=0)
    bulbs.build(origin=(cx, cy, cz), parent=ob, material="SF_Emissive",
                props={"emissive": True, "emissive_color": P["bulb"], "chase": True})
    plane_marker("Marquee_Text", (cx, cy - 0.21, cz), (0, -1, 0), w - 0.3, h - 0.18, parent=ob,
                 props={"text_color": "#fff2c2", "bg_color": P["marquee"]})
    return ob


def scoreboard():
    """Menu chalkboard on the back wall above the toaster."""
    g = Geo("Scoreboard", seed=19)
    cx, cy, cz = -8.6, ROOM_BACK - 0.18, 5.35
    w, h = 5.4, 3.0
    g.box((w + 0.5, 0.25, h + 0.5), loc=(cx, cy, cz), bevel=0.15, seg=2, color=P["board_rim"])
    g.box((w, 0.16, h), loc=(cx, cy - 0.08, cz), bevel=0.04, seg=1, color=P["board"], shade=(0.9, 1.05))
    g.box((w + 0.1, 0.3, 0.12), loc=(cx, cy - 0.2, cz - h / 2 - 0.2), bevel=0.04, seg=1, color=P["board_rim"])
    g.cyl(0.05, 0.4, base=(cx + 1.5, cy - 0.25, cz - h / 2 - 0.12), rot=(0, 90, 0), segs=6, color="#fff6e4")
    g.box((0.7, 0.04, 0.12), loc=(cx - w / 2 + 0.6, cy - 0.22, cz + h / 2 - 0.3), bevel=0.0, color="#f4f0e0",
          shade=(1, 1))
    ob = g.build(origin=(cx, cy, cz), props={"ui": "scoreboard", "sf_surface": "matte"})
    plane_marker("Scoreboard_Text", (cx, cy - 0.18, cz), (0, -1, 0), w - 0.3, h - 0.25, parent=ob,
                 props={"text_color": "#f4f0e0", "bg_color": P["board"]})
    return ob


def cake_stand(idx, base):
    g = Geo("Pedestal_%d" % idx, seed=idx)
    cols = ["#f7a8c0", "#9fd9c4", "#ffe08a", "#c8b0f0"]
    c = cols[idx - 1]
    prof = [(0.0, 0.0), (0.42, 0.0), (0.44, 0.04), (0.3, 0.09), (0.13, 0.14), (0.11, 0.2), (0.11, 0.44),
            (0.2, 0.5), (0.62, 0.53), (0.66, 0.57), (0.64, 0.6), (0.0, 0.6)]
    g.lathe(prof, base=base, segs=18, color=c, shade=(0.75, 1.05))
    x, y, z = base
    g.cyl(0.58, 0.012, base=(x, y, z + 0.6), segs=18, color="#fffaf0", shade=(1, 1))
    for k in range(12):
        a = 2 * math.pi * k / 12
        g.cyl(0.08, 0.012, base=(x + math.cos(a) * 0.58, y + math.sin(a) * 0.58, z + 0.6), segs=6, color="#fffaf0",
              shade=(1, 1))
    return make_pedestal(idx, base, g, 0.615, props={"pedestal_color": c})


def shelf(g, x, y0, y1, z, facing):
    """Wall shelf (crowd perch) with brackets and jars at the ends."""
    g.slab(x - 0.75, x + 0.75, y0, y1, z - 0.18, z, bevel=0.05, seg=1, color=P["board_rim"])
    bx = x - 0.55 * facing
    for yy in (y0 + 0.4, y1 - 0.4):
        g.slab(bx - 0.08, bx + 0.08, yy - 0.08, yy + 0.08, z - 1.2, z - 0.18, bevel=0.03, seg=1, color=P["board_rim"])
    rng = random.Random(int(x * 10))
    for yy in (y0 + 0.45, y1 - 0.45):
        col = rng.choice(["#e4523f", "#ef8a3a", "#7fc45a", "#b35ac8"])
        g.cyl(0.3, 0.75, base=(x, yy, z), segs=9, color="#fff6e4", shade=(0.85, 1.05))
        g.cyl(0.32, 0.2, base=(x, yy, z + 0.75), segs=9, bevel=0.05, seg=1, color=col)


def dressing(g):
    """Back-counter props: stand mixer, cookie jar, utensil crock, fruit bowl."""
    g.lathe([(0.0, 0.0), (0.7, 0.0), (0.75, 0.3), (0.6, 0.9), (0.66, 1.4), (0.5, 1.6), (0.0, 1.65)],
            base=(6.1, 9.7, TOP_Z), segs=14, color="#f7a8c0", shade=(0.72, 1.05))
    g.cyl(0.42, 0.25, base=(6.1, 9.7, TOP_Z + 1.6), segs=12, bevel=0.08, seg=1, color=P["chrome"])
    g.cyl(0.55, 0.95, base=(-11.1, 9.9, TOP_Z), segs=12, bevel=0.1, seg=1, color="#5a9be6")
    for k, (a, ln, c) in enumerate(((-12, 1.6, "#e0a45e"), (8, 1.9, P["chrome"]), (20, 1.5, P["edge"]))):
        g.cyl(0.06, ln, base=(-11.1 + k * 0.12 - 0.12, 9.9, TOP_Z + 0.6), rot=(a, a / 2, 0), segs=6, color=c)
    g.lathe([(0.0, 0.0), (0.4, 0.0), (0.9, 0.35), (1.0, 0.5), (0.0, 0.5)], base=(2.8, 9.4, TOP_Z), segs=14,
            color="#fff6e4")
    for k, (c, r) in enumerate((("#e4523f", 0.32), ("#ffd23a", 0.3), ("#ef8a3a", 0.33), ("#7fc45a", 0.28))):
        g.sphere(r, loc=(2.5 + (k % 2) * 0.6, 9.2 + (k // 2) * 0.45, TOP_Z + 0.6 + (k // 2) * 0.15), segs=9, rings=6,
                 color=c)
    # cookie jar on the right counter, behind the cake stands
    g.lathe([(0.0, 0.0), (0.6, 0.0), (0.7, 0.4), (0.62, 1.1), (0.45, 1.25), (0.0, 1.25)], base=(10.6, 6.4, TOP_Z),
            segs=12, color="#fff6e4", shade=(0.8, 1.05))
    g.sphere((0.4, 0.4, 0.2), loc=(10.6, 6.4, TOP_Z + 1.3), segs=10, rings=5, color=P["edge"])


def pendant():
    # Open enamel shades with a visible bulb; the old closed bottom hid it.
    sg, bulbs = Geo("Set_Pendant", seed=23), Geo("Pendant_Emissive")
    for x, y, z, size, station, phases in ((0, -1.8, 6.25, 1, None, None),
                                         (-STATION_X, 0, 4.8, 0.6, "Build", ["BUILD", "UPGRADE"]),
                                         (STATION_X, 0, 4.8, 0.6, "Foundry", ["FOUNDRY"])):
        profile = [(0, 1.05), (0.25, 1.05), (0.4, 0.75), (1, 0.1), (1.05, 0),
                   (0.98, 0), (0.94, 0.1), (0.34, 0.73), (0.19, 1), (0, 1)]
        sg.lathe([(r * size, h * size) for r, h in profile], base=(x, y, z), segs=16,
                 color=P["edge"], shade=(0.7, 1.05))
        sg.stick((x, y, z + 1.05 * size), (x, y, CEIL), 0.03, segs=5, color=P["ink"])
        bulbs.sphere(0.3 * size, loc=(x, y, z + 0.15 * size), segs=10, rings=6,
                     color="#fff2c8" if station is None else "#8e7655", shade=(1, 1), jit=0)
        if station:
            light_empty("Light_Work_" + station, (x, y, z - 0.05), "spot", "#ffe2b0", 25,
                        target=(x, y, 0.7), angle=105, distance=9, extra={"light_phases": phases})
    bulbs.build(material="SF_Emissive", props={"emissive": True, "emissive_color": "#fff2c8"})
    sg.build(props={"static": True, "sf_surface": "gloss"})


def build():
    reset_scene()
    countertop()
    platform_collision(GEO)
    backsplash()
    sink()
    set_g = room()
    island_body(set_g)
    sh_l, sh_r = (-ROOM_X + 0.75, 2.7), (ROOM_X - 0.75, 2.7)
    shelf(set_g, sh_l[0], -2.8, 2.6, sh_l[1], 1)
    shelf(set_g, sh_r[0], -2.8, 2.6, sh_r[1], -1)
    dressing(set_g)
    set_g.build(props={"static": True, "sf_surface": "matte"})
    toaster()
    clock()
    marquee()
    scoreboard()
    pendant()

    ease_cols = {"wood": "#e8a95e", "board": "#fff6e4", "trim": P["edge"],
                 "dabs": ["#5a9be6", "#ffd23a", "#7fc45a", P["edge"]]}
    for i, y in enumerate(ROW_Y):
        make_easel(i + 1, (-STATION_X, y, TOP_Z), (1.0, -0.42, 0), ease_cols)
        cake_stand(i + 1, (STATION_X, y, TOP_Z))

    toaster_top = TOP_Z + 2.32
    spots = [
        ((-9.5, 9.2, toaster_top), None), ((-7.3, 9.15, toaster_top), None),
        ((-5.6, 8.4, TOP_Z), None), ((-10.9, 8.5, TOP_Z), None), ((-11.2, 10.3, TOP_Z), None),
        ((5.0, 8.3, TOP_Z), None), ((4.4, 10.0, TOP_Z), None),
        ((8.3, 9.0, FLOOR_Z + 18.4), None), ((9.6, 9.6, FLOOR_Z + 18.4), None), ((10.9, 8.7, FLOOR_Z + 18.4), None),
        ((-7.3, 5.5, TOP_Z), None), ((-9.1, 6.3, TOP_Z), None), ((-10.9, 5.0, TOP_Z), None),
        ((7.3, 5.4, TOP_Z), None), ((9.0, 6.4, TOP_Z), None), ((8.5, 4.4, TOP_Z), None),
        ((sh_l[0] + 0.05, -1.4, sh_l[1]), None), ((sh_l[0] + 0.05, 0.9, sh_l[1]), None),
        ((sh_r[0] - 0.05, -1.4, sh_r[1]), None), ((sh_r[0] - 0.05, 0.9, sh_r[1]), None),
    ]
    pal = [("#ff8a5c", "#ffd9b8", "#5a9be6"), ("#7fc45a", "#e9f7c8", "#e4523f"), ("#b35ac8", "#f0d2f7", "#ffd23a"),
           ("#ffd23a", "#fff3c4", "#7b4f8a"), ("#5aa0e6", "#d8ecff", "#ef8a3a"), ("#e8577a", "#ffd2dc", "#7fc45a"),
           ("#ef8a3a", "#ffe0c2", "#5aa0e6"), ("#9ad46a", "#f0ffd8", "#b35ac8")]
    crowd(spots, (0, 0, 0.5), pal, seed=33)

    podium({"body": "#fff6e4", "trim": ["#ffd56a", "#ece8f4", "#e08a4a"], "pip": P["edge"]},
           center=(0.0, 0.2, TOP_Z))

    light_empty("Light_Window", (0.0, ROOM_BACK - 0.6, 5.6), "spot", "#ffa560", 25.0,
                target=(0.0, 0.0, 0.5), angle=85, distance=18)
    light_empty("Light_Pendant", (0.0, -1.8, 6.2), "spot", "#ffe2b0", 80.0, target=(0.0, 0.0, 0.2),
                angle=88, distance=15, extra={"light_shadow": True})
    light_empty("Light_Toaster", (-8.4, 9.2, TOP_Z + 2.9), "point", "#ff9a3c", 1.4, flicker=0.15, distance=4)

    for i, x in enumerate((-2.25, -0.75, 0.75, 2.25)):
        empty("Mark_Roster_%d" % (i + 1), (x, -0.4, TOP_Z), size=0.2)
    empty("Mark_FaceOff_A", b_from_t(GEO["spawns"]["A"]), size=0.2)
    empty("Mark_FaceOff_B", b_from_t(GEO["spawns"]["B"]), size=0.2)
    cams()
    from irradiance import bake_probe
    bake_probe(label="kitchen-practical-bounce-v1", sky=("#e2bfa9", 0.32), ground=("#c08858", 0.1),
               origins=((0, -0.4, 1.4), (0, 6.8, 2), (-6, 1, 1.8)), practical_scale=1.1)
    export_glb(os.path.join(OUT_DIR, "kitchen.glb"))


def cams():
    cam_empty("Cam_Establish", (-9.6, -11.2, 9.0), (0.6, 2.4, -1.4), fov=50, note="crane start, high front-left")
    cam_empty("Cam_Establish_End", (0.0, -8.6, 2.8), (0.0, 2.0, 1.6), fov=44, note="crane end, marquee in frame")
    cam_empty("Cam_FightWide", (0.0, -8.9, 4.0), (0.0, 1.2, 0.75), fov=40, note="default fight wide")
    cam_empty("Cam_Build", (-1.4, -1.6, 2.6), (-STATION_X, 0.1, 1.25), fov=42, note="four easels")
    cam_empty("Cam_Foundry", (1.4, -1.6, 2.5), (STATION_X, 0.1, 0.95), fov=42, note="four pedestals")
    cam_empty("Cam_Roster", (0.0, -6.6, 1.9), (0.0, -0.4, 0.6), fov=38, note="four roster marks")
    faceoff_cams(GEO)
    # E/W sit in the gap just short of the side counters (further out, the
    # counter top would hide the drop); the front one has open floor behind it.
    # The back edge meets the backsplash, so there is no outside to stand in:
    # that one looks back over the counter from high in front instead, with the
    # rim fighter mid-frame and the sink pit beside them.
    edge_cams(cam_z=0.3, out=2.5, target_z=0.05, fov=55, lateral=1.4, look_in=0.2,
              sides={"S": dict(out=3.4, cam_z=0.4, target_z=-0.15)},
              override={"Cam_Edge_N": ((1.4, -0.4, 2.0), (-0.1, 2.0, 0.2), 50,
                                       "back edge is the backsplash: high over the counter, down into the sink pit")})
    cam_empty("Cam_Podium", (0.0, -5.4, 1.7), (0.0, 0.2, 0.95), fov=36, note="podium")
    cam_empty("Cam_Scoreboard", (-6.6, 3.4, 4.9), (-8.6, ROOM_BACK, 5.35), fov=40, note="back-wall menu chalkboard")


build()
print("TRIS", count_tris())
