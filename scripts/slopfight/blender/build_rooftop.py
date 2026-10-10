"""Rooftop arena -> public/models/slopfight/rooftop.glb

    blender --background --factory-startup --python build_rooftop.py

Night on a skinny brick tower: the 6 x 6 platform is its terracotta-paved
roof with a low tangerine coping that does not stop ring-outs (arenas.ts
ROOFTOP: every edge open, the street 30 units down). Easels stand on the
neighbour's wooden deck to the left, pedestals (cable spools) on the right
neighbour's roof; the crowd fills the low roof behind, a fire escape, a stair
hut and the next roofs along. Behind: a laundry line flapping in the wind, a
string of festoon bulbs, a warm "EAT" neon, a water tower, AC units, a
rooftop billboard (the marquee) and a painted billboard on the tall building
to the right (the scoreboard); beyond them three layers of skyline cut-outs
with warm windows under a violet-to-amber night sky and a big moon.
"""

import math
import os
import random
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (no_pit, HALF, OUT_DIR, C, Geo, Vector, b_from_t, cam_empty, count_tris, crowd,  # noqa: E402
                    edge_cams, edge_lights, empty, export_glb, faceoff_cams, light_empty, make_easel, make_pedestal,
                    mix, perimeter_u, plane_marker, platform_collision, podium, read_arena, rect_sweep, reset_scene,
                    shade, stroke_text)

GEO = read_arena("ROOFTOP")
TOP_Z = GEO["top"]
THICK = GEO["thickness"]
STREET_Z = GEO["surround"]["y"]  # -30
COPING_W = GEO["lip"]["width"]  # visual only: open edges have no lip collider
COPING_H = 0.02  # low enough that a fighter standing on it does not visibly sink in
WIN_BOTTOM = -16.0  # lowest window row worth drawing (deeper rows sit in the dark)
STATION_X = 7.5
ROW_Y = (2.75, 0.92, -0.92, -2.75)

# neighbour blocks: (x0, x1, y0, y1, roof z)
B1 = (-10.6, -5.4, -5.6, 5.2, -0.4)  # left: wooden deck, easels
B2 = (5.4, 10.6, -5.6, 5.2, -0.25)  # right: membrane roof, cable-spool pedestals
BC = (-5.4, 5.4, 6.4, 14.0, -0.8)  # back centre: low roof, crowd, marquee billboard
BL = (-14.0, -5.4, 6.0, 14.0, -0.2)  # back left: neon sign, water tower
BR = (5.4, 14.0, 6.0, 14.0, 6.8)  # back right: tall, scoreboard billboard, fire escape

P = {
    "paver_a": "#4f8a8e",
    "paver_b": "#467f84",
    "grout": "#6e4552",
    "ring": "#fff1d6",
    "coping": "#ff8a3d",
    "coping2": "#fff1d6",
    "brick": "#c4614a",
    "brick_dk": "#a84f40",
    "brick2": "#d08a5a",
    "brick3": "#8f5a7a",
    "brick4": "#b8715e",
    "cream": "#f6e7c8",
    "deck": "#c99559",
    "deck2": "#b6824a",
    "membrane": "#7fae94",
    "tar": "#6c5a78",
    "win_lit": "#ffcf73",
    "win_lit2": "#ffb35a",
    "win_dark": "#4b3558",
    "spool": "#d9a868",
    "ac": "#e9e2d0",
    "ac_dk": "#b9b0a0",
    "tank": "#b8784a",
    "tank_dk": "#93603c",
    "steel": "#8a7a9a",
    "neon": "#ff9a3c",
    "neon2": "#ffd25a",
    "board": "#5a2140",
    "marquee": "#5a2140",
    "marquee_rim": "#ffcf5a",
    "bulb": "#fff2c2",
    "sky_top": "#3b2b63",
    "sky_mid": "#8a4c86",
    "sky_low": "#ff9e6b",
    "sky_horizon": "#ffc07a",
    "moon": "#fff1c8",
    "sky1": "#6a4580",
    "sky2": "#7d5290",
    "sky3": "#9a64a0",
    "street": "#3d3050",
    "kerb": "#7a6a7a",
    "ink": "#4b3a5e",
}


# ---------------------------------------------------------------- helpers


def wall_quad(g, face, coord, a0, a1, z0, z1, color, **kw):
    """Axis-aligned quad on a building face. face is '-y', '+y', '-x' or '+x';
    coord is the face plane; a0..a1 runs along the face."""
    if face == "-y":
        pts = [(a0, coord, z0), (a1, coord, z0), (a1, coord, z1), (a0, coord, z1)]
    elif face == "+y":
        pts = [(a1, coord, z0), (a0, coord, z0), (a0, coord, z1), (a1, coord, z1)]
    elif face == "-x":
        pts = [(coord, a1, z0), (coord, a0, z0), (coord, a0, z1), (coord, a1, z1)]
    else:
        pts = [(coord, a0, z0), (coord, a1, z0), (coord, a1, z1), (coord, a0, z1)]
    g.quad(pts, color=color, shade=(1, 1), jit=0.03, noise=0, **kw)


def building(g, lit, box, color, faces, rng, cornice=P["cream"], parapet=0.0, win_w=0.62, win_h=0.95,
             step_x=1.6, step_z=2.0, lit_p=0.42, top_gap=1.3):
    """Brick block from the street to its roof, lit/unlit windows on the
    listed faces, a cornice band and an optional parapet round the roof."""
    x0, x1, y0, y1, top = box
    g.slab(x0, x1, y0, y1, STREET_Z, top, bevel=0.0, color=color, shade=(0.45, 1.0), zr=(STREET_Z, top))
    if cornice:
        g.slab(x0 - 0.14, x1 + 0.14, y0 - 0.14, y1 + 0.14, top - 0.55, top - 0.25, bevel=0.05, seg=1, color=cornice)
    if parapet:
        t = 0.25
        for (a0, a1, b0, b1) in ((x0, x1, y0, y0 + t), (x0, x1, y1 - t, y1), (x0, x0 + t, y0, y1), (x1 - t, x1, y0, y1)):
            g.slab(a0, a1, b0, b1, top, top + parapet, bevel=0.0, color=color, shade=(0.9, 1.0))
            g.slab(a0 - 0.04, a1 + 0.04, b0 - 0.04, b1 + 0.04, top + parapet, top + parapet + 0.1, bevel=0.03, seg=1,
                   color=cornice or P["cream"])
    for face in faces:
        if face in ("-y", "+y"):
            a_lo, a_hi, coord = x0, x1, (y0 - 0.012 if face == "-y" else y1 + 0.012)
        else:
            a_lo, a_hi, coord = y0, y1, (x0 - 0.012 if face == "-x" else x1 + 0.012)
        span = a_hi - a_lo
        n = max(1, int(span / step_x))
        z = top - top_gap - win_h
        while z > WIN_BOTTOM:
            for k in range(n):
                a = a_lo + span * (k + 0.5) / n
                on = rng.random() < lit_p
                col = (P["win_lit"] if rng.random() < 0.6 else P["win_lit2"]) if on else P["win_dark"]
                wall_quad(lit if on else g, face, coord, a - win_w / 2, a + win_w / 2, z, z + win_h, col)
            z -= step_z


