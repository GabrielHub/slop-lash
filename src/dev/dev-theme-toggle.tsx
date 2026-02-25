"use client";

import { useTheme } from "@/components/theme-provider";

export function DevThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className="shrink-0 rounded-md border border-edge px-3 py-2 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
