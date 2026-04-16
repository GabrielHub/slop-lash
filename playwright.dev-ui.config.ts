import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "output/playwright/artifacts",
  reporter: [["list"]],
  testDir: "./src/dev/game-fixtures",
  testMatch: ["**/*.spec.ts"],
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
