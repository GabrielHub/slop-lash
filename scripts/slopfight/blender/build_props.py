"""Held-prop library -> public/models/slopfight/props.glb

    blender --background --factory-startup --python build_props.py

One node per PROP_TAGS entry in src/games/slopfight/vocab.ts, named
Prop_<tag> (Prop_leaf_blower, Prop_thing, ...). Every node sits at the world
origin with its origin AT THE GRIP, scaled for a fighter 1 unit tall (a bat
is about 0.5 long), chunky soft-vinyl style, under 500 triangles, vertex
colours only.

Built in Blender (Z up, -Y front) and exported +Y up, so in three.js:
  * the grip is the node origin;
  * extras.grip_axis is the axis the fist closes around (three.js local);
  * extras.tip is the working end (bat barrel, blade point, horn bell);
  * the broad / striking face looks along +Z (towards the camera when the
    fighter faces it);
  * extras.hold is 'upright' (long axis up the fist, +Y), 'aim' (pistol grip,
    business end forward along +Z), 'hanging' (carried by a top handle),
    'worn' (boxing glove: origin at the wrist) or 'front' (flat thing held
    face-out: shield, laptop).
Prop_thing is a plain white lump meant to be tinted the accent colour
(extras.tint = 'accent').
"""

import math
import os
import random
import re
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (OUT_DIR, VOCAB_TS, Geo, Vector, count_tris, export_glb, reset_scene, three)  # noqa: E402

WOOD = "#e0a45e"
WOOD_DK = "#b97a3e"
STEEL = "#e6e3f0"
STEEL_DK = "#b9b4cf"
INK = "#3a2a3c"
CREAM = "#fff1d6"
RED = "#e4523f"
TANG = "#ff8a3d"
YEL = "#ffd23a"
BLUE = "#5a9be6"
MINT = "#8fd6b4"
GREEN = "#7fc45a"
PINK = "#f7a8c0"
PURPLE = "#b35ac8"
BRASS = "#f1c24a"

PROPS = {}


def prop(tag, kind, hold, grip_axis, tip):
    """Register a builder. grip_axis / tip in Blender coordinates."""
    def deco(fn):
        PROPS[tag] = (fn, kind, hold, grip_axis, tip)
        return fn
    return deco


def flat(g, pts, thick, color, y=0.0, bevel=0.006, **kw):
    """Flat cut-out in the XZ plane (broad faces toward -Y/+Y)."""
    g.prism(pts, thick, loc=(0, y - thick / 2, 0), bevel=bevel, seg=1, color=color, **kw)


def star(r0, r1, cx, cz, n=5, rot=90.0):
    pts = []
    for k in range(2 * n):
        a = math.radians(rot + k * 180.0 / n)
        r = r0 if k % 2 == 0 else r1
        pts.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return pts


# ---------------------------------------------------------------- blades


@prop("knife", "blade", "upright", (0, 0, 1), (0, 0, 0.29))
def knife(g):
    g.capsule(0.024, 0.09, loc=(0, 0, 0.0), segs=8, rings=5, color=RED)
    for z in (-0.03, 0.03):
        g.disc(0.007, loc=(0, -0.025, z), normal=(0, -1, 0), segs=5, color=CREAM)
    g.box((0.07, 0.03, 0.018), loc=(0, 0, 0.068), bevel=0.006, seg=1, color=STEEL_DK)
    flat(g, [(-0.03, 0.076), (0.03, 0.076), (0.03, 0.2), (-0.012, 0.29), (-0.03, 0.25)], 0.012, STEEL)
    g.box((0.004, 0.0125, 0.16), loc=(0.024, 0, 0.17), bevel=0, color="#ffffff", shade=(1, 1))


@prop("sword", "blade", "upright", (0, 0, 1), (0, 0, 0.56))
def sword(g):
    g.sphere(0.03, loc=(0, 0, -0.085), segs=8, rings=5, color=BRASS)
    g.cyl(0.02, 0.13, base=(0, 0, -0.065), segs=8, color=PURPLE)
    for k in range(3):
        g.cyl(0.022, 0.012, base=(0, 0, -0.045 + k * 0.04), segs=8, caps=False, color="#7b3f8a", shade=(1, 1))
    g.box((0.17, 0.04, 0.03), loc=(0, 0, 0.075), bevel=0.012, seg=1, color=BRASS)
    for sx in (-1, 1):
        g.sphere(0.02, loc=(sx * 0.09, 0, 0.075), segs=6, rings=4, color=BRASS)
    flat(g, [(-0.03, 0.09), (0.03, 0.09), (0.03, 0.47), (0.0, 0.56), (-0.03, 0.47)], 0.014, STEEL)
    g.box((0.008, 0.0155, 0.34), loc=(0, 0, 0.27), bevel=0, color=STEEL_DK, shade=(1, 1))
    g.sphere((0.016, 0.01, 0.016), loc=(0, -0.012, 0.075), segs=6, rings=4, color=RED)


