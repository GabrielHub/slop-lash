// Run against `vp run build` + `vp run start`, not just the dev server.
// Creates one Free Play room per mode and uses normal AI credits.
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")),
);
const base = args.base ?? "http://localhost:3000";
const out = args.out ?? "output/playwright/room-start";
const layout = args.layout ?? "controller";
assert.ok(layout === "controller" || layout === "game", "Use --layout=controller or --layout=game");
const require = createRequire(import.meta.url);
const store = path.resolve("node_modules/.pnpm");
const installed = readdirSync(store).find((name) => name.startsWith("playwright-core@"));
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE ?? path.join(store, installed, "node_modules/playwright-core"),
);
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
mkdirSync(out, { recursive: true });

try {
  for (const game of (args.games ?? "SLOPFIGHT,SLOPLASH,MATCHSLOP,QUIZSLOP").split(",")) {
    console.log(`Checking ${game}`);
    const contexts = [];
    const errors = [];
    const result = { game, passed: false, errors };
    results.push(result);
    let client;
    let session;
    let backend;
    const pages = [];
    try {
      for (const role of game === "MATCHSLOP"
        ? ["host", "guest", "stage", "guest2"]
        : ["host", "guest", "stage"]) {
        const context = await browser.newContext({
          viewport: role === "stage" ? { width: 1280, height: 720 } : { width: 390, height: 844 },
          isMobile: role !== "stage",
          hasTouch: role !== "stage",
        });
        contexts.push(context);
        const page = await context.newPage();
        page.on("websocket", (socket) => {
          if (socket.url().includes(".convex.cloud"))
            backend = new URL(socket.url()).origin.replace(/^wss:/, "https:");
        });
        page.setDefaultNavigationTimeout(30_000);
        page.on("pageerror", (error) => errors.push(`${role}: ${error.stack}`));
        page.on("console", (message) => {
          // React catches render crashes, so pageerror alone misses the reported failure.
          if (
            message.type() === "error" &&
            /TypeError|ReferenceError|React error/.test(message.text())
          ) {
            errors.push(`${role}: ${message.text()}`);
          }
        });
        pages.push(page);
      }
      const [host, guest, stage, guest2] = pages;
      await host.goto(`${base}/host?game=${game}`, { waitUntil: "domcontentloaded" });
      await host.getByText(/\d+ games? left today/).waitFor();
      if (game !== "MATCHSLOP") await host.locator("#host-player-name").fill("Smoke Host");
      await host.getByRole("button", { name: "Create game", exact: true }).tap();
      console.log(`${game}: create submitted`);
      await host.screenshot({ path: path.join(out, `${game}-create.png`) });
      await host.waitForURL(/\/(controller|game|stage)\/[A-Z0-9]+/, {
        timeout: 60_000,
        waitUntil: "domcontentloaded",
      });
      const code = host.url().split("/").at(-1);
      result.code = code;
      console.log(`${game}: room ${code}`);
      session = await host.evaluate(
        (roomCode) => JSON.parse(sessionStorage.getItem(`slop-lash:room:${roomCode}`)),
        code,
      );
      // Use the public backend actually contacted by this build.
      assert.ok(backend, "The room must have contacted Convex");
      client = new ConvexHttpClient(backend);
      const room = () =>
        client.query(makeFunctionReference("views:room"), { capability: session.capability });
      await room();
      if (game !== "MATCHSLOP")
        await host.goto(`${base}/${layout}/${code}`, { waitUntil: "domcontentloaded" });
      await guest.goto(`${base}/join/${code}`, { waitUntil: "domcontentloaded" });
      await guest.waitForFunction(() => document.activeElement?.id === "join-player-name");
      await guest.getByPlaceholder("What should we call you?").fill("Smoke Guest");
      await guest.locator('button[type="submit"]').tap();
      await guest.waitForURL(/\/(controller|game)\//, {
        timeout: 60_000,
        waitUntil: "domcontentloaded",
      });
      await guest.goto(`${base}/${layout}/${code}`, { waitUntil: "domcontentloaded" });
      if (guest2) {
        await guest2.goto(`${base}/join/${code}`, { waitUntil: "domcontentloaded" });
        await guest2.waitForFunction(() => document.activeElement?.id === "join-player-name");
        await guest2.getByPlaceholder("What should we call you?").fill("Smoke Guest Two");
        await guest2.locator('button[type="submit"]').tap();
        await guest2.waitForURL(/\/(controller|game)\//, {
          timeout: 60_000,
          waitUntil: "domcontentloaded",
        });
        await guest2.goto(`${base}/${layout}/${code}`, { waitUntil: "domcontentloaded" });
      }
      await stage.goto(`${base}/stage/${code}`, { waitUntil: "domcontentloaded" });
      await host.getByRole("button", { name: "Start game", exact: true }).tap();
      for (let attempt = 0; attempt < 60; attempt++) {
        const view = await room();
        if (view.room.status === "PLAYING") {
          result.phase = view.room.phase;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.ok(result.phase, "Room did not enter PLAYING");
      for (const [index, page] of pages.entries()) {
        // Let the reactive update and outgoing scene animation finish.
        await page.waitForTimeout(1500);
        const text = await page.locator("body").innerText();
        assert.doesNotMatch(text, /Lost the room|Application error|Join this room first/);
        if (index < 2 && game === "SLOPFIGHT") {
          await page.getByRole("button", { name: /Describe it/ }).tap();
          await page.locator("textarea").fill("a tiny boxing toaster");
        }
        await page.screenshot({ path: path.join(out, `${game}-${index}-started.png`) });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page
          .getByRole("button", { name: /Menu|Mute/ })
          .first()
          .waitFor({ timeout: 30_000 });
        await page.waitForTimeout(1000);
        assert.doesNotMatch(
          await page.locator("body").innerText(),
          /Lost the room|Application error|Join this room first/,
        );
        const menu = page.getByRole("button", { name: "Menu", exact: true });
        if (await menu.first().isVisible()) {
          await menu.first().click();
          await page.getByRole("dialog", { name: "Room menu" }).waitFor();
          await page.keyboard.press("Escape");
        }
      }
      result.routes = pages.map((page) => new URL(page.url()).pathname);
      assert.equal(errors.length, 0, errors.join("\n"));
      result.passed = true;
    } catch (error) {
      result.failure = error.stack;
      result.screens = await Promise.all(
        pages.map((page) =>
          page
            .locator("body")
            .innerText()
            .catch(() => "unavailable"),
        ),
      );
    } finally {
      if (client && session) {
        await client
          .mutation(makeFunctionReference("engine:end"), { capability: session.capability })
          .catch((error) => {
            result.cleanupError = error.message;
          });
      }
      await Promise.all(contexts.map((context) => context.close()));
    }
    console.log(JSON.stringify(result));
    writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
  }
} finally {
  await browser.close();
}
if (results.some((result) => !result.passed || result.cleanupError || result.errors.length))
  process.exitCode = 1;
