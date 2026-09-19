export const W = 390;
export const H = 844;
export const HUB_R = 22;
export const MERGE_R = 12;
export const PORT_R = {
  switch: HUB_R,
  merge: MERGE_R,
  station: 0,
  source: 0,
};
export const PALETTE = {
  R: '#c13b3b', B: '#3d8eb8', Y: '#d4a017', G: '#3d8f44',
  P: '#6b4f8a', O: '#d46a1e', C: '#2aa8a0', K: '#c44d74',
  L: '#7cb342', A: '#c49212', T: '#2a8f84', I: '#4d5eaf',
  V: '#8e4fa3', Q: '#d96b6b',
};

export const STAGE = [
  {
    id: 1, pattern: 'P01', miss: 3, total: 8, nom: 4.0, min: 3.4, max: 5.0, cap: 1,
    sources: [{ id: 'S_W', side: 'W', packet: ['R', 'B'] }],
    codes: { R: '0', B: '1' },
    intro: ['R', 'B'],
  },
  {
    id: 2, pattern: 'P02', miss: 3, total: 12, nom: 3.5, min: 2.9, max: 4.5, cap: 1,
    sources: [{ id: 'S_W', side: 'W', packet: ['R', 'B', 'Y'] }],
    codes: { R: '0', B: '10', Y: '11' },
    intro: ['R', 'B', 'Y'],
  },
  {
    id: 3, pattern: 'P03', miss: 3, total: 16, nom: 3.1, min: 2.6, max: 4.1, cap: 2,
    components: [
      { source: { id: 'S_W', side: 'W', packet: ['R', 'B'] }, codes: { R: '0', B: '1' } },
      { source: { id: 'S_E', side: 'E', packet: ['Y', 'G'] }, codes: { Y: '0', G: '1' } },
    ],
    intro: ['R', 'Y', 'B', 'G'],
  },
  {
    id: 4, pattern: 'P04', miss: 3, total: 20, nom: 2.8, min: 2.3, max: 3.8, cap: 2,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y'] },
      { id: 'S_S', side: 'S', packet: ['G', 'P'] },
    ],
    codes: { R: '00', B: '01', Y: '100', G: '101', P: '11' },
  },
  {
    id: 5, pattern: 'P07', miss: 3, total: 24, nom: 2.55, min: 2.1, max: 3.5, cap: 3,
    components: [
      { source: { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y'] }, codes: { R: '0', B: '10', Y: '11' } },
      { source: { id: 'S_E', side: 'E', packet: ['G', 'P', 'O'] }, codes: { G: '0', P: '10', O: '11' } },
    ],
  },
  {
    id: 6, pattern: 'P06', miss: 3, total: 28, nom: 2.35, min: 1.95, max: 3.25, cap: 3,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y', 'G'] },
      { id: 'S_S', side: 'S', packet: ['P', 'O', 'C'] },
    ],
    codes: { R: '00', B: '010', Y: '011', G: '100', P: '101', O: '110', C: '111' },
  },
  {
    id: 7, pattern: 'P08', miss: 3, total: 32, nom: 2.15, min: 1.8, max: 3.0, cap: 4,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y', 'G'] },
      { id: 'S_N', side: 'N', packet: ['P', 'O', 'C', 'K'] },
    ],
    codes: { R: '000', B: '001', Y: '010', G: '011', P: '100', O: '101', C: '110', K: '111' },
  },
  {
    id: 8, pattern: 'P06', miss: 3, total: 38, nom: 1.75, min: 1.35, max: 2.65, cap: 5,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y'] },
      { id: 'S_N', side: 'N', packet: ['G', 'P', 'O'] },
      { id: 'S_E', side: 'E', packet: ['C', 'K', 'L'] },
    ],
    codes: { R: '000', B: '001', Y: '010', G: '011', P: '100', O: '101', C: '110', K: '1110', L: '1111' },
  },
  {
    id: 9, pattern: 'P08', miss: 3, total: 44, nom: 1.58, min: 1.2, max: 2.45, cap: 5,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y'] },
      { id: 'S_N', side: 'N', packet: ['G', 'P', 'O'] },
      { id: 'S_E', side: 'E', packet: ['C', 'K', 'L', 'A'] },
    ],
    codes: { R: '000', B: '001', Y: '010', G: '011', P: '100', O: '101', C: '1100', K: '1101', L: '1110', A: '1111' },
  },
  {
    id: 10, pattern: 'P06', miss: 3, total: 50, nom: 1.45, min: 1.1, max: 2.3, cap: 6,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y', 'G'] },
      { id: 'S_N', side: 'N', packet: ['P', 'O', 'C'] },
      { id: 'S_E', side: 'E', packet: ['K', 'L', 'A', 'T'] },
    ],
    codes: { R: '000', B: '001', Y: '010', G: '011', P: '100', O: '101', C: '1100', K: '1101', L: '1110', A: '11110', T: '11111' },
  },
  {
    id: 11, pattern: 'P08', miss: 2, total: 58, nom: 1.28, min: 1.0, max: 2.1, cap: 6,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y'] },
      { id: 'S_N', side: 'N', packet: ['G', 'P', 'O'] },
      { id: 'S_E', side: 'E', packet: ['C', 'K', 'L'] },
      { id: 'S_S', side: 'S', packet: ['A', 'T', 'I'] },
    ],
    codes: { R: '000', B: '001', Y: '010', G: '011', P: '100', O: '101', C: '1100', K: '1101', L: '11100', A: '11101', T: '11110', I: '11111' },
  },
  {
    id: 12, pattern: 'P06', miss: 2, total: 66, nom: 1.15, min: 0.92, max: 1.95, cap: 7,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y', 'G'] },
      { id: 'S_N', side: 'N', packet: ['P', 'O', 'C'] },
      { id: 'S_E', side: 'E', packet: ['K', 'L', 'A'] },
      { id: 'S_S', side: 'S', packet: ['T', 'I', 'V'] },
    ],
    codes: { R: '000', B: '001', Y: '010', G: '011', P: '100', O: '101', C: '1100', K: '1101', L: '11100', A: '11101', T: '11110', I: '111110', V: '111111' },
  },
  {
    id: 13, pattern: 'P09', miss: 1, total: 76, nom: 1.02, min: 0.82, max: 1.75, cap: 7,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y', 'G'] },
      { id: 'S_N', side: 'N', packet: ['P', 'O', 'C'] },
      { id: 'S_E', side: 'E', packet: ['K', 'L', 'A'] },
      { id: 'S_S', side: 'S', packet: ['T', 'I', 'V', 'Q'] },
    ],
    codes: { R: '000', B: '001', Y: '010', G: '011', P: '100', O: '101', C: '1100', K: '1101', L: '11100', A: '11101', T: '11110', I: '111110', V: '1111110', Q: '1111111' },
  },
  {
    id: 14, pattern: 'P09', miss: 1, total: 84, nom: 1.0, min: 0.72, max: 1.3, cap: 8,
    sources: [
      { id: 'S_W', side: 'W', packet: ['R', 'B', 'Y', 'G'] },
      { id: 'S_N', side: 'N', packet: ['P', 'O', 'C'] },
      { id: 'S_E', side: 'E', packet: ['K', 'L', 'A'] },
      { id: 'S_S', side: 'S', packet: ['T', 'I', 'V', 'Q'] },
    ],
    codes: { R: '000', B: '001', Y: '010', G: '011', P: '100', O: '101', C: '1100', K: '1101', L: '11100', A: '11101', T: '11110', I: '111110', V: '1111110', Q: '1111111' },
  },
];

