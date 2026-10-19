// Fight-lab stills for judging the TV from the couch: per arena, the face-off
// (the walk-on, then both low angles once the notes are in) and the fight at
// fixed sim times, each named with the director's shot. Run against a Next dev
// server (the lab and its window hooks are development-only).
//
//   vp exec node scripts/slopfight/legibility-shots.mjs [--base=http://localhost:3000]
//     [--out=output/legibility] [--arenas=garage,kitchen,rooftop]
//     [--a=raccoon-lawyer] [--b=crab] [--seed=7] [--quality=high|medium|low] [--headed]

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadPlaywright } from "../lib/playwright.mjs";

const ARGS = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const BASE = String(ARGS.base ?? "http://localhost:3000");
const OUT = path.resolve(String(ARGS.out ?? "output/legibility"));
const ARENAS = String(ARGS.arenas ?? "garage,kitchen,rooftop").split(",");
const PAIR = { a: String(ARGS.a ?? "raccoon-lawyer"), b: String(ARGS.b ?? "crab") };
const SEED = String(ARGS.seed ?? 7);
/** Seconds into FACE_OFF: the walk-on under the slam, the hazard and the notes in the spotlight, then the wall with every note in. */
const FACE_OFF_AT = [1.0, 3.4, 5.0, 6.6, 8.2, 10.8];
/** Sim ms into FIGHT. */
const FIGHT_AT = [800, 2500, 4500, 6500, 8500, 11000, 14000, 18000, 23000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch(chromium) {
  const options = {
    headless: !ARGS.headed,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
  };
  try {
    return await chromium.launch({ ...options, channel: "chromium" });
  } catch {
    return chromium.launch(options);
  }
}

async function waitFor(page, predicate, arg, timeout = 90_000) {
  await page.waitForFunction(predicate, arg, { timeout, polling: 100 });
}

/** The director's shot (and side for the face-off) as a file-name part. */
function shotOf(page) {
  return page.evaluate(() => {
    const director = window.__slopStage?.services.director;
    if (!director) return "none";
    const side = director.current?.request?.side;
    return director.shot + (director.shot === "face_off_low" && side ? `-${side}` : "");
  });
}

async function shoot(page, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return file;
}

async function arenaShots(context, arena, log) {
  const page = await context.newPage();
  page.on("pageerror", (error) => log.push(`${arena}: pageerror ${String(error).slice(0, 300)}`));
  const query = new URLSearchParams({ ...PAIR, arena, seed: SEED, phase: "faceoff", auto: "0" });
  if (ARGS.quality) query.set("quality", String(ARGS.quality));
  await page.goto(`${BASE}/dev/slopfight/fight?${query}`, { waitUntil: "domcontentloaded" });
  await waitFor(page, () => Boolean(window.__fightLab && window.__slopStage?.services.director.nodes));
  // Creature meshes and fonts settle; then back to the roster and into a fresh
  // face-off (the scene remounts, so its timeline starts now).
  await sleep(4_000);
  await page.evaluate(() => window.__fightLab.go("roster", 0));
  await sleep(1_500);

  await page.evaluate(() => window.__fightLab.go("faceoff", 0));
  const faceOffStart = Date.now();
  for (const at of FACE_OFF_AT) {
    await sleep(Math.max(0, faceOffStart + at * 1000 - Date.now()));
    const shot = await shotOf(page);
    const file = await shoot(page, path.join(OUT, arena, `faceoff-${at.toFixed(1)}s-${shot}.png`));
    log.push(`${arena} faceoff +${at}s ${shot} -> ${path.relative(OUT, file)}`);
  }

  await page.evaluate(() => window.__fightLab.go("fight", 0));
  await waitFor(page, () => (window.__slopFight?.player.t ?? -1) >= 0);
  const endMs = await page.evaluate(() => window.__fightLab.outcome.endMs);
  for (const at of FIGHT_AT) {
    if (at > endMs + 2_500) break;
    await waitFor(page, (ms) => (window.__slopFight?.player.t ?? -1) >= ms, at, 60_000);
    const shot = await shotOf(page);
    const file = await shoot(page, path.join(OUT, arena, `fight-${(at / 1000).toFixed(1)}s-${shot}.png`));
    log.push(`${arena} fight ${at}ms ${shot} -> ${path.relative(OUT, file)}`);
  }
  await page.close();
}

const { chromium } = loadPlaywright();
const browser = await launch(chromium);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const log = [];
try {
  for (const arena of ARENAS) await arenaShots(context, arena, log);
} finally {
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "shots.txt"), `${log.join("\n")}\n`);
  console.log(log.join("\n"));
}
