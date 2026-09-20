#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCatalog, vercelFallbackRoutes, vercelRewrites } from "./arcade-catalog.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCADE = join(ROOT, "arcade");
const SKYLINE = join(ARCADE, "skyline");
const DIST_WEB = join(ROOT, "dist-web");
const DIST = join(ROOT, "dist");
const VERCEL_OUT = join(ROOT, ".vercel", "output");
const VERCEL_STATIC = join(VERCEL_OUT, "static");

function copyDir(from, to) {
  const src = resolve(from);
  const dest = resolve(to);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (name.startsWith("qa-") || name === ".git" || name === "skyline") continue;
    cpSync(join(src, name), join(dest, name), { recursive: true });
  }
}

function copyInto(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (name.startsWith("qa-") || name === ".git") continue;
    cpSync(join(from, name), join(to, name), { recursive: true });
  }
}

function ensureSkyline() {
  if (existsSync(join(SKYLINE, "index.html"))) return;
  const result = spawnSync("node", [join(ROOT, "scripts", "export-skyline.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, EXPO_PUBLIC_BASE_URL: "/skyline", EXPO_NO_TELEMETRY: "1" },
  });
  if (result.status !== 0) {
    throw new Error("Skyline Signal web export failed");
  }
}

function rewriteSkylinePaths(dir = SKYLINE) {
  const exts = new Set([".html", ".js", ".css", ".json", ".webmanifest"]);
  const prefixes = ["/scenery/", "/icons/", "/map/", "/sprites/", "/props/", "/manifest.json"];
  function walk(folder) {
    for (const name of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, name.name);
      if (name.isDirectory()) {
        walk(full);
        continue;
      }
      if (!exts.has(name.name.slice(name.name.lastIndexOf(".")))) continue;
      let text = readFileSync(full, "utf8");
      const original = text;
      for (const prefix of prefixes) {
        const already = `/skyline${prefix}`;
        text = text.split(already).join("___SKY___");
        text = text.split(prefix).join(already);
        text = text.split("___SKY___").join(already);
      }
      if (text !== original) writeFileSync(full, text);
    }
  }
  walk(dir);
}

function writeSkylineWorker() {
  const sw = `const CACHE = 'skyline-signal-arcade-v1';
const BASE = '/skyline';
const APP_SHELL = [BASE + '/', BASE + '/index.html', BASE + '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE + '/') && url.pathname !== BASE) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(BASE + '/')));
    return;
  }
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(BASE + '/'))),
  );
});
`;
  writeFileSync(join(SKYLINE, "service-worker.js"), sw);
  const manifestPath = join(SKYLINE, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.id = "/skyline/";
      manifest.start_url = "/skyline/";
      manifest.scope = "/skyline/";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    } catch {
      // Expo may emit a different manifest shape; keep the generated file.
    }
  } else {
    cpSync(join(ROOT, "public", "manifest.json"), manifestPath);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.id = "/skyline/";
    manifest.start_url = "/skyline/";
    manifest.scope = "/skyline/";
    if (Array.isArray(manifest.icons)) {
      manifest.icons = manifest.icons.map((icon) => ({
        ...icon,
        src: icon.src.startsWith("/") ? `/skyline${icon.src}` : icon.src,
      }));
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function injectArcadeHome(dir) {
  const snippet = `<link rel="stylesheet" href="/arcade-home.css"><a class="arcade-home arcade-home--foot" href="/">ALL GAMES</a>`;
  function walk(folder) {
    for (const name of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, name.name);
      if (name.isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.name.endsWith(".html")) continue;
      let html = readFileSync(full, "utf8");
      if (html.includes('class="arcade-home"')) continue;
      const next = html.replace(/<body([^>]*)>/i, `<body$1>${snippet}`);
      if (next !== html) writeFileSync(full, next);
    }
  }
  walk(dir);
}
const catalog = assertCatalog(ROOT);
if (!existsSync(join(ARCADE, "index.html"))) throw new Error("arcade/index.html is missing");

ensureSkyline();
rewriteSkylinePaths();
writeSkylineWorker();
injectArcadeHome(SKYLINE);

function assemble(dest) {
  copyDir(ARCADE, dest);
  for (const game of catalog.games) {
    const nested = join(dest, game.id);
    if (game.root === `arcade/${game.id}` && game.id !== "skyline") continue;
    copyInto(game.abs, nested);
  }
  for (const name of ["og.jpg", "x-banner.jpg", "favicon.svg"]) {
    const from = join(ROOT, "public", name);
    if (existsSync(from)) cpSync(from, join(dest, name));
  }
  const grok = join(ROOT, "public", "__grok");
  if (existsSync(grok)) cpSync(grok, join(dest, "__grok"), { recursive: true });
}

assemble(DIST_WEB);
assemble(DIST);

rmSync(join(VERCEL_OUT, "functions"), { recursive: true, force: true });
rmSync(VERCEL_STATIC, { recursive: true, force: true });
mkdirSync(VERCEL_STATIC, { recursive: true });
assemble(VERCEL_STATIC);

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
          src: "/tracks/service-worker.js",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
          continue: true,
        },
        {
          src: "/skyline/service-worker.js",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
          continue: true,
        },
        {
          src: "/manifest.json",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
          continue: true,
        },
        { handle: "filesystem" },
        ...vercelFallbackRoutes(catalog),
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  join(ROOT, "vercel.json"),
  `${JSON.stringify(
    {
      outputDirectory: "dist-web",
      rewrites: vercelRewrites(catalog),
      headers: [
        {
          source: "/:path*service-worker.js",
          headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
        },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`[${catalog.studio}] built ${catalog.product} · ${catalog.games.map((game) => game.id).join(" · ")}`);