@prop("cactus", "blade", "upright", (0, 0, 1), (0, 0, 0.27))
def cactus(g):
    g.lathe([(0.0, -0.07), (0.045, -0.07), (0.06, 0.04), (0.068, 0.045), (0.068, 0.065), (0.0, 0.065)],
            segs=12, color="#d9774a", shade=(0.75, 1.05))
    g.cyl(0.058, 0.01, base=(0, 0, 0.058), segs=12, color="#6e4552", shade=(1, 1))
    g.capsule(0.042, 0.12, loc=(0, 0, 0.15), segs=9, rings=5, color=GREEN, shade=(0.8, 1.05))
    for sx, h in ((-1, 0.17), (1, 0.13)):
        g.stick((sx * 0.035, 0, h), (sx * 0.075, 0, h), 0.02, segs=6, color=GREEN)
        g.capsule(0.02, 0.04, loc=(sx * 0.078, 0, h + 0.03), segs=6, rings=3, color=GREEN)
    rng = random.Random(4)
    for k in range(12):
        a = rng.uniform(-1.2, 1.2)
        z = rng.uniform(0.09, 0.24)
        g.disc(0.006, loc=(math.sin(a) * 0.044, -math.cos(a) * 0.044, z), normal=(math.sin(a), -math.cos(a), 0),
               segs=4, color=CREAM)
    for k in range(4):
        a = math.radians(k * 90)
        g.sphere((0.016, 0.016, 0.01), loc=(math.cos(a) * 0.014, math.sin(a) * 0.014, 0.255), segs=5, rings=3,
                 color=PINK)
    g.sphere(0.01, loc=(0, 0, 0.262), segs=6, rings=3, color=YEL)


# ---------------------------------------------------------------- blunt


@prop("bat", "blunt", "upright", (0, 0, 1), (0, 0, 0.47))
def bat(g):
    g.lathe([(0.0, -0.075), (0.03, -0.075), (0.034, -0.06), (0.02, -0.05), (0.02, 0.12), (0.032, 0.22),
             (0.05, 0.36), (0.052, 0.44), (0.042, 0.465), (0.0, 0.472)], segs=12, color=WOOD, shade=(0.85, 1.05))
    for k in range(5):
        g.cyl(0.0225, 0.022, base=(0, 0, -0.045 + k * 0.026), segs=10, caps=False, color=INK if k % 2 == 0 else
              "#5a3d6e", shade=(1, 1))
    g.cyl(0.049, 0.02, base=(0, 0, 0.33), segs=12, caps=False, color=RED, shade=(1, 1))


@prop("umbrella", "blunt", "upright", (0, 0, 1), (0, 0, 0.62))
def umbrella(g):
    g.tube([(0, 0, 0.04), (0, 0, -0.07), (0, -0.02, -0.11), (0, -0.06, -0.12), (0, -0.09, -0.09), (0, -0.09, -0.06)],
           0.015, segs=8, color=WOOD_DK)
    g.cyl(0.009, 0.62, base=(0, 0, 0.0), segs=6, color=STEEL_DK)
    segs = 16
    prof = [(0.012, 0.12), (0.055, 0.2), (0.062, 0.32), (0.05, 0.46), (0.02, 0.55), (0.008, 0.57)]
    bm_g = Geo("tmp_canopy")
    bm_g.lathe(prof, segs=segs, color=TANG, shade=(0.8, 1.05),
               fn=lambda c, n, col: (1.0, 0.54, 0.24) if int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi) * 8) % 2
               else (1.0, 0.94, 0.84))
    # fold the canopy: pull every other ring vertex inward
    for i, v in enumerate(bm_g.V):
        x, y, z = v
        a = math.atan2(y, x)
        k = int(round((a + math.pi) / (2 * math.pi) * segs)) % 2
        if k == 1:
            bm_g.V[i] = (x * 0.72, y * 0.72, z)
    g.merge(bm_g)
    g.cyl(0.022, 0.03, base=(0, 0, 0.16), segs=8, color=TANG)
    g.cyl(0.008, 0.05, base=(0, 0, 0.57), r2=0.003, segs=6, color=BRASS)


