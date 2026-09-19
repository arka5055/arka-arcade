#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "arcade", "skyline");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const child = spawn(
  "npx",
  ["expo", "export", "--platform", "web", "--output-dir", OUT],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: "1",
      EXPO_PUBLIC_BASE_URL: "/skyline",
    },
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
