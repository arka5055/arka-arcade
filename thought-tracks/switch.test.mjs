import { buildStage, validateStage, nextLiveEdge, polyLen, along } from './graph.js';
import {
  HUB_R, switchPort, hubCenterline, committedHub, liveOutPort, hypot, assertSwitchGeometry,
} from './switch.js';

function near(a, b, t = 2.5) { return hypot(a, b) <= t; }

function simTrain(graph, sw, arm, dt = 1 / 60, speed = 36) {
  sw.arm = arm;
  const src = graph.sources[0];
  let edge = nextLiveEdge(graph, src);
  let dist = 0;
  let committed = null;
  let hubPts = null;
  let hops = 0;
  while (hops++ < 4000) {
    const node = graph.nodes[edge.to.nodeId];
    const len = polyLen(edge.pts);
    dist += speed * dt;
    if (dist < len) continue;
    if (edge.hub) {
      edge = committed;
      dist = 0;
      committed = null;
      continue;
    }
    if (node.kind === 'station') return node.color;
    if (node.kind === 'switch') {
      committed = nextLiveEdge(graph, node);
      hubPts = committedHub(node);
      edge = { pts: hubPts, hub: true, to: { nodeId: node.id } };
      dist = 0;
      continue;
    }
    edge = committed || nextLiveEdge(graph, node);
    dist = 0;
    if (!edge) return null;
  }
  return 'timeout';
}

const g = buildStage(1, 0);
const report = validateStage(g);
const sw = g.root;
const edges = g.edges;
const errs = [];

if (!report.ok) errs.push(...report.errors);
errs.push(...assertSwitchGeometry(sw, edges));

sw.arm = 0;
const a = hubCenterline(sw, sw.inPort, liveOutPort(sw));
if (!near(a[0], switchPort(sw, sw.inPort))) errs.push('TEST1 start');
if (!near(a[a.length - 1], switchPort(sw, sw.out0))) errs.push('TEST1 end');

sw.arm = 1;
const b = hubCenterline(sw, sw.inPort, liveOutPort(sw));
if (!near(b[b.length - 1], switchPort(sw, sw.out1))) errs.push('TEST2 end');

const before = edges.map((e) => e.pts.map((p) => `${p.x},${p.y}`).join('|'));
sw.arm = 0;
const after = edges.map((e) => e.pts.map((p) => `${p.x},${p.y}`).join('|'));
if (before.join() !== after.join()) errs.push('TEST3 external rails changed');

const destA = simTrain(g, sw, 0);
const destB = simTrain(g, sw, 1);
if (destA !== 'P') errs.push(`TEST4 expected P got ${destA}`);
if (destB !== 'K') errs.push(`TEST5 expected K got ${destB}`);

sw.arm = 0;
const srcEdge = nextLiveEdge(g, g.sources[0]);
const pEnter = along(srcEdge.pts, polyLen(srcEdge.pts) - 8);
if (Math.abs(pEnter.y - sw.y) > 3) errs.push('approach not aligned with pivot');

sw.arm = 0;
let committed = nextLiveEdge(g, sw);
sw.arm = 1;
if (committed !== nextLiveEdge(g, Object.assign({}, sw, { arm: 0 })) && committed.from.port !== sw.out0) {
  /* snapshot must keep out0 even after flip */
}
const flipped = nextLiveEdge(g, sw);
if (committed.id === flipped.id) errs.push('TEST6 commit snapshot is live edge');
if (committed.from.port !== 'N') errs.push(`TEST6 committed port ${committed.from.port}`);
if (flipped.from.port !== 'SE') errs.push(`TEST6 live after tap ${flipped.from.port}`);

if (errs.length) {
  console.error('FAIL\n' + errs.join('\n'));
  process.exit(1);
}
console.log('switch tests passed', {
  pivot: [sw.x, sw.y],
  in: switchPort(sw, sw.inPort),
  out0: switchPort(sw, sw.out0),
  out1: switchPort(sw, sw.out1),
  destA, destB,
});