@prop("briefcase", "blunt", "hanging", (1, 0, 0), (0, 0, -0.27))
def briefcase(g):
    g.tube([(-0.06, 0, -0.04), (-0.055, 0, -0.005), (-0.03, 0, 0.012), (0.03, 0, 0.012), (0.055, 0, -0.005),
            (0.06, 0, -0.04)], 0.012, segs=6, color=INK)
    g.box((0.34, 0.1, 0.24), loc=(0, 0, -0.17), bevel=0.03, seg=2, color="#c98a52", shade=(0.75, 1.05))
    g.box((0.345, 0.105, 0.012), loc=(0, 0, -0.105), bevel=0.004, seg=1, color="#93603c", shade=(1, 1))
    for sx in (-1, 1):
        g.box((0.04, 0.02, 0.03), loc=(sx * 0.1, -0.052, -0.1), bevel=0.006, seg=1, color=BRASS)
        g.box((0.02, 0.108, 0.24), loc=(sx * 0.155, 0, -0.17), bevel=0.006, seg=1, color="#93603c")


@prop("pan", "blunt", "upright", (0, 0, 1), (0, 0, 0.44))
def pan(g):
    g.capsule(0.019, 0.17, loc=(0, 0, 0.05), segs=8, rings=5, color=WOOD)
    g.cyl(0.024, 0.03, base=(0, 0, 0.155), segs=8, color=INK)
    g.stick((0, 0, 0.17), (0, 0, 0.2), 0.014, segs=6, color=INK)
    # pan body: axis along Y, cooking face toward -Y
    g.lathe([(0.0, 0.0), (0.11, 0.0), (0.135, 0.035), (0.142, 0.04), (0.125, 0.04), (0.105, 0.012), (0.0, 0.012)],
            base=(0, 0.02, 0.33), rot=(90, 0, 0), segs=18, color=RED, shade=(0.85, 1.05))
    g.disc(0.1, loc=(0, -0.0, 0.33), normal=(0, -1, 0), segs=16, color="#3a2a3c")
    g.disc(0.03, loc=(0.03, -0.002, 0.36), normal=(0, -1, 0), segs=8, color="#5a4a6a")


@prop("plunger", "blunt", "upright", (0, 0, 1), (0, 0, 0.5))
def plunger(g):
    g.cyl(0.016, 0.44, base=(0, 0, -0.06), segs=8, color=WOOD)
    g.sphere(0.02, loc=(0, 0, -0.06), segs=8, rings=5, color=WOOD_DK)
    g.lathe([(0.0, 0.36), (0.022, 0.36), (0.05, 0.4), (0.075, 0.45), (0.082, 0.5), (0.07, 0.5), (0.0, 0.47)],
            segs=14, color=RED, shade=(0.75, 1.05))


@prop("mop", "blunt", "upright", (0, 0, 1), (0, 0, 0.68))
def mop(g):
    g.cyl(0.014, 0.6, base=(0, 0, -0.06), segs=8, color=MINT)
    g.sphere(0.018, loc=(0, 0, -0.06), segs=8, rings=4, color="#6fbf9b")
    g.cyl(0.03, 0.05, base=(0, 0, 0.53), segs=10, bevel=0.01, seg=1, color=BLUE)
    for k in range(9):
        a = 2 * math.pi * k / 9
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((0, 0, 0.6)) + d * 0.02
        p1 = p0 + d * 0.07 + Vector((0, 0, 0.07))
        p2 = p1 + d * 0.035 + Vector((0, 0, -0.03))
        g.tube([p0, p1, p2], 0.017, segs=5, color=CREAM if k % 3 else "#f2e2c0")


@prop("spatula", "blunt", "upright", (0, 0, 1), (0, 0, 0.34))
def spatula(g):
    g.capsule(0.016, 0.13, loc=(0, 0, 0.02), segs=8, rings=5, color=RED)
    g.disc(0.007, loc=(0, -0.017, -0.04), normal=(0, -1, 0), segs=6, color=CREAM)
    g.cyl(0.007, 0.1, base=(0, 0, 0.1), segs=6, color=STEEL_DK)
    flat(g, [(-0.05, 0.2), (0.05, 0.2), (0.055, 0.34), (-0.055, 0.34)], 0.01, STEEL)
    for k in range(3):
        g.box((0.012, 0.0105, 0.08), loc=(-0.024 + k * 0.024, 0, 0.27), bevel=0, color=STEEL_DK, shade=(1, 1))


