import { onLeaveApp, resumeAudio } from '/leave-pause.js';
import { loadGhost, saveGhost, pullServer } from '/progress.js?v=9';
import {
  W, H, PALETTE, hypot, houseOffset, polyLen, along,
  buildStage, nextLiveEdge, liveDestination, tokenParts, tokenLabel,
} from '/tracks/graph.js?v=41';
import {
  HIT_R, HUB_R, strokeCenterline, drawHub, drawBlade, drawBladeCue, committedHub, alongPts,
} from '/tracks/switch.js?v=40';
import { thumbnail } from '/tracks/stages.js?v=19';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SPEED = 34;
const LAST = 9;

const STAGES = [
  { id: 1, map: 1, hide: 1, study: 2.2, delay: 0.4, trials: 5, need: 4, miss: 1, mode: 'predict', intro: 'Study the switch. Then tap where the train will go.' },
  { id: 2, map: 1, hide: 1, study: 2.0, delay: 1.6, trials: 6, need: 5, miss: 1, mode: 'predict', intro: 'Hold that switch a little longer before the train leaves.' },
  { id: 3, map: 3, hide: 1, study: 2.4, delay: 0.8, trials: 6, need: 5, miss: 2, mode: 'predict', intro: 'One switch vanishes. The others stay visible.' },
  { id: 4, map: 3, hide: 2, study: 2.6, delay: 1.0, trials: 7, need: 5, miss: 2, mode: 'predict', intro: 'Hold two switch states at once.' },
  { id: 5, map: 4, hide: 2, study: 2.6, delay: 0.6, trials: 7, need: 5, miss: 2, mode: 'reroute', intro: 'Change one switch so the train reaches the shown station.' },
  { id: 6, map: 4, hide: 2, study: 2.4, delay: 2.2, trials: 7, need: 5, miss: 2, mode: 'predict', interference: true, intro: 'Another train will pass. Keep the hidden route in mind.' },
  { id: 7, map: 5, hide: 3, study: 2.8, delay: 1.2, trials: 8, need: 6, miss: 2, mode: 'predict', intro: 'Three hidden switches. Scan, then hold.' },
  { id: 8, map: 5, hide: 3, study: 2.6, delay: 2.6, trials: 8, need: 6, miss: 2, mode: 'reroute', interference: true, intro: 'Hold three states, then change one.' },
  { id: 9, map: 5, hide: 4, study: 3.0, delay: 3.0, trials: 8, need: 6, miss: 3, mode: 'predict', interference: true, intro: 'The whole board goes dark. Reason from what you kept.' },
];

const ui = {
  stage: document.getElementById('hud-stage'),
  span: document.getElementById('hud-span'),
  trial: document.getElementById('hud-trial'),
  goal: document.getElementById('hud-goal'),
  prompt: document.getElementById('prompt'),
  pause: document.getElementById('pause'),
  done: document.getElementById('done'),
  stages: document.getElementById('stages'),
  grid: document.getElementById('stage-grid'),
};

let audioCtx = null;
let muted = false;
let best = 0;
let unlocked = LAST;
let lastPlayed = 1;
let records = {};
let cleared = {};
let stagesReturn = 'play';

try {
  const save = loadGhost();
  best = save.best || 0;
  unlocked = LAST;
  lastPlayed = save.last || 1;
  records = save.records || {};
  cleared = save.cleared || {};
  muted = !!save.muted;
} catch {}
pullServer().then((next) => {
  if (!next?.ghost) return;
  best = Math.max(best, next.ghost.best || 0);
  lastPlayed = next.ghost.last || lastPlayed;
  records = { ...records, ...(next.ghost.records || {}) };
  cleared = { ...cleared, ...(next.ghost.cleared || {}) };
});

const state = {
  mode: 'play',
  phase: 'study',
  level: 1,
  spec: STAGES[0],
  graph: null,
  hidden: new Set(),
  train: null,
  decoy: null,
  guess: null,
  goal: null,
  studyArm: {},
  timer: 0,
  ghost: 0,
  intro: 0,
  trial: 0,
  home: 0,
  missed: 0,
  span: 0,
  score: 0,
  fx: [],
};

