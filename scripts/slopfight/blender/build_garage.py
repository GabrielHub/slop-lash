"""Flooded Garage arena -> public/models/slopfight/garage.glb

    blender --background --factory-startup --python build_garage.py

A painted concrete pad (the 6 x 6 platform) stands in murky flood water inside
a cinder-block garage. Easels stand on a pallet deck to the left, pedestals
(tyre stacks) on a pallet deck to the right, the crowd perches on crates, a
pallet bleacher and the roof of a half-sunk sedan. Practicals: a flickering
fluorescent tube over the pad, a sparking live wire, a caged work lamp.
"""

import math
import os
import random
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (no_pit, HALF, b_from_t, OUT_DIR, C, Geo, Vector, cam_empty, count_tris, crowd, edge_lights,  # noqa: E402
                    edge_cams, empty, export_glb, faceoff_cams, light_empty, make_easel, make_pedestal, perimeter_u, plane_marker,
                    mat, platform_collision, podium, read_arena, rect_sweep, reset_scene, shade)

GEO = read_arena("FLOODED_GARAGE")
WATER_Z = GEO["surround"]["y"]  # -0.35: ankle-deep water just under the pad top
ROOM_X = 12.5
ROOM_BACK = 10.5
ROOM_FRONT = -11.0
CEIL = 8.6
APRON = (5.6, 9.4)  # |x| range of the easel / pedestal decks
STATION_X = 7.5  # |x| of the easel and pedestal rows
ROW_Y = (2.75, 0.92, -0.92, -2.75)

P = {
    "epoxy": "#5a6cb2",
    "epoxy2": "#5163a8",
    "paint_ring": "#f3bf3f",
    "concrete": "#c9b28f",
    "stain": "#5e6b4c",
    "stripe_y": "#ffcc33",
    "stripe_k": "#3a2a3c",
    "water_shadow": "#2c6658",
    "water_near": "#5aa98a",
    "water_far": "#1d4b4b",
    "ripple": "#b4e6c4",
    "block": "#e3c48f",
    "block2": "#d6b47e",
    "wall_top": "#b8553f",
    "wall_band": "#f0b23a",
    "door": "#ef8a3a",
    "door2": "#dc7731",
    "frame": "#6e4a3c",
    "pallet": "#c99559",
    "pallet2": "#a8743f",
    "tyre": "#3b3140",
    "tyre2": "#51455a",
    "pillar": "#d8c7a6",
    "beam": "#7b4f8a",
    "car": "#f2b43a",
    "car_roof": "#fff1d6",
    "chrome": "#d9d4e6",
    "glass": "#6d9aa6",
    "drum_r": "#d9483b",
    "drum_b": "#3f6fc8",
    "drum_y": "#f2c43a",
    "peg": "#d9a868",
    "tube": "#f4ffe2",
    "hood": "#4f8a6a",
    "marquee": "#5a2140",
    "marquee_rim": "#f3bf3f",
    "bulb": "#fff2c2",
    "board": "#2f4a3c",
    "board_rim": "#b9824a",
}

PILLARS = [(-6.3, 6.5), (6.3, 6.5), (-11.6, -6.0), (11.6, -6.0)]


# ---------------------------------------------------------------- platform


def floor_and_edge():
    g = Geo("Floor")
    inner = 2.84
    n = 3
    step = 2 * inner / n
    for i in range(n):
        for j in range(n):
            x0, y0 = -inner + i * step, -inner + j * step
            col = P["epoxy"] if (i + j) % 2 == 0 else P["epoxy2"]
            g.slab(x0 + 0.015, x0 + step - 0.015, y0 + 0.015, y0 + step - 0.015, -0.12, 0.0, bevel=0.04,
                   seg=1, color=col, shade=(0.9, 1.0), top_only=True)

    def body_fn(c, nrm, col):
        return C(P["stain"]) if c.z < WATER_Z + 0.22 else col

    # pad body: x/y exactly +-3, deep into the water
    g.slab(-HALF, HALF, -HALF, HALF, -1.6, -0.1, bevel=0.05, color=P["concrete"], shade=(0.62, 1.0), fn=body_fn)
    # painted ring + start marks as thin decals (z = +0.004)
    segs = 48
    for k in range(segs):
        a0, a1 = 2 * math.pi * k / segs, 2 * math.pi * (k + 1) / segs
        r0, r1 = 1.78, 1.96
        g.quad([(math.cos(a0) * r0, math.sin(a0) * r0, 0.004), (math.cos(a0) * r1, math.sin(a0) * r1, 0.004),
                (math.cos(a1) * r1, math.sin(a1) * r1, 0.004), (math.cos(a1) * r0, math.sin(a1) * r0, 0.004)],
               color=P["paint_ring"], shade=(1, 1), jit=0, flat=True)
    for sx in (-1, 1):
        g.box((0.5, 0.14, 0.01), loc=(sx * 1.4, 0, 0.004), bevel=0, color="#fff1d6", shade=(1, 1), flat=True)
    floor = g.build(props={"surface": "concrete"})

    e = Geo("Edge")
    # the arenas.ts lip: a curb lip.width wide and lip.height tall on the rim,
    # wrapping down the pad's outer face so the drop reads from below too
    lw, lh = GEO["lip"]["width"], GEO["lip"]["height"]
    prof = [(-lw, -0.002), (-lw, lh - 0.025), (-lw + 0.025, lh), (-0.025, lh), (0.0, lh - 0.025),
            (0.012, 0.0), (0.012, -0.22), (-0.01, -0.26)]

    def stripe(c, nrm, col):
        u = perimeter_u(c)
        k = int(math.floor((u + c.z * 1.2) / 0.3))
        return C(P["stripe_y"]) if k % 2 == 0 else C(P["stripe_k"])

    rect_sweep(e, prof, stripe, nseg=24, shade=(0.8, 1.05), jit=0)
    edge = e.build(props={"lip": True})
    edge_lights(edge, color="#ffd27a", n_per_side=8, inset=lw / 2, z=lh, size=0.04)
    return floor, edge


