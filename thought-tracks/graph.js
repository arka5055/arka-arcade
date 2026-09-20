import { HUB_R, DIR, PORT_ANG, opposite, hypot, switchPort, assertSwitchGeometry, trimRailToHubs } from './switch.js?v=26';

export const W = 390;
export const H = 844;
export { HUB_R, DIR, opposite, hypot, switchPort };
export const MERGE_R = 12;
export const PORT_R = { switch: HUB_R, merge: MERGE_R, station: 0, source: 0 };
export const PALETTE = {
  P: '#d46a9a', K: '#1c1c1c', G: '#3d8f44', Y: '#d4a017',
  B: '#3d8eb8', V: '#6b4f8a', W: '#e8eadc',
};
export const TOKENS = ['P', 'K', 'G', 'Y', 'B', 'V', 'W', 'GK', 'PW', 'BK', 'GP', 'YK', 'BP', 'VY'];
export const L14_RUNGS = [72, 78, 84, 90];

export function tokenParts(token) {
  if (!token) return ['P'];
  return token.length === 2 ? [token[0], token[1]] : [token];
}
export function tokenLabel(token) {
  const p = tokenParts(token);
  return p.length === 1 ? p[0] : `${p[0]}/${p[1]}`;
}
export function goalLine(spec) {
  if (spec.need) return `${spec.need} of ${spec.total}`;
  return spec.miss === 1 ? '≤1 MISS' : `≤${spec.miss} MISSES`;
}

function balancedBits(n) {
  const out = [];
  (function walk(prefix, leaves) {
    if (leaves === 1) { out.push(prefix); return; }
    const left = Math.ceil(leaves / 2);
    walk(`${prefix}0`, left);
    walk(`${prefix}1`, leaves - left);
  })('', n);
  return out;
}
function zipCodes(tokens, bits) {
  const codes = {};
  tokens.forEach((t, i) => { codes[t] = bits[i]; });
  return codes;
}

const LEVELS = [
  { id: 1, n: 2, shape: 'fork', cap: 1, conc: 1.0, pool: 6, time: 34, miss: 1, need: 5, pressure: 1, intro: 'Tap the green switch to send each train to the matching station.' },
  { id: 2, n: 2, shape: 'fork', cap: 2, conc: 1.5, pool: 10, time: 44, miss: 2, need: 8, pressure: 1, intro: 'A second train can leave before the first arrives.' },
  { id: 3, n: 3, shape: 'cascade', cap: 2, conc: 1.8, pool: 14, time: 54, miss: 3, pressure: 2, intro: 'Some stations need two switches.' },
  { id: 4, n: 4, shape: 'balanced', cap: 3, conc: 2.2, pool: 18, time: 64, miss: 3, pressure: 2, intro: 'Watch both sides of the board.' },
  { id: 5, n: 5, shape: 'mixed', cap: 3, conc: 2.6, pool: 22, time: 74, miss: 3, pressure: 2, intro: 'Prioritize the nearest switch, not the newest train.' },
  { id: 6, n: 6, shape: 'balanced', cap: 5, conc: 5.0, pool: 28, time: 84, miss: 3, pressure: 3, intro: 'Several trains may be on the rails at once.' },
  { id: 7, n: 7, shape: 'three', cap: 6, conc: 4.2, pool: 34, time: 94, miss: 3, pressure: 3, intro: 'Scan the whole board. Downstream switches stay set.' },
  { id: 8, n: 8, shape: 'balanced', cap: 5, conc: 4.0, pool: 42, time: 104, miss: 3, pressure: 3, intro: 'NEW: Two-color trains must match two-color stations.' },
  { id: 9, n: 9, shape: 'mixed', cap: 5, conc: 4.4, pool: 48, time: 108, miss: 3, pressure: 3, intro: 'Two switches can need a tap at almost the same time.' },
  { id: 10, n: 10, shape: 'long', cap: 6, conc: 4.8, pool: 56, time: 114, miss: 3, pressure: 3, intro: 'The first switch may serve two trains in a row.' },
  { id: 11, n: 11, shape: 'mixed', cap: 6, conc: 5.1, pool: 64, time: 120, miss: 2, pressure: 3, intro: 'At most 2 misses this round.' },
  { id: 12, n: 12, shape: 'three', cap: 6, conc: 5.4, pool: 68, time: 120, miss: 2, pressure: 3, intro: 'Park one plan. Service the nearer train. Resume.' },
  { id: 13, n: 13, shape: 'mixed', cap: 7, conc: 5.8, pool: 74, time: 120, miss: 1, pressure: 3, intro: 'At most 1 miss this round.' },
  { id: 14, n: 14, shape: 'balanced', cap: 7, conc: 6.2, pool: 72, time: 120, miss: 1, pressure: 3, intro: 'Releases adapt to how you play.' },
  { id: 15, n: 14, shape: 'long', cap: 7, conc: 6.4, pool: 90, time: 120, miss: 1, pressure: 3, intro: 'Opposite states at the same switch, closer together.' },
  { id: 16, n: 14, shape: 'three', cap: 7, conc: 6.6, pool: 90, time: 120, miss: 1, pressure: 3, intro: 'Hold the full board until the last train.' },
];