@prop("broom", "blunt", "upright", (0, 0, 1), (0, 0, 0.68))
def broom(g):
    g.cyl(0.015, 0.55, base=(0, 0, -0.06), segs=8, color=WOOD)
    g.sphere(0.018, loc=(0, 0, -0.06), segs=8, rings=4, color=RED)
    g.cyl(0.026, 0.05, base=(0, 0, 0.45), segs=8, r2=0.04, color=RED)
    flat(g, [(-0.04, 0.48), (0.04, 0.48), (0.11, 0.68), (-0.11, 0.68)], 0.04, "#f2c96a", bevel=0.01,
         shade=(0.85, 1.05))
    for z in (0.52, 0.56):
        w = 0.04 + (z - 0.48) / 0.2 * 0.07
        g.box((2 * w + 0.008, 0.044, 0.01), loc=(0, 0, z), bevel=0, color=RED, shade=(1, 1))


@prop("rolling_pin", "blunt", "upright", (0, 0, 1), (0, 0, 0.44))
def rolling_pin(g):
    g.capsule(0.02, 0.07, loc=(0, 0, 0.0), segs=8, rings=5, color=WOOD_DK)
    g.cyl(0.012, 0.03, base=(0, 0, 0.045), segs=6, color=WOOD_DK)
    g.cyl(0.046, 0.26, base=(0, 0, 0.07), segs=14, bevel=0.012, seg=1, color=WOOD, shade=(0.85, 1.05))
    g.cyl(0.0465, 0.02, base=(0, 0, 0.19), segs=14, caps=False, color=RED, shade=(1, 1))
    g.cyl(0.012, 0.03, base=(0, 0, 0.33), segs=6, color=WOOD_DK)
    g.capsule(0.02, 0.07, loc=(0, 0, 0.395), segs=8, rings=5, color=WOOD_DK)


@prop("thing", "blunt", "upright", (0, 0, 1), (0, 0, 0.2))
def thing(g):
    g.lathe([(0.0, -0.03), (0.06, -0.025), (0.085, 0.02), (0.09, 0.08), (0.075, 0.15), (0.05, 0.19), (0.0, 0.205)],
            segs=12, color="#ffffff", shade=(0.78, 1.0))
    g.sphere((0.05, 0.04, 0.04), loc=(0.05, -0.02, 0.1), segs=8, rings=5, color="#ffffff", shade=(0.85, 1.0))


# ---------------------------------------------------------------- soft


@prop("fish", "soft", "upright", (0, 0, 1), (0, 0, 0.4))
def fish(g):
    flat(g, [(-0.06, -0.075), (0.0, -0.01), (0.06, -0.075), (0.045, -0.03), (0.0, 0.02), (-0.045, -0.03)], 0.014,
         TANG, bevel=0.005)

    def belly(c, n, col):
        return (1.0, 0.95, 0.85) if c.x < -0.012 else col

    g.sphere((0.07, 0.035, 0.17), loc=(0, 0, 0.21), segs=12, rings=8, color=BLUE, fn=belly, shade=(0.85, 1.05))
    flat(g, [(0.05, 0.16), (0.1, 0.2), (0.09, 0.27), (0.055, 0.29)], 0.01, TANG)
    flat(g, [(-0.055, 0.2), (-0.085, 0.24), (-0.06, 0.27)], 0.01, TANG)
    for sy in (-1, 1):
        g.disc(0.022, loc=(0.008, sy * 0.032, 0.335), normal=(0, sy, 0), segs=10, color="#ffffff")
        g.disc(0.011, loc=(0.008, sy * 0.036, 0.338), normal=(0, sy, 0), segs=8, color=INK)
    g.sphere((0.03, 0.02, 0.012), loc=(-0.02, 0, 0.383), segs=8, rings=4, color="#e47a6e")
    for k in range(3):
        g.box((0.004, 0.072, 0.04), loc=(0.02, 0, 0.29 - k * 0.012), rot=(0, 25, 0), bevel=0, color="#3f6fa8",
              shade=(1, 1))