# ---------------------------------------------------------------- water


def water():
    g = Geo("Hazard_Water")
    near, far, shadow = C(P["water_near"]), C(P["water_far"]), C(P["water_shadow"])

    def dist(c):
        dx = max(abs(c.x) - HALF, 0)
        dy = max(abs(c.y) - HALF, 0)
        d = math.hypot(dx, dy)
        for px, py in PILLARS:
            d = min(d, max(math.hypot(c.x - px, c.y - py) - 0.45, 0) * 1.6)
        return d

    def wfn(c, nrm, col):
        d = dist(c)
        if d < 0.3:
            return shadow
        t = min(1.0, (d - 0.3) / 7.5)
        base = tuple(near[i] + (far[i] - near[i]) * t for i in range(3))
        # soft lighter patches, like light through murky water
        k = 1.0 + 0.06 * math.sin(c.x * 0.9 + 1.3) * math.sin(c.y * 0.7 + 0.4)
        return shade(base, k)

    def wave(x, y):
        return 0.025 * math.sin(x * 1.7 + y * 0.6) + 0.02 * math.sin(y * 2.1 - x * 0.5)

    g.grid(2 * ROOM_X, ROOM_BACK - ROOM_FRONT, 20, 16, loc=(0, (ROOM_BACK + ROOM_FRONT) / 2, WATER_Z),
           color=P["water_near"], fn=wfn, zfn=wave, shade=(1, 1), jit=0, noise=0.0, flat=True)  # noqa
    w = g.build(props={"hazard": "water", "water_level": WATER_Z, "ripple": True})

    # wobbly, broken ripple loops (own child so code can pulse / scale them)
    r = Geo("Hazard_Water_Ripples")

    def loop(cx, cy, hx, hy, width, segs, phase, gap_every=5, power=6.0):
        pts = []
        for k in range(segs + 1):
            a = 2 * math.pi * k / segs
            ca, sa = math.cos(a), math.sin(a)
            # superellipse around a rectangle
            ex = math.copysign(abs(ca) ** (2 / power), ca)
            ey = math.copysign(abs(sa) ** (2 / power), sa)
            wob = 1.0 + 0.03 * math.sin(a * 7 + phase)
            pts.append((cx + ex * hx * wob, cy + ey * hy * wob))
        for k in range(segs):
            if (k + int(phase * 3)) % gap_every == 0:
                continue
            (x0, y0), (x1, y1) = pts[k], pts[k + 1]
            nx0 = Vector((x0 - cx, y0 - cy, 0)).normalized() * width
            nx1 = Vector((x1 - cx, y1 - cy, 0)).normalized() * width
            z = WATER_Z + 0.035
            r.quad([(x0, y0, z), (x0 + nx0.x, y0 + nx0.y, z), (x1 + nx1.x, y1 + nx1.y, z), (x1, y1, z)],
                   color=P["ripple"], shade=(1, 1), jit=0, flat=True)

    loop(0, 0, HALF + 0.35, HALF + 0.35, 0.07, 56, 0.3, power=10)
    loop(0, 0, HALF + 1.0, HALF + 1.0, 0.055, 56, 1.7, gap_every=4, power=7)
    loop(0, 0, HALF + 1.9, HALF + 1.9, 0.045, 56, 2.9, gap_every=3, power=5)
    for i, (px, py) in enumerate(PILLARS):
        loop(px, py, 0.8, 0.8, 0.05, 18, i * 1.1, gap_every=6, power=2)
        loop(px, py, 1.25, 1.25, 0.04, 22, i * 0.7 + 2, gap_every=4, power=2)
    r.build(parent=w)
    return w


