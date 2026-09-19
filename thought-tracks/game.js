import {
  W, H, HUB_R, MERGE_R, PALETTE, STAGE,
  opposite, hypot, portPoint, houseOffset, polyLen, along,
  buildStage, validateStage, liveEdge, nextLiveEdge, DIR,
} from './graph.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SAVE_KEY = 'thought-tracks-v12';
const SPEED = 44;
const COMMIT_S = 0.25;
const TAP_COALESCE = 0.1;
const HIT_R = 22;

const ui = {
  time: document.getElementById('hud-time'),
  correct: document.getElementById('hud-correct'),
  level: document.getElementById('hud-level'),
  title: document.getElementById('title'),
  pause: document.getElementById('pause'),
  done: document.getElementById('done'),
};

let audioCtx = null;
let muted = false;
let best = 0;
try {
  const save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
  best = save.best || 0;
  muted = !!save.muted;
} catch {}

const state = {
  mode: 'title',
  level: 1,
  score: 0,
  home: 0,
  missed: 0,
  allowed: 3,
  quota: 8,
  spawned: 0,
  spawnIn: 1,
  remaining: 120,
  pace: 1,
  graph: null,
  trains: [],
  fx: [],
  hint: 0,
  flash: 0,
  nextId: 1,
  tapQueue: null,
  debug: /[?&]debug=1/.test(location.search),
};

function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 12, best, muted })); } catch {}
}

function unlockAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(freq, dur, type = 'sine', gain = 0.05) {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + dur);
}

function burst(x, y, color, n = 10, extra = {}) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const s = (extra.speed || 70) * (0.45 + Math.random());
    state.fx.push({
      kind: extra.kind || 'spark', x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - (extra.lift || 40),
      t: extra.life || 0.55, life: extra.life || 0.7,
      color, r: extra.r || 2 + Math.random() * 3, text: extra.text,
    });
  }
}

function puff(x, y, color, life = 0.45) {
  state.fx.push({
    kind: 'puff', x: x + (Math.random() - 0.5) * 6, y,
    vx: (Math.random() - 0.5) * 12, vy: -24 - Math.random() * 14,
    t: life, life, color, r: 4 + Math.random() * 4,
  });
}

function trainPos(tr) {
  return along(tr.edge.pts, tr.dist);
}

function distToNode(tr, node) {
  const p = trainPos(tr);
  return Math.hypot(p.x - node.x, p.y - node.y);
}

function switchCommitted(sw) {
  return state.trains.some((tr) => {
    const d = distToNode(tr, sw);
    return d < Math.max(HUB_R, SPEED * COMMIT_S) + ((tr.cars || 1) - 1) * 10;
  });
}

function mergeBusy(merge, except) {
  return state.trains.some((tr) => {
    if (tr === except) return false;
    return distToNode(tr, merge) < MERGE_R + 18 + ((tr.cars || 1) - 1) * 10;
  });
}

function firstSwitchFor(source) {
  const g = state.graph;
  let node = g.nodes[source.id];
  let guard = 0;
  while (node && node.kind !== 'switch' && guard++ < 12) {
    const e = nextLiveEdge(g, node);
    if (!e) break;
    node = g.nodes[e.to.nodeId];
  }
  return node?.kind === 'switch' ? node : null;
}

function pickColor(source) {
  const spec = STAGE[state.level - 1];
  const intro = spec.intro || [];
  if (state.spawned < intro.length) {
    const want = intro[state.spawned];
    if (source.packet.includes(want)) return want;
  }
  const used = {};
  for (const tr of state.trains) used[tr.color] = (used[tr.color] || 0) + 1;
  const ranked = source.packet.slice().sort((a, b) => (used[a] || 0) - (used[b] || 0));
  return ranked[0];
}

function canRelease(source) {
  const spec = STAGE[state.level - 1];
  if (state.trains.length >= spec.cap) return false;
  const sw = firstSwitchFor(source);
  if (sw && switchCommitted(sw)) return false;
  const edge = nextLiveEdge(state.graph, source);
  if (!edge) return false;
  const nxt = state.graph.nodes[edge.to.nodeId];
  if (nxt?.kind === 'merge' && mergeBusy(nxt)) return false;
  return true;
}

