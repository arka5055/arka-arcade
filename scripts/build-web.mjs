#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_WEB = join(ROOT, "dist-web");
const PWA_RELEASE = join(ROOT, ".pwa-release");
const DIST = join(ROOT, "dist");
const VERCEL_OUT = join(ROOT, ".vercel", "output");
const VERCEL_STATIC = join(VERCEL_OUT, "static");

function exportIfNeeded() {
  const source = existsSync(join(PWA_RELEASE, "index.html"))
    ? PWA_RELEASE
    : existsSync(join(DIST_WEB, "index.html"))
      ? DIST_WEB
      : null;
  if (source) return source;
  const result = spawnSync(
    "npx",
    ["expo", "export", "--platform", "web", "--output-dir", DIST_WEB],
    { cwd: ROOT, stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) {
    throw new Error("expo export failed");
  }
  return DIST_WEB;
}

function copyDir(from, to) {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

const source = exportIfNeeded();
copyDir(source, DIST_WEB);
copyDir(source, DIST);

rmSync(VERCEL_OUT, { recursive: true, force: true });
mkdirSync(VERCEL_STATIC, { recursive: true });
cpSync(source, VERCEL_STATIC, { recursive: true });

writeFileSync(
  join(VERCEL_OUT, "config.json"),
  JSON.stringify(
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
  ),
);

writeFileSync(
  join(ROOT, "vercel.json"),
  JSON.stringify(
    {
      outputDirectory: "dist-web",
      rewrites: [{ source: "/(.*)", destination: "/index.html" }],
      headers: [
        {
          source: "/service-worker.js",
          headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
        },
      ],
    },
    null,
    2,
  ),
);

console.log(`[skyline] built static PWA from ${source}`);
