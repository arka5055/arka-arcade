/** Canonical turnout: one pivot, three ports, a blade that trains follow. */

export const HUB_R = 28;
export const HIT_R = 48;
export const COMMIT_PAD = 2;

export const PORT_ANG = {
  E: 0, SE: Math.PI / 4, S: Math.PI / 2, SW: Math.PI * 0.75,
  W: Math.PI, NW: -Math.PI * 0.75, N: -Math.PI / 2, NE: -Math.PI / 4,
};

export const DIR = {
  N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0],
  SE: [Math.SQRT1_2, Math.SQRT1_2],
  NE: [Math.SQRT1_2, -Math.SQRT1_2],
  SW: [-Math.SQRT1_2, Math.SQRT1_2],
  NW: [-Math.SQRT1_2, -Math.SQRT1_2],
};

export function opposite(port) {
  return { N: 'S', S: 'N', E: 'W', W: 'E', SE: 'NW', NW: 'SE', NE: 'SW', SW: 'NE' }[port];
}

export function hypot(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y) || 1;
}

export function switchPort(sw, port) {
  const a = PORT_ANG[port];
  return { x: sw.x + Math.cos(a) * HUB_R, y: sw.y + Math.sin(a) * HUB_R, ang: a };
}

function angNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function hubCurveFromAngles(sw, angA, angB, steps = 24) {
  const a = { x: sw.x + Math.cos(angA) * HUB_R, y: sw.y + Math.sin(angA) * HUB_R, ang: angA };
  const b = { x: sw.x + Math.cos(angB) * HUB_R, y: sw.y + Math.sin(angB) * HUB_R, ang: angB };
  const c = { x: sw.x, y: sw.y };
  const delta = angNorm(angB - angA);
  if (Math.abs(Math.abs(delta) - Math.PI) < 0.25) return [a, c, b];
  const f = { x: a.x + b.x - c.x, y: a.y + b.y - c.y };
  const r = hypot(a, f);
  if (r > 6 && Math.abs(hypot(b, f) - r) < 4) {
    const a0 = Math.atan2(a.y - f.y, a.x - f.x);
    const a1 = Math.atan2(b.y - f.y, b.x - f.x);
    const sweep = angNorm(a1 - a0);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const ang = a0 + sweep * (i / steps);
      pts.push({ x: f.x + Math.cos(ang) * r, y: f.y + Math.sin(ang) * r });
    }
    return pts;
  }
  const iA = { x: c.x + (a.x - c.x) * 0.38, y: c.y + (a.y - c.y) * 0.38 };
  const iB = { x: c.x + (b.x - c.x) * 0.38, y: c.y + (b.y - c.y) * 0.38 };
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({
      x: u * u * u * a.x + 3 * u * u * t * iA.x + 3 * u * t * t * iB.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * iA.y + 3 * u * t * t * iB.y + t * t * t * b.y,
    });
  }
  return pts;
}

export function hubCenterline(sw, fromPort, toPort, steps = 24) {
  return hubCurveFromAngles(sw, PORT_ANG[fromPort], PORT_ANG[toPort], steps);
}

export function liveOutPort(sw) {
  return sw.arm ? sw.out1 : sw.out0;
}

export function bladePts(sw) {
  const t = Math.min(1, sw.anim ?? 1);
  const from = sw.prevArm ? sw.out1 : sw.out0;
  const to = liveOutPort(sw);
  let angOut = PORT_ANG[to];
  if (t < 1 && from !== to) {
    const a0 = PORT_ANG[from];
    const a1 = PORT_ANG[to];
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    angOut = a0 + d * t;
  }
  return hubCurveFromAngles(sw, PORT_ANG[sw.inPort], angOut);
}

export function clipOutsideHubs(ctx, switches, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  for (const sw of switches) {
    ctx.moveTo(sw.x + HUB_R, sw.y);
    ctx.arc(sw.x, sw.y, HUB_R - 0.2, 0, Math.PI * 2, true);
  }
  ctx.clip('evenodd');
}