function persist() {
  saveGhost({
    best, muted, last: lastPlayed, unlocked: LAST,
    records, cleared,
  });
}

function beep(freq, dur, type = 'sine', gain = 0.04) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch {}
}

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}

function switchesOf(graph) {
  return Object.values(graph.nodes).filter((n) => n.kind === 'switch');
}

function depthOrder(graph) {
  const src = graph.sources[0];
  const dist = { [src.id]: 0 };
  const q = [src];
  while (q.length) {
    const n = q.shift();
    for (const e of graph.edges) {
      if (e.from.nodeId !== n.id) continue;
      const nxt = graph.nodes[e.to.nodeId];
      if (dist[nxt.id] != null) continue;
      dist[nxt.id] = (dist[n.id] || 0) + 1;
      q.push(nxt);
    }
  }
  return switchesOf(graph).sort((a, b) => (dist[b.id] || 0) - (dist[a.id] || 0));
}

function pickHidden(graph, n) {
  const ordered = depthOrder(graph);
  return new Set(ordered.slice(0, Math.min(n, ordered.length)).map((s) => s.id));
}

function randomizeArms(graph, chunky) {
  const list = switchesOf(graph);
  const arm = Math.random() < 0.5 ? 0 : 1;
  for (const sw of list) sw.arm = chunky ? arm : (Math.random() < 0.5 ? 0 : 1);
}

function oneFlipOptions(graph) {
  const now = liveDestination(graph);
  const opts = [];
  for (const sw of switchesOf(graph)) {
    sw.arm = sw.arm ? 0 : 1;
    const dest = liveDestination(graph);
    sw.arm = sw.arm ? 0 : 1;
    if (dest && dest.id !== now?.id) opts.push({ sw, dest });
  }
  return opts;
}

function netChanges() {
  return switchesOf(state.graph).filter((sw) => sw.arm !== state.studyArm[sw.id]).length;
}

function startTrial() {
  const spec = state.spec;
  const graph = buildStage(spec.map);
  const chunky = Math.random() < 0.4;
  randomizeArms(graph, chunky);
  const hidden = pickHidden(graph, spec.hide);
  const studyArm = {};
  for (const sw of switchesOf(graph)) studyArm[sw.id] = sw.arm;
  let goal = null;
  if (spec.mode === 'reroute') {
    const opts = oneFlipOptions(graph);
    goal = opts.length ? opts[Math.floor(Math.random() * opts.length)].dest : liveDestination(graph);
  }
  state.graph = graph;
  state.hidden = hidden;
  state.studyArm = studyArm;
  state.goal = goal;
  state.guess = null;
  state.train = null;
  state.decoy = null;
  state.phase = 'study';
  state.timer = spec.study;
  state.ghost = 0;
  state.intro = spec.intro && state.trial === 0 ? 2.2 : 0;
  for (const n of Object.values(graph.nodes)) if (n.kind === 'station') n.pulse = 0;
}

function spawnTrain(kind = 'puzzle') {
  const src = state.graph.sources[0];
  const edge = nextLiveEdge(state.graph, src);
  if (!edge) return null;
  return { kind, edge, dist: 18, bob: 0 };
}

function beginPlay() {
  state.phase = 'play';
  state.train = spawnTrain('puzzle');
  beep(220, 0.08, 'triangle', 0.03);
}

function beginHold() {
  state.phase = 'hold';
  state.timer = state.spec.delay;
  if (state.spec.interference) state.decoy = spawnTrain('decoy');
}

function nextEdgeFor(tr) {
  const node = state.graph.nodes[tr.edge.to.nodeId];
  if (!node) return null;
  if (node.kind === 'station') return { station: node };
  if (node.kind === 'switch') {
    return { hub: true, sw: node, pts: committedHub(node), next: nextLiveEdge(state.graph, node) };
  }
  const edge = nextLiveEdge(state.graph, node);
  return edge ? { edge } : null;
}

