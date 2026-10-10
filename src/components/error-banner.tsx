"use client";

import { motion, AnimatePresence } from "motion/react";
import { collapse } from "@/lib/animations";

interface ErrorBannerProps {
  error: string | null;
  className?: string;
}

/** A readable mutation error that opens and closes in place. */
export function ErrorBanner({ error, className = "mb-4" }: ErrorBannerProps) {
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.div
          role="alert"
          className={`overflow-hidden rounded-xl border-2 border-fail/30 bg-fail-soft text-center text-sm font-medium text-fail ${className}`}
          variants={collapse}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <p className="px-4 py-3">{error}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
