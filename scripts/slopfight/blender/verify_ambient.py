"""Blender regression checks for local baked shading and exclusion boundaries."""

from array import array
import os
import sys

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ambient import RADIUS, STRENGTH, baked_ambient, eligible, geometry_tree, visibility
from geometry import Geo


def colours(obj):
    values = array("f", [0.0]) * (len(obj.data.loops) * 4)
    obj.data.color_attributes["Color"].data.foreach_get("color_srgb", values)
    return values


def verify():
    created = []

    def box(name, size, location, **props):
        geo = Geo(name, seed=1)
        geo.box(size, loc=location, bevel=0, color="#aaaaaa", flat=True, jit=0, noise=0, shade=(1, 1))
        obj = geo.build(props=props)
        created.append(obj)
        return obj

    try:
        floor = box("AO_Floor", (2, 2, 0.1), (0, 0, -0.05))
        wall = box("AO_Wall", (0.1, 2, 1), (0.15, 0, 0.5))
        bpy.context.view_layer.update()
        clear = visibility(geometry_tree([floor]), Vector((0, 0, 0)), Vector((0, 0, 1)), RADIUS)
        near = visibility(geometry_tree([floor, wall]), Vector((0, 0, 0)), Vector((0, 0, 1)), RADIUS)
        far = visibility(geometry_tree([wall]), Vector((-2, 0, 0)), Vector((0, 0, 1)), RADIUS)
        assert clear == 1.0, "a convex plane occluded itself"
        assert 1 - STRENGTH <= near < 0.995, "a nearby corner did not receive bounded local shading"
        assert far == 1.0, "ambient shading exceeded its local radius"

        # A back-facing plane from an overlapping shell must not create a seam.
        geo = Geo("AO_Backface", seed=1)
        geo.quad([(-1, -1, 0.01), (1, -1, 0.01), (1, 1, 0.01), (-1, 1, 0.01)], color="#aaaaaa")
        backface = geo.build()
        created.append(backface)
        assert visibility(geometry_tree([backface]), Vector((0, 0, 0)), Vector((0, 0, 1)), RADIUS) == 1.0

        for name, props in [("Collision", {}), ("Lamp_Emissive", {}), ("Crowd_01", {}),
                            ("Floater_1", {}), ("Hazard_Wind_Laundry_1", {}),
                            ("Hazard_Toaster_Toast_1", {}), ("Clock_Hand_Minute", {}),
                            ("Hazard_Water", {}), ("AC_1_Fan", {"spin": True}),
                            ("Backdrop", {"backdrop": True}), ("Podium", {"hidden_until": "FINAL"})]:
            obj = box(name, (0.1, 0.1, 0.1), (0, 0, 0.05), **props)
            assert not eligible(obj), "dynamic/invisible occluder accepted: " + name

        before = colours(floor)
        topology = (len(floor.data.vertices), len(floor.data.polygons), len(floor.data.loops))
        with baked_ambient([floor, wall]) as report:
            first = colours(floor)
            assert report["objects"] and floor.get("sf_ao_bake"), "bake provenance missing"
        assert colours(floor) == before, "export left accumulated ambient shading in source colours"
        with baked_ambient([floor, wall]):
            assert colours(floor) == first, "repeat shading changed colours"
        assert topology == (len(floor.data.vertices), len(floor.data.polygons), len(floor.data.loops))

        prop = box("Prop_AO_Probe", (0.1, 0.1, 0.1), (0, 0, 0.05))
        other_prop = box("Prop_AO_Other", (0.2, 0.2, 0.2), (0, 0, 0.1))
        bpy.context.view_layer.update()
        with baked_ambient([prop]):
            isolated = colours(prop)
        with baked_ambient([prop, other_prop]):
            assert colours(prop) == isolated, "overlapping library props shadowed one another"
        geo = Geo("AO_Large_Panel", seed=1)
        geo.box((6, 0.5, 0.1), bevel=0.04, color="#aaaaaa", jit=0, noise=0, shade=(1, 1))
        panel = geo.build()
        created.append(panel)
        original = colours(panel)
        keys = [(*panel.data.vertices[loop.vertex_index].co, *panel.data.corner_normals[loop.index].vector,
                 *original[loop.index * 4:loop.index * 4 + 4]) for loop in panel.data.loops]
        with baked_ambient([panel, wall]):
            painted = colours(panel)
            shared = {}
            for index, key in enumerate(keys):
                colour = tuple(painted[index * 4:index * 4 + 4])
                assert key not in shared or shared[key] == colour, "AO split an otherwise shared glTF vertex"
                shared[key] = colour
        print("VERIFY AMBIENT PASS: local corner %.4f, no self/backface seams, exclusions, isolated props, repeat export, unchanged topology" % near)
    finally:
        for obj in created:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.meshes.remove(mesh)


if __name__ == "__main__":
    verify()
