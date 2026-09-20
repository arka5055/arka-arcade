/** Shared ARKA Arcade save. Each game also keeps its own legacy key. */

const HUB = 'arka-arcade-progress-v1';

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

export function hub() {
  const data = read(HUB);
  return data && typeof data === 'object' ? data : {};
}

function saveHub(patch) {
  write(HUB, { ...hub(), ...patch, updated: Date.now() });
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

export function loadTracks() {
  const h = hub().tracks || {};
  const legacy = read('thought-tracks-v14') || {};
  const list = read('thought-tracks-cleared-v1') || [];
  const records = { ...(legacy.records || {}), ...(h.records || {}) };
  const cleared = {};
  addCleared(cleared, legacy.cleared);
  addCleared(cleared, h.cleared);
  addCleared(cleared, list);
  for (const [k, rec] of Object.entries(records)) if (rec?.cleared) cleared[String(k)] = true;
  return {
    best: Math.max(Number(h.best) || 0, Number(legacy.best) || 0),
    muted: !!(h.muted ?? legacy.muted),
    last: Math.max(1, Math.min(16, Number(h.last || legacy.last || legacy.level) || 1)),
    rung: Number(h.rung || legacy.rung) || 0,
    records,
    cleared,
  };
}

export function saveTracks(data) {
  const cleared = {};
  addCleared(cleared, data.cleared);
  const list = Object.keys(cleared).map(Number).filter(Boolean).sort((a, b) => a - b);
  const payload = {
    version: 17,
    best: data.best || 0,
    muted: !!data.muted,
    unlocked: 16,
    last: data.last || 1,
    rung: data.rung || 0,
    records: data.records || {},
    cleared,
  };
  saveHub({ tracks: payload });
  write('thought-tracks-v14', payload);
  write('thought-tracks-cleared-v1', list);
}

export function loadCoffee() {
  const h = hub().coffee || {};
  const best = Math.max(Number(h.best) || 0, Number(localStorage.getItem('coffee-rush-best-v1')) || 0);
  const stage = Math.max(Number(h.stage) || 0, Number(localStorage.getItem('coffee-rush-stage-v1')) || 0);
  return { best, stage };
}

export function saveCoffee(data) {
  saveHub({ coffee: { best: data.best || 0, stage: data.stage || 0 } });
  if (data.best != null) localStorage.setItem('coffee-rush-best-v1', String(data.best));
  if (data.stage != null) localStorage.setItem('coffee-rush-stage-v1', String(data.stage));
}

export function loadSkyline() {
  const stats = read('@skyline_signal_stats_v1') || hub().skyline || {};
  const sectors = Array.isArray(stats.completedSectors) ? stats.completedSectors : [];
  return {
    best: Number(stats.highScore) || 0,
    sectors,
    unlocked: Number(stats.unlockedLevels) || 1,
  };
}

export function loadInfinite() {
  const h = hub().infinite || {};
  const legacy = read('arcade-infinite-v1') || {};
  const you = Number(h.you ?? legacy.you ?? legacy.cpu?.you) || 0;
  const cpu = Number(h.cpu ?? legacy.cpu ?? legacy.cpu?.cpu) || 0;
  return { you, cpu };
}

export function saveInfinite(data) {
  const you = data.you || 0;
  const cpu = data.cpu || 0;
  saveHub({ infinite: { you, cpu } });
  write('arcade-infinite-v1', { you, cpu });
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
