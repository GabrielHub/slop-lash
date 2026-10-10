import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FILM, OUT, PHONE, PHONE_UA, log, note, sleep } from "./config.mjs";

// ---------------------------------------------------------------------------
// Instrumentation: console, page errors, network errors, Convex mutations
// ---------------------------------------------------------------------------

const SECRET_KEYS = new Set(["capability", "hostSecret", "token", "secret"]);

/** Mutation args without capabilities, with long arrays summarized. */
function redact(value, depth = 0) {
  if (Array.isArray(value)) {
    if (value.length > 12) return `[${value.length} items]`;
    return value.map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEYS.has(key)) out[key] = "<redacted>";
      else if (key === "strokes" && Array.isArray(item)) out[key] = `[${item.length} strokes]`;
      else out[key] = depth > 4 ? "…" : redact(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 160) return `${value.slice(0, 160)}…`;
  return value;
}

export function instrument(name, page) {
  const pending = new Map();
  const bundleChecks = [];
  page.on("console", (message) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;
    log.console.push({ ctx: name, type, at: Date.now(), text: message.text().slice(0, 600) });
  });
  page.on("pageerror", (error) =>
    log.console.push({
      ctx: name,
      type: "pageerror",
      at: Date.now(),
      text: String(error).slice(0, 600),
    }),
  );
  page.on("crash", () => log.failures.push(`${name}: browser page crashed`));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    // Navigations away abort in-flight media and RSC fetches; keep them, flagged.
    log.network.push({
      ctx: name,
      at: Date.now(),
      url: request.url().slice(0, 300),
      error: failure,
      aborted: failure.includes("ERR_ABORTED"),
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      log.network.push({
        ctx: name,
        at: Date.now(),
        url: response.url().slice(0, 300),
        status: response.status(),
      });
    if (
      (name === "host" || name === "guest") &&
      response.request().resourceType() === "script" &&
      response.ok()
    ) {
      bundleChecks.push(
        response
          .text()
          .then((source) => {
            const heavy = /WebGLRenderer|rapier_wasm3d|THREE\.REVISION/.test(source);
            log.bundles.push({ ctx: name, url: response.url(), heavy });
          })
          .catch((error) => {
            log.failures.push(
              `Could not inspect ${name}'s script ${response.url()}: ${error.message}`,
            );
          }),
      );
    }
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (typeof payload !== "string" || !payload.includes('"udfPath"')) return;
      try {
        const message = JSON.parse(payload);
        if (message.type !== "Mutation" && message.type !== "Action") return;
        const entry = {
          ctx: name,
          at: Date.now(),
          kind: message.type,
          fn: message.udfPath,
          args: redact(message.args?.[0] ?? null),
          ok: null,
        };
        pending.set(message.requestId, entry);
        log.mutations.push(entry);
      } catch {
        // Not JSON.
      }
    });
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string" || !payload.includes("Response")) return;
      try {
        const message = JSON.parse(payload);
        if (message.type !== "MutationResponse" && message.type !== "ActionResponse") return;
        const entry = pending.get(message.requestId);
        if (!entry) return;
        pending.delete(message.requestId);
        entry.ok = message.success === true;
        entry.ms = Date.now() - entry.at;
        if (!entry.ok)
          entry.error = String(message.result ?? message.errorMessage ?? "").slice(0, 300);
      } catch {
        // Not JSON.
      }
    });
  });
  return () => Promise.all(bundleChecks);
}

// ---------------------------------------------------------------------------
// The TV: room view, frame log, filming
// ---------------------------------------------------------------------------