# ---------------------------------------------------------------- platform


def platform():
    g = Geo("Floor", seed=2)
    inner = HALF - COPING_W
    n = 6
    step = 2 * inner / n
    rng = random.Random(3)
    for i in range(n):
        for j in range(n):
            x0, y0 = -inner + i * step, -inner + j * step
            col = P["paver_a"] if (i + j) % 2 == 0 else P["paver_b"]
            g.slab(x0 + 0.02, x0 + step - 0.02, y0 + 0.02, y0 + step - 0.02, TOP_Z - 0.1, TOP_Z, bevel=0.03, seg=1,
                   color=shade(C(col), rng.uniform(0.96, 1.04)), shade=(0.85, 1.0), top_only=True)
    g.slab(-HALF, HALF, -HALF, HALF, TOP_Z - THICK, TOP_Z - 0.09, bevel=0.0, color=P["grout"], shade=(0.8, 1.0), jit=0)
    # painted ring and start marks (decals)
    segs = 40
    for k in range(segs):
        if k % 4 == 3:
            continue  # dashed
        a0, a1 = 2 * math.pi * k / segs, 2 * math.pi * (k + 1) / segs
        r0, r1 = 1.8, 1.96
        g.quad([(math.cos(a0) * r0, math.sin(a0) * r0, TOP_Z + 0.004), (math.cos(a0) * r1, math.sin(a0) * r1, TOP_Z + 0.004),
                (math.cos(a1) * r1, math.sin(a1) * r1, TOP_Z + 0.004), (math.cos(a1) * r0, math.sin(a1) * r0, TOP_Z + 0.004)],
               color=P["ring"], shade=(1, 1), jit=0, noise=0, flat=True)
    for sx in (-1, 1):
        sp = b_from_t(GEO["spawns"]["A" if sx < 0 else "B"])
        g.box((0.5, 0.14, 0.01), loc=(sp[0], sp[1], TOP_Z + 0.004), bevel=0, color=P["ring"], shade=(1, 1), flat=True)
    floor = g.build(props={"surface": "pavers"})

    # Edge: a low coping on the rim, tangerine/cream dashes on top, wrapping
    # down the facade. Visual only: every rooftop edge is open.
    e = Geo("Edge")
    prof = [(-COPING_W, -0.002), (-COPING_W, COPING_H - 0.02), (-COPING_W + 0.02, COPING_H), (-0.02, COPING_H),
            (0.0, COPING_H - 0.02), (0.03, 0.0), (0.03, -0.26), (0.0, -0.3)]

    def dash(c, nrm, col):
        if nrm.z > 0.5:
            k = int(math.floor(perimeter_u(c) / 0.5))
            return C(P["coping"]) if k % 2 == 0 else C(P["coping2"])
        return C(P["coping"]) if c.z > -0.05 else C(P["cream"])

    rect_sweep(e, prof, dash, nseg=12, shade=(0.85, 1.05), jit=0, noise=0)
    edge = e.build(props={"lip": False, "coping": True, "edges": "all open"})
    edge_lights(edge, color="#ffcf6a", n_per_side=6, inset=COPING_W / 2, z=TOP_Z + COPING_H, size=0.03,
                edges=GEO["edges"])
    return floor, edge


# ---------------------------------------------------------------- city


def deck(g, box):
    x0, x1, y0, y1, top = box
    n = 8
    w = (x1 - x0 - 0.5) / n
    for k in range(n):
        a = x0 + 0.25 + k * w
        g.slab(a + 0.02, a + w - 0.02, y0 + 0.25, y1 - 0.25, top, top + 0.08, bevel=0.025, seg=1,
               color=P["deck"] if k % 2 == 0 else P["deck2"], shade=(0.85, 1.0))


def membrane(g, box, color):
    x0, x1, y0, y1, top = box
    g.slab(x0 + 0.25, x1 - 0.25, y0 + 0.25, y1 - 0.25, top, top + 0.03, bevel=0.0, color=color, shade=(1, 1))
    for k in range(1, 5):
        y = y0 + (y1 - y0) * k / 5
        g.box((x1 - x0 - 0.6, 0.06, 0.012), loc=((x0 + x1) / 2, y, top + 0.034), bevel=0, color=shade(C(color), 0.82),
              shade=(1, 1), flat=True)


def stair_hut(g, x0, x1, y0, y1, z, h):
    g.slab(x0, x1, y0, y1, z, z + h, bevel=0.06, seg=1, color=P["brick2"], shade=(0.7, 1.0))
    g.slab(x0 - 0.12, x1 + 0.12, y0 - 0.12, y1 + 0.12, z + h, z + h + 0.14, bevel=0.04, seg=1, color=P["cream"])
    g.slab((x0 + x1) / 2 - 0.45, (x0 + x1) / 2 + 0.45, y0 - 0.04, y0, z, z + 1.5, bevel=0.03, seg=1, color="#3f6fc8")
    g.sphere(0.05, loc=((x0 + x1) / 2 + 0.3, y0 - 0.06, z + 0.75), segs=6, rings=4, color=P["neon2"])


