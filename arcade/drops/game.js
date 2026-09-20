import { onLeaveApp, resumeAudio } from '/leave-pause.js';
import { loadDrops, saveDrops, pullServer } from '/progress.js?v=8';

const W = 390;
const WATER = 0.86;
const LANES = [22, 41, 61, 81];
const GOAL = 8;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  level: document.getElementById('hud-level'),
  score: document.getElementById('hud-score'),
  goal: document.getElementById('hud-goal'),
  lives: document.getElementById('hud-lives'),
  entry: document.getElementById('entry'),
  keys: document.getElementById('keys'),
  pause: document.getElementById('pause'),
  done: document.getElementById('done'),
};

let best = 0;
try { best = loadDrops().best || 0; } catch {}
pullServer().then((next) => {
  if (next?.drops?.best) best = Math.max(best, next.drops.best);
});

let audioCtx = null;
const state = fresh();
let last = performance.now();
let H = 640;

function fresh() {
  return {
    mode: 'play',
    level: 1,
    lives: 3,
    score: 0,
    streak: 0,
    cleared: 0,
    drops: [],
    entry: '',
    spawnIn: 0.28,
    wrongs: 0,
    freeze: 0,
    hint: 2.6,
    shake: 0,
    tempo: 1,
    bursts: [],
    splashes: [],
    toast: null,
    nextId: 1,
    t: 0,
  };
}

function persist() {
  if (state.score > best) best = state.score;
  saveDrops({ best, last: state.score, level: state.level });
}

function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function makeEq(level) {
  const ops = level >= 4 ? ['+', '-', '×', '÷'] : level >= 3 ? ['+', '-', '×'] : level >= 2 ? ['+', '-'] : ['+'];
  const op = ops[rand(0, ops.length - 1)];
  const hi = 7 + level * 5;
  if (op === '+') {
    const a = rand(2, hi), b = rand(2, hi);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (op === '-') {
    const a = rand(4, hi + 6), b = rand(1, a - 1);
    return { text: `${a} − ${b}`, answer: a - b };
  }
  if (op === '×') {
    const a = rand(2, Math.min(12, 3 + level)), b = rand(2, 9);
    return { text: `${a} × ${b}`, answer: a * b };
  }
  const a = rand(2, 9), b = rand(2, 9);
  return { text: `${a * b} ÷ ${a}`, answer: b };
}

function fallSpeed() { return Math.min(22, (4.6 + state.level * 0.85) * state.tempo); }
function spawnGap() { return Math.max(0.72, 2.4 - state.level * 0.18 - (state.tempo - 1) * 0.35); }
function maxDrops() { return Math.min(5, 2 + Math.floor((state.level - 1) / 2)); }

function spawnDrop() {
  const taken = state.drops.filter((d) => d.y < 26).map((d) => d.x);
  const free = LANES.filter((x) => !taken.some((t) => Math.abs(t - x) < 14));
  const pool = free.length ? free : LANES;
  const x = pool[rand(0, pool.length - 1)];
  const sun = state.level >= 2 && Math.random() < 0.11;
  state.drops.push({
    id: state.nextId++, x, y: 32, ...makeEq(state.level),
    sun, born: 0,
  });
  state.spawnIn = spawnGap();
}

function burst(x, y, pts) {
  state.bursts.push({
    x, y, life: 0.7, pts,
    bits: Array.from({ length: 12 }, () => {
      const a = Math.random() * Math.PI * 2;
      const s = 16 + Math.random() * 36;
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 8, life: 0.45 + Math.random() * 0.25 };
    }),
  });
}

function splash(x) {
  state.splashes.push({
    x, life: 0.55,
    bits: Array.from({ length: 10 }, () => ({
      x, y: WATER * 100, vx: (Math.random() - 0.5) * 38, vy: -16 - Math.random() * 26, life: 0.35 + Math.random() * 0.2,
    })),
  });
}

function toast(text) {
  state.toast = { text, life: 1.1 };
}

function chime(ok) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    resumeAudio(audioCtx);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = ok ? 'triangle' : 'sawtooth';
    o.frequency.value = ok ? 640 : 176;
    g.gain.value = 0.045;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
    o.stop(audioCtx.currentTime + 0.13);
  } catch {}
}

function popMatches(answer) {
  const hits = state.drops.filter((d) => d.answer === answer);
  if (!hits.length) return false;
  const sunHit = hits.find((d) => d.sun);
  const scored = sunHit ? hits.filter((d) => d.sun || d.answer === sunHit.answer) : hits;
  const gone = sunHit ? state.drops.slice() : hits;
  for (const d of gone) burst(d.x, d.y, scored.includes(d) ? 500 : 0);
  state.drops = sunHit ? [] : state.drops.filter((d) => d.answer !== answer);
  const n = scored.length;
  state.streak += 1;
  state.cleared += n;
  state.score += 500 * n;
  state.tempo = Math.min(2.35, state.tempo + 0.07 * n);
  if (sunHit) toast('CLEAR');
  if (state.cleared >= GOAL) {
    state.level += 1;
    state.cleared = 0;
    state.score += 400 + state.level * 80;
    state.drops = [];
    state.spawnIn = 0.85;
    toast(`LEVEL ${state.level}`);
  }
  persist();
  chime(true);
  return true;
}