export function stageFor(level, rung = 0) {
  const row = LEVELS[level - 1];
  if (!row) throw new Error(`Unknown stage ${level}`);
  const tokens = TOKENS.slice(0, row.n);
  let pool = row.pool;
  let conc = row.conc;
  if (row.id === 14) {
    pool = L14_RUNGS[Math.max(0, Math.min(L14_RUNGS.length - 1, rung))];
    conc = 6.0 + rung * 0.15;
  }
  const gap = row.time / pool;
  const bits = row.n === 7
    ? ['000', '001', '01', '10', '110', '1110', '1111']
    : row.n === 6
    ? ['00', '010', '011', '10', '110', '111']
    : row.n === 3 ? ['0', '10', '11'] : balancedBits(row.n);
  return {
    id: row.id, n: row.n, shape: row.shape, miss: row.miss, need: row.need || 0,
    total: pool, time: row.time, intro: row.intro,
    nom: gap, min: gap, max: gap * 1.38, cap: row.cap, conc, pressure: row.pressure,
    tokens, codes: zipCodes(tokens, bits),
    sources: [{ id: 'TUNNEL', side: 'W', packet: tokens.slice() }],
  };
}
export const STAGE = LEVELS.map((row) => stageFor(row.id, 0));

export function portPoint(node, port, extra = 0) {
  const r = (PORT_R[node.kind] || 0) + extra;
  const d = DIR[port];
  return { x: node.x + d[0] * r, y: node.y + d[1] * r };
}
export function houseOffset(port) {
  const d = DIR[opposite(port)];
  return { x: d[0] * 30, y: d[1] * 30 };
}
function leafFor(codes, bits) { return Object.keys(codes).find((c) => codes[c] === bits); }
function leafCount(codes, prefix) {
  return Object.values(codes).filter((c) => c.startsWith(prefix)).length || 1;
}
function simplify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = out[out.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) < 1.2) continue;
    out.push(p);
  }
  return out;
}
function densify(pts, radius = 16) {
  if (pts.length < 3) return simplify(pts);
  const out = [{ ...pts[0] }];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ab = hypot(a, b), bc = hypot(b, c);
    const r = Math.min(radius, ab / 2 - 1, bc / 2 - 1);
    if (r < 4) { out.push({ ...b }); continue; }
    const ux = (b.x - a.x) / ab, uy = (b.y - a.y) / ab;
    const vx = (c.x - b.x) / bc, vy = (c.y - b.y) / bc;
    const p0 = { x: b.x - ux * r, y: b.y - uy * r };
    const p1 = { x: b.x + vx * r, y: b.y + vy * r };
    out.push(p0);
    for (let s = 1; s <= 5; s++) {
      const t = s / 6, omt = 1 - t;
      out.push({
        x: omt * omt * p0.x + 2 * omt * t * b.x + t * t * p1.x,
        y: omt * omt * p0.y + 2 * omt * t * b.y + t * t * p1.y,
      });
    }
    out.push(p1);
  }
  out.push({ ...pts[pts.length - 1] });
  return simplify(out);
}
export function polyLen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += hypot(pts[i - 1], pts[i]);
  return s || 1;
}
export function along(pts, dist) {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const seg = hypot(pts[i - 1], pts[i]);
    if (left <= seg) {
      const t = left / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
        ang: Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x),
      };
    }
    left -= seg;
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2] || last;
  return { x: last.x, y: last.y, ang: Math.atan2(last.y - prev.y, last.x - prev.x) };
}
function axis(port) {
  if (port === 'E' || port === 'W') return 'h';
  if (port === 'N' || port === 'S') return 'v';
  return 'd';
}
function routePorts(a, aPort, b, bPort) {
  const p0 = portPoint(a, aPort);
  const p1 = portPoint(b, bPort);
  if ((aPort === 'E' && bPort === 'W' || aPort === 'W' && bPort === 'E') && Math.abs(p0.y - p1.y) < 6) {
    return [{ ...p0 }, { x: p1.x, y: p0.y }];
  }
  if ((aPort === 'N' && bPort === 'S' || aPort === 'S' && bPort === 'N') && Math.abs(p0.x - p1.x) < 6) {
    return [{ ...p0 }, { x: p0.x, y: p1.y }];
  }
  const stub = 28;
  const a1 = { x: p0.x + DIR[aPort][0] * stub, y: p0.y + DIR[aPort][1] * stub };
  const b1 = { x: p1.x + DIR[bPort][0] * stub, y: p1.y + DIR[bPort][1] * stub };
  const pts = [{ ...p0 }, a1];
  if (axis(aPort) === 'v') {
    pts.push({ x: b1.x, y: a1.y });
    pts.push(b1);
  } else {
    pts.push({ x: a1.x, y: b1.y });
    pts.push(b1);
  }
  pts.push({ ...p1 });
  return densify(simplify(pts), 16);
}
function addEdge(edges, a, aPort, b, bPort) {
  const id = `${a.id}->${b.id}:${aPort}`;
  a.ports[aPort] = id;
  b.ports[bPort] = id;
  edges.push({
    id, from: { nodeId: a.id, port: aPort }, to: { nodeId: b.id, port: bPort },
    pts: routePorts(a, aPort, b, bPort), forward: { fromNodeId: a.id, toNodeId: b.id },
  });
}
function addCurve(edges, a, aPort, b, bPort) {
  const id = `${a.id}->${b.id}:${aPort}`;
  a.ports[aPort] = id;
  b.ports[bPort] = id;
  edges.push({
    id, from: { nodeId: a.id, port: aPort }, to: { nodeId: b.id, port: bPort },
    pts: curvePorts(a, aPort, b, bPort), forward: { fromNodeId: a.id, toNodeId: b.id },
  });
}
function curvePorts(a, aPort, b, bPort) {
  const p0 = portPoint(a, aPort);
  const p3 = portPoint(b, bPort);
  const da = DIR[aPort];
  const db = DIR[bPort];
  const dist = hypot(p0, p3);
  const L = Math.max(40, Math.min(96, dist * 0.45));
  const p1 = { x: p0.x + da[0] * L, y: p0.y + da[1] * L };
  const p2 = { x: p3.x + db[0] * L, y: p3.y + db[1] * L };
  const steps = Math.max(18, Math.round(dist / 7));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return pts;
}
function atPct(region, px, py) {
  return {
    x: region.x0 + (px / 100) * (region.x1 - region.x0),
    y: region.y0 + (py / 100) * (region.y1 - region.y0),
  };
}
function stationOnFarEdge(region, inDir, color) {
  const pad = 40;
  let x, y;
  if (inDir === 'N') { x = (region.x0 + region.x1) / 2; y = region.y1 - pad; }
  else if (inDir === 'S') { x = (region.x0 + region.x1) / 2; y = region.y0 + pad; }
  else if (inDir === 'W') { x = region.x1 - pad; y = (region.y0 + region.y1) / 2; }
  else { x = region.x0 + pad; y = (region.y0 + region.y1) / 2; }
  return { id: `ST:${color}`, kind: 'station', color, x, y, port: inDir, pulse: 0, ports: {} };
}
function splitForIncoming(inDir, region, sw, n0, n1) {
  const gap = 40, minShare = 110;
  const horiz = inDir === 'N' || inDir === 'S';
  const span = horiz ? region.x1 - region.x0 : region.y1 - region.y0;
  let share = span * (n0 / (n0 + n1));
  if (span > minShare * 2) share = Math.max(minShare, Math.min(span - minShare, share));
  if (horiz) {
    const mid = region.x0 + share;
    const y0 = inDir === 'N' ? sw.y + 80 : region.y0;
    const y1 = inDir === 'N' ? region.y1 : sw.y - 80;
    return { r0: { x0: region.x0, y0, x1: mid - gap / 2, y1 }, r1: { x0: mid + gap / 2, y0, x1: region.x1, y1 }, out0: 'W', out1: 'E' };
  }
  const mid = region.y0 + share;
  const x0 = inDir === 'W' ? sw.x + 80 : region.x0;
  const x1 = inDir === 'W' ? region.x1 : sw.x - 80;
  return { r0: { x0, y0: region.y0, x1, y1: mid - gap / 2 }, r1: { x0, y0: mid + gap / 2, x1, y1: region.y1 }, out0: 'N', out1: 'S' };
}
function angNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function facingPort(from, to, banned = []) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  let best = 'E';
  let bestD = 99;
  for (const name of Object.keys(PORT_ANG)) {
    if (banned.includes(name)) continue;
    const d = Math.abs(angNorm(PORT_ANG[name] - ang));
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}
function pullStation(st, sw, port) {
  const dir = DIR[port] || DIR.E;
  const min = 108;
  st.x = sw.x + dir[0] * min;
  st.y = sw.y + dir[1] * min;
  st.port = opposite(port);
  st.x = Math.max(28, Math.min(W - 28, st.x));
  st.y = Math.max(140, Math.min(H - 100, st.y));
}
function childInPort(child, parent) {
  if (child.kind === 'switch') {
    child.inPort = facingPort(child, parent, [child.out0, child.out1]);
    return child.inPort;
  }
  child.port = facingPort(child, parent);
  return child.port;
}
function layoutPrefix(prefix, region, inDir, nodes, edges, codes, parent = null) {
  const color = leafFor(codes, prefix);
  if (color) {
    const st = stationOnFarEdge(region, inDir, color);
    if (parent) st.port = facingPort(st, parent);
    nodes[st.id] = st;
    return st;
  }
  const sw = mkSw(`J:${prefix}`, prefix, (region.x0 + region.x1) / 2, (region.y0 + region.y1) / 2, inDir, 'W', 'E');
  if (prefix === '' && inDir === 'W') sw.x = region.x0 + 108;
  else if (inDir === 'N') sw.y = Math.min(sw.y, region.y0 + Math.max(70, (region.y1 - region.y0) * 0.38));
  else if (inDir === 'S') sw.y = Math.max(sw.y, region.y1 - Math.max(70, (region.y1 - region.y0) * 0.38));
  else if (inDir === 'W') sw.x = Math.min(sw.x, region.x0 + Math.max(70, (region.x1 - region.x0) * 0.38));
  else sw.x = Math.max(sw.x, region.x1 - Math.max(70, (region.x1 - region.x0) * 0.38));
  if (parent) sw.inPort = facingPort(sw, parent);
  nodes[sw.id] = sw;
  const n0 = leafCount(codes, `${prefix}0`);
  const n1 = leafCount(codes, `${prefix}1`);
  const split = splitForIncoming(sw.inPort, region, sw, n0, n1);
  const c0 = layoutPrefix(`${prefix}0`, split.r0, opposite(split.out0), nodes, edges, codes, sw);
  const c1 = layoutPrefix(`${prefix}1`, split.r1, opposite(split.out1), nodes, edges, codes, sw);
  sw.out0 = facingPort(sw, c0, [sw.inPort]);
  sw.out1 = facingPort(sw, c1, [sw.inPort, sw.out0]);
  sw.switchStates = { 0: { in: sw.inPort, out: sw.out0 }, 1: { in: sw.inPort, out: sw.out1 } };
  if (c0.kind === 'station') pullStation(c0, sw, sw.out0);
  if (c1.kind === 'station') pullStation(c1, sw, sw.out1);
  addEdge(edges, sw, sw.out0, c0, childInPort(c0, sw));
  addEdge(edges, sw, sw.out1, c1, childInPort(c1, sw));
  return sw;
}
function mkSw(id, prefix, x, y, inPort, out0, out1) {
  return {
    id, kind: 'switch', prefix, x, y, arm: 0, prevArm: 0, anim: 1, flash: 0, ports: {},
    inPort, out0, out1, switchStates: { 0: { in: inPort, out: out0 }, 1: { in: inPort, out: out1 } },
  };
}
function layoutTwo(nodes, edges, tokens, region) {
  const [pink, black] = tokens;
  const j = mkSw('J:', '', 148, 430, 'W', 'N', 'SE');
  const stP = {
    id: `ST:${pink}`, kind: 'station', color: pink,
    x: j.x, y: j.y - 122, port: 'S', pulse: 0, ports: {},
  };
  const stK = {
    id: `ST:${black}`, kind: 'station', color: black,
    x: j.x + 64, y: j.y + 118, port: 'N', pulse: 0, ports: {},
  };
  nodes[j.id] = j;
  nodes[stP.id] = stP;
  nodes[stK.id] = stK;
  addEdge(edges, j, 'N', stP, 'S');
  addEdge(edges, j, 'SE', stK, 'N');
  return j;
}
function layoutThree(nodes, edges, tokens, region) {
  const [a, b, c] = tokens;
  const j1 = mkSw('J:', '', 186, (region.y0 + region.y1) / 2, 'W', 'N', 'S');
  const j2 = mkSw('J:1', '1', region.x0 + 160, region.y1 - 120, 'N', 'W', 'E');
  const stA = { id: `ST:${a}`, kind: 'station', color: a, x: j1.x, y: region.y0 + 48, port: 'S', pulse: 0, ports: {} };
  const stB = { id: `ST:${b}`, kind: 'station', color: b, x: j2.x - 100, y: j2.y, port: 'E', pulse: 0, ports: {} };
  const stC = { id: `ST:${c}`, kind: 'station', color: c, x: region.x1 - 28, y: j2.y, port: 'W', pulse: 0, ports: {} };
  nodes[j1.id] = j1; nodes[j2.id] = j2; nodes[stA.id] = stA; nodes[stB.id] = stB; nodes[stC.id] = stC;
  addEdge(edges, j1, 'N', stA, 'S');
  addEdge(edges, j1, 'S', j2, 'N');
  addEdge(edges, j2, 'W', stB, 'E');
  addEdge(edges, j2, 'E', stC, 'W');
  return j1;
}
function layoutFour(nodes, edges, tokens, region) {
  const [pink, black, green, yellow] = tokens;
  const j1p = atPct(region, 31, 50);
  const j2p = atPct(region, 65, 35);
  const j3p = atPct(region, 65, 65);
  const j1 = mkSw('J:', '', j1p.x, j1p.y, 'W', 'NE', 'SE');
  const j2 = mkSw('J:0', '0', j2p.x, j2p.y, 'SW', 'NW', 'NE');
  const j3 = mkSw('J:1', '1', j3p.x, j3p.y, 'NW', 'SW', 'SE');
  j1.sourceAt = atPct(region, 8, 50);
  const st = (color, x, y, port) => ({
    id: `ST:${color}`, kind: 'station', color, ...atPct(region, x, y), port, pulse: 0, ports: {},
  });
  const stP = st(pink, 46, 14, 'SE');
  const stK = st(black, 89, 14, 'SW');
  const stG = st(green, 46, 86, 'NE');
  const stY = st(yellow, 89, 86, 'NW');
  nodes[j1.id] = j1; nodes[j2.id] = j2; nodes[j3.id] = j3;
  nodes[stP.id] = stP; nodes[stK.id] = stK; nodes[stG.id] = stG; nodes[stY.id] = stY;
  addCurve(edges, j1, 'NE', j2, 'SW');
  addCurve(edges, j1, 'SE', j3, 'NW');
  addCurve(edges, j2, 'NW', stP, 'SE');
  addCurve(edges, j2, 'NE', stK, 'SW');
  addCurve(edges, j3, 'SW', stG, 'NE');
  addCurve(edges, j3, 'SE', stY, 'NW');
  return j1;
}
function layoutSix(nodes, edges, tokens, region) {
  const [pink, black, green, yellow, blue, violet] = tokens;
  const p = (x, y) => atPct(region, x, y);
  const j1 = mkSw('J:', '', ...xy(p(38, 50)), 'W', 'NE', 'SE');
  const j2 = mkSw('J:0', '0', ...xy(p(56, 30)), 'SW', 'N', 'E');
  const j3 = mkSw('J:01', '01', ...xy(p(82, 20)), 'W', 'NE', 'SE');
  const j4 = mkSw('J:1', '1', ...xy(p(56, 68)), 'NW', 'E', 'SE');
  const j5 = mkSw('J:11', '11', ...xy(p(82, 82)), 'W', 'NE', 'SE');
  j1.sourceAt = p(5, 50);
  const st = (color, x, y, port) => ({
    id: `ST:${color}`, kind: 'station', color, ...p(x, y), port, pulse: 0, ports: {},
  });
  const stP = st(pink, 56, 10, 'S');
  const stK = st(black, 90, 16, 'SW');
  const stG = st(green, 90, 40, 'NW');
  const stY = st(yellow, 80, 58, 'W');
  const stB = st(blue, 90, 76, 'SW');
  const stV = st(violet, 90, 94, 'NW');
  for (const n of [j1, j2, j3, j4, j5, stP, stK, stG, stY, stB, stV]) nodes[n.id] = n;
  addCurve(edges, j1, 'NE', j2, 'SW');
  addCurve(edges, j1, 'SE', j4, 'NW');
  addCurve(edges, j2, 'N', stP, 'S');
  addCurve(edges, j2, 'E', j3, 'W');
  addCurve(edges, j3, 'NE', stK, 'SW');
  addCurve(edges, j3, 'SE', stG, 'NW');
  addCurve(edges, j4, 'E', stY, 'W');
  addCurve(edges, j4, 'SE', j5, 'W');
  addCurve(edges, j5, 'NE', stB, 'SW');
  addCurve(edges, j5, 'SE', stV, 'NW');
  return j1;
}
function layoutSeven(nodes, edges, tokens, region) {
  const [pink, black, green, yellow, blue, violet, white] = tokens;
  const p = (x, y) => atPct(region, x, y);
  const j1 = mkSw('J:', '', ...xy(p(46, 50)), 'W', 'NE', 'SE');
  const j2 = mkSw('J:0', '0', ...xy(p(60, 28)), 'SW', 'N', 'E');
  const j4 = mkSw('J:00', '00', ...xy(p(74, 16)), 'SW', 'N', 'E');
  const j3 = mkSw('J:1', '1', ...xy(p(60, 64)), 'NW', 'E', 'SE');
  const j5 = mkSw('J:11', '11', ...xy(p(76, 76)), 'NW', 'E', 'S');
  const j6 = mkSw('J:111', '111', ...xy(p(76, 91)), 'N', 'W', 'E');
  j1.sourceAt = p(5, 50);
  const st = (color, x, y, port) => ({
    id: `ST:${color}`, kind: 'station', color, ...p(x, y), port, pulse: 0, ports: {},
  });
  const stP = st(pink, 74, 8, 'S');
  const stK = st(black, 86, 18, 'W');
  const stG = st(green, 86, 38, 'W');
  const stY = st(yellow, 82, 56, 'W');
  const stB = st(blue, 86, 74, 'W');
  const stV = st(violet, 48, 90, 'E');
  const stW = st(white, 86, 90, 'W');
  for (const n of [j1, j2, j3, j4, j5, j6, stP, stK, stG, stY, stB, stV, stW]) nodes[n.id] = n;
  addCurve(edges, j1, 'NE', j2, 'SW');
  addCurve(edges, j1, 'SE', j3, 'NW');
  addCurve(edges, j2, 'N', j4, 'SW');
  addCurve(edges, j2, 'E', stG, 'W');
  addCurve(edges, j4, 'N', stP, 'S');
  addCurve(edges, j4, 'E', stK, 'W');
  addCurve(edges, j3, 'E', stY, 'W');
  addCurve(edges, j3, 'SE', j5, 'NW');
  addCurve(edges, j5, 'E', stB, 'W');
  addCurve(edges, j5, 'S', j6, 'N');
  addCurve(edges, j6, 'W', stV, 'E');
  addCurve(edges, j6, 'E', stW, 'W');
  return j1;
}
function xy(pt) { return [pt.x, pt.y]; }
function playRegion() { return { x0: 28, y0: 168, x1: 362, y1: 708 }; }

