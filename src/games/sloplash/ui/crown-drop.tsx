"use client";

import { AnimatePresence, motion } from "motion/react";
import { CrownIcon } from "@/components/icons";
import { SPRING, TRAVEL } from "@/lib/animations";

/**
 * A crown that slams down onto whatever it sits on. It has its own presence,
 * so a scene mounted with initial={false} still drops it in.
 */
export function CrownDrop({
  show,
  reduced,
  className,
  iconClassName,
  squash = false,
}: {
  show: boolean;
  reduced: boolean;
  /** Where it sits, relative to its positioned parent. */
  className: string;
  /** The icon's size (and tilt). */
  iconClassName: string;
  /** Drops from 1.2x, for a crown landing on a big card. */
  squash?: boolean;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          key="crown"
          aria-hidden="true"
          className={className}
          initial={
            reduced ? false : { y: -TRAVEL.stage, opacity: 0, ...(squash ? { scale: 1.2 } : {}) }
          }
          animate={{ y: 0, opacity: 1, ...(squash ? { scale: 1 } : {}) }}
          transition={SPRING.slam}
        >
          <CrownIcon className={`${iconClassName} text-gold`} />
        </motion.span>
      )}
    </AnimatePresence>
  );
}
