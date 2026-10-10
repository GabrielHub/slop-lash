"use client";

// LOBBY: the set itself is the lobby (no DOM over the canvas).
// - The marquee carries the room code and the join address.
// - A QR board (uqr, as the shell's JoinPanel) stands stage left; the three
//   how-to steps are a sign stage right.
// - Four seats on the front marks: each player's name plate pops in with
//   their token when they join (the bridge plays the join sound; the plate
//   lands with its own tap).
// - The host's START: a big lit push-button prop at the front. Click it, or
//   press Enter/Space (lobby-bridge.tsx). It looks switched off until the room
//   has enough players. Other stages show "Waiting for the host".
// - The crane establishes the set (PhaseScene's base shot); The Voice stays
//   silent until START.

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CylinderGeometry, DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, type Group, type Mesh } from "three";
import { encode } from "uqr";
import type { ArenaNodes } from "../arena/nodes";
import { createToonMaterial } from "../look/toon";
import { useStage } from "../services";
import { Card } from "../ui3d/card";
import { slabGeometry } from "../ui3d/geometry";
import { darkOf, UI_COLORS, uiOutline, uiToon } from "../ui3d/materials";
import { ringDown, springTo1 } from "../ui3d/motion";
import { MotionGroup } from "../ui3d/motion-group";
import { stageSfx } from "../ui3d/sound";
import { StageText } from "../ui3d/text";
import { NamePlate } from "../ui3d/tokens";
import { cameraPoint, SceneMarquee } from "./common";
import { useLobbyStage, type LobbyStage } from "./lobby-bridge";
import { ScoreboardSign, type PhaseSceneProps } from "./phase-scene";

const SEATS = 4;
const QUIET = 3;

