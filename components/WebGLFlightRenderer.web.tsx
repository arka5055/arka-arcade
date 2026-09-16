import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { AIRCRAFT_DEFS, AircraftType, LEVELS } from '@/constants/game-types';
import { buildAssistedRoute, distanceToLineSegment, getApproachEntry, isInsideAutoLandingCapture } from '@/lib/approach-routing';
import { sounds } from '@/lib/sound-controller';
import { consumeFixedSteps, getRenderPixelRatio } from '@/lib/webgl-frame-pacing';

const coastalAirportScene = require('../assets/images/coastal-airport-scene.jpg');

type Point = { x: number; y: number };
type RouteRunway = {
  id: string;
  threshold: Point;
  end: Point;
  heading: number;
  allowedTypes: AircraftType[];
  color: [number, number, number];
  label: string;
};
type Plane = {
  id: string;
  type: AircraftType;
  x: number;
  y: number;
  heading: number;
  targetHeading: number;
  speed: number;
  route: Point[];
  isLanding: boolean;
  landingProgress: number;
  warning: 0 | 1 | 2;
};

export interface WebGLFlightRendererProps {
  levelIndex: number;
  isPaused: boolean;
  soundEnabled: boolean;
  onPlaneLanded: (type: AircraftType, scoreGain: number, totalLandings: number) => void;
  onGameOver: (reason: string, finalScore: number, finalLandings: number) => void;
  onLevelComplete: (level: number) => void;
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec4 a_color;
out vec4 v_color;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_color = a_color;
}`;

const COLOR_FRAGMENT = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() { outColor = v_color; }`;

const SCENE_VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 positions[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  vec2 p = positions[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = p * 0.5 + 0.5;
}`;

const SCENE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform float u_time;
out vec4 outColor;
void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 airport = texture(u_scene, uv).rgb;
  float ripple = sin((uv.x * 92.0 + u_time * 0.32)) * 0.012 + sin((uv.y * 71.0 - u_time * 0.23)) * 0.009;
  vec3 ocean = vec3(0.02, 0.14 + ripple, 0.19 + ripple);
  float vignette = smoothstep(1.0, 0.12, length(v_uv - 0.5));
  vec3 color = mix(ocean, airport, 0.50) * (0.72 + vignette * 0.28);
  outColor = vec4(color, 1.0);
}`;

function compileProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'WebGL shader compilation failed');
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'WebGL program linking failed');
  }
  return program;
}

