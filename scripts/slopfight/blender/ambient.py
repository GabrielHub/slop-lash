"""Deterministic, local ambient shading baked into existing vertex colours.

This is an export-time operation: no texture, geometry or runtime pass is
added. Only permanent scenery can shadow the set. Held props are baked one at
a time because the library deliberately places every grip at the origin.
"""

from array import array
from contextlib import contextmanager
import math
import time

from mathutils import Vector
from mathutils.bvhtree import BVHTree


RAYS = 24
RADIUS = 0.45
STRENGTH = 0.18
VERSION = "local-v1"
GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))
HEMISPHERE = tuple(
    (math.sqrt(1.0 - (i + 0.5) / RAYS) * math.cos(i * GOLDEN_ANGLE),
     math.sqrt(1.0 - (i + 0.5) / RAYS) * math.sin(i * GOLDEN_ANGLE),
     math.sqrt((i + 0.5) / RAYS))
    for i in range(RAYS)
)


def eligible(obj):
    """Exclude invisible and movable geometry, including its descendants."""
    if obj.type != "MESH" or "Color" not in obj.data.color_attributes:
        return False
    node = obj
    while node is not None:
        name = node.name
        if (node.get("collision") or node.get("emissive") or node.get("backdrop")
                or node.get("hidden_until") or node.get("crowd") or node.get("floater")
                or node.get("spin") or node.get("drip") or node.get("pop_height") is not None
                or node.get("sf_ao") is False
                or name == "Collision" or name.endswith("_Emissive")
                or name.startswith(("Crowd_", "Floater_", "Hazard_Water", "Hazard_Wind_",
                                    "Hazard_Toaster_Toast_", "Clock_Hand_", "Podium"))):
            return False
        node = node.parent
    return not any(material and material.name.endswith(("Emissive", "Collision"))
                   for material in obj.data.materials)


def geometry_tree(objects):
    vertices, faces = [], []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        offset = len(vertices)
        vertices.extend(obj.matrix_world @ vertex.co for vertex in mesh.vertices)
        faces.extend(tuple(offset + index for index in triangle.vertices) for triangle in mesh.loop_triangles)
    return BVHTree.FromPolygons(vertices, faces, all_triangles=True) if faces else None


def visibility(tree, point, normal, radius):
    """Cosine-weighted visibility with a soft distance cutoff.

    Geometric normals and an outward offset keep rays outside their own face.
    Exiting hits are ignored: merged kit pieces can overlap, and their hidden
    backs must not paint black seams onto the exposed surface.
    """
    if tree is None:
        return 1.0
    epsilon = max(0.0002, radius * 0.008)
    axis = Vector((0, 0, 1)) if abs(normal.z) < 0.9 else Vector((1, 0, 0))
    tangent = normal.cross(axis).normalized()
    bitangent = normal.cross(tangent)
    origin = point + normal * epsilon
    blocked = 0.0
    for x, y, z in HEMISPHERE:
        direction = tangent * x + bitangent * y + normal * z
        start, travelled = origin, 0.0
        # A bounded retry skips a coincident/back-facing shell without letting
        # arbitrarily complex geometry turn the bake into an unbounded walk.
        for _ in range(3):
            hit, hit_normal, _, distance = tree.ray_cast(start, direction, radius - travelled)
            if hit is None:
                break
            travelled += distance
            if distance > epsilon * 0.5 and hit_normal.dot(direction) < -0.001:
                blocked += (1.0 - travelled / radius) ** 2
                break
            travelled += epsilon * 2
            if travelled >= radius:
                break
            start = hit + direction * (epsilon * 2)
    return 1.0 - STRENGTH * blocked / RAYS