@prop("rubber_chicken", "soft", "upright", (0, 0, 1), (0, 0, 0.42))
def rubber_chicken(g):
    for sx in (-1, 1):
        g.cyl(0.012, 0.09, base=(sx * 0.022, 0, -0.02), segs=5, color=TANG)
        g.cyl(0.026, 0.012, base=(sx * 0.022, -0.008, -0.03), r2=0.01, segs=5, color=TANG)
    g.sphere((0.065, 0.058, 0.115), loc=(0, 0, 0.17), segs=10, rings=6, color="#ffe08a", shade=(0.85, 1.05))
    for sx in (-1, 1):
        g.sphere((0.016, 0.045, 0.06), loc=(sx * 0.063, 0.005, 0.18), rot=(0, sx * 18, 0), segs=6, rings=4,
                 color="#ffd56a")
    g.tube([(0, 0, 0.27), (0, -0.005, 0.32), (0, -0.02, 0.36)], 0.022, segs=6, color="#ffe08a")
    g.sphere(0.036, loc=(0, -0.025, 0.385), segs=8, rings=5, color="#ffe08a")
    g.cyl(0.014, 0.05, base=(0, -0.05, 0.38), rot=(90, 0, 0), r2=0.002, segs=6, color=TANG)
    for k in range(3):
        g.sphere(0.013, loc=(0, -0.03 + k * 0.016, 0.42 + (0.006 if k == 1 else 0)), segs=5, rings=3, color=RED)
    for sx in (-1, 1):  # X-eyes
        for a in (45, -45):
            g.box((0.004, 0.022, 0.004), loc=(sx * 0.034, -0.035, 0.392), rot=(a, 0, sx * 35), bevel=0, color=INK,
                  shade=(1, 1))


@prop("baguette", "soft", "upright", (0, 0, 1), (0, 0, 0.42))
def baguette(g):
    g.capsule(0.036, 0.44, loc=(0, 0, 0.17), rot=(0, 4, 0), segs=10, rings=7, color="#e9a64e", shade=(0.8, 1.05))
    for k in range(4):
        z = 0.08 + k * 0.09
        g.box((0.05, 0.012, 0.014), loc=(0.003, -0.034, z), rot=(0, -35, 0), bevel=0.004, seg=1, color="#f6d394",
              shade=(1, 1))


@prop("boxing_glove", "soft", "worn", (0, 0, 1), (0, 0, 0.23))
def boxing_glove(g):
    g.cyl(0.05, 0.075, base=(0, 0, -0.02), segs=12, bevel=0.012, seg=1, color=CREAM)
    g.cyl(0.0515, 0.018, base=(0, 0, 0.012), segs=12, caps=False, color=RED, shade=(1, 1))
    g.sphere((0.074, 0.07, 0.095), loc=(0, -0.006, 0.14), segs=12, rings=8, color=RED, shade=(0.8, 1.05))
    g.capsule(0.026, 0.04, loc=(-0.065, -0.02, 0.105), rot=(0, -25, 0), segs=8, rings=5, color=RED)
    for k in range(3):
        g.box((0.03, 0.006, 0.006), loc=(0, 0.052, 0.04 + k * 0.022), bevel=0, color=CREAM, shade=(1, 1))
    g.sphere((0.03, 0.01, 0.02), loc=(0.02, -0.07, 0.17), segs=6, rings=4, color="#ff9a8a")


@prop("balloon", "soft", "upright", (0, 0, 1), (0, 0, 0.59))
def balloon(g):
    pts = [(0, 0, -0.02), (0.012, 0, 0.06), (-0.01, 0, 0.14), (0.012, 0, 0.22), (-0.006, 0, 0.3), (0, 0, 0.34)]
    g.tube(pts, 0.004, segs=4, color=CREAM)
    g.cyl(0.014, 0.022, base=(0, 0, 0.335), r2=0.006, segs=8, color=RED)
    g.lathe([(0.0, 0.35), (0.04, 0.37), (0.1, 0.42), (0.118, 0.47), (0.11, 0.53), (0.08, 0.575), (0.0, 0.592)],
            segs=14, color=RED, shade=(0.8, 1.05))
    g.sphere((0.022, 0.01, 0.034), loc=(-0.05, -0.098, 0.51), rot=(0, 20, 0), segs=6, rings=4, color="#ffd0c8")


# ---------------------------------------------------------------- gadgets