def floaters():
    """Bobbing junk on the water, one node each so code can bob them."""
    out = []
    # rubber ducks
    for i, (x, y, yaw) in enumerate(((-4.2, -2.0, 40), (4.3, 3.3, -120), (-1.8, -4.6, 160))):
        g = Geo("Floater_%d" % (i + 1), max_seg=1)
        g.sphere((0.3, 0.22, 0.17), loc=(0, 0, 0.08), segs=10, rings=6, color="#ffd23a", shade=(0.8, 1.05))
        g.sphere(0.15, loc=(0.18, 0, 0.3), segs=9, rings=6, color="#ffd23a")
        g.box((0.14, 0.12, 0.05), loc=(0.34, 0, 0.27), bevel=0.02, color="#ef7a2a")
        for sy in (-1, 1):
            g.disc(0.035, loc=(0.27, sy * 0.1, 0.35), normal=(0.6, sy, 0.2), segs=6, color="#2a1a2e")
        g.cyl(0.06, 0.12, base=(-0.27, 0, 0.12), rot=(0, -50, 0), segs=6, r2=0.0, color="#ffd23a")
        ob = g.build(origin=(0, 0, 0))
        ob.matrix_basis = mat((x, y, WATER_Z - 0.02), (0, 0, yaw))
        ob["floater"] = True
        out.append(ob)
    # a floating tyre and a traffic cone on its side
    g = Geo("Floater_4", max_seg=1)
    g.torus(0.42, 0.15, loc=(0, 0, 0.02), segs=14, rsegs=5, color=P["tyre"])
    ob = g.build(origin=(0, 0, 0))
    ob.matrix_basis = mat((4.2, -3.9, WATER_Z), (0, 6, 0))
    ob["floater"] = True
    g = Geo("Floater_5", max_seg=1)
    g.cyl(0.24, 0.85, base=(0, 0, 0), rot=(0, 90, 0), segs=10, r2=0.05, color="#ff7a2a")
    g.cyl(0.18, 0.12, base=(0.3, 0, 0), rot=(0, 90, 0), segs=10, caps=False, color="#fff6e4")
    g.box((0.62, 0.62, 0.08), loc=(-0.02, 0, 0), rot=(0, 90, 0), bevel=0.03, color="#ff7a2a")
    ob = g.build(origin=(0, 0, 0))
    ob.matrix_basis = mat((-4.1, 3.6, WATER_Z + 0.05), (0, 0, 35))
    ob["floater"] = True
    return out


# ---------------------------------------------------------------- room


def block_wall(g, x0, x1, y0, y1, along_x):
    """Cinder-block courses up to the painted band, then rusty plaster."""
    z = WATER_Z - 0.3
    k = 0
    while z < 3.2:
        g.slab(x0, x1, y0, y1, z, z + 0.62, bevel=0.03, color=P["block"] if k % 2 == 0 else P["block2"],
               shade=(0.95, 1.0), top_only=True)
        z += 0.65
        k += 1
    if along_x:
        g.slab(x0, x1, y0 - 0.06, y1 + 0.06, z, z + 0.35, bevel=0.04, color=P["wall_band"])
    else:
        g.slab(x0 - 0.06, x1 + 0.06, y0, y1, z, z + 0.35, bevel=0.04, color=P["wall_band"])
    g.slab(x0, x1, y0, y1, z + 0.35, CEIL + 0.5, bevel=0.0, color=P["wall_top"], shade=(0.85, 1.05))


