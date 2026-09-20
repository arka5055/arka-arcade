export const W = 390;
export const H = 844;
export const HUB_R = 22;
export const MERGE_R = 12;
export const PORT_R = { switch: HUB_R, merge: MERGE_R, station: 0, source: 0 };
export const PALETTE = {
  P: '#d46a9a', K: '#1c1c1c', G: '#3d8f44', Y: '#d4a017',
  B: '#3d8eb8', V: '#6b4f8a', W: '#e8eadc',
};
export const TOKENS = ['P', 'K', 'G', 'Y', 'B', 'V', 'W', 'GK', 'PW', 'BK', 'GP', 'YK', 'BP', 'VY'];
export const L14_RUNGS = [60, 66, 72, 78, 84, 90];

export function tokenParts(token) {
  if (!token) return ['P'];
  return token.length === 2 ? [token[0], token[1]] : [token];
}
export function tokenLabel(token) {
  const p = tokenParts(token);
  return p.length === 1 ? p[0] : `${p[0]}/${p[1]}`;
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
  { id: 1, n: 2, shape: 'fork', cap: 1, conc: 1.0, offered: 8, miss: 3, pressure: 1 },
  { id: 2, n: 2, shape: 'fork', cap: 2, conc: 1.5, offered: 12, miss: 3, pressure: 1 },
  { id: 3, n: 3, shape: 'cascade', cap: 2, conc: 1.8, offered: 16, miss: 3, pressure: 1 },
  { id: 4, n: 4, shape: 'balanced', cap: 3, conc: 2.2, offered: 20, miss: 3, pressure: 2 },
  { id: 5, n: 5, shape: 'mixed', cap: 3, conc: 2.7, offered: 24, miss: 3, pressure: 2 },
  { id: 6, n: 6, shape: 'balanced', cap: 4, conc: 3.1, offered: 28, miss: 3, pressure: 2 },
  { id: 7, n: 7, shape: 'three', cap: 4, conc: 3.5, offered: 32, miss: 3, pressure: 2 },
  { id: 8, n: 8, shape: 'balanced', cap: 5, conc: 4.2, offered: 38, miss: 3, pressure: 3 },
  { id: 9, n: 9, shape: 'mixed', cap: 5, conc: 4.6, offered: 44, miss: 3, pressure: 3 },
  { id: 10, n: 10, shape: 'long', cap: 6, conc: 5.0, offered: 50, miss: 3, pressure: 3 },
  { id: 11, n: 11, shape: 'mixed', cap: 6, conc: 5.3, offered: 56, miss: 2, pressure: 3 },
  { id: 12, n: 12, shape: 'three', cap: 6, conc: 5.6, offered: 62, miss: 2, pressure: 3 },
  { id: 13, n: 13, shape: 'mixed', cap: 7, conc: 6.0, offered: 68, miss: 1, pressure: 3 },
  { id: 14, n: 14, shape: 'balanced', cap: 7, conc: 6.2, offered: 60, miss: 1, pressure: 3 },
  { id: 15, n: 14, shape: 'long', cap: 7, conc: 6.4, offered: 90, miss: 1, pressure: 3 },
  { id: 16, n: 14, shape: 'three', cap: 7, conc: 6.6, offered: 90, miss: 1, pressure: 3 },
];

export function stageFor(level, rung = 0) {
  const row = LEVELS[level - 1];
  if (!row) throw new Error(`Unknown stage ${level}`);
  const tokens = TOKENS.slice(0, row.n);
  let offered = row.offered;
  if (row.id === 14) offered = L14_RUNGS[Math.max(0, Math.min(L14_RUNGS.length - 1, rung))];
  const nom = Math.max(1.15, 8 / row.conc);
  const bits = row.n === 3 ? ['0', '10', '11'] : balancedBits(row.n);
  return {
    id: row.id, n: row.n, shape: row.shape, miss: row.miss, total: offered,
    nom, min: nom, max: nom * 1.55, cap: row.cap, conc: row.conc, pressure: row.pressure,
    tokens, codes: zipCodes(tokens, bits),
    sources: [{ id: 'TUNNEL', side: 'W', packet: tokens.slice() }],
  };
}
export const STAGE = LEVELS.map((row) => stageFor(row.id, 0));

