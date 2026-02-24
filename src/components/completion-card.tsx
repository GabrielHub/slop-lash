"use client";

import { motion } from "motion/react";
import { popIn } from "@/lib/animations";

interface CompletionCardProps {
  title: string;
  subtitle: string;
}

export function CompletionCard({ title, subtitle }: CompletionCardProps) {
  return (
    <motion.div
      key="all-done"
      className="text-center py-12"
      variants={popIn}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-win-soft/80 backdrop-blur-sm border-2 border-win/30 flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-win"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p className="font-display text-xl font-bold text-win mb-1">{title}</p>
      <p className="text-ink-dim text-sm">{subtitle}</p>
    </motion.div>
  );
}