function spawnFrom(source) {
  const g = state.graph;
  const edge = nextLiveEdge(g, source);
  if (!edge) return;
  const color = pickColor(source);
  state.trains.push({
    id: state.nextId++,
    sourceId: source.id,
    color,
    edge,
    dist: 0,
    cars: state.level >= 12 ? 3 : state.level >= 8 ? 2 : 1,
    steam: 0,
  });
  state.spawned += 1;
  burst(source.x, source.y, '#dfe6d2', 6, { speed: 28, lift: 6, life: 0.35 });
  beep(196, 0.07, 'triangle', 0.03);
}

function spawnTrain() {
  const ready = state.graph.sources.filter(canRelease);
  if (!ready.length) return false;
  const last = state.trains[state.trains.length - 1];
  const pick = ready.find((s) => s.id !== last?.sourceId) || ready[0];
  spawnFrom(pick);
  return true;
}

function requestToggle(sw) {
  if (switchCommitted(sw) || (sw.anim || 1) < 1) {
    sw.flash = 0.12;
    beep(180, 0.04, 'square', 0.02);
    return;
  }
  sw.prevArm = sw.arm;
  sw.arm = sw.arm ? 0 : 1;
  sw.anim = 0;
  sw.flash = 0.28;
  burst(sw.x, sw.y, '#d7f0c8', 8, { speed: 70, lift: 12, life: 0.28, r: 2 });
  beep(370, 0.05, 'square', 0.03);
}

function toggleSwitchAt(p) {
  if (state.mode !== 'play') return;
  let hit = null;
  let bestD = HIT_R * 2;
  for (const n of Object.values(state.graph.nodes)) {
    if (n.kind !== 'switch') continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bestD) { bestD = d; hit = n; }
  }
  if (!hit) return;
  const now = performance.now() / 1000;
  if (state.tapQueue && state.tapQueue.id === hit.id && now - state.tapQueue.t < TAP_COALESCE) {
    state.tapQueue.n += 1;
    state.tapQueue.t = now;
    requestToggle(hit);
    return;
  }
  state.tapQueue = { id: hit.id, t: now, n: 1 };
  requestToggle(hit);
}

function finishTrain(tr, station) {
  const ok = station?.kind === 'station' && station.color === tr.color;
  state.trains = state.trains.filter((t) => t !== tr);
  if (ok) {
    state.home += 1;
    state.score += 100 * state.level;
    state.pace = Math.max(STAGE[state.level - 1].min / STAGE[state.level - 1].nom, (state.pace || 1) * 0.94);
    station.pulse = 0.7;
    burst(station.x, station.y - 8, PALETTE[station.color], 12, { speed: 90, lift: 48 });
    state.fx.push({ kind: 'ring', x: station.x, y: station.y, t: 0.45, life: 0.45, color: PALETTE[station.color], r: 10 });
    state.fx.push({
      kind: 'float', x: station.x, y: station.y - 22, t: 0.8, life: 0.8,
      color: '#eef3e4', text: 'CORRECT', vy: -24, vx: 0,
    });
    state.flash = 0.16;
    beep(640, 0.08, 'sine', 0.04);
  } else {
    state.missed += 1;
    state.pace = Math.min(STAGE[state.level - 1].max / STAGE[state.level - 1].nom, (state.pace || 1) * 1.22);
    const x = station?.x ?? W / 2;
    const y = station?.y ?? 400;
    burst(x, y, '#c9d2c0', 5, { speed: 24, lift: 6, life: 0.28 });
    if (state.trains.length >= STAGE[state.level - 1].cap) state.spawnIn += spawnGap() * 0.3;
  }
  refreshHud();
}

function advanceTrain(tr, dt) {
  const nodeAhead = state.graph.nodes[tr.edge.to.nodeId];
  const len = polyLen(tr.edge.pts);
  const remain = len - tr.dist;
  if (nodeAhead?.kind === 'merge' && remain < MERGE_R + 10 && mergeBusy(nodeAhead, tr)) {
    return;
  }
  tr.dist += SPEED * dt;
  if (tr.dist < len) return;
  if (nodeAhead.kind === 'station') {
    const leftover = tr.dist - len;
    if (leftover < 12) {
      finishTrain(tr, nodeAhead);
      return;
    }
    finishTrain(tr, nodeAhead);
    return;
  }
  const edge = nextLiveEdge(state.graph, nodeAhead);
  if (!edge) {
    finishTrain(tr, nodeAhead);
    return;
  }
  tr.edge = edge;
  tr.dist = 0;
}

function spawnGap() {
  const s = STAGE[state.level - 1];
  return Math.max(s.min, Math.min(s.max, s.nom * (state.pace || 1)));
}

