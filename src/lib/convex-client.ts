"use client";

import { ConvexReactClient } from "convex/react";

let convexClient: ConvexReactClient | undefined;

export function getConvexClient(): ConvexReactClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is required to initialize the Convex client. Run `convex dev` locally or configure the variable in the deployment environment.",
    );
  }

  convexClient ??= new ConvexReactClient(convexUrl);
  return convexClient;
}
