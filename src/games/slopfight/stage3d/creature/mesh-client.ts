// Main-thread side of the mesher: a small pool of module workers, a cache by
// request key (the champion hash for finished sheets), and a main-thread
// fallback when workers are unavailable. Builds three.js geometry from the
// worker's typed arrays.

import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";
import { FINISH_ATTRIBUTE } from "../look/toon";
import { meshCreature, meshKey, type MeshData, type MeshRequest } from "./mesher";
import type { WorkerRequest, WorkerResponse } from "./mesher.worker";

const POOL_SIZE = 2;
const CACHE_LIMIT = 96;

interface Pending {
  resolve: (mesh: MeshData) => void;
  reject: (error: Error) => void;
}

/** Timings for the dev readout: the last few meshes and where they ran. */
export const mesherStats = {
  meshes: 0,
  lastMs: 0,
  lastResolution: 0,
  lastVertices: 0,
  worker: true,
  recent: [] as number[],
  /** Every mesh this page made: [ms, resolution, vertices]. */
  log: [] as [number, number, number][],
};

let workers: Worker[] | null = null;
let workersFailed = false;
let nextWorker = 0;
let nextId = 1;
const pending = new Map<number, Pending>();
const cache = new Map<string, Promise<MeshData>>();

function startWorkers(): Worker[] | null {
  if (workers || workersFailed) return workers;
  if (typeof Worker === "undefined") {
    workersFailed = true;
    return null;
  }
  try {
    workers = Array.from({ length: POOL_SIZE }, () => {
      const worker = new Worker(new URL("./mesher.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const data = event.data;
        const job = pending.get(data.id);
        if (!job) return;
        pending.delete(data.id);
        if ("error" in data) job.reject(new Error(data.error));
        else job.resolve(data.mesh);
      };
      worker.onerror = () => {
        // A worker that cannot start (or crashes) hands its jobs to the main thread.
        workersFailed = true;
        workers?.forEach((w) => w.terminate());
        workers = null;
      };
      return worker;
    });
  } catch {
    workersFailed = true;
    workers = null;
  }
  return workers;
}

/**
 * Start the worker pool now so its JIT warm-up (a few throwaway meshes) is done
 * before the first real request. Called when a creature view is created; call
 * it earlier (e.g. when a forge phase begins) to hide the warm-up entirely.
 */
export function warmMesher() {
  startWorkers();
}

function record(mesh: MeshData, worker: boolean) {
  mesherStats.meshes += 1;
  mesherStats.lastMs = mesh.ms;
  mesherStats.lastResolution = mesh.resolution;
  mesherStats.lastVertices = mesh.vertexCount;
  mesherStats.worker = worker;
  mesherStats.recent.push(mesh.ms);
  if (mesherStats.recent.length > 40) mesherStats.recent.shift();
  mesherStats.log.push([Math.round(mesh.ms * 10) / 10, mesh.resolution, mesh.vertexCount]);
  if (mesherStats.log.length > 400) mesherStats.log.shift();
}

function runOnMainThread(request: MeshRequest): Promise<MeshData> {
  return new Promise((resolve) => {
    // Yield first so a burst of requests never blocks a frame twice in a row.
    setTimeout(() => {
      const mesh = meshCreature(request);
      record(mesh, false);
      resolve(mesh);
    }, 0);
  });
}

function runOnWorker(request: MeshRequest): Promise<MeshData> {
  const pool = startWorkers();
  if (!pool || pool.length === 0) return runOnMainThread(request);
  const id = nextId++;
  const worker = pool[nextWorker++ % pool.length]!;
  return new Promise<MeshData>((resolve, reject) => {
    pending.set(id, {
      resolve: (mesh) => {
        record(mesh, true);
        resolve(mesh);
      },
      reject,
    });
    worker.postMessage({ id, request } satisfies WorkerRequest);
  }).catch(() => runOnMainThread(request));
}

/** A mesh for the request, from the cache when the same body was meshed before. */
export function requestMesh(request: MeshRequest, key = meshKey(request)): Promise<MeshData> {
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const job = runOnWorker(request);
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return job;
}

/** Skinned-mesh geometry from mesher output. The arrays are shared, not copied. */
export function geometryFromMesh(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setAttribute(FINISH_ATTRIBUTE, new BufferAttribute(mesh.finish, 2));
  geometry.setAttribute("skinIndex", new BufferAttribute(mesh.skinIndex, 4));
  geometry.setAttribute("skinWeight", new BufferAttribute(mesh.skinWeight, 4));
  geometry.setIndex(new BufferAttribute(mesh.index, 1));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const centre = box.getCenter(new Vector3());
  geometry.boundingSphere = new Sphere(centre, box.getSize(new Vector3()).length() * 0.75);
  return geometry;
}
