import { motion } from "motion/react";
import { scaleIn } from "@/lib/animations";

interface VsDividerProps {
  /** Text size class for the "VS" label. Defaults to "text-xs lg:text-lg". */
  textSize?: string;
  /** Whether to animate entry with scaleIn variant. */
  animated?: boolean;
}

/**
 * Horizontal (mobile) / vertical (desktop) "VS" divider used between
 * two response cards in the voting flow.
 */
export function VsDivider({
  textSize = "text-xs lg:text-lg",
  animated = false,
}: VsDividerProps) {
  const Wrapper = animated ? motion.div : "div";
  const wrapperProps = animated
    ? { variants: scaleIn, initial: "hidden" as const, animate: "visible" as const }
    : {};

  return (
    <Wrapper
      className="flex lg:flex-col items-center justify-center gap-3 py-1 lg:py-0"
      {...wrapperProps}
    >
      <div className="h-px lg:h-auto lg:w-px flex-1 bg-edge" />
      <span className={`font-display font-black text-ink-dim/40 tracking-[0.3em] ${textSize}`}>
        VS
      </span>
      <div className="h-px lg:h-auto lg:w-px flex-1 bg-edge" />
    </Wrapper>
  );
}