export const DIR = {
  N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0],
};

export function opposite(port) {
  return { N: 'S', S: 'N', E: 'W', W: 'E' }[port];
}

export function hypot(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y) || 1;
}

export function portPoint(node, port, extra = 0) {
  const r = (PORT_R[node.kind] || 0) + extra;
  const d = DIR[port];
  return { x: node.x + d[0] * r, y: node.y + d[1] * r };
}

export function houseOffset(port) {
  const d = DIR[opposite(port)];
  return { x: d[0] * 30, y: d[1] * 30 };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function prefixesOf(codes) {
  const set = new Set(['']);
  for (const code of Object.values(codes)) {
    for (let i = 1; i < code.length; i++) set.add(code.slice(0, i));
  }
  return set;
}

function leafFor(codes, bits) {
  return Object.keys(codes).find((c) => codes[c] === bits);
}

function codeValue(code) {
  let v = 0;
  for (let i = 0; i < code.length; i++) v += Number(code[i]) * 2 ** -(i + 1);
  return v + 2 ** -(code.length + 1);
}

function densify(pts, radius = 16) {
  if (pts.length < 3) return simplify(pts);
  const out = [{ ...pts[0] }];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const ab = hypot(a, b);
    const bc = hypot(b, c);
    const r = Math.min(radius, ab / 2 - 1, bc / 2 - 1);
    if (r < 4) {
      out.push({ ...b });
      continue;
    }
    const ux = (b.x - a.x) / ab;
    const uy = (b.y - a.y) / ab;
    const vx = (c.x - b.x) / bc;
    const vy = (c.y - b.y) / bc;
    const p0 = { x: b.x - ux * r, y: b.y - uy * r };
    const p1 = { x: b.x + vx * r, y: b.y + vy * r };
    out.push(p0);
    for (let s = 1; s <= 5; s++) {
      const t = s / 6;
      const omt = 1 - t;
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

function simplify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const q = out[out.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) < 1.2) continue;
    out.push(p);
  }
  return out;
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
  const p0 = portPoint(a, aPort);
  const p1 = portPoint(b, bPort);
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
    id,
    from: { nodeId: a.id, port: aPort },
    to: { nodeId: b.id, port: bPort },
    pts: routePorts(a, aPort, b, bPort),
    forward: { fromNodeId: a.id, toNodeId: b.id },
  });
}