def ac_unit(set_g, idx, base, yaw=0.0):
    """AC unit box in the set; AC_N_Fan is a child node code can spin."""
    x, y, z = base
    set_g.box((1.5, 1.05, 0.95), loc=(x, y, z + 0.5), rot=(0, 0, yaw), bevel=0.12, seg=1, color=P["ac"],
              shade=(0.7, 1.05))
    set_g.box((1.55, 1.1, 0.08), loc=(x, y, z + 0.06), rot=(0, 0, yaw), bevel=0.03, seg=1, color=P["ac_dk"])
    set_g.cyl(0.4, 0.04, base=(x - 0.25, y, z + 0.97), segs=12, color=P["ink"], shade=(1, 1))
    for k in range(4):
        set_g.box((1.3, 0.04, 0.03), loc=(x, y - 0.54, z + 0.3 + k * 0.14), rot=(0, 0, yaw), bevel=0, color=P["ac_dk"],
                  shade=(1, 1))
    fan = Geo("AC_%d_Fan" % idx, seed=idx)
    for k in range(3):
        a = math.radians(k * 120)
        fan.box((0.34, 0.12, 0.02), loc=(x - 0.25 + math.cos(a) * 0.17, y + math.sin(a) * 0.17, z + 1.02),
                rot=(0, 12, k * 120), bevel=0, color=P["ac_dk"], shade=(1, 1))
    fan.cyl(0.07, 0.04, base=(x - 0.25, y, z + 1.0), segs=8, color=P["ac"])
    return fan, (x - 0.25, y, z + 1.0)


def water_tower(g, base):
    x, y, z = base
    leg_top = z + 2.0
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        g.stick((x + sx * 1.2, y + sy * 1.2, z), (x + sx * 0.95, y + sy * 0.95, leg_top), 0.09, segs=6, color=P["steel"])
    for k in range(4):
        a, b = [(-1, -1), (1, -1), (1, 1), (-1, 1)][k], [(-1, -1), (1, -1), (1, 1), (-1, 1)][(k + 1) % 4]
        g.stick((x + a[0] * 1.1, y + a[1] * 1.1, z + 0.6), (x + b[0] * 1.02, y + b[1] * 1.02, z + 1.6), 0.045, segs=5,
                color=P["steel"])
    g.cyl(1.55, 0.18, base=(x, y, leg_top), segs=14, bevel=0.05, seg=1, color=P["steel"])

    def staves(c, nrm, col):
        a = math.atan2(c.y - y, c.x - x)
        return C(P["tank"]) if int(math.floor((a + math.pi) / (2 * math.pi) * 16)) % 2 == 0 else C(P["tank_dk"])

    g.cyl(1.4, 2.6, base=(x, y, leg_top + 0.18), segs=16, color=P["tank"], fn=staves, shade=(0.75, 1.05))
    for zz in (0.5, 1.4, 2.3):
        g.cyl(1.43, 0.08, base=(x, y, leg_top + 0.18 + zz), segs=16, caps=False, color=P["ink"], shade=(1, 1))
    g.cyl(1.55, 1.1, base=(x, y, leg_top + 2.78), r2=0.08, segs=16, bevel=0.06, seg=1, color="#7b4f8a",
          shade=(0.8, 1.05))
    g.sphere(0.14, loc=(x, y, leg_top + 3.92), segs=8, rings=5, color=P["neon2"])
    # ladder
    for sx in (-1, 1):
        g.stick((x - 1.45, y + sx * 0.18, z), (x - 1.45, y + sx * 0.18, leg_top + 2.6), 0.03, segs=4, color=P["ink"])
    for k in range(9):
        zz = z + 0.4 + k * 0.5
        g.stick((x - 1.45, y - 0.18, zz), (x - 1.45, y + 0.18, zz), 0.022, segs=4, color=P["ink"])


def city(rng):
    g = Geo("Set_City", seed=5, lod=0.75, max_seg=1)
    lit = Geo("Windows_Emissive", seed=6)
    # the platform's own tower, straight down to the street
    # no cornice: a band under the coping reads as a second ledge to land on
    building(g, lit, (-HALF, HALF, -HALF, HALF, TOP_Z - 0.3), P["brick"], ("-y", "+y", "-x", "+x"), rng,
             cornice=None, step_x=1.9, top_gap=0.9)
    building(g, lit, B1, P["brick2"], ("-y", "+x", "-x"), rng, cornice=P["cream"], parapet=0.55)
    building(g, lit, B2, P["brick4"], ("-y", "-x", "+x"), rng, cornice=P["cream"], parapet=0.55)
    building(g, lit, BC, P["brick3"], ("-y",), rng, cornice=P["cream"], parapet=0.5)
    building(g, lit, BL, P["brick_dk"], ("-y", "+x"), rng, cornice=P["cream"], parapet=0.6)
    building(g, lit, BR, P["brick2"], ("-y", "-x"), rng, cornice=P["cream"], parapet=0.7, lit_p=0.5)
    # a couple of far-side blocks so the alleys do not open onto nothing
    building(g, lit, (-24.0, -11.0, -16.0, -6.5, -6.0), P["brick3"], ("-y", "+x"), rng, cornice=P["cream"])
    building(g, lit, (11.0, 24.0, -16.0, -6.5, -4.5), P["brick_dk"], ("-y", "-x"), rng, cornice=P["cream"])
    building(g, lit, (-24.0, -11.4, -5.0, 5.6, 1.5), P["brick4"], ("-y", "+x"), rng, cornice=P["cream"])
    building(g, lit, (11.4, 24.0, -5.0, 5.6, 3.0), P["brick3"], ("-y", "-x"), rng, cornice=P["cream"])
    deck(g, B1)
    membrane(g, B2, P["membrane"])
    membrane(g, BC, P["tar"])
    membrane(g, BL, P["tar"])
    stair_hut(g, B1[0] + 0.4, B1[0] + 2.2, B1[3] - 2.0, B1[3] - 0.3, B1[4], 2.1)
    # vents, a chimney with pots, an antenna, a satellite dish
    for (x, y, z) in ((-3.0, 8.2, BC[4]), (2.2, 13.0, BC[4]), (8.8, -4.6, B2[4])):
        g.cyl(0.18, 0.9, base=(x, y, z), segs=8, color=P["steel"])
        g.cyl(0.3, 0.16, base=(x, y, z + 0.9), segs=8, bevel=0.05, seg=1, color=P["ac"])
    g.slab(-12.6, -11.2, 12.0, 13.2, BL[4], BL[4] + 2.4, bevel=0.06, seg=1, color=P["brick"], shade=(0.7, 1.0))
    for k in range(3):
        g.cyl(0.18, 0.5, base=(-12.35 + k * 0.45, 12.6, BL[4] + 2.4), segs=8, r2=0.14, color=P["tank"])
    g.stick((1.0, 12.5, BC[4]), (1.0, 12.5, BC[4] + 3.4), 0.04, segs=5, color=P["ink"])
    for k in range(3):
        g.stick((0.4, 12.5, BC[4] + 2.2 + k * 0.45), (1.6, 12.5, BC[4] + 2.2 + k * 0.45), 0.025, segs=4, color=P["ink"])
    g.lathe([(0.0, 0.0), (0.9, 0.35), (1.0, 0.42), (0.0, 0.12)], base=(11.5, 10.0, BR[4] + 0.9), rot=(-35, 0, 20),
            segs=12, color=P["ac"])
    g.stick((11.5, 10.0, BR[4]), (11.5, 10.0, BR[4] + 1.0), 0.06, segs=5, color=P["steel"])
    return g, lit


