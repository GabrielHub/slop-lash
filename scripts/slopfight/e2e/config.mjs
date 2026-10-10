import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const ARGS = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }),
);
export const BASE = String(ARGS.base ?? "http://localhost:3000").replace(/\/$/, "");
export const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
export const OUT = path.resolve(
  String(ARGS.shots ?? path.join(ROOT, "output", "playwright", "slopfight", STAMP)),
);
export const HEADED = ARGS.headed === true;
export const FILM = ARGS["no-film"] !== true;
export const GPU_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--autoplay-policy=no-user-gesture-required",
];
export const NO_GL_ARGS = ["--disable-webgl", "--disable-3d-apis"];
export const PHONE = { width: 390, height: 844 };
export const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
export const HOST_NAME = "Mara";
export const GUEST_NAME = "Theo";
export const DESCRIPTION = "a grumpy cactus wrestler with boxing gloves and a tiny sombrero";
export const UPGRADE_TEXT = { 2: "a jetpack made of soda bottles", 3: "rocket roller skates" };
/** Phase-change hitch window: the worst frame within this many ms either side. */
export const HITCH_WINDOW_MS = 1500;
/** Fights filmed by default (the rest are measured clean); a ring-out is always filmed. */
export const FILMED_FIGHTS = 2;
export const GAME_TIMEOUT_MS = 30 * 60_000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const log = {
  meta: { base: BASE, out: OUT, startedAt: new Date().toISOString(), headed: HEADED },
  timeline: [],
  mutations: [],
  console: [],
  network: [],
  shots: [],
  phases: [],
  fights: [],
  fps: {},
  hitches: [],
  hashes: {},
  bundles: [],
  captures: [],
  failures: [],
  notes: [],
};

export function note(text) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${text}`;
  log.notes.push(line);
  console.log(line);
}
