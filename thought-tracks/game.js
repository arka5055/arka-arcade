import { onLeaveApp, resumeAudio } from '/leave-pause.js';
import {
  W, H, PALETTE,
  opposite, hypot, portPoint, houseOffset, polyLen, along,
  buildStage, validateStage, liveEdge, nextLiveEdge,
  tokenParts, tokenLabel, stageFor, L14_RUNGS, goalLine,
} from './graph.js?v=9';
import {
  HUB_R, HIT_R,
  strokeCenterline, drawHub, drawBlade, drawPortsDebug,
  committedHub,
} from './switch.js?v=9';
import { thumbnail, stageMeta } from './stages.js?v=10';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SAVE_KEY = 'thought-tracks-v14';
const SPEED = 36;
const TAP_COALESCE = 0.04;
const DECISION_HORIZON = 2.5;

const ui = {
  time: document.getElementById('hud-time'),
  correct: document.getElementById('hud-correct'),
  goal: document.getElementById('hud-goal'),
  title: document.getElementById('title'),
  pause: document.getElementById('pause'),
  done: document.getElementById('done'),
  stages: document.getElementById('stages'),
  grid: document.getElementById('stage-grid'),
};

let audioCtx = null;
let muted = false;
let best = 0;
let unlocked = 16;
let lastPlayed = 1;
let records = {};
let cleared = {};
let stagesReturn = 'play';
let savedRung = 0;
try {
  const save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
  best = save.best || 0;
  muted = !!save.muted;
  unlocked = 16;
  lastPlayed = Math.max(1, Math.min(16, save.last || save.level || 1));
  records = save.records && typeof save.records === 'object' ? save.records : {};
  cleared = save.cleared && typeof save.cleared === 'object' ? save.cleared : {};
  savedRung = save.rung || 0;
} catch {}

const state = {
  mode: 'title',
  level: 1,
  score: 0,
  home: 0,
  missed: 0,
  allowed: 3,
  quota: 6,
  spawned: 0,
  spawnIn: 1,
  remaining: 34,
  bag: [],
  pace: 1,
  graph: null,
  trains: [],
  fx: [],
  hint: 0,
  flash: 0,
  nextId: 1,
  tapQueue: null,
  debug: /[?&]debug=1/.test(location.search),
  rung: savedRung,
  recovery: 0,
  lastLaunch: 0,
  lastPtr: null,
};

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 16, best, muted, unlocked: 16, last: lastPlayed, rung: state.rung, records, cleared,
    }));
  } catch {}
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

function chime(ok) {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime;
  const notes = ok ? [523, 784, 1046] : [220, 164];
  notes.forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = ok ? 'sine' : 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(ok ? 0.045 : 0.03, t + i * 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.16);
    o.connect(g).connect(audioCtx.destination);
    o.start(t + i * 0.06);
    o.stop(t + i * 0.06 + 0.18);
  });
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

function paintToken(ctx, token, drawPath) {
  const parts = tokenParts(token);
  if (parts.length === 1) {
    ctx.fillStyle = PALETTE[parts[0]] || '#3d8f44';
    drawPath();
    ctx.fill();
    return;
  }
  ctx.save();
  drawPath();
  ctx.clip();
  ctx.fillStyle = PALETTE[parts[0]] || '#3d8f44';
  ctx.fillRect(-22, -24, 22, 44);
  ctx.fillStyle = PALETTE[parts[1]] || '#1c1c1c';
  ctx.fillRect(0, -24, 22, 44);
  ctx.restore();
  drawPath();
}

function switchCommitted(sw) {
  return false;
}

