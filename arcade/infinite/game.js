import { onLeaveApp } from "/leave-pause.js";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];
const SAVE = "arcade-infinite-v1";
const AI = "O";
const HUMAN = "X";

function emptyState() {
  return {
    board: Array(9).fill(null),
    queues: { X: [], O: [] },
    turn: "X",
    winner: null,
    winLine: null,
  };
}

function clone(state) {
  return {
    board: state.board.slice(),
    queues: { X: state.queues.X.slice(), O: state.queues.O.slice() },
    turn: state.turn,
    winner: state.winner,
    winLine: state.winLine ? state.winLine.slice() : null,
  };
}

function winningLine(board, player) {
  return LINES.find((line) => line.every((i) => board[i] === player)) || null;
}

function applyMove(state, cell) {
  if (state.winner || state.board[cell] != null) return null;
  const next = clone(state);
  const player = next.turn;
  const queue = next.queues[player];
  if (queue.length >= 3) next.board[queue.shift()] = null;
  next.board[cell] = player;
  queue.push(cell);
  const line = winningLine(next.board, player);
  if (line) {
    next.winner = player;
    next.winLine = line;
  } else {
    next.turn = player === "X" ? "O" : "X";
  }
  return next;
}

function fadingCell(state) {
  const queue = state.queues[state.turn];
  return queue.length >= 3 ? queue[0] : null;
}

function empties(state) {
  return ORDER.filter((i) => state.board[i] == null);
}

function winningMoves(state) {
  return empties(state).filter((cell) => applyMove(state, cell)?.winner === state.turn);
}

function keyOf(state) {
  return `${state.turn}|${state.board.map((c) => c || ".").join("")}|${state.queues.X.join("")}|${state.queues.O.join("")}`;
}

function shape(state, player) {
  const oldest = state.queues[player][0];
  const vanish = state.queues[player].length >= 3 && state.turn === player;
  let score = 0;
  if (state.board[4] === player) score += 5;
  for (const i of [0, 2, 6, 8]) if (state.board[i] === player) score += 2;
  for (const line of LINES) {
    let mine = 0;
    let live = 0;
    let opp = 0;
    let empty = 0;
    for (const i of line) {
      const mark = state.board[i];
      if (mark === player) {
        mine += 1;
        if (!(vanish && i === oldest)) live += 1;
      } else if (mark) opp += 1;
      else empty += 1;
    }
    if (opp !== 0) continue;
    if (live === 2 && empty === 1) score += 18;
    else if (mine === 2 && empty === 1) score += 5;
    else if (live === 1 && empty === 2) score += 3;
  }
  return score;
}

function evaluate(state) {
  if (state.winner === AI) return 400;
  if (state.winner === HUMAN) return -400;
  return shape(state, AI) - shape(state, HUMAN);
}

function minimax(state, depth, alpha, beta, table, deadline) {
  if (state.winner || depth === 0) {
    const score = evaluate(state);
    return { score: score + (score > 0 ? depth : score < 0 ? -depth : 0), cell: -1 };
  }
  if (deadline && performance.now() > deadline) return { score: evaluate(state), cell: -1, cutoff: true };
  const cached = table.get(keyOf(state));
  if (cached && cached.depth >= depth) return { score: cached.score, cell: cached.cell };
  const moves = empties(state);
  if (!moves.length) return { score: 0, cell: -1 };
  const maximizing = state.turn === AI;
  let best = { score: maximizing ? -Infinity : Infinity, cell: moves[0] };
  const winsNow = winningMoves(state);
  const ordered = winsNow.concat(moves.filter((cell) => !winsNow.includes(cell)));
  for (const cell of ordered) {
    const next = applyMove(state, cell);
    if (!next) continue;
    const result = minimax(next, depth - 1, alpha, beta, table, deadline);
    if (result.cutoff) return result;
    if (maximizing) {
      if (result.score > best.score) best = { score: result.score, cell };
      alpha = Math.max(alpha, result.score);
    } else {
      if (result.score < best.score) best = { score: result.score, cell };
      beta = Math.min(beta, result.score);
    }
    if (beta <= alpha) break;
  }
  table.set(keyOf(state), { depth, score: best.score, cell: best.cell });
  return best;
}

function cpuMove(state) {
  const wins = winningMoves(state);
  if (wins.length) return wins[0];
  const table = new Map();
  let best = empties(state)[0] ?? 4;
  const deadline = performance.now() + 90;
  for (let depth = 2; depth <= 12; depth += 1) {
    const result = minimax(state, depth, -Infinity, Infinity, table, deadline);
    if (result.cutoff) break;
    if (result.cell >= 0) best = result.cell;
  }
  return best;
}

