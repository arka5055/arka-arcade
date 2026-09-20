import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadCatalog(root) {
  const raw = JSON.parse(readFileSync(join(root, "arcade", "games.json"), "utf8"));
  const games = raw.games.map((game) => ({
    ...game,
    prefix: `/${game.id}`,
    abs: join(root, game.root),
  }));
  return { studio: raw.studio, product: raw.product, tagline: raw.tagline, games };
}

export function assertCatalog(root) {
  const catalog = loadCatalog(root);
  const errors = [];
  for (const game of catalog.games) {
    if (!existsSync(join(game.abs, "index.html"))) {
      errors.push(`${game.id}: missing ${game.root}/index.html`);
    }
    if (game.id !== "skyline") {
      const html = readFileSync(join(game.abs, "index.html"), "utf8");
      if (!html.includes("ALL GAMES") && !html.includes("arcade-home")) {
        errors.push(`${game.id}: add the ALL GAMES control (see arcade/README.md)`);
      }
    }
  }
  if (errors.length) throw new Error(`Arcade catalog\n${errors.join("\n")}`);
  return catalog;
}

export function vercelRewrites(catalog) {
  const skip = catalog.games.map((game) => `${game.id}/`).join("|");
  return [
    ...catalog.games.map((game) => ({
      source: `/${game.id}/:path*`,
      destination: `/${game.id}/:path*`,
    })),
    { source: `/((?!${skip}|__grok/).*)`, destination: "/index.html" },
  ];
}

export function vercelFallbackRoutes(catalog) {
  return catalog.games.map((game) => ({
    src: `/${game.id}(?:/.*)?`,
    dest: `/${game.id}/index.html`,
  }));
}
