"use client";

// The back-wall scoreboard as a real board: a title, then one row per
// champion (rank badge in its colour, champion name and owner, W-L, points).
// Rows slide from their old places into the new order, then the points count
// up with a ticking clink; the leader's row gets a gold edge. Below the board
// a shelf holds the champions themselves as little figurines, who walk along
// it into rank order as the rows move ("the champions standing by", in the
// one shot that sees the board). Everything is in the board plane's space.
// The columns and the figurines stay inside the part of the board the
// scoreboard shot actually sees (board-visibility.ts): a set prop in front of
// the board hides only the ends of the strips, never a number or a champion.

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import { championScale, type Champion } from "../../sheet";
import type { ArenaNodes, PlaneNode } from "../arena/nodes";
import { setDriverFromMotion } from "../creature/animator";
import { Creature, createDriver } from "../creature/creature";
import { useStage } from "../services";
import { discGeometry, slabGeometry } from "../ui3d/geometry";
import { darkOf, lightOf, textOn, UI_COLORS, uiOutline, uiToon } from "../ui3d/materials";
import { stageSfx } from "../ui3d/sound";
import { fitTextSize, MARQUEE_TEXT, OnPlane, StageText } from "../ui3d/text";
import { boardColumns, boardPoints, boardRowIndex, boardSlide, recordText, shelfSpots, type BoardRow } from "./board";
import { boardVisibility, type BoardSpan, type BoardVisibility } from "./board-visibility";
import { fighterColor } from "./common";
import { STAGE_SPECULAR } from "./forge";
import { fighterLabel } from "./scene-data";

export interface ScoreboardProps {
  nodes: ArenaNodes | null;
  title: string;
  rows: readonly BoardRow[];
  /** Seconds into the board's animation (slides and count-up; see board.ts). */
  time: () => number;
  /** The champions on a shelf under the board. Default true. */
  figurines?: boolean;
  /** Sounds for the slides and the count (live rooms only). Default true. */
  sound?: boolean;
}

/** Layout of the board plane: header band, then the rows. */
function boardLayout(plane: PlaneNode, rowCount: number) {
  const W = plane.width;
  const H = plane.height;
  const pad = Math.min(W, H) * 0.05;
  const header = H * 0.24;
  const rowH = (H - header - pad) / Math.max(4, rowCount);
  const top = H / 2 - header;
  return { W, H, pad, header, rowH, top, rowY: (index: number) => top - (index + 0.5) * rowH };
}

/** The board group's offset off the plane. */
const BOARD_OFFSET = 0.016;

/** Shelf top below the board plane's bottom edge (lines up with the sets' own ledges). */
const SHELF_DROP = 0.26;
const SHELF_DEPTH = 0.44;
const FIGURINE_SCALE = 0.3;
/** Where the figurines stand on the shelf (depth off the board). */
const FIGURINE_Z = SHELF_DEPTH * 0.42;

/** What the scoreboard shot sees of this board (cached per set). */
function useBoardVisibility(nodes: ArenaNodes, plane: PlaneNode, rowCount: number): BoardVisibility {
  return useMemo(() => {
    const layout = boardLayout(plane, rowCount);
    const count = Math.max(1, rowCount);
    const rowYs = [
      layout.rowY(0) + layout.rowH * 0.3,
      ...Array.from({ length: count }, (_, index) => layout.rowY(index)),
      layout.rowY(count - 1) - layout.rowH * 0.3,
    ];
    const shelfY = -plane.height / 2 - SHELF_DROP;
    return boardVisibility(nodes, plane, BOARD_OFFSET, {
      rows: { ys: rowYs, z: 0.02 },
      shelf: { ys: [shelfY + 0.06, shelfY + 0.3], z: FIGURINE_Z },
    });
  }, [nodes, plane, rowCount]);
}

export function Scoreboard({ nodes, title, rows, time, figurines = true, sound = true }: ScoreboardProps) {
  const plane = nodes?.scoreboardText ?? null;
  if (!nodes || !plane) return null;
  return <PlacedScoreboard nodes={nodes} plane={plane} title={title} rows={rows} time={time} figurines={figurines} sound={sound} />;
}