/** The QR as a texture: dark modules on white with a quiet zone, crisp (nearest) pixels. */
export function qrTexture(value: string): DataTexture | null {
  if (!value) return null;
  const { size, data } = encode(value, { ecc: "M", border: 0 });
  const full = size + QUIET * 2;
  const pixels = new Uint8Array(full * full * 4);
  for (let y = 0; y < full; y += 1) {
    for (let x = 0; x < full; x += 1) {
      const mx = x - QUIET;
      const my = y - QUIET;
      const dark = mx >= 0 && my >= 0 && mx < size && my < size && data[my]![mx] === true;
      const offset = ((full - 1 - y) * full + x) * 4;
      const value = dark ? 34 : 255;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = dark ? 40 : 255;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, full, full, RGBAFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Where the lobby's props stand: framed by the crane's end shot. */
function lobbyLayout(nodes: ArenaNodes | null) {
  const marks = nodes?.marks.roster ?? [];
  const z = marks[0]?.position.z ?? 0;
  const seat = (index: number): [number, number, number] => {
    const mark = marks[index];
    return mark ? [mark.position.x, 0, mark.position.z] : [-2.25 + index * 1.5, 0, z];
  };
  return {
    seats: Array.from({ length: SEATS }, (_, index) => seat(index)),
    qr: [-3.9, 0, z + 1.1] as [number, number, number],
    howTo: [3.9, 0, z + 1.1] as [number, number, number],
    button: [0, 0, z + 2.2] as [number, number, number],
  };
}

export function LobbyScene({ nodes }: PhaseSceneProps) {
  const lobby = useLobbyStage();
  const layout = useMemo(() => lobbyLayout(nodes), [nodes]);
  const camera = useMemo(() => cameraPoint(nodes, "Cam_Establish_End", [0, 2.8, 8.6]), [nodes]);
  const face = (at: [number, number, number]): [number, number, number] => [0, Math.atan2(camera.x - at[0], camera.z - at[2]), 0];
  const code = lobby?.code ?? "";
  const address = lobby?.joinUrl ? lobby.joinUrl.replace(/^https?:\/\//, "") : (lobby?.siteHost ?? "");
  return (
    <>
      <SceneMarquee nodes={nodes} text={code ? code.split("").join(" ") : "SLOPFIGHT"} sub={address ? `Join at ${address}` : "Join on your phone"} animate={false} />
      <ScoreboardSign nodes={nodes} lines={lobby ? ["TONIGHT: SLOPFIGHT", `${lobby.players.length} OF ${lobby.maxPlayers} SEATS FILLED`] : ["TONIGHT: SLOPFIGHT"]} />
      {lobby && (
        <>
          <QrBoard url={lobby.joinUrl} position={layout.qr} rotation={face(layout.qr)} />
          <HowToSign position={layout.howTo} rotation={face(layout.howTo)} />
          <Seats lobby={lobby} seats={layout.seats} face={face} />
          {lobby.isHost ? (
            <StartButton lobby={lobby} position={layout.button} rotation={face(layout.button)} />
          ) : (
            <Card
              position={[layout.button[0], 0.95, layout.button[2]]}
              rotation={face(layout.button)}
              width={1.9}
              height={0.42}
              enter="rise"
              title="Waiting for the host"
              titleSize={0.17}
              accent={null}
              seed={3}
              sound={false}
            />
          )}
        </>
      )}
    </>
  );
}

/** A post-mounted board: the QR on a white plate, "Scan to join" above it. */
function QrBoard({ url, position, rotation }: { url: string; position: [number, number, number]; rotation: [number, number, number] }) {
  const texture = useMemo(() => qrTexture(url), [url]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const boardColor = UI_COLORS.plum;
  const height = 1.55;
  return (
    <MotionGroup position={position} rotation={rotation} enter="rise" enterDistance={2.2} delay={0.6} seed={2}>
      <Post height={height} />
      <group position={[0, height, 0]}>
        <mesh geometry={slabGeometry(1.25, 1.55, 0.08, 0.1)} material={[uiToon(boardColor, { glow: 0.08 }), uiToon(darkOf(boardColor, 0.3))]} castShadow receiveShadow />
        <mesh geometry={slabGeometry(1.25, 1.55, 0.08, 0.1)} material={uiOutline(boardColor, 2.6)} />
        <mesh position={[0, -0.13, 0.045]}>
          <planeGeometry args={[1.02, 1.02]} />
          {texture ? <meshBasicMaterial map={texture} toneMapped={false} /> : <meshBasicMaterial color="#ffffff" toneMapped={false} />}
        </mesh>
        <Suspense fallback={null}>
          <StageText size={0.15} color={UI_COLORS.gold} glow={0.4} outline={0.05} position={[0, 0.6, 0.05]} castShadow={false}>
            SCAN TO JOIN
          </StageText>
        </Suspense>
      </group>
    </MotionGroup>
  );
}

/** A sign with the three steps, numbered in gold discs. */
function HowToSign({ position, rotation }: { position: [number, number, number]; rotation: [number, number, number] }) {
  const steps = ["Join on your phone", "Draw or describe a champion", "Bet on the brawls and cheer"];
  const height = 1.55;
  const color = UI_COLORS.card;
  return (
    <MotionGroup position={position} rotation={rotation} enter="rise" enterDistance={2.2} delay={0.85} seed={5}>
      <Post height={height} />
      <group position={[0, height, 0]}>
        <mesh geometry={slabGeometry(1.7, 1.55, 0.08, 0.1)} material={[uiToon(color, { glow: 0.1 }), uiToon(UI_COLORS.cardEdge)]} castShadow receiveShadow />
        <mesh geometry={slabGeometry(1.7, 1.55, 0.08, 0.1)} material={uiOutline(UI_COLORS.cardEdge, 2.6)} />
        <Suspense fallback={null}>
          <StageText size={0.15} color={UI_COLORS.tomato} glow={0.2} outline={0} position={[0, 0.58, 0.05]} castShadow={false}>
            HOW TO PLAY
          </StageText>
          {steps.map((step, index) => (
            <group key={step} position={[-0.68, 0.22 - index * 0.36, 0.05]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={uiToon(UI_COLORS.gold, { glow: 0.2 })}>
                <cylinderGeometry args={[0.11, 0.11, 0.04, 24]} />
              </mesh>
              <StageText size={0.13} color={UI_COLORS.ink} outline={0} glow={0.1} position={[0, -0.005, 0.03]} castShadow={false}>
                {String(index + 1)}
              </StageText>
              <StageText size={0.1} maxWidth={1.3} lineHeight={1.02} textAlign="left" color={UI_COLORS.ink} outline={0} glow={0.1} anchorX="left" position={[0.18, 0, 0.02]} castShadow={false}>
                {step}
              </StageText>
            </group>
          ))}
        </Suspense>
      </group>
    </MotionGroup>
  );
}

const postGeometry = new CylinderGeometry(0.045, 0.06, 1, 10).translate(0, 0.5, 0);

function Post({ height }: { height: number }) {
  return (
    <>
      <mesh geometry={postGeometry} scale={[1, height - 0.7, 1]} material={uiToon("#3b3a40", { glow: 0.02 })} castShadow />
      <mesh position={[0, 0.03, 0]} material={uiToon("#3b3a40", { glow: 0.02 })} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.06, 20]} />
      </mesh>
    </>
  );
}

/** The four front-row seats: a stool each, and a name plate when someone sits. */
function Seats({ lobby, seats, face }: { lobby: LobbyStage; seats: [number, number, number][]; face: (at: [number, number, number]) => [number, number, number] }) {
  const players = lobby.players.slice(0, SEATS);
  return (
    <>
      {seats.map((seat, index) => {
        const player = players[index] ?? null;
        return (
          <group key={index}>
            <mesh position={[seat[0], 0.22, seat[2]]} material={uiToon("#c9853f", { glow: 0.05 })} castShadow receiveShadow>
              <cylinderGeometry args={[0.32, 0.36, 0.44, 20]} />
            </mesh>
            {player ? (
              <NamePlate
                key={player.id}
                name={player.name}
                avatar={player.name}
                sub={index === 0 ? "Host" : null}
                position={[seat[0], 0.95, seat[2]]}
                rotation={face(seat)}
                width={1.3}
                height={0.42}
                enter="drop"
                enterDistance={2.4}
                delay={0.2 + index * 0.12}
                seed={index + 1}
              />
            ) : (
              <NamePlate
                key={`open-${index}`}
                name="Open seat"
                sub={index < lobby.minPlayers ? "Needed to start" : "Optional"}
                dim
                position={[seat[0], 0.85, seat[2]]}
                rotation={face(seat)}
                width={1.2}
                height={0.38}
                idle={0.4}
                delay={0.3 + index * 0.1}
                seed={index + 1}
                sound={false}
              />
            )}
          </group>
        );
      })}
    </>
  );
}

const capGeometry = new CylinderGeometry(0.42, 0.46, 0.2, 40);
const baseGeometry = new CylinderGeometry(0.62, 0.72, 0.62, 40);

/** The host's START: a big arcade button on a plinth; click it or press Enter/Space. */
function StartButton({ lobby, position, rotation }: { lobby: LobbyStage; position: [number, number, number]; rotation: [number, number, number] }) {
  const services = useStage();
  const cap = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const ready = lobby.canStart;
  const capMaterial = useMemo(() => {
    const material = createToonMaterial({ vertexColors: false, color: "#e8553d", emissive: "#ff6a4a", specular: 0.7, rim: 0.4 });
    material.emissiveIntensity = 0.1;
    return material;
  }, []);
  useEffect(() => () => capMaterial.dispose(), [capMaterial]);
  const [hover, setHover] = useState(false);
  const press = useRef({ t: 9, count: lobby.presses });
  useEffect(() => {
    if (lobby.presses === press.current.count) return;
    press.current = { t: 0, count: lobby.presses };
    stageSfx(services).play(ready ? "confirm" : "tap", { intensity: ready ? 0.8 : 0.3 });
    if (ready) services.cheer(0.6);
  }, [lobby.presses, ready, services]);
  useFrame(() => {
    const p = press.current;
    p.t += services.clock.realDelta;
    const t = services.clock.elapsed;
    // Ready: it throbs and glows; not ready: dull and still.
    const glow = ready ? 0.55 + 0.35 * Math.sin(t * 4) + (hover ? 0.3 : 0) : 0.04;
    capMaterial.emissiveIntensity = glow;
    capMaterial.color.set(ready ? "#e8553d" : "#8a6d66");
    const push = p.t < 0.5 ? Math.sin(Math.min(1, p.t / 0.12) * Math.PI * 0.5) * (1 - springTo1(Math.max(0, p.t - 0.12), 4, 0.4)) : 0;
    if (cap.current) {
      cap.current.position.y = 0.72 - push * 0.12;
      const squash = ringDown(p.t, 0.15, 4, 7);
      cap.current.scale.set(1 + squash * 0.4, 1 - squash, 1 + squash * 0.4);
    }
    if (group.current && ready) group.current.position.y = Math.max(0, Math.sin(t * 4) * 0.012);
  });
  const label = ready ? "START" : lobby.needed > 0 ? `${lobby.needed} MORE` : "START";
  return (
    <MotionGroup position={position} rotation={rotation} enter="rise" enterDistance={1.4} delay={1.1} seed={4}>
      <group
        ref={group}
        onClick={(event) => {
          event.stopPropagation();
          lobby.press();
        }}
        onPointerOver={() => {
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <mesh geometry={baseGeometry} position={[0, 0.31, 0]} material={uiToon("#3a2138", { glow: 0.06 })} castShadow receiveShadow />
        <mesh geometry={baseGeometry} position={[0, 0.31, 0]} material={uiOutline("#3a2138", 2.4)} />
        <mesh ref={cap} geometry={capGeometry} position={[0, 0.72, 0]} material={capMaterial} castShadow />
        <mesh geometry={capGeometry} position={[0, 0.72, 0]} material={uiOutline("#e8553d", 2.4)} />
        <Suspense fallback={null}>
          <StageText size={0.2} color={ready ? UI_COLORS.gold : "#b9a9a0"} glow={ready ? 0.6 : 0.1} outline={0.06} position={[0, 0.3, 0.73]} castShadow={false}>
            {label}
          </StageText>
          {!ready && (
            <StageText size={0.09} color={UI_COLORS.bone} glow={0.2} outline={0.06} position={[0, 0.12, 0.73]} castShadow={false}>
              {lobby.needed > 0 ? `player${lobby.needed === 1 ? "" : "s"} to start` : "starting..."}
            </StageText>
          )}
          {lobby.error && (
            <StageText size={0.08} color={UI_COLORS.tomato} glow={0.3} outline={0.06} position={[0, 1.05, 0]} castShadow={false}>
              {lobby.error}
            </StageText>
          )}
        </Suspense>
      </group>
    </MotionGroup>
  );
}
