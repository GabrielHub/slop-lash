// Captures frames of a how-to-play tutorial from a running dev server, for
// review without watching it in real time.
//
//   node scripts/tutorials/frames.mjs <game> [times...] [--every 2] [--out dir]
//        [--sheet] [--theme dark|light] [--width 960] [--base http://localhost:3000]
//        [--no-captions] [--no-ambient] [--query live=4] [--preview]
//
// <game> is the slug (sloplash, matchslop, quizslop, slopfight). Times are
// seconds; --every samples the whole tutorial. --sheet also writes one
// contact sheet (sheet.png) with every frame labelled by its time.
// --no-ambient hides the page's live background, which runs on the wall
// clock, so two captures of the same code match pixel for pixel.
// --preview captures the game's host-page preview spot (/dev/previews)
// instead of its tutorial; try --width 336 for the size the host page shows.

import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadPlaywright } from "../lib/playwright.mjs";

const { chromium } = loadPlaywright();

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
};
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
};

const base = option("base", "http://localhost:3000");
const out = path.resolve(option("out", "output/tutorial-frames"));
const theme = option("theme", "dark");
const width = Number(option("width", "960"));
const every = option("every", null);
const sheet = flag("sheet");
const captions = !flag("no-captions");
const ambient = !flag("no-ambient");
// Extra page parameters, e.g. `--query live=4` for a pretend lobby.
const query = option("query", "");
const preview = flag("preview");
const [game, ...rest] = args;
if (!game) {
  console.error("Usage: node scripts/tutorials/frames.mjs <game> [times...] [--every 2]");
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=default", "--enable-gpu-rasterization"] });
const page = await browser.newPage({
  viewport: { width, height: Math.round((width * 9) / 16) },
});
await page.addInitScript((value) => {
  localStorage.setItem("theme", value);
}, theme);
// A scene that throws never becomes ready; say why instead of waiting out the timeout.
let failed = null;
const pageError = new Promise((resolve) => {
  page.on("pageerror", (error) => {
    failed ??= error;
    resolve();
  });
});
const url = preview
  ? `${base}/dev/previews?game=${game}&t=0`
  : `${base}/how-to-play/${game}?t=0${captions ? "" : "&captions=0"}`;
await page.goto(`${url}${query ? `&${query}` : ""}`);
await Promise.race([
  page.waitForSelector("[data-tutorial-ready]", { timeout: 120_000 }),
  pageError,
]);
if (failed) {
  console.error(`The ${game} scene threw: ${failed.message}`);
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => document.fonts.ready);
// Hide the page's own controls so frames show only the board.
await page.addStyleTag({
  content: `[data-tutorial-controls] { display: none !important; }${ambient ? "" : " .ambient { visibility: hidden !important; }"}`,
});

const duration = await page.evaluate(() => {
  const ms = Number(document.querySelector("[data-tutorial-duration]")?.getAttribute("data-tutorial-duration"));
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : null;
});
let times = rest.map(Number).filter(Number.isFinite);
if (every) {
  const step = Number(every);
  const end = duration ?? 90;
  for (let t = 0; t <= end + 0.001; t += step) times.push(Math.round(t * 100) / 100);
}
times = [...new Set(times)].sort((a, b) => a - b);

const files = [];
for (const t of times) {
  await page.evaluate((time) => {
    window.__tutorial?.seek(time);
    window.__preview?.(time);
  }, t);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const file = path.join(out, `${game}-${t.toFixed(2).padStart(6, "0")}.png`);
  await page.screenshot({ path: file });
  files.push({ t, file });
  console.log(file);
}

if (sheet && files.length > 0) {
  const columns = Math.min(4, files.length);
  const cell = 480;
  const sheetPage = await browser.newPage({ viewport: { width: columns * cell, height: 400 } });
  const cells = files
    .map(({ t, file }) => {
      const data = readFileSync(file).toString("base64");
      return `<figure><img src="data:image/png;base64,${data}"><figcaption>${t.toFixed(2)}s</figcaption></figure>`;
    })
    .join("");
  await sheetPage.setContent(
    `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${columns},${cell}px)}figure{margin:0;position:relative}img{width:${cell}px;display:block}figcaption{position:absolute;left:6px;top:6px;background:#000c;color:#fff;font:600 14px system-ui;padding:2px 6px;border-radius:4px}</style>${cells}`,
  );
  const sheetFile = path.join(out, `${game}-sheet.png`);
  await sheetPage.screenshot({ path: sheetFile, fullPage: true });
  console.log(sheetFile);
}

await browser.close();