function advance(tr, dt, speed) {
  if (tr.edge?.hub) {
    const sw = state.graph.nodes[tr.edge.from.nodeId];
    const len0 = polyLen(tr.edge.pts) || 1;
    if (sw && tr.dist / len0 <= 0.55) {
      const t = tr.dist / len0;
      tr.edge = { pts: committedHub(sw), hub: true, from: { nodeId: sw.id }, to: { nodeId: sw.id } };
      tr.dist = t * (polyLen(tr.edge.pts) || 1);
    }
  }
  tr.dist += speed * dt;
  const len = polyLen(tr.edge.pts);
  if (tr.dist < len) return null;
  if (tr.edge.hub) {
    const sw = state.graph.nodes[tr.edge.from.nodeId];
    tr.edge = tr.nextEdge || nextLiveEdge(state.graph, sw);
    tr.dist = 0;
    tr.nextEdge = null;
    return null;
  }
  const step = nextEdgeFor(tr);
  if (step?.station) return step.station;
  if (step?.hub) {
    tr.nextEdge = step.next;
    tr.edge = { pts: step.pts, hub: true, from: { nodeId: step.sw.id }, to: { nodeId: step.sw.id } };
    tr.dist = 0;
    return null;
  }
  if (step?.edge) {
    tr.edge = step.edge;
    tr.dist = 0;
  }
  return null;
}

function resolveTrial(ok, station) {
  if (state.phase === 'result') return;
  state.phase = 'result';
  state.timer = ok ? 0.7 : 1.15;
  if (station) station.pulse = 1;
  if (ok) {
    state.home += 1;
    state.span += 1;
    state.score += 100 * state.level;
    beep(523, 0.12, 'sine', 0.05);
  } else {
    state.missed += 1;
    state.span = 0;
    state.ghost = 0.75;
    beep(164, 0.16, 'square', 0.04);
  }
  if (state.span > best) best = state.span;
  persist();
  refreshHud();
}

function finishTrial() {
  if (state.missed > state.spec.miss) {
    endRound(false);
    return;
  }
  state.trial += 1;
  if (state.trial >= state.spec.trials) {
    endRound(state.home >= state.spec.need);
    return;
  }
  startTrial();
  refreshHud();
}

function roundPassed() {
  return state.missed <= state.spec.miss && state.home >= state.spec.need;
}

function endRound(ok) {
  state.mode = 'done';
  state.phase = 'done';
  const k = String(state.level);
  const rec = records[k] || {};
  records[k] = {
    home: Math.max(state.home, rec.home || 0),
    quota: state.spec.trials,
    score: Math.max(state.score, rec.score || 0),
    span: Math.max(state.span, rec.span || 0),
    cleared: !!(rec.cleared || ok),
  };
  if (ok) cleared[k] = true;
  if (state.score > best) best = state.score;
  persist();
  ui.done.classList.remove('hidden');
  document.getElementById('done-title').textContent = ok ? 'Stage cleared' : 'Round over';
  document.getElementById('done-why').textContent = ok
    ? 'The layout stayed in mind long enough to use it.'
    : `Need ${state.spec.need} of ${state.spec.trials} without more than ${state.spec.miss} miss${state.spec.miss === 1 ? '' : 'es'}.`;
  document.getElementById('done-home').textContent = `${state.home} / ${state.spec.trials}`;
  document.getElementById('done-miss').textContent = String(state.missed);
  document.getElementById('done-span').textContent = String(state.span);
  document.getElementById('done-best').textContent = String(best);
}

function startLevel(level) {
  lastPlayed = level;
  persist();
  const spec = STAGES[level - 1];
  Object.assign(state, {
    mode: 'play',
    phase: 'study',
    level,
    spec,
    trial: 0,
    home: 0,
    missed: 0,
    span: 0,
    score: 0,
    fx: [],
    ghost: 0,
  });
  ui.pause.classList.add('hidden');
  ui.done.classList.add('hidden');
  ui.stages.classList.add('hidden');
  startTrial();
  refreshHud();
}