def street(g, emis):
    """The street 30 units down: asphalt, kerbs, dashes, parked toy cars."""
    z = STREET_Z
    g.slab(-40, 40, -40, 40, z - 0.3, z, bevel=0.0, color=P["street"], shade=(1, 1))
    for (x0, x1, y0, y1) in ((-26, 26, -18.5, -16.5), (-26, 26, 14.5, 16.5), (-26, -24.5, -16.5, 14.5),
                             (24.5, 26, -16.5, 14.5)):
        g.slab(x0, x1, y0, y1, z, z + 0.25, bevel=0.0, color=P["kerb"], shade=(1, 1))
    for k in range(-9, 10):
        g.box((1.4, 0.18, 0.02), loc=(k * 3.0, -22.0, z + 0.01), bevel=0, color=P["neon2"], shade=(1, 1), flat=True)
    rng = random.Random(14)
    for k in range(6):
        x = -20 + k * 7.5 + rng.uniform(-1, 1)
        y = -20.6 if k % 2 == 0 else -23.4
        col = rng.choice(["#e4523f", "#5a9be6", "#ffd23a", "#7fc45a"])
        g.box((2.6, 1.3, 0.8), loc=(x, y, z + 0.6), bevel=0.25, seg=1, color=col)
        g.box((1.5, 1.2, 0.6), loc=(x - 0.2, y, z + 1.2), bevel=0.2, seg=1, color="#fff1d6")
        for sy in (-0.4, 0.4):  # headlights: 30 units down, a box reads the same as a sphere
            emis.box((0.06, 0.26, 0.18), loc=(x + 1.32, y + sy, z + 0.65), bevel=0, color="#fff2c2", shade=(1, 1), jit=0)
    for x in (-18, -6, 6, 18):
        g.stick((x, -18.2, z), (x, -18.2, z + 4.5), 0.08, segs=5, color=P["ink"])
        emis.sphere(0.3, loc=(x, -18.6, z + 4.5), segs=6, rings=4, color="#ffc46a", shade=(1, 1), jit=0)


SKY_R = 82.0  # half-size of the sky box


def _sky_grad(zz):
    """Warm city glow on the horizon fading through plum to violet."""
    lo, hz, mid, top = C(P["sky_low"]), C(P["sky_horizon"]), C(P["sky_mid"]), C(P["sky_top"])
    if zz < 0.0:
        return mix(lo, hz, max(0.0, (zz + 40) / 40))
    if zz < 12.0:
        return mix(hz, mid, zz / 12.0)
    return mix(mid, top, min(1.0, (zz - 12.0) / 30.0))


def _skyline_layer(sil, wins, face, coord, a_lo, a_hi, col, heights, wp, rng):
    """One row of flat building cut-outs facing the arena, with warm windows."""
    h0, h1 = heights
    a = a_lo
    while a < a_hi:
        w = rng.uniform(3.0, 7.5)
        h = rng.uniform(h0, h1)
        pieces = [(a, a + w - 0.2, h)]
        r = rng.random()
        if r < 0.25:  # stepped top
            pieces.append((a + w * 0.25, a + w * 0.75 - 0.2, h + rng.uniform(1.0, 3.0)))
        elif r < 0.4:  # spire
            pieces.append((a + w / 2 - 0.3, a + w / 2 + 0.1, h + rng.uniform(2.5, 5.0)))
        # cut-outs are only seen from the arena side: no back or bottom faces
        back = {"-y": "+y", "+y": "-y", "+x": "-x", "-x": "+x"}[face]
        for k, (u0, u1, top) in enumerate(pieces):
            zb = STREET_Z if k == 0 else h
            kw = dict(bevel=0.0, color=col, shade=(0.8, 1.0), jit=0.03, skip=("-z", back))
            if face == "-y":
                sil.slab(u0, u1, coord, coord + 0.4, zb, top, **kw)
            elif face == "+y":
                sil.slab(u0, u1, coord - 0.4, coord, zb, top, **kw)
            elif face == "+x":
                sil.slab(coord - 0.4, coord, u0, u1, zb, top, **kw)
            else:
                sil.slab(coord, coord + 0.4, u0, u1, zb, top, **kw)
        wc = coord + {"-y": -0.02, "+y": 0.02, "+x": 0.02, "-x": -0.02}[face]
        nx = max(1, int(w / 1.3))
        nz = int((h - (h0 - 4)) / 1.6)
        for i in range(nx):
            for j in range(nz):
                wz = h - 1.2 - j * 1.6
                if wz < h0 - 4 or rng.random() >= wp:
                    continue
                wa = a + 0.4 + i * (w - 0.8) / nx
                wall_quad(wins, face, wc, wa, wa + 0.45, wz, wz + 0.65, "#ffcf73" if rng.random() < 0.7 else "#ffa860")
        a += w