function endRound(advanced) {
  if (state.score > best) { best = state.score; persist(); }
  state.mode = 'done';
  state.cleared = advanced;
  ui.done.classList.remove('hidden');
  document.getElementById('done-title').textContent = advanced ? 'Level cleared' : 'Round over';
  document.getElementById('done-home').textContent = String(state.home);
  document.getElementById('done-miss').textContent = String(state.missed);
  document.getElementById('done-score').textContent = String(state.score);
  document.getElementById('done-best').textContent = String(best);
  document.getElementById('btn-again').textContent = advanced && state.level < 14 ? 'NEXT LEVEL' : 'PLAY AGAIN';
}

function startLevel(level) {
  const spec = STAGE[level - 1];
  const graph = buildStage(level);
  const report = validateStage(graph);
  if (!report.ok) console.warn('[tracks] map issues', report.errors);
  Object.assign(state, {
    mode: 'play',
    level,
    missed: 0,
    allowed: spec.miss,
    quota: spec.total,
    spawned: 0,
    spawnIn: level === 1 ? 1.4 : 0.9,
    remaining: 120,
    pace: 1,
    graph,
    trains: [],
    fx: [],
    hint: level === 1 ? 3.2 : 0,
    flash: 0,
    home: 0,
    score: level === 1 ? 0 : state.score,
    nextId: 1,
    tapQueue: null,
  });
  ui.title.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.done.classList.add('hidden');
  refreshHud();
}

function startGame() { startLevel(1); }

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function refreshHud() {
  ui.level.textContent = String(state.level);
  ui.correct.textContent = `${state.home} of ${state.quota}`;
  ui.time.textContent = formatTime(Math.max(0, state.remaining));
}

function resize() {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
}