def room():
    g = Geo("Set_Room", lod=0.6, max_seg=1)
    block_wall(g, -ROOM_X - 0.6, ROOM_X + 0.6, ROOM_BACK, ROOM_BACK + 0.6, True)
    block_wall(g, -ROOM_X - 0.6, ROOM_X + 0.6, ROOM_FRONT - 0.6, ROOM_FRONT, True)
    block_wall(g, -ROOM_X - 0.6, -ROOM_X, ROOM_FRONT, ROOM_BACK, False)
    block_wall(g, ROOM_X, ROOM_X + 0.6, ROOM_FRONT, ROOM_BACK, False)
    # ceiling with purple I-beams
    g.slab(-ROOM_X, ROOM_X, ROOM_FRONT, ROOM_BACK + 0.6, CEIL, CEIL + 0.3, bevel=0.0, color="#5b3b52", shade=(1, 1))
    for y in (-7.5, -3.5, 0.5, 4.5, 8.5):
        g.slab(-ROOM_X, ROOM_X, y - 0.18, y + 0.18, CEIL - 0.55, CEIL, bevel=0.03, color=P["beam"])
        g.slab(-ROOM_X, ROOM_X, y - 0.3, y + 0.3, CEIL - 0.62, CEIL - 0.5, bevel=0.03, color=P["beam"])
    # garage door (centre back), ribbed panels in a frame, bottom flooded
    dx0, dx1, dtop = -4.2, 4.2, 4.6
    g.slab(dx0 - 0.35, dx1 + 0.35, ROOM_BACK - 0.25, ROOM_BACK + 0.05, WATER_Z - 0.2, dtop + 0.35, bevel=0.06,
           color=P["frame"])
    z = WATER_Z - 0.2
    k = 0
    while z < dtop:
        g.slab(dx0, dx1, ROOM_BACK - 0.42, ROOM_BACK - 0.22, z, min(z + 0.56, dtop) - 0.04, bevel=0.05,
               color=P["door"] if k % 2 == 0 else P["door2"], shade=(0.8, 1.03))
        z += 0.56
        k += 1
    # pegboard tool wall (back-left) with chunky tool silhouettes
    g.slab(-11.4, -5.6, ROOM_BACK - 0.12, ROOM_BACK, 0.9, 4.3, bevel=0.05, color=P["peg"])
    tools = [("wrench", -10.6, 2.6, "#d9483b"), ("hammer", -9.4, 2.7, "#3f6fc8"), ("saw", -7.9, 2.4, "#f2c43a"),
             ("driver", -6.5, 2.7, "#7fc45a"), ("wrench", -10.0, 1.5, "#7fc45a"), ("driver", -8.6, 1.5, "#d9483b"),
             ("hammer", -7.1, 1.5, "#ef8a3a"), ("coil", -6.2, 3.7, "#3a2a3c")]
    yy = ROOM_BACK - 0.2
    for kind, x, zc, col in tools:
        if kind == "wrench":
            g.box((0.14, 0.08, 0.9), loc=(x, yy, zc), bevel=0.04, color=col)
            g.torus(0.16, 0.06, loc=(x, yy, zc + 0.5), rot=(90, 0, 0), segs=10, rsegs=5, color=col)
        elif kind == "hammer":
            g.box((0.12, 0.08, 0.8), loc=(x, yy, zc), bevel=0.04, color="#a8743f")
            g.box((0.5, 0.12, 0.18), loc=(x, yy, zc + 0.42), bevel=0.05, color=col)
        elif kind == "saw":
            g.prism([(-0.6, -0.2), (0.4, -0.2), (0.6, 0.2), (-0.6, 0.12)], 0.05, loc=(x, yy - 0.02, zc),
                    color="#e6e0ee")
            g.box((0.3, 0.1, 0.36), loc=(x + 0.7, yy, zc), bevel=0.06, color=col)
        elif kind == "driver":
            g.cyl(0.08, 0.36, base=(x, yy, zc - 0.1), segs=8, bevel=0.03, color=col)
            g.cyl(0.025, 0.5, base=(x, yy, zc + 0.26), segs=6, color=P["chrome"])
        elif kind == "coil":
            g.torus(0.38, 0.07, loc=(x, yy - 0.05, zc - 0.2), rot=(90, 0, 0), segs=14, rsegs=5, color=col)
    g.slab(-11.6, -5.4, 8.9, ROOM_BACK - 0.1, 0.3, 0.55, bevel=0.06, color=P["pallet2"])
    for x in (-11.3, -5.7):
        g.slab(x - 0.12, x + 0.12, 9.0, 9.3, WATER_Z - 0.2, 0.3, bevel=0.03, color=P["frame"])
    # shelving with paint cans (back-right)
    rng = random.Random(11)
    cans = ["#d9483b", "#3f6fc8", "#f2c43a", "#7fc45a", "#ef8a3a", "#b35ac8", "#fff1d6"]
    for zz in (0.9, 2.0, 3.1):
        g.slab(5.4, 11.6, 9.6, ROOM_BACK - 0.05, zz, zz + 0.1, bevel=0.03, color=P["frame"])
        x = 5.7
        while x < 11.2:
            r = rng.uniform(0.2, 0.3)
            g.cyl(r, rng.uniform(0.4, 0.6), base=(x + r, 9.95, zz + 0.1), segs=9, color=rng.choice(cans))
            x += 2 * r + rng.uniform(0.08, 0.3)
    for x in (5.5, 11.5):
        g.slab(x - 0.07, x + 0.07, 9.6, 9.75, WATER_Z - 0.2, 3.8, bevel=0.02, color=P["frame"])
    # front wall: a blue side door, a fuse-red first-aid box, hanging hose
    g.slab(-2.0, 2.0, ROOM_FRONT, ROOM_FRONT + 0.2, WATER_Z - 0.2, 3.6, bevel=0.06, color=P["frame"])
    g.slab(-1.7, 1.7, ROOM_FRONT + 0.1, ROOM_FRONT + 0.3, WATER_Z - 0.2, 3.3, bevel=0.06, color="#3f6fc8",
           shade=(0.75, 1.05))
    g.cyl(0.12, 0.1, base=(1.25, ROOM_FRONT + 0.3, 1.4), rot=(-90, 0, 0), segs=8, color=P["chrome"])
    g.slab(4.0, 5.4, ROOM_FRONT, ROOM_FRONT + 0.35, 2.0, 3.0, bevel=0.08, color="#e04a3a")
    g.torus(0.5, 0.08, loc=(-5.0, ROOM_FRONT + 0.25, 2.4), rot=(90, 0, 0), segs=14, rsegs=5, color="#7fc45a")
    # high windows on the side walls glowing dusk orange (emissive node)
    win = Geo("Window_Emissive")
    for sx in (-1, 1):
        for y in (-6.0, -1.5, 3.0):
            x = sx * (ROOM_X - 0.02)
            g.slab(min(x, x - sx * 0.2), max(x, x - sx * 0.2), y - 1.25, y + 1.25, 5.0, 6.9, bevel=0.05,
                   color=P["frame"])
            win.slab(min(x - sx * 0.2, x - sx * 0.26), max(x - sx * 0.2, x - sx * 0.26), y - 1.05, y + 1.05,
                     5.2, 6.7, bevel=0.0, color="#ffb070", shade=(0.85, 1.1), jit=0)
            g.slab(min(x, x - sx * 0.3), max(x, x - sx * 0.3), y - 0.05, y + 0.05, 5.2, 6.7, bevel=0.0,
                   color=P["frame"])
    return g, win


def pillars(g):
    for px, py in PILLARS:
        g.box((0.85, 0.85, CEIL - WATER_Z + 0.3), loc=(px, py, (CEIL + WATER_Z) / 2 - 0.15), bevel=0.1,
              color=P["pillar"], shade=(0.7, 1.05))
        for k in range(4):
            col = P["stripe_y"] if k % 2 == 0 else P["stripe_k"]
            g.box((0.9, 0.9, 0.22), loc=(px, py, WATER_Z + 0.25 + k * 0.22), bevel=0.04, color=col, shade=(1, 1),
                  top_only=True)
        g.box((0.95, 0.95, 0.3), loc=(px, py, CEIL - 0.9), bevel=0.06, color=P["wall_top"])


