import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Platform, Dimensions, LayoutChangeEvent } from 'react-native';
import {
  AircraftInstance,
  AircraftType,
  AIRCRAFT_DEFS,
  RunwayZone,
  Point,
  LEVELS,
  GameLevel,
} from '@/constants/game-types';
import { sounds } from '@/lib/sound-controller';
import * as Haptics from 'expo-haptics';

interface AirTrafficCanvasProps {
  levelIndex: number;
  isPaused: boolean;
  soundEnabled: boolean;
  onPlaneLanded: (type: AircraftType, scoreGain: number, totalLandings: number) => void;
  onGameOver: (reason: string, finalScore: number, finalLandings: number) => void;
  onLevelComplete: (level: number) => void;
}

export const AirTrafficCanvas: React.FC<AirTrafficCanvasProps> = ({
  levelIndex,
  isPaused,
  soundEnabled,
  onPlaneLanded,
  onGameOver,
  onLevelComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<View | null>(null);

  // Layout bounds
  const [dimensions, setDimensions] = useState({
    width: Math.min(Dimensions.get('window').width, 480),
    height: Math.min(Dimensions.get('window').height * 0.76, 680),
  });

  const planesRef = useRef<AircraftInstance[]>([]);
  const selectedPlaneIdRef = useRef<string | null>(null);
  const activeDrawPathRef = useRef<Point[]>([]);
  const lastSpawnTimeRef = useRef<number>(Date.now());
  const scoreRef = useRef<number>(0);
  const landingsCountRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const radarSweepAngleRef = useRef<number>(0);
  const isGameOverRef = useRef<boolean>(false);
  const runwaysRef = useRef<RunwayZone[]>([]);
  const warningBeepCooldownRef = useRef<number>(0);

  sounds.enabled = soundEnabled;
  const currentLevel: GameLevel = LEVELS[levelIndex] || LEVELS[0];

  // Initialize Runways based on dimensions
  const updateRunwayCoordinates = useCallback((w: number, h: number) => {
    // 1. Main North-South Runway (Jets & Supersonic)
    const mainRunway: RunwayZone = {
      id: 'runway-main',
      name: 'Runway 34 / 16',
      startX: w * 0.58,
      startY: h * 0.16,
      endX: w * 0.58,
      endY: h * 0.78,
      allowedTypes: ['jet', 'supersonic'],
      heading: Math.PI / 2, // Landing Southbound downwards
      headingTolerance: 0.85,
      touchdownRadius: 36,
      color: '#00E5FF',
      type: 'runway',
    };

    // 2. Diagonal Cross Runway (Propeller / Commuter)
    const diagRunway: RunwayZone = {
      id: 'runway-diagonal',
      name: 'Runway 28',
      startX: w * 0.22,
      startY: h * 0.24,
      endX: w * 0.86,
      endY: h * 0.64,
      allowedTypes: ['propeller'],
      heading: Math.atan2(h * 0.4, w * 0.64),
      headingTolerance: 0.85,
      touchdownRadius: 34,
      color: '#FFB300',
      type: 'runway',
    };

    // 3. Lagoon Water Waterway (Seaplanes)
    const waterZone: RunwayZone = {
      id: 'water-bay',
      name: 'Blue Lagoon Bay',
      startX: w * 0.14,
      startY: h * 0.72,
      endX: w * 0.42,
      endY: h * 0.90,
      allowedTypes: ['seaplane'],
      heading: Math.atan2(h * 0.18, w * 0.28),
      headingTolerance: 1.1,
      touchdownRadius: 42,
      color: '#00E676',
      type: 'water',
    };

    runwaysRef.current = [mainRunway, diagRunway, waterZone];
  }, []);

  // Spawn aircraft from perimeter
  const spawnAircraft = useCallback(() => {
    if (isGameOverRef.current) return;
    const w = dimensions.width;
    const h = dimensions.height;
    if (w <= 0 || h <= 0) return;

    // Pick type allowed in this level
    const types = currentLevel.allowedTypes;
    const type = types[Math.floor(Math.random() * types.length)];
    const def = AIRCRAFT_DEFS[type];

    // Pick edge (0: top, 1: right, 2: bottom, 3: left)
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    let heading = 0;

    const margin = 20;
    if (edge === 0) {
      // Top
      x = margin + Math.random() * (w - 2 * margin);
      y = -10;
      heading = Math.PI * 0.25 + Math.random() * Math.PI * 0.5; // Downwards
    } else if (edge === 1) {
      // Right
      x = w + 10;
      y = margin + Math.random() * (h - 2 * margin);
      heading = Math.PI * 0.75 + Math.random() * Math.PI * 0.5; // Leftwards
    } else if (edge === 2) {
      // Bottom
      x = margin + Math.random() * (w - 2 * margin);
      y = h + 10;
      heading = -Math.PI * 0.25 - Math.random() * Math.PI * 0.5; // Upwards
    } else {
      // Left
      x = -10;
      y = margin + Math.random() * (h - 2 * margin);
      heading = -Math.PI * 0.25 + Math.random() * Math.PI * 0.5; // Rightwards
    }

    const newPlane: AircraftInstance = {
      id: `plane-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      x,
      y,
      heading,
      targetHeading: heading,
      speed: def.speed,
      path: [],
      isLanding: false,
      landingProgress: 0,
      warningLevel: 'safe',
      landed: false,
      createdAt: Date.now(),
    };

    planesRef.current.push(newPlane);
    sounds.playRadarPing();
  }, [dimensions, currentLevel]);

  // Handle plane collision logic & proximity warning
  const checkCollisionsAndWarnings = useCallback(() => {
    const planes = planesRef.current;
    let hasCritical = false;

    for (let i = 0; i < planes.length; i++) {
      planes[i].warningLevel = 'safe';
    }

    for (let i = 0; i < planes.length; i++) {
      const p1 = planes[i];
      if (p1.landed || p1.isLanding) continue;

      for (let j = i + 1; j < planes.length; j++) {
        const p2 = planes[j];
        if (p2.landed || p2.isLanding) continue;

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Crash collision radius (~24px)
        if (dist < 26) {
          isGameOverRef.current = true;
          sounds.playCrash();
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          onGameOver('Mid-air Collision!', scoreRef.current, landingsCountRef.current);
          return;
        }

        // Warning proximity radius (~60px)
        if (dist < 65) {
          p1.warningLevel = 'critical';
          p2.warningLevel = 'critical';
          hasCritical = true;
        } else if (dist < 95 && p1.warningLevel !== 'critical' && p2.warningLevel !== 'critical') {
          p1.warningLevel = 'caution';
          p2.warningLevel = 'caution';
        }
      }
    }

    if (hasCritical && warningBeepCooldownRef.current <= 0) {
      sounds.playWarning();
      warningBeepCooldownRef.current = 0.6; // sound interval
    }
  }, [onGameOver]);

  // Update plane positions and path navigation
  const updatePhysics = useCallback((dt: number) => {
    const planes = planesRef.current;
    const runways = runwaysRef.current;

    warningBeepCooldownRef.current -= dt;

    for (let i = planes.length - 1; i >= 0; i--) {
      const p = planes[i];

      // Landing animation sequence
      if (p.isLanding) {
        p.landingProgress += dt * 0.7; // landing takes ~1.4 seconds
        p.speed = Math.max(10, p.speed * (1 - dt * 0.8));

        // Follow runway centerline to completion
        const targetRunway = runways.find(r => r.allowedTypes.includes(p.type));
        if (targetRunway) {
          const rx = targetRunway.startX + (targetRunway.endX - targetRunway.startX) * p.landingProgress;
          const ry = targetRunway.startY + (targetRunway.endY - targetRunway.startY) * p.landingProgress;
          p.x = rx;
          p.y = ry;
        }

        if (p.landingProgress >= 1) {
          p.landed = true;
          planes.splice(i, 1);
          landingsCountRef.current += 1;
          const scoreBonus = AIRCRAFT_DEFS[p.type].scoreValue;
          scoreRef.current += scoreBonus;
          sounds.playLandingSuccess();
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          onPlaneLanded(p.type, scoreBonus, landingsCountRef.current);

          // Check level complete
          if (landingsCountRef.current >= currentLevel.targetLandings) {
            onLevelComplete(levelIndex + 1);
          }
        }
        continue;
      }

      // If user drew path, follow it
      if (p.path.length > 0) {
        const nextPoint = p.path[0];
        const dx = nextPoint.x - p.x;
        const dy = nextPoint.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10) {
          p.path.shift(); // Reached waypoint
        } else {
          p.targetHeading = Math.atan2(dy, dx);
        }
      }

      // Smooth turn towards target heading
      let diff = p.targetHeading - p.heading;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      const def = AIRCRAFT_DEFS[p.type];
      const maxTurn = def.turnSpeed * dt;
      if (Math.abs(diff) < maxTurn) {
        p.heading = p.targetHeading;
      } else {
        p.heading += Math.sign(diff) * maxTurn;
      }

      // Move forward
      p.x += Math.cos(p.heading) * p.speed * dt;
      p.y += Math.sin(p.heading) * p.speed * dt;

      // Check Runway Touchdown Gates
      for (const runway of runways) {
        if (!runway.allowedTypes.includes(p.type)) continue;

        const gateDist = Math.sqrt(
          (p.x - runway.startX) * (p.x - runway.startX) +
          (p.y - runway.startY) * (p.y - runway.startY)
        );

        if (gateDist < runway.touchdownRadius) {
          // Check approach angle
          let angleDiff = Math.abs(p.heading - runway.heading);
          while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

          if (angleDiff <= runway.headingTolerance) {
            p.isLanding = true;
            p.path = [];
            p.heading = runway.heading;
            break;
          }
        }
      }

      // Screen boundaries wrap / bounce softly
      const margin = 35;
      const w = dimensions.width;
      const h = dimensions.height;
      if (p.x < -margin || p.x > w + margin || p.y < -margin || p.y > h + margin) {
        // Steer back to center if neglected
        const cx = w / 2;
        const cy = h / 2;
        p.targetHeading = Math.atan2(cy - p.y, cx - p.x);
      }
    }
  }, [dimensions, currentLevel, levelIndex, onPlaneLanded, onLevelComplete]);

  // Main Render Loop onto HTML Canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = dimensions.width;
    const h = dimensions.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // 1. Premium airport map background: deep ocean, island, apron and taxiways
    const waterGrad = ctx.createLinearGradient(0, 0, w, h);
    waterGrad.addColorStop(0, '#04121f');
    waterGrad.addColorStop(0.55, '#092b3f');
    waterGrad.addColorStop(1, '#061a2a');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, w, h);

    // Fine ocean-current lines add depth without competing with the aircraft.
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 196, 224, 0.07)';
    ctx.lineWidth = 1;
    for (let offset = -h; offset < w + h; offset += 34) {
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + h, h);
      ctx.stroke();
    }
    ctx.restore();

    // Island landmass polygon
    const islandGrad = ctx.createLinearGradient(w * 0.1, h * 0.1, w * 0.9, h * 0.9);
    islandGrad.addColorStop(0, '#244e3f');
    islandGrad.addColorStop(1, '#102d28');
    ctx.fillStyle = islandGrad;
    ctx.beginPath();
    ctx.moveTo(w * 0.10, h * 0.08);
    ctx.bezierCurveTo(w * 0.65, h * 0.02, w * 0.95, h * 0.20, w * 0.92, h * 0.50);
    ctx.bezierCurveTo(w * 0.90, h * 0.85, w * 0.55, h * 0.94, w * 0.25, h * 0.86);
    ctx.bezierCurveTo(w * 0.05, h * 0.70, w * 0.02, h * 0.30, w * 0.10, h * 0.08);
    ctx.fill();

    // Sandy coast shoreline border
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(86, 212, 157, 0.58)';
    ctx.stroke();

    // Terminal apron and taxiway grid give the airport a more recognizable place.
    ctx.save();
    const apronX = w * 0.18;
    const apronY = h * 0.38;
    const apronW = w * 0.27;
    const apronH = h * 0.30;
    ctx.fillStyle = 'rgba(33, 45, 57, 0.92)';
    ctx.fillRect(apronX, apronY, apronW, apronH);
    ctx.strokeStyle = 'rgba(255, 190, 70, 0.5)';
    ctx.lineWidth = 1;
    for (let tx = apronX + 14; tx < apronX + apronW; tx += 26) {
      ctx.beginPath();
      ctx.moveTo(tx, apronY + 8);
      ctx.lineTo(tx, apronY + apronH - 8);
      ctx.stroke();
    }
    ctx.fillStyle = '#d8e5ef';
    ctx.font = '700 9px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SKYLINE TERMINAL', apronX + 10, apronY + 16);
    ctx.restore();

    // 2. Radar Concentric Rings & Radial Scan
    const cx = w * 0.5;
    const cy = h * 0.48;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
    for (let r = 50; r <= Math.max(w, h); r += 65) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotating Radar Sweep Light beam
    radarSweepAngleRef.current += 0.025;
    const sweepA = radarSweepAngleRef.current;
    const sweepGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h));
    sweepGrad.addColorStop(0, 'rgba(0, 229, 255, 0.18)');
    sweepGrad.addColorStop(1, 'rgba(0, 229, 255, 0.0)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.max(w, h), sweepA, sweepA + 0.45);
    ctx.closePath();
    ctx.fillStyle = sweepGrad;
    ctx.fill();
    ctx.restore();

    // 3. Draw runways, bright approach gates and unambiguous destination labels.
    runwaysRef.current.forEach(runway => {
      // Runway asphalt strip
      ctx.save();
      ctx.shadowColor = runway.color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = runway.type === 'water' ? 30 : 28;
      ctx.lineCap = 'round';
      ctx.strokeStyle = runway.type === 'water' ? 'rgba(0, 100, 85, 0.72)' : '#121923';
      ctx.beginPath();
      ctx.moveTo(runway.startX, runway.startY);
      ctx.lineTo(runway.endX, runway.endY);
      ctx.stroke();

      // Border lights / threshold
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = runway.color;
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center dash line
      if (runway.type === 'runway') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(runway.startX, runway.startY);
        ctx.lineTo(runway.endX, runway.endY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Touchdown Entry Gate (Circle & pulsing ring)
      ctx.lineWidth = 3;
      ctx.strokeStyle = runway.color;
      ctx.fillStyle = 'rgba(3, 12, 20, 0.88)';
      ctx.beginPath();
      ctx.arc(runway.startX, runway.startY, runway.touchdownRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Approach glidecone indicator
      const coneLength = 55;
      const appAngle = runway.heading + Math.PI; // pointing back into the sky
      const halfAngle = 0.35;
      ctx.fillStyle = `${runway.color}22`;
      ctx.beginPath();
      ctx.moveTo(runway.startX, runway.startY);
      ctx.arc(runway.startX, runway.startY, coneLength, appAngle - halfAngle, appAngle + halfAngle);
      ctx.closePath();
      ctx.fill();

      // Large color plus text label means a player never needs to interpret color alone.
      const runwayLabel = runway.id === 'runway-main'
        ? 'JET + SST · R34'
        : runway.id === 'runway-diagonal'
          ? 'PROP · R28'
          : 'SEAPLANE · BAY';
      ctx.font = '800 10px -apple-system, system-ui, sans-serif';
      const labelWidth = ctx.measureText(runwayLabel).width + 14;
      ctx.fillStyle = 'rgba(3, 12, 20, 0.90)';
      ctx.fillRect(runway.startX - labelWidth / 2, runway.startY - runway.touchdownRadius - 24, labelWidth, 17);
      ctx.strokeStyle = runway.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(runway.startX - labelWidth / 2, runway.startY - runway.touchdownRadius - 24, labelWidth, 17);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(runwayLabel, runway.startX, runway.startY - runway.touchdownRadius - 12);
      ctx.restore();
    });

    // 4. Draw Flight Paths
    planesRef.current.forEach(p => {
      if (p.path.length > 0) {
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = p.isLanding ? '#00E676' : AIRCRAFT_DEFS[p.type].color;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        p.path.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
        ctx.setLineDash([]);

        // Target waypoint node
        const endPt = p.path[p.path.length - 1];
        ctx.fillStyle = AIRCRAFT_DEFS[p.type].color;
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // Active touch drawing path
    if (activeDrawPathRef.current.length > 1) {
      ctx.save();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(activeDrawPathRef.current[0].x, activeDrawPathRef.current[0].y);
      activeDrawPathRef.current.forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
      ctx.restore();
    }

    // 5. Draw Aircraft Sprites
    planesRef.current.forEach(p => {
      const def = AIRCRAFT_DEFS[p.type];
      const scale = p.isLanding ? Math.max(0.4, 1 - p.landingProgress * 0.5) : 1;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.heading);
      ctx.scale(scale, scale);

      // Warning Proximity Halo
      if (p.warningLevel === 'critical') {
        const pulse = 1 + Math.sin(Date.now() * 0.02) * 0.15;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FF3D71';
        ctx.beginPath();
        ctx.arc(0, 0, 32 * pulse, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.warningLevel === 'caution') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFB300';
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(3, 4, def.length * 0.45, def.wingspan * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Plane Body
      ctx.fillStyle = def.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;

      if (p.type === 'supersonic') {
        // Delta wing supersonic jet
        ctx.beginPath();
        ctx.moveTo(def.length * 0.55, 0); // nose
        ctx.lineTo(-def.length * 0.45, def.wingspan * 0.5); // wing tip right
        ctx.lineTo(-def.length * 0.25, 0); // wing root
        ctx.lineTo(-def.length * 0.45, -def.wingspan * 0.5); // wing tip left
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.type === 'seaplane') {
        // Twin-pontoon seaplane
        ctx.beginPath();
        ctx.roundRect(-def.length * 0.4, -def.wingspan * 0.35, def.length * 0.8, 4, 2);
        ctx.roundRect(-def.length * 0.4, def.wingspan * 0.35 - 4, def.length * 0.8, 4, 2);
        ctx.fill();

        // Main fuselage
        ctx.beginPath();
        ctx.ellipse(0, 0, def.length * 0.45, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // High wing
        ctx.fillRect(-4, -def.wingspan * 0.5, 8, def.wingspan);
      } else {
        // Commercial Jet / Propeller
        // Fuselage
        ctx.beginPath();
        ctx.ellipse(0, 0, def.length * 0.48, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Wings
        ctx.beginPath();
        ctx.moveTo(-2, -def.wingspan * 0.5);
        ctx.lineTo(6, 0);
        ctx.lineTo(-2, def.wingspan * 0.5);
        ctx.lineTo(-8, def.wingspan * 0.45);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-8, -def.wingspan * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Tail fins
        ctx.beginPath();
        ctx.moveTo(-def.length * 0.42, -def.wingspan * 0.2);
        ctx.lineTo(-def.length * 0.32, 0);
        ctx.lineTo(-def.length * 0.42, def.wingspan * 0.2);
        ctx.closePath();
        ctx.fill();
      }

      // Cockpit Window
      ctx.fillStyle = '#1a2233';
      ctx.beginPath();
      ctx.arc(def.length * 0.28, 0, 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Selected ring
      if (selectedPlaneIdRef.current === p.id) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      // High contrast callsign chip: the route is readable without relying on colour.
      const routeLabel = p.type === 'jet'
        ? 'JET → R34'
        : p.type === 'supersonic'
          ? 'SST → R34'
          : p.type === 'propeller'
            ? 'PROP → R28'
            : 'SEA → BAY';
      ctx.save();
      ctx.font = '800 10px -apple-system, system-ui, sans-serif';
      const routeWidth = ctx.measureText(routeLabel).width + 12;
      const tagY = p.y - 35;
      ctx.fillStyle = 'rgba(3, 12, 20, 0.90)';
      ctx.fillRect(p.x - routeWidth / 2, tagY, routeWidth, 16);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - routeWidth / 2, tagY, routeWidth, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(routeLabel, p.x, tagY + 11.5);
      ctx.restore();
    });
  }, [dimensions]);

  // Main Animation Tick
  useEffect(() => {
    let isRunning = true;

    const tick = (now: number) => {
      if (!isRunning) return;
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
      lastFrameTimeRef.current = now;

      if (!isPaused && !isGameOverRef.current) {
        // Spawn schedule
        if (now - lastSpawnTimeRef.current > currentLevel.spawnIntervalMs) {
          spawnAircraft();
          lastSpawnTimeRef.current = now;
        }

        updatePhysics(dt);
        checkCollisionsAndWarnings();
      }

      draw();
      animationFrameIdRef.current = requestAnimationFrame(tick);
    };

    lastFrameTimeRef.current = performance.now();
    animationFrameIdRef.current = requestAnimationFrame(tick);

    return () => {
      isRunning = false;
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [isPaused, currentLevel, spawnAircraft, updatePhysics, checkCollisionsAndWarnings, draw]);

  // Touch / Pointer Event Handlers for Web Canvas and Mobile Gestures
  const handlePointerDown = (clientX: number, clientY: number) => {
    if (isPaused || isGameOverRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Find closest aircraft within touch radius (36px)
    let closestPlane: AircraftInstance | null = null;
    let minDist = 38;

    for (const plane of planesRef.current) {
      if (plane.isLanding || plane.landed) continue;
      const d = Math.sqrt((plane.x - x) * (plane.x - x) + (plane.y - y) * (plane.y - y));
      if (d < minDist) {
        minDist = d;
        closestPlane = plane;
      }
    }

    if (closestPlane) {
      selectedPlaneIdRef.current = closestPlane.id;
      activeDrawPathRef.current = [{ x: closestPlane.x, y: closestPlane.y }, { x, y }];
      closestPlane.path = [];
      sounds.playSelect();
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      selectedPlaneIdRef.current = null;
      activeDrawPathRef.current = [];
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!selectedPlaneIdRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const path = activeDrawPathRef.current;
    if (path.length > 0) {
      const last = path[path.length - 1];
      const dist = Math.sqrt((last.x - x) * (last.x - x) + (last.y - y) * (last.y - y));
      if (dist > 8) {
        path.push({ x, y });
      }
    }
  };

  const handlePointerUp = () => {
    if (selectedPlaneIdRef.current) {
      const plane = planesRef.current.find(p => p.id === selectedPlaneIdRef.current);
      if (plane && activeDrawPathRef.current.length > 1) {
        plane.path = [...activeDrawPathRef.current];
      }
    }
    selectedPlaneIdRef.current = null;
    activeDrawPathRef.current = [];
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 50 && height > 50) {
      setDimensions({ width, height });
      updateRunwayCoordinates(width, height);
    }
  };

  useEffect(() => {
    updateRunwayCoordinates(dimensions.width, dimensions.height);
  }, [dimensions, updateRunwayCoordinates]);

  // Initial spawn
  useEffect(() => {
    planesRef.current = [];
    isGameOverRef.current = false;
    landingsCountRef.current = 0;
    scoreRef.current = 0;
    setTimeout(() => {
      spawnAircraft();
    }, 400);
  }, [levelIndex, spawnAircraft]);

  return (
    <View ref={containerRef} style={styles.container} onLayout={onLayout}>
      {Platform.OS === 'web' ? (
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          style={{
            width: dimensions.width,
            height: dimensions.height,
            display: 'block',
            touchAction: 'none',
          }}
          onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
          onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
          onMouseUp={handlePointerUp}
          onTouchStart={(e) => {
            if (e.touches[0]) handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchEnd={handlePointerUp}
        />
      ) : (
        <View style={{ width: dimensions.width, height: dimensions.height }} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#061a29',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
});
