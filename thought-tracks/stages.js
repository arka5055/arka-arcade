import { buildStage, stageFor, PALETTE, tokenParts } from './graph.js?v=23';
import { strokeCenterline, drawHub, drawBlade } from './switch.js?v=23';

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
  for (const e of graph.edges) for (const p of e.pts) bump(p.x, p.y);
  for (const n of Object.values(graph.nodes)) bump(n.x, n.y);
  const bw = Math.max(48, maxX - minX);
  const bh = Math.max(48, maxY - minY);
  const pad = 22;
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  ctx.setTransform(s, 0, 0, s, (w - bw * s) / 2 - minX * s, (h - bh * s) / 2 - minY * s);
  const switches = Object.values(graph.nodes).filter((n) => n.kind === 'switch');
  for (const e of graph.edges) {
    strokeCenterline(ctx, e.pts, { width: 16, sleepers: false, cap: 'butt' });
  }
  for (const n of switches) drawHub(ctx, n);
  for (const n of switches) drawBlade(ctx, n);
  for (const n of Object.values(graph.nodes)) {
    if (n.kind === 'station') {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE[tokenParts(n.color)[0]] || '#eef3e4';
      ctx.fill();
      ctx.strokeStyle = 'rgba(28,40,24,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (n.kind === 'source') {
      ctx.fillStyle = '#d5d8c6';
      ctx.beginPath();
      ctx.moveTo(n.x - 22, n.y + 16);
      ctx.lineTo(n.x, n.y - 20);
      ctx.lineTo(n.x + 22, n.y + 16);
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
