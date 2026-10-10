"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { ACESFilmicToneMapping, Color } from "three";

// Foundation PROBE, replaced by the Stage core workstream. It proves the stack
// bundles behind the lazy Stage: R3F + drei, the deterministic Rapier WASM
// (dynamically imported), and a module Web Worker.

const DUSK = new Color("#2a1a24");

type ProbeState = { rapier: string; worker: string };

/** Steps a tiny Rapier world: a ball dropped onto the floor for one second. */
async function probeRapier(): Promise<string> {
  const started = performance.now();
  const { default: RAPIER } = await import("@dimforge/rapier3d-deterministic-compat");
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.1, 3).setTranslation(0, -0.1, 0));
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0));
  world.createCollider(RAPIER.ColliderDesc.ball(0.25), ball);
  for (let step = 0; step < 60; step += 1) world.step();
  const y = ball.translation().y;
  world.free();
  return `rapier ${RAPIER.version()} ok: ball y=${y.toFixed(3)} after 60 steps (${Math.round(performance.now() - started)} ms)`;
}

/** Round-trips one message through a module worker. */
function probeWorker(): Promise<{ text: string; worker: Worker }> {
  const worker = new Worker(new URL("./probe.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<string>) => resolve({ text: event.data, worker });
    worker.onerror = (event) => reject(new Error(event.message || "worker error"));
    worker.postMessage("ping");
  });
}

function useProbes(): ProbeState {
  const [state, setState] = useState<ProbeState>({ rapier: "rapier: loading", worker: "worker: starting" });
  useEffect(() => {
    let alive = true;
    let spawned: Worker | null = null;
    probeRapier()
      .then((rapier) => alive && setState((current) => ({ ...current, rapier })))
      .catch((error: unknown) => alive && setState((current) => ({ ...current, rapier: `rapier failed: ${String(error)}` })));
    probeWorker()
      .then(({ text, worker }) => {
        spawned = worker;
        if (alive) setState((current) => ({ ...current, worker: `worker ok: ${text}` }));
        worker.terminate();
      })
      .catch((error: unknown) => alive && setState((current) => ({ ...current, worker: `worker failed: ${String(error)}` })));
    return () => {
      alive = false;
      spawned?.terminate();
    };
  }, []);
  return state;
}

function ProbeScene() {
  return (
    <>
      <color attach="background" args={[DUSK]} />
      <fog attach="fog" args={[DUSK, 8, 22]} />
      <hemisphereLight args={["#ffd9b0", "#3a2140", 0.35]} />
      {/* Warm key, cool fill, strong rim. */}
      <directionalLight position={[4, 6, 3]} intensity={2.4} color="#ffcf9e" castShadow />
      <directionalLight position={[-5, 3, 2]} intensity={0.7} color="#8fb7ff" />
      <directionalLight position={[0, 4, -6]} intensity={1.8} color="#ff9a6b" />
      <RoundedBox args={[1, 1, 1]} radius={0.22} smoothness={6} position={[0, 0.6, 0]} rotation={[0, 0.6, 0]} castShadow>
        <meshToonMaterial color="#ff7a3d" />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshToonMaterial color="#6b4a3f" />
      </mesh>
    </>
  );
}

export default function StageRoot() {
  const probes = useProbes();
  return (
    <div className="absolute inset-0 portrait:min-h-svh">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: [3.2, 2.4, 4.2], fov: 40 }}
        gl={{ toneMapping: ACESFilmicToneMapping, antialias: true }}
        onCreated={({ camera }) => camera.lookAt(0, 0.4, 0)}
      >
        <ProbeScene />
      </Canvas>
      {process.env.NODE_ENV !== "production" && (
        <div className="pointer-events-none absolute right-[1rem] bottom-[1rem] z-10 flex flex-col items-end gap-1 font-mono text-xs text-ink-dim">
          <span data-probe="rapier">{probes.rapier}</span>
          <span data-probe="worker">{probes.worker}</span>
        </div>
      )}
    </div>
  );
}