function miss(drop) {
  splash(drop.x);
  if (drop.sun) return;
  state.lives -= 1;
  state.streak = 0;
  state.tempo = Math.max(0.68, state.tempo - 0.14);
  state.entry = '';
  state.shake = 0.32;
  chime(false);
  if (state.lives <= 0) endRound();
}

function endRound() {
  persist();
  state.mode = 'done';
  ui.done.classList.remove('hidden');
  document.getElementById('done-title').textContent = 'Pond overflow';
  document.getElementById('done-copy').textContent = `Level ${state.level} · best ${best}`;
  document.getElementById('done-score').textContent = String(state.score);
}

function submit() {
  if (state.mode !== 'play' || state.freeze > 0 || !state.entry) return;
  const n = Number(state.entry);
  state.entry = '';
  if (!popMatches(n)) {
    state.wrongs += 1;
    state.streak = 0;
    state.shake = 0.18;
    if (state.wrongs >= 3) {
      state.freeze = 1.2;
      state.wrongs = 0;
    }
    chime(false);
  } else {
    state.wrongs = 0;
  }
  refresh();
}

function typeDigit(d) {
  if (state.mode !== 'play' || state.freeze > 0 || state.entry.length >= 3) return;
  state.entry += d;
  refresh();
}

function clearEntry() {
  state.entry = '';
  refresh();
}

function restart() {
  Object.assign(state, fresh());
  ui.done.classList.add('hidden');
  ui.pause.classList.add('hidden');
  last = performance.now();
  refresh();
}

function pause() {
  if (state.mode !== 'play') return;
  state.mode = 'pause';
  ui.pause.classList.remove('hidden');
}

function resume() {
  ui.pause.classList.add('hidden');
  if (state.mode === 'pause') state.mode = 'play';
  last = performance.now();
}

function refresh() {
  ui.level.textContent = String(state.level);
  ui.score.textContent = String(state.score);
  ui.goal.textContent = `${state.cleared}/${GOAL}`;
  const pips = ui.lives.querySelectorAll('i');
  pips.forEach((el, i) => el.classList.toggle('off', i >= state.lives));
  ui.entry.textContent = state.entry || (state.freeze > 0 ? 'WAIT' : '—');
  ui.entry.classList.toggle('frozen', state.freeze > 0);
  ui.keys.classList.toggle('frozen', state.freeze > 0);
}

