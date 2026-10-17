"use client";

import Image from "next/image";
import type { ModelInfo } from "@/lib/models";
import { useTheme } from "@/components/theme-provider";

export function ModelIcon({
  model,
  size = 22,
  className = "",
}: {
  model: ModelInfo;
  size?: number;
  className?: string;
}) {
  const { theme } = useTheme();

  return (
    <Image
      src={model.icon}
      alt={model.name}
      width={size}
      height={size}
      className={`rounded-sm ${className}`}
      style={model.invertOnDark && theme === "dark" ? { filter: "invert(1)" } : undefined}
    />
  );
}