function normalizeAngle(value: number) {
  let result = value;
  while (result < -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}

function colorFor(type: AircraftType): [number, number, number] {
  if (type === 'jet') return [0, 0.90, 1];
  if (type === 'supersonic') return [1, 0.24, 0.44];
  if (type === 'propeller') return [1, 0.70, 0];
  return [0, 0.90, 0.46];
}

export function WebGLFlightRenderer({
  levelIndex,
  isPaused,
  soundEnabled,
  onPlaneLanded,
  onGameOver,
  onLevelComplete,
}: WebGLFlightRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programsRef = useRef<{ scene: WebGLProgram; color: WebGLProgram; texture: WebGLTexture; geometry: WebGLBuffer } | null>(null);
  const planesRef = useRef<Plane[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const drawPointRef = useRef<Point | null>(null);
  const lastFrameRef = useRef(0);
  const accumulatorRef = useRef(0);
  const lastSpawnRef = useRef(-10);
  const elapsedRef = useRef(0);
  const scoreRef = useRef(0);
  const landingRef = useRef(0);
  const stoppedRef = useRef(false);
  const completedRef = useRef(false);
  const levelRef = useRef(levelIndex);
  const pausedRef = useRef(isPaused);
  const callbacksRef = useRef({ onPlaneLanded, onGameOver, onLevelComplete });
  const [dimensions, setDimensions] = useState({ width: 420, height: 640 });
  const [webglReady, setWebglReady] = useState(false);

  levelRef.current = levelIndex;
  pausedRef.current = isPaused;
  callbacksRef.current = { onPlaneLanded, onGameOver, onLevelComplete };
  sounds.enabled = soundEnabled;

  const runways = useCallback((): RouteRunway[] => [
    {
      id: 'r34', threshold: { x: 0.58, y: 0.16 }, end: { x: 0.58, y: 0.78 }, heading: Math.PI / 2,
      allowedTypes: ['jet', 'supersonic'], color: [0, 0.90, 1], label: 'JET + SST · R34',
    },
    {
      id: 'r28', threshold: { x: 0.22, y: 0.24 }, end: { x: 0.86, y: 0.64 }, heading: Math.atan2(0.40, 0.64),
      allowedTypes: ['propeller'], color: [1, 0.70, 0], label: 'PROP · R28',
    },
    {
      id: 'bay', threshold: { x: 0.16, y: 0.68 }, end: { x: 0.44, y: 0.88 }, heading: Math.atan2(0.20, 0.28),
      allowedTypes: ['seaplane'], color: [0, 0.90, 0.46], label: 'SEA · BAY',
    },
  ], []);

  const resetGame = useCallback(() => {
    planesRef.current = [];
    scoreRef.current = 0;
    landingRef.current = 0;
    elapsedRef.current = 0;
    lastSpawnRef.current = -10;
    accumulatorRef.current = 0;
    stoppedRef.current = false;
    completedRef.current = false;
  }, []);

  useEffect(() => {
    resetGame();
  }, [levelIndex, resetGame]);

  const spawnPlane = useCallback(() => {
    const level = LEVELS[levelRef.current] || LEVELS[0];
    const type = level.allowedTypes[Math.floor(Math.random() * level.allowedTypes.length)];
    const definition = AIRCRAFT_DEFS[type];
    const edge = Math.floor(Math.random() * 4);
    const margin = 0.08;
    let x = 0;
    let y = 0;
    let heading = 0;
    if (edge === 0) { x = margin + Math.random() * (1 - margin * 2); y = -0.03; heading = Math.PI / 2; }
    if (edge === 1) { x = 1.03; y = margin + Math.random() * (1 - margin * 2); heading = Math.PI; }
    if (edge === 2) { x = margin + Math.random() * (1 - margin * 2); y = 1.03; heading = -Math.PI / 2; }
    if (edge === 3) { x = -0.03; y = margin + Math.random() * (1 - margin * 2); heading = 0; }
    const speedMultiplier = level.speedMultiplier || 1;
    planesRef.current.push({
      id: `gpu-${Date.now()}-${Math.random()}`,
      type, x, y, heading, targetHeading: heading,
      speed: (definition.speed / 360) * speedMultiplier,
      route: [], isLanding: false, landingProgress: 0, warning: 0,
    });
  }, []);

  const stepSimulation = useCallback((dt: number) => {
    const level = LEVELS[levelRef.current] || LEVELS[0];
    elapsedRef.current += dt;
    if (elapsedRef.current - lastSpawnRef.current >= level.spawnIntervalMs / 1000) {
      spawnPlane();
      lastSpawnRef.current = elapsedRef.current;
    }

    const activeRunways = runways();
    for (let index = planesRef.current.length - 1; index >= 0; index -= 1) {
      const plane = planesRef.current[index];
      const matchingRunway = activeRunways.find((runway) => runway.allowedTypes.includes(plane.type));
      if (!matchingRunway) continue;

      if (plane.isLanding) {
        plane.landingProgress = Math.min(1, plane.landingProgress + dt * 0.44);
        const rollout = 1 - Math.pow(1 - plane.landingProgress, 2);
        plane.x = matchingRunway.threshold.x + (matchingRunway.end.x - matchingRunway.threshold.x) * rollout;
        plane.y = matchingRunway.threshold.y + (matchingRunway.end.y - matchingRunway.threshold.y) * rollout;
        plane.heading = matchingRunway.heading;
        if (plane.landingProgress >= 1) {
          const gain = AIRCRAFT_DEFS[plane.type].scoreValue;
          landingRef.current += 1;
          scoreRef.current += gain;
          planesRef.current.splice(index, 1);
          callbacksRef.current.onPlaneLanded(plane.type, gain, landingRef.current);
          if (!completedRef.current && landingRef.current >= level.targetLandings) {
            completedRef.current = true;
            callbacksRef.current.onLevelComplete(levelRef.current + 1);
          }
        }
        continue;
      }

      const waypoint = plane.route[0];
      if (waypoint) {
        const distance = Math.hypot(waypoint.x - plane.x, waypoint.y - plane.y);
        if (distance < 0.028) {
          plane.route.shift();
        } else {
          plane.targetHeading = Math.atan2(waypoint.y - plane.y, waypoint.x - plane.x);
        }
      }

      const turnLimit = AIRCRAFT_DEFS[plane.type].turnSpeed * dt;
      const turnDelta = normalizeAngle(plane.targetHeading - plane.heading);
      plane.heading += Math.max(-turnLimit, Math.min(turnLimit, turnDelta));
      plane.x += Math.cos(plane.heading) * plane.speed * dt;
      plane.y += Math.sin(plane.heading) * plane.speed * dt;

      if (plane.route.length > 0 && isInsideAutoLandingCapture(
        { x: plane.x, y: plane.y },
        { startX: matchingRunway.threshold.x, startY: matchingRunway.threshold.y, touchdownRadius: 0.073 } as any,
      )) {
        const angleDelta = Math.abs(normalizeAngle(plane.heading - matchingRunway.heading));
        if (angleDelta < 0.85) {
          plane.isLanding = true;
          plane.route = [];
          plane.heading = matchingRunway.heading;
        }
      }

      if (plane.x < -0.08 || plane.x > 1.08 || plane.y < -0.08 || plane.y > 1.08) {
        plane.targetHeading = Math.atan2(0.5 - plane.y, 0.5 - plane.x);
      }
    }

    for (const plane of planesRef.current) plane.warning = 0;
    for (let first = 0; first < planesRef.current.length; first += 1) {
      const one = planesRef.current[first];
      if (one.isLanding) continue;
      for (let second = first + 1; second < planesRef.current.length; second += 1) {
        const two = planesRef.current[second];
        if (two.isLanding) continue;
        const nowDistance = Math.hypot(one.x - two.x, one.y - two.y);
        const oneFuture = { x: one.x + Math.cos(one.heading) * one.speed * 2, y: one.y + Math.sin(one.heading) * one.speed * 2 };
        const twoFuture = { x: two.x + Math.cos(two.heading) * two.speed * 2, y: two.y + Math.sin(two.heading) * two.speed * 2 };
        const futureDistance = Math.hypot(oneFuture.x - twoFuture.x, oneFuture.y - twoFuture.y);
        if (nowDistance < 0.038) {
          stoppedRef.current = true;
          callbacksRef.current.onGameOver('Mid-air Collision!', scoreRef.current, landingRef.current);
          return;
        }
        if (nowDistance < 0.10) { one.warning = 2; two.warning = 2; }
        else if (nowDistance < 0.16 || futureDistance < 0.12) { one.warning = 1; two.warning = 1; }
      }
    }
  }, [runways, spawnPlane]);

  const render = useCallback((time: number) => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const assets = programsRef.current;
    if (!gl || !canvas || !assets) return;
    const dpr = getRenderPixelRatio(window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(dimensions.width * dpr));
    const pixelHeight = Math.max(1, Math.round(dimensions.height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0.01, 0.05, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(assets.scene);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, assets.texture);
    gl.uniform1i(gl.getUniformLocation(assets.scene, 'u_scene'), 0);
    gl.uniform1f(gl.getUniformLocation(assets.scene, 'u_time'), time / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const geometry: number[] = [];
    const addVertex = (x: number, y: number, color: [number, number, number], alpha: number) => {
      geometry.push(x * 2 - 1, 1 - y * 2, color[0], color[1], color[2], alpha);
    };
    const addLine = (from: Point, to: Point, width: number, color: [number, number, number], alpha: number) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(0.0001, Math.hypot(dx, dy));
      const normalX = (-dy / length) * width;
      const normalY = (dx / length) * width;
      addVertex(from.x + normalX, from.y + normalY, color, alpha);
      addVertex(from.x - normalX, from.y - normalY, color, alpha);
      addVertex(to.x + normalX, to.y + normalY, color, alpha);
      addVertex(from.x - normalX, from.y - normalY, color, alpha);
      addVertex(to.x + normalX, to.y + normalY, color, alpha);
      addVertex(to.x - normalX, to.y - normalY, color, alpha);
    };

    for (const runway of runways()) {
      addLine(runway.threshold, runway.end, 0.015, [0.02, 0.035, 0.05], 0.95);
      addLine(runway.threshold, runway.end, 0.0037, runway.color, 0.96);
      const entry = getApproachEntry({ startX: runway.threshold.x, startY: runway.threshold.y, heading: runway.heading } as any, 0.18);
      addLine(entry, runway.threshold, 0.0012, runway.color, 0.58);
    }
    for (const plane of planesRef.current) {
      const path = [{ x: plane.x, y: plane.y }, ...plane.route];
      for (let index = 0; index < path.length - 1; index += 1) {
        addLine(path[index], path[index + 1], 0.0016, colorFor(plane.type), 0.76);
      }
    }

    if (geometry.length > 0) {
      gl.useProgram(assets.color);
      gl.bindBuffer(gl.ARRAY_BUFFER, assets.geometry);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry), gl.DYNAMIC_DRAW);
      const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
      const position = gl.getAttribLocation(assets.color, 'a_position');
      const color = gl.getAttribLocation(assets.color, 'a_color');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(color);
      gl.vertexAttribPointer(color, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
      gl.drawArrays(gl.TRIANGLES, 0, geometry.length / 6);
    }

    const aircraft: number[] = [];
    const addPlaneVertex = (x: number, y: number, color: [number, number, number], alpha: number) => {
      aircraft.push(x * 2 - 1, 1 - y * 2, color[0], color[1], color[2], alpha);
    };
    for (const plane of planesRef.current) {
      const color = plane.warning === 2 ? [1, 0.24, 0.44] as [number, number, number]
        : plane.warning === 1 ? [1, 0.70, 0] as [number, number, number]
          : colorFor(plane.type);
      const size = plane.isLanding ? 0.018 : 0.021;
      const forward = { x: Math.cos(plane.heading), y: Math.sin(plane.heading) };
      const side = { x: -forward.y, y: forward.x };
      const nose = { x: plane.x + forward.x * size * 1.45, y: plane.y + forward.y * size * 1.45 };
      const tail = { x: plane.x - forward.x * size, y: plane.y - forward.y * size };
      const left = { x: plane.x + side.x * size * 1.25 - forward.x * size * 0.12, y: plane.y + side.y * size * 1.25 - forward.y * size * 0.12 };
      const right = { x: plane.x - side.x * size * 1.25 - forward.x * size * 0.12, y: plane.y - side.y * size * 1.25 - forward.y * size * 0.12 };
      addPlaneVertex(nose.x, nose.y, color, 1); addPlaneVertex(left.x, left.y, color, 0.96); addPlaneVertex(tail.x, tail.y, color, 0.82);
      addPlaneVertex(nose.x, nose.y, color, 1); addPlaneVertex(tail.x, tail.y, color, 0.82); addPlaneVertex(right.x, right.y, color, 0.96);
    }
    if (aircraft.length > 0) {
      gl.useProgram(assets.color);
      gl.bindBuffer(gl.ARRAY_BUFFER, assets.geometry);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(aircraft), gl.DYNAMIC_DRAW);
      const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
      const position = gl.getAttribLocation(assets.color, 'a_position');
      const color = gl.getAttribLocation(assets.color, 'a_color');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(color);
      gl.vertexAttribPointer(color, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
      gl.drawArrays(gl.TRIANGLES, 0, aircraft.length / 6);
    }
  }, [dimensions, runways]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
    if (!gl) return;
    try {
      const scene = compileProgram(gl, SCENE_VERTEX, SCENE_FRAGMENT);
      const color = compileProgram(gl, VERTEX_SHADER, COLOR_FRAGMENT);
      const texture = gl.createTexture()!;
      const geometry = gl.createBuffer()!;
      glRef.current = gl;
      programsRef.current = { scene, color, texture, geometry };
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([4, 23, 35, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const image = new Image();
      image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      };
      image.src = typeof coastalAirportScene === 'string' ? coastalAirportScene : coastalAirportScene?.uri;
      setWebglReady(true);
    } catch (error) {
      console.error('Skyline WebGL initialization failed', error);
      setWebglReady(false);
    }
    const recoverContext = (event: Event) => {
      event.preventDefault();
      programsRef.current = null;
      glRef.current = null;
      setWebglReady(false);
    };
    canvas.addEventListener('webglcontextlost', recoverContext, false);
    return () => canvas.removeEventListener('webglcontextlost', recoverContext);
  }, []);

  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      const last = lastFrameRef.current || now;
      const delta = Math.min((now - last) / 1000, 0.1);
      lastFrameRef.current = now;
      if (!pausedRef.current && !stoppedRef.current) {
        const pacing = consumeFixedSteps(accumulatorRef.current, delta);
        accumulatorRef.current = pacing.remainder;
        for (let step = 0; step < pacing.steps; step += 1) {
          stepSimulation(1 / 60);
        }
      }
      render(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [render, stepSimulation]);

  const normalizedPointer = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };

  const startRoute = (clientX: number, clientY: number) => {
    const point = normalizedPointer(clientX, clientY);
    if (!point || stoppedRef.current) return;
    let selected = planesRef.current.find((plane) => !plane.isLanding && Math.hypot(plane.x - point.x, plane.y - point.y) < 0.065);
    if (!selected) {
      selected = planesRef.current.find((plane) => {
        const points = [{ x: plane.x, y: plane.y }, ...plane.route];
        return points.some((node, index) => index < points.length - 1 && distanceToLineSegment(point, node, points[index + 1]) < 0.042);
      });
    }
    if (selected) {
      selectedIdRef.current = selected.id;
      drawPointRef.current = point;
      sounds.playSelect();
    }
  };

  const moveRoute = (clientX: number, clientY: number) => {
    if (!selectedIdRef.current) return;
    drawPointRef.current = normalizedPointer(clientX, clientY);
  };

  const endRoute = () => {
    const selectedId = selectedIdRef.current;
    const drawnPoint = drawPointRef.current;
    if (selectedId && drawnPoint) {
      const plane = planesRef.current.find((entry) => entry.id === selectedId);
      const runway = plane && runways().find((entry) => entry.allowedTypes.includes(plane.type));
      if (plane && runway) {
        plane.route = buildAssistedRoute(
          plane,
          drawnPoint,
          { startX: runway.threshold.x, startY: runway.threshold.y, heading: runway.heading } as any,
        );
        sounds.playSelect();
      }
    }
    selectedIdRef.current = null;
    drawPointRef.current = null;
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 80 && height > 120) setDimensions({ width, height });
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height, display: 'block', touchAction: 'none' }}
        onMouseDown={(event) => startRoute(event.clientX, event.clientY)}
        onMouseMove={(event) => moveRoute(event.clientX, event.clientY)}
        onMouseUp={endRoute}
        onMouseLeave={endRoute}
        onTouchStart={(event) => { if (event.touches[0]) startRoute(event.touches[0].clientX, event.touches[0].clientY); }}
        onTouchMove={(event) => { if (event.touches[0]) moveRoute(event.touches[0].clientX, event.touches[0].clientY); }}
        onTouchEnd={endRoute}
      />
      <View pointerEvents="none" style={styles.labelLayer}>
        <View style={[styles.routeLabel, styles.jetLabel]}><Text style={styles.routeLabelText}>JET + SST · R34</Text></View>
        <View style={[styles.routeLabel, styles.propLabel]}><Text style={styles.routeLabelText}>PROP · R28</Text></View>
        <View style={[styles.routeLabel, styles.seaLabel]}><Text style={styles.routeLabelText}>SEA · BAY</Text></View>
        {!webglReady && <View style={styles.loading}><Text style={styles.routeLabelText}>GPU INITIALIZING…</Text></View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#061a29',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.30)',
  },
  labelLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  routeLabel: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(3, 12, 20, 0.86)',
    borderWidth: 1,
  },
  routeLabelText: {
    color: '#ffffff',
    fontFamily: 'monospace',
    fontWeight: '800',
    fontSize: 10,
  },
  jetLabel: { left: '47%', top: '13%', borderColor: '#00E5FF' },
  propLabel: { left: '12%', top: '23%', borderColor: '#FFB300' },
  seaLabel: { left: '8%', top: '66%', borderColor: '#00E676' },
  loading: {
    position: 'absolute',
    alignSelf: 'center',
    top: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(3, 12, 20, 0.72)',
    borderRadius: 8,
  },
});
