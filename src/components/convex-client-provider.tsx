"use client";

import type { ReactNode } from "react";
import { ConvexProvider } from "convex/react";
import { getConvexClient } from "@/lib/convex-client";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={getConvexClient()}>{children}</ConvexProvider>;
}
