"use client";

import Image from "next/image";
import { AIModel, getModelIconForTheme } from "@/lib/models";
import { useTheme } from "@/components/theme-provider";

export function ModelIcon({
  model,
  size = 22,
  className = "",
}: {
  model: AIModel;
  size?: number;
  className?: string;
}) {
  const { theme } = useTheme();

  return (
    <Image
      src={getModelIconForTheme(model, theme)}
      alt={model.name}
      width={size}
      height={size}
      className={`rounded-sm ${className}`}
      style={
        model.iconDark && theme === "dark"
          ? { filter: "invert(1)" }
          : undefined
      }
    />
  );
}
