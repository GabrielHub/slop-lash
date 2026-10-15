"""Regression checks for authored primitive winding and bevel shading.

Run in Blender before exporting: negative-facing cabinet panels must have the
same outward winding as positive bounds, and large bevelled planes must stay
flat under lighting without changing their topology.
"""

import math
import os
import sys

import bmesh
import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geometry import Geo


def slab(bounds):
    geo = Geo("PanelProbe", seed=7)
    geo.slab(*bounds, bevel=0.04, seg=1, color="#aaaaaa")
    return geo


def verify():
    bounds = [-1.0, 1.0, -0.08, 0.0, -2.0, 2.0]
    reference = slab(bounds)
    for axis in range(3):
        reversed_bounds = bounds.copy()
        i = axis * 2
        reversed_bounds[i], reversed_bounds[i + 1] = reversed_bounds[i + 1], reversed_bounds[i]
        panel = slab(reversed_bounds)
        assert panel.V == reference.V and panel.F == reference.F, "reversed slab bounds changed winding"
        assert panel.L == reference.L, "reversed slab bounds changed paint"

    geo = Geo("NormalProbe", seed=1)
    geo.box((2, 2, 0.12), bevel=0.04, seg=1, color="#aaaaaa")
    obj = geo.build()
    mesh = obj.data
    try:
        bm = bmesh.new()
        bm.from_mesh(mesh)
        assert bm.calc_volume(signed=True) > 0, "box winding points inward"
        bm.free()
        assert sum(len(p.vertices) - 2 for p in mesh.polygons) == geo.tris(), "normals changed topology"
        top = max(mesh.polygons, key=lambda p: p.normal.z)
        deviation = max(math.degrees(mesh.corner_normals[i].vector.angle(top.normal)) for i in top.loop_indices)
        assert deviation < 3.0, "flat tile corner normal bent by %.2f degrees" % deviation
        assert mesh.has_custom_normals, "weighted normals were not baked"
        print("VERIFY GEOMETRY PASS: outward slab winding; planar bevel deviation %.2f degrees; unchanged triangles" % deviation)
    finally:
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)


if __name__ == "__main__":
    verify()