function stationOnFarEdge(region, inDir, color, idPrefix) {
  const pad = 20;
  let x;
  let y;
  let port = inDir;
  if (inDir === 'N') {
    x = (region.x0 + region.x1) / 2;
    y = region.y1 - pad;
  } else if (inDir === 'S') {
    x = (region.x0 + region.x1) / 2;
    y = region.y0 + pad;
  } else if (inDir === 'W') {
    x = region.x1 - pad;
    y = (region.y0 + region.y1) / 2;
  } else {
    x = region.x0 + pad;
    y = (region.y0 + region.y1) / 2;
  }
  return {
    id: `${idPrefix}ST:${color}`,
    kind: 'station',
    color,
    x,
    y,
    port,
    pulse: 0,
    ports: {},
  };
}

function leafCount(codes, prefix) {
  return Object.values(codes).filter((c) => c.startsWith(prefix)).length || 1;
}

function splitForIncoming(inDir, region, sw, n0, n1) {
  const gap = 10;
  const minShare = 64;
  const horiz = inDir === 'N' || inDir === 'S';
  const span = horiz ? region.x1 - region.x0 : region.y1 - region.y0;
  const t = n0 / (n0 + n1);
  let share = span * t;
  if (span > minShare * 2) share = Math.max(minShare, Math.min(span - minShare, share));
  if (horiz) {
    const mid = region.x0 + share;
    const y0 = inDir === 'N' ? sw.y + 44 : region.y0;
    const y1 = inDir === 'N' ? region.y1 : sw.y - 44;
    return {
      r0: { x0: region.x0, y0, x1: mid - gap / 2, y1 },
      r1: { x0: mid + gap / 2, y0, x1: region.x1, y1 },
      out0: 'W',
      out1: 'E',
    };
  }
  const mid = region.y0 + share;
  const x0 = inDir === 'W' ? sw.x + 44 : region.x0;
  const x1 = inDir === 'W' ? region.x1 : sw.x - 44;
  return {
    r0: { x0, y0: region.y0, x1, y1: mid - gap / 2 },
    r1: { x0, y0: mid + gap / 2, x1, y1: region.y1 },
    out0: 'N',
    out1: 'S',
  };
}