function mergeBusy(merge, except) {
  return state.trains.some((tr) => {
    if (tr === except) return false;
    return distToNode(tr, merge) < 30 + ((tr.cars || 1) - 1) * 10;
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

function shuffleBag(tokens, count) {
  const each = Math.floor(count / tokens.length);
  let extra = count - each * tokens.length;
  const fair = () => {
    const bag = [];
    let rem = extra;
    for (const t of tokens) {
      for (let i = 0; i < each; i++) bag.push(t);
      if (rem > 0) { bag.push(t); rem -= 1; }
    }
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  };
  for (let n = 0; n < 80; n++) {
    const bag = fair();
    if (tokens.length === 2) {
      if (bag[0] === bag[1]) continue;
      let run = 1, bad = false;
      for (let i = 1; i < bag.length; i++) {
        run = bag[i] === bag[i - 1] ? run + 1 : 1;
        if (run > 2) bad = true;
      }
      if (bad) continue;
    }
    return bag;
  }
  const alt = [];
  for (let i = 0; i < count; i++) alt.push(tokens[i % tokens.length]);
  return alt;
}

function pickColor(source) {
  if (state.bag.length) return state.bag.shift();
  const used = {};
  for (const tr of state.trains) used[tr.color] = (used[tr.color] || 0) + 1;
  const ranked = source.packet.slice().sort((a, b) => (used[a] || 0) - (used[b] || 0));
  return ranked[0];
}

function nextSwitchEta(tr) {
  let remain = polyLen(tr.edge.pts) - tr.dist;
  let node = state.graph.nodes[tr.edge.to.nodeId];
  let guard = 0;
  while (node && guard++ < 20) {
    if (node.kind === 'switch') return remain / SPEED;
    if (node.kind === 'station') return Infinity;
    const edge = nextLiveEdge(state.graph, node);
    if (!edge) return Infinity;
    remain += polyLen(edge.pts);
    node = state.graph.nodes[edge.to.nodeId];
  }
  return Infinity;
}

function decisionPressure() {
  return state.trains.filter((tr) => nextSwitchEta(tr) <= DECISION_HORIZON).length;
}

function spawnCutoff() {
  const travel = (state.graph?.longest || 180) / SPEED;
  return travel + 1;
}

function canRelease(source) {
  const spec = state.spec;
  if (state.remaining <= spawnCutoff()) return false;
  if (state.trains.length >= spec.cap) return false;
  if (decisionPressure() >= spec.pressure) return false;
  const edge = nextLiveEdge(state.graph, source);
  return Boolean(edge);
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
    cars: 1,
    steam: 0,
    committedEdge: null,
    hubPts: null,
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
  sw.prevArm = sw.arm;
  sw.arm = sw.arm ? 0 : 1;
  sw.anim = 1;
  sw.flash = 0.5;
  burst(sw.x, sw.y, '#e7f6d4', 10, { speed: 90, lift: 8, life: 0.22, r: 2.2 });
  beep(420, 0.04, 'square', 0.035);
  retargetTrains(sw);
}

function retargetTrains(sw) {
  for (const tr of state.trains) {
    if (tr.edge?.hub && tr.edge.from?.nodeId === sw.id) {
      const len = polyLen(tr.edge.pts) || 1;
      if (tr.dist / len > 0.55) continue;
      const t = tr.dist / len;
      tr.committedArm = sw.arm;
      tr.committedEdge = nextLiveEdge(state.graph, sw);
      tr.hubPts = committedHub(sw);
      tr.edge = { pts: tr.hubPts, hub: true, from: { nodeId: sw.id }, to: { nodeId: sw.id } };
      tr.dist = t * (polyLen(tr.edge.pts) || 1);
      continue;
    }
    const ahead = state.graph.nodes[tr.edge?.to.nodeId];
    if (ahead === sw && !tr.edge?.hub) {
      tr.committedEdge = null;
      tr.hubPts = null;
      tr.committedArm = null;
    }
  }
}

function toggleSwitchAt(p) {
  if (state.mode !== 'play') return;
  let hit = null;
  let bestD = HIT_R;
  for (const n of Object.values(state.graph.nodes)) {
    if (n.kind !== 'switch') continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bestD) { bestD = d; hit = n; }
  }
  if (!hit) return;
  const now = performance.now() / 1000;
  if (state.tapQueue && state.tapQueue.id === hit.id && now - state.tapQueue.t < TAP_COALESCE) return;
  state.tapQueue = { id: hit.id, t: now };
  requestToggle(hit);
}

function finishTrain(tr, station) {
  const spec = state.spec;
  const ok = station?.kind === 'station' && station.color === tr.color;
  const accent = PALETTE[tokenParts(ok ? station.color : tr.color)[0]] || '#eef3e4';
  const pts = 100 * Math.min(state.level, 14);
  state.trains = state.trains.filter((t) => t !== tr);
  if (ok) {
    state.home += 1;
    state.score += pts;
    state.recovery = Math.max(0, (state.recovery || 0) - 1);
    state.pace = state.recovery > 0 ? spec.min / spec.nom : Math.max(0.88, (state.pace || 1) * 0.97);
    if (state.level === 1) state.hint = 0;
    station.pulse = 1.1;
    burst(station.x, station.y - 10, accent, 18, { speed: 120, lift: 70, life: 0.7, r: 3 });
    state.fx.push({ kind: 'ring', x: station.x, y: station.y, t: 0.55, life: 0.55, color: accent, r: 12 });
    state.fx.push({ kind: 'ring', x: station.x, y: station.y, t: 0.7, life: 0.7, color: '#eef3e4', r: 6 });
    state.fx.push({
      kind: 'float', x: station.x, y: station.y - 18, t: 0.9, life: 0.9,
      color: '#f7f4ea', text: `+${pts}`, vy: -46,
    });
    state.flash = 0.28;
    chime(true);
  } else {
    state.missed += 1;
    state.recovery = 2;
    state.pace = spec.max / spec.nom;
    const x = station?.x ?? W / 2;
    const y = station?.y ?? 400;
    burst(x, y, '#c9d2c0', 8, { speed: 36, lift: 10, life: 0.35 });
    state.fx.push({ kind: 'float', x, y: y - 12, t: 0.7, life: 0.7, color: '#e8d6d0', text: 'miss', vy: -24 });
    chime(false);
  }
  refreshHud();
}

function advanceTrain(tr, dt) {
  if (tr.edge?.hub) {
    const sw = state.graph.nodes[tr.edge.from.nodeId];
    const len0 = polyLen(tr.edge.pts) || 1;
    if (sw && tr.dist / len0 <= 0.55) {
      const t = tr.dist / len0;
      tr.committedArm = sw.arm;
      tr.committedEdge = nextLiveEdge(state.graph, sw);
      tr.hubPts = committedHub(sw);
      tr.edge = { pts: tr.hubPts, hub: true, from: { nodeId: sw.id }, to: { nodeId: sw.id } };
      tr.dist = t * (polyLen(tr.edge.pts) || 1);
    }
  }
  const nodeAhead = state.graph.nodes[tr.edge.to.nodeId];
  tr.dist += SPEED * dt;
  const len = polyLen(tr.edge.pts);
  if (tr.dist < len) return;
  if (tr.edge.hub) {
    const sw = state.graph.nodes[tr.edge.from.nodeId];
    tr.edge = tr.committedEdge || nextLiveEdge(state.graph, sw);
    tr.dist = 0;
    tr.hubPts = null;
    tr.committedEdge = null;
    return;
  }
  if (nodeAhead.kind === 'station') {
    finishTrain(tr, nodeAhead);
    return;
  }
  if (nodeAhead.kind === 'switch') {
    tr.committedArm = nodeAhead.arm;
    tr.committedEdge = nextLiveEdge(state.graph, nodeAhead);
    tr.hubPts = committedHub(nodeAhead);
    tr.edge = { pts: tr.hubPts, hub: true, from: { nodeId: nodeAhead.id }, to: { nodeId: nodeAhead.id } };
    tr.dist = 0;
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
  const s = state.spec;
  const recover = (state.recovery || 0) > 0 ? 1.35 : 1;
  return Math.max(0.7, s.nom * (state.pace || 1) * recover);
}

function roundPassed() {
  const spec = state.spec;
  if (spec.need) return state.home >= spec.need;
  return state.missed <= spec.miss;
}

function failWhy() {
  const spec = state.spec;
  if (spec.need) return `Route at least ${spec.need} of ${spec.total} correctly to advance.`;
  return `Level ${spec.id} allows at most ${spec.miss} miss${spec.miss === 1 ? '' : 'es'}.`;
}

function endRound(advanced) {
  if (state.score > best) best = state.score;
  const rec = records[state.level];
  if (!rec || state.home > rec.home || (state.home === rec.home && state.score > (rec.score || 0))) {
    records[state.level] = { home: state.home, quota: state.quota, score: state.score, cleared: !!(rec && rec.cleared) };
  }
  if (advanced) {
    cleared[state.level] = true;
    records[state.level] = { ...(records[state.level] || {}), home: Math.max(state.home, records[state.level]?.home || 0), quota: state.quota, score: Math.max(state.score, records[state.level]?.score || 0), cleared: true };
  }
  lastPlayed = state.level;
  persist();
  state.mode = 'done';
  state.cleared = advanced;
  if (advanced && state.level === 14) {
    if (state.missed <= 1) state.rung = Math.min(L14_RUNGS.length - 1, (state.rung || 0) + 1);
    else if (state.missed >= 4) state.rung = Math.max(0, (state.rung || 0) - 1);
    persist();
  }
  ui.done.classList.remove('hidden');
  document.getElementById('done-title').textContent = advanced ? `Level ${state.level} cleared` : 'Round over';
  document.getElementById('done-home').textContent = `${state.home} / ${state.quota}`;
  document.getElementById('done-miss').textContent = String(state.missed);
  document.getElementById('done-score').textContent = String(state.score);
  document.getElementById('done-best').textContent = String(best);
  const why = document.getElementById('done-why');
  if (why) {
    why.textContent = advanced ? `Goal met · ${goalLine(state.spec)}` : failWhy();
  }
  document.getElementById('btn-again').textContent = advanced && state.level < 16 ? 'NEXT LEVEL' : 'PLAY AGAIN';
}

function startLevel(level, rung = state.rung) {
  lastPlayed = level;
  persist();
  const spec = stageFor(level, level === 14 ? rung : 0);
  const graph = buildStage(level, level === 14 ? rung : 0);
  const report = validateStage(graph);
  if (!report.ok) console.warn('[tracks] map issues', report.errors);
  Object.assign(state, {
    mode: 'play',
    level,
    rung: level === 14 ? rung : state.rung,
    spec,
    missed: 0,
    allowed: spec.miss,
    quota: spec.total,
    spawned: 0,
    spawnIn: level === 1 ? 1.1 : 0.8,
    remaining: spec.time,
    pace: 1,
    graph,
    trains: [],
    fx: [],
    hint: spec.intro ? (level === 1 ? 99 : 3.4) : 0,
    intro: spec.intro || '',
    flash: 0,
    home: 0,
    score: 0,
    nextId: 1,
    tapQueue: null,
    recovery: 0,
    lastLaunch: 0,
    bag: shuffleBag(spec.tokens, spec.total),
  });
  ui.title?.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.done.classList.add('hidden');
  refreshHud();
}

function startGame() { startLevel(lastPlayed || 1); }

function trainLabel(n) { return n === 1 ? '1 train' : `${n} trains`; }

function renderStages() {
  document.getElementById('stages-continue').textContent = 'Tap any stage. Cleared maps stay marked.';
  ui.grid.replaceChildren();
  for (let level = 1; level <= 16; level++) {
    const meta = stageMeta(level);
    const rec = records[level];
    const done = !!(cleared[level] || rec?.cleared);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `stage-card${done ? ' cleared' : ''}${level === lastPlayed ? ' continue' : ''}`;
    card.setAttribute('aria-label', done ? `Level ${level} cleared` : `Level ${level}`);
    const shot = thumbnail(level);
    const view = document.createElement('canvas');
    view.width = shot.width;
    view.height = shot.height;
    view.getContext('2d').drawImage(shot, 0, 0);
    card.append(view);
    if (level === lastPlayed) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'CONTINUE';
      card.append(tag);
    }
    if (done) {
      const mark = document.createElement('span');
      mark.className = 'cleared-mark';
      mark.textContent = 'CLEARED';
      card.append(mark);
    }
    const title = document.createElement('b');
    title.textContent = `LEVEL ${level}`;
    const stations = document.createElement('span');
    stations.className = 'meta';
    stations.textContent = `${meta.stations} stations`;
    const trains = document.createElement('span');
    trains.className = 'meta';
    trains.textContent = `up to ${trainLabel(meta.cap)}`;
    const bestLine = document.createElement('span');
    bestLine.className = 'best';
    bestLine.textContent = rec ? `Best: ${rec.home} / ${rec.quota}` : 'Best: —';
    const goal = document.createElement('span');
    goal.className = 'meta';
    goal.textContent = `Goal: ${goalLine(stageFor(level, 0))}`;
    card.append(title, stations, trains, goal, bestLine);
    card.addEventListener('click', () => pickStage(level));
    ui.grid.append(card);
  }
}

function openStages(from = 'play') {
  unlockAudio();
  stagesReturn = from;
  if (from === 'play' && state.mode === 'play') state.mode = 'pause';
  ui.pause.classList.add('hidden');
  ui.done.classList.add('hidden');
  renderStages();
  ui.stages.classList.remove('hidden');
}

function closeStages() {
  ui.stages.classList.add('hidden');
  if (stagesReturn === 'done') {
    ui.done.classList.remove('hidden');
    return;
  }
  if (state.graph && state.mode === 'pause') {
    state.mode = 'play';
    last = performance.now();
  }
}

function pickStage(level) {
  ui.stages.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.done.classList.add('hidden');
  startLevel(level);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function refreshHud() {
  ui.correct.textContent = `${state.home} of ${state.quota}`;
  ui.time.textContent = formatTime(Math.max(0, state.remaining));
  if (ui.goal && state.spec) ui.goal.textContent = goalLine(state.spec);
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
  strokeCenterline(ctx, pts, {
    alpha: live ? 1 : 0.42,
    bed: live ? '#e7ead8' : '#c5cbb8',
    gauge: live ? '#2a3424' : '#3a4436',
  });
}

function drawInner(sw) {
  drawBlade(ctx, sw);
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
    ctx.shadowColor = PALETTE[tokenParts(st.color)[0]] || '#eef3e4';
    ctx.shadowBlur = 16;
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = '#f3f6ee';
  paintToken(ctx, st.color, () => roundRect(-15, -9, 30, 22, 4));
  ctx.stroke();
  paintToken(ctx, st.color, () => {
    ctx.beginPath();
    ctx.moveTo(-17, -7);
    ctx.lineTo(0, -20);
    ctx.lineTo(17, -7);
    ctx.closePath();
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f7f4ea';
  ctx.beginPath();
  ctx.arc(0, 4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c2818';
  ctx.font = '800 10px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tokenLabel(st.color), 0, 4);
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
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d7ddc8';
  ctx.lineWidth = 2;
  ctx.stroke();
  const waiting = state.trains.filter((tr) => distToNode(tr, m) < 36).length;
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
    if (i === 0) {
      paintToken(ctx, tr.color, () => roundRect(-13, -7, 24, 14, 3));
      ctx.stroke();
      paintToken(ctx, tr.color, () => roundRect(4, -14, 7, 8, 2));
      ctx.stroke();
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
      ctx.fillText(tokenLabel(tr.color), -1, 0);
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
  for (const n of Object.values(g.nodes)) if (n.kind === 'switch') drawHub(ctx, n);
  for (const e of g.edges) strokeRail(e.pts, true);
  for (const n of Object.values(g.nodes)) if (n.kind === 'switch') drawBlade(ctx, n);
  for (const n of Object.values(g.nodes)) if (n.kind === 'merge') drawMerge(n);
  for (const s of g.sources) drawSource(s);
  for (const n of Object.values(g.nodes)) if (n.kind === 'station') drawStation(n);
  for (const tr of state.trains) drawLoco(tr);
  drawFx();
  if (state.debug) {
    for (const n of Object.values(g.nodes)) if (n.kind === 'switch') drawPortsDebug(ctx, n);
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
  if (state.hint > 0 && state.intro) {
    ctx.globalAlpha = Math.min(1, state.hint);
    ctx.fillStyle = '#eef3e4';
    ctx.font = '800 12px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    const words = state.intro.split(' ');
    let line = '', y = 116;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > 340) {
        ctx.fillText(line, W / 2, y);
        line = w;
        y += 16;
      } else line = test;
    }
    if (line) ctx.fillText(line, W / 2, y);
    ctx.globalAlpha = 1;
  }
}

function step(dt) {
  if (state.mode !== 'play') return;
  state.remaining = Math.max(0, state.remaining - dt);
  if (!(state.level === 1 && state.home === 0)) state.hint = Math.max(0, state.hint - dt);
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
        n.anim = Math.min(1, (n.anim ?? 1) + dt / 0.08);
        n.flash = Math.max(0, (n.flash || 0) - dt * 3);
      }
      if (n.kind === 'station') n.pulse = Math.max(0, (n.pulse || 0) - dt);
    }
  }
  for (const tr of state.trains) {
    const to = state.graph.nodes[tr.edge.to.nodeId];
    const remain = polyLen(tr.edge.pts) - tr.dist;
    if (tr.edge.hub || (to?.kind === 'station' && remain < 46)) continue;
    tr.steam = (tr.steam || 0) - dt;
    if (tr.steam <= 0) {
      const p = trainPos(tr);
      puff(p.x + Math.cos(p.ang) * 8, p.y + Math.sin(p.ang) * 8 - 10, 'rgba(238,243,228,0.85)');
      tr.steam = 0.2;
    }
  }

  const spec = state.spec;
  const cutoff = state.remaining <= spawnCutoff();
  const doneSpawning = cutoff || state.spawned >= state.quota;
  const idle = doneSpawning && state.trains.length === 0;
  if (state.remaining <= 0 || idle) {
    endRound(roundPassed());
    return;
  }
  if (!doneSpawning) {
    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      if (spawnTrain()) state.spawnIn = spawnGap();
      else state.spawnIn = 0.18;
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
  ev.stopPropagation();
  unlockAudio();
  if (state.mode !== 'play') return;
  const now = performance.now();
  if (ev.pointerType === 'mouse' && state.lastPtr && state.lastPtr.type !== 'mouse' && now - state.lastPtr.t < 800) return;
  if (state.lastPtr && ev.pointerId !== state.lastPtr.id && now - state.lastPtr.t < 50) return;
  state.lastPtr = { t: now, type: ev.pointerType, id: ev.pointerId };
  toggleSwitchAt(worldFromEvent(ev));
}, { passive: false });
canvas.addEventListener('click', (ev) => { ev.preventDefault(); }, { passive: false });

function restartGame(ev) {
  ev?.preventDefault();
  ev?.stopPropagation();
  openStages(state.mode === 'done' ? 'done' : 'play');
}

document.getElementById('btn-again').addEventListener('click', () => {
  unlockAudio();
  ui.done.classList.add('hidden');
  if (state.cleared && state.level < 16) startLevel(state.level + 1);
  else startLevel(state.level);
});
document.getElementById('btn-restart').addEventListener('pointerdown', restartGame);
document.getElementById('btn-restart').addEventListener('click', restartGame);
document.getElementById('btn-new').addEventListener('pointerdown', restartGame);
document.getElementById('btn-new').addEventListener('click', restartGame);
document.getElementById('btn-stages').addEventListener('click', () => openStages('done'));
document.getElementById('btn-stages-close').addEventListener('click', closeStages);
document.getElementById('btn-pause').addEventListener('click', () => {
  if (state.mode !== 'play') return;
  state.mode = 'pause';
  ui.pause.classList.remove('hidden');
});
document.getElementById('btn-resume').addEventListener('click', () => {
  ui.pause.classList.add('hidden');
  if (state.mode === 'pause') state.mode = 'play';
  last = performance.now();
});
document.getElementById('btn-mute').addEventListener('click', () => {
  muted = !muted;
  persist();
  document.getElementById('btn-mute').textContent = muted ? '×' : '♪';
});

addEventListener('resize', resize);
function pauseForLeave() {
  if (state.mode !== 'play') return;
  state.mode = 'pause';
  ui.pause.classList.remove('hidden');
}
onLeaveApp(pauseForLeave);
addEventListener('visibilitychange', () => {
  if (!document.hidden) resumeAudio(audioCtx);
});

resize();
refreshHud();
document.getElementById('btn-mute').textContent = muted ? '×' : '♪';
startGame();
requestAnimationFrame(loop);
window.__qa = { startLevel, state, buildStage, validateStage, openStages, pickStage, get unlocked() { return unlocked; }, setUnlocked(n) { unlocked = n; } };
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('service-worker.js', import.meta.url), { updateViaCache: 'none' }).catch(() => {});
}
