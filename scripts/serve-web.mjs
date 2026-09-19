import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist-web");
const port = Number(process.env.PORT || 8080);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return send(res, 403, "forbidden");
  fs.readFile(file, (err, data) => {
    if (!err) {
      return send(res, 200, data, mime[path.extname(file)] || "application/octet-stream");
    }
    fs.readFile(path.join(root, "index.html"), (e2, html) => {
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
  console.log(`[skyline] serving ${root} on 0.0.0.0:${port}`);
});
