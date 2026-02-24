"use client";

import { motion, AnimatePresence } from "motion/react";
import { collapseExpand } from "@/lib/animations";

interface ErrorBannerProps {
  error: string;
  className?: string;
}

export function ErrorBanner({ error, className = "mb-4" }: ErrorBannerProps) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          className={`px-4 py-3 rounded-xl bg-fail-soft/80 backdrop-blur-sm border-2 border-fail/30 text-fail text-sm text-center font-medium ${className}`}
          variants={collapseExpand}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {error}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