function drawBg(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b2422');
  g.addColorStop(0.42, '#16413b');
  g.addColorStop(1, '#082524');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(232,244,238,0.12)';
  for (let i = 0; i < 18; i++) {
    const x = (i * 73 + t * 6) % W;
    const y = 18 + (i * 29) % 90;
    ctx.beginPath();
    ctx.arc(x, y, i % 4 === 0 ? 1.4 : 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const wy = H * WATER;
  const water = ctx.createLinearGradient(0, wy, 0, H);
  water.addColorStop(0, '#1c5b54');
  water.addColorStop(1, '#071c1b');
  ctx.fillStyle = water;
  ctx.fillRect(0, wy, W, H - wy);

  ctx.strokeStyle = 'rgba(238,243,228,0.28)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 6) ctx.lineTo(x, wy + Math.sin(x / 16 + t * 2.2) * 2.6);
  ctx.stroke();

  ctx.fillStyle = '#061b1a';
  for (let i = 0; i < 11; i++) {
    const x = 6 + i * 36;
    const h = 54 + (i % 3) * 18;
    ctx.fillRect(x, H - h * 0.35, 4, h * 0.35);
    ctx.beginPath();
    ctx.ellipse(x + 2, wy + 8 + (i % 2) * 4, 9, 16, -0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSun(size) {
  ctx.fillStyle = '#f3e0a6';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * 0.2, Math.sin(a) * size * 0.2);
    ctx.lineTo(Math.cos(a - 0.18) * size * 0.62, Math.sin(a - 0.18) * size * 0.62);
    ctx.lineTo(Math.cos(a + 0.18) * size * 0.62, Math.sin(a + 0.18) * size * 0.62);
    ctx.closePath();
    ctx.fill();
  }
  const grd = ctx.createRadialGradient(-6, -6, 2, 0, 0, size * 0.42);
  grd.addColorStop(0, '#fff6d4');
  grd.addColorStop(1, '#d7b56a');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTeardrop() {
  const grd = ctx.createLinearGradient(0, -34, 0, 28);
  grd.addColorStop(0, '#fff0b8');
  grd.addColorStop(0.55, '#e4c57a');
  grd.addColorStop(1, '#b77d42');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.bezierCurveTo(8, -20, 22, -4, 22, 10);
  ctx.bezierCurveTo(22, 24, 12, 30, 0, 30);
  ctx.bezierCurveTo(-12, 30, -22, 24, -22, 10);
  ctx.bezierCurveTo(-22, -4, -8, -20, 0, -34);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.beginPath();
  ctx.ellipse(-8, -8, 5, 10, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawDrop(d) {
  const x = (d.x / 100) * W;
  const y = (d.y / 100) * H;
  const born = Math.min(1, d.born);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.72 + 0.28 * born, 0.72 + 0.28 * born);
  ctx.shadowColor = d.sun ? '#c9e6c4' : '#e4c57a';
  ctx.shadowBlur = 14;
  if (d.sun) drawSun(52);
  else drawTeardrop();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#193b3c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const long = d.text.length > 7;
  ctx.font = `800 ${long ? 12 : 14}px Trebuchet MS, sans-serif`;
  ctx.fillText(d.text, 0, d.sun ? 1 : 8);
  ctx.restore();
}

function drawFx(dt) {
  for (const b of state.bursts) {
    b.life -= dt;
    const u = Math.max(0, b.life / 0.7);
    const x = (b.x / 100) * W;
    const y = (b.y / 100) * H;
    ctx.save();
    ctx.globalAlpha = u * 0.85;
    ctx.strokeStyle = '#c9e6c4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, (1 - u) * 46 + 8, 0, Math.PI * 2);
    ctx.stroke();
    if (b.pts) {
      ctx.globalAlpha = u;
      ctx.fillStyle = '#c9e6c4';
      ctx.font = '800 16px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`+${b.pts}`, x, y - (1 - u) * 34);
    }
    for (const p of b.bits) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 48 * dt;
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = '#e8f4ee';
      ctx.beginPath();
      ctx.arc((p.x / 100) * W, (p.y / 100) * H, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  state.bursts = state.bursts.filter((b) => b.life > 0);
  for (const s of state.splashes) {
    s.life -= dt;
    ctx.save();
    for (const p of s.bits) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt;
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = '#9fd4c8';
      ctx.beginPath();
      ctx.arc((p.x / 100) * W, (p.y / 100) * H, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  state.splashes = state.splashes.filter((s) => s.life > 0);
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

function render(dt) {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  H = W * (canvas.clientHeight / Math.max(1, canvas.clientWidth));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * 8 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * 6 : 0;
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, shakeX, shakeY);
  drawBg(state.t);
  for (const d of [...state.drops].sort((a, b) => a.y - b.y)) drawDrop(d);
  drawFx(dt);
  if (state.hint > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.hint);
    ctx.fillStyle = 'rgba(7,28,27,0.78)';
    roundRect(24, H * WATER - 52, W - 48, 34, 12);
    ctx.fill();
    ctx.fillStyle = '#e8f4ee';
    ctx.font = '700 12px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Solve each drop before it hits the water.', W / 2, H * WATER - 30);
    ctx.restore();
  }
  if (state.toast && state.toast.life > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.toast.life * 1.6);
    ctx.fillStyle = '#eef3e4';
    ctx.font = '800 22px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.toast.text, W / 2, H * 0.38);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function step(dt) {
  if (state.mode !== 'play') return;
  state.t += dt;
  state.hint = Math.max(0, state.hint - dt);
  state.shake = Math.max(0, state.shake - dt);
  state.freeze = Math.max(0, state.freeze - dt);
  if (state.toast) state.toast.life -= dt;
  state.spawnIn -= dt;
  if (state.spawnIn <= 0 && state.drops.length < maxDrops()) spawnDrop();
  for (const d of state.drops) {
    d.y += fallSpeed() * dt;
    d.born = Math.min(1, d.born + dt * 4);
  }
  const sunk = state.drops.filter((d) => d.y / 100 >= WATER);
  if (sunk.length) {
    for (const d of sunk) miss(d);
    state.drops = state.drops.filter((d) => d.y / 100 < WATER);
  }
}

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  step(dt);
  render(dt);
  refresh();
  requestAnimationFrame(loop);
}

ui.keys.innerHTML = '';
['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'POP'].forEach((label) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (label === 'POP') b.className = 'pop';
  if (label === 'CLR') b.className = 'clr';
  b.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    resumeAudio(audioCtx);
    if (label === 'POP') submit();
    else if (label === 'CLR') clearEntry();
    else typeDigit(label);
  });
  ui.keys.append(b);
});

window.addEventListener('keydown', (ev) => {
  if (ev.key >= '0' && ev.key <= '9') typeDigit(ev.key);
  else if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
  else if (ev.key === 'Backspace') { ev.preventDefault(); clearEntry(); }
  else if (ev.key === 'Escape') pause();
});

document.getElementById('btn-new').addEventListener('click', restart);
document.getElementById('btn-again').addEventListener('click', restart);
document.getElementById('btn-pause-new').addEventListener('click', restart);
document.getElementById('btn-pause').addEventListener('click', pause);
document.getElementById('btn-resume').addEventListener('click', resume);
onLeaveApp(pause);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resumeAudio(audioCtx);
});

refresh();
requestAnimationFrame(loop);

window.__mathDrop = { get state() { return state; }, submit, typeDigit, pause, resume, restart };