export const DIR = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export function opposite(port) { return { N: 'S', S: 'N', E: 'W', W: 'E' }[port]; }
export function hypot(a, b) { return Math.hypot(b.x - a.x, b.y - a.y) || 1; }
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
function routePorts(a, aPort, b, bPort) {
  const p0 = portPoint(a, aPort), p1 = portPoint(b, bPort);
  const dist = hypot(p0, p1);
  const stub = Math.min(14, Math.max(6, dist * 0.16));
  const a1 = { x: p0.x + DIR[aPort][0] * stub, y: p0.y + DIR[aPort][1] * stub };
  const b1 = { x: p1.x + DIR[bPort][0] * stub, y: p1.y + DIR[bPort][1] * stub };
  const pts = [{ ...p0 }, a1];
  if (aPort === 'E' || aPort === 'W') pts.push({ x: a1.x, y: b1.y });
  else pts.push({ x: b1.x, y: a1.y });
  pts.push(b1, { ...p1 });
  return densify(pts, Math.min(12, stub));
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
function stationOnFarEdge(region, inDir, color) {
  const pad = 22;
  let x, y;
  if (inDir === 'N') { x = (region.x0 + region.x1) / 2; y = region.y1 - pad; }
  else if (inDir === 'S') { x = (region.x0 + region.x1) / 2; y = region.y0 + pad; }
  else if (inDir === 'W') { x = region.x1 - pad; y = (region.y0 + region.y1) / 2; }
  else { x = region.x0 + pad; y = (region.y0 + region.y1) / 2; }
  return { id: `ST:${color}`, kind: 'station', color, x, y, port: inDir, pulse: 0, ports: {} };
}
function splitForIncoming(inDir, region, sw, n0, n1) {
  const gap = 10, minShare = 64;
  const horiz = inDir === 'N' || inDir === 'S';
  const span = horiz ? region.x1 - region.x0 : region.y1 - region.y0;
  let share = span * (n0 / (n0 + n1));
  if (span > minShare * 2) share = Math.max(minShare, Math.min(span - minShare, share));
  if (horiz) {
    const mid = region.x0 + share;
    const y0 = inDir === 'N' ? sw.y + 44 : region.y0;
    const y1 = inDir === 'N' ? region.y1 : sw.y - 44;
    return { r0: { x0: region.x0, y0, x1: mid - gap / 2, y1 }, r1: { x0: mid + gap / 2, y0, x1: region.x1, y1 }, out0: 'W', out1: 'E' };
  }
  const mid = region.y0 + share;
  const x0 = inDir === 'W' ? sw.x + 44 : region.x0;
  const x1 = inDir === 'W' ? region.x1 : sw.x - 44;
  return { r0: { x0, y0: region.y0, x1, y1: mid - gap / 2 }, r1: { x0, y0: mid + gap / 2, x1, y1: region.y1 }, out0: 'N', out1: 'S' };
}
function layoutPrefix(prefix, region, inDir, nodes, edges, codes) {
  const color = leafFor(codes, prefix);
  if (color) {
    const st = stationOnFarEdge(region, inDir, color);
    nodes[st.id] = st;
    return st;
  }
  const sw = {
    id: `J:${prefix}`, kind: 'switch', prefix,
    x: (region.x0 + region.x1) / 2, y: (region.y0 + region.y1) / 2,
    arm: 0, prevArm: 0, anim: 1, flash: 0, ports: {}, inPort: inDir, out0: 'W', out1: 'E',
  };
  if (inDir === 'N') { sw.x = (region.x0 + region.x1) / 2; sw.y = region.y0 + 26; }
  else if (inDir === 'S') { sw.x = (region.x0 + region.x1) / 2; sw.y = region.y1 - 26; }
  else if (inDir === 'W') { sw.x = region.x0 + 26; sw.y = (region.y0 + region.y1) / 2; }
  else { sw.x = region.x1 - 26; sw.y = (region.y0 + region.y1) / 2; }
  nodes[sw.id] = sw;
  const n0 = leafCount(codes, `${prefix}0`);
  const n1 = leafCount(codes, `${prefix}1`);
  const split = splitForIncoming(inDir, region, sw, n0, n1);
  sw.out0 = split.out0; sw.out1 = split.out1;
  sw.switchStates = { 0: { in: inDir, out: sw.out0 }, 1: { in: inDir, out: sw.out1 } };
  const c0 = layoutPrefix(`${prefix}0`, split.r0, opposite(sw.out0), nodes, edges, codes);
  const c1 = layoutPrefix(`${prefix}1`, split.r1, opposite(sw.out1), nodes, edges, codes);
  addEdge(edges, sw, sw.out0, c0, c0.kind === 'switch' ? c0.inPort : c0.port);
  addEdge(edges, sw, sw.out1, c1, c1.kind === 'switch' ? c1.inPort : c1.port);
  return sw;
}
function mkSw(id, prefix, x, y, inPort, out0, out1) {
  return {
    id, kind: 'switch', prefix, x, y, arm: 0, prevArm: 0, anim: 1, flash: 0, ports: {},
    inPort, out0, out1, switchStates: { 0: { in: inPort, out: out0 }, 1: { in: inPort, out: out1 } },
  };
}
function layoutThree(nodes, edges, tokens, region) {
  const [a, b, c] = tokens;
  const j1 = mkSw('J:', '', region.x0 + 36, (region.y0 + region.y1) / 2, 'W', 'N', 'S');
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
function playRegion() { return { x0: 28, y0: 132, x1: 362, y1: 708 }; }

export function buildStage(level, rung = 0) {
  const spec = stageFor(level, rung);
  const nodes = {}, edges = [];
  const region = playRegion();
  const root = spec.n === 3
    ? layoutThree(nodes, edges, spec.tokens, region)
    : layoutPrefix('', region, 'W', nodes, edges, spec.codes);
  const src = {
    id: spec.sources[0].id, kind: 'source', side: 'W', packet: spec.tokens.slice(),
    x: root.x - DIR[root.inPort][0] * 56, y: root.y - DIR[root.inPort][1] * 56,
    port: root.inPort, ports: {},
  };
  src.x = Math.max(18, Math.min(W - 18, src.x));
  src.y = Math.max(110, Math.min(H - 110, src.y));
  nodes[src.id] = src;
  addEdge(edges, src, src.port, root, root.inPort);
  return { nodes, edges, sources: [src], merges: [], codes: spec.codes, spec, root };
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
