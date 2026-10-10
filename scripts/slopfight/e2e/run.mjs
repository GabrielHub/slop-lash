// SlopFight live E2E: one GPU browser, three contexts (the TV at /stage/CODE
// and two phones), a Free Play room created through the real host UI with
// timers on, a full game against the dev Convex deployment the Next dev
// server points at. Waits on the TV's own room view (window.__slopfightStage,
// development builds only) for every phase change, never on fixed sleeps.
//
//   node scripts/slopfight/e2e/run.mjs [--base=http://localhost:3000]
//     [--shots=<dir>] [--headed] [--keep] [--no-film] [--nogl-only=<CODE>]
//
// See README.md. Needs no secrets: the room is Free Play.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { CAT, HAT_AND_SWORD } from "./doodles.mjs";
import {
  ROOT,
  ARGS,
  BASE,
  OUT,
  HEADED,
  FILM,
  GPU_ARGS,
  NO_GL_ARGS,
  HOST_NAME,
  GUEST_NAME,
  DESCRIPTION,
  UPGRADE_TEXT,
  FILMED_FIGHTS,
  GAME_TIMEOUT_MS,
  sleep,
  log,
  note,
} from "./config.mjs";
import { instrument, tvInitScript, Tv, pickFrames, newPhone } from "./browser.mjs";
import { analyzeFrames, writeLog, summarize, validationFailures } from "./report.mjs";

// ---------------------------------------------------------------------------
// Playwright (the repo has playwright-core only as a transitive dependency)
// ---------------------------------------------------------------------------

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_CORE, "playwright-core"].filter(Boolean);
  try {
    const store = path.join(ROOT, "node_modules", ".pnpm");
    for (const dir of readdirSync(store)
      .filter((name) => name.startsWith("playwright-core@"))
      .sort()
      .reverse()) {
      candidates.push(path.join(store, dir, "node_modules", "playwright-core"));
    }
  } catch {
    // No pnpm store: only the explicit candidates.
  }
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next one.
    }
  }
  throw new Error("playwright-core not found: set PLAYWRIGHT_CORE to its folder");
}

async function launch(chromium, extraArgs) {
  const options = { headless: !HEADED, args: [...GPU_ARGS, ...extraArgs] };
  if (ARGS.chrome) return chromium.launch({ ...options, executablePath: String(ARGS.chrome) });
  try {
    return await chromium.launch({ ...options, channel: "chromium" });
  } catch {
    return chromium.launch(options);
  }
}

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------

async function tvShot(tv, label) {
  const file = path.join(OUT, "tv", `${label}.png`);
  mkdirSync(path.dirname(file), { recursive: true });
  const capture = { from: await tv.perfNow(), to: null, kind: "screenshot", label };
  log.captures.push(capture);
  try {
    await tv.page.screenshot({ path: file });
    const server = Date.now() + (tv.offset ?? 0);
    log.shots.push({ kind: "tv", label, file, server });
    return file;
  } catch (error) {
    log.failures.push(`tv screenshot ${label} failed: ${error.message.split("\n")[0]}`);
    return null;
  } finally {
    capture.to = await tv.perfNow();
  }
}