function refreshHud() {
  ui.stage.textContent = String(state.level);
  ui.span.textContent = String(state.span);
  ui.trial.textContent = `${Math.min(state.trial + 1, state.spec.trials)} of ${state.spec.trials}`;
  const left = Math.max(0, state.spec.miss - state.missed);
  ui.goal.textContent = `${left} LEFT`;
  document.getElementById('pause-stage').textContent = `Stage ${state.level}`;
  document.getElementById('btn-mute').textContent = muted ? '×' : '♪';
  const spec = state.spec;
  if (state.intro > 0) ui.prompt.textContent = spec.intro;
  else if (state.phase === 'study') ui.prompt.textContent = 'Remember the switches.';
  else if (state.phase === 'hold') ui.prompt.textContent = spec.mode === 'reroute'
    ? `Send it to ${tokenLabel(state.goal?.color || '')}`
    : 'Hold the route.';
  else if (state.phase === 'play' && spec.mode === 'predict') ui.prompt.textContent = 'Tap the station it will reach.';
  else if (state.phase === 'play' && spec.mode === 'reroute') ui.prompt.textContent = `Change one switch · ${tokenLabel(state.goal?.color || '')}`;
  else if (state.phase === 'result' && state.ghost > 0) ui.prompt.textContent = 'That was the forgotten turnout.';
  else ui.prompt.textContent = '';
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  const sx = innerWidth / W;
  const sy = innerHeight / H;
  ctx.setTransform(dpr * sx, 0, 0, dpr * sy, 0, 0);
}

function worldFromEvent(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) / r.width) * W,
    y: ((ev.clientY - r.top) / r.height) * H,
  };
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

function paintToken(pathFn, token) {
  const parts = tokenParts(token);
  pathFn();
  if (parts.length === 1) {
    ctx.fillStyle = PALETTE[parts[0]] || '#3d8f44';
    ctx.fill();
    return;
  }
  ctx.save();
  pathFn();
  ctx.clip();
  ctx.fillStyle = PALETTE[parts[0]] || '#3d8f44';
  ctx.fillRect(-40, -40, 40, 80);
  ctx.fillStyle = PALETTE[parts[1]] || '#1c1c1c';
  ctx.fillRect(0, -40, 40, 80);
  ctx.restore();
  pathFn();
}

