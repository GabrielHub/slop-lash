"use client";

import type { ReactNode } from "react";
import { PulsingDot } from "@/components/pulsing-dot";

/**
 * A phone screen's frame. Status and payoff screens sit at the bottom, in the
 * thumb zone; the writer sits at the top so the keyboard never covers Send.
 */
export function PhoneScreen({
  children,
  anchor = "bottom",
  className = "",
}: {
  children: ReactNode;
  anchor?: "top" | "bottom" | "center";
  className?: string;
}) {
  const justify =
    anchor === "top" ? "justify-start" : anchor === "center" ? "justify-center" : "justify-end";
  return (
    <div
      className={`flex min-h-full flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${justify} ${className}`}
    >
      {children}
    </div>
  );
}

/** "Eyes on the TV": the one thing to do when the phone has nothing to ask. */
export function EyesOnTv({ subline }: { subline?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-8 text-center" role="status">
      <PulsingDot>
        <span className="font-display text-2xl font-bold text-ink">Eyes on the TV</span>
      </PulsingDot>
      {subline && <p className="text-base text-ink-dim">{subline}</p>}
    </div>
  );
}

/** A phone screen with nothing to ask: just "Eyes on the TV". */
export function WaitingScreen({ subline }: { subline?: string }) {
  return (
    <PhoneScreen>
      <EyesOnTv subline={subline} />
    </PhoneScreen>
  );
}
