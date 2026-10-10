"use client";

import { memo, useMemo } from "react";
import { resolveChampionSkeleton, tipRadius, type Bone, type Vec3 } from "../../body/skeleton";
import type { Champion } from "../../sheet";
import { TOY_COLOR_VALUES } from "../../vocab";

// The palette silhouette: the champion's resolved rest skeleton drawn flat in
// a three-quarter view, bones as capsules, spheres and cones in its toy
// colours under one chunky outline, with its eyes. Pure SVG, no three.js.

/** Screen right and toward-camera axes for a front-right three-quarter view. */
const RIGHT: Vec3 = [0.8, 0, 0.6];
const TOWARD: Vec3 = [-0.6, 0, 0.8];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const project = (p: Vec3): [number, number] => [dot(p, RIGHT), -p[1]];

interface Shape {
  key: string;
  depth: number;
  fill: string;
  draw: (grow: number) => React.ReactNode;
}

function boneShape(bone: Bone, fill: string): Shape {
  const [hx, hy] = project(bone.head);
  const [tx, ty] = project(bone.tail);
  const r0 = bone.radius;
  const r1 = bone.shape === "cone" ? tipRadius(bone) : r0;
  const depth = (dot(bone.head, TOWARD) + dot(bone.tail, TOWARD)) / 2;
  const sphere = bone.shape === "sphere" || (Math.abs(tx - hx) < 1e-4 && Math.abs(ty - hy) < 1e-4);
  return {
    key: bone.id,
    depth,
    fill,
    draw: (grow) => {
      if (sphere) return <circle cx={hx} cy={hy} r={r0 + grow} />;
      if (bone.shape === "cone") {
        const dx = tx - hx;
        const dy = ty - hy;
        const length = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / length;
        const ny = dx / length;
        const a = r0 + grow;
        const b = r1 + grow;
        return (
          <>
            <circle cx={hx} cy={hy} r={a} />
            <circle cx={tx} cy={ty} r={b} />
            <polygon
              points={`${hx + nx * a},${hy + ny * a} ${tx + nx * b},${ty + ny * b} ${tx - nx * b},${ty - ny * b} ${hx - nx * a},${hy - ny * a}`}
            />
          </>
        );
      }
      return (
        <line
          x1={hx}
          y1={hy}
          x2={tx}
          y2={ty}
          strokeWidth={(r0 + grow) * 2}
          strokeLinecap={bone.shape === "box" ? "square" : "round"}
          stroke="currentColor"
        />
      );
    },
  };
}

export const ChampionSilhouette = memo(function ChampionSilhouette({
  champion,
  className = "",
  title,
}: {
  champion: Champion;
  className?: string;
  title?: string;
}) {
  const drawing = useMemo(() => {
    const skeleton = resolveChampionSkeleton(champion);
    const colour = (slot: Bone["color"]) => TOY_COLOR_VALUES[champion.palette[slot]].hex;
    const outline = TOY_COLOR_VALUES[champion.palette.primary].dark;
    const shapes = skeleton.bones
      .map((bone) => boneShape(bone, colour(bone.color)))
      .toSorted((left, right) => left.depth - right.depth);
    // A chunky outline around the whole body: every shape grown, under every fill.
    const thick = Math.max(0.025, skeleton.height * 0.035);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const bone of skeleton.bones) {
      for (const point of [bone.head, bone.tail]) {
        const [x, y] = project(point);
        const r = bone.radius + thick;
        minX = Math.min(minX, x - r);
        maxX = Math.max(maxX, x + r);
        minY = Math.min(minY, y - r);
        maxY = Math.max(maxY, y + r);
      }
    }
    const pad = thick;
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    const size = Math.max(width, height);
    const viewBox = `${minX - pad - (size - width) / 2} ${minY - pad - (size - height) / 2} ${size} ${size}`;

    const face = skeleton.face;
    const eyes =
      face.scale > 0
        ? [-1, 1].map((sideways) => {
            const at: Vec3 = [face.pos[0] + sideways * face.scale * 0.38, face.pos[1] + face.scale * 0.1, face.pos[2]];
            return project(at);
          })
        : [];
    return { shapes, outline, thick, viewBox, eyes, eyeR: face.scale * 0.24 };
  }, [champion]);

  return (
    <svg
      viewBox={drawing.viewBox}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g fill={drawing.outline} color={drawing.outline} strokeLinejoin="round">
        {drawing.shapes.map((shape) => (
          <g key={`o-${shape.key}`}>{shape.draw(drawing.thick)}</g>
        ))}
      </g>
      {drawing.shapes.map((shape) => (
        <g key={shape.key} fill={shape.fill} color={shape.fill}>
          {shape.draw(0)}
        </g>
      ))}
      {drawing.eyes.map(([x, y], index) => (
        <g key={index}>
          <circle cx={x} cy={y} r={drawing.eyeR} fill="#fffaf2" stroke={drawing.outline} strokeWidth={drawing.thick * 0.5} />
          <circle cx={x + drawing.eyeR * 0.15} cy={y + drawing.eyeR * 0.1} r={drawing.eyeR * 0.5} fill="#1a191d" />
        </g>
      ))}
    </svg>
  );
});