/** Installed before any page script on the TV: a rAF frame log and a room-view timeline. */
export function tvInitScript() {
  const frames = new Float64Array(1_200_000);
  const state = { frames, count: 0, timeline: [], lastKey: "" };
  window.__e2e = state;
  const tick = (t) => {
    if (state.count < frames.length) frames[state.count++] = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setInterval(() => {
    const stage = window.__slopfightStage;
    if (!stage?.view) return;
    const { room } = stage.view;
    const mode = stage.view.mode;
    const fighters =
      mode?.kind === "SLOPFIGHT"
        ? mode.fighters.map((f) => `${f.slot}:${f.status}:${f.version}`).join(",")
        : "";
    const key = [
      room.status,
      room.phase,
      room.round,
      room.step,
      room.phaseGeneration,
      fighters,
    ].join("|");
    if (key === state.lastKey) return;
    state.lastKey = key;
    state.timeline.push({
      server: stage.serverNow(),
      perf: performance.now(),
      status: room.status,
      phase: room.phase,
      round: room.round,
      step: room.step,
      gen: room.phaseGeneration,
      phaseStartedAt: room.phaseStartedAt,
      phaseDeadline: room.phaseDeadline,
      fighters,
    });
  }, 50);
}

/** A compact snapshot of the TV's room view (evaluated in the TV page). */
function tvSnapshot() {
  const stage = window.__slopfightStage;
  if (!stage?.view) return null;
  const { room, players } = stage.view;
  const mode = stage.view.mode;
  const sf = mode?.kind === "SLOPFIGHT" ? mode : null;
  const fight = sf?.fights.find((f) => f.id === sf.currentFightId) ?? null;
  return {
    now: stage.serverNow(),
    offset: stage.clockOffsetMs,
    perf: performance.now(),
    timeOrigin: performance.timeOrigin,
    code: room.code,
    status: room.status,
    phase: room.phase,
    round: room.round,
    step: room.step,
    gen: room.phaseGeneration,
    phaseStartedAt: room.phaseStartedAt,
    phaseDeadline: room.phaseDeadline,
    players: players.map((p) => ({ id: p.id, name: p.name, online: p.online, isHost: p.isHost })),
    arenas: sf?.arenas ?? [],
    foundryParked: sf?.foundryParked ?? false,
    fighters: (sf?.fighters ?? []).map((f) => ({
      id: f.id,
      slot: f.slot,
      ownerId: f.ownerId,
      status: f.status,
      inputKind: f.inputKind,
      version: f.version,
      name: f.champion?.name ?? null,
      plan: f.champion?.bodyPlan ?? null,
      parts: f.champion?.parts?.length ?? null,
      failure: f.failure,
    })),
    fight: fight && {
      id: fight.id,
      round: fight.round,
      step: fight.step,
      a: fight.a,
      b: fight.b,
      arena: fight.arena,
      isFinal: fight.isFinal,
      isThirdPlace: fight.isThirdPlace,
      limitMs: fight.limitMs,
      matchup: fight.matchup,
      notes: fight.notes.length,
      walkOn: fight.walkOn !== null,
      bets: fight.bets,
      hype: fight.hype,
      startsAt: fight.startsAt,
      decidedBySeed: fight.decidedBySeed,
      outcome: fight.outcome && {
        winner: fight.outcome.winner,
        method: fight.outcome.method,
        endMs: fight.outcome.endMs,
        hash: fight.outcome.hash,
        health: fight.outcome.health,
        events: fight.outcome.events
          .filter((e) =>
            ["contact", "hit", "throw", "ringout", "ko", "edge", "suddenDeath", "end"].includes(
              e.kind,
            ),
          )
          .map((e) => ({
            t: e.t,
            kind: e.kind,
            side: e.side,
            big: e.big === true,
            damage: e.damage ?? null,
          })),
      },
    },
    standings: sf?.standings ?? [],
    podium: sf?.podium ?? null,
  };
}

export class Tv {
  constructor(page, cdp) {
    this.page = page;
    this.cdp = cdp;
    this.film = null;
    cdp.on("Page.screencastFrame", (frame) => this.onFrame(frame));
  }

  snapshot() {
    if (this.page.url().startsWith("chrome-error:"))
      throw new Error("TV navigated to a browser error page");
    return this.evaluate(tvSnapshot);
  }

  perfNow() {
    return this.evaluate(() => performance.now());
  }

  async evaluate(callback) {
    let timer;
    try {
      return await Promise.race([
        this.page.evaluate(callback),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("TV evaluation timed out after 15 seconds")),
            15_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  recording() {
    return this.evaluate(() => ({
      frames: Array.from(window.__e2e.frames.subarray(0, window.__e2e.count)),
      timeline: window.__e2e.timeline,
      hashes: window.__slopfightHashes ?? {},
      timeOrigin: performance.timeOrigin,
    }));
  }

  /** Start saving screencast frames into `dir` (at most one per `everyMs`). */
  async startFilm(dir, { everyMs = 250, maxWidth = 1280, quality = 70 } = {}) {
    if (!FILM) return;
    await this.stopFilm();
    mkdirSync(dir, { recursive: true });
    const capture = { from: await this.perfNow(), to: null, kind: "film", label: dir };
    log.captures.push(capture);
    this.film = { dir, everyMs, frames: [], capture };
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality,
      maxWidth,
      maxHeight: Math.round((maxWidth * 9) / 16),
      everyNthFrame: 1,
    });
  }

  async stopFilm() {
    const film = this.film;
    if (!film) return null;
    this.film = null;
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    film.capture.to = await this.perfNow();
    return film;
  }

  onFrame({ data, metadata, sessionId }) {
    const film = this.film;
    const ack = () => this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    if (!film) return void ack();
    const wall = metadata?.timestamp ? Math.round(metadata.timestamp * 1000) : Date.now();
    const server = wall + (this.offset ?? 0);
    const file = path.join(film.dir, `${server}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    film.frames.push({ server, file });
    // Delaying the ack caps the frame rate, which keeps the encoder's cost low.
    setTimeout(ack, film.everyMs);
  }
}

/** Copy the film frame nearest each server time into moments/. */
export function pickFrames(frames, wanted, label) {
  if (!frames || frames.length === 0) return [];
  const picked = [];
  mkdirSync(path.join(OUT, "moments"), { recursive: true });
  for (const [server, tag] of wanted) {
    let best = null;
    for (const frame of frames)
      if (!best || Math.abs(frame.server - server) < Math.abs(best.server - server)) best = frame;
    if (!best || Math.abs(best.server - server) > 1500) continue;
    const out = path.join(OUT, "moments", `${label}-${tag}.jpg`);
    copyFileSync(best.file, out);
    picked.push(out);
    log.shots.push({ kind: "moment", label: `${label}-${tag}`, file: out, server: best.server });
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Frame statistics
// ---------------------------------------------------------------------------

export function frameStats(times) {
  if (times.length < 3) return null;
  const deltas = [];
  for (let index = 1; index < times.length; index += 1)
    deltas.push(times[index] - times[index - 1]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const pick = (q) =>
    +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(2);
  const span = times.at(-1) - times[0];
  return {
    frames: deltas.length,
    seconds: +(span / 1000).toFixed(2),
    fps: +((1000 * deltas.length) / span).toFixed(1),
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max: +sorted.at(-1).toFixed(2),
    over33: deltas.filter((d) => d > 33.4).length,
    over50: deltas.filter((d) => d > 50).length,
  };
}

export function framesBetween(all, from, to) {
  const out = [];
  for (const t of all) if (t >= from && t <= to) out.push(t);
  return out;
}

// ---------------------------------------------------------------------------
// Phones
// ---------------------------------------------------------------------------

class Phone {
  constructor(name, context, page, cdp, checkBundles) {
    this.name = name;
    this.context = context;
    this.page = page;
    this.cdp = cdp;
    this.checkBundles = checkBundles;
    this.closed = false;
    this.shotCount = 0;
  }

  async shot(label) {
    if (this.closed) return null;
    this.shotCount += 1;
    const file = path.join(
      OUT,
      "phones",
      `${this.name}-${String(this.shotCount).padStart(2, "0")}-${label}.png`,
    );
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      await this.page.screenshot({ path: file });
      log.shots.push({ kind: "phone", ctx: this.name, label, file, at: Date.now() });
      return file;
    } catch (error) {
      note(`${this.name} screenshot failed: ${error.message.split("\n")[0]}`);
      return null;
    }
  }

  /** Tap the button with this accessible name if it is there. */
  async tapButton(name, { timeout = 10_000 } = {}) {
    const button = this.page.getByRole("button", { name, exact: typeof name === "string" }).first();
    await button.waitFor({ state: "visible", timeout });
    await button.tap();
  }

  async visible(name, timeout = 0) {
    const button = this.page.getByRole("button", { name }).first();
    try {
      if (timeout) await button.waitFor({ state: "visible", timeout });
      return await button.isVisible();
    } catch {
      return false;
    }
  }

  /** Draw strokes on the canvas with synthesized touch drags (pointerType touch). */
  async draw(strokes, { onHalf } = {}) {
    const canvas = this.page.getByLabel("Drawing canvas");
    await canvas.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForFunction(
      () => {
        const element = document.querySelector('canvas[aria-label="Drawing canvas"]');
        return element && !element.className.includes("opacity-60");
      },
      null,
      { timeout: 20_000 },
    );
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    let ink = null;
    for (let index = 0; index < strokes.length; index += 1) {
      const stroke = strokes[index];
      if (stroke.ink !== ink) {
        await this.tapButton(stroke.ink);
        ink = stroke.ink;
        await canvas.scrollIntoViewIfNeeded();
      }
      const at = (point) => ({
        x: box.x + point[0] * box.width,
        y: box.y + point[1] * box.height,
        id: 1,
        radiusX: 4,
        radiusY: 4,
        force: 0.5,
      });
      const [first, ...rest] = stroke.points;
      await this.cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [at(first)],
      });
      for (const point of rest) {
        await this.cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [at(point)],
        });
        await sleep(6);
      }
      await this.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(90);
      if (onHalf && index === Math.floor(strokes.length / 2)) await onHalf();
    }
  }

  /** Type into the describe box like a person (one key at a time). */
  async typeText(text, { label, onHalf } = {}) {
    const box = this.page.getByRole("textbox", { name: label });
    await box.waitFor({ state: "visible", timeout: 20_000 });
    await box.tap();
    const half = Math.floor(text.length / 2);
    await box.pressSequentially(text.slice(0, half), { delay: 70 });
    if (onHalf) await onHalf();
    await box.pressSequentially(text.slice(half), { delay: 70 });
  }

  async close() {
    if (this.closed) return;
    await this.checkBundles();
    this.closed = true;
    await this.context.close();
  }
}

export async function newPhone(browser, name) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: PHONE_UA,
  });
  const page = await context.newPage();
  const checkBundles = instrument(name, page);
  const cdp = await context.newCDPSession(page);
  return new Phone(name, context, page, cdp, checkBundles);
}
