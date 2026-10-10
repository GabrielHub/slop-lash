import { defineConfig } from "vite-plus";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    // Convex and Rapier each load large module graphs. Bound concurrent cold
    // transforms so they do not consume the five-second test budget.
    maxWorkers: 4,
    restoreMocks: true,
  },
});