def drums(g, spots):
    for x, y, col, tilt in spots:
        g.cyl(0.42, 1.25, base=(x, y, WATER_Z - 0.35), rot=(tilt, 0, 0), segs=14, bevel=0.06, color=col,
              shade=(0.7, 1.05))
        for zz in (0.45, 0.85):
            g.cyl(0.435, 0.06, base=(x, y, WATER_Z - 0.35 + zz), rot=(tilt, 0, 0), segs=14, caps=False,
                  color=shade(C(col), 0.75))
        g.cyl(0.08, 0.04, base=(x + 0.18, y, WATER_Z + 0.9), segs=8, color=P["chrome"])


def pallet_deck(g, x0, x1, y0, y1, top):
    g.slab(x0, x1, y0, y1, WATER_Z - 0.4, top - 0.18, bevel=0.06, color=P["pallet2"], shade=(0.6, 0.9))
    n = max(3, int((y1 - y0) / 0.62))
    for k in range(n):
        yy = y0 + (k + 0.5) * (y1 - y0) / n
        g.slab(x0 - 0.05, x1 + 0.05, yy - 0.26, yy + 0.26, top - 0.12, top, bevel=0.03,
               color=P["pallet"] if k % 2 == 0 else shade(C(P["pallet"]), 0.92), shade=(0.9, 1.02), top_only=True)
    for xx in (x0 + 0.15, (x0 + x1) / 2, x1 - 0.15):  # stringers, mostly hidden under the planks
        g.slab(xx - 0.12, xx + 0.12, y0, y1, top - 0.3, top - 0.12, bevel=0.0, color=P["pallet2"])


def sedan(g):
    """Half-sunk yellow sedan diving nose-first into the flood in the
    back-right corner, side-on to the fight camera so it reads as a car."""
    from mathutils import Euler, Matrix
    s = Geo("tmp_car", lod=0.7, max_seg=2)
    s.box((4.6, 2.0, 0.9), loc=(0, 0, 0.45), bevel=0.32, seg=3, color=P["car"], shade=(0.75, 1.05))
    s.box((2.5, 1.84, 0.85), loc=(-0.25, 0, 1.25), bevel=0.36, seg=3, color="#f7c64e", shade=(0.85, 1.05))
    s.max_seg = 1  # trim, glass and lamps: one bevel segment is plenty
    s.box((0.8, 0.5, 0.26), loc=(-0.3, 0, 1.75), bevel=0.08, seg=1, color=P["car_roof"])
    s.box((0.82, 0.52, 0.06), loc=(-0.3, 0, 1.72), bevel=0.02, seg=1, color="#e04a3a")
    for sy in (-1, 1):
        for x0, x1 in ((-1.35, -0.35), (-0.25, 0.75)):
            s.box((x1 - x0, 0.06, 0.5), loc=((x0 + x1) / 2, sy * 0.93, 1.27), bevel=0.1, seg=1, color=P["glass"],
                  shade=(0.9, 1.1))
        for sxw in (-1.4, 1.4):
            s.cyl(0.48, 0.32, base=(sxw, sy * 0.86, 0.12), rot=(90, 0, 0), segs=14, bevel=0.06, color=P["tyre"])
            s.cyl(0.24, 0.34, base=(sxw, sy * 0.86, 0.12), rot=(90, 0, 0), segs=10, color=P["chrome"])
        s.box((4.0, 0.05, 0.08), loc=(0, sy * 1.01, 0.62), bevel=0.02, seg=1, color=P["chrome"])
    s.box((0.06, 1.7, 0.5), loc=(1.04, 0, 1.25), rot=(0, -30, 0), bevel=0.1, color=P["glass"])
    s.box((0.06, 1.7, 0.5), loc=(-1.54, 0, 1.25), rot=(0, 30, 0), bevel=0.1, color=P["glass"])
    s.box((0.2, 2.1, 0.22), loc=(2.35, 0, 0.3), bevel=0.08, color=P["chrome"])
    s.box((0.2, 2.1, 0.22), loc=(-2.35, 0, 0.3), bevel=0.08, color=P["chrome"])
    for sy in (-0.7, 0.7):
        s.sphere((0.06, 0.22, 0.17), loc=(2.33, sy, 0.62), segs=10, rings=6, color="#fff2c2")
        s.sphere((0.06, 0.2, 0.14), loc=(-2.33, sy, 0.62), segs=10, rings=6, color="#e04a3a")
    pos = (9.2, 7.4, WATER_Z - 0.35)
    m = Matrix.Translation(pos) @ Euler((math.radians(0), math.radians(13), math.radians(172))).to_matrix().to_4x4()
    for i, v in enumerate(s.V):
        s.V[i] = tuple(m @ Vector(v))
    g.merge(s)
    # two seats on the sloping roof, either side of the roof sign
    return [tuple(m @ Vector(p)) for p in ((-1.05, 0.1, 1.66), (0.45, -0.1, 1.64))]