@prop("leaf_blower", "gadget", "aim", (0, 0, 1), (0, -0.47, 0.05))
def leaf_blower(g):
    """Pistol grip under a long motor housing, an arched carry handle on top,
    a long tube and a flat flared nozzle, so it reads as a blower from the
    side and from above (no round cap on a stem)."""
    g.capsule(0.022, 0.07, loc=(0, 0, 0.0), segs=8, rings=5, color=INK)
    g.box((0.02, 0.03, 0.04), loc=(0, -0.03, 0.035), bevel=0.008, seg=1, color=YEL)
    # motor housing: longer than wide along the aim axis
    g.box((0.15, 0.25, 0.14), loc=(0, 0.04, 0.115), bevel=0.045, seg=2, color=TANG, shade=(0.8, 1.05))
    g.box((0.156, 0.05, 0.146), loc=(0, 0.1, 0.115), bevel=0.02, seg=1, color=CREAM)
    # air intakes on both flanks: dark grille, cream hub
    for sx in (-1, 1):
        g.disc(0.05, loc=(sx * 0.079, 0.02, 0.112), normal=(sx, 0, 0), segs=12, color=INK)
        g.disc(0.018, loc=(sx * 0.081, 0.02, 0.112), normal=(sx, 0, 0), segs=8, color=CREAM)
    # arched carry handle over the housing
    g.tube([(0, -0.06, 0.18), (0, -0.045, 0.245), (0, 0.04, 0.265), (0, 0.125, 0.245), (0, 0.14, 0.18)],
           0.014, segs=6, color=INK)
    # tube with tangerine ribs, then a flat flared nozzle
    g.cyl(0.036, 0.36, base=(0, -0.07, 0.1), rot=(97, 0, 0), r2=0.03, segs=10, color=CREAM, shade=(0.85, 1.05))
    for t in (0.12, 0.26):
        g.cyl(0.038 - t * 0.02, 0.018, base=(0, -0.07 - t * 0.99, 0.1 - t * 0.12), rot=(97, 0, 0), segs=10,
              caps=False, color=TANG, shade=(1, 1))
    g.box((0.1, 0.07, 0.034), loc=(0, -0.45, 0.055), rot=(-7, 0, 0), bevel=0.012, seg=1, color=YEL)


@prop("wand", "gadget", "upright", (0, 0, 1), (0, 0, 0.36))
def wand(g):
    g.cyl(0.016, 0.1, base=(0, 0, -0.05), r2=0.013, segs=8, color=INK)
    g.cyl(0.013, 0.24, base=(0, 0, 0.05), r2=0.008, segs=8, color=PURPLE)
    g.cyl(0.018, 0.012, base=(0, 0, 0.045), segs=8, color=BRASS)
    flat(g, star(0.07, 0.032, 0.0, 0.33), 0.022, YEL, bevel=0.006)
    for (x, z) in ((0.06, 0.25), (-0.065, 0.39), (0.075, 0.4)):
        g.sphere(0.01, loc=(x, 0, z), segs=6, rings=4, color="#fff2c2")


@prop("trumpet", "instrument", "aim", (0, 0, 1), (0, -0.26, 0.05))
def trumpet(g):
    pts = [(0, 0.14, 0.05), (0, 0.06, 0.05), (0, -0.12, 0.05)]
    g.tube(pts, 0.011, segs=8, color=BRASS)
    loop = [(0, 0.05, 0.05), (0, 0.08, 0.02), (0, 0.06, -0.02), (0, -0.02, -0.02), (0, -0.07, 0.0), (0, -0.06, 0.04)]
    g.tube(loop, 0.01, segs=8, color=BRASS)
    g.lathe([(0.011, 0.0), (0.016, 0.06), (0.03, 0.1), (0.06, 0.13), (0.064, 0.135), (0.05, 0.13)],
            base=(0, -0.12, 0.05), rot=(90, 0, 0), segs=12, color=BRASS, shade=(0.8, 1.05))
    g.cyl(0.016, 0.03, base=(0, 0.14, 0.05), rot=(-90, 0, 0), r2=0.008, segs=8, color=STEEL)
    for k in range(3):
        y = -0.01 + k * 0.025
        g.cyl(0.012, 0.075, base=(0, y, 0.0), segs=8, color="#e0b03a")
        g.cyl(0.015, 0.012, base=(0, y, 0.075), segs=8, color=CREAM)