export function committedHub(sw) {
  return hubCenterline(sw, sw.inPort, liveOutPort(sw));
}

export function strokeCenterline(ctx, pts, opts = {}) {
  if (!pts || pts.length < 2) return;
  const width = opts.width ?? 10;
  const bed = opts.bed ?? '#e7ead8';
  const gauge = opts.gauge ?? '#2a3424';
  const sleepers = opts.sleepers !== false;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = opts.cap ?? 'butt';
  if (sleepers) {
    ctx.strokeStyle = '#1d2618';
    ctx.lineWidth = 3.2;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = hypot(a, b);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const px = -uy;
      const py = ux;
      for (let d = 7; d < len - 5; d += 9) {
        const x = a.x + ux * d;
        const y = a.y + uy * d;
        ctx.beginPath();
        ctx.moveTo(x + px * 7, y + py * 7);
        ctx.lineTo(x - px * 7, y - py * 7);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = bed;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.strokeStyle = gauge;
  ctx.lineWidth = width * 0.34;
  ctx.stroke();
  ctx.restore();
}

export function drawHub(ctx, sw) {
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, HUB_R + (sw.flash || 0) * 6, 0, Math.PI * 2);
  ctx.fillStyle = '#4c7c48';
  ctx.fill();
  ctx.strokeStyle = '#e8eedc';
  ctx.lineWidth = 2.6;
  ctx.stroke();
}

export function drawBlade(ctx, sw) {
  strokeCenterline(ctx, bladePts(sw), {
    width: 10.5,
    bed: '#eef3e0',
    gauge: '#1e2818',
    sleepers: false,
    cap: 'round',
  });
}

export function drawPortsDebug(ctx, sw) {
  const marks = [
    [sw, '#ffe14a'],
    [switchPort(sw, sw.inPort), '#7ad3ff'],
    [switchPort(sw, sw.out0), '#ff7ab0'],
    [switchPort(sw, sw.out1), '#9dff7a'],
  ];
  for (const [p, color] of marks) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

export function assertSwitchGeometry(sw, edges) {
  const errors = [];
  const ports = [sw.inPort, sw.out0, sw.out1];
  if (new Set(ports).size !== 3) errors.push(`${sw.id}: ports must be unique`);
  const ins = edges.filter((e) => e.to.nodeId === sw.id);
  const outs = edges.filter((e) => e.from.nodeId === sw.id);
  if (ins.length !== 1) errors.push(`${sw.id}: expected 1 incoming rail`);
  if (outs.length !== 2) errors.push(`${sw.id}: expected 2 outgoing rails`);
  const near = (p, q) => hypot(p, q) <= 2.5;
  for (const e of ins) {
    const port = switchPort(sw, e.to.port);
    const end = e.pts[e.pts.length - 1];
    if (!near(end, port)) errors.push(`${sw.id}: incoming rail misses ${e.to.port} port`);
    if (e.to.port !== sw.inPort) errors.push(`${sw.id}: incoming port ${e.to.port} != ${sw.inPort}`);
  }
  for (const e of outs) {
    const port = switchPort(sw, e.from.port);
    const start = e.pts[0];
    if (!near(start, port)) errors.push(`${sw.id}: outgoing rail misses ${e.from.port} port`);
  }
  const outPorts = new Set(outs.map((e) => e.from.port));
  if (!outPorts.has(sw.out0) || !outPorts.has(sw.out1)) errors.push(`${sw.id}: visible branch is not a graph edge`);
  const a = hubCenterline(sw, sw.inPort, sw.out0);
  const b = hubCenterline(sw, sw.inPort, sw.out1);
  if (!near(a[0], switchPort(sw, sw.inPort))) errors.push(`${sw.id}: blade A misses incoming`);
  if (!near(a[a.length - 1], switchPort(sw, sw.out0))) errors.push(`${sw.id}: blade A misses out0`);
  if (!near(b[b.length - 1], switchPort(sw, sw.out1))) errors.push(`${sw.id}: blade B misses out1`);
  return errors;
}
