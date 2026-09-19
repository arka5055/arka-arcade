#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_WEB = join(ROOT, "dist-web");
const PWA_RELEASE = join(ROOT, ".pwa-release");
const DIST = join(ROOT, "dist");
const VERCEL_OUT = join(ROOT, ".vercel", "output");
const VERCEL_STATIC = join(VERCEL_OUT, "static");

function hasIndex(dir) {
  return existsSync(join(dir, "index.html"));
}

function copyDir(from, to) {
  const src = resolve(from);
  const dest = resolve(to);
  if (src === dest) return;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function expoExport() {
  const env = {
    ...process.env,
    CI: process.env.CI || "1",
    EXPO_NO_TELEMETRY: "1",
    EXPO_NO_DOTENV: "1",
  };
  const result = spawnSync(
    "npx",
    ["expo", "export", "--platform", "web", "--output-dir", DIST_WEB],
    { cwd: ROOT, stdio: "inherit", env },
  );
  if (result.status !== 0) {
    throw new Error(`expo export failed with status ${result.status ?? "null"}`);
  }
  if (!hasIndex(DIST_WEB)) {
    throw new Error("expo export finished without index.html");
  }
}

if (hasIndex(PWA_RELEASE) && !hasIndex(DIST_WEB)) {
  copyDir(PWA_RELEASE, DIST_WEB);
}

if (!hasIndex(DIST_WEB)) {
  expoExport();
}

copyDir(DIST_WEB, DIST);

rmSync(join(VERCEL_OUT, "functions"), { recursive: true, force: true });
rmSync(VERCEL_STATIC, { recursive: true, force: true });
mkdirSync(VERCEL_STATIC, { recursive: true });
cpSync(DIST_WEB, VERCEL_STATIC, { recursive: true });

writeFileSync(
  join(VERCEL_OUT, "config.json"),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/service-worker.js",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
          continue: true,
        },
        {
          src: "/manifest.json",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
          continue: true,
        },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`[skyline] built static PWA from ${DIST_WEB}`);