@prop("laptop", "gadget", "front", (1, 0, 0), (0, 0.2, 0.2))
def laptop(g):
    g.box((0.3, 0.21, 0.02), loc=(0, 0.105, 0.0), bevel=0.008, seg=1, color=BLUE, shade=(0.85, 1.05))
    g.box((0.26, 0.11, 0.004), loc=(0, 0.13, 0.011), bevel=0, color="#3f6fa8", shade=(1, 1))
    g.box((0.09, 0.05, 0.004), loc=(0, 0.04, 0.011), bevel=0, color="#7fb4e8", shade=(1, 1))
    lid = Geo("tmp_lid")
    lid.box((0.3, 0.014, 0.2), loc=(0, 0.0, 0.1), bevel=0.008, seg=1, color=BLUE, shade=(0.85, 1.05))
    lid.box((0.26, 0.004, 0.165), loc=(0, -0.008, 0.103), bevel=0, color="#fff6e4", shade=(1, 1))
    lid.disc(0.03, loc=(0, -0.0105, 0.12), normal=(0, -1, 0), segs=10, color=YEL)
    for sx in (-1, 1):
        lid.disc(0.005, loc=(sx * 0.01, -0.011, 0.126), normal=(0, -1, 0), segs=5, color=INK)
    lid.box((0.025, 0.002, 0.004), loc=(0, -0.0112, 0.11), bevel=0, color=INK, shade=(1, 1))
    lid.disc(0.035, loc=(0.05, 0.0075, 0.12), normal=(0, 1, 0), segs=10, color=PINK)
    a = math.radians(-15)
    for i, (x, y, z) in enumerate(lid.V):
        y2, z2 = y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)
        lid.V[i] = (x, y2 + 0.205, z2 + 0.01)
    g.merge(lid)


@prop("phone", "gadget", "aim", (0, 0, 1), (0, 0, 0.12))
def phone(g):
    g.box((0.075, 0.016, 0.15), loc=(0, 0, 0.04), bevel=0.012, seg=2, color=BLUE, shade=(0.85, 1.05))
    g.box((0.062, 0.002, 0.12), loc=(0, -0.0085, 0.045), bevel=0, color="#fff6e4", shade=(1, 1))
    cols = [RED, YEL, GREEN, PURPLE, TANG, BLUE]
    for k in range(6):
        r, c = divmod(k, 3)
        g.box((0.014, 0.002, 0.014), loc=(-0.02 + c * 0.02, -0.0098, 0.08 - r * 0.024), bevel=0, color=cols[k],
              shade=(1, 1))
    g.cyl(0.006, 0.002, base=(0, -0.0098, -0.007), rot=(90, 0, 0), segs=8, color=INK)


@prop("megaphone", "gadget", "aim", (0, 0, 1), (0, -0.25, 0.1))
def megaphone(g):
    g.capsule(0.02, 0.06, loc=(0, 0, 0.0), segs=8, rings=5, color=INK)
    g.box((0.015, 0.02, 0.025), loc=(0, -0.022, 0.02), bevel=0.004, seg=1, color=RED)
    g.lathe([(0.0, -0.07), (0.03, -0.07), (0.035, -0.04), (0.06, 0.08), (0.105, 0.18), (0.112, 0.19), (0.1, 0.19),
             (0.0, 0.17)], base=(0, -0.0, 0.095), rot=(90, 0, 0), segs=14, color=CREAM, shade=(0.85, 1.05))
    g.lathe([(0.106, 0.165), (0.113, 0.19), (0.104, 0.19), (0.098, 0.168)], base=(0, 0.0, 0.095), rot=(90, 0, 0),
            segs=14, color=TANG)
    g.cyl(0.062, 0.02, base=(0, -0.08, 0.095), rot=(90, 0, 0), r2=0.067, segs=14, caps=False, color=TANG,
          shade=(1, 1))