def shade_object(obj, tree, radius):
    mesh = obj.data
    colours = mesh.color_attributes["Color"]
    original = array("f", [0.0]) * (len(colours.data) * 4)
    colours.data.foreach_get("color_srgb", original)
    baked = array("f", original)
    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    cache, factors, smooth = {}, [], {}
    corners = []
    for face in mesh.polygons:
        points = [obj.matrix_world @ mesh.vertices[index].co for index in face.vertices]
        # A large wall has no nearby vertices to localise a corner shadow.
        # Leave it authored rather than stretching that shadow over the wall.
        if any((a - b).length > 4.0 for a, b in zip(points, points[1:] + points[:1])):
            corners.extend((loop, mesh.loops[loop].vertex_index, False, None) for loop in face.loop_indices)
            continue
        normal = (normal_matrix @ face.normal).normalized()
        for loop, point in zip(face.loop_indices, points):
            key = tuple(round(value, 5) for value in (*point, *normal))
            factor = cache.get(key)
            if factor is None:
                factor = visibility(tree, point, normal, radius)
                cache[key] = factor
            factors.append(factor)
            vertex = mesh.loops[loop].vertex_index
            corners.append((loop, vertex, face.use_smooth, factor))
            if face.use_smooth:
                total, count = smooth.get(vertex, (0.0, 0))
                smooth[vertex] = (total + factor, count + 1)
    # Smooth primitives share one AO value at each vertex. Otherwise different
    # geometric normals would introduce colour seams and extra glTF vertices
    # along every sphere/bevel triangle even though their shading is smooth.
    shared, final_corners = {}, []
    for loop, vertex, use_smooth, factor in corners:
        if use_smooth:
            total, count = smooth[vertex]
            factor = total / count
        # Separate kit primitives can meet at identical exported vertices.
        # Keep those vertices identical after colouring too, so the exporter
        # does not split them (or reveal a seam) just because their source
        # vertex indices differ.
        key = (*mesh.vertices[vertex].co, *mesh.corner_normals[loop].vector,
               *original[loop * 4:loop * 4 + 4])
        total, count, skipped = shared.get(key, (0.0, 0, False))
        shared[key] = (total + (factor if factor is not None else 1.0), count + 1, skipped or factor is None)
        final_corners.append((loop, key))
    for loop, key in final_corners:
        total, count, skipped = shared[key]
        factor = 1.0 if skipped else total / count
        for channel in range(3):
            baked[loop * 4 + channel] *= factor
    colours.data.foreach_set("color_srgb", baked)
    return original, {
        "name": obj.name, "samples": len(cache),
        "minimum": round(min(factors, default=1.0), 5),
        "mean": round(sum(factors) / len(factors), 5) if factors else 1.0,
    }


@contextmanager
def baked_ambient(objects, enabled=True):
    """Temporarily shade export colours; repeat exports never accumulate AO."""
    started = time.perf_counter()
    objects = sorted((obj for obj in objects if eligible(obj)), key=lambda obj: obj.name)
    scenery = [obj for obj in objects if not obj.name.startswith("Prop_")]
    tree = geometry_tree(scenery) if enabled else None
    saved, rows = [], []
    try:
        if enabled:
            for obj in objects:
                isolated = obj.name.startswith("Prop_")
                radius = min(RADIUS, max(obj.dimensions) * 0.22) if isolated else RADIUS
                colours, row = shade_object(obj, geometry_tree([obj]) if isolated else tree, radius)
                previous = {key: obj.get(key) for key in ("sf_ao_bake", "sf_ao_radius")}
                saved.append((obj, colours, previous))
                obj["sf_ao_bake"] = VERSION
                obj["sf_ao_radius"] = radius
                rows.append(row)
        yield {"version": VERSION, "rays": RAYS, "radius": RADIUS, "strength": STRENGTH,
               "seconds": round(time.perf_counter() - started, 3), "objects": rows}
    finally:
        for obj, colours, previous in saved:
            obj.data.color_attributes["Color"].data.foreach_set("color_srgb", colours)
            for key, value in previous.items():
                if value is None:
                    del obj[key]
                else:
                    obj[key] = value
