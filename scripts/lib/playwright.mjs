// The repo has playwright-core only as a transitive dependency, so scripts
// find it in the pnpm store (or at PLAYWRIGHT_CORE).
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");

export function loadPlaywright() {
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