export function buildStage(level, rung = 0) {
  const spec = stageFor(level, rung);
  const nodes = {}, edges = [];
  const region = playRegion();
  const root = spec.n === 2
    ? layoutTwo(nodes, edges, spec.tokens, region)
    : spec.n === 3
      ? layoutThree(nodes, edges, spec.tokens, region)
      : spec.n === 4
        ? layoutFour(nodes, edges, spec.tokens, region)
        : spec.n === 6
          ? layoutSix(nodes, edges, spec.tokens, region)
          : spec.n === 7
            ? layoutSeven(nodes, edges, spec.tokens, region)
            : layoutPrefix('', region, 'W', nodes, edges, spec.codes);
  const src = {
    id: spec.sources[0].id, kind: 'source', side: 'W', packet: spec.tokens.slice(),
    x: root.sourceAt?.x ?? (root.inPort === 'W' ? 36 : root.x + DIR[root.inPort][0] * 120),
    y: root.sourceAt?.y ?? (root.inPort === 'W' ? root.y : root.y + DIR[root.inPort][1] * 120),
    port: opposite(root.inPort),
    ports: {},
  };
  src.x = Math.max(18, Math.min(W - 18, src.x));
  src.y = Math.max(110, Math.min(H - 110, src.y));
  nodes[src.id] = src;
  addEdge(edges, src, src.port, root, root.inPort);
  const graph = { nodes, edges, sources: [src], merges: [], codes: spec.codes, spec, root };
  separateHubs(graph);
  syncSwitchPorts(graph);
  const switches = Object.values(graph.nodes).filter((n) => n.kind === 'switch');
  for (const e of graph.edges) e.pts = trimRailToHubs(e.pts, switches);
  graph.longest = longestRouteLen(graph);
  return graph;
}

