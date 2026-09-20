import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, ".data", "arcade.sqlite");

function mergeTracks(a = {}, b = {}) {
  const records = { ...(a.records || {}) };
  for (const [k, rec] of Object.entries(b.records || {})) {
    const old = records[k] || {};
    records[k] = {
      home: Math.max(old.home || 0, rec.home || 0),
      quota: rec.quota || old.quota || 0,
      score: Math.max(old.score || 0, rec.score || 0),
      cleared: !!(old.cleared || rec.cleared),
    };
  }
  const cleared = { ...(a.cleared || {}), ...(b.cleared || {}) };
  for (const [k, rec] of Object.entries(records)) if (rec?.cleared) cleared[k] = true;
  return {
    best: Math.max(Number(a.best) || 0, Number(b.best) || 0),
    muted: !!(b.muted ?? a.muted),
    last: b.last || a.last || 1,
    rung: Math.max(Number(a.rung) || 0, Number(b.rung) || 0),
    records,
    cleared,
  };
}

function mergeCoffee(a = {}, b = {}) {
  return {
    best: Math.max(Number(a.best) || 0, Number(b.best) || 0),
    stage: Math.max(Number(a.stage) || 0, Number(b.stage) || 0),
  };
}

function mergeSkyline(a = {}, b = {}) {
  const sectors = [...new Set([...(a.sectors || []), ...(b.sectors || [])])].sort((x, y) => x - y);
  const achievements = [...new Set([...(a.achievements || []), ...(b.achievements || [])])];
  return {
    best: Math.max(Number(a.best) || 0, Number(b.best) || 0),
    unlocked: Math.max(Number(a.unlocked) || 0, Number(b.unlocked) || 0),
    sectors,
    achievements,
    stats: b.stats || a.stats || null,
  };
}

function mergeInfinite(a = {}, b = {}) {
  return {
    you: Math.max(Number(a.you) || 0, Number(b.you) || 0),
    cpu: Math.max(Number(a.cpu) || 0, Number(b.cpu) || 0),
  };
}

export function mergeHub(a = {}, b = {}) {
  return {
    tracks: mergeTracks(a.tracks, b.tracks),
    coffee: mergeCoffee(a.coffee, b.coffee),
    skyline: mergeSkyline(a.skyline, b.skyline),
    infinite: mergeInfinite(a.infinite, b.infinite),
    last: b.last || a.last || null,
    updated: Date.now(),
  };
}

let db;
function getDb() {
  if (db) return db;
  mkdirSync(dirname(FILE), { recursive: true });
  db = new DatabaseSync(FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS arcade_progress (
      player_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function newPlayerId() {
  return randomUUID();
}

export function loadProgress(playerId) {
  const row = getDb().prepare("SELECT payload FROM arcade_progress WHERE player_id = ?").get(playerId);
  if (!row?.payload) return {};
  try {
    return JSON.parse(row.payload);
  } catch {
    return {};
  }
}

export function saveProgress(playerId, incoming) {
  const merged = mergeHub(loadProgress(playerId), incoming || {});
  getDb()
    .prepare(
      "INSERT INTO arcade_progress (player_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
    )
    .run(playerId, JSON.stringify(merged), new Date().toISOString());
  return merged;
}

export function playerFromCookie(header) {
  const m = String(header || "").match(/(?:^|; )arka_player=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function playerCookie(id) {
  return `arka_player=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
