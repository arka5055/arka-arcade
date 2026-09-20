import { buildStage, stageFor, PALETTE, tokenParts } from './graph.js?v=35';

const thumbs = new Map();

export function paintThumbnail(canvas, graph) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3a5f3c';
  ctx.fillRect(0, 0, w, h);
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
  for (const nd of Object.values(graph.nodes)) bump(nd.x, nd.y);
  const bw = Math.max(48, maxX - minX);
  const bh = Math.max(48, maxY - minY);
  const pad = 18;
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  ctx.setTransform(s, 0, 0, s, (w - bw * s) / 2 - minX * s, (h - bh * s) / 2 - minY * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#d7ddc8';
  ctx.lineWidth = 6;
  const seen = new Set();
  for (const e of graph.edges) {
    const a = graph.nodes[e.from.nodeId];
    const b = graph.nodes[e.to.nodeId];
    if (!a || !b) continue;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  drawSchematicNodes(ctx, graph, 11, 14);
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
