import type { ReactNode } from "react";

/** SVG crown icon used for winner badges across voting and results screens. */
export function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06l-4.23 1.14-3.47-6.22c-.42-.75-1.64-.75-2.06 0L7.01 9.72l-4.23-1.14c-.8-.22-1.63.26-1.84 1.06-.11.4-.02.82.24 1.13L5.5 15.5h13l4.32-4.73c.26-.31.35-.73.25-1.13z" />
    </svg>
  );
}

/** Stroke checkmark for selected states. */
export function CheckIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Props shared by the stroke icons below; `size` is in px. */
export interface StrokeIconProps {
  size?: number;
  className?: string;
}

export function StrokeIcon({
  size = 20,
  className,
  strokeWidth = 2.25,
  children,
}: StrokeIconProps & { strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Back arrow for the top bar. */
export function ArrowLeftIcon(props: StrokeIconProps) {
  return (
    <StrokeIcon {...props} strokeWidth={2.5}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </StrokeIcon>
  );
}

/** Downward chevron for disclosures; rotate it to show the open state. */
export function ChevronDownIcon(props: StrokeIconProps) {
  return (
    <StrokeIcon {...props} strokeWidth={2.75}>
      <polyline points="6 9 12 15 18 9" />
    </StrokeIcon>
  );
}

/** Light-mode glyph for the theme toggle. */
export function SunIcon(props: StrokeIconProps) {
  return (
    <StrokeIcon {...props} strokeWidth={2}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 1.5v2.5M12 20v2.5M4.22 4.22l1.77 1.77M18 18l1.77 1.77M1.5 12H4M20 12h2.5M4.22 19.78 6 18M18 6l1.77-1.77" />
    </StrokeIcon>
  );
}

/** Dark-mode glyph for the theme toggle. */
export function MoonIcon(props: StrokeIconProps) {
  return (
    <StrokeIcon {...props} strokeWidth={2}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </StrokeIcon>
  );
}

/** Props for the icons sized by a Tailwind `size-*` class instead of px. */
interface ClassIconProps {
  className?: string;
}

/** Fast-forward glyph for skipping a phase (filled). */
export function SkipIcon({ className = "size-5" }: ClassIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M5 5.5v13l8.5-6.5L5 5.5zm9 0v13l8.5-6.5L14 5.5z" />
    </svg>
  );
}

/** Stop square for ending the game (filled). */
export function StopIcon({ className = "size-5" }: ClassIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Two people, for the player list. */
export function PeopleIcon({ className = "size-5" }: ClassIconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </StrokeIcon>
  );
}

/** Trophy, for the results link. */
export function TrophyIcon({ className = "size-5" }: ClassIconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={2}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3" />
    </StrokeIcon>
  );
}

/** Door-and-arrow glyph for leaving the room. */
export function LeaveIcon({ className = "size-5" }: ClassIconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={2}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </StrokeIcon>
  );
}

/** Share glyph (three linked nodes). */
export function ShareIcon({ className = "size-4" }: ClassIconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={2}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.7 6.8-4.4M8.6 13.3l6.8 4.4" />
    </StrokeIcon>
  );
}

/** X mark for removing something. */
export function CrossIcon({ className = "size-4" }: ClassIconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </StrokeIcon>
  );
}

/** GitHub mark (filled). */
export function GitHubIcon({ size = 20, className }: StrokeIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
    >
      <path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z" />
    </svg>
  );
}