interface PlacedScoreboardProps {
  nodes: ArenaNodes;
  plane: PlaneNode;
  title: string;
  rows: readonly BoardRow[];
  time: () => number;
  figurines: boolean;
  sound: boolean;
}

function PlacedScoreboard({ nodes, plane, title, rows, time, figurines, sound }: PlacedScoreboardProps) {
  const visibility = useBoardVisibility(nodes, plane, rows.length);
  return (
    <OnPlane plane={plane} offset={BOARD_OFFSET}>
      <BoardFace plane={plane} title={title} rows={rows} time={time} sound={sound} span={visibility.rows} />
      {figurines && <Shelf plane={plane} rows={rows} time={time} span={visibility.shelf} />}
    </OnPlane>
  );
}

function BoardFace({ plane, title, rows, time, sound, span }: { plane: PlaneNode; title: string; rows: readonly BoardRow[]; time: () => number; sound: boolean; span: BoardSpan }) {
  const services = useStage();
  const layout = boardLayout(plane, rows.length);
  const { W, pad, header, rowH, top } = layout;
  const ink = plane.textColor ?? "#f4f0e0";
  const bg = plane.bgColor ?? "#2f3a44";
  const groups = useRef<(Group | null)[]>([]);
  const slid = useRef(false);
  const landed = useRef(false);
  useFrame(() => {
    const t = time();
    rows.forEach((row, index) => {
      const group = groups.current[index];
      if (!group) return;
      const at = boardRowIndex(row, index, t);
      const moving = row.from !== index ? Math.sin(Math.PI * boardSlide(index, t)) : 0;
      group.position.set(0, layout.rowY(at), 0.01 + moving * 0.06);
      // A riser swells a little as it passes the others.
      const s = 1 + (row.from > index ? moving * 0.06 : 0);
      group.scale.set(s, s, 1);
    });
    if (!sound) return;
    const anyMoves = rows.some((row, index) => row.from !== index);
    if (!slid.current && anyMoves && boardSlide(0, t) > 0) {
      slid.current = true;
      stageSfx(services).play("wipe", { intensity: 0.3, gain: 0.4 });
    }
    if (!landed.current && anyMoves && boardSlide(rows.length - 1, t) >= 1) {
      landed.current = true;
      stageSfx(services).play("tap", { intensity: 0.5, gain: 0.5 });
    }
  });
  const titleSize = fitTextSize(title, W * 0.62, header * 0.48);
  const labelSize = Math.min(rowH * 0.22, header * 0.2);
  const columns = boardColumns(W, pad, span);
  return (
    <group>
      <mesh position={[0, 0, -0.008]} receiveShadow>
        <planeGeometry args={[plane.width, plane.height]} />
        <meshStandardMaterial color={bg} roughness={0.9} />
      </mesh>
      <Suspense fallback={null}>
        {/* Centred: clear of the props some sets tape to the board's corners. */}
        <StageText {...MARQUEE_TEXT} size={titleSize} color={ink} position={[0, top + header * 0.58, 0.004]}>
          {title}
        </StageText>
        <StageText {...MARQUEE_TEXT} size={labelSize} color={lightOf(bg, 0.45)} position={[columns.record, top + labelSize * 0.9, 0.004]}>
          W-L
        </StageText>
        <StageText {...MARQUEE_TEXT} size={labelSize} color={lightOf(bg, 0.45)} anchorX="right" position={[columns.points, top + labelSize * 0.9, 0.004]}>
          PTS
        </StageText>
      </Suspense>
      {rows.map((row, index) => (
        <group key={row.fighter.id} ref={(group) => void (groups.current[index] = group)} position={[0, layout.rowY(row.from), 0.01]}>
          <BoardRowFace row={row} index={index} layout={layout} ink={ink} bg={bg} columns={columns} time={time} sound={sound} />
        </group>
      ))}
    </group>
  );
}

