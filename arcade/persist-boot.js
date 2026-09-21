/** Restores ARKA Arcade progress before any game script runs. */
(function () {
  var HUB = 'arka-arcade-progress-v1';
  var COOKIE = 'arka_arcade_v1';

  function getCookie() {
    var m = document.cookie.match(/(?:^|; )arka_arcade_v1=([^;]*)/);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }
  function setCookie(obj) {
    try {
      var raw = encodeURIComponent(JSON.stringify(obj));
      if (raw.length > 3800) return;
      document.cookie = COOKIE + '=' + raw + ';path=/;max-age=31536000;SameSite=Lax';
    } catch (e) {}
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function parse(v) { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  function mergeTracks(a, b) {
    a = a || {}; b = b || {};
    var records = Object.assign({}, a.records || {});
    Object.keys(b.records || {}).forEach(function (k) {
      var x = records[k] || {};
      var y = b.records[k] || {};
      records[k] = {
        home: Math.max(x.home || 0, y.home || 0),
        quota: y.quota || x.quota || 0,
        score: Math.max(x.score || 0, y.score || 0),
        cleared: !!(x.cleared || y.cleared),
      };
    });
    var cleared = Object.assign({}, a.cleared || {}, b.cleared || {});
    Object.keys(records).forEach(function (k) { if (records[k].cleared) cleared[k] = true; });
    return {
      best: Math.max(a.best || 0, b.best || 0),
      muted: !!(b.muted ?? a.muted),
      last: b.last || a.last || 1,
      rung: Math.max(a.rung || 0, b.rung || 0),
      records: records,
      cleared: cleared,
    };
  }
  function mergeCoffee(a, b) {
    a = a || {}; b = b || {};
    return { best: Math.max(a.best || 0, b.best || 0), stage: Math.max(a.stage || 0, b.stage || 0) };
  }
  function mergeSkyline(a, b) {
    a = a || {}; b = b || {};
    var sectors = [];
    [].concat(a.sectors || [], b.sectors || []).forEach(function (n) {
      if (sectors.indexOf(n) < 0) sectors.push(n);
    });
    var achievements = [];
    [].concat(a.achievements || [], b.achievements || []).forEach(function (n) {
      if (achievements.indexOf(n) < 0) achievements.push(n);
    });
    return {
      best: Math.max(a.best || 0, b.best || 0),
      unlocked: Math.max(a.unlocked || 0, b.unlocked || 0),
      sectors: sectors.sort(function (x, y) { return x - y; }),
      achievements: achievements,
      stats: b.stats || a.stats || null,
    };
  }
  function mergeInfinite(a, b) {
    a = a || {}; b = b || {};
    return { you: Math.max(a.you || 0, b.you || 0), cpu: Math.max(a.cpu || 0, b.cpu || 0) };
  }
  function mergeDrops(a, b) {
    a = a || {}; b = b || {};
    return {
      best: Math.max(a.best || 0, b.best || 0),
      last: Math.max(a.last || 0, b.last || 0),
      level: Math.max(a.level || 0, b.level || 0),
    };
  }
  function mergeGhost(a, b) {
    a = a || {}; b = b || {};
    var records = Object.assign({}, a.records || {});
    Object.keys(b.records || {}).forEach(function (k) {
      var x = records[k] || {};
      var y = b.records[k] || {};
      records[k] = {
        home: Math.max(x.home || 0, y.home || 0),
        quota: y.quota || x.quota || 0,
        score: Math.max(x.score || 0, y.score || 0),
        span: Math.max(x.span || 0, y.span || 0),
        cleared: !!(x.cleared || y.cleared),
      };
    });
    var cleared = Object.assign({}, a.cleared || {}, b.cleared || {});
    Object.keys(records).forEach(function (k) { if (records[k].cleared) cleared[k] = true; });
    return {
      best: Math.max(a.best || 0, b.best || 0),
      muted: !!(b.muted != null ? b.muted : a.muted),
      last: b.last || a.last || 1,
      unlocked: Math.max(1, a.unlocked || 1, b.unlocked || 1),
      records: records,
      cleared: cleared,
    };
  }
  function mergeHub(a, b) {
    a = a && typeof a === 'object' ? a : {};
    b = b && typeof b === 'object' ? b : {};
    return {
      tracks: mergeTracks(a.tracks, b.tracks),
      coffee: mergeCoffee(a.coffee, b.coffee),
      skyline: mergeSkyline(a.skyline, b.skyline),
      infinite: mergeInfinite(a.infinite, b.infinite),
      drops: mergeDrops(a.drops, b.drops),
      ghost: mergeGhost(a.ghost, b.ghost),
      last: b.last || a.last || null,
      updated: Date.now(),
    };
  }

  function fromLegacy() {
    var hub = {};
    var tracks = parse(lsGet('thought-tracks-v14')) || {};
    var list = parse(lsGet('thought-tracks-cleared-v1'));
    if (tracks && typeof tracks === 'object') hub.tracks = tracks;
    if (Array.isArray(list) && list.length) {
      hub.tracks = hub.tracks || {};
      hub.tracks.cleared = hub.tracks.cleared || {};
      list.forEach(function (n) { hub.tracks.cleared[String(n)] = true; });
    }
    var best = Number(lsGet('coffee-rush-best-v1') || 0);
    var stage = Number(lsGet('coffee-rush-stage-v1') || 0);
    if (best || stage) hub.coffee = { best: best, stage: stage };
    var inf = parse(lsGet('arcade-infinite-v1'));
    if (inf) hub.infinite = { you: Number(inf.you) || 0, cpu: Number(inf.cpu) || 0 };
    var drops = parse(lsGet('arcade-drops-v1'));
    if (drops) hub.drops = { best: Number(drops.best) || 0, last: Number(drops.last) || 0, level: Number(drops.level) || 0 };
    var ghost = parse(lsGet('arcade-ghost-v1'));
    if (ghost) hub.ghost = ghost;
    var sky = parse(lsGet('@skyline_signal_stats_v1'));
    if (sky) {
      hub.skyline = {
        best: Number(sky.highScore) || 0,
        unlocked: Number(sky.unlockedLevels) || 1,
        sectors: sky.completedSectors || [],
        achievements: sky.achievements || [],
        stats: sky,
      };
    }
    var last = parse(lsGet('arka-arcade-last'));
    if (last) hub.last = last;
    return hub;
  }

  function applyHub(hub) {
    if (!hub) return;
    lsSet(HUB, JSON.stringify(hub));
    if (hub.tracks) {
      lsSet('thought-tracks-v14', JSON.stringify(hub.tracks));
      var list = Object.keys(hub.tracks.cleared || {}).filter(function (k) { return hub.tracks.cleared[k]; }).map(Number);
      lsSet('thought-tracks-cleared-v1', JSON.stringify(list));
    }
    if (hub.coffee) {
      if (hub.coffee.best) lsSet('coffee-rush-best-v1', String(hub.coffee.best));
      if (hub.coffee.stage) lsSet('coffee-rush-stage-v1', String(hub.coffee.stage));
    }
    if (hub.infinite) lsSet('arcade-infinite-v1', JSON.stringify(hub.infinite));
    if (hub.drops) lsSet('arcade-drops-v1', JSON.stringify(hub.drops));
    if (hub.ghost) lsSet('arcade-ghost-v1', JSON.stringify(hub.ghost));
    if (hub.skyline) {
      var sky = hub.skyline.stats ? Object.assign({}, hub.skyline.stats) : {};
      sky.highScore = Math.max(Number(sky.highScore) || 0, hub.skyline.best || 0);
      sky.unlockedLevels = Math.max(Number(sky.unlockedLevels) || 1, hub.skyline.unlocked || 1);
      sky.completedSectors = (sky.completedSectors || []).concat(hub.skyline.sectors || []);
      sky.completedSectors = sky.completedSectors.filter(function (n, i, a) { return a.indexOf(n) === i; });
      sky.achievements = (sky.achievements || []).concat(hub.skyline.achievements || []);
      sky.achievements = sky.achievements.filter(function (n, i, a) { return a.indexOf(n) === i; });
      lsSet('@skyline_signal_stats_v1', JSON.stringify(sky));
    }
    if (hub.last) lsSet('arka-arcade-last', JSON.stringify(hub.last));
  }

  function snapshot() {
    var next = mergeHub(parse(lsGet(HUB)), fromLegacy());
    applyHub(next);
    setCookie(next);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    try {
      fetch('/api/progress', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: next }),
      }).catch(function () {});
    } catch (e) {}
    try {
      var req = indexedDB.open('arka-arcade', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('progress'); };
      req.onsuccess = function () {
        req.result.transaction('progress', 'readwrite').objectStore('progress').put(next, 'hub');
      };
    } catch (e) {}
  }

  var hub = mergeHub(parse(lsGet(HUB)), mergeHub(getCookie(), fromLegacy()));
  applyHub(hub);
  setCookie(hub);
  snapshot();
  addEventListener('pagehide', snapshot);
  addEventListener('visibilitychange', function () { if (document.hidden) snapshot(); });
  addEventListener('beforeunload', snapshot);

  try {
    fetch('/api/progress', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || !data.payload) return;
      var merged = mergeHub(parse(lsGet(HUB)), data.payload);
      applyHub(merged);
      setCookie(merged);
      snapshot();
    }).catch(function () {});
  } catch (e) {}

  try {
    var req = indexedDB.open('arka-arcade', 1);
    req.onupgradeneeded = function () { req.result.createObjectStore('progress'); };
    req.onsuccess = function () {
      var g = req.result.transaction('progress', 'readonly').objectStore('progress').get('hub');
      g.onsuccess = function () {
        if (!g.result) return;
        var merged = mergeHub(parse(lsGet(HUB)), g.result);
        applyHub(merged);
        setCookie(merged);
      };
    };
  } catch (e) {}
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
})();
