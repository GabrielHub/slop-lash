"use client";

import { motion } from "motion/react";

interface PulsingDotProps {
  children: React.ReactNode;
}

export function PulsingDot({ children }: PulsingDotProps) {
  return (
    <div className="inline-flex items-center gap-2 text-ink-dim">
      <motion.div
        className="w-2 h-2 rounded-full bg-teal"
        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <p className="font-medium">{children}</p>
    </div>
  );
}