function worldFromEvent(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawField() {
  ctx.fillStyle = '#3d6140';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#355838';
  ctx.beginPath();
  ctx.ellipse(80, 90, 120, 44, 0, 0, Math.PI * 2);
  ctx.ellipse(300, 70, 110, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(22, 40, 20, 0.16)';
  ctx.lineWidth = 1;
  for (let y = 100; y < H; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function strokeRail(pts, live) {
  ctx.save();
  ctx.globalAlpha = live ? 1 : 0.42;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#1d2618';
  ctx.lineWidth = 3.2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = hypot(a, b);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const px = -uy;
    const py = ux;
    for (let d = 7; d < len - 5; d += 9) {
      const x = a.x + ux * d;
      const y = a.y + uy * d;
      ctx.beginPath();
      ctx.moveTo(x + px * 7, y + py * 7);
      ctx.lineTo(x - px * 7, y - py * 7);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = live ? '#e7ead8' : '#c5cbb8';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.strokeStyle = live ? '#2a3424' : '#3a4436';
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.restore();
}

function drawInner(sw) {
  const t = Math.min(1, sw.anim ?? 1);
  const pIn = portPoint(sw, sw.inPort);
  const a0 = { W: Math.PI, E: 0, N: -Math.PI / 2, S: Math.PI / 2 }[sw.out0];
  const a1 = { W: Math.PI, E: 0, N: -Math.PI / 2, S: Math.PI / 2 }[sw.out1];
  const fromA = sw.arm ? a1 : a0;
  const prevA = sw.prevArm ? a1 : a0;
  let d = fromA - prevA;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const a = prevA + d * t;
  const x1 = sw.x + Math.cos(a) * HUB_R;
  const y1 = sw.y + Math.sin(a) * HUB_R;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#e7ead8';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(pIn.x, pIn.y);
  ctx.quadraticCurveTo(sw.x, sw.y, x1, y1);
  ctx.stroke();
  ctx.strokeStyle = '#2a3424';
  ctx.lineWidth = 3.4;
  ctx.stroke();
}

function drawStation(st) {
  const off = houseOffset(st.port);
  ctx.save();
  ctx.strokeStyle = '#e7ead8';
  ctx.lineWidth = 10;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(st.x, st.y);
  ctx.lineTo(st.x + off.x * 0.45, st.y + off.y * 0.45);
  ctx.stroke();
  ctx.strokeStyle = '#2a3424';
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(st.x, st.y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#eef3e4';
  ctx.fill();
  ctx.strokeStyle = '#2a3424';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.translate(st.x + off.x, st.y + off.y);
  if (st.pulse > 0) {
    ctx.shadowColor = PALETTE[st.color];
    ctx.shadowBlur = 16;
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = '#f3f6ee';
  ctx.fillStyle = PALETTE[st.color];
  roundRect(-15, -9, 30, 22, 4);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-17, -7);
  ctx.lineTo(0, -20);
  ctx.lineTo(17, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f7f4ea';
  ctx.beginPath();
  ctx.arc(0, 4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c2818';
  ctx.font = '800 11px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(st.color, 0, 4);
  ctx.restore();
}

function drawSource(src) {
  ctx.save();
  ctx.translate(src.x, src.y);
  const ang = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 }[src.port];
  ctx.rotate(ang);
  ctx.fillStyle = '#1b1d16';
  ctx.beginPath();
  ctx.moveTo(-18, 14);
  ctx.quadraticCurveTo(0, -20, 18, 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d7ddc8';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.fillStyle = '#10120c';
  ctx.fillRect(-10, 2, 20, 10);
  ctx.restore();
}

function drawMerge(m) {
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.fillStyle = '#2a3324';
  ctx.beginPath();
  ctx.arc(0, 0, MERGE_R - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d7ddc8';
  ctx.lineWidth = 2;
  ctx.stroke();
  const waiting = state.trains.filter((tr) => distToNode(tr, m) < MERGE_R + 24).length;
  if (waiting) {
    ctx.fillStyle = '#e7ead8';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLoco(tr) {
  const p = trainPos(tr);
  const cars = tr.cars || 1;
  for (let i = cars - 1; i >= 0; i--) {
    ctx.save();
    ctx.translate(p.x - Math.cos(p.ang) * i * 20, p.y - Math.sin(p.ang) * i * 20);
    ctx.rotate(p.ang);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f3f6ee';
    ctx.lineWidth = 2.6;
    ctx.fillStyle = PALETTE[tr.color];
    if (i === 0) {
      roundRect(-13, -7, 24, 14, 3);
      ctx.fill(); ctx.stroke();
      roundRect(4, -14, 7, 8, 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1c2418';
      ctx.fillRect(9, -18, 3, 5);
      ctx.beginPath();
      ctx.arc(-7, 8, 2.6, 0, Math.PI * 2);
      ctx.arc(3, 8, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f7f4ea';
      ctx.beginPath();
      ctx.arc(-1, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c2818';
      ctx.font = '800 8px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr.color, -1, 0);
    } else {
      roundRect(-9, -6, 16, 12, 3);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFx() {
  for (const f of state.fx) {
    const u = Math.max(0, Math.min(1, f.t / (f.life || 0.5)));
    ctx.save();
    ctx.globalAlpha = f.kind === 'float' ? u : Math.pow(u, 0.7);
    ctx.translate(f.x, f.y);
    if (f.kind === 'ring') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, (f.r || 12) + (1 - u) * 24, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'float') {
      ctx.fillStyle = f.color || '#eef3e4';
      ctx.font = '800 13px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text || '+1', 0, 0);
    } else {
      ctx.fillStyle = f.color || '#eef3e4';
      ctx.beginPath();
      ctx.arc(0, 0, (f.r || 3) * (0.5 + u), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  drawField();
  const g = state.graph;
  if (!g) return;
  for (const n of Object.values(g.nodes)) {
    if (n.kind !== 'switch') continue;
    ctx.beginPath();
    ctx.arc(n.x, n.y, HUB_R + (n.flash || 0) * 6, 0, Math.PI * 2);
    ctx.fillStyle = switchCommitted(n) ? '#4a7344' : '#5b9648';
    ctx.fill();
    ctx.strokeStyle = 'rgba(238,243,228,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const e of g.edges) {
    const from = g.nodes[e.from.nodeId];
    const live = from.kind !== 'switch' || liveEdge(from, e);
    strokeRail(e.pts, live);
  }
  for (const n of Object.values(g.nodes)) if (n.kind === 'switch') drawInner(n);
  for (const n of Object.values(g.nodes)) if (n.kind === 'merge') drawMerge(n);
  for (const s of g.sources) drawSource(s);
  for (const n of Object.values(g.nodes)) if (n.kind === 'station') drawStation(n);
  for (const tr of state.trains) drawLoco(tr);
  drawFx();
  if (state.debug) {
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff8';
    for (const n of Object.values(g.nodes)) {
      ctx.fillText(`${n.kind[0]} ${n.color || n.prefix || n.side || ''}`, n.x, n.y - 28);
    }
  }
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(210,240,170,${state.flash * 0.3})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.hint > 0) {
    ctx.globalAlpha = Math.min(1, state.hint);
    ctx.fillStyle = '#eef3e4';
    ctx.font = '800 12px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAP A GREEN CIRCLE  •  MATCH THE LETTER', W / 2, 36);
    ctx.globalAlpha = 1;
  }
}

function step(dt) {
  if (state.mode !== 'play') return;
  state.remaining = Math.max(0, state.remaining - dt);
  state.hint = Math.max(0, state.hint - dt);
  state.flash = Math.max(0, (state.flash || 0) - dt * 1.6);
  state.fx = state.fx.filter((f) => {
    f.t -= dt;
    f.x += (f.vx || 0) * dt;
    f.y += (f.vy || 0) * dt;
    if (f.kind === 'spark' || f.kind === 'puff') f.vy = (f.vy || 0) + 70 * dt;
    return f.t > 0;
  });
  if (state.graph) {
    for (const n of Object.values(state.graph.nodes)) {
      if (n.kind === 'switch') {
        n.anim = Math.min(1, (n.anim ?? 1) + dt / 0.14);
        n.flash = Math.max(0, (n.flash || 0) - dt * 3);
      }
      if (n.kind === 'station') n.pulse = Math.max(0, (n.pulse || 0) - dt);
    }
  }
  for (const tr of state.trains) {
    tr.steam = (tr.steam || 0) - dt;
    if (tr.steam <= 0) {
      const p = trainPos(tr);
      puff(p.x + Math.cos(p.ang) * 8, p.y + Math.sin(p.ang) * 8 - 10, 'rgba(238,243,228,0.85)');
      tr.steam = 0.2;
    }
  }

  const spec = STAGE[state.level - 1];
  const doneSpawning = state.spawned >= state.quota;
  const idle = doneSpawning && state.trains.length === 0;
  if (state.remaining <= 0 || idle) {
    endRound(state.missed <= state.allowed && state.home > 0);
    return;
  }
  if (!doneSpawning) {
    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      if (spawnTrain()) state.spawnIn = spawnGap();
      else state.spawnIn = 0.2;
    }
  }
  const ordered = [...state.trains].sort((a, b) => a.id - b.id);
  for (const tr of ordered) advanceTrain(tr, dt);
  refreshHud();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  requestAnimationFrame(loop);
}

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  unlockAudio();
  if (state.mode !== 'play') return;
  toggleSwitchAt(worldFromEvent(ev));
}, { passive: false });

function restartGame(ev) {
  ev?.preventDefault();
  ev?.stopPropagation();
  unlockAudio();
  ui.pause.classList.add('hidden');
  ui.done.classList.add('hidden');
  startGame();
}

document.getElementById('btn-play').addEventListener('click', () => { unlockAudio(); startGame(); });
document.getElementById('btn-again').addEventListener('click', () => {
  unlockAudio();
  ui.done.classList.add('hidden');
  if (state.cleared && state.level < 14) startLevel(state.level + 1);
  else startGame();
});
document.getElementById('btn-restart').addEventListener('pointerdown', restartGame);
document.getElementById('btn-restart').addEventListener('click', restartGame);
document.getElementById('btn-new').addEventListener('pointerdown', restartGame);
document.getElementById('btn-new').addEventListener('click', restartGame);
document.getElementById('btn-pause').addEventListener('click', () => {
  if (state.mode !== 'play') return;
  state.mode = 'pause';
  ui.pause.classList.remove('hidden');
});
document.getElementById('btn-resume').addEventListener('click', () => {
  ui.pause.classList.add('hidden');
  if (state.mode === 'pause') state.mode = 'play';
});
document.getElementById('btn-mute').addEventListener('click', () => {
  muted = !muted;
  persist();
  document.getElementById('btn-mute').textContent = muted ? '×' : '♪';
});

addEventListener('resize', resize);
addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'play') {
    state.mode = 'pause';
    ui.pause.classList.remove('hidden');
  }
  if (!document.hidden && audioCtx?.state === 'suspended') audioCtx.resume();
});

resize();
refreshHud();
document.getElementById('btn-mute').textContent = muted ? '×' : '♪';
requestAnimationFrame(loop);
window.__qa = { startLevel, state, buildStage, validateStage };
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('service-worker.js', import.meta.url), { updateViaCache: 'none' }).catch(() => {});
}
