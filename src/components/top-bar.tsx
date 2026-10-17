"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { ICON_BUTTON_CLASS, ThemeToggle } from "@/components/theme-provider";
import { useWarpLink } from "@/components/warp-transition";

/**
 * The slim bar on the pages around the games (home, host, join, leaderboard):
 * an optional icon-only back arrow on the left, then any extra icon actions and
 * the theme toggle on the right. It sits in the page flow, so nothing overlaps
 * the content below it. The back arrow warps, like the home page's links.
 */
export function TopBar({
  backHref,
  backLabel = "Back",
  actions,
}: {
  /** Where the back arrow goes; omit it on the home page. */
  backHref?: string;
  /** The arrow's accessible name, e.g. "Back to home". */
  backLabel?: string;
  /** Extra icon buttons placed before the theme toggle. */
  actions?: ReactNode;
}) {
  const warp = useWarpLink();
  return (
    <header className="relative z-10 flex h-14 w-full shrink-0 items-center justify-between px-[max(0.5rem,env(safe-area-inset-left))] mt-[env(safe-area-inset-top)]">
      {backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className={ICON_BUTTON_CLASS}
          onClick={warp}
          data-warp-fade
        >
          <ArrowLeftIcon />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="flex items-center gap-1" data-warp-fade>
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