function layoutPrefix(prefix, region, inDir, nodes, edges, codes, idPrefix) {
  const color = leafFor(codes, prefix);
  if (color) {
    const st = stationOnFarEdge(region, inDir, color, idPrefix);
    nodes[st.id] = st;
    return st;
  }
  const sw = {
    id: `${idPrefix}J:${prefix}`,
    kind: 'switch',
    prefix,
    x: (region.x0 + region.x1) / 2,
    y: (region.y0 + region.y1) / 2,
    arm: 0,
    prevArm: 0,
    anim: 1,
    flash: 0,
    ports: {},
    inPort: inDir,
    out0: 'W',
    out1: 'E',
  };
  if (inDir === 'N') { sw.x = (region.x0 + region.x1) / 2; sw.y = region.y0 + 26; }
  else if (inDir === 'S') { sw.x = (region.x0 + region.x1) / 2; sw.y = region.y1 - 26; }
  else if (inDir === 'W') { sw.x = region.x0 + 26; sw.y = (region.y0 + region.y1) / 2; }
  else { sw.x = region.x1 - 26; sw.y = (region.y0 + region.y1) / 2; }
  nodes[sw.id] = sw;
  const n0 = leafCount(codes, `${prefix}0`);
  const n1 = leafCount(codes, `${prefix}1`);
  const split = splitForIncoming(inDir, region, sw, n0, n1);
  sw.out0 = split.out0;
  sw.out1 = split.out1;
  sw.switchStates = { 0: { in: inDir, out: sw.out0 }, 1: { in: inDir, out: sw.out1 } };
  const c0 = layoutPrefix(`${prefix}0`, split.r0, opposite(sw.out0), nodes, edges, codes, idPrefix);
  const c1 = layoutPrefix(`${prefix}1`, split.r1, opposite(sw.out1), nodes, edges, codes, idPrefix);
  addEdge(edges, sw, sw.out0, c0, c0.kind === 'switch' ? c0.inPort : c0.port);
  addEdge(edges, sw, sw.out1, c1, c1.kind === 'switch' ? c1.inPort : c1.port);
  return sw;
}


function buildTree(codes, nodes, edges, region, idPrefix = '', inDir = 'N') {
  return layoutPrefix('', region, inDir, nodes, edges, codes, idPrefix);
}

function attachSources(specSources, root, nodes, edges, region) {
  const sources = [];
  const merges = [];
  if (specSources.length === 1) {
    const s = specSources[0];
    const inDir = root.inPort;
    const src = {
      id: s.id,
      kind: 'source',
      side: s.side,
      packet: s.packet.slice(),
      x: root.x - DIR[inDir][0] * 56,
      y: root.y - DIR[inDir][1] * 56,
      port: inDir,
      ports: {},
    };
    src.x = Math.max(18, Math.min(W - 18, src.x));
    src.y = Math.max(110, Math.min(H - 110, src.y));
    nodes[s.id] = src;
    sources.push(src);
    addEdge(edges, src, src.port, root, root.inPort);
    return { sources, merges };
  }

  const n = specSources.length;
  specSources.forEach((s, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const src = {
      id: s.id,
      kind: 'source',
      side: s.side,
      packet: s.packet.slice(),
      x: lerp(region.x0 + 24, region.x1 - 24, t),
      y: Math.max(118, region.y0 - 8),
      port: 'S',
      ports: {},
    };
    nodes[s.id] = src;
    sources.push(src);
  });

  let current = sources[0];
  for (let i = 1; i < sources.length; i++) {
    const nxt = sources[i];
    const merge = {
      id: i === sources.length - 1 ? 'M0' : `M${i}`,
      kind: 'merge',
      x: (current.x + nxt.x) / 2,
      y: sources[0].y + 34,
      ports: {},
      inA: 'W',
      inB: 'E',
      out: 'S',
    };
    nodes[merge.id] = merge;
    merges.push(merge);
    addEdge(edges, current, current.kind === 'source' ? current.port : current.out, merge, 'W');
    addEdge(edges, nxt, nxt.kind === 'source' ? nxt.port : nxt.out, merge, 'E');
    current = merge;
  }

  const feed = current;
  root.inPort = 'N';
  root.switchStates = { 0: { in: root.inPort, out: root.out0 }, 1: { in: root.inPort, out: root.out1 } };
  addEdge(edges, feed, feed.kind === 'merge' ? feed.out : feed.port, root, root.inPort);
  return { sources, merges };
}

function playRegion() {
  return { x0: 28, y0: 132, x1: 362, y1: 708 };
}

function splitRegion(region, axis) {
  if (axis === 'y') {
    const mid = (region.y0 + region.y1) / 2;
    return [
      { ...region, y1: mid - 16 },
      { ...region, y0: mid + 16 },
    ];
  }
  const mid = (region.x0 + region.x1) / 2;
  return [
    { ...region, x1: mid - 12 },
    { ...region, x0: mid + 12 },
  ];
}

function assemble(nodes, edges, sources, merges, codes, spec) {
  return {
    nodes,
    edges,
    sources,
    merges,
    codes,
    spec,
    root: Object.values(nodes).find((n) => n.kind === 'switch' && n.prefix === ''),
  };
}