def tube_fixture(set_g, center, length, name_emissive, hang_to=CEIL - 0.6):
    x, y, z = center
    set_g.box((length + 0.3, 0.36, 0.14), loc=(x, y, z + 0.16), bevel=0.06, color=P["hood"])
    set_g.box((length + 0.4, 0.46, 0.05), loc=(x, y, z + 0.07), bevel=0.02, color=shade(C(P["hood"]), 0.8))
    for sx in (-1, 1):
        set_g.stick((x + sx * length * 0.4, y, z + 0.22), (x + sx * length * 0.4, y, hang_to), 0.02, segs=5,
                    color="#3a2a3c")
        set_g.box((0.12, 0.14, 0.14), loc=(x + sx * (length / 2 + 0.05), y, z), bevel=0.03, color="#e6e0ee")
    t = Geo(name_emissive)
    t.cyl(0.075, length, base=(x - length / 2, y, z), rot=(0, 90, 0), segs=10, color=P["tube"], shade=(1, 1), jit=0)
    return t


# ---------------------------------------------------------------- UI surfaces


def marquee():
    g = Geo("Marquee")
    cx, cy, cz = 0.0, 6.4, 3.0
    w, h = 6.2, 1.5
    g.box((w + 0.5, 0.4, h + 0.5), loc=(cx, cy + 0.05, cz), bevel=0.18, seg=3, color=P["marquee_rim"])
    g.box((w, 0.3, h), loc=(cx, cy - 0.1, cz), bevel=0.06, color=P["marquee"], shade=(0.85, 1.05))
    g.box((1.6, 0.36, 0.34), loc=(cx, cy, cz + h / 2 + 0.32), bevel=0.15, color=P["marquee_rim"])
    g.sphere((0.16, 0.12, 0.16), loc=(cx, cy - 0.16, cz + h / 2 + 0.33), segs=10, rings=6, color="#d9483b")
    for sx in (-1, 1):
        g.stick((cx + sx * 2.6, cy, cz + h / 2 + 0.22), (cx + sx * 2.2, cy, CEIL - 0.6), 0.03, segs=5,
                color="#3a2a3c")
    ob = g.build(origin=(cx, cy, cz), props={"ui": "marquee"})
    bulbs = Geo("Marquee_Bulbs_Emissive")
    nb = 11
    for k in range(nb):
        x = cx - w / 2 - 0.05 + (w + 0.1) * k / (nb - 1)
        for zz in (cz + h / 2 + 0.13, cz - h / 2 - 0.13):
            bulbs.sphere(0.085, loc=(x, cy - 0.17, zz), segs=6, rings=3, color=P["bulb"], shade=(1, 1), jit=0)
    for k in range(1, 3):
        zz = cz - h / 2 - 0.13 + (h + 0.26) * k / 3
        for x in (cx - w / 2 - 0.13, cx + w / 2 + 0.13):
            bulbs.sphere(0.085, loc=(x, cy - 0.17, zz), segs=6, rings=3, color=P["bulb"], shade=(1, 1), jit=0)
    bulbs.build(parent=ob, material="SF_Emissive",
                props={"emissive": True, "emissive_color": P["bulb"], "chase": True})
    plane_marker("Marquee_Text", (cx, cy - 0.27, cz), (0, -1, 0), w - 0.3, h - 0.2, parent=ob,
                 props={"text_color": "#fff2c2", "bg_color": P["marquee"]})
    return ob


def scoreboard():
    g = Geo("Scoreboard")
    cx, cy, cz = 0.0, ROOM_BACK - 0.35, 6.3
    w, h = 7.4, 2.6
    g.box((w + 0.5, 0.3, h + 0.5), loc=(cx, cy, cz), bevel=0.12, color=P["board_rim"])
    g.box((w, 0.2, h), loc=(cx, cy - 0.1, cz), bevel=0.04, color=P["board"], shade=(0.9, 1.05))
    g.box((w + 0.2, 0.3, 0.12), loc=(cx, cy - 0.25, cz - h / 2 - 0.22), bevel=0.04, color=P["board_rim"])
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.cyl(0.1, 0.08, base=(cx + sx * (w / 2 + 0.08), cy - 0.2, cz + sz * (h / 2 + 0.08)), rot=(90, 0, 0),
                  segs=8, color=P["chrome"])
    ob = g.build(origin=(cx, cy, cz), props={"ui": "scoreboard"})
    plane_marker("Scoreboard_Text", (cx, cy - 0.22, cz), (0, -1, 0), w - 0.3, h - 0.2, parent=ob,
                 props={"text_color": "#f4f0e0", "bg_color": P["board"]})
    return ob


def tyre_pedestal(idx, base):
    g = Geo("Pedestal_%d" % idx, seed=idx)
    x, y, z = base
    for k in range(2):
        g.torus(0.46, 0.17, loc=(x, y, z + 0.17 + k * 0.33), segs=12, rsegs=5,
                color=P["tyre"] if k % 2 == 0 else P["tyre2"], shade=(0.85, 1.05))
    tops = ["#d9483b", "#3f6fc8", "#f2c43a", "#7fc45a"]
    g.cyl(0.62, 0.1, base=(x, y, z + 0.62), segs=16, bevel=0.04, seg=1, color=P["pallet"])
    g.cyl(0.55, 0.03, base=(x, y, z + 0.715), segs=16, color=tops[idx - 1], shade=(1, 1))
    for k in range(idx):
        g.disc(0.05, loc=(x - 0.6 - 0.01, y + (k - (idx - 1) / 2) * 0.13, z + 0.67), normal=(-1, 0, 0), segs=8,
               color="#fff1d6")
    return make_pedestal(idx, base, g, 0.745, props={"pedestal_color": tops[idx - 1]})


