"""Bake a small, stable diffuse environment from an authored arena.

This is a coarse single-bounce approximation, not a path-traced lightmap.
Static geometry, paint, emissive windows and practicals contribute to nine
RGB spherical-harmonic coefficients. Moving spectators/fabric never occlude
the bake. The runtime uses one LightProbe: no textures or additional passes.
"""

import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from ambient import eligible
from geometry import C

SAMPLES = 1024


def linear(hex_color):
    return Vector(tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in C(hex_color)))


def basis(direction):
    # Blender Z-up to glTF/three Y-up. Coefficients are world-space data;
    # the glTF exporter does not transform custom properties.
    x, y, z = direction.x, direction.z, -direction.y
    return (0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x,
            1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1),
            1.092548 * x * z, 0.546274 * (x * x - y * y))


def bake_probe(*, label, sky, ground, origins, practical_scale, sun=None):
    bpy.context.view_layer.update()
    vertices, faces, paints, emissions = [], [], [], []
    for obj in sorted(bpy.context.scene.objects, key=lambda obj: obj.name):
        if obj.type != "MESH" or not (eligible(obj) or obj.get("emissive")):
            continue
        mesh = obj.data
        colors = mesh.color_attributes.get("Color")
        if colors is None:
            continue
        mesh.calc_loop_triangles()
        offset = len(vertices)
        vertices.extend(obj.matrix_world @ v.co for v in mesh.vertices)
        for triangle in mesh.loop_triangles:
            faces.append(tuple(offset + index for index in triangle.vertices))
            paint = sum((Vector(colors.data[i].color[:3]) for i in triangle.loops), Vector()) / 3
            paints.append(paint)
            emissions.append(obj.get("emissive_strength", 2.5) if obj.get("emissive") else 0.0)
    tree = BVHTree.FromPolygons(vertices, faces, all_triangles=True)
    sky, ground = linear(sky[0]) * sky[1], linear(ground[0]) * ground[1]
    sunlight = [] if sun is None else [(linear(sun[0]) * sun[1], Vector(sun[2]).normalized())]
    practicals = [obj for obj in bpy.context.scene.objects if obj.get("light_kind") in ("point", "spot")
                  and "directional" not in obj.get("note", "") and not obj.get("light_phases")]

    def environment(direction):
        return ground.lerp(sky, max(0.0, min(1.0, direction.z * 0.5 + 0.5)))

    def visible(point, normal, direction, distance):
        return tree.ray_cast(point + normal * 0.015, direction, distance)[0] is None

    def sample(origin, direction):
        point, normal, index, _ = tree.ray_cast(origin, direction, 55)
        if point is None:
            return environment(direction)
        if emissions[index]:
            return paints[index] * emissions[index]
        # An inward-facing hit should not light the visible side of its wall.
        if normal.dot(direction) > 0:
            normal = -normal
        incoming = environment(normal)
        for source, toward in sunlight:
            cosine = max(0.0, normal.dot(toward))
            if cosine and visible(point, normal, toward, 55):
                incoming += source * (cosine / math.pi)
        for light in practicals:
            toward = light.matrix_world.translation - point
            distance = toward.length
            if distance < 0.01 or distance > light.get("light_distance", 15):
                continue
            toward /= distance
            cone = 1.0
            if light.get("light_kind") == "spot":
                # Marker targets are stored in glTF coordinates by light_empty.
                tx, ty, tz = light["light_target"]
                axis = (Vector((tx, -tz, ty)) - light.matrix_world.translation).normalized()
                angle = min(math.pi / 2.2, math.radians(light.get("light_angle", 50)) / 2 + 0.05)
                outer, inner = math.cos(angle), math.cos(angle * 0.35)
                u = max(0.0, min(1.0, (axis.dot(-toward) - outer) / (inner - outer)))
                cone = u * u * (3 - 2 * u)
            cosine = max(0.0, normal.dot(toward))
            if cosine and cone and visible(point, normal, toward, max(0.01, distance - 0.03)):
                power = light.get("light_intensity", 1) * practical_scale / max(1, distance * distance)
                cutoff = max(0.0, 1 - (distance / light.get("light_distance", 15)) ** 4) ** 2
                incoming += linear(light.get("light_color", "#ffffff")) * (cosine * cone * cutoff * power / math.pi)
        return Vector(tuple(paints[index][c] * incoming[c] for c in range(3)))

    # Average the ring and surrounding work areas into a global diffuse field.
    origins = tuple(Vector(origin) for origin in origins)
    coefficients = [Vector() for _ in range(9)]
    for i in range(SAMPLES):
        z = 1 - 2 * (i + 0.5) / SAMPLES
        phi = i * math.pi * (3 - math.sqrt(5))
        radius = math.sqrt(1 - z * z)
        direction = Vector((radius * math.cos(phi), radius * math.sin(phi), z))
        radiance = sum((sample(origin, direction) for origin in origins), Vector()) / len(origins)
        for coefficient, weight in zip(coefficients, basis(direction)):
            coefficient += radiance * (weight * 4 * math.pi / SAMPLES)
    probe = bpy.data.objects.new("Probe_Ambient", None)
    bpy.context.collection.objects.link(probe)
    probe.location = origins[0]
    probe["sf_probe_sh"] = [round(value, 8) for coefficient in coefficients for value in coefficient]
    probe["sf_probe_bake"] = label
    probe["sf_probe_samples"] = SAMPLES * len(origins)
    return probe


def bake_rooftop_probe():
    return bake_probe(label="rooftop-ring-bounce-v2", sky=("#929fdc", 0.1), ground=("#b77d54", 0.035),
                      origins=((0, 0, 1.4), (0, 7, 2.4), (-6, 2, 2.0)), practical_scale=2,
                      sun=("#c9c4ff", 0.09, (-30, 60, 34)))