function syncSwitchPorts(graph) {
  for (const n of Object.values(graph.nodes)) {
    if (n.kind !== 'switch') continue;
    const ins = graph.edges.filter((e) => e.to.nodeId === n.id);
    const outs = graph.edges.filter((e) => e.from.nodeId === n.id);
    if (ins[0]) n.inPort = ins[0].to.port;
    if (outs[0]) n.out0 = outs[0].from.port;
    if (outs[1]) n.out1 = outs[1].from.port;
    n.switchStates = { 0: { in: n.inPort, out: n.out0 }, 1: { in: n.inPort, out: n.out1 } };
  }
}

function separateHubs(graph) {
  const switches = Object.values(graph.nodes).filter((n) => n.kind === 'switch');
  const minD = HUB_R * 2.7;
  let any = false;
  for (let iter = 0; iter < 10; iter++) {
    let moved = false;
    for (let i = 0; i < switches.length; i++) {
      for (let j = i + 1; j < switches.length; j++) {
        const a = switches[i];
        const b = switches[j];
        const d = hypot(a, b);
        if (d >= minD || d < 0.2) continue;
        const ux = (b.x - a.x) / d;
        const uy = (b.y - a.y) / d;
        const push = (minD - d) / 2;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        a.x = Math.max(40, Math.min(W - 40, a.x));
        a.y = Math.max(150, Math.min(H - 120, a.y));
        b.x = Math.max(40, Math.min(W - 40, b.x));
        b.y = Math.max(150, Math.min(H - 120, b.y));
        moved = true;
        any = true;
      }
    }
    if (!moved) break;
  }
  if (!any) return;
  for (const e of graph.edges) {
    const a = graph.nodes[e.from.nodeId];
    const b = graph.nodes[e.to.nodeId];
    e.pts = routePorts(a, e.from.port, b, e.to.port);
  }
}