def crates(g, spots):
    for x, y, z, s, col in spots:
        g.box((s, s, s), loc=(x, y, z + s / 2), bevel=0.06, color=col, shade=(0.75, 1.03))
        g.box((s * 1.02, s * 0.2, s * 1.02), loc=(x, y, z + s / 2), bevel=0.03, color=shade(C(col), 0.8))


def tyre_stack(g, x, y, z, n):
    for k in range(n):
        g.torus(0.42, 0.16, loc=(x, y, z + 0.16 + k * 0.31), segs=14, rsegs=5,
                color=P["tyre"] if k % 2 == 0 else P["tyre2"])
    g.cyl(0.3, 0.05, base=(x, y, z + n * 0.31 - 0.02), segs=12, color="#6e5a3c")
    return z + n * 0.31 + 0.03


# ---------------------------------------------------------------- assemble


def build():
    reset_scene()
    floor_and_edge()
    platform_collision(GEO)
    no_pit()
    water()
    floaters()
    set_g, win = room()
    pillars(set_g)
    drums(set_g, [(-4.3, 5.0, P["drum_r"], 0), (-5.0, 4.2, P["drum_b"], 6), (4.4, -5.6, P["drum_y"], -8),
                  (10.0, -8.4, P["drum_b"], 0), (10.8, -7.6, P["drum_r"], 10), (-10.4, -8.2, P["drum_y"], 0)])
    pallet_deck(set_g, -APRON[1], -APRON[0], -4.2, 4.2, 0.0)
    pallet_deck(set_g, APRON[0], APRON[1], -4.2, 4.2, 0.0)
    pallet_deck(set_g, -5.6, 5.6, 7.6, 8.6, 0.0)
    pallet_deck(set_g, -5.0, 5.0, 8.6, 9.6, 0.55)
    car_top = sedan(set_g)
    crates(set_g, [(-11.0, -3.0, WATER_Z - 0.2, 1.0, "#c99559"), (-11.1, -1.0, WATER_Z - 0.2, 1.3, "#a8743f"),
                   (-11.0, 2.9, WATER_Z - 0.2, 1.1, "#c99559")])
    t1 = tyre_stack(set_g, -10.9, 0.95, WATER_Z - 0.2, 4)
    t2 = tyre_stack(set_g, -11.0, 4.9, WATER_Z - 0.2, 3)
    t3 = tyre_stack(set_g, 11.0, -1.0, WATER_Z - 0.2, 4)
    crates(set_g, [(11.0, -3.1, WATER_Z - 0.2, 1.2, "#c99559"), (11.1, 1.2, WATER_Z - 0.2, 1.0, "#a8743f")])

    # live wire: fuse box on the right wall, cable drooping into the water near the pad
    set_g.box((0.3, 0.9, 1.2), loc=(ROOM_X - 0.15, 4.4, 3.6), bevel=0.08, color="#7fa36a")
    set_g.box((0.06, 0.5, 0.5), loc=(ROOM_X - 0.33, 4.4, 3.7), bevel=0.03, color="#3a2a3c")
    wire = Geo("Hazard_Wire")
    a, b = Vector((ROOM_X - 0.3, 4.4, 3.1)), Vector((4.3, 4.2, WATER_Z + 0.05))
    pts = []
    for k in range(13):
        t = k / 12
        p = a.lerp(b, t)
        p.z -= math.sin(t * math.pi) * 1.0 * (1 - t * 0.3)
        p.z = max(p.z, WATER_Z + 0.04)
        pts.append(p)
    wire.tube(pts, 0.05, segs=6, color="#5c2a3c")
    wire_ob = wire.build(props={"hazard": "electric"})
    spark = Geo("Spark_Emissive")
    for k in range(5):
        spark.cyl(0.03, 0.35, base=(4.3, 4.2, WATER_Z + 0.08), rot=(60, 0, k * 72), segs=5, r2=0.0,
                  color="#fff1a0", shade=(1, 1), jit=0)
    spark.sphere(0.12, loc=(4.3, 4.2, WATER_Z + 0.1), segs=8, rings=5, color="#fff7c8", shade=(1, 1), jit=0)
    spark.build(parent=wire_ob, material="SF_Emissive", props={"emissive": True, "emissive_color": "#fff1a0",
                                                               "flicker": 0.9})

    # fluorescent tubes: the practical over the pad, dimmer ones over the decks
    tube_fixture(set_g, (0.0, 0.4, 5.3), 3.4, "Tube_Emissive").build(
        material="SF_Emissive", props={"emissive": True, "emissive_color": P["tube"], "flicker": 0.35})
    for x, nm in ((-STATION_X, "TubeL_Emissive"), (STATION_X, "TubeR_Emissive")):
        tube_fixture(set_g, (x, 0.0, 4.7), 2.6, nm).build(
            material="SF_Emissive", props={"emissive": True, "emissive_color": P["tube"], "flicker": 0.0})
    # caged work lamp over the pedestals
    set_g.stick((STATION_X, 4.6, CEIL - 0.6), (STATION_X, 4.6, 4.1), 0.02, segs=5, color="#3a2a3c")
    set_g.cyl(0.32, 0.4, base=(STATION_X, 4.6, 3.75), segs=10, r2=0.12, bevel=0.03, color="#d9483b")
    lamp = Geo("Lamp_Emissive")
    lamp.sphere(0.16, loc=(STATION_X, 4.6, 3.72), segs=8, rings=6, color="#ffd27a", shade=(1, 1), jit=0)
    lamp.build(material="SF_Emissive", props={"emissive": True, "emissive_color": "#ffd27a"})
    set_g.build(props={"static": True})
    win.build(material="SF_Emissive", props={"emissive": True, "emissive_color": "#ffb070"})

    marquee()
    scoreboard()

    ease_cols = {"wood": "#c99559", "board": "#fff6e4", "trim": "#7b4f8a",
                 "dabs": ["#d9483b", "#f2c43a", "#3f6fc8", "#7fc45a"]}
    for i, y in enumerate(ROW_Y):
        make_easel(i + 1, (-STATION_X, y, 0.0), (1.0, -0.42, 0), ease_cols)
        tyre_pedestal(i + 1, (STATION_X, y, 0.0))

    spots = [
        ((-4.5, 8.1, 0.0), None), ((-2.6, 8.1, 0.0), None), ((-0.7, 8.15, 0.0), None), ((1.3, 8.1, 0.0), None),
        ((3.2, 8.1, 0.0), None), ((4.9, 8.15, 0.0), None),
        ((-3.6, 9.15, 0.55), None), ((-1.6, 9.1, 0.55), None), ((0.4, 9.15, 0.55), None), ((2.4, 9.1, 0.55), None),
        ((-11.0, -3.0, WATER_Z + 0.8), None), ((-10.9, 0.95, t1), None), ((-11.1, -1.0, WATER_Z + 1.1), None),
        ((-11.0, 2.9, WATER_Z + 0.9), None), ((-11.0, 4.9, t2), None),
        (car_top[0], None),
        (car_top[1], None),
        ((11.0, -1.0, t3), None), ((11.0, -3.1, WATER_Z + 1.0), None), ((11.1, 1.2, WATER_Z + 0.8), None),
    ]
    pal = [("#ff8a5c", "#ffd9b8", "#3f6fc8"), ("#7fc45a", "#e9f7c8", "#d9483b"), ("#b35ac8", "#f0d2f7", "#f2c43a"),
           ("#f2c43a", "#fff3c4", "#7b4f8a"), ("#5aa0e6", "#d8ecff", "#ef8a3a"), ("#e8577a", "#ffd2dc", "#7fc45a"),
           ("#ef8a3a", "#ffe0c2", "#5aa0e6"), ("#9ad46a", "#f0ffd8", "#b35ac8")]
    crowd(spots, (0, 0, 0.5), pal, seed=21)

    podium({"body": "#fff1d6", "trim": ["#f3bf3f", "#d9d4e6", "#e08a4a"], "pip": "#3a2a3c"}, center=(0, 0.4, 0.0))

    light_empty("Light_Tube", (0.0, 0.4, 5.15), "rect", P["tube"], 9.0, flicker=0.35, target=(0.0, 0.4, 0.0),
                width=3.4, height=0.2)
    light_empty("Light_Spark", (4.3, 4.2, WATER_Z + 0.35), "point", "#ffe27a", 4.0, flicker=0.9, distance=5.0)
    light_empty("Light_Worklamp", (STATION_X, 4.6, 3.6), "spot", "#ffc070", 10.0, flicker=0.05,
                target=(STATION_X, 0.0, 0.0), angle=55, distance=12)

    for i, x in enumerate((-2.25, -0.75, 0.75, 2.25)):
        empty("Mark_Roster_%d" % (i + 1), (x, 0.4, 0.0), size=0.2)
    empty("Mark_FaceOff_A", b_from_t(GEO["spawns"]["A"]), size=0.2)
    empty("Mark_FaceOff_B", b_from_t(GEO["spawns"]["B"]), size=0.2)

    cams()
    export_glb(os.path.join(OUT_DIR, "garage.glb"))


