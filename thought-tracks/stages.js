import { buildStage, stageFor, PALETTE, tokenParts } from './graph.js?v=31';

const thumbs = new Map();

export function paintThumbnail(canvas, graph) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3a5f3c';
  ctx.fillRect(0, 0, w, h);
  const n = graph.spec?.n || 0;
  if (n >= 11) {
    paintTidy(ctx, w, h, graph);
    return;
  }
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  const bump = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const e of graph.edges) for (const p of e.pts) bump(p.x, p.y);
  for (const nd of Object.values(graph.nodes)) bump(nd.x, nd.y);
  const bw = Math.max(48, maxX - minX);
  const bh = Math.max(48, maxY - minY);
  const pad = 18;
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  ctx.setTransform(s, 0, 0, s, (w - bw * s) / 2 - minX * s, (h - bh * s) / 2 - minY * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#d7ddc8';
  ctx.lineWidth = 7;
  for (const e of graph.edges) {
    const a = graph.nodes[e.from.nodeId];
    const b = graph.nodes[e.to.nodeId];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  drawSchematicNodes(ctx, graph, 11, 14);
}

function paintTidy(ctx, w, h, graph) {
  const codes = graph.codes;
  const leaves = Object.keys(codes).sort((a, b) => (codes[a] < codes[b] ? -1 : 1));
  const pos = {};
  const depth = (bits) => bits.length;
  const xs = {};
  const ys = {};
  leaves.forEach((color, i) => {
    const bits = codes[color];
    xs[color] = bits.length;
    ys[color] = i;
    let pref = '';
    for (const bit of bits) {
      pref += bit;
      if (ys[pref] == null) ys[pref] = i;
      xs[pref] = pref.length;
    }
    ys[''] = (ys[''] + i) / 2 || i / 2;
    xs[''] = 0;
  });
  const shape = graph.spec?.shape || 'mixed';
  const flip = shape === 'three';
  const stretch = shape === 'long' ? 1.18 : shape === 'balanced' ? 0.92 : 1;
  const keys = Object.keys(xs);
  let minX = 0; let maxX = 1; let minY = 0; let maxY = 1;
  const pt = (k) => {
    const x = flip ? ys[k] : xs[k] * stretch;
    const y = flip ? xs[k] : ys[k];
    return { x, y };
  };
  for (const k of keys) {
    const p = pt(k);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pad = 22;
  const s = Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY));
  ctx.setTransform(s, 0, 0, s, pad - minX * s, pad - minY * s);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d7ddc8';
  ctx.lineWidth = 0.18;
  const parent = (k) => (k === '' ? null : k.slice(0, -1));
  for (const k of keys) {
    const par = parent(k);
    if (par == null || xs[par] == null) continue;
    const a = pt(par);
    const b = pt(k);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const k of keys) {
    const p = pt(k);
    const leaf = codes[k];
    if (leaf) {
      const parts = tokenParts(k);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.28, 0, Math.PI * 2);
      if (parts.length === 2) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = PALETTE[parts[0]] || '#eef3e4';
        ctx.fillRect(p.x - 0.28, p.y - 0.28, 0.28, 0.56);
        ctx.fillStyle = PALETTE[parts[1]] || '#1c1c1c';
        ctx.fillRect(p.x, p.y - 0.28, 0.28, 0.56);
        ctx.restore();
      } else {
        ctx.fillStyle = PALETTE[parts[0]] || '#eef3e4';
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#4c7c48';
      ctx.fill();
      ctx.strokeStyle = '#e8eedc';
      ctx.lineWidth = 0.05;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  const root = pt('');
  ctx.moveTo(root.x - 0.22, root.y);
  ctx.lineTo(root.x, root.y - 0.28);
  ctx.lineTo(root.x + 0.22, root.y);
  ctx.closePath();
  ctx.fillStyle = '#d5d8c6';
  ctx.fill();
}

function drawSchematicNodes(ctx, graph, hubR, stationR) {
  for (const n of Object.values(graph.nodes)) {
    if (n.kind === 'switch') {
      ctx.beginPath();
      ctx.arc(n.x, n.y, hubR, 0, Math.PI * 2);
      ctx.fillStyle = '#4c7c48';
      ctx.fill();
      ctx.strokeStyle = '#e8eedc';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (n.kind === 'station') {
      const parts = tokenParts(n.color);
      ctx.beginPath();
      ctx.arc(n.x, n.y, stationR, 0, Math.PI * 2);
      if (parts.length === 2) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = PALETTE[parts[0]] || '#eef3e4';
        ctx.fillRect(n.x - stationR, n.y - stationR, stationR, stationR * 2);
        ctx.fillStyle = PALETTE[parts[1]] || '#1c1c1c';
        ctx.fillRect(n.x, n.y - stationR, stationR, stationR * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = PALETTE[parts[0]] || '#eef3e4';
        ctx.fill();
      }
    } else if (n.kind === 'source') {
      ctx.fillStyle = '#d5d8c6';
      ctx.beginPath();
      ctx.moveTo(n.x - 16, n.y + 12);
      ctx.lineTo(n.x, n.y - 16);
      ctx.lineTo(n.x + 16, n.y + 12);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function thumbnail(level) {
  if (thumbs.has(level)) return thumbs.get(level);
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 210;
  paintThumbnail(canvas, buildStage(level, 0));
  thumbs.set(level, canvas);
  return canvas;
}

export function stageMeta(level) {
  const spec = stageFor(level, 0);
  return {
    id: spec.id,
    stations: spec.n,
    cap: spec.cap,
    pool: spec.total,
  };
}