interface RowFaceProps {
  row: BoardRow;
  index: number;
  layout: ReturnType<typeof boardLayout>;
  ink: string;
  bg: string;
  columns: ReturnType<typeof boardColumns>;
  time: () => number;
  sound: boolean;
}

function BoardRowFace({ row, index, layout, ink, bg, columns, time, sound }: RowFaceProps) {
  const { W, pad, rowH } = layout;
  const color = fighterColor(row.fighter);
  const leader = row.rank === 1;
  const stripW = W - pad * 2;
  const stripH = rowH * 0.86;
  const badgeR = rowH * 0.34;
  const badgeX = columns.left + pad + badgeR + rowH * 0.12;
  const nameX = badgeX + badgeR + rowH * 0.22;
  const name = fighterLabel(row.fighter);
  const owner = row.fighter.ownerName ?? "House champion";
  const nameSize = Math.min(rowH * 0.36, fitTextSize(name, columns.record - nameX - rowH * 0.6, rowH * 0.36));
  // Dark strips (the board is brightly lit): the fighter's colour is the badge and the strip's edge.
  const strip = darkOf(color, 0.82);
  const stripEdge = leader ? UI_COLORS.gold : color;
  const border = leader ? rowH * 0.05 : rowH * 0.03;
  return (
    <>
      <mesh geometry={slabGeometry(stripW, stripH, 0.02, stripH * 0.22)} material={uiToon(leader ? darkOf(UI_COLORS.gold, 0.84) : strip, { glow: 0.04, specular: 0.1 })} position={[0, 0, -0.006]} receiveShadow />
      <mesh geometry={slabGeometry(stripW + border * 2, stripH + border * 2, 0.012, stripH * 0.22 + border)} material={uiToon(stripEdge, { glow: 0.12, specular: 0.1 })} position={[0, 0, -0.016]} />
      <mesh geometry={discGeometry(badgeR, 0.05)} material={uiToon(color, { glow: 0.16, specular: 0.4 })} position={[badgeX, 0, 0.02]} />
      <mesh geometry={discGeometry(badgeR, 0.05)} material={uiOutline(color, 2)} position={[badgeX, 0, 0.02]} />
      <Suspense fallback={null}>
        <StageText size={badgeR * 1.15} color={textOn(color)} outline={0} glow={0.15} position={[badgeX, -badgeR * 0.05, 0.05]} castShadow={false}>
          {String(row.rank)}
        </StageText>
        <StageText {...MARQUEE_TEXT} size={nameSize} color={leader ? UI_COLORS.gold : ink} anchorX="left" position={[nameX, rowH * 0.1, 0.006]}>
          {name}
        </StageText>
        <StageText {...MARQUEE_TEXT} size={rowH * 0.19} color={lightOf(bg, 0.5)} anchorX="left" position={[nameX, -rowH * 0.24, 0.006]}>
          {owner}
        </StageText>
        <StageText {...MARQUEE_TEXT} size={rowH * 0.36} color={ink} position={[columns.record, 0, 0.006]}>
          {recordText(row)}
        </StageText>
      </Suspense>
      <CountUp row={row} index={index} x={columns.points} size={rowH * 0.4} color={leader ? UI_COLORS.gold : ink} time={time} sound={sound} />
    </>
  );
}

/** The points, counting up (re-laid out only when the shown number changes). */
function CountUp({ row, index, x, size, color, time, sound }: { row: BoardRow; index: number; x: number; size: number; color: string; time: () => number; sound: boolean }) {
  const services = useStage();
  const [shown, setShown] = useState(() => boardPoints(row, index, time()));
  const current = useRef(shown);
  const lastTick = useRef(0);
  useFrame(() => {
    const value = boardPoints(row, index, time());
    if (value === current.current) return;
    current.current = value;
    setShown(value);
    const now = services.clock.elapsed;
    if (sound && now - lastTick.current > 0.07) {
      lastTick.current = now;
      stageSfx(services).play("betPlaced", { intensity: 0.15, gain: 0.22 });
    }
  });
  return (
    <Suspense fallback={null}>
      <StageText {...MARQUEE_TEXT} size={size} color={color} anchorX="right" position={[x, 0, 0.006]}>
        {shown === null ? "-" : String(shown)}
      </StageText>
    </Suspense>
  );
}