export { applyMove, cpuMove, emptyState, winningMoves, HUMAN, AI };

const boardEl = typeof document === "undefined" ? null : document.getElementById("board");
if (boardEl) {
  const turnEl = document.getElementById("turn");
  const hintEl = document.getElementById("hint");
  const scoreEl = document.getElementById("score");
  const doneEl = document.getElementById("done");
  const doneTitle = document.getElementById("done-title");
  const doneCopy = document.getElementById("done-copy");

let state = emptyState();
let locked = false;
let scores = { you: 0, cpu: 0 };

try {
  const saved = JSON.parse(localStorage.getItem(SAVE) || "null");
  if (typeof saved?.you === "number") scores = { you: saved.you, cpu: saved.cpu || 0 };
  else if (saved?.cpu?.you != null) scores = { you: saved.cpu.you, cpu: saved.cpu.cpu || 0 };
} catch {
  /* keep defaults */
}

function persist() {
  localStorage.setItem(SAVE, JSON.stringify(scores));
}

let audioCtx = null;
function tone(freq, dur = 0.09, type = "sine", gain = 0.05) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch {
    /* silent */
  }
}

function render() {
  const fade = fadingCell(state);
  for (let i = 0; i < 9; i += 1) {
    const cell = boardEl.children[i];
    const mark = state.board[i];
    cell.classList.toggle("is-fade", fade === i && !state.winner);
    cell.classList.toggle("is-win", Boolean(state.winLine?.includes(i)));
    cell.disabled = Boolean(state.winner || mark != null || locked);
    cell.replaceChildren();
    if (mark) {
      const img = document.createElement("img");
      img.className = "mark";
      img.src = `/infinite/art/${mark.toLowerCase()}.png`;
      img.alt = mark;
      img.draggable = false;
      cell.append(img);
    }
  }
  if (state.winner) {
    turnEl.textContent = state.winner === HUMAN ? "YOU WIN" : "CPU WINS";
    turnEl.className = `turn is-${state.winner.toLowerCase()}`;
  } else {
    turnEl.textContent = state.turn === HUMAN ? "YOUR MOVE" : "CPU THINKING";
    turnEl.className = `turn is-${state.turn.toLowerCase()}`;
  }
  scoreEl.textContent = `YOU ${scores.you} · CPU ${scores.cpu}`;
  hintEl.textContent = fade == null
    ? "You keep three marks. The oldest fades, then vanishes."
    : "The dashed mark will vanish on this turn.";
}

function showDone() {
  doneTitle.textContent = state.winner === HUMAN ? "You win" : "CPU wins";
  doneCopy.textContent = state.winner === HUMAN
    ? "Three in a row after the oldest mark vanished."
    : "The vanishing mark opened a line. Try again.";
  doneEl.classList.remove("hidden");
  tone(state.winner === HUMAN ? 523 : 196, 0.22, "triangle", 0.06);
}

let cpuTimer = 0;

function maybeCpu() {
  if (state.turn !== AI || state.winner) return;
  locked = true;
  render();
  const think = () => {
    cpuTimer = 0;
    if (document.hidden) {
      cpuTimer = window.setTimeout(think, 280);
      return;
    }
    const cell = cpuMove(state);
    const next = applyMove(state, cell);
    if (next) {
      state = next;
      tone(330, 0.08, "sine", 0.04);
    }
    locked = false;
    render();
    if (state.winner) {
      scores.cpu += 1;
      persist();
      showDone();
    }
  };
  cpuTimer = window.setTimeout(think, 280);
}

function play(cell) {
  if (locked || state.turn !== HUMAN) return;
  const next = applyMove(state, cell);
  if (!next) return;
  state = next;
  tone(494, 0.07);
  render();
  if (state.winner) {
    scores.you += 1;
    persist();
    showDone();
    return;
  }
  maybeCpu();
}

function start() {
  state = emptyState();
  locked = false;
  if (cpuTimer) window.clearTimeout(cpuTimer);
  cpuTimer = 0;
  doneEl.classList.add("hidden");
  render();
}

boardEl.replaceChildren();
for (let i = 0; i < 9; i += 1) {
  const cell = document.createElement("button");
  cell.className = "cell";
  cell.type = "button";
  cell.setAttribute("aria-label", `Cell ${i + 1}`);
  cell.addEventListener("click", () => play(i));
  boardEl.append(cell);
}

document.getElementById("btn-again").addEventListener("click", start);
document.getElementById("btn-new").addEventListener("click", start);

onLeaveApp(() => {
  /* Turn-based: maybeCpu already waits while document.hidden. */
});

start();
}
