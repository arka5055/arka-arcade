const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const SAVE = "arcade-infinite-v1";

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
  if (queue.length >= 3) {
    const oldest = queue.shift();
    next.board[oldest] = null;
  }
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
  const cells = [];
  for (let i = 0; i < 9; i += 1) if (state.board[i] == null) cells.push(i);
  return cells;
}

function evaluate(state, ai) {
  if (state.winner === ai) return 120;
  if (state.winner) return -120;
  return 0;
}

function minimax(state, ai, depth, alpha, beta) {
  const score = evaluate(state, ai);
  if (score !== 0 || depth === 0) return { score: score + (score > 0 ? depth : score < 0 ? -depth : 0), cell: -1 };
  const moves = empties(state);
  if (!moves.length) return { score: 0, cell: -1 };
  const maximizing = state.turn === ai;
  let best = { score: maximizing ? -Infinity : Infinity, cell: moves[0] };
  for (const cell of moves) {
    const next = applyMove(state, cell);
    if (!next) continue;
    const result = minimax(next, ai, depth - 1, alpha, beta);
    if (maximizing) {
      if (result.score > best.score) best = { score: result.score, cell };
      alpha = Math.max(alpha, result.score);
    } else {
      if (result.score < best.score) best = { score: result.score, cell };
      beta = Math.min(beta, result.score);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function cpuMove(state) {
  const depth = empties(state).length >= 7 ? 5 : 8;
  return minimax(state, "O", depth, -Infinity, Infinity).cell;
}

const boardEl = document.getElementById("board");
const turnEl = document.getElementById("turn");
const hintEl = document.getElementById("hint");
const scoreEl = document.getElementById("score");
const titleEl = document.getElementById("title");
const doneEl = document.getElementById("done");
const doneTitle = document.getElementById("done-title");
const doneCopy = document.getElementById("done-copy");

let mode = "cpu";
let state = emptyState();
let locked = false;
let scores = { cpu: { you: 0, cpu: 0 }, hotseat: { X: 0, O: 0 } };

try {
  const saved = JSON.parse(localStorage.getItem(SAVE) || "null");
  if (saved?.cpu) scores = saved;
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
      const glyph = document.createElement("span");
      glyph.className = `mark mark-${mark.toLowerCase()}`;
      cell.append(glyph);
    }
  }
  if (state.winner) {
    turnEl.textContent = state.winner === "X" ? (mode === "cpu" ? "YOU WIN" : "X WINS") : mode === "cpu" ? "CPU WINS" : "O WINS";
    turnEl.className = `turn is-${state.winner.toLowerCase()}`;
  } else {
    const yours = mode === "cpu" && state.turn === "X";
    turnEl.textContent = yours ? "YOUR MOVE" : mode === "cpu" ? "CPU THINKING" : `${state.turn} TO MOVE`;
    turnEl.className = `turn is-${state.turn.toLowerCase()}`;
  }
  if (mode === "cpu") scoreEl.textContent = `YOU ${scores.cpu.you} · CPU ${scores.cpu.cpu}`;
  else scoreEl.textContent = `X ${scores.hotseat.X} · O ${scores.hotseat.O}`;
  hintEl.textContent = fade == null
    ? "You keep three marks. The oldest fades, then vanishes."
    : "The dashed mark will vanish on this turn.";
}

function showDone() {
  const youWin = mode === "cpu" ? state.winner === "X" : true;
  if (mode === "cpu") {
    doneTitle.textContent = state.winner === "X" ? "You win" : "CPU wins";
    doneCopy.textContent = state.winner === "X"
      ? "Three in a row after the oldest mark vanished."
      : "The vanishing mark opened a line. Try again.";
  } else {
    doneTitle.textContent = `${state.winner} wins`;
    doneCopy.textContent = "Pass the phone. First to three after a vanish.";
  }
  doneEl.classList.toggle("you", youWin);
  doneEl.classList.remove("hidden");
  tone(state.winner === "X" ? 523 : 196, 0.22, "triangle", 0.06);
}

function maybeCpu() {
  if (mode !== "cpu" || state.turn !== "O" || state.winner) return;
  locked = true;
  render();
  window.setTimeout(() => {
    const cell = cpuMove(state);
    const next = applyMove(state, cell);
    if (next) {
      state = next;
      tone(330, 0.08, "sine", 0.04);
    }
    locked = false;
    render();
    if (state.winner) {
      scores.cpu.cpu += 1;
      persist();
      showDone();
    }
  }, 420);
}

function play(cell) {
  if (locked) return;
  const next = applyMove(state, cell);
  if (!next) return;
  state = next;
  tone(state.turn === "O" || state.winner === "X" ? 494 : 392, 0.07);
  render();
  if (state.winner) {
    if (mode === "cpu") scores.cpu.you += 1;
    else scores.hotseat[state.winner] += 1;
    persist();
    showDone();
    return;
  }
  maybeCpu();
}

function start(nextMode) {
  mode = nextMode;
  state = emptyState();
  locked = false;
  titleEl.classList.add("hidden");
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

document.getElementById("btn-cpu").addEventListener("click", () => start("cpu"));
document.getElementById("btn-hotseat").addEventListener("click", () => start("hotseat"));
document.getElementById("btn-again").addEventListener("click", () => start(mode));
document.getElementById("btn-new").addEventListener("click", () => {
  doneEl.classList.add("hidden");
  titleEl.classList.remove("hidden");
  state = emptyState();
  render();
});
document.getElementById("btn-home").addEventListener("click", () => {
  window.location.assign("/");
});

render();