@prop("guitar", "instrument", "upright", (0, 0, 1), (0, 0, 0.56))
def guitar(g):
    g.box((0.06, 0.025, 0.08), loc=(0, 0, -0.05), bevel=0.01, seg=1, color=INK)
    for sx in (-1, 1):
        for k in range(2):
            g.cyl(0.008, 0.02, base=(sx * 0.03, 0, -0.07 + k * 0.035), rot=(0, sx * 90, 0), segs=5, caps=False,
                  color=CREAM)
    g.box((0.036, 0.022, 0.25), loc=(0, 0, 0.115), bevel=0.006, seg=1, color=WOOD)
    for k in range(3):
        g.box((0.038, 0.0225, 0.004), loc=(0, 0, 0.03 + k * 0.07), bevel=0, color=BRASS, shade=(1, 1))
    for (r, z) in ((0.105, 0.32), (0.13, 0.47)):
        g.cyl(r, 0.05, base=(0, 0.025, z), rot=(90, 0, 0), segs=14, bevel=0.012, seg=1, color=RED, shade=(0.85, 1.05))
    g.disc(0.035, loc=(0, -0.0265, 0.37), normal=(0, -1, 0), segs=12, color=INK)
    flat(g, [(0.04, 0.3), (0.1, 0.36), (0.08, 0.42), (0.035, 0.4)], 0.004, CREAM, y=-0.026, bevel=0)
    g.box((0.07, 0.012, 0.016), loc=(0, -0.028, 0.5), bevel=0.003, seg=1, color=INK)
    for k in range(4):  # strings as single quads
        x = -0.012 + k * 0.008
        g.quad([(x - 0.001, -0.0135, 0.075), (x + 0.001, -0.0135, 0.075), (x + 0.001, -0.0285, 0.5),
                (x - 0.001, -0.0285, 0.5)], color="#fff6e4", shade=(1, 1), jit=0)


@prop("shield", "guard", "front", (0, 0, 1), (0, -0.09, 0.0))
def shield(g):
    g.stick((0, 0.035, -0.06), (0, 0.035, 0.06), 0.016, segs=8, color=WOOD_DK)
    for sz in (-0.06, 0.06):
        g.box((0.03, 0.04, 0.02), loc=(0, 0.018, sz), bevel=0.006, seg=1, color=WOOD_DK)
    g.lathe([(0.0, 0.0), (0.2, 0.0), (0.205, 0.012), (0.2, 0.03), (0.17, 0.045), (0.09, 0.06), (0.0, 0.065)],
            base=(0, 0.0, 0.0), rot=(90, 0, 0), segs=16, color=TANG, shade=(0.85, 1.05),
            fn=lambda c, n, col: (1.0, 0.94, 0.84) if 0.11 < math.hypot(c.x, c.z) < 0.17 else col)
    flat(g, star(0.08, 0.035, 0.0, -0.005), 0.012, YEL, y=-0.066, bevel=0)
    for k in range(8):
        a = 2 * math.pi * k / 8
        g.disc(0.012, loc=(math.cos(a) * 0.185, -0.022, math.sin(a) * 0.185), normal=(0, -1, 0.3), segs=6,
               color=BRASS)


# ---------------------------------------------------------------- build


def prop_tags():
    try:
        src = open(VOCAB_TS, encoding="utf-8").read()
        m = re.search(r"export const PROP_TAGS = \[(.*?)\]", src, re.S)
        return re.findall(r'"(\w+)"', m.group(1))
    except (OSError, AttributeError):
        print("vocab.ts not readable; building the built-in list")
        return list(PROPS)


def build():
    reset_scene()
    tags = prop_tags()
    missing = [t for t in tags if t not in PROPS]
    extra = [t for t in PROPS if t not in tags]
    if missing:
        raise SystemExit("no builder for PROP_TAGS: %s" % missing)
    if extra:
        print("builders not in PROP_TAGS (skipped):", extra)
    report = []
    for tag in tags:
        fn, kind, hold, grip_axis, tip = PROPS[tag]
        g = Geo("Prop_" + tag, seed=len(report) * 7, max_seg=2)
        fn(g)
        xs = [v[0] for v in g.V]
        ys = [v[1] for v in g.V]
        zs = [v[2] for v in g.V]
        length = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
        props = {"prop": tag, "kind": kind, "hold": hold, "grip_axis": three(grip_axis), "tip": three(tip),
                 "length": round(length, 3)}
        if tag == "thing":
            props["tint"] = "accent"
        ob = g.build(origin=(0, 0, 0), props=props)
        report.append((tag, g.tris(), round(length, 3)))
    for tag, t, ln in report:
        print("PROP %-15s tris=%4d length=%.3f%s" % (tag, t, ln, "  OVER BUDGET" if t >= 500 else ""))
    export_glb(os.path.join(OUT_DIR, "props.glb"))


build()
print("TRIS", count_tris())
