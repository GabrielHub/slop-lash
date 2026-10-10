interface PulsingDotProps {
  children: React.ReactNode;
}

/** A status line with a softly pulsing dot: the one "waiting" indicator on a screen. */
export function PulsingDot({ children }: PulsingDotProps) {
  return (
    <div className="inline-flex items-center gap-2 text-ink-dim">
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-teal animate-soft-pulse"
        aria-hidden="true"
      />
      <p className="font-medium">{children}</p>
    </div>
  );
}