function drawStation(st) {
  const off = houseOffset(st.port);
  const dual = tokenParts(st.color).length === 2;
  const hx = st.x + off.x;
  const hy = st.y + off.y;
  const bw = dual ? 44 : 34;
  const bh = dual ? 26 : 22;
  const chosen = state.guess === st.id || state.goal?.id === st.id;
  ctx.save();
  ctx.strokeStyle = '#efe6cc';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(st.x, st.y);
  ctx.lineTo(st.x + off.x * 0.42, st.y + off.y * 0.42);
  ctx.stroke();
  ctx.translate(hx, hy);
  ctx.fillStyle = 'rgba(40, 36, 30, 0.26)';
  ctx.beginPath();
  ctx.ellipse(1, 16, dual ? 25 : 21, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (st.pulse > 0) {
    ctx.shadowColor = PALETTE[tokenParts(st.color)[0]];
    ctx.shadowBlur = 14;
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = chosen ? 3 : 2.2;
  ctx.strokeStyle = chosen ? '#f6e7a2' : '#fbf6e8';
  paintToken(() => roundRect(-bw / 2, -bh / 2 + 2, bw, bh, 3), st.color);
  ctx.stroke();
  ctx.fillStyle = '#f3ead8';
  ctx.fillRect(-bw / 2 - 5, -bh / 2 - 3, bw + 10, 5);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f7f4ea';
  ctx.beginPath();
  ctx.arc(0, 5, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c2818';
  ctx.font = '800 10px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tokenLabel(st.color), 0, 5);
  ctx.restore();
}

function drawSource(src) {
  ctx.save();
  ctx.translate(src.x, src.y);
  ctx.fillStyle = 'rgba(40, 36, 30, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 28, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9b89a';
  ctx.fillRect(-22, -16, 28, 28);
  ctx.fillStyle = '#d8cbb0';
  ctx.fillRect(-22, -20, 36, 6);
  ctx.fillStyle = '#1a1814';
  ctx.beginPath();
  ctx.arc(8, 0, 9, -0.7, 0.7);
  ctx.fill();
  ctx.restore();
}

function drawLoco(tr) {
  const p = along(tr.edge.pts, tr.dist);
  if (!p) return;
  const decoy = tr.kind === 'decoy';
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.ang || 0);
  ctx.globalAlpha = decoy ? 0.55 : 1;
  ctx.fillStyle = 'rgba(12, 10, 8, 0.38)';
  ctx.beginPath();
  ctx.ellipse(1, 12, 13.5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  roundRect(-15, -9, 28, 16, 5);
  ctx.fillStyle = decoy ? '#9aa08e' : '#3a3f38';
  ctx.fill();
  ctx.strokeStyle = '#f7f1dc';
  ctx.lineWidth = 2.35;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 250, 230, 0.5)';
  ctx.fillRect(-13, -8, 24, 3.6);
  ctx.fillStyle = '#1a2218';
  ctx.fillRect(11.5, -23, 3.4, 7);
  ctx.restore();
}

function hiddenNow(sw) {
  if (!state.hidden.has(sw.id)) return false;
  if (state.phase === 'study') return false;
  if (state.ghost > 0) return false;
  return true;
}

function drawBoard() {
  ctx.fillStyle = '#e4dccb';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(80, 72, 60, 0.045)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 18) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += 18) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const g = state.graph;
  if (!g) return;
  for (const e of g.edges) strokeCenterline(ctx, e.pts, { alpha: 1, width: 12, bed: '#efe6cc', gauge: '#2a2418', cap: 'round' });
  for (const n of Object.values(g.nodes)) {
    if (n.kind === 'source') drawSource(n);
    if (n.kind === 'station') drawStation(n);
  }
  for (const sw of switchesOf(g)) {
    drawHub(ctx, sw);
    if (hiddenNow(sw)) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#e8dfc4';
      ctx.font = '800 16px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', sw.x, sw.y + 1);
      ctx.restore();
    } else {
      if (state.ghost > 0 && state.hidden.has(sw.id)) ctx.globalAlpha = 0.55;
      drawBlade(ctx, sw);
      drawBladeCue(ctx, sw);
      ctx.globalAlpha = 1;
    }
  }
  if (state.decoy) drawLoco(state.decoy);
  if (state.train) drawLoco(state.train);
}

function tapBoard(p) {
  if (state.mode !== 'play') return;
  if (state.phase !== 'play' && state.phase !== 'hold') return;
  let hitSw = null;
  let bestD = HIT_R;
  for (const sw of switchesOf(state.graph)) {
    const d = hypot(p, sw);
    if (d < bestD) { bestD = d; hitSw = sw; }
  }
  if (hitSw && state.spec.mode === 'reroute' && (state.phase === 'hold' || state.phase === 'play')) {
    hitSw.arm = hitSw.arm ? 0 : 1;
    beep(420, 0.04, 'square', 0.03);
    if (state.phase === 'hold') beginPlay();
    return;
  }
  if (state.spec.mode !== 'predict' || state.phase !== 'play') return;
  let hitSt = null;
  let bestS = 52;
  for (const n of Object.values(state.graph.nodes)) {
    if (n.kind !== 'station') continue;
    const off = houseOffset(n.port);
    const d = Math.hypot(p.x - (n.x + off.x), p.y - (n.y + off.y));
    if (d < bestS) { bestS = d; hitSt = n; }
  }
  if (!hitSt) return;
  state.guess = hitSt.id;
  beep(330, 0.05, 'sine', 0.03);
}

