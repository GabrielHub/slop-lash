import { execFileSync } from "node:child_process";

const TARGETS = ["src/app", "src/components"];

// Catch Tailwind palette colors that bypass the theme token system.
// This intentionally ignores semantic tokens (punch/teal/gold/ink/etc.).
const PATTERN =
  String.raw`\b(?:text|bg|border|from|to|via|ring|stroke|fill)-(?:white|black|gray|zinc|slate|neutral|stone|red|orange|amber|yellow|lime|green|emerald|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-|\/|\b)`;

// Minimal allowlist for intentional high-contrast utility usage.
// Keep this small so new hardcoded colors fail by default.
const ALLOWLIST = [
  /src[\\/]+app[\\/]+page\.tsx:.*text-white/,
  /src[\\/]+app[\\/]+leaderboard[\\/]+page\.tsx:.*text-white/,
  /src[\\/]+app[\\/]+host[\\/]+page\.tsx:.*text-white/,
  /src[\\/]+app[\\/]+join[\\/]+page\.tsx:.*text-white/,
  /src[\\/]+app[\\/]+game[\\/]+\[code\][\\/]+lobby\.tsx:.*text-white/,
  /src[\\/]+app[\\/]+game[\\/]+\[code\][\\/]+results\.tsx:.*text-white/,
  /src[\\/]+app[\\/]+game[\\/]+\[code\][\\/]+writing\.tsx:.*text-white/,
  /src[\\/]+app[\\/]+game[\\/]+\[code\][\\/]+writing\.tsx:.*border-white\/30.*border-t-white/,
  /src[\\/]+app[\\/]+game[\\/]+\[code\][\\/]+voting\.tsx:.*text-white/,
];

let output = "";
try {
  output = execFileSync("rg", ["-n", "-e", PATTERN, ...TARGETS], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
} catch (error) {
  // rg exits with code 1 when no matches are found.
  if (error.status === 1) {
    process.exit(0);
  }
  throw error;
}

const violations = output
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((line) => !ALLOWLIST.some((pattern) => pattern.test(line)));

if (violations.length > 0) {
  console.error("Found non-token Tailwind color classes in app/components:");
  console.error(violations.join("\n"));
  console.error(
    "\nUse theme tokens from src/app/globals.css (e.g. text-ink, bg-surface, text-punch) unless intentionally exempt."
  );
  console.error("If a white/black utility is truly intentional, add a narrow allowlist entry in scripts/check-theme-colors.mjs.");
  process.exit(1);
}