def backdrop():
    """Sky box (gradient cards on all four sides so every shot has sky),
    moon, stars and skyline cut-out layers with warm windows."""
    sky = Geo("Backdrop_Sky_Emissive", seed=1)
    zs = [-40.0, -10.0, 0.0, 4.0, 8.0, 12.0, 20.0, 30.0, 42.0, 70.0]
    R = SKY_R
    for face, coord in (("-y", R), ("+x", -R), ("-x", R), ("+y", -R)):
        for z0, z1 in zip(zs, zs[1:]):
            g2 = Geo("tmp_band")
            wall_quad(g2, face, coord, -R - 1, R + 1, z0, z1, "#ffffff")
            c0, c1 = _sky_grad(z0), _sky_grad(z1)
            g2.L[-1] = [c0, c0, c1, c1]
            sky.merge(g2)
    rng = random.Random(77)
    for k in range(90):
        side = k % 4
        u, sz = rng.uniform(-R + 4, R - 4), rng.uniform(16, 66)
        loc, nrm = {0: ((u, R - 0.4, sz), (0, -1, 0)), 1: ((-R + 0.4, u, sz), (1, 0, 0)),
                    2: ((R - 0.4, u, sz), (-1, 0, 0)), 3: ((u, -R + 0.4, sz), (0, 1, 0))}[side]
        sky.disc(rng.uniform(0.2, 0.45), loc=loc, normal=nrm, segs=5, color="#fff4d6" if k % 3 else "#ffd9a8",
                 shade=(1, 1), jit=0)
    sky.build(material="SF_Emissive", props={"emissive": True, "emissive_strength": 1.0, "backdrop": True,
                                             "unlit": True})
    moon = Geo("Moon_Emissive", seed=2)
    mx, my, mz = -30.0, R - 1.0, 34.0
    moon.disc(6.0, loc=(mx, my, mz), normal=(0, -1, 0), segs=24, color=P["moon"], shade=(1, 1), jit=0)
    for (dx, dz, r) in ((-1.8, 1.5, 1.2), (2.0, -1.2, 0.9), (0.6, 2.6, 0.6), (-0.6, -2.4, 0.7)):
        moon.disc(r, loc=(mx + dx, my - 0.1, mz + dz), normal=(0, -1, 0), segs=10, color="#f0dcae", shade=(1, 1),
                  jit=0)
    moon.build(material="SF_Emissive", props={"emissive": True, "emissive_strength": 1.6, "backdrop": True})

    sil = Geo("Backdrop_Skyline", seed=3, lod=0.7, max_seg=1)
    wins = Geo("Backdrop_Windows_Emissive", seed=4)
    # behind the arena: three layers, nearest darkest
    _skyline_layer(sil, wins, "-y", 26.0, -70, 70, P["sky1"], (-6.0, 7.0), 0.34, rng)
    _skyline_layer(sil, wins, "-y", 40.0, -90, 90, P["sky2"], (-8.0, 12.0), 0.2, rng)
    _skyline_layer(sil, wins, "-y", 58.0, -120, 120, P["sky3"], (-10.0, 16.0), 0.1, rng)
    # sides and front: one layer each, for the Build / Foundry / reverse shots
    _skyline_layer(sil, wins, "+x", -38.0, -40, 30, P["sky2"], (-6.0, 10.0), 0.14, rng)
    _skyline_layer(sil, wins, "-x", 38.0, -40, 30, P["sky2"], (-6.0, 10.0), 0.14, rng)
    _skyline_layer(sil, wins, "+y", -38.0, -40, 40, P["sky2"], (-6.0, 10.0), 0.12, rng)
    sil.build(props={"backdrop": True})
    wins.build(material="SF_Emissive", props={"emissive": True, "emissive_strength": 2.0, "backdrop": True})


# ---------------------------------------------------------------- set pieces


def neon_sign():
    """Rooftop neon on struts at the front of BL: EAT + an arrow toward the
    fight. Warm tangerine and amber, never cyan/magenta."""
    cx, cy, base = -7.6, BL[2] + 0.6, BL[4]
    board = Geo("Set_Neon_Frame", seed=9, max_seg=1)
    w, h = 3.3, 1.75
    bz = base + 0.9
    board.box((w, 0.16, h), loc=(cx, cy + 0.12, bz + h / 2), bevel=0.08, seg=1, color="#3a2140", shade=(0.85, 1.0))
    for sx in (-1, 1):
        board.stick((cx + sx * 1.2, cy + 0.2, base), (cx + sx * 1.2, cy + 0.2, bz + 0.2), 0.06, segs=5, color=P["steel"])
        board.stick((cx + sx * 1.2, cy + 0.9, base), (cx + sx * 1.2, cy + 0.2, bz + 1.0), 0.05, segs=5, color=P["steel"])
    board.build(props={"static": True})
    n = Geo("Neon_Emissive", seed=10)
    stroke_text(n, "EAT", (cx - 0.25, cy, bz + 0.62), 0.85, P["neon"], 0.055, spacing=0.45, segs=6, shade=(1, 1), jit=0)
    ay = cy - 0.02
    az = bz + 0.32
    n.tube([(cx - 1.35, ay, az), (cx + 1.1, ay, az)], 0.05, segs=6, color=P["neon2"], shade=(1, 1), jit=0)
    n.tube([(cx + 0.8, ay, az + 0.24), (cx + 1.25, ay, az), (cx + 0.8, ay, az - 0.24)], 0.05, segs=6, color=P["neon2"],
           shade=(1, 1), jit=0)
    for k in range(3):  # chaser dots round the arrow
        n.sphere(0.07, loc=(cx + 1.25 + 0.0, ay, bz + 0.85 + k * 0.28), segs=6, rings=4, color=P["neon2"], shade=(1, 1),
                 jit=0)
    ob = n.build(material="SF_Emissive", props={"emissive": True, "emissive_color": P["neon"], "flicker": 0.25})
    return ob, (cx, cy - 0.6, bz + 0.9)


