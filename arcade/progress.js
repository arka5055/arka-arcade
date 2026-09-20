/** Shared ARKA Arcade save. localStorage + cookie + IndexedDB. Never clobbers a better record. */

const HUB = 'arka-arcade-progress-v1';
const COOKIE = 'arka_arcade_v1';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {}
}

function cookieRead() {
  try {
    const m = document.cookie.match(/(?:^|; )arka_arcade_v1=([^;]*)/);
    return m ? JSON.parse(decodeURIComponent(m[1])) : null;
  } catch {
    return null;
  }
}

function cookieWrite(obj) {
  try {
    const raw = encodeURIComponent(JSON.stringify(obj));
    if (raw.length > 3800) return;
    document.cookie = `${COOKIE}=${raw};path=/;max-age=31536000;SameSite=Lax`;
  } catch {}
}

function idbPut(obj) {
  try {
    const req = indexedDB.open('arka-arcade', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('progress');
    req.onsuccess = () => {
      req.result.transaction('progress', 'readwrite').objectStore('progress').put(obj, 'hub');
    };
  } catch {}
}

function addCleared(target, src) {
  if (!src) return;
  if (Array.isArray(src)) {
    for (const n of src) if (n) target[String(n)] = true;
    return;
  }
  if (typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) if (v) target[String(k)] = true;
  }
}

function mergeRecords(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, rec] of Object.entries(b || {})) {
    const old = out[k] || {};
    out[k] = {
      home: Math.max(old.home || 0, rec.home || 0),
      quota: rec.quota || old.quota || 0,
      score: Math.max(old.score || 0, rec.score || 0),
      cleared: !!(old.cleared || rec.cleared),
    };
  }
  return out;
}

function mergeTracks(a = {}, b = {}) {
  const records = mergeRecords(a.records, b.records);
  const cleared = {};
  addCleared(cleared, a.cleared);
  addCleared(cleared, b.cleared);
  for (const [k, rec] of Object.entries(records)) if (rec?.cleared) cleared[String(k)] = true;
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

function mergeHub(a = {}, b = {}) {
  return {
    tracks: mergeTracks(a.tracks, b.tracks),
    coffee: mergeCoffee(a.coffee, b.coffee),
    skyline: mergeSkyline(a.skyline, b.skyline),
    infinite: mergeInfinite(a.infinite, b.infinite),
    last: b.last || a.last || null,
    updated: Date.now(),
  };
}

export function hub() {
  const data = read(HUB);
  const cookie = cookieRead();
  return mergeHub(data && typeof data === 'object' ? data : {}, cookie && typeof cookie === 'object' ? cookie : {});
}

function saveHub(patch) {
  const next = mergeHub(hub(), patch);
  write(HUB, next);
  cookieWrite(next);
  idbPut(next);
  try {
    navigator.storage?.persist?.();
  } catch {}
  queueServerSync(next);
  return next;
}

let syncTimer = 0;
function queueServerSync(payload) {
  try {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      fetch("/api/progress", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      }).catch(() => {});
    }, 200);
  } catch {}
}

export async function pullServer() {
  try {
    const r = await fetch("/api/progress", { credentials: "include" });
    if (!r.ok) return null;
    const data = await r.json();
    if (data?.payload && typeof data.payload === "object") {
      const next = mergeHub(hub(), data.payload);
      write(HUB, next);
      cookieWrite(next);
      idbPut(next);
      return next;
    }
  } catch {}
  return null;
}

export function loadTracks() {
  const h = hub().tracks || {};
  const legacy = read('thought-tracks-v14') || {};
  const list = read('thought-tracks-cleared-v1') || [];
  const merged = mergeTracks(legacy, h);
  addCleared(merged.cleared, list);
  return merged;
}

export function saveTracks(data) {
  const payload = mergeTracks(loadTracks(), data);
  saveHub({ tracks: payload });
  write('thought-tracks-v14', payload);
  write('thought-tracks-cleared-v1', Object.keys(payload.cleared).map(Number).filter(Boolean).sort((a, b) => a - b));
}

export function loadCoffee() {
  const h = hub().coffee || {};
  return mergeCoffee(h, {
    best: Number(localStorage.getItem('coffee-rush-best-v1') || 0),
    stage: Number(localStorage.getItem('coffee-rush-stage-v1') || 0),
  });
}

export function saveCoffee(data) {
  const payload = mergeCoffee(loadCoffee(), data);
  saveHub({ coffee: payload });
  if (payload.best) localStorage.setItem('coffee-rush-best-v1', String(payload.best));
  if (payload.stage) localStorage.setItem('coffee-rush-stage-v1', String(payload.stage));
}

export function loadSkyline() {
  const stats = read('@skyline_signal_stats_v1') || {};
  const h = hub().skyline || {};
  return mergeSkyline(h, {
    best: Number(stats.highScore) || 0,
    sectors: Array.isArray(stats.completedSectors) ? stats.completedSectors : [],
    unlocked: Number(stats.unlockedLevels) || 1,
    achievements: stats.achievements || [],
    stats,
  });
}

export function saveSkyline(data) {
  const payload = mergeSkyline(loadSkyline(), data);
  saveHub({ skyline: payload });
  if (payload.stats) write('@skyline_signal_stats_v1', payload.stats);
}

export function loadInfinite() {
  const h = hub().infinite || {};
  const legacy = read('arcade-infinite-v1') || {};
  return mergeInfinite(h, {
    you: Number(legacy.you ?? legacy.cpu?.you) || 0,
    cpu: Number(typeof legacy.cpu === 'number' ? legacy.cpu : legacy.cpu?.cpu) || 0,
  });
}

export function saveInfinite(data) {
  const payload = mergeInfinite(loadInfinite(), data);
  saveHub({ infinite: payload });
  write('arcade-infinite-v1', payload);
}

export function summary(id) {
  if (id === 'tracks') {
    const t = loadTracks();
    const n = Object.keys(t.cleared).length;
    return n ? `Cleared ${n}/16` : (t.best ? `Best ${t.best}` : '');
  }
  if (id === 'coffee') {
    const c = loadCoffee();
    if (c.best) return `Best ${c.best}${c.stage ? ` · Stage ${c.stage}` : ''}`;
    return c.stage ? `Stage ${c.stage}` : '';
  }
  if (id === 'skyline') {
    const s = loadSkyline();
    if (s.sectors.length) return `Sectors ${s.sectors.length}${s.best ? ` · Best ${s.best}` : ''}`;
    return s.best ? `Best ${s.best}` : '';
  }
  if (id === 'infinite') {
    const i = loadInfinite();
    if (i.you || i.cpu) return `Record ${i.you}–${i.cpu}`;
    return '';
  }
  return '';
}
