/** SVG crown icon used for winner badges across voting and results screens. */
export function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06l-4.23 1.14-3.47-6.22c-.42-.75-1.64-.75-2.06 0L7.01 9.72l-4.23-1.14c-.8-.22-1.63.26-1.84 1.06-.11.4-.02.82.24 1.13L5.5 15.5h13l4.32-4.73c.26-.31.35-.73.25-1.13z" />
    </svg>
  );
}

/** SVG skull/robot icon for "Lost to the slop" stamps. */
export function SlopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12v4c0 1.1.9 2 2 2h1v-2c0-.55.45-1 1-1s1 .45 1 1v2h2v-2c0-.55.45-1 1-1s1 .45 1 1v2h2v-2c0-.55.45-1 1-1s1 .45 1 1v2h2v-2c0-.55.45-1 1-1s1 .45 1 1v2h1c1.1 0 2-.9 2-2v-4c0-5.52-4.48-10-10-10zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  );
}