export function buildStage(level) {
  const spec = STAGE[level - 1];
  if (!spec) throw new Error(`Unknown stage ${level}`);
  const nodes = {};
  const edges = [];
  const region = playRegion();

  if (spec.components) {
    const axis = spec.pattern === 'P03' ? 'y' : 'x';
    const regions = splitRegion(region, axis);
    const sources = [];
    const merges = [];
    spec.components.forEach((comp, i) => {
      const prefix = `C${i}:`;
      const inDir = comp.source.side === 'E' ? 'E' : 'W';
      const root = buildTree(comp.codes, nodes, edges, regions[i], prefix, inDir);
      const attached = attachSources([comp.source], root, nodes, edges, regions[i]);
      sources.push(...attached.sources);
      merges.push(...attached.merges);
    });
    const codes = {};
    spec.components.forEach((comp) => Object.assign(codes, comp.codes));
    return assemble(nodes, edges, sources, merges, codes, spec);
  }

  const multi = spec.sources.length > 1;
  const treeRegion = multi
    ? { x0: region.x0, y0: region.y0 + 78, x1: region.x1, y1: region.y1 }
    : region;
  const inDir = multi ? 'N' : (spec.sources[0].side === 'E' ? 'E' : spec.sources[0].side === 'S' ? 'S' : 'W');
  const root = buildTree(spec.codes, nodes, edges, treeRegion, '', inDir);
  const attached = attachSources(spec.sources, root, nodes, edges, region);
  return assemble(nodes, edges, attached.sources, attached.merges, spec.codes, spec);
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

function onSeg(a, b, c) {
  return (
    Math.min(a.x, b.x) - 0.4 <= c.x && c.x <= Math.max(a.x, b.x) + 0.4 &&
    Math.min(a.y, b.y) - 0.4 <= c.y && c.y <= Math.max(a.y, b.y) + 0.4
  );
}

function segIntersect(p1, q1, p2, q2) {
  const o1 = orient(p1, q1, p2);
  const o2 = orient(p1, q1, q2);
  const o3 = orient(p2, q2, p1);
  const o4 = orient(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) {
    const len1 = hypot(p1, q1);
    const len2 = hypot(p2, q2);
    if (len1 < 8 || len2 < 8) return false;
    return true;
  }
  return false;
}

function shareNode(a, b) {
  const ids = [a.from.nodeId, a.to.nodeId, b.from.nodeId, b.to.nodeId];
  return ids[0] === ids[2] || ids[0] === ids[3] || ids[1] === ids[2] || ids[1] === ids[3];
}

function legalOutgoing(graph, node, arrivedVia) {
  if (node.kind === 'source') return graph.edges.filter((e) => e.from.nodeId === node.id);
  if (node.kind === 'station') return [];
  if (node.kind === 'merge') return graph.edges.filter((e) => e.from.nodeId === node.id);
  if (node.kind === 'switch') {
    return graph.edges.filter((e) => e.from.nodeId === node.id);
  }
  return [];
}

function otherEnd(edge, nodeId) {
  if (edge.from.nodeId === nodeId) return { nodeId: edge.to.nodeId, port: edge.to.port };
  return { nodeId: edge.from.nodeId, port: edge.from.port };
}

export function exploreOutcomes(graph, sourceId, maxEdges = graph.edges.length + 2) {
  const results = [];
  const todo = [{ nodeId: sourceId, hops: 0, seen: new Set([sourceId]) }];
  while (todo.length) {
    const s = todo.pop();
    const node = graph.nodes[s.nodeId];
    if (!node) {
      results.push({ kind: 'missing', nodeId: s.nodeId });
      continue;
    }
    if (node.kind === 'station') {
      results.push({ kind: 'station', nodeId: node.id, color: node.color });
      continue;
    }
    if (s.hops > maxEdges) {
      results.push({ kind: 'cycle', nodeId: node.id });
      continue;
    }
    const outs = legalOutgoing(graph, node);
    if (!outs.length) {
      results.push({ kind: node.kind, nodeId: node.id });
      continue;
    }
    for (const edge of outs) {
      const next = otherEnd(edge, node.id);
      if (s.seen.has(next.nodeId) && graph.nodes[next.nodeId]?.kind !== 'station') {
        results.push({ kind: 'cycle', nodeId: next.nodeId });
        continue;
      }
      const seen = new Set(s.seen);
      seen.add(next.nodeId);
      todo.push({ nodeId: next.nodeId, hops: s.hops + 1, seen });
    }
  }
  const uniq = [];
  const got = new Set();
  for (const r of results) {
    const k = `${r.kind}/${r.nodeId}`;
    if (got.has(k)) continue;
    got.add(k);
    uniq.push(r);
  }
  return uniq;
}

export function validateStage(graph) {
  const errors = [];
  const byId = graph.nodes;
  for (const e of graph.edges) {
    const a = byId[e.from.nodeId];
    const b = byId[e.to.nodeId];
    if (!a || !b) errors.push(`edge ${e.id}: unknown node`);
    else {
      if (a.ports[e.from.port] !== e.id) errors.push(`edge ${e.id}: bad from port`);
      if (b.ports[e.to.port] !== e.id) errors.push(`edge ${e.id}: bad to port`);
      if (!e.pts || e.pts.length < 2) errors.push(`edge ${e.id}: invalid geometry`);
    }
  }
  for (const n of Object.values(byId)) {
    const degree = Object.values(n.ports || {}).filter(Boolean).length;
    if (n.kind === 'station' && (degree !== 1 || !n.color)) errors.push(`station ${n.id}: must be one-port with target`);
    if (n.kind === 'source' && (degree !== 1 || !n.packet?.length)) errors.push(`source ${n.id}: must be one-port with packet`);
    if (n.kind === 'switch') {
      if (!n.out0 || !n.out1 || n.out0 === n.out1) errors.push(`switch ${n.id}: illegal outputs`);
      if (n.inPort === n.out0 || n.inPort === n.out1) errors.push(`switch ${n.id}: inPort collides`);
      const outs = graph.edges.filter((e) => e.from.nodeId === n.id);
      if (outs.length !== 2) errors.push(`switch ${n.id}: expected 2 outgoing, got ${outs.length}`);
    }
    if (degree === 1 && n.kind !== 'station' && n.kind !== 'source') errors.push(`orphan rail endpoint at ${n.id}`);
  }
  for (let i = 0; i < graph.edges.length; i++) {
    for (let j = i + 1; j < graph.edges.length; j++) {
      const a = graph.edges[i];
      const b = graph.edges[j];
      if (shareNode(a, b)) continue;
      const sa = segments(a.pts);
      const sb = segments(b.pts);
      let hit = false;
      for (const [p1, q1] of sa) {
        for (const [p2, q2] of sb) {
          if (segIntersect(p1, q1, p2, q2)) hit = true;
        }
      }
      if (hit) errors.push(`false crossing: ${a.id} x ${b.id}`);
    }
  }

  const fwd = graph.edges.map((e) => e.forward);
  const indeg = {};
  const nodes = new Set();
  for (const e of fwd) {
    nodes.add(e.fromNodeId);
    nodes.add(e.toNodeId);
    indeg[e.toNodeId] = (indeg[e.toNodeId] || 0) + 1;
    indeg[e.fromNodeId] = indeg[e.fromNodeId] || 0;
  }
  const q = [...nodes].filter((id) => (indeg[id] || 0) === 0);
  let seen = 0;
  const adj = {};
  for (const e of fwd) (adj[e.fromNodeId] ||= []).push(e.toNodeId);
  while (q.length) {
    const id = q.pop();
    seen += 1;
    for (const n of adj[id] || []) {
      indeg[n] -= 1;
      if (indeg[n] === 0) q.push(n);
    }
  }
  if (seen !== nodes.size) errors.push('forward route graph has a cycle');

  for (const source of graph.sources) {
    for (const color of source.packet) {
      const outcomes = exploreOutcomes(graph, source.id);
      if (!outcomes.length) errors.push(`${source.id}/${color}: no outcome`);
      if (outcomes.some((o) => o.kind !== 'station')) errors.push(`${source.id}/${color}: outcome is not a station (${outcomes.map((o) => o.kind).join(',')})`);
      if (!outcomes.some((o) => o.color === color)) errors.push(`${source.id}/${color}: matching station unreachable`);
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
  if (node.kind === 'source' || node.kind === 'merge') {
    return graph.edges.find((e) => e.from.nodeId === node.id);
  }
  if (node.kind === 'switch') {
    const port = node.arm ? node.out1 : node.out0;
    return graph.edges.find((e) => e.from.nodeId === node.id && e.from.port === port);
  }
  return null;
}
