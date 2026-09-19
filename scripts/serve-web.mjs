#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCADE = path.join(ROOT, "arcade");
const TRACKS = path.join(ROOT, "thought-tracks");
const SKYLINE = path.join(ARCADE, "skyline");
const COFFEE = path.join(ARCADE, "coffee");
const GROK = path.join(ROOT, "public", "__grok");
const PUBLIC = path.join(ROOT, "public");
const port = Number(process.env.PORT || 8080);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function send(res, code, body, type = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": extra.cache || "no-cache", ...extra.headers });
  res.end(body);
}

function isAsset(rel) {
  return /\.(js|mjs|css|map|png|jpe?g|svg|json|webmanifest|woff2?|ttf|ico|webp|gif|txt)$/i.test(rel);
}

function mapUrl(urlPath) {
  if (urlPath === "/og.jpg" || urlPath === "/x-banner.jpg") {
    const pub = path.join(PUBLIC, urlPath.slice(1));
    if (fs.existsSync(pub)) return { file: pub };
  }
  if (urlPath.startsWith("/__grok/")) {
    return { root: GROK, rel: urlPath.slice("/__grok/".length), spa: null };
  }
  if (urlPath === "/tracks" || urlPath.startsWith("/tracks/")) {
    return { root: TRACKS, rel: urlPath.slice("/tracks".length).replace(/^\/+/, ""), spa: "index.html" };
  }
  if (urlPath === "/skyline" || urlPath.startsWith("/skyline/")) {
    return { root: SKYLINE, rel: urlPath.slice("/skyline".length).replace(/^\/+/, ""), spa: "index.html" };
  }
  if (urlPath === "/coffee" || urlPath.startsWith("/coffee/")) {
    return { root: COFFEE, rel: urlPath.slice("/coffee".length).replace(/^\/+/, ""), spa: "index.html" };
  }
  return { root: ARCADE, rel: urlPath.replace(/^\/+/, ""), spa: "index.html" };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const urlPath = decodeURIComponent(url.pathname);
  const mapped = mapUrl(urlPath);
  if (mapped.file) {
    return fs.readFile(mapped.file, (err, data) => {
      if (err) return send(res, 404, "not found");
      send(res, 200, data, mime[path.extname(mapped.file)] || "application/octet-stream");
    });
  }
  let rel = mapped.rel;
  if (!rel || rel.endsWith("/")) rel = `${rel || ""}index.html`;
  const file = path.normalize(path.join(mapped.root, rel));
  if (!file.startsWith(mapped.root)) return send(res, 403, "forbidden");
  fs.readFile(file, (err, data) => {
    if (!err) {
      const type = mime[path.extname(file)] || "application/octet-stream";
      const base = path.basename(file);
      const cache = base === "service-worker.js" || base === "manifest.json"
        ? "public, max-age=0, must-revalidate"
        : "no-cache";
      return send(res, 200, data, type, { cache });
    }
    if (isAsset(rel) || !mapped.spa) return send(res, 404, "not found");
    fs.readFile(path.join(mapped.root, mapped.spa), (e2, html) => {
      if (e2) return send(res, 404, "not found");
      send(res, 200, html, mime[".html"]);
    });
  });
});

server.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
server.listen({ port, host: "0.0.0.0", ipv6Only: false }, () => {
  console.log(`[arcade] hub ${ARCADE} · coffee ${COFFEE} · tracks ${TRACKS} · skyline ${SKYLINE} on 0.0.0.0:${port}`);
});
