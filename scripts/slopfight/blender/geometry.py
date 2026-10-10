"""Deterministic vertex-painted primitives, materials and object placement.

This is the mesh-building kernel used by common.py's authored scene helpers.
"""

import math
import random
import zlib

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

def hexc(h):
    """'#rrggbb' -> sRGB tuple in 0..1."""
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def to_hex(c):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(x * 255))) for x in c[:3])


def shade(c, k):
    return tuple(max(0.0, min(1.0, x * k)) for x in c[:3])


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def C(c):
    """Accept a hex string or a tuple."""
    return hexc(c) if isinstance(c, str) else tuple(c[:3])


def rot_of(rot):
    """None | (rx, ry, rz) degrees | Euler | Quaternion | Matrix -> Quaternion."""
    if rot is None:
        return Quaternion()
    if isinstance(rot, Quaternion):
        return rot
    if isinstance(rot, Matrix):
        return rot.to_quaternion()
    if isinstance(rot, Euler):
        return rot.to_quaternion()
    return Euler([math.radians(a) for a in rot], "XYZ").to_quaternion()


def mat(loc=(0, 0, 0), rot=None, scale=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(loc), rot_of(rot), Vector(scale))


class Geo:
    """Accumulates bevelled, vertex-painted primitives into one mesh node.

    Every primitive takes ``color`` plus paint options:
      shade=(bottom, top)  multiplier gradient over the primitive's height
      ao=0.8               multiplier on down-facing faces (crease darkening)
      zr=(z0, z1)          use this world z range for the gradient instead
      fn=f(center, normal, color) -> color   per-face colour override
      flat=False           flat-shade this primitive
      jit=0.03             per-primitive brightness jitter (hand-painted feel)
    """

    def __init__(self, name, seed=None, lod=1.0, max_seg=None):
        self.name = name
        self.lod = lod  # multiplies radial segment counts (cheap set dressing < 1)
        self.max_seg = max_seg  # caps bevel segments
        self.V = []
        self.F = []
        self.L = []  # per-face list of loop colours
        self.S = []  # per-face smooth flag
        # crc32, not hash(): str hashes are salted per process, which made every
        # rebuild paint slightly different colours (and a new binary diff)
        self.rng = random.Random(seed if seed is not None else zlib.crc32(name.encode("utf-8")) & 0xFFFF)

    # -------------------------------------------------- core

    def tris(self):
        return sum(len(f) - 2 for f in self.F)

    def ingest(self, bm, m, color, shade=(0.82, 1.04), ao=0.8, zr=None, fn=None,
               flat=False, jit=0.03, noise=0.012):
        bm.transform(m)
        bm.normal_update()
        col = C(color)
        if jit:
            col = shade_c(col, 1.0 + self.rng.uniform(-jit, jit))
        if zr is None:
            zs = [v.co.z for v in bm.verts]
            z0, z1 = (min(zs), max(zs)) if zs else (0, 1)
        else:
            z0, z1 = zr
        span = max(z1 - z0, 1e-6)
        bm.verts.index_update()
        base = len(self.V)
        vnoise = {}
        for v in bm.verts:
            self.V.append(tuple(v.co))
        # noise drawn in position order, not bmesh order (see order() below)
        for v in sorted(bm.verts, key=lambda v: (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4), v.index)):
            vnoise[v.index] = 1.0 + self.rng.uniform(-noise, noise)
        # bmesh ops (bevel, uvsphere) key some internal hashes on pointers, so
        # their faces come out in a different order from run to run; sorting by
        # position keeps the exported index buffers byte-identical
        def order(f):
            c = f.calc_center_median()
            return (round(c.x, 4), round(c.y, 4), round(c.z, 4),
                    tuple(round(x, 4) for v in f.verts for x in v.co))

        for f in sorted(bm.faces, key=order):
            fc = C(fn(f.calc_center_median(), f.normal, col)) if fn else col
            k_face = ao if f.normal.z < -0.55 else 1.0
            loops = []
            for lp in f.loops:
                t = min(1.0, max(0.0, (lp.vert.co.z - z0) / span))
                k = (shade[0] + (shade[1] - shade[0]) * t) * k_face * vnoise[lp.vert.index]
                loops.append(shade_c(fc, k))
            self.F.append(tuple(base + v.index for v in f.verts))
            self.L.append(loops)
            self.S.append(not flat)
        bm.free()
        return self

    # -------------------------------------------------- primitives

    def _s(self, segs, lo=6):
        return max(lo, int(round(segs * self.lod)))

    def _b(self, seg):
        return min(seg, self.max_seg) if self.max_seg else seg

    def box(self, size, loc=(0, 0, 0), rot=None, bevel=0.06, seg=2, color="#ff00ff", top_only=False, skip=(),
            **kw):
        """Box centred on loc. ``top_only`` bevels just the edges round the
        local +Z face: half the triangles, for boxes whose underside nobody
        sees (planks, pavers, stacked bands). ``skip`` drops whole faces of an
        unbevelled box by local direction ('-z', '+y', ...), for cut-outs only
        ever seen from the front."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if skip:
            bm.normal_update()
            axes = {"x": 0, "y": 1, "z": 2}
            gone = [f for f in bm.faces
                    if any(f.normal[axes[d[1]]] * (1 if d[0] == "+" else -1) > 0.9 for d in skip)]
            bmesh.ops.delete(bm, geom=gone, context="FACES_ONLY")
            bevel = 0.0
        if bevel > 0:
            b = min(bevel, min(size) * 0.49)
            edges = list(bm.edges)
            if top_only:
                bm.normal_update()
                top = max(bm.faces, key=lambda f: f.normal.z)
                edges = list(top.edges)
            bmesh.ops.bevel(bm, geom=edges, offset=b, segments=self._b(seg), profile=0.5,
                            affect="EDGES", clamp_overlap=True)
        return self.ingest(bm, mat(loc, rot), color, **kw)

    def slab(self, x0, x1, y0, y1, z0, z1, bevel=0.06, seg=2, color="#ff00ff", **kw):
        """Axis-aligned box from bounds."""
        return self.box((x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                        bevel=bevel, seg=seg, color=color, **kw)

    def cyl(self, r, h, base=(0, 0, 0), rot=None, segs=16, r2=None, bevel=0.0, seg=2,
            caps=True, color="#ff00ff", **kw):
        """Cylinder or cone from its base centre along local +Z."""
        bm = bmesh.new()
        segs = self._s(segs, 5)
        bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r,
                              radius2=r if r2 is None else r2, depth=h,
                              matrix=Matrix.Translation((0, 0, h / 2)))
        if bevel > 0 and caps:
            bm.normal_update()
            edges = [e for e in bm.edges if len(e.link_faces) == 2
                     and e.link_faces[0].normal.angle(e.link_faces[1].normal, 0) > 0.8]
            b = min(bevel, min(r, r if r2 is None else max(r2, 1e-3), h) * 0.45)
            bmesh.ops.bevel(bm, geom=edges, offset=b, segments=self._b(seg), profile=0.5,
                            affect="EDGES", clamp_overlap=True)
        return self.ingest(bm, mat(base, rot), color, **kw)

    def sphere(self, r, loc=(0, 0, 0), rot=None, segs=12, rings=8, color="#ff00ff", **kw):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=self._s(segs, 5), v_segments=self._s(rings, 3), radius=1.0)
        rr = (r, r, r) if isinstance(r, (int, float)) else r
        bmesh.ops.scale(bm, vec=Vector(rr), verts=bm.verts)
        return self.ingest(bm, mat(loc, rot), color, **kw)

    def capsule(self, r, length, loc=(0, 0, 0), rot=None, segs=10, rings=7, color="#ff00ff", **kw):
        """Capsule centred on loc along local Z; length is the straight part."""
        bm = bmesh.new()
        rings = rings if rings % 2 == 1 else rings + 1
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
        for v in bm.verts:
            if v.co.z > 1e-5:
                v.co.z += length / 2
            elif v.co.z < -1e-5:
                v.co.z -= length / 2
        return self.ingest(bm, mat(loc, rot), color, **kw)

    def stick(self, p0, p1, r, segs=8, color="#ff00ff", capsule=False, rings=5, **kw):
        """Cylinder (or capsule) between two points."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        q = d.to_track_quat("Z", "Y")
        if capsule:
            return self.capsule(r, d.length, loc=(p0 + p1) / 2, rot=q, segs=segs, rings=rings,
                                color=color, **kw)
        return self.cyl(r, d.length, base=p0, rot=q, segs=segs, color=color, **kw)

    def lathe(self, profile, base=(0, 0, 0), rot=None, segs=16, color="#ff00ff", **kw):
        """Surface of revolution around local Z. profile: [(radius, z), ...]
        bottom to top; a radius of 0 at an end closes it with a pole."""
        bm = bmesh.new()
        segs = self._s(segs, 6)
        rings = []
        for r, z in profile:
            if r <= 1e-6:
                rings.append([bm.verts.new((0, 0, z))])
            else:
                rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs),
                                            r * math.sin(2 * math.pi * i / segs), z))
                              for i in range(segs)])
        for a, b in zip(rings, rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            for i in range(segs):
                j = (i + 1) % segs
                if len(a) == 1:
                    bm.faces.new((a[0], b[j], b[i]))
                elif len(b) == 1:
                    bm.faces.new((a[i], a[j], b[0]))
                else:
                    bm.faces.new((a[i], a[j], b[j], b[i]))
        if len(rings[0]) > 1:
            bm.faces.new(list(reversed(rings[0])))
        if len(rings[-1]) > 1:
            bm.faces.new(rings[-1])
        bm.normal_update()
        return self.ingest(bm, mat(base, rot), color, **kw)

    def prism(self, pts, depth, loc=(0, 0, 0), rot=None, bevel=0.0, seg=1, color="#ff00ff", **kw):
        """Extrude a 2D polygon (x, z pairs, counter-clockwise seen from -Y)
        along +Y by depth. Good for cut-outs, signs, letters."""
        bm = bmesh.new()
        front = [bm.verts.new((x, 0.0, z)) for x, z in pts]
        back = [bm.verts.new((x, depth, z)) for x, z in pts]
        n = len(pts)
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((front[j], front[i], back[i], back[j]))
        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=seg, profile=0.5,
                            affect="EDGES", clamp_overlap=True)
        return self.ingest(bm, mat(loc, rot), color, **kw)

    def grid(self, sx, sy, nx, ny, loc=(0, 0, 0), rot=None, color="#ff00ff", zfn=None, **kw):
        """Flat (or height-displaced) grid in local XY, facing +Z."""
        bm = bmesh.new()
        vs = []
        for j in range(ny + 1):
            row = []
            for i in range(nx + 1):
                x = -sx / 2 + sx * i / nx
                y = -sy / 2 + sy * j / ny
                z = zfn(x, y) if zfn else 0.0
                row.append(bm.verts.new((x, y, z)))
            vs.append(row)
        for j in range(ny):
            for i in range(nx):
                bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
        bm.normal_update()
        return self.ingest(bm, mat(loc, rot), color, **kw)

    def quad(self, corners, color="#ff00ff", **kw):
        """Single polygon from world-space corners (counter-clockwise = front)."""
        bm = bmesh.new()
        bm.faces.new([bm.verts.new(c) for c in corners])
        bm.normal_update()
        return self.ingest(bm, Matrix(), color, **kw)

    def disc(self, r, loc=(0, 0, 0), normal=(0, -1, 0), segs=12, color="#ff00ff", **kw):
        """Flat disc facing ``normal`` (decal eyes, clock faces, dots)."""
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=segs, radius=r)
        q = Vector(normal).to_track_quat("Z", "Y")
        return self.ingest(bm, mat(loc, q), color, flat=True, **kw)

    def torus(self, R, r, loc=(0, 0, 0), rot=None, segs=16, rsegs=8, color="#ff00ff", **kw):
        bm = bmesh.new()
        segs, rsegs = self._s(segs, 8), self._s(rsegs, 4)
        rings = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ca, sa = math.cos(a), math.sin(a)
            ring = []
            for k in range(rsegs):
                b = 2 * math.pi * k / rsegs
                rr = R + r * math.cos(b)
                ring.append(bm.verts.new((rr * ca, rr * sa, r * math.sin(b))))
            rings.append(ring)
        for i in range(segs):
            a, b = rings[i], rings[(i + 1) % segs]
            for k in range(rsegs):
                kk = (k + 1) % rsegs
                bm.faces.new((a[k], b[k], b[kk], a[kk]))
        bm.normal_update()
        return self.ingest(bm, mat(loc, rot), color, **kw)

    def tube(self, pts, r, segs=6, color="#ff00ff", closed=False, caps=True, **kw):
        """Sweep a circle along a polyline (cables, neon tubes, lines)."""
        pts = [Vector(p) for p in pts]
        bm = bmesh.new()
        rings = []
        prev_n = None
        for i, p in enumerate(pts):
            if closed:
                t = (pts[(i + 1) % len(pts)] - pts[i - 1]).normalized()
            elif i == 0:
                t = (pts[1] - pts[0]).normalized()
            elif i == len(pts) - 1:
                t = (pts[-1] - pts[-2]).normalized()
            else:
                t = ((pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()).normalized()
            if prev_n is None:
                a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                n = t.cross(a).normalized()
            else:
                n = (prev_n - t * prev_n.dot(t)).normalized()
            prev_n = n
            b = t.cross(n)
            rings.append([bm.verts.new(p + (n * math.cos(2 * math.pi * k / segs)
                                            + b * math.sin(2 * math.pi * k / segs)) * r)
                          for k in range(segs)])
        count = len(rings) if closed else len(rings) - 1
        for i in range(count):
            a, c = rings[i], rings[(i + 1) % len(rings)]
            for k in range(segs):
                kk = (k + 1) % segs
                bm.faces.new((a[k], a[kk], c[kk], c[k]))
        if caps and not closed:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self.ingest(bm, Matrix(), color, **kw)

    def merge(self, other):
        base = len(self.V)
        self.V.extend(other.V)
        self.F.extend(tuple(base + i for i in f) for f in other.F)
        self.L.extend(other.L)
        self.S.extend(other.S)
        return self

    # -------------------------------------------------- output

    def build(self, origin=(0, 0, 0), parent=None, material="SF_Vertex", props=None,
              smooth_angle=50.0, rot=None):
        """Create the object. ``origin`` is where the node's pivot goes (the
        geometry stays where it was built in world space)."""
        ox, oy, oz = origin
        me = bpy.data.meshes.new(self.name)
        q = rot_of(rot)
        inv = q.inverted().to_matrix()
        verts = []
        for x, y, z in self.V:
            v = inv @ Vector((x - ox, y - oy, z - oz))
            verts.append(tuple(v))
        me.from_pydata(verts, [], self.F)
        attr = me.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
        flat = []
        for loops in self.L:
            for c in loops:
                flat.extend((c[0], c[1], c[2], 1.0))
        attr.data.foreach_set("color_srgb", flat)
        me.color_attributes.active_color = attr
        me.color_attributes.render_color_index = 0
        me.polygons.foreach_set("use_smooth", self.S)
        if smooth_angle:
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(get_material(material))
        place(ob, mat(origin, q), parent)
        for k, v in (props or {}).items():
            ob[k] = v
        return ob


def shade_c(c, k):
    return (max(0.0, min(1.0, c[0] * k)), max(0.0, min(1.0, c[1] * k)), max(0.0, min(1.0, c[2] * k)))


def place(ob, world, parent=None):
    """Parent ``ob`` (optionally) and give it the world matrix ``world``."""
    if parent is not None:
        bpy.context.view_layer.update()
        ob.parent = parent
        ob.matrix_parent_inverse = Matrix()
        ob.matrix_basis = parent.matrix_world.inverted() @ world
    else:
        ob.matrix_basis = world
    return ob


_MATS = {}


def get_material(name):
    """Plain materials that read the 'Color' attribute so glTF carries COLOR_0.
    three.js swaps them for the toon material; the names only hint intent."""
    if name in _MATS and _MATS[name].name in bpy.data.materials:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Color"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    if name.endswith("Emissive"):
        nt.links.new(attr.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 3.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    _MATS[name] = m
    return m
