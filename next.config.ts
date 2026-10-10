import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // AGENTS.md is the canonical agent guide; keep next dev from appending its own block.
  agentRules: false,
  turbopack: {
    root: configDir,
  },
};

export default nextConfig;