function step(dt) {
  if (state.mode !== 'play') return;
  state.intro = Math.max(0, state.intro - dt);
  state.ghost = Math.max(0, state.ghost - dt);
  if (state.phase === 'study') {
    state.timer -= dt;
    if (state.timer <= 0) beginHold();
  } else if (state.phase === 'hold') {
    state.timer -= dt;
    if (state.decoy) {
      const arrived = advance(state.decoy, dt, SPEED * 1.35);
      if (arrived) state.decoy = null;
    }
    if (state.timer <= 0 && state.spec.mode === 'predict') beginPlay();
    if (state.timer <= -4 && state.spec.mode === 'reroute') beginPlay();
  } else if (state.phase === 'play') {
    if (state.decoy) {
      const arrived = advance(state.decoy, dt, SPEED * 1.35);
      if (arrived) state.decoy = null;
    }
    if (state.train) {
      const dest = advance(state.train, dt, SPEED);
      if (dest) {
        const ok = state.spec.mode === 'predict'
          ? state.guess === dest.id
          : dest.id === state.goal?.id && netChanges() === 1;
        resolveTrial(ok, dest);
      }
    }
  } else if (state.phase === 'result') {
    state.timer -= dt;
    if (state.timer <= 0) finishTrial();
  }
  for (const n of Object.values(state.graph?.nodes || {})) {
    if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - dt);
  }
  refreshHud();
}

function renderStages() {
  ui.grid.innerHTML = '';
  document.getElementById('stages-continue').textContent = `Continue stage ${lastPlayed}. Tap any stage.`;
  for (const spec of STAGES) {
    const card = document.createElement('button');
    card.className = 'stage-card';
    if (spec.id === lastPlayed) card.classList.add('current');
    const shot = document.createElement('div');
    shot.className = 'shot';
    shot.append(thumbnail(spec.map));
    const num = document.createElement('span');
    num.className = 'stage-num';
    num.textContent = String(spec.id);
    shot.append(num);
    if (cleared[String(spec.id)]) {
      const tick = document.createElement('span');
      tick.className = 'cleared-tick';
      tick.textContent = '✓';
      shot.append(tick);
    }
    const title = document.createElement('strong');
    title.textContent = `STAGE ${spec.id}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = spec.mode === 'reroute' ? `${spec.hide} hidden · reroute` : `${spec.hide} hidden · predict`;
    card.append(shot, title, meta);
    card.addEventListener('click', () => {
      closeStages();
      startLevel(spec.id);
    });
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
  if (stagesReturn === 'done') ui.done.classList.remove('hidden');
  else if (state.mode === 'pause') ui.pause.classList.remove('hidden');
}

function render() {
  drawBoard();
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
  tapBoard(worldFromEvent(ev));
}, { passive: false });

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
document.getElementById('btn-restart').addEventListener('click', () => openStages(state.mode === 'done' ? 'done' : 'play'));
document.getElementById('btn-new').addEventListener('click', () => openStages('play'));
document.getElementById('btn-stages').addEventListener('click', () => openStages('done'));
document.getElementById('btn-stages-close').addEventListener('click', closeStages);
document.getElementById('btn-again').addEventListener('click', () => {
  ui.done.classList.add('hidden');
  if (cleared[String(state.level)] && state.level < LAST) startLevel(state.level + 1);
  else startLevel(state.level);
});
document.getElementById('btn-mute').addEventListener('click', () => {
  muted = !muted;
  persist();
  refreshHud();
});

onLeaveApp(() => {
  if (state.mode !== 'play') return;
  state.mode = 'pause';
  ui.pause.classList.remove('hidden');
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    resumeAudio(audioCtx);
    last = performance.now();
  }
});

addEventListener('resize', resize);
resize();
startLevel(lastPlayed || 1);
requestAnimationFrame(loop);