def festoon():
    """String of warm bulbs across the back, BL corner to BR facade."""
    wire = Geo("Set_Festoon_Wire", max_seg=1)
    bulbs = Geo("Festoon_Emissive")
    a, b = Vector((-5.6, 5.9, 3.1)), Vector((5.6, 5.9, 3.3))
    pts = []
    n = 16
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        p.z -= 0.9 * 4 * t * (1 - t)
        pts.append(p)
    wire.tube(pts, 0.018, segs=4, color=P["ink"], caps=False)
    for k in range(1, n):
        p = pts[k]
        bulbs.sphere((0.1, 0.1, 0.13), loc=(p.x, p.y, p.z - 0.15), segs=6, rings=4,
                     color="#fff2c2" if k % 3 else "#ffcf73", shade=(1, 1), jit=0)
    wire.build(props={"static": True})
    bulbs.build(material="SF_Emissive", props={"emissive": True, "emissive_color": "#fff2c2", "chase": True})
    return (pts[n // 2].x, pts[n // 2].y, pts[n // 2].z - 0.2)


LAUNDRY = [
    # (kind, x along the line, colour, accent)
    ("shirt", -3.1, "#ff8a3d", "#fff1d6"),
    ("socks", -1.75, "#7fc45a", "#fff1d6"),
    ("boxers", -0.6, "#5a9be6", "#fff1d6"),
    ("towel", 0.85, "#f7a8c0", "#e4523f"),
    ("dress", 2.5, "#c8b0f0", "#ffd25a"),
]


def laundry():
    """Line between two poles on BC; each item is its own node
    Hazard_Wind_Laundry_N with its origin on the line so code can swing it
    about local X (and flutter about local Z) in the wind's direction."""
    set_g = Geo("Set_Laundry_Line", max_seg=1)
    y = BC[2] + 0.5
    z0 = BC[4]
    a, b = Vector((-4.4, y, z0 + 2.45)), Vector((4.4, y, z0 + 2.45))
    for p in (a, b):
        set_g.stick((p.x, p.y, z0), (p.x, p.y, p.z + 0.15), 0.06, segs=6, color=P["steel"])
        set_g.box((0.5, 0.08, 0.08), loc=(p.x, p.y, p.z + 0.05), bevel=0.02, seg=1, color=P["steel"])

    def line_z(x):
        t = (x - a.x) / (b.x - a.x)
        return a.z - 0.45 * 4 * t * (1 - t)

    pts = [Vector((a.x + (b.x - a.x) * k / 12, y, line_z(a.x + (b.x - a.x) * k / 12))) for k in range(13)]
    set_g.tube(pts, 0.016, segs=4, color="#fff1d6", caps=False)
    set_g.build(props={"static": True})
    obs = []
    for i, (kind, x, col, acc) in enumerate(LAUNDRY):
        g = Geo("Hazard_Wind_Laundry_%d" % (i + 1), seed=50 + i, max_seg=1)
        zt = line_z(x)
        yy = y + 0.01
        if kind == "shirt":
            pts2 = [(-0.55, -0.0), (-0.32, 0.12), (0.32, 0.12), (0.55, 0.0), (0.42, -0.32), (0.27, -0.24),
                    (0.27, -0.95), (-0.27, -0.95), (-0.27, -0.24), (-0.42, -0.32)]
            g.prism([(x + px, zt + pz - 0.1) for px, pz in reversed(pts2)], 0.05, loc=(0, yy - 0.025, 0), bevel=0.02,
                    seg=1, color=col)
            g.disc(0.12, loc=(x, yy - 0.03, zt - 0.45), normal=(0, -1, 0), segs=10, color=acc, shade=(1, 1))
        elif kind == "socks":
            for sx in (-0.18, 0.18):
                sock = [(-0.09, 0.0), (0.09, 0.0), (0.09, -0.52), (0.26, -0.62), (0.22, -0.74), (-0.09, -0.66)]
                g.prism([(x + sx + px, zt + pz - 0.04) for px, pz in reversed(sock)], 0.05, loc=(0, yy - 0.025, 0),
                        bevel=0.015, seg=1, color=col)
                g.box((0.2, 0.06, 0.07), loc=(x + sx, yy, zt - 0.14), bevel=0, color=acc, shade=(1, 1))
                g.box((0.2, 0.06, 0.07), loc=(x + sx, yy, zt - 0.3), bevel=0, color=acc, shade=(1, 1))
        elif kind == "boxers":
            bx = [(-0.36, 0.0), (0.36, 0.0), (0.4, -0.5), (0.06, -0.5), (0.0, -0.32), (-0.06, -0.5), (-0.4, -0.5)]
            g.prism([(x + px, zt + pz - 0.04) for px, pz in reversed(bx)], 0.05, loc=(0, yy - 0.025, 0), bevel=0.015,
                    seg=1, color=col)
            for (dx, dz) in ((-0.2, -0.15), (0.12, -0.12), (-0.05, -0.28), (0.25, -0.36), (-0.27, -0.38)):
                g.disc(0.045, loc=(x + dx, yy - 0.03, zt + dz - 0.04), normal=(0, -1, 0), segs=6, color=acc,
                       shade=(1, 1))
        elif kind == "towel":
            def stripes(c, nrm, cc):
                return C(acc) if int(math.floor((zt - c.z) / 0.16)) % 4 == 2 else C(col)
            for k in range(7):
                z1 = zt - 0.05 - k * 0.16
                g.slab(x - 0.4, x + 0.4, yy - 0.03 + 0.03 * math.sin(k * 1.3), yy + 0.01 + 0.03 * math.sin(k * 1.3),
                       z1 - 0.16, z1, bevel=0.0, color=acc if k % 4 == 2 else col, shade=(0.92, 1.0))
        else:  # dress
            dr = [(-0.18, 0.0), (0.18, 0.0), (0.22, -0.3), (0.5, -1.05), (-0.5, -1.05), (-0.22, -0.3)]
            g.prism([(x + px, zt + pz - 0.04) for px, pz in reversed(dr)], 0.05, loc=(0, yy - 0.025, 0), bevel=0.02,
                    seg=1, color=col)
            g.box((0.5, 0.06, 0.08), loc=(x, yy - 0.01, zt - 0.36), bevel=0, color=acc, shade=(1, 1))
        # clothespins
        for dx in ((-0.3, 0.3) if kind not in ("socks",) else (-0.18, 0.18)):
            g.box((0.05, 0.07, 0.16), loc=(x + dx, yy - 0.02, zt - 0.02), bevel=0.015, seg=1, color="#e8b36a")
        obs.append(g.build(origin=(x, y, zt), props={"hazard": "wind", "laundry": kind, "swing_axis": "local X",
                                                    "rest_rad": 0.0}))
    return obs


def windsock():
    """Hazard_Wind_Sock: origin at the pivot on top of the pole; the sock
    streams along local +X, so code yaws it to the gust direction."""
    px, py, pz = B2[1] - 1.0, B2[2] + 1.0, B2[4]
    pole = Geo("Set_Windsock_Pole", max_seg=1)
    pole.stick((px, py, pz), (px, py, pz + 3.2), 0.05, segs=6, color=P["steel"])
    pole.sphere(0.1, loc=(px, py, pz + 3.25), segs=6, rings=4, color=P["neon2"])
    pole.build(props={"static": True})
    g = Geo("Hazard_Wind_Sock", seed=12)
    top = Vector((px, py, pz + 3.1))
    g.torus(0.26, 0.035, loc=top + Vector((0.08, 0, 0)), rot=(0, 90, 0), segs=12, rsegs=4, color=P["steel"])
    for k in range(5):
        r0, r1 = 0.25 - k * 0.035, 0.25 - (k + 1) * 0.035
        g.cyl(r0, 0.3, base=top + Vector((0.1 + k * 0.3, 0, -0.03 * k)), rot=(0, 90 + 5, 0), r2=r1, segs=10,
              caps=(k == 4), color="#ff8a3d" if k % 2 == 0 else "#fff1d6", shade=(0.85, 1.05))
    return g.build(origin=tuple(top), props={"hazard": "wind", "points_along": "local +X"})


def marquee():
    """Rooftop billboard on scaffold legs over BC, behind the fight."""
    g = Geo("Marquee", seed=17)
    cx, cy, cz = 0.0, BC[2] + 4.0, 3.0
    w, h = 6.2, 1.5
    g.box((w + 0.5, 0.36, h + 0.5), loc=(cx, cy, cz), bevel=0.2, seg=2, color=P["marquee_rim"], shade=(0.85, 1.05))
    g.box((w, 0.3, h), loc=(cx, cy - 0.06, cz), bevel=0.06, seg=1, color=P["marquee"], shade=(0.85, 1.05))
    base = BC[4]
    for sx in (-1, 1):
        lx = cx + sx * (w / 2 - 0.5)
        g.stick((lx, cy + 0.1, base), (lx, cy + 0.1, cz - h / 2 - 0.2), 0.08, segs=6, color=P["steel"])
        g.stick((lx, cy + 1.3, base), (lx, cy + 0.2, cz), 0.06, segs=6, color=P["steel"])
        g.stick((lx - sx * 0.9, cy + 0.1, base + 0.4), (lx, cy + 0.1, cz - h / 2 - 0.4), 0.04, segs=5, color=P["steel"])
    g.box((w + 0.8, 0.5, 0.08), loc=(cx, cy - 0.15, cz - h / 2 - 0.32), bevel=0.02, seg=1, color=P["steel"])
    ob = g.build(origin=(cx, cy, cz), props={"ui": "marquee"})
    bulbs = Geo("Marquee_Bulbs_Emissive")
    nb = 11
    for k in range(nb):
        x = cx - w / 2 - 0.05 + (w + 0.1) * k / (nb - 1)
        for zz in (cz + h / 2 + 0.13, cz - h / 2 - 0.13):
            bulbs.sphere(0.08, loc=(x, cy - 0.17, zz), segs=6, rings=4, color=P["bulb"], shade=(1, 1), jit=0)
    bulbs.build(origin=(cx, cy, cz), parent=ob, material="SF_Emissive",
                props={"emissive": True, "emissive_color": P["bulb"], "chase": True})
    plane_marker("Marquee_Text", (cx, cy - 0.23, cz), (0, -1, 0), w - 0.3, h - 0.2, parent=ob,
                 props={"text_color": "#fff2c2", "bg_color": P["marquee"]})
    return ob


def scoreboard():
    """Painted billboard on the tall building's front wall, with gooseneck
    lamps; plus a fire escape under it where the crowd stands."""
    g = Geo("Scoreboard", seed=19)
    cx, cy, cz = 9.6, BR[2] - 0.15, 3.6
    w, h = 6.0, 3.0
    g.box((w + 0.5, 0.25, h + 0.5), loc=(cx, cy, cz), bevel=0.15, seg=2, color=P["cream"])
    g.box((w, 0.16, h), loc=(cx, cy - 0.08, cz), bevel=0.04, seg=1, color="#2f4a3c", shade=(0.9, 1.05))
    for sx in (-1, 0, 1):
        lx = cx + sx * 2.2
        g.stick((lx, cy - 0.1, cz + h / 2 + 0.25), (lx, cy - 0.7, cz + h / 2 + 0.7), 0.035, segs=5, color=P["ink"])
        g.cyl(0.18, 0.22, base=(lx, cy - 0.75, cz + h / 2 + 0.75), rot=(140, 0, 0), r2=0.08, segs=8, color=P["ink"])
    ob = g.build(origin=(cx, cy, cz), props={"ui": "scoreboard"})
    plane_marker("Scoreboard_Text", (cx, cy - 0.18, cz), (0, -1, 0), w - 0.3, h - 0.25, parent=ob,
                 props={"text_color": "#f4f0e0", "bg_color": "#2f4a3c"})
    return ob, (cx, cy, cz)


def fire_escape(g, x0, x1, y_face, z):
    """Balcony with railings on a facade (y_face), crowd perch."""
    d = 1.1
    g.slab(x0, x1, y_face - d, y_face, z - 0.08, z, bevel=0.02, seg=1, color=P["ink"])
    for k in range(int((x1 - x0) / 0.5) + 1):
        x = x0 + k * (x1 - x0) / int((x1 - x0) / 0.5)
        g.stick((x, y_face - d, z), (x, y_face - d, z + 0.75), 0.02, segs=4, color=P["ink"])
    g.stick((x0, y_face - d, z + 0.75), (x1, y_face - d, z + 0.75), 0.035, segs=5, color=P["ink"])
    g.stick((x0, y_face - d, z + 0.4), (x1, y_face - d, z + 0.4), 0.02, segs=4, color=P["ink"])
    for sx in (x0, x1):
        g.stick((sx, y_face - d, z + 0.75), (sx, y_face, z + 0.75), 0.03, segs=4, color=P["ink"])
    # ladder down
    for sy in (-0.2, 0.2):
        g.stick((x1 - 0.4 + sy, y_face - d + 0.1, z), (x1 - 0.4 + sy, y_face - d + 0.1, z - 2.6), 0.02, segs=4,
                color=P["ink"])


def cable_spool(idx, base):
    g = Geo("Pedestal_%d" % idx, seed=idx)
    cols = ["#e4523f", "#5a9be6", "#ffd23a", "#7fc45a"]
    c = cols[idx - 1]
    x, y, z = base
    g.cyl(0.58, 0.09, base=(x, y, z), segs=16, bevel=0.03, seg=1, color=P["spool"], shade=(0.8, 1.0))
    g.cyl(0.34, 0.46, base=(x, y, z + 0.09), segs=14, color=c, shade=(0.8, 1.05))
    for k in range(3):
        g.cyl(0.36, 0.07, base=(x, y, z + 0.14 + k * 0.14), segs=14, caps=False, color=shade(C(c), 0.82), shade=(1, 1))
    g.cyl(0.6, 0.09, base=(x, y, z + 0.55), segs=16, bevel=0.03, seg=1, color=P["spool"], shade=(0.9, 1.05))
    g.cyl(0.12, 0.012, base=(x, y, z + 0.64), segs=10, color=P["ink"], shade=(1, 1))
    return make_pedestal(idx, base, g, 0.645, props={"pedestal_color": c})


# ---------------------------------------------------------------- build


def build():
    reset_scene()
    rng = random.Random(8)
    platform()
    platform_collision(GEO)
    no_pit()
    set_g, lit = city(rng)
    emis = Geo("Street_Emissive")
    street(set_g, emis)
    fire_escape(set_g, 6.0, 9.2, BR[2], 0.6)
    fans = [ac_unit(set_g, 1, (-3.4, 11.8, BC[4])), ac_unit(set_g, 2, (3.4, 12.2, BC[4])),
            ac_unit(set_g, 3, (9.2, 3.8, B2[4]))]
    water_tower(set_g, (-10.2, 10.4, BL[4]))
    set_g.build(props={"static": True})
    lit.build(material="SF_Emissive", props={"emissive": True, "emissive_color": P["win_lit"], "emissive_strength": 2.5})
    emis.build(material="SF_Emissive", props={"emissive": True, "emissive_color": "#ffc46a"})
    for f, hub in fans:
        f.build(origin=hub, props={"spin": True, "spin_axis": "local Y (three.js)"})
    backdrop()
    neon_ob, neon_pos = neon_sign()
    fest = festoon()
    laundry()
    windsock()
    marquee()
    sb, sb_pos = scoreboard()

    ease_cols = {"wood": "#c99559", "board": "#fff6e4", "trim": "#ff8a3d",
                 "dabs": ["#5a9be6", "#ffd23a", "#7fc45a", "#e4523f"]}
    for i, y in enumerate(ROW_Y):
        make_easel(i + 1, (-STATION_X, y, B1[4] + 0.08), (1.0, -0.42, 0), ease_cols)
        cable_spool(i + 1, (STATION_X, y, B2[4] + 0.03))

    hut_top = B1[4] + 2.1 + 0.14
    spots = [
        ((B1[0] + 0.85, B1[3] - 1.0, hut_top), None), ((B1[0] + 1.75, B1[3] - 1.3, hut_top), None),
        ((-6.4, 4.4, B1[4] + 0.08), None),
        ((7.4, 4.5, B2[4] + 0.03), None), ((10.0, 2.3, B2[4] + 0.03), None),
        ((-3.9, 7.4, BC[4]), None), ((-2.7, 8.1, BC[4]), None), ((-1.4, 7.3, BC[4]), None), ((-0.1, 8.0, BC[4]), None),
        ((1.3, 7.3, BC[4]), None), ((2.6, 8.2, BC[4]), None), ((3.9, 7.4, BC[4]), None), ((-4.4, 9.2, BC[4]), None),
        ((4.5, 9.4, BC[4]), None),
        ((-13.0, 6.9, BL[4]), None), ((-5.9, 6.9, BL[4]), None), ((-12.0, 8.2, BL[4]), None),
        ((6.6, BR[2] - 0.6, 0.6), None), ((7.7, BR[2] - 0.5, 0.6), None), ((8.8, BR[2] - 0.6, 0.6), None),
    ]
    pal = [("#ff8a5c", "#ffd9b8", "#5a9be6"), ("#7fc45a", "#e9f7c8", "#e4523f"), ("#b35ac8", "#f0d2f7", "#ffd23a"),
           ("#ffd23a", "#fff3c4", "#7b4f8a"), ("#5aa0e6", "#d8ecff", "#ef8a3a"), ("#e8577a", "#ffd2dc", "#7fc45a"),
           ("#ef8a3a", "#ffe0c2", "#5aa0e6"), ("#9ad46a", "#f0ffd8", "#b35ac8")]
    crowd(spots, (0, 0, 0.5), pal, seed=44)

    podium({"body": "#fff1d6", "trim": ["#ffcf5a", "#ece8f4", "#e08a4a"], "pip": "#ff8a3d"}, center=(0.0, 0.4, TOP_Z))

    light_empty("Light_Neon", neon_pos, "point", P["neon"], 5.0, flicker=0.3, distance=9)
    light_empty("Light_Festoon", fest, "point", "#ffd08a", 3.0, flicker=0.05, distance=10)
    light_empty("Light_Billboard", (sb_pos[0], sb_pos[1] - 2.0, sb_pos[2] + 2.4), "spot", "#ffe2b0", 6.0,
                target=sb_pos, angle=55, distance=8)
    light_empty("Light_Moon", (-30.0, 60.0, 34.0), "spot", "#c9c4ff", 2.0, target=(0.0, 0.0, 0.0), angle=14,
                extra={"note": "moonlight; treat as directional (no falloff)"})

    for i, x in enumerate((-2.25, -0.75, 0.75, 2.25)):
        empty("Mark_Roster_%d" % (i + 1), (x, -0.4, TOP_Z), size=0.2)
    empty("Mark_FaceOff_A", b_from_t(GEO["spawns"]["A"]), size=0.2)
    empty("Mark_FaceOff_B", b_from_t(GEO["spawns"]["B"]), size=0.2)
    empty("Wind_Origin", (0.0, 0.0, TOP_Z + 1.5), size=0.4,
          props={"note": "wind direction comes from the fight seed (windFor); laundry and sock follow it"})
    cams(sb_pos)
    export_glb(os.path.join(OUT_DIR, "rooftop.glb"))


def cams(sb_pos):
    cam_empty("Cam_Establish", (-10.5, -12.5, 9.5), (0.6, 2.4, -2.4), fov=52, note="crane start, high front-left")
    cam_empty("Cam_Establish_End", (0.0, -8.6, 2.8), (0.0, 2.0, 1.5), fov=44, note="crane end, marquee in frame")
    cam_empty("Cam_FightWide", (0.0, -8.9, 4.0), (0.0, 1.2, 0.75), fov=40, note="default fight wide")
    cam_empty("Cam_Build", (-1.4, -1.6, 2.5), (-STATION_X, 0.1, 0.85), fov=42, note="four easels")
    cam_empty("Cam_Foundry", (1.4, -1.6, 2.4), (STATION_X, 0.1, 0.6), fov=42, note="four pedestals")
    cam_empty("Cam_Roster", (0.0, -6.6, 1.9), (0.0, -0.4, 0.6), fov=38, note="four roster marks")
    faceoff_cams(GEO)
    # low shots from just outside each edge: the fighter over the rim, the
    # facade plunging below. E/W stay in the alleys, short of the neighbours'
    # parapets; the back one stops at the low roof behind
    edge_cams(cam_z=0.3, out=2.3, target_z=0.1, fov=55, lateral=1.4, look_in=0.2,
              sides={"S": dict(out=3.4, cam_z=0.4, target_z=-0.15), "N": dict(out=3.2, cam_z=0.4, target_z=-0.1)})
    cam_empty("Cam_Podium", (0.0, -5.4, 1.7), (0.0, 0.4, 0.95), fov=36, note="podium")
    cam_empty("Cam_Scoreboard", (6.6, -1.4, 3.3), sb_pos, fov=40, note="painted billboard on the tall building")


build()
print("TRIS", count_tris())
