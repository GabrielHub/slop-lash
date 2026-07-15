import { ConvexError } from "convex/values";

const CONVEX_ERROR_PREFIX = /(?:Uncaught )?ConvexError:\s*/u;

export function getConvexErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    const message = error.data.trim();
    if (message) return message;
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      const prefixMatch = CONVEX_ERROR_PREFIX.exec(message);
      if (prefixMatch) {
        const detail = message.slice(prefixMatch.index + prefixMatch[0].length).split("\n", 1)[0];
        if (detail?.trim()) return detail.trim();
      }
      return message;
    }
  }

  return fallback;
}