function Shelf({ plane, rows, time, span }: { plane: PlaneNode; rows: readonly BoardRow[]; time: () => number; span: BoardSpan }) {
  const spots = shelfSpots(span, rows.length);
  const y = -plane.height / 2 - SHELF_DROP;
  // The shelf spans the spots (and a margin), kept under the board.
  const maxWidth = plane.width + 0.2;
  const width = Math.min(maxWidth, (spots.length ? spots[spots.length - 1]! - spots[0]! : 0) + 1.3);
  const centre = spots.length ? (spots[0]! + spots[spots.length - 1]!) / 2 : 0;
  const shelfX = Math.max(-(maxWidth - width) / 2, Math.min((maxWidth - width) / 2, centre));
  const wood = "#a8774f";
  return (
    <group>
      <mesh geometry={slabGeometry(width, SHELF_DEPTH, 0.07, 0.03)} material={[uiToon(wood, { glow: 0.06 }), uiToon(darkOf(wood, 0.3))]} position={[shelfX, y - 0.035, SHELF_DEPTH / 2 - 0.06]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow />
      <mesh geometry={slabGeometry(width, SHELF_DEPTH, 0.07, 0.03)} material={uiOutline(wood, 2)} position={[shelfX, y - 0.035, SHELF_DEPTH / 2 - 0.06]} rotation={[-Math.PI / 2, 0, 0]} />
      <Suspense fallback={null}>
        {spots.map((x, index) => (
          <StageText key={index} size={0.1} color={UI_COLORS.bone} outline={0.1} outlineColor={darkOf(wood, 0.6)} glow={0.3} position={[x, y - 0.035, SHELF_DEPTH - 0.06 + 0.004]} castShadow={false}>
            {String(index + 1)}
          </StageText>
        ))}
      </Suspense>
      {rows.map((row, index) =>
        row.fighter.champion ? (
          <Figurine key={row.fighter.id} champion={row.fighter.champion} from={spots[row.from] ?? 0} to={spots[index] ?? 0} index={index} y={y} seed={row.fighter.slot + 1} time={time} />
        ) : null,
      )}
    </group>
  );
}

/** A champion in miniature on the shelf, walking from its old spot to its rank's spot. */
function Figurine({ champion, from, to, index, y, seed, time }: { champion: Champion; from: number; to: number; index: number; y: number; seed: number; time: () => number }) {
  const services = useStage();
  const z = FIGURINE_Z;
  const driver = useMemo(() => createDriver([from, y, z], 0), []); // eslint-disable-line react-hooks/exhaustive-deps
  const point = useMemo(() => new Vector3(from, y, z), []); // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(() => new Vector3(from, y, z), []); // eslint-disable-line react-hooks/exhaustive-deps
  const yaw = useRef(0);
  useEffect(() => {
    point.set(from, y, z);
  }, [point, from, y, z]);
  useFrame(() => {
    const dt = services.clock.delta;
    previous.copy(point);
    // The figurines walk a little behind the rows, so you see both move.
    const k = boardSlide(index, time() - 0.25);
    point.set(from + (to - from) * k, y, z);
    const moving = Math.abs(point.x - previous.x) > 1e-4;
    const want = moving ? (point.x < previous.x ? -Math.PI / 2 : Math.PI / 2) * 0.85 : 0;
    yaw.current += (want - yaw.current) * Math.min(1, dt * 8);
    setDriverFromMotion(driver, point, previous, dt, yaw.current);
  });
  return <Creature champion={champion} driver={driver} seed={seed} scale={FIGURINE_SCALE * championScale(champion)} specularMinLight={STAGE_SPECULAR} outlineWidth={1.4} />;
}