def cams():
    cam_empty("Cam_Establish", (-7.0, -10.2, 7.6), (0.5, 2.2, 0.4), fov=50, note="crane start, high front-left")
    cam_empty("Cam_Establish_End", (0.0, -8.6, 2.8), (0.0, 2.0, 1.5), fov=44, note="crane end, marquee in frame")
    cam_empty("Cam_FightWide", (0.0, -8.9, 4.0), (0.0, 1.2, 0.75), fov=40, note="default fight wide")
    cam_empty("Cam_Build", (-1.4, -1.6, 2.6), (-STATION_X, 0.1, 1.15), fov=42, note="four easels")
    cam_empty("Cam_Foundry", (1.4, -1.6, 2.5), (STATION_X, 0.1, 0.95), fov=42, note="four pedestals")
    cam_empty("Cam_Roster", (0.0, -6.6, 1.9), (0.0, 0.4, 0.6), fov=38, note="four roster marks")
    faceoff_cams(GEO)
    # just above the water, looking back over the striped lip at the rim; the
    # E/W cams stop short of the pallet decks
    edge_cams(cam_z=0.4, out=2.3, target_z=0.1, fov=52, lateral=1.7, look_in=0.2,
              sides={"E": {"out": 2.0}, "W": {"out": 2.0}})
    cam_empty("Cam_Podium", (0.0, -5.4, 1.7), (0.0, 0.4, 0.95), fov=36, note="podium")
    cam_empty("Cam_Scoreboard", (0.0, 3.2, 6.0), (0.0, ROOM_BACK, 6.3), fov=42, note="back-wall scoreboard")


build()
print("TRIS", count_tris())