async function createRoom(host) {
  const page = host.page;
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Host a game" }).first().waitFor({ timeout: 60_000 });
  await host.shot("landing");
  await page.getByRole("link", { name: "Host a game" }).first().tap();
  await page.waitForURL(/\/host/, { timeout: 60_000 });
  const pick = page.locator("label", { hasText: "SlopFight" }).first();
  await pick.waitFor({ timeout: 60_000 });
  await pick.tap();
  await page.locator("#host-player-name").fill(HOST_NAME);
  await page.getByRole("button", { name: "More options" }).tap();
  const timers = page.getByRole("switch", { name: "Timers" });
  await timers.waitFor({ timeout: 10_000 });
  const timersOn = (await timers.getAttribute("aria-checked")) === "true";
  if (!timersOn) await timers.tap();
  const narrator = await page.getByRole("switch", { name: /narrator/i }).count();
  const freePlay = await page
    .getByText("Free Play", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  note(
    `host form: SlopFight picked, timers ${timersOn ? "on (default)" : "switched on"}, Free Play shown ${freePlay}, narrator switch present ${narrator > 0}`,
  );
  if (
    await page
      .getByRole("button", { name: "Use Free Play instead" })
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByRole("button", { name: "Use Free Play instead" }).tap();
  }
  await host.shot("host-form");
  await page.getByRole("button", { name: "Create game" }).tap();
  await page.waitForURL(/\/(controller|game|stage)\/[A-Z0-9]+/, { timeout: 60_000 });
  const code = page.url().match(/\/(?:controller|game|stage)\/([A-Z0-9]+)/)[1];
  note(`room ${code} created (host phone at ${new URL(page.url()).pathname})`);
  return code;
}

async function joinRoom(phone, code) {
  const page = phone.page;
  await page.goto(`${BASE}/join/${code}`, { waitUntil: "domcontentloaded" });
  const name = page.getByPlaceholder("What should we call you?");
  await name.waitFor({ timeout: 60_000 });
  // SSR already exposes the field, but its mount effect focuses it only once
  // the controlled form is hydrated and can retain input and submit events.
  await page.waitForFunction(() => document.activeElement?.id === "join-player-name");
  await name.fill(GUEST_NAME);
  await phone.shot("join");
  await page.locator('button[type="submit"]').first().tap();
  await page.waitForURL(/\/(controller|game)\//, { timeout: 60_000 });
  note(`${phone.name} joined ${code}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { chromium } = loadPlaywright();
  if (ARGS["nogl-only"]) {
    await recapWithoutWebGL(chromium, String(ARGS["nogl-only"]));
    writeLog();
    return;
  }
  const browser = await launch(chromium, []);
  try {
    const tvContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    await tvContext.addInitScript(tvInitScript);
    const tvPage = await tvContext.newPage();
    instrument("tv", tvPage);
    const tv = new Tv(tvPage, await tvContext.newCDPSession(tvPage));
    const host = await newPhone(browser, "host");
    const guest = await newPhone(browser, "guest");
    const phones = [host, guest];

    const code = await createRoom(host);
    log.meta.code = code;
    await tvPage.goto(`${BASE}/stage/${code}`, { waitUntil: "domcontentloaded" });
    await tvPage.waitForFunction(() => !!window.__slopfightStage, null, { timeout: 120_000 });
    log.meta.gpu = await tvPage.evaluate(() => {
      try {
        const gl = document.createElement("canvas").getContext("webgl2");
        return gl.getParameter(
          gl.getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL,
        );
      } catch {
        return "n/a";
      }
    });
    note(`TV on /stage/${code}, GPU ${log.meta.gpu}`);
    await joinRoom(guest, code);
    await host.page.getByRole("button", { name: "Start game" }).waitFor({ timeout: 60_000 });
    await waitFor(tv, (s) => s.players.length >= 2, 60_000, "two players in the lobby");
    await sleep(4000); // the lobby scene settles its seats and QR before the evidence shot
    await tvShot(tv, "00-lobby");
    await host.shot("lobby");
    await guest.shot("lobby");
    await host.tapButton("Start game");
    note("host pressed Start game");

    const ctx = {
      tv,
      host,
      guest,
      phones,
      code,
      filmed: 0,
      ringoutFilmed: false,
      menuDone: false,
      upgrades: {},
      buildDone: false,
      finishedAt: null,
    };
    await playGame(ctx);

    await finale(ctx, chromium);
    await Promise.all(phones.map((phone) => phone.checkBundles()));
    log.meta.endedAt = new Date().toISOString();
    log.failures = validationFailures();
    writeLog();
    summarize();
    if (log.failures.length) throw new Error(`Integration failed:\n${log.failures.join("\n")}`);
    if (ARGS.keep) {
      note("--keep: leaving the browser and the room open; Ctrl-C to quit");
      await new Promise(() => {});
    }
  } finally {
    await browser.close();
  }
}

async function waitFor(tv, predicate, timeoutMs, what) {
  const started = Date.now();
  for (;;) {
    const snapshot = await tv.snapshot();
    if (snapshot) tv.offset = snapshot.offset;
    if (snapshot && predicate(snapshot)) return snapshot;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(200);
  }
}

/** The phase loop: one handler per phase change, run in the background so the loop never blocks. */
async function playGame(ctx) {
  const { tv } = ctx;
  let lastGen = null;
  let lastStatus = null;
  const started = Date.now();
  const running = new Set();
  for (;;) {
    if (Date.now() - started > GAME_TIMEOUT_MS)
      throw new Error("game did not finish in 30 minutes");
    const snapshot = await tv.snapshot();
    if (!snapshot) {
      await sleep(250);
      continue;
    }
    tv.offset = snapshot.offset;
    if (snapshot.gen !== lastGen || snapshot.status !== lastStatus) {
      lastGen = snapshot.gen;
      lastStatus = snapshot.status;
      const entry = {
        server: snapshot.now,
        status: snapshot.status,
        phase: snapshot.phase,
        round: snapshot.round,
        step: snapshot.step,
        gen: snapshot.gen,
        phaseStartedAt: snapshot.phaseStartedAt,
        phaseDeadline: snapshot.phaseDeadline,
        perf: snapshot.perf,
        fighters: snapshot.fighters.map(
          (f) => `${f.slot}:${f.status}${f.name ? `:${f.name}` : ""}`,
        ),
      };
      log.phases.push(entry);
      writeFileSync(
        path.join(OUT, "checkpoint.json"),
        JSON.stringify({ log, recording: await tv.recording() }),
      );
      note(
        `phase ${snapshot.status} ${snapshot.phase} r${snapshot.round}s${snapshot.step} gen ${snapshot.gen} deadline ${snapshot.phaseDeadline ? `${Math.round((snapshot.phaseDeadline - snapshot.now) / 1000)}s` : "none"} | ${entry.fighters.join(" ")}`,
      );
      const task = onPhase(ctx, snapshot).catch((error) => {
        const failure = `handler ${snapshot.phase} failed: ${error.stack ?? error}`;
        log.failures.push(failure);
        note(failure);
      });
      running.add(task);
      void task.finally(() => running.delete(task));
      if (snapshot.status === "FINISHED") break;
    }
    await sleep(200);
  }
  await Promise.race([Promise.allSettled(running), sleep(30_000)]);
}

const isGen = (ctx, gen) => async () => (await ctx.tv.snapshot())?.gen === gen;

async function phoneShots(ctx, snapshot, label) {
  const tag = `${snapshot.phase.toLowerCase()}-r${snapshot.round}s${snapshot.step}${label ? `-${label}` : ""}`;
  await Promise.all(ctx.phones.map((phone) => phone.shot(tag)));
}

async function onPhase(ctx, snapshot) {
  const { tv } = ctx;
  if (snapshot.status === "FINISHED") return;
  const tag = `r${snapshot.round}s${snapshot.step}`;
  const filmDir = (name) =>
    path.join(OUT, "film", `${String(log.phases.length).padStart(2, "0")}-${name}-${tag}`);
  await sleep(900); // let the phones render the new phase before the screen evidence
  await phoneShots(ctx, snapshot, "");
  switch (snapshot.phase) {
    case "BUILD":
      return build(ctx, snapshot, filmDir("build"));
    case "FOUNDRY":
      if (!tv.film) await tv.startFilm(filmDir("foundry"));
      return foundry(ctx, snapshot);
    case "ROSTER":
      return roster(ctx, snapshot, filmDir("roster"));
    case "FACE_OFF":
      return faceOff(ctx, snapshot, filmDir("faceoff"));
    case "FIGHT":
      return fight(ctx, snapshot, filmDir("fight"));
    case "RESULT":
      await tv.startFilm(filmDir("result"));
      await sleep(3000);
      return phoneShots(ctx, snapshot, "later");
    case "STANDINGS":
      await tv.startFilm(filmDir("standings"));
      return standings(ctx, snapshot);
    case "UPGRADE":
      return upgrade(ctx, snapshot, filmDir("upgrade"));
    default:
      return undefined;
  }
}

async function build(ctx, snapshot, dir) {
  const { tv, host, guest } = ctx;
  const live = isGen(ctx, snapshot.gen);
  await guest.page
    .getByRole("button", { name: /Describe it/ })
    .first()
    .tap();
  await host.page
    .getByRole("button", { name: /Draw it/ })
    .first()
    .tap();
  await sleep(600);
  await Promise.all([host.shot("build-draw-open"), guest.shot("build-describe-open")]);
  // Both work at once; the TV is shot mid-sketch (easel strokes) and mid-typing (shimmer).
  const drawing = host.draw(CAT, {
    onHalf: async () => {
      await tvShot(tv, "01-build-live-sketching");
      await host.shot("build-drawing");
    },
  });
  const typing = (async () => {
    await sleep(2500);
    await guest.typeText(DESCRIPTION, {
      label: "Describe your champion",
      onHalf: async () => {
        await sleep(800);
        await tvShot(tv, "02-build-typing-shimmer");
      },
    });
    await guest.shot("build-typed");
  })();
  await Promise.all([drawing, typing]);
  await sleep(1500);
  await tvShot(tv, "03-build-easels-before-submit");
  await host.shot("build-drawn");
  if (!(await live())) note("BUILD ended before the submits");
  await host.tapButton("Send to the Foundry");
  note("host submitted the drawing");
  await sleep(1200);
  await guest.tapButton("Send to the Foundry");
  note("guest submitted the description");
  await sleep(1500);
  await Promise.all([host.shot("build-forging"), guest.shot("build-forging")]);
  await tv.startFilm(dir);
  await Promise.all([measureForging(ctx), forgeWatch(ctx, snapshot.round)]);
}

/** BUILD's fps window: once the most creatures are growing at once (ideally all four). */
async function measureForging(ctx) {
  const { tv } = ctx;
  const deadline = Date.now() + 60_000;
  let best = 0;
  for (;;) {
    const s = await tv.snapshot();
    if (!s || !["BUILD", "FOUNDRY"].includes(s.phase)) break;
    const forging = s.fighters.filter((f) => f.status === "FORGING").length;
    best = Math.max(best, forging);
    if (forging >= 2 || Date.now() > deadline) {
      if (forging === 0) break;
      await measureWindow(ctx, `build-${forging}-forging`, 6000);
      return;
    }
    await sleep(150);
  }
  note(`BUILD fps window skipped (at most ${best} forging at once)`);
}

/** Pause the film, record ≥ `ms` of frames, resume. */
async function measureWindow(ctx, name, ms) {
  const { tv } = ctx;
  const film = tv.film;
  if (film) {
    await tv.cdp.send("Page.stopScreencast");
    film.capture.to = await tv.perfNow();
  }
  await sleep(300);
  const from = await tv.perfNow();
  const before = await tv.snapshot();
  await sleep(ms);
  const to = await tv.perfNow();
  const after = await tv.snapshot();
  log.fps[name] = {
    from,
    to,
    phase: `${before?.phase} → ${after?.phase}`,
    forging: before?.fighters.filter((f) => f.status === "FORGING").length,
  };
  note(`fps window ${name}: ${((to - from) / 1000).toFixed(1)} s in ${log.fps[name].phase}`);
  if (film && tv.film === film) {
    film.capture = { from: await tv.perfNow(), to: null, kind: "film", label: film.dir };
    log.captures.push(film.capture);
    await tv.cdp
      .send("Page.startScreencast", {
        format: "jpeg",
        quality: 70,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1,
      })
      .catch(() => {});
  }
}

/** Shot the forging and the sketch-to-champion moments from the film as each fighter lands. */
async function forgeWatch(ctx, round) {
  const { tv } = ctx;
  const readyAt = new Map();
  const startedAt = new Map();
  for (;;) {
    const s = await tv.snapshot();
    if (!s || !["BUILD", "FOUNDRY", "UPGRADE"].includes(s.phase)) break;
    for (const f of s.fighters) {
      if (f.status === "FORGING" && !startedAt.has(f.slot)) startedAt.set(f.slot, s.now);
      if (f.status === "READY" && startedAt.has(f.slot) && !readyAt.has(f.slot)) {
        readyAt.set(f.slot, s.now);
        note(
          `slot ${f.slot} READY: ${f.name} (${f.plan}, ${f.parts} parts) after ${((s.now - startedAt.get(f.slot)) / 1000).toFixed(1)} s`,
        );
      }
    }
    await sleep(250);
  }
  // Pick frames once the phase is over (the film holds them all).
  const frames = tv.film?.frames ?? [];
  for (const [slot, at] of readyAt) {
    pickFrames(
      frames,
      [
        [at - 4000, "a-growing"],
        [at - 1500, "b-growing"],
        [at, "c-ready"],
        [at + 1500, "d-card"],
        [at + 3000, "e-sketch-beside"],
        [at + 4300, "f-dissolve"],
        [at + 5500, "g-after"],
      ],
      `r${round}-forge-slot${slot}`,
    );
  }
}

async function foundry(ctx, snapshot) {
  const { tv } = ctx;
  for (;;) {
    const s = await tv.snapshot();
    if (!s || s.gen !== snapshot.gen) return;
    if (s.foundryParked) {
      note("FOUNDRY parked: the host retries from the ⋯ menu");
      await ctx.host.tapButton("Menu");
      await ctx.host.shot("menu-retry");
      await ctx.host.tapButton("Retry the Foundry");
      await sleep(3000);
    }
    await sleep(500);
  }
}

async function roster(ctx, snapshot, dir) {
  const { tv } = ctx;
  await tv.startFilm(dir);
  const start = snapshot.now;
  for (const at of [3000, 8000, 13000]) {
    await waitServer(ctx, start + at);
    if ((await tv.snapshot())?.gen !== snapshot.gen) break;
  }
  const frames = tv.film?.frames ?? [];
  pickFrames(
    frames,
    [2, 4, 6, 8, 10, 12, 14, 16, 18].map((s) => [
      start + s * 1000,
      `t${String(s).padStart(2, "0")}`,
    ]),
    `r${snapshot.round}-roster-walkon`,
  );
}

async function waitServer(ctx, server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const s = await ctx.tv.snapshot();
    if (s && s.now >= server) return;
    await sleep(250);
  }
  throw new Error(`TV clock did not reach ${server} within 120 seconds`);
}

async function faceOff(ctx, snapshot, dir) {
  const { tv, host, guest } = ctx;
  await tv.startFilm(dir);
  // Different sides: the host backs A, the guest backs B.
  const bets = [
    [host, 0],
    [guest, 1],
  ];
  await Promise.all(
    bets.map(async ([phone, index]) => {
      if (phone.closed) return;
      const button = phone.page.getByRole("button", { name: /^Bet on/ }).nth(index);
      try {
        await button.waitFor({ state: "visible", timeout: 10_000 });
        await button.tap();
        await sleep(800);
        await phone.shot(`faceoff-r${snapshot.round}s${snapshot.step}-bet`);
      } catch (error) {
        throw new Error(`${phone.name} could not bet: ${error.message.split("\n")[0]}`);
      }
    }),
  );
  // The bettor avatars fly in; shoot the letterboxed face-off with the notes once they land.
  await sleep(2500);
  if ((await tv.snapshot())?.gen === snapshot.gen)
    await tvShot(tv, `10-faceoff-r${snapshot.round}s${snapshot.step}`);
  // Round 2: one player goes absent (their phone closes) after the first face-off.
  if (snapshot.round === 2 && snapshot.step === 1 && !guest.closed) {
    await sleep(1000);
    await guest.close();
    note("guest phone context closed (absent from here on; the game must keep going on timers)");
  }
  const frames = tv.film?.frames ?? [];
  pickFrames(
    frames,
    [
      [snapshot.now + 1500, "a"],
      [snapshot.now + 4000, "b"],
      [snapshot.now + 7000, "c"],
    ],
    `r${snapshot.round}s${snapshot.step}-faceoff`,
  );
}

async function fight(ctx, snapshot, dir) {
  const { tv } = ctx;
  let s = snapshot;
  for (let tries = 0; tries < 20 && !s.fight?.outcome && !s.fight?.decidedBySeed; tries += 1) {
    await sleep(250);
    s = (await tv.snapshot()) ?? s;
  }
  const f = s.fight;
  if (!f?.outcome) {
    note(
      `fight r${snapshot.round}s${snapshot.step}: no outcome (decidedBySeed ${f?.decidedBySeed})`,
    );
    return;
  }
  const label = `r${f.round}s${f.step}`;
  const hasRingout = f.outcome.events.some((e) => e.kind === "ringout");
  const film = FILM && ((hasRingout && !ctx.ringoutFilmed) || ctx.filmed < FILMED_FIGHTS);
  const record = {
    label,
    id: f.id,
    arena: f.arena,
    isFinal: f.isFinal,
    isThirdPlace: f.isThirdPlace,
    startsAt: f.startsAt,
    winner: f.outcome.winner,
    method: f.outcome.method,
    endMs: f.outcome.endMs,
    hash: f.outcome.hash,
    hits: f.outcome.events.filter((e) => e.kind === "hit" || e.kind === "throw").length,
    bigHits: f.outcome.events.filter((e) => e.big).length,
    notes: f.notes,
    bets: f.bets,
    filmed: film,
    events: f.outcome.events,
  };
  log.fights.push(record);
  note(
    `fight ${label} (${f.arena}${f.isFinal ? ", Final" : f.isThirdPlace ? ", third place" : ""}): ${f.outcome.method} by ${f.outcome.winner} at ${(f.outcome.endMs / 1000).toFixed(1)} s, ${record.hits} hits (${record.bigHits} big), ${film ? "filmed" : "measured clean"}`,
  );
  // Hype from the non-owners (whoever sees the Hype button).
  const hyping = Promise.all(ctx.phones.map((phone) => hype(phone, f, snapshot.gen, ctx)));
  if (film) {
    ctx.filmed += 1;
    if (hasRingout) ctx.ringoutFilmed = true;
    await tv.startFilm(dir, { everyMs: 30, maxWidth: 1920, quality: 80 });
  } else {
    await tv.stopFilm();
  }
  // Wait for the fight to play out on the TV.
  await waitServer(ctx, f.startsAt + f.outcome.endMs + 2500);
  const end = await tv.perfNow();
  record.perfEnd = end;
  await hyping;
  const frames = film ? ((await tv.stopFilm())?.frames ?? []) : [];
  if (film) {
    const wanted = [];
    let n = 0;
    for (const e of f.outcome.events) {
      if (e.kind === "ringout") {
        for (const dt of [-300, 300, 900, 1500, 2200, 3000, 4000])
          wanted.push([f.startsAt + e.t + dt, `ringout-${e.side}-${dt >= 0 ? "+" : ""}${dt}`]);
      } else if (e.kind === "ko") {
        for (const dt of [0, 600, 1500]) wanted.push([f.startsAt + e.t + dt, `ko-${dt}`]);
      } else if (e.big && n < 3) {
        n += 1;
        for (const dt of [0, 60, 140, 300, 600])
          wanted.push([f.startsAt + e.t + dt, `bighit${n}-${e.side}-+${dt}`]);
      }
    }
    if (n === 0) {
      const hit = f.outcome.events.find((e) => e.kind === "hit" || e.kind === "throw");
      if (hit)
        for (const dt of [0, 60, 140, 300]) wanted.push([f.startsAt + hit.t + dt, `hit-+${dt}`]);
    }
    wanted.push(
      [f.startsAt - 1500, "fight-slam"],
      [f.startsAt + f.outcome.endMs + 800, "end-slam"],
    );
    pickFrames(frames, wanted, `${label}-fight`);
    // Keep only the picked frames of the high-rate fight film.
    const relative = path.relative(OUT, path.resolve(dir));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Film directory must be inside the evidence directory");
    rmSync(dir, { recursive: true, force: true });
  }
}

async function hype(phone, f, gen, ctx) {
  if (phone.closed) return;
  // Wait for the fight to start on the phone (Get ready → Hype).
  await waitServer(ctx, f.startsAt + 600);
  if (phone.closed) return;
  const button = phone.page.getByRole("button", { name: /Hype!/ }).first();
  if (!(await button.isVisible().catch(() => false))) {
    await phone.shot(`fight-r${f.round}s${f.step}-owner`);
    return;
  }
  await phone.shot(`fight-r${f.round}s${f.step}-hype`);
  const until = f.startsAt + Math.min(f.outcome.endMs - 500, 12_000);
  let taps = 0;
  for (;;) {
    const s = await ctx.tv.snapshot();
    if (!s || s.gen !== gen || s.now > until || phone.closed) break;
    try {
      await button.tap({ timeout: 1000 });
      taps += 1;
    } catch {
      break;
    }
    await sleep(140);
  }
  note(`${phone.name} hyped ${taps} times in fight r${f.round}s${f.step}`);
  await phone.shot(`fight-r${f.round}s${f.step}-after-hype`);
}

async function standings(ctx, snapshot) {
  const { host } = ctx;
  if (ctx.menuDone || host.closed) return;
  ctx.menuDone = true;
  // The host's ⋯ menu: open it, take the evidence, close it.
  await sleep(1500);
  try {
    await host.tapButton("Menu");
    await sleep(700);
    await host.shot(`menu-open-r${snapshot.round}`);
    await host.page.keyboard.press("Escape");
    await sleep(500);
    if (
      await host.page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false)
    ) {
      await host.page.mouse.click(195, 60);
    }
    await sleep(500);
    await host.shot("menu-closed");
    note("host opened and closed the ⋯ menu");
  } catch (error) {
    throw new Error(`menu check failed: ${error.message.split("\n")[0]}`);
  }
}

async function upgrade(ctx, snapshot, dir) {
  const { tv, host, guest } = ctx;
  await tv.startFilm(dir);
  const round = snapshot.round;
  const tasks = [];
  if (round === 2) {
    // The drawer doodles onto the new layer; the describer writes one thing.
    tasks.push(
      (async () => {
        await host.page
          .getByRole("button", { name: /Draw it on/ })
          .first()
          .tap();
        await sleep(600);
        await host.draw(HAT_AND_SWORD);
        await host.shot("upgrade-drawn");
        await host.tapButton("Send to the Foundry");
        note("host submitted a doodle upgrade");
      })(),
    );
    if (!guest.closed) {
      tasks.push(
        (async () => {
          await guest.page
            .getByRole("button", { name: /Write it/ })
            .first()
            .tap();
          await guest.typeText(UPGRADE_TEXT[2], { label: "Add one thing" });
          await guest.shot("upgrade-typed");
          await guest.tapButton("Send to the Foundry");
          note("guest submitted a text upgrade");
        })(),
      );
    }
  } else {
    tasks.push(
      (async () => {
        await host.page
          .getByRole("button", { name: /Write it/ })
          .first()
          .tap();
        await host.typeText(UPGRADE_TEXT[3] ?? "a cape", { label: "Add one thing" });
        await host.shot("upgrade-typed");
        await host.tapButton("Send to the Foundry");
        note("host submitted a text upgrade");
      })(),
    );
  }
  const results = await Promise.allSettled(tasks);
  for (const result of results) if (result.status === "rejected") throw result.reason;
  await sleep(1500);
  await phoneShots(ctx, snapshot, "submitted");
  await forgeWatch(ctx, round);
  // The reveal ends on the ROSTER wipe: shoot it from the film (ROSTER restarts the film).
}

async function finale(ctx, chromium) {
  const { tv } = ctx;
  await tv.stopFilm();
  const finished = await waitFor(tv, (s) => s.status === "FINISHED", 120_000, "FINISHED");
  ctx.finishedAt = finished.now;
  note(`FINISHED; podium ${JSON.stringify(finished.podium)}`);
  await sleep(900);
  await phoneShots(ctx, { phase: "FINISHED", round: finished.round, step: finished.step }, "");
  for (const at of [2500, 5500, 8500]) {
    await waitServer(ctx, finished.now + at);
    await tvShot(tv, `20-podium-${at}`);
  }
  await waitServer(ctx, finished.now + 10_000);
  await measureWindow(ctx, "podium", 6000);
  await tvShot(tv, "21-podium-late");
  await phoneShots(ctx, { phase: "FINISHED", round: finished.round, step: finished.step }, "late");

  // Collect the TV's evidence before leaving the stage.
  const data = await tv.recording();
  log.timeline = data.timeline;
  log.hashes = data.hashes;
  analyzeFrames(data.frames, data.timeline);

  // The recap page, with WebGL, on the TV.
  await tv.page.goto(`${BASE}/game/${ctx.code}/recap`, { waitUntil: "domcontentloaded" });
  await sleep(12_000);
  await tvShot(tv, "30-recap-webgl");
  // The six in-canvas replay cards occupy the bottom strip at this fixed TV
  // viewport. Pick the Final, then record it after the replay has started.
  await tv.page.mouse.click(1730, 950);
  await sleep(5000);
  await tvShot(tv, "31-recap-final-replay");
  await recapWithoutWebGL(chromium, ctx.code);
}

async function recapWithoutWebGL(chromium, code) {
  const browser = await launch(chromium, NO_GL_ARGS);
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    instrument("recap-nogl", page);
    await page.goto(`${BASE}/game/${code}/recap`, { waitUntil: "domcontentloaded" });
    await sleep(8000);
    const webgl = await page.evaluate(
      () => !!document.createElement("canvas").getContext("webgl2"),
    );
    if (webgl) throw new Error("No-WebGL recap test unexpectedly has WebGL");
    await page.getByRole("heading", { name: "Fight night results", exact: true }).waitFor();
    await page.getByRole("heading", { name: /^The Final · / }).waitFor();
    const file = path.join(OUT, "tv", "32-recap-no-webgl.png");
    mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    log.shots.push({ kind: "tv", label: "recap-no-webgl", file });
    note(`recap without WebGL (webgl2 available: ${webgl}) shot`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  note(`E2E failed: ${error.stack ?? error}`);
  log.meta.endedAt = new Date().toISOString();
  log.failures.push(error.message ?? String(error));
  try {
    writeLog();
  } catch {
    // Best effort.
  }
  process.exitCode = 1;
});