export function longestRouteLen(graph) {
  let max = 0;
  const walk = (nodeId, acc, seen) => {
    const node = graph.nodes[nodeId];
    if (!node) return;
    if (node.kind === 'station') { max = Math.max(max, acc); return; }
    for (const e of graph.edges) {
      if (e.from.nodeId !== nodeId || seen.has(e.id)) continue;
      seen.add(e.id);
      walk(e.to.nodeId, acc + polyLen(e.pts), seen);
      seen.delete(e.id);
    }
  };
  for (const s of graph.sources) walk(s.id, 0, new Set());
  return max;
}

function segments(pts) {
  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
  return segs;
}
function orient(a, b, c) {
  const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(v) < 0.4) return 0;
  return v > 0 ? 1 : 2;
}
function segIntersect(p1, q1, p2, q2) {
  const o1 = orient(p1, q1, p2), o2 = orient(p1, q1, q2), o3 = orient(p2, q2, p1), o4 = orient(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) {
    if (hypot(p1, q1) < 8 || hypot(p2, q2) < 8) return false;
    return true;
  }
  return false;
}
function shareNode(a, b) {
  const ids = [a.from.nodeId, a.to.nodeId, b.from.nodeId, b.to.nodeId];
  return ids[0] === ids[2] || ids[0] === ids[3] || ids[1] === ids[2] || ids[1] === ids[3];
}
function legalOutgoing(graph, node) {
  if (node.kind === 'source' || node.kind === 'switch') return graph.edges.filter((e) => e.from.nodeId === node.id);
  return [];
}
function otherEnd(edge, nodeId) {
  return edge.from.nodeId === nodeId
    ? { nodeId: edge.to.nodeId, port: edge.to.port }
    : { nodeId: edge.from.nodeId, port: edge.from.port };
}
export function exploreOutcomes(graph, sourceId, maxEdges = graph.edges.length + 2) {
  const results = [], todo = [{ nodeId: sourceId, hops: 0, seen: new Set([sourceId]) }];
  while (todo.length) {
    const s = todo.pop();
    const node = graph.nodes[s.nodeId];
    if (!node) { results.push({ kind: 'missing', nodeId: s.nodeId }); continue; }
    if (node.kind === 'station') { results.push({ kind: 'station', nodeId: node.id, color: node.color }); continue; }
    if (s.hops > maxEdges) { results.push({ kind: 'cycle', nodeId: node.id }); continue; }
    const outs = legalOutgoing(graph, node);
    if (!outs.length) { results.push({ kind: node.kind, nodeId: node.id }); continue; }
    for (const edge of outs) {
      const next = otherEnd(edge, node.id);
      if (s.seen.has(next.nodeId) && graph.nodes[next.nodeId]?.kind !== 'station') {
        results.push({ kind: 'cycle', nodeId: next.nodeId }); continue;
      }
      const seen = new Set(s.seen); seen.add(next.nodeId);
      todo.push({ nodeId: next.nodeId, hops: s.hops + 1, seen });
    }
  }
  const uniq = [], got = new Set();
  for (const r of results) {
    const k = `${r.kind}/${r.nodeId}`;
    if (got.has(k)) continue;
    got.add(k); uniq.push(r);
  }
  return uniq;
}
export function validateStage(graph) {
  const errors = [];
  const byId = graph.nodes;
  const stations = Object.values(byId).filter((n) => n.kind === 'station');
  const switches = Object.values(byId).filter((n) => n.kind === 'switch');
  const sources = Object.values(byId).filter((n) => n.kind === 'source');
  const merges = Object.values(byId).filter((n) => n.kind === 'merge');
  if (sources.length !== 1) errors.push(`sourceCount ${sources.length} != 1`);
  if (merges.length) errors.push('merges are not allowed');
  if (switches.length !== stations.length - 1) errors.push(`switchCount ${switches.length} != ${stations.length - 1}`);
  for (const e of graph.edges) {
    const a = byId[e.from.nodeId], b = byId[e.to.nodeId];
    if (!a || !b) errors.push(`edge ${e.id}: unknown node`);
    else {
      if (a.ports[e.from.port] !== e.id) errors.push(`edge ${e.id}: bad from port`);
      if (b.ports[e.to.port] !== e.id) errors.push(`edge ${e.id}: bad to port`);
    }
  }
  for (const n of Object.values(byId)) {
    if (n.kind === 'switch') {
      const outs = graph.edges.filter((e) => e.from.nodeId === n.id);
      const ins = graph.edges.filter((e) => e.to.nodeId === n.id);
      if (outs.length !== 2) errors.push(`switch ${n.id}: expected 2 outgoing`);
      if (ins.length !== 1) errors.push(`switch ${n.id}: expected 1 incoming`);
    }
  }
  for (let i = 0; i < graph.edges.length; i++) {
    for (let j = i + 1; j < graph.edges.length; j++) {
      const a = graph.edges[i], b = graph.edges[j];
      if (shareNode(a, b)) continue;
      let hit = false;
      for (const [p1, q1] of segments(a.pts)) {
        for (const [p2, q2] of segments(b.pts)) if (segIntersect(p1, q1, p2, q2)) hit = true;
      }
      if (hit) errors.push(`false crossing: ${a.id} x ${b.id}`);
    }
  }
  const fwd = graph.edges.map((e) => e.forward);
  const indeg = {}, nodeSet = new Set(), adj = {};
  for (const e of fwd) {
    nodeSet.add(e.fromNodeId); nodeSet.add(e.toNodeId);
    indeg[e.toNodeId] = (indeg[e.toNodeId] || 0) + 1;
    indeg[e.fromNodeId] = indeg[e.fromNodeId] || 0;
    (adj[e.fromNodeId] ||= []).push(e.toNodeId);
  }
  const q = [...nodeSet].filter((id) => (indeg[id] || 0) === 0);
  let seen = 0;
  while (q.length) {
    const id = q.pop(); seen += 1;
    for (const n of adj[id] || []) { indeg[n] -= 1; if (indeg[n] === 0) q.push(n); }
  }
  if (seen !== nodeSet.size) errors.push('forward route graph has a cycle');
  for (const source of graph.sources) {
    const outcomes = exploreOutcomes(graph, source.id);
    if (outcomes.some((o) => o.kind !== 'station')) errors.push(`${source.id}: non-station outcome`);
    for (const color of source.packet) {
      const hits = outcomes.filter((o) => o.color === color);
      if (hits.length !== 1) errors.push(`${source.id}/${color}: expected 1 station, got ${hits.length}`);
    }
  }
  for (let i = 0; i < switches.length; i++) {
    for (let j = i + 1; j < switches.length; j++) {
      const d = hypot(switches[i], switches[j]);
      if (d < HUB_R * 2 - 1) errors.push(`hubs overlap: ${switches[i].id} x ${switches[j].id} (${d | 0}px)`);
    }
  }
  for (const sw of switches) errors.push(...assertSwitchGeometry(sw, graph.edges));
  for (const e of graph.edges) {
    for (let i = 1; i < e.pts.length - 1; i++) {
      const t = i / (e.pts.length - 1);
      if (t < 0.14 || t > 0.86) continue;
      for (const sw of switches) {
        if (sw.id === e.from.nodeId || sw.id === e.to.nodeId) continue;
        if (hypot(e.pts[i], sw) < HUB_R - 1) errors.push(`${e.id}: crosses ${sw.id}`);
      }
    }
  }
  if (graph.spec?.n === 4) {
    if (graph.edges.length !== 7) errors.push(`four-station edges ${graph.edges.length} != 7`);
    if (stations.length !== 4) errors.push('four-station: station count');
    if (switches.length !== 3) errors.push('four-station: switch count');
    const j2 = byId['J:0'];
    const j3 = byId['J:1'];
    if (j2 && j3) {
      const sep = hypot(j2, j3);
      const need = 2.5 * 2 * HUB_R;
      if (sep < need) errors.push(`J2-J3 separation ${sep | 0} < ${need | 0}`);
    }
    if (graph.edges.some((e) => (e.from.nodeId === 'J:0' && e.to.nodeId === 'J:1') || (e.from.nodeId === 'J:1' && e.to.nodeId === 'J:0'))) {
      errors.push('illegal J2-J3 edge');
    }
    const expect = { P: ['J:', 'J:0', 'ST:P'], K: ['J:', 'J:0', 'ST:K'], G: ['J:', 'J:1', 'ST:G'], Y: ['J:', 'J:1', 'ST:Y'] };
    for (const [color, path] of Object.entries(expect)) {
      const bits = graph.codes[color];
      let node = graph.root;
      const got = [node.id];
      for (const bit of bits) {
        const port = bit === '1' ? node.out1 : node.out0;
        const edge = graph.edges.find((e) => e.from.nodeId === node.id && e.from.port === port);
        if (!edge) { errors.push(`${color}: missing ${port} from ${node.id}`); break; }
        node = byId[edge.to.nodeId];
        got.push(node.id);
      }
      if (got.join() !== path.join()) errors.push(`${color} path ${got.join('>')} != ${path.join('>')}`);
    }
  }
  if (graph.spec?.n === 6) {
    if (graph.edges.length !== 11) errors.push(`six-station edges ${graph.edges.length} != 11`);
    if (stations.length !== 6) errors.push('six-station: station count');
    if (switches.length !== 5) errors.push('six-station: switch count');
    const expect = {
      P: ['J:', 'J:0', 'ST:P'],
      K: ['J:', 'J:0', 'J:01', 'ST:K'],
      G: ['J:', 'J:0', 'J:01', 'ST:G'],
      Y: ['J:', 'J:1', 'ST:Y'],
      B: ['J:', 'J:1', 'J:11', 'ST:B'],
      V: ['J:', 'J:1', 'J:11', 'ST:V'],
    };
    for (const [color, path] of Object.entries(expect)) {
      const bits = graph.codes[color];
      let node = graph.root;
      const got = [node.id];
      for (const bit of bits) {
        const port = bit === '1' ? node.out1 : node.out0;
        const edge = graph.edges.find((e) => e.from.nodeId === node.id && e.from.port === port);
        if (!edge) { errors.push(`${color}: missing ${port} from ${node.id}`); break; }
        node = byId[edge.to.nodeId];
        got.push(node.id);
      }
      if (got.join() !== path.join()) errors.push(`${color} path ${got.join('>')} != ${path.join('>')}`);
    }
  }
  if (graph.spec?.n === 7) {
    if (graph.edges.length !== 13) errors.push(`seven-station edges ${graph.edges.length} != 13`);
    if (stations.length !== 7) errors.push('seven-station: station count');
    if (switches.length !== 6) errors.push('seven-station: switch count');
    const expect = {
      P: ['J:', 'J:0', 'J:00', 'ST:P'],
      K: ['J:', 'J:0', 'J:00', 'ST:K'],
      G: ['J:', 'J:0', 'ST:G'],
      Y: ['J:', 'J:1', 'ST:Y'],
      B: ['J:', 'J:1', 'J:11', 'ST:B'],
      V: ['J:', 'J:1', 'J:11', 'J:111', 'ST:V'],
      W: ['J:', 'J:1', 'J:11', 'J:111', 'ST:W'],
    };
    for (const [color, path] of Object.entries(expect)) {
      const bits = graph.codes[color];
      let node = graph.root;
      const got = [node.id];
      for (const bit of bits) {
        const port = bit === '1' ? node.out1 : node.out0;
        const edge = graph.edges.find((e) => e.from.nodeId === node.id && e.from.port === port);
        if (!edge) { errors.push(`${color}: missing ${port} from ${node.id}`); break; }
        node = byId[edge.to.nodeId];
        got.push(node.id);
      }
      if (got.join() !== path.join()) errors.push(`${color} path ${got.join('>')} != ${path.join('>')}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
export function liveEdge(switchNode, edge) {
  if (switchNode.kind !== 'switch') return true;
  const port = switchNode.arm ? switchNode.out1 : switchNode.out0;
  return edge.from.port === port;
}
export function nextLiveEdge(graph, node) {
  if (node.kind === 'source' || node.kind === 'merge') return graph.edges.find((e) => e.from.nodeId === node.id);
  if (node.kind === 'switch') {
    const port = node.arm ? node.out1 : node.out0;
    return graph.edges.find((e) => e.from.nodeId === node.id && e.from.port === port);
  }
  return null;
}
