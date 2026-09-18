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
  isVerticalDestination,
  isVerticalAircraft,
} from '@/constants/game-types';
import { sounds } from '@/lib/sound-controller';
import { shouldSpawnAircraft } from '@/lib/game-timing';
import {
  distanceToLineSegment,
  getApproachEntry,
} from '@/lib/approach-routing';
import { preservePlayerDrawnRoute } from '@/lib/player-routing';
import { routeThroughLandingCapture, validateLandingRoute } from '@/lib/landing-route-validation';
import { getDriftingCloudShadows } from '@/lib/scenery-effects';
import {
  getDynamicSpawnInterval,
  getStageEnvironment,
  getTrafficPressure,
} from '@/lib/stage-environments';
import { createCrashEffect, getCrashProgress, type CrashEffect } from '@/lib/crash-effects';
import { getAssignedRunway, isAssignedRunway } from '@/lib/runway-assignment';
import { getAircraftSafetyRadius } from '@/lib/aircraft-performance';
import { getLandingDuration, getLandingSequence } from '@/lib/landing-sequence';
import { canCommitLanding, isInsidePhysicalTouchdown } from '@/lib/landing-authorization';
import { classifyTrafficConflict, getConflictColor, type TrafficConflict } from '@/lib/traffic-conflicts';
import {
  blendLandingHeading,
  canBeginForwardRunwayLanding,
  getFinalGlideAimPoint,
  isForwardAlongRunway,
} from '@/lib/landing-motion';
import { canSpawnInSector } from '@/lib/traffic-director';
import { clampRadarLabel, shouldShowFlightTag } from '@/lib/radar-ui';
import {
  cloneRouteSnapshot,
  hasRouteEditIntent,
  restoreRouteSnapshot,
  type RouteSnapshot,
} from '@/lib/route-editing';
import { RELEASE_LABEL } from '@/constants/release';
import { getCanvasPixelRatio, getVisualQuality } from '@/lib/render-quality';
import {
  getCrosswindVector,
  getFuelBand,
  getMissionHazards,
  getMissionPresentation,
  isInsideMissionHazard,
  routeIntersectsMissionHazard,
} from '@/lib/mission-system';
import * as Haptics from 'expo-haptics';

// Served independently and preloaded by app/+html.tsx, so flight controls start
// before the scenic image has finished decoding on a mobile connection.
const coastalAirportScene = '/scenery/airport.jpg';

interface AirTrafficCanvasProps {
  levelIndex: number;
  isPaused: boolean;
  soundEnabled: boolean;
  onPlaneLanded: (type: AircraftType, scoreGain: number, totalLandings: number) => void;
  onGameOver: (reason: string, finalScore: number, finalLandings: number) => void;
  onLevelComplete: (level: number) => void;
  onAutoPause: () => void;
}

export const AirTrafficCanvas: React.FC<AirTrafficCanvasProps> = ({
  levelIndex,
  isPaused,
  soundEnabled,
  onPlaneLanded,
  onGameOver,
  onLevelComplete,
  onAutoPause,
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
  const routeStartPointRef = useRef<Point | null>(null);
  const gestureStartPointRef = useRef<Point | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const routeSnapshotRef = useRef<RouteSnapshot | null>(null);
  const isEditingRouteRef = useRef(false);
  const draftLandingClearedRef = useRef(false);
  // The animation loop passes performance.now(), so the spawn marker must use that same clock.
  const lastSpawnTimeRef = useRef<number>(performance.now());
  const scoreRef = useRef<number>(0);
  const landingsCountRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const radarSweepAngleRef = useRef<number>(0);
  const cloudDriftRef = useRef<number>(0);
  const isGameOverRef = useRef<boolean>(false);
  const runwaysRef = useRef<RunwayZone[]>([]);
  const warningBeepCooldownRef = useRef<number>(0);
  const sceneryImageRef = useRef<HTMLImageElement | null>(null);
  const spawnAircraftRef = useRef<() => void>(() => undefined);
  const crashEffectRef = useRef<CrashEffect | null>(null);
  const crashReportedRef = useRef(false);
  const activeConflictsRef = useRef<TrafficConflict[]>([]);
  const sectorCompleteRef = useRef(false);
  const missionElapsedRef = useRef(0);
  const missionWarningCooldownRef = useRef(0);
  const missionFailureReportedRef = useRef(false);
  const draftHazardViolationRef = useRef(false);

  sounds.enabled = soundEnabled;
  const currentLevel: GameLevel = LEVELS[levelIndex] || LEVELS[0];
  const stageEnvironment = getStageEnvironment(currentLevel.environmentIndex);
  const missionPresentation = getMissionPresentation(currentLevel);

  useEffect(() => {
    sceneryImageRef.current = null;
    const image = new Image();
    image.src = stageEnvironment.sceneUrl || coastalAirportScene;
    image.onload = () => {
      sceneryImageRef.current = image;
    };
  }, [stageEnvironment.sceneUrl]);

  // Initialize Runways based on dimensions
  const updateRunwayCoordinates = useCallback((w: number, h: number) => {
    const layout = currentLevel.mapLayout;
    const mainX = layout === 'ridge' ? w * 0.66 : layout === 'delta' ? w * 0.54 : w * 0.58;
    const diagonalStartX = layout === 'ridge' ? w * 0.14 : w * 0.22;
    const diagonalStartY = layout === 'delta' ? h * 0.31 : h * 0.24;
    const diagonalEndX = layout === 'coastal' ? w * 0.86 : w * 0.82;
    const diagonalEndY = layout === 'ridge' ? h * 0.68 : h * 0.62;
    const helipadX = layout === 'delta' ? w * 0.25 : layout === 'ridge' ? w * 0.20 : w * 0.25;
    const helipadY = layout === 'ridge' ? h * 0.61 : h * 0.53;
    // 1. Main North-South Runway (Jets & Supersonic)
    const mainRunway: RunwayZone = {
      id: 'runway-main',
      name: 'Runway 34 / 16',
      startX: mainX,
      startY: h * 0.16,
      endX: mainX,
      endY: h * 0.78,
      allowedTypes: ['jet', 'supersonic', 'fighter'],
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
      startX: diagonalStartX,
      startY: diagonalStartY,
      endX: diagonalEndX,
      endY: diagonalEndY,
      allowedTypes: ['propeller', 'cargo'],
      heading: Math.atan2(diagonalEndY - diagonalStartY, diagonalEndX - diagonalStartX),
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

    // 4. Dedicated rooftop helipad. Helicopters lock here from any approach direction.
    const helipad: RunwayZone = {
      id: 'helipad-h1',
      name: 'Helipad H1',
      startX: helipadX,
      startY: helipadY,
      endX: helipadX,
      endY: helipadY,
      allowedTypes: ['helicopter', 'tiltrotor'],
      heading: 0,
      headingTolerance: Math.PI,
      touchdownRadius: 34,
      color: '#C86BFF',
      type: 'helipad',
    };

    const mooring: RunwayZone = {
      id: 'mooring-m1',
      name: 'Mooring M1',
      startX: layout === 'ridge' ? w * 0.80 : w * 0.83,
      startY: layout === 'delta' ? h * 0.30 : h * 0.22,
      endX: layout === 'ridge' ? w * 0.80 : w * 0.83,
      endY: layout === 'delta' ? h * 0.30 : h * 0.22,
      allowedTypes: ['zeppelin'],
      heading: 0,
      headingTolerance: Math.PI,
      touchdownRadius: 42,
      color: '#FF5CD6',
      type: 'mooring',
    };

    runwaysRef.current = [mainRunway, diagRunway, waterZone, helipad, mooring];
  }, [currentLevel.mapLayout]);

  // Spawn aircraft from perimeter
  const spawnAircraft = useCallback(() => {
    if (isGameOverRef.current) return;
    if (!canSpawnInSector(planesRef.current, levelIndex)) return;
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
      speed: def.speed * currentLevel.speedMultiplier
        * getTrafficPressure(landingsCountRef.current, currentLevel.targetLandings),
      path: [],
      landingCleared: false,
      isLanding: false,
      landingProgress: 0,
      fuelRemaining: currentLevel.mission === 'fuelPriority' ? def.fuelSeconds : undefined,
      warningLevel: 'safe',
      landed: false,
      createdAt: Date.now(),
    };

    planesRef.current.push(newPlane);
    sounds.playRadarPing();
  }, [dimensions, currentLevel, levelIndex]);

  useEffect(() => {
    spawnAircraftRef.current = spawnAircraft;
  }, [spawnAircraft]);

  // Handle plane collision logic & proximity warning
  const checkCollisionsAndWarnings = useCallback(() => {
    const planes = planesRef.current;
    let hasCritical = false;
    let hasPredictiveAlert = false;
    const conflicts: TrafficConflict[] = [];

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
        const combinedSafetyRadius = getAircraftSafetyRadius(p1.type) + getAircraftSafetyRadius(p2.type);

        // Contact space reflects each vehicle's physical footprint: a compact
        // helicopter can pass closer than a wide airliner, as in the original's mixed fleet.
        if (dist < combinedSafetyRadius) {
          if (!crashEffectRef.current) {
            crashEffectRef.current = createCrashEffect((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
            isGameOverRef.current = true;
            sounds.playCrash();
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          }
          activeConflictsRef.current = [];
          return;
        }

        const conflict = classifyTrafficConflict(
          { id: p1.id, x: p1.x, y: p1.y, heading: p1.heading, speed: p1.speed, safetyRadius: getAircraftSafetyRadius(p1.type) },
          { id: p2.id, x: p2.x, y: p2.y, heading: p2.heading, speed: p2.speed, safetyRadius: getAircraftSafetyRadius(p2.type) },
        );
        if (conflict) conflicts.push(conflict);

        // Immediate danger uses red; predicted convergence uses amber well in advance.
        if (conflict?.severity === 'critical') {
          p1.warningLevel = 'critical';
          p2.warningLevel = 'critical';
          hasCritical = true;
        } else if (conflict?.severity === 'caution'
          && p1.warningLevel !== 'critical' && p2.warningLevel !== 'critical') {
          p1.warningLevel = 'caution';
          p2.warningLevel = 'caution';
          hasPredictiveAlert = true;
        }
      }
    }

    // Several route pairs can converge at once. Spotlighting the most urgent pair gives
    // the controller one clear action instead of turning the entire board into an alarm.
    activeConflictsRef.current = conflicts
      .sort((left, right) => {
        const severityGap = (right.severity === 'critical' ? 1 : 0) - (left.severity === 'critical' ? 1 : 0);
        if (severityGap !== 0) return severityGap;
        return Math.min(left.distance, left.projectedDistance) - Math.min(right.distance, right.projectedDistance);
      })
      .slice(0, 1);

    if (hasCritical && warningBeepCooldownRef.current <= 0) {
      sounds.playWarning();
      warningBeepCooldownRef.current = 0.6; // sound interval
    } else if (hasPredictiveAlert && warningBeepCooldownRef.current <= 0) {
      sounds.playWarning();
      warningBeepCooldownRef.current = 1.4;
    }
  }, [onGameOver]);

  // Update plane positions and path navigation
  const updatePhysics = useCallback((dt: number) => {
    const planes = planesRef.current;
    const runways = runwaysRef.current;
    const missionHazards = getMissionHazards(
      currentLevel.mission,
      dimensions.width,
      dimensions.height,
      missionElapsedRef.current,
    );
    const wind = getCrosswindVector(currentLevel, dt);

    warningBeepCooldownRef.current -= dt;
    missionWarningCooldownRef.current -= dt;

    for (let i = planes.length - 1; i >= 0; i--) {
      const p = planes[i];

      if (currentLevel.mission === 'fuelPriority' && p.fuelRemaining !== undefined && !p.isLanding) {
        p.fuelRemaining = Math.max(0, p.fuelRemaining - dt);
        if (p.fuelRemaining <= 0 && !missionFailureReportedRef.current) {
          missionFailureReportedRef.current = true;
          isGameOverRef.current = true;
          onGameOver('Fuel exhausted — priority arrival lost.', scoreRef.current, landingsCountRef.current);
          return;
        }
      }

      // Staged landing sequence: final approach blends into the threshold, followed by
      // flare, tyre contact, braking, and taxi-out instead of instant runway teleportation.
      if (p.isLanding) {
        p.landingProgress = Math.min(1, p.landingProgress + dt / getLandingDuration(p.type));
        const landing = getLandingSequence(p.type, p.landingProgress);
        const targetRunway = getAssignedRunway(p.type, runways);
        if (targetRunway) {
          const entry = p.landingEntry ?? { x: p.x, y: p.y };
          p.landingEntry = entry;
          p.landingEntrySpeed ??= p.speed;
          p.landingEntryHeading ??= p.heading;
          p.speed = p.landingEntrySpeed * landing.speedFactor;
          p.heading = isVerticalDestination(targetRunway)
            ? p.landingEntryHeading
            : blendLandingHeading(p.landingEntryHeading, targetRunway.heading, landing.approachBlend);

          if (isVerticalDestination(targetRunway)) {
            p.x = entry.x + (targetRunway.startX - entry.x) * landing.approachBlend;
            p.y = entry.y + (targetRunway.startY - entry.y) * landing.approachBlend;
          } else if (landing.approachBlend < 0.999) {
            p.x = entry.x + (targetRunway.startX - entry.x) * landing.approachBlend;
            p.y = entry.y + (targetRunway.startY - entry.y) * landing.approachBlend;
          } else {
            p.x = targetRunway.startX + (targetRunway.endX - targetRunway.startX) * landing.runwayProgress;
            p.y = targetRunway.startY + (targetRunway.endY - targetRunway.startY) * landing.runwayProgress;
          }
          // A malformed route can never make the landing animation travel back up the runway.
          if (!isVerticalDestination(targetRunway) && !isForwardAlongRunway(entry.x, entry.y, p.x, p.y, targetRunway.heading)) {
            p.x = targetRunway.startX;
            p.y = targetRunway.startY;
          }
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
            sectorCompleteRef.current = true;
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

        if (dist < 24) {
          p.path.shift(); // Reached waypoint
        } else {
          p.targetHeading = Math.atan2(dy, dx);
        }
      }

      // A green player-drawn route has reached the matching final-approach gate. Once every
      // point in that exact route is flown, capture the aircraft for the final glide to the
      // threshold rather than letting it coast past a valid landing line. This changes no
      // player waypoint; it simply makes the accepted landing intent reliable.
      const clearedDestination = p.landingCleared && p.path.length === 0
        ? getAssignedRunway(p.type, runways)
        : undefined;
      if (clearedDestination) {
        const glideAimPoint = getFinalGlideAimPoint(clearedDestination);
        p.targetHeading = Math.atan2(glideAimPoint.y - p.y, glideAimPoint.x - p.x);
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

      // Crosswind shifts the aircraft but never edits the controller's line. The player
      // sees the flight drift and can issue a new deliberate course, as in a live sector.
      p.x += wind.x;
      p.y += wind.y;

      for (const hazard of missionHazards) {
        if (!isInsideMissionHazard(p, hazard, getAircraftSafetyRadius(p.type) * 0.35)) continue;
        if (hazard.kind === 'storm') {
          const escapeHeading = Math.atan2(p.y - hazard.y, p.x - hazard.x);
          p.x += Math.cos(escapeHeading) * dt * 8;
          p.y += Math.sin(escapeHeading) * dt * 8;
          continue;
        }
        if (!missionFailureReportedRef.current) {
          missionFailureReportedRef.current = true;
          isGameOverRef.current = true;
          onGameOver(`${hazard.label} breach — aircraft lost.`, scoreRef.current, landingsCountRef.current);
          return;
        }
      }

      // A flight can only land after the player completes a route that reached the green
      // clearance state. Merely flying through a runway capture circle never authorizes landing.
      const assignedRunway = getAssignedRunway(p.type, runways);
      if (assignedRunway) {
        let angleDiff = Math.abs(p.heading - assignedRunway.heading);
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

        const authorized = canCommitLanding({
          landingCleared: p.landingCleared,
          routeComplete: p.path.length === 0,
          insideCapture: isInsidePhysicalTouchdown(p, assignedRunway),
          headingDifference: angleDiff,
          headingTolerance: Math.min(Math.PI, assignedRunway.headingTolerance + 0.55),
          isHelipad: isVerticalDestination(assignedRunway),
        });
        // Do not freeze the staged landing animation after the aircraft has crossed the
        // threshold. It must still be in front of it so every animated position advances.
        const isForwardEntry = isVerticalDestination(assignedRunway)
          || canBeginForwardRunwayLanding(p, assignedRunway);
        if (authorized && isForwardEntry) {
          const incomingHeading = p.heading;
          p.isLanding = true;
          p.path = [];
          p.heading = incomingHeading;
          p.landingEntry = { x: p.x, y: p.y };
          p.landingEntrySpeed = p.speed;
          p.landingEntryHeading = incomingHeading;
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
  }, [dimensions, currentLevel, levelIndex, onPlaneLanded, onLevelComplete, onGameOver]);

  // Main Render Loop onto HTML Canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = dimensions.width;
    const h = dimensions.height;
    const pixelRatio = getCanvasPixelRatio(
      Platform.OS === 'web' && typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    );
    const visualQuality = getVisualQuality(planesRef.current.length);

    // Clear
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);

    // 1. Premium airport map background: deep ocean, island, apron and taxiways
    const waterGrad = ctx.createLinearGradient(0, 0, w, h);
    waterGrad.addColorStop(0, '#04121f');
    waterGrad.addColorStop(0.55, '#092b3f');
    waterGrad.addColorStop(1, '#061a2a');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, w, h);

    // Photorealistic island scenery sits beneath the tactical overlays at a soft opacity.
    // The deliberate darkening keeps game routes more legible than the photograph itself.
    if (sceneryImageRef.current?.complete) {
      const image = sceneryImageRef.current;
      const imageRatio = image.width / image.height;
      const boardRatio = w / h;
      let drawWidth = w;
      let drawHeight = h;
      let drawX = 0;
      let drawY = 0;
      if (imageRatio > boardRatio) {
        drawWidth = h * imageRatio;
        drawX = (w - drawWidth) / 2;
      } else {
        drawHeight = w / imageRatio;
        drawY = (h - drawHeight) / 2;
      }
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      ctx.fillStyle = stageEnvironment.tint;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Fine ocean-current lines add depth without competing with the aircraft.
    if (visualQuality !== 'focused') {
      ctx.save();
      ctx.strokeStyle = 'rgba(80, 196, 224, 0.055)';
      ctx.lineWidth = 1;
      for (let offset = -h; offset < w + h; offset += 42) {
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.lineTo(offset + h, h);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Island landmass keeps the real landscape visible rather than covering it with a flat map layer.
    const islandGrad = ctx.createLinearGradient(w * 0.1, h * 0.1, w * 0.9, h * 0.9);
    islandGrad.addColorStop(0, '#244e3f');
    islandGrad.addColorStop(1, stageEnvironment.terrainTint);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = islandGrad;
    ctx.beginPath();
    ctx.moveTo(w * 0.10, h * 0.08);
    ctx.bezierCurveTo(w * 0.65, h * 0.02, w * 0.95, h * 0.20, w * 0.92, h * 0.50);
    ctx.bezierCurveTo(w * 0.90, h * 0.85, w * 0.55, h * 0.94, w * 0.25, h * 0.86);
    ctx.bezierCurveTo(w * 0.05, h * 0.70, w * 0.02, h * 0.30, w * 0.10, h * 0.08);
    ctx.fill();
    ctx.restore();

    // Broad, low-opacity cloud shadows drift across the terrain only. They render before
    // navigation overlays, preserving the bright runway and aircraft contrast needed for play.
    const cloudShadows = getDriftingCloudShadows(cloudDriftRef.current);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    cloudShadows.forEach((cloud) => {
      const x = cloud.x * w;
      const y = cloud.y * h;
      const radius = Math.max(w, h) * cloud.radiusScale;
      const shadow = ctx.createRadialGradient(x, y, radius * 0.12, x, y, radius);
      shadow.addColorStop(0, `rgba(13, 27, 35, ${cloud.opacity})`);
      shadow.addColorStop(0.58, `rgba(13, 27, 35, ${cloud.opacity * 0.5})`);
      shadow.addColorStop(1, 'rgba(13, 27, 35, 0)');
      ctx.fillStyle = shadow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    });
    ctx.restore();

    // The build marker lives inside the radar, not the optional app header, so a player can
    // confirm the active PWA release even when Safari/PWA chrome has collapsed the top UI.
    ctx.save();
    ctx.font = '800 8px -apple-system, system-ui, sans-serif';
    const releaseWidth = ctx.measureText(RELEASE_LABEL).width + 12;
    const releaseX = w - releaseWidth - 9;
    ctx.fillStyle = 'rgba(2, 14, 23, 0.86)';
    ctx.fillRect(releaseX, 9, releaseWidth, 15);
    ctx.strokeStyle = 'rgba(102, 241, 202, 0.72)';
    ctx.lineWidth = 1;
    ctx.strokeRect(releaseX, 9, releaseWidth, 15);
    ctx.fillStyle = '#a5f7d0';
    ctx.textAlign = 'center';
    ctx.fillText(RELEASE_LABEL, releaseX + releaseWidth / 2, 20);
    ctx.restore();

    // Sandy coast shoreline border
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(115, 234, 184, 0.72)';
    ctx.stroke();

    // Terminal apron and taxiway grid give the airport a more recognizable place.
    ctx.save();
    const apronX = w * 0.18;
    const apronY = h * 0.38;
    const apronW = w * 0.27;
    const apronH = h * 0.30;
    ctx.fillStyle = 'rgba(10, 26, 37, 0.74)';
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
    if (visualQuality !== 'focused') {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(97, 218, 236, 0.07)';
      for (let r = 56; r <= Math.max(w, h); r += 76) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Rotating Radar Sweep Light beam
    if (visualQuality === 'high') {
      radarSweepAngleRef.current += 0.015;
      const sweepA = radarSweepAngleRef.current;
      const sweepGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h));
      sweepGrad.addColorStop(0, 'rgba(0, 229, 255, 0.12)');
      sweepGrad.addColorStop(1, 'rgba(0, 229, 255, 0.0)');
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, Math.max(w, h), sweepA, sweepA + 0.32);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      ctx.restore();
    }

    // Incoming-flight edge dots: before a plane is selectable, show the color and direction
    // of the aircraft about to enter the sector. This keeps the original game's anticipatory
    // radar feel without drawing an automatic route across the board.
    planesRef.current.forEach((plane) => {
      if (plane.isLanding || plane.landed) return;
      const entryRevealDistance = currentLevel.mission === 'lowVisibility' ? 15 : 34;
      const isNearEdge = plane.x < entryRevealDistance || plane.x > w - entryRevealDistance
        || plane.y < entryRevealDistance || plane.y > h - entryRevealDistance;
      if (!isNearEdge) return;
      const color = AIRCRAFT_DEFS[plane.type].color;
      const startX = Math.max(7, Math.min(w - 7, plane.x));
      const startY = Math.max(7, Math.min(h - 7, plane.y));
      const directionX = Math.cos(plane.heading);
      const directionY = Math.sin(plane.heading);
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      for (let dot = 0; dot < 5; dot += 1) {
        const dotX = startX + directionX * dot * 9;
        const dotY = startY + directionY * dot * 9;
        if (dotX < 4 || dotX > w - 4 || dotY < 4 || dotY > h - 4) continue;
        ctx.globalAlpha = 0.32 + dot * 0.13;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2.5 + dot * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // 3. Draw runways, bright approach gates and unambiguous destination labels.
    runwaysRef.current.forEach(runway => {
      const selectedPlane = planesRef.current.find((plane) => plane.id === selectedPlaneIdRef.current);
      const isSuggestedRunway = Boolean(selectedPlane && isAssignedRunway(selectedPlane.type, runway));
      if (isVerticalDestination(runway)) {
        const isMooring = runway.type === 'mooring';
        const padSize = isMooring ? 68 : 58;
        const pulse = isSuggestedRunway ? 1 + Math.sin(Date.now() * 0.012) * 0.08 : 1;
        ctx.save();
        ctx.translate(runway.startX, runway.startY);
        ctx.scale(pulse, pulse);
        ctx.shadowColor = runway.color;
        ctx.shadowBlur = isSuggestedRunway ? 20 : 10;
        ctx.fillStyle = isMooring ? '#26152a' : '#16152a';
        if (isMooring) {
          ctx.beginPath();
          ctx.ellipse(0, 0, padSize / 2, padSize * 0.26, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-padSize / 2, -padSize / 2, padSize, padSize);
        }
        ctx.strokeStyle = runway.color;
        ctx.lineWidth = isSuggestedRunway ? 4 : 3;
        if (isMooring) {
          ctx.beginPath();
          ctx.ellipse(0, 0, padSize / 2, padSize * 0.26, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(-padSize / 2, -padSize / 2, padSize, padSize);
        }
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.82)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, isMooring ? 15 : 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${isMooring ? 18 : 27}px -apple-system, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isMooring ? 'M1' : 'H', 0, 1);
        ctx.textBaseline = 'alphabetic';
        ctx.font = '800 10px -apple-system, system-ui, sans-serif';
        const label = isMooring ? 'AIRSHIP · M1' : 'HELI / VTOL · H1';
        const labelWidth = ctx.measureText(label).width + 14;
        ctx.fillStyle = 'rgba(18, 12, 34, 0.94)';
        ctx.fillRect(-labelWidth / 2, -46, labelWidth, 17);
        ctx.strokeStyle = runway.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(-labelWidth / 2, -46, labelWidth, 17);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, 0, -34);
        if (isSuggestedRunway) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '800 10px -apple-system, system-ui, sans-serif';
          ctx.fillText('TOUCH DOWN', 0, 47);
        }
        ctx.restore();
        return;
      }
      // Runway asphalt strip
      ctx.save();
      ctx.shadowColor = runway.color;
      ctx.shadowBlur = isSuggestedRunway ? 22 : 10;
      ctx.lineWidth = runway.type === 'water' ? (isSuggestedRunway ? 36 : 30) : (isSuggestedRunway ? 34 : 28);
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

      // A runway threshold replaces the ambiguous circle: land along the arrow direction.
      ctx.save();
      ctx.translate(runway.startX, runway.startY);
      ctx.rotate(runway.heading);
      ctx.fillStyle = '#f8fbff';
      ctx.fillRect(-10, -18, 20, 9);
      ctx.fillRect(-10, 9, 20, 9);
      ctx.fillStyle = runway.color;
      ctx.beginPath();
      ctx.moveTo(28, 0);
      ctx.lineTo(10, -10);
      ctx.lineTo(10, 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = runway.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(-runway.touchdownRadius, 0);
      ctx.lineTo(42, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Large translucent approach corridor points away from the threshold.
      const coneLength = 80;
      const appAngle = runway.heading + Math.PI;
      ctx.fillStyle = `${runway.color}1E`;
      ctx.beginPath();
      ctx.moveTo(runway.startX, runway.startY);
      ctx.arc(runway.startX, runway.startY, coneLength, appAngle - 0.28, appAngle + 0.28);
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
      const runwayLabelPosition = clampRadarLabel(
        runway.startX,
        runway.startY - 42,
        labelWidth,
        w,
        h,
      );
      ctx.fillStyle = 'rgba(3, 12, 20, 0.90)';
      ctx.fillRect(runwayLabelPosition.x - labelWidth / 2, runwayLabelPosition.y, labelWidth, 17);
      ctx.strokeStyle = runway.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(runwayLabelPosition.x - labelWidth / 2, runwayLabelPosition.y, labelWidth, 17);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(runwayLabel, runwayLabelPosition.x, runwayLabelPosition.y + 12);
      ctx.restore();
    });

    // Sector missions are rendered as clear tactical objects, never as background-only art.
    const missionHazards = getMissionHazards(currentLevel.mission, w, h, missionElapsedRef.current);
    missionHazards.forEach((hazard) => {
      const pulse = 0.8 + Math.sin(Date.now() * 0.008 + hazard.x) * 0.2;
      ctx.save();
      ctx.translate(hazard.x, hazard.y);
      ctx.rotate(hazard.rotation);
      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, Math.max(hazard.radiusX, hazard.radiusY));
      glow.addColorStop(0, `${hazard.color}66`);
      glow.addColorStop(0.72, `${hazard.color}20`);
      glow.addColorStop(1, `${hazard.color}00`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, 0, hazard.radiusX * 1.18, hazard.radiusY * 1.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hazard.kind === 'storm' ? 'rgba(20, 46, 91, 0.55)' : 'rgba(30, 15, 28, 0.62)';
      ctx.strokeStyle = hazard.color;
      ctx.lineWidth = hazard.kind === 'storm' ? 2.5 : 2;
      ctx.setLineDash(hazard.kind === 'storm' ? [5, 4] : [3, 5]);
      ctx.beginPath();
      ctx.ellipse(0, 0, hazard.radiusX, hazard.radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (hazard.kind === 'storm') {
        ctx.strokeStyle = `rgba(220, 242, 255, ${0.34 + pulse * 0.28})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(hazard.radiusX, hazard.radiusY) * (0.32 + pulse * 0.16), 0, Math.PI * 1.65);
        ctx.stroke();
      } else if (hazard.kind === 'object') {
        ctx.fillStyle = '#ffe8f9';
        ctx.beginPath();
        ctx.ellipse(0, 0, hazard.radiusX * 0.56, hazard.radiusY * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (hazard.kind === 'fire') {
        ctx.fillStyle = `rgba(255, 203, 90, ${0.56 + pulse * 0.22})`;
        for (let flame = 0; flame < 5; flame += 1) {
          ctx.beginPath();
          ctx.arc(-hazard.radiusX * 0.45 + flame * hazard.radiusX * 0.22, Math.sin(flame) * 5, 4 + pulse * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.save();
      ctx.font = '800 9px -apple-system, system-ui, sans-serif';
      const labelWidth = ctx.measureText(hazard.label).width + 12;
      const labelPosition = clampRadarLabel(hazard.x, hazard.y - hazard.radiusY - 20, labelWidth, w, h);
      ctx.fillStyle = 'rgba(8, 15, 26, 0.94)';
      ctx.fillRect(labelPosition.x - labelWidth / 2, labelPosition.y, labelWidth, 16);
      ctx.strokeStyle = hazard.color;
      ctx.strokeRect(labelPosition.x - labelWidth / 2, labelPosition.y, labelWidth, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(hazard.label, labelPosition.x, labelPosition.y + 11.5);
      ctx.restore();
    });

    if (currentLevel.mission === 'crosswind' || currentLevel.mission === 'fuelPriority' || currentLevel.mission === 'lowVisibility') {
      const status = currentLevel.mission === 'crosswind'
        ? `WIND ${currentLevel.windSpeed} · DRIFT ACTIVE`
        : currentLevel.mission === 'fuelPriority'
          ? 'FUEL PRIORITY · LAND LOWEST TIMER FIRST'
          : 'LOW VISIBILITY · WATCH ENTRY DOTS';
      ctx.save();
      ctx.font = '800 9px -apple-system, system-ui, sans-serif';
      const statusWidth = ctx.measureText(status).width + 14;
      ctx.fillStyle = 'rgba(3, 12, 20, 0.86)';
      ctx.fillRect(8, h - 25, statusWidth, 17);
      ctx.strokeStyle = currentLevel.mission === 'fuelPriority' ? '#FFB300' : '#8ad5ff';
      ctx.strokeRect(8, h - 25, statusWidth, 17);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(status, 15, h - 13);
      ctx.restore();
    }

    // 4. Selection highlights only the destination beacon. The aircraft tag already names
    // the assigned route; drawing a second full-length guide beside a player route caused
    // two same-colour strips and made it look as if the game was changing the route.
    planesRef.current.forEach((plane) => {
      if (plane.isLanding) return;
      const destination = getAssignedRunway(plane.type, runwaysRef.current);
      if (!destination) return;
      const approach = getApproachEntry(destination, 86);
      const isSelected = selectedPlaneIdRef.current === plane.id;
      if (!isSelected) return;
      const color = AIRCRAFT_DEFS[plane.type].color;
      ctx.save();

      // A short glowing beacon marks the matching destination without adding another route line.
      const pulse = 1 + Math.sin(Date.now() * 0.012) * 0.14;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `${color}E8`;
      ctx.beginPath();
      ctx.arc(approach.x, approach.y, 7 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      const courseName = destination.id === 'runway-main'
        ? 'R34'
        : destination.id === 'runway-diagonal'
          ? 'R28'
          : destination.id === 'helipad-h1'
            ? 'H1'
            : 'BAY';
      ctx.font = '800 10px -apple-system, system-ui, sans-serif';
      const beaconText = `TARGET · ${courseName}`;
      const beaconWidth = ctx.measureText(beaconText).width + 12;
      const beaconLabelPosition = clampRadarLabel(
        approach.x,
        approach.y - 26,
        beaconWidth,
        w,
        h,
      );
      ctx.fillStyle = 'rgba(3, 12, 20, 0.9)';
      ctx.fillRect(beaconLabelPosition.x - beaconWidth / 2, beaconLabelPosition.y, beaconWidth, 17);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(beaconLabelPosition.x - beaconWidth / 2, beaconLabelPosition.y, beaconWidth, 17);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(beaconText, beaconLabelPosition.x, beaconLabelPosition.y + 12);
      ctx.restore();
    });

    // 5. Draw Flight Paths
    planesRef.current.forEach(p => {
      if (p.path.length > 0) {
        ctx.save();
        ctx.lineWidth = p.landingCleared ? 3.5 : 2.5;
        ctx.strokeStyle = p.landingCleared || p.isLanding ? '#00E676' : AIRCRAFT_DEFS[p.type].color;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        p.path.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
        ctx.setLineDash([]);

        // Target waypoint node
        const endPt = p.path[p.path.length - 1];
        ctx.fillStyle = p.landingCleared ? '#00E676' : AIRCRAFT_DEFS[p.type].color;
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, p.landingCleared ? 7 : 4, 0, Math.PI * 2);
        ctx.fill();
        if (p.landingCleared) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(endPt.x, endPt.y, 11, 0, Math.PI * 2);
          ctx.stroke();

          // A small traveling marker makes the direction of a cleared plan instantly obvious
          // without redrawing, smoothing, or otherwise changing the player's route.
          const routePoints = [{ x: p.x, y: p.y }, ...p.path];
          const segmentLengths = routePoints.slice(1).map((point, index) => Math.hypot(
            point.x - routePoints[index].x,
            point.y - routePoints[index].y,
          ));
          const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
          let remainingLength = totalLength * ((Date.now() % 1400) / 1400);
          for (let index = 0; index < segmentLengths.length; index += 1) {
            const segmentLength = segmentLengths[index];
            if (remainingLength > segmentLength) {
              remainingLength -= segmentLength;
              continue;
            }
            const start = routePoints[index];
            const end = routePoints[index + 1];
            const progress = segmentLength > 0 ? remainingLength / segmentLength : 0;
            const markerX = start.x + (end.x - start.x) * progress;
            const markerY = start.y + (end.y - start.y) * progress;
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00E676';
            ctx.shadowBlur = 9;
            ctx.beginPath();
            ctx.arc(markerX, markerY, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            break;
          }
        }
        ctx.restore();
      }
    });

    // Pair-specific collision warning: highlight only the aircraft that are converging,
    // connect them with a pulsating conflict line, and flash the board edge before impact.
    const conflicts = activeConflictsRef.current;
    if (conflicts.length > 0) {
      const hasCriticalConflict = conflicts.some((conflict) => conflict.severity === 'critical');
      const alertColor = getConflictColor(hasCriticalConflict ? 'critical' : 'caution');
      const flash = 0.5 + Math.sin(Date.now() * (hasCriticalConflict ? 0.018 : 0.012)) * 0.5;
      const uniqueAircraft = new Set(conflicts.flatMap((conflict) => [conflict.firstId, conflict.secondId]));
      ctx.save();
      ctx.fillStyle = 'rgba(3, 12, 20, 0.94)';
      ctx.fillRect(w / 2 - 118, 12, 236, 28);
      ctx.strokeStyle = alertColor;
      ctx.lineWidth = 2 + flash * 1.5;
      ctx.shadowColor = alertColor;
      ctx.shadowBlur = 10 + flash * 8;
      ctx.strokeRect(w / 2 - 118, 12, 236, 28);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hasCriticalConflict ? '⚠ TURN NOW · COLLISION RISK' : '⚠ CONFLICT AHEAD · ADJUST COURSE', w / 2, 30);
      ctx.restore();

      conflicts.forEach((conflict) => {
        const first = planesRef.current.find((plane) => plane.id === conflict.firstId);
        const second = planesRef.current.find((plane) => plane.id === conflict.secondId);
        if (!first || !second) return;
        const color = getConflictColor(conflict.severity);
        const radius = conflict.safetyDistance + (conflict.severity === 'critical' ? 20 : 32) + flash * 5;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 + flash * 12;
        ctx.lineWidth = conflict.severity === 'critical' ? 3 : 2.2;
        ctx.setLineDash(conflict.severity === 'critical' ? [5, 4] : [3, 6]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(second.x, second.y);
        ctx.stroke();
        ctx.setLineDash([]);
        [first, second].forEach((plane) => {
          ctx.beginPath();
          ctx.arc(plane.x, plane.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `${color}2A`;
          ctx.fill();
        });
        const midpointX = (first.x + second.x) / 2;
        const midpointY = (first.y + second.y) / 2;
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(midpointX, midpointY, 10 + flash * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#08131f';
        ctx.font = '900 10px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', midpointX, midpointY + 3.5);
        ctx.restore();
      });

      uniqueAircraft.forEach((id) => {
        const plane = planesRef.current.find((item) => item.id === id);
        if (!plane) return;
        const vectorLength = plane.warningLevel === 'critical' ? 50 : 64;
        ctx.save();
        ctx.strokeStyle = plane.warningLevel === 'critical' ? '#FF3D71' : '#FFB300';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(plane.x, plane.y);
        ctx.lineTo(plane.x + Math.cos(plane.heading) * vectorLength, plane.y + Math.sin(plane.heading) * vectorLength);
        ctx.stroke();
        ctx.restore();
      });

      ctx.save();
      ctx.strokeStyle = alertColor;
      ctx.globalAlpha = 0.24 + flash * 0.32;
      ctx.lineWidth = 3.5;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.restore();
    }

    // Active touch drawing path
    if (isEditingRouteRef.current && activeDrawPathRef.current.length > 0) {
      ctx.save();
      const selectedPlane = planesRef.current.find((plane) => plane.id === selectedPlaneIdRef.current);
      const selectedRunway = selectedPlane && getAssignedRunway(selectedPlane.type, runwaysRef.current);
      const routeOrigin = routeStartPointRef.current ?? selectedPlane ?? activeDrawPathRef.current[0];
      const draftRoute = selectedPlane && routeOrigin && selectedRunway
        ? preservePlayerDrawnRoute(routeOrigin, activeDrawPathRef.current)
        : [];
      const landingValidation = selectedPlane && routeOrigin && selectedRunway
        ? validateLandingRoute(routeOrigin, draftRoute, selectedRunway)
        : null;
      const draftHazard = routeStartPointRef.current
        ? routeIntersectsMissionHazard(
          routeStartPointRef.current,
          draftRoute,
          getMissionHazards(currentLevel.mission, w, h, missionElapsedRef.current),
        )
        : undefined;
      const isLandingLocked = Boolean(landingValidation?.isLocked && !draftHazard);

      // Draw the finite handoff gate rather than a broad circular target. The player only has
      // to cross this bar in the correct direction; nearby points and parallel lines stay invalid.
      if (selectedRunway && landingValidation) {
        const isVertical = isVerticalDestination(selectedRunway);
        const guideColor = draftHazard ? '#FF3D71' : isLandingLocked ? '#00E676' : selectedRunway.color;
        const approachEntry = getApproachEntry(selectedRunway, landingValidation.approachGateLength);
        const pulse = 1 + Math.sin(Date.now() * 0.012) * 0.06;
        ctx.save();
        ctx.strokeStyle = guideColor;
        ctx.fillStyle = `${guideColor}18`;
        ctx.lineWidth = isLandingLocked ? 3 : 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(
          selectedRunway.startX,
          selectedRunway.startY,
          (selectedRunway.touchdownRadius + 10) * pulse,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
        if (!isVertical) {
          const lateralX = -Math.sin(selectedRunway.heading);
          const lateralY = Math.cos(selectedRunway.heading);
          // The broad bar is the actual finger-friendly handoff gate. End a line anywhere
          // across it and the final glide is accepted; the game never redraws that line.
          ctx.lineWidth = isLandingLocked ? 8 : 6;
          ctx.globalAlpha = isLandingLocked ? 0.82 : 0.48;
          ctx.beginPath();
          ctx.moveTo(
            approachEntry.x - lateralX * landingValidation.approachGateHalfWidth,
            approachEntry.y - lateralY * landingValidation.approachGateHalfWidth,
          );
          ctx.lineTo(
            approachEntry.x + lateralX * landingValidation.approachGateHalfWidth,
            approachEntry.y + lateralY * landingValidation.approachGateHalfWidth,
          );
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.lineWidth = isLandingLocked ? 3 : 2;
          ctx.beginPath();
          ctx.moveTo(approachEntry.x, approachEntry.y);
          ctx.lineTo(selectedRunway.startX, selectedRunway.startY);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
      ctx.lineWidth = isLandingLocked ? 4 : 3.5;
      ctx.strokeStyle = isLandingLocked ? '#00E676' : '#ffffff';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(routeOrigin.x, routeOrigin.y);
      activeDrawPathRef.current.forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
      if (isLandingLocked) {
        const endpoint = landingValidation?.capturePoint
          ?? activeDrawPathRef.current[activeDrawPathRef.current.length - 1];
        ctx.setLineDash([]);
        ctx.fillStyle = '#00E676';
        ctx.beginPath();
        ctx.arc(endpoint.x, endpoint.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(endpoint.x, endpoint.y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '800 10px -apple-system, system-ui, sans-serif';
        const lockText = '✓ GATE CAPTURED';
        const lockWidth = ctx.measureText(lockText).width + 14;
        ctx.fillStyle = 'rgba(0, 81, 55, 0.94)';
        ctx.fillRect(endpoint.x - lockWidth / 2, endpoint.y - 31, lockWidth, 17);
        ctx.strokeStyle = '#00E676';
        ctx.strokeRect(endpoint.x - lockWidth / 2, endpoint.y - 31, lockWidth, 17);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(lockText, endpoint.x, endpoint.y - 19);
      } else {
        const endpoint = activeDrawPathRef.current[activeDrawPathRef.current.length - 1];
        if (selectedRunway && landingValidation) {
          const target = selectedRunway.id === 'runway-main' ? 'R34'
            : selectedRunway.id === 'runway-diagonal' ? 'R28'
              : selectedRunway.id === 'helipad-h1' ? 'H1' : 'BAY';
          const targetName = selectedRunway.id === 'mooring-m1' ? 'M1' : target;
          const hint = draftHazard
            ? `AVOID ${draftHazard.label}`
            : !landingValidation.isInsideApproachGate
            ? `CROSS ${targetName} GATE`
            : !landingValidation.isOnApproachSide
              ? 'END BEFORE THRESHOLD'
              : !landingValidation.isHeadingAligned
                ? 'USE THE GLOWING GATE'
                : `DRAW TO ${targetName}`;
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(3, 12, 20, 0.88)';
          ctx.font = '800 9px -apple-system, system-ui, sans-serif';
          const hintWidth = ctx.measureText(hint).width + 12;
          const hintPosition = clampRadarLabel(endpoint.x, endpoint.y - 29, hintWidth, w, h, 15);
          ctx.fillRect(hintPosition.x - hintWidth / 2, hintPosition.y, hintWidth, 15);
          ctx.strokeStyle = selectedRunway.color;
          ctx.lineWidth = 1;
          ctx.strokeRect(hintPosition.x - hintWidth / 2, hintPosition.y, hintWidth, 15);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(hint, hintPosition.x, hintPosition.y + 11);
        }
      }
      ctx.restore();
    }

    // 5. Draw Aircraft Sprites
    planesRef.current.forEach(p => {
      const def = AIRCRAFT_DEFS[p.type];
      const landing = p.isLanding ? getLandingSequence(p.type, p.landingProgress) : null;
      const approachAltitude = landing?.altitude ?? 0;
      // Aircraft no longer shrinks away during landing. A subtle descent-scale cue only
      // applies while it is still above the runway, then returns to full ground scale.
      const scale = landing ? 0.95 + (1 - approachAltitude / 12) * 0.05 : 1;

      // Fine vapour trail is visible only during flight; it disappears during runway rollout.
      if (!p.isLanding && !isVerticalAircraft(p.type)) {
        const trailLength = p.type === 'supersonic' ? 34 : 22;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = p.type === 'supersonic' ? 3 : 2;
        const trail = ctx.createLinearGradient(
          p.x - Math.cos(p.heading) * 4,
          p.y - Math.sin(p.heading) * 4,
          p.x - Math.cos(p.heading) * trailLength,
          p.y - Math.sin(p.heading) * trailLength,
        );
        trail.addColorStop(0, `${def.color}B0`);
        trail.addColorStop(1, `${def.color}00`);
        ctx.strokeStyle = trail;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(p.heading) * 4, p.y - Math.sin(p.heading) * 4);
        ctx.lineTo(p.x - Math.cos(p.heading) * trailLength, p.y - Math.sin(p.heading) * trailLength);
        ctx.stroke();
        ctx.restore();
      }

      // Ground-contact detail anchors the rollout to the actual assigned surface.
      // Asphalt receives growing rubber marks; water receives a fading V-shaped wake.
      const landingRunway = landing ? getAssignedRunway(p.type, runwaysRef.current) : undefined;
      if (landing && landingRunway && landing.runwayProgress > 0.06 && !isVerticalAircraft(p.type)) {
        const runwayVectorX = landingRunway.endX - landingRunway.startX;
        const runwayVectorY = landingRunway.endY - landingRunway.startY;
        const runwayLength = Math.hypot(runwayVectorX, runwayVectorY) || 1;
        const unitX = runwayVectorX / runwayLength;
        const unitY = runwayVectorY / runwayLength;
        const normalX = -unitY;
        const normalY = unitX;
        const markStart = Math.max(0.04, landing.runwayProgress - 0.24);
        const startX = landingRunway.startX + runwayVectorX * markStart;
        const startY = landingRunway.startY + runwayVectorY * markStart;
        ctx.save();
        if (p.type === 'seaplane') {
          const wakeAlpha = Math.min(0.55, 0.12 + landing.runwayProgress * 0.48);
          ctx.strokeStyle = `rgba(224, 255, 255, ${wakeAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(startX - normalX * 5, startY - normalY * 5);
          ctx.lineTo(p.x - normalX * 12 - unitX * 14, p.y - normalY * 12 - unitY * 14);
          ctx.moveTo(startX + normalX * 5, startY + normalY * 5);
          ctx.lineTo(p.x + normalX * 12 - unitX * 14, p.y + normalY * 12 - unitY * 14);
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(5, 8, 12, ${Math.min(0.5, 0.14 + landing.runwayProgress * 0.42)})`;
          ctx.lineWidth = 1.35;
          [-1, 1].forEach((side) => {
            ctx.beginPath();
            ctx.moveTo(startX + normalX * side * def.wingspan * 0.16, startY + normalY * side * def.wingspan * 0.16);
            ctx.lineTo(p.x + normalX * side * def.wingspan * 0.16, p.y + normalY * side * def.wingspan * 0.16);
            ctx.stroke();
          });
        }
        ctx.restore();
      }

      // Two soft landing lamps lead the eye into the flare without obscuring player-drawn routes.
      if (landing && (landing.stage === 'finalApproach' || landing.stage === 'flare') && !isVerticalAircraft(p.type)) {
        const beamLength = 22 + landing.altitude * 1.4;
        ctx.save();
        ctx.translate(p.x, p.y - approachAltitude * 0.3);
        ctx.rotate(p.heading);
        ctx.globalCompositeOperation = 'screen';
        const beam = ctx.createLinearGradient(def.length * 0.32, 0, def.length * 0.32 + beamLength, 0);
        beam.addColorStop(0, 'rgba(255, 250, 213, 0.32)');
        beam.addColorStop(1, 'rgba(255, 250, 213, 0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(def.length * 0.28, -3);
        ctx.lineTo(def.length * 0.28 + beamLength, -8);
        ctx.lineTo(def.length * 0.28 + beamLength, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // The runway shadow is drawn in its own transform so the aircraft visibly descends
      // into it. That avoids the flat "slide then vanish" appearance.
      const shadowAlpha = 0.20 + (1 - Math.min(1, approachAltitude / 12)) * 0.16;
      ctx.save();
      ctx.translate(p.x - approachAltitude * 0.18, p.y + 5 + approachAltitude * 0.55);
      ctx.rotate(p.heading);
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, def.length * 0.42, def.wingspan * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(p.x, p.y - approachAltitude * 0.3);
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

      // Tyre smoke only appears right after contact, not throughout the runway sequence.
      if (landing?.tyreSmoke && p.type !== 'seaplane') {
        const smokeAlpha = 0.28 + Math.sin(Date.now() * 0.025) * 0.08;
        for (let smoke = 0; smoke < 3; smoke += 1) {
          ctx.fillStyle = `rgba(210, 224, 232, ${Math.max(0, smokeAlpha - smoke * 0.05)})`;
          ctx.beginPath();
          ctx.ellipse(-12 - smoke * 7, (smoke % 2 ? 8 : -8), 8 + smoke * 3, 3 + smoke, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Metallic fuselage surface with a bright upper highlight.
      const fuselage = ctx.createLinearGradient(-def.length * 0.52, -7, def.length * 0.56, 8);
      fuselage.addColorStop(0, def.color);
      fuselage.addColorStop(0.24, '#e8f7fb');
      fuselage.addColorStop(0.48, def.color);
      fuselage.addColorStop(1, def.color);
      ctx.fillStyle = fuselage;
      ctx.strokeStyle = def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 5;
      ctx.lineWidth = 1.8;

      if (p.type === 'helicopter' || p.type === 'tiltrotor') {
        // Vertical aircraft: animated rotor disc, tail rotor, boom and skids.
        // The translucent disc keeps the rotor readable during high RPM without looking like static lines.
        const time = Date.now() * 0.001;
        const isTiltrotor = p.type === 'tiltrotor';
        const rotorRadius = def.wingspan * (isTiltrotor ? 0.22 : 0.62);
        const rotorPulse = 0.96 + Math.sin(time * 10 + p.createdAt) * 0.035;
        ctx.save();
        ctx.translate(isTiltrotor ? -2 : -1, 0);
        ctx.scale(rotorPulse, rotorPulse);
        const rotorDisc = ctx.createRadialGradient(0, 0, rotorRadius * 0.12, 0, 0, rotorRadius);
        rotorDisc.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
        rotorDisc.addColorStop(0.52, 'rgba(222, 202, 255, 0.19)');
        rotorDisc.addColorStop(1, 'rgba(200, 107, 255, 0)');
        ctx.fillStyle = rotorDisc;
        ctx.beginPath();
        ctx.ellipse(0, 0, rotorRadius * (isTiltrotor ? 2.9 : 1), rotorRadius * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(248, 242, 255, 0.28)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, rotorRadius * (isTiltrotor ? 2.9 : 1), rotorRadius * 0.34, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.ellipse(0, 0, def.length * 0.42, def.length * (isTiltrotor ? 0.18 : 0.27), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = def.color;
        ctx.fillRect(-def.length * 0.72, -2.1, def.length * 0.52, 4.2);
        if (isTiltrotor) {
          ctx.fillRect(-4, -def.wingspan * 0.47, 8, def.wingspan * 0.94);
          [-1, 1].forEach((side) => {
            ctx.save();
            ctx.translate(0, side * def.wingspan * 0.42);
            ctx.rotate(time * 18 + side * p.createdAt);
            ctx.strokeStyle = 'rgba(248, 242, 255, 0.78)';
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(-rotorRadius * 1.2, 0);
            ctx.lineTo(rotorRadius * 1.2, 0);
            ctx.moveTo(0, -rotorRadius * 1.2);
            ctx.lineTo(0, rotorRadius * 1.2);
            ctx.stroke();
            ctx.restore();
          });
        }
        ctx.strokeStyle = '#f2eaff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-def.length * 0.72, -5.5);
        ctx.lineTo(-def.length * 0.72, 5.5);
        ctx.moveTo(-def.length * 0.79, 0);
        ctx.lineTo(-def.length * 0.65, 0);
        ctx.stroke();
        ctx.strokeStyle = '#1a2632';
        ctx.lineWidth = 1.65;
        [-def.length * 0.18, def.length * 0.24].forEach((skidX) => {
          ctx.beginPath();
          ctx.moveTo(skidX, 3.5);
          ctx.lineTo(skidX - 1.6, 7.5);
          ctx.lineTo(skidX + 4.5, 7.5);
          ctx.stroke();
        });
        ctx.save();
        ctx.rotate(time * 17 + p.createdAt);
        ctx.strokeStyle = 'rgba(248, 242, 255, 0.72)';
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(0, -rotorRadius);
        ctx.lineTo(0, rotorRadius);
        ctx.moveTo(-rotorRadius, 0);
        ctx.lineTo(rotorRadius, 0);
        ctx.moveTo(-rotorRadius * 0.7, -rotorRadius * 0.7);
        ctx.lineTo(rotorRadius * 0.7, rotorRadius * 0.7);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'zeppelin') {
        // Airship: large envelope with a gondola, tail fins, and a distinct mooring role.
        ctx.fillStyle = 'rgba(255, 92, 214, 0.94)';
        ctx.beginPath();
        ctx.ellipse(0, 0, def.length * 0.48, def.wingspan * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e7f4fb';
        ctx.fillRect(-def.length * 0.10, -3, def.length * 0.26, 6);
        ctx.fillStyle = '#16212e';
        ctx.fillRect(-def.length * 0.10, 5, def.length * 0.20, 4);
        ctx.strokeStyle = '#fbd9f5';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-def.length * 0.43, -def.wingspan * 0.18);
        ctx.lineTo(-def.length * 0.50, 0);
        ctx.lineTo(-def.length * 0.43, def.wingspan * 0.18);
        ctx.stroke();
      } else if (p.type === 'supersonic') {
        // Delta wing supersonic jet
        ctx.beginPath();
        ctx.moveTo(def.length * 0.55, 0); // nose
        ctx.lineTo(-def.length * 0.45, def.wingspan * 0.5); // wing tip right
        ctx.lineTo(-def.length * 0.25, 0); // wing root
        ctx.lineTo(-def.length * 0.45, -def.wingspan * 0.5); // wing tip left
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.type === 'fighter') {
        // Fighter: compact swept wings distinguish its agile high-speed role.
        ctx.beginPath();
        ctx.moveTo(def.length * 0.56, 0);
        ctx.lineTo(-def.length * 0.20, def.wingspan * 0.50);
        ctx.lineTo(-def.length * 0.10, def.wingspan * 0.12);
        ctx.lineTo(-def.length * 0.46, def.wingspan * 0.22);
        ctx.lineTo(-def.length * 0.46, -def.wingspan * 0.22);
        ctx.lineTo(-def.length * 0.10, -def.wingspan * 0.12);
        ctx.lineTo(-def.length * 0.20, -def.wingspan * 0.50);
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

      // Twin engine nacelles give powered fixed-wing aircraft a true silhouette.
      if (p.type === 'jet' || p.type === 'supersonic' || p.type === 'fighter' || p.type === 'cargo') {
        [-1, 1].forEach((side) => {
          ctx.fillStyle = '#243442';
          ctx.beginPath();
          ctx.ellipse(-2, side * def.wingspan * 0.28, 6, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#dcecf2';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#061019';
          ctx.beginPath();
          ctx.arc(2, side * def.wingspan * 0.28, 2.2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Distinct propulsion signatures improve aircraft recognition while in motion.
      if (p.type === 'helicopter' || p.type === 'tiltrotor') {
        const hoverPulse = 0.14 + Math.sin(Date.now() * 0.018 + p.createdAt) * 0.04;
        ctx.fillStyle = `rgba(200, 107, 255, ${hoverPulse})`;
        ctx.beginPath();
        ctx.ellipse(-def.length * 0.48, 0, 7, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'supersonic' || p.type === 'fighter') {
        const flameLength = 12 + Math.sin(Date.now() * 0.035 + p.createdAt) * 3;
        const flame = ctx.createLinearGradient(-def.length * 0.38, 0, -def.length * 0.38 - flameLength, 0);
        flame.addColorStop(0, 'rgba(248, 252, 255, 0.95)');
        flame.addColorStop(0.38, 'rgba(0, 229, 255, 0.78)');
        flame.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.moveTo(-def.length * 0.36, -4);
        ctx.lineTo(-def.length * 0.36 - flameLength, 0);
        ctx.lineTo(-def.length * 0.36, 4);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'propeller') {
        const propSpin = Date.now() * 0.028;
        ctx.save();
        ctx.translate(def.length * 0.49, 0);
        ctx.rotate(propSpin);
        ctx.strokeStyle = 'rgba(236, 251, 255, 0.76)';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(-1, -10);
        ctx.lineTo(1, 10);
        ctx.moveTo(-10, -1);
        ctx.lineTo(10, 1);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'jet') {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.52)';
        ctx.beginPath();
        ctx.ellipse(-def.length * 0.5, 0, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cockpit glass plus windows.
      ctx.fillStyle = '#142d48';
      ctx.beginPath();
      ctx.ellipse(def.length * 0.28, 0, 4.2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      for (let window = 0; window < 3; window += 1) {
        ctx.beginPath();
        ctx.arc(-2 - window * 5, 0, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flashing red/green wingtip lights make active aircraft easy to track.
      const navPulse = 0.65 + Math.sin(Date.now() * 0.012 + p.createdAt) * 0.35;
      ctx.shadowBlur = 7;
      ctx.shadowColor = '#ff3d71';
      ctx.fillStyle = `rgba(255, 61, 113, ${navPulse})`;
      ctx.beginPath();
      ctx.arc(-2, -def.wingspan * 0.48, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = '#00e676';
      ctx.fillStyle = `rgba(0, 230, 118, ${navPulse})`;
      ctx.beginPath();
      ctx.arc(-2, def.wingspan * 0.48, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Gear appears during final approach and remains down through taxi-out.
      if (landing?.gearDown && !isVerticalAircraft(p.type)) {
        ctx.strokeStyle = '#1d2830';
        ctx.lineWidth = 2;
        [-7, 5].forEach((wheelX) => {
          ctx.beginPath();
          ctx.moveTo(wheelX, -3);
          ctx.lineTo(wheelX - 2, 7);
          ctx.stroke();
          ctx.fillStyle = '#05070a';
          ctx.beginPath();
          ctx.arc(wheelX - 2, 8, 2.2, 0, Math.PI * 2);
          ctx.fill();
        });
        if (landing.brakeGlow) {
          ctx.strokeStyle = `rgba(255, 135, 61, ${0.38 + Math.sin(Date.now() * 0.03) * 0.18})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(-2, 7, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Selected ring
      if (selectedPlaneIdRef.current === p.id) {
        const selectionPulse = 1 + Math.sin(Date.now() * 0.012) * 0.09;
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 13;
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, 27 * selectionPulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(0, -32, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Keep the board calm: aircraft colour identifies the destination at a glance, and the
      // full text chip appears only for the selected flight or an aircraft nearing the edge.
      // This leaves the player-drawn line as the dominant visual object during routing.
      const routeLabel = p.type === 'jet'
        ? 'JET → R34'
        : p.type === 'supersonic'
          ? 'SST → R34'
          : p.type === 'fighter'
            ? 'FTR → R34'
          : p.type === 'propeller'
            ? 'PROP → R28'
            : p.type === 'cargo'
              ? 'CARGO → R28'
            : p.type === 'helicopter'
              ? 'HELI → H1'
              : p.type === 'tiltrotor'
                ? 'VTOL → H1'
                : p.type === 'zeppelin'
                  ? 'AIRSHIP → M1'
                  : 'SEA → BAY';
      ctx.save();
      ctx.font = '800 10px -apple-system, system-ui, sans-serif';
      const isSelected = selectedPlaneIdRef.current === p.id;
      const isNearEdge = p.x < 32 || p.x > w - 32 || p.y < 40 || p.y > h - 30;
      const fuelBand = getFuelBand(p.fuelRemaining);
      const isPriority = currentLevel.mission === 'fuelPriority' && fuelBand !== 'normal';
      if (!shouldShowFlightTag({ isSelected, isNearEdge, isLanding: Boolean(landing), isPriority })) {
        ctx.restore();
        return;
      }
      const tagText = isPriority && p.fuelRemaining !== undefined
        ? `FUEL ${Math.ceil(p.fuelRemaining)}s · ${routeLabel}`
        : routeLabel;
      const routeWidth = ctx.measureText(tagText).width + 12;
      const tagPosition = clampRadarLabel(
        p.x,
        p.y - 35,
        routeWidth,
        w,
        h,
        landing ? 35 : 17,
      );
      const tagX = tagPosition.x;
      const tagY = tagPosition.y;
      ctx.fillStyle = isSelected ? 'rgba(0, 62, 77, 0.96)' : 'rgba(3, 12, 20, 0.90)';
      ctx.fillRect(tagX - routeWidth / 2, tagY, routeWidth, 16);
      ctx.strokeStyle = isPriority ? (fuelBand === 'critical' ? '#FF3D71' : '#FFB300') : def.color;
      ctx.lineWidth = isSelected ? 2.4 : 1.5;
      ctx.strokeRect(tagX - routeWidth / 2, tagY, routeWidth, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(tagText, tagX, tagY + 11.5);
      if (landing) {
        ctx.font = '800 8px -apple-system, system-ui, sans-serif';
        const phaseWidth = ctx.measureText(landing.label).width + 10;
        ctx.fillStyle = landing.stage === 'touchdown'
          ? 'rgba(255, 179, 0, 0.94)'
          : landing.stage === 'braking'
            ? 'rgba(255, 97, 97, 0.94)'
            : 'rgba(0, 229, 255, 0.90)';
        ctx.fillRect(tagX - phaseWidth / 2, tagY + 18, phaseWidth, 13);
        ctx.fillStyle = '#07121d';
        ctx.fillText(landing.label, tagX, tagY + 27.5);
      }
      ctx.restore();
    });

    // Collision sequence: a bright flash, expanding shockwave, physical debris, then smoke.
    // It runs entirely inside the canvas loop so the game freezes but the consequence is visible.
    const crash = crashEffectRef.current;
    if (crash) {
      const progress = getCrashProgress(crash);
      const flash = Math.max(0, 1 - progress * 6);
      const shockwaveRadius = 18 + progress * 145;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const fireball = ctx.createRadialGradient(crash.x, crash.y, 2, crash.x, crash.y, 74 * (0.55 + progress));
      fireball.addColorStop(0, `rgba(255, 255, 255, ${0.98 - progress * 0.55})`);
      fireball.addColorStop(0.14, `rgba(255, 238, 126, ${0.92 - progress * 0.42})`);
      fireball.addColorStop(0.43, `rgba(255, 110, 35, ${0.78 - progress * 0.52})`);
      fireball.addColorStop(1, 'rgba(255, 45, 45, 0)');
      ctx.fillStyle = fireball;
      ctx.beginPath();
      ctx.arc(crash.x, crash.y, 76 * (0.55 + progress), 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(255, 220, 120, ${Math.max(0, 0.92 - progress)})`;
      ctx.lineWidth = 4 - progress * 2;
      ctx.beginPath();
      ctx.arc(crash.x, crash.y, shockwaveRadius, 0, Math.PI * 2);
      ctx.stroke();

      crash.fragments.forEach((fragment) => {
        const distance = fragment.speed * (0.25 + progress * 0.95);
        const x = crash.x + Math.cos(fragment.angle) * distance;
        const y = crash.y + Math.sin(fragment.angle) * distance + progress * progress * 42;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(fragment.spin * progress * 2.8);
        ctx.fillStyle = fragment.color;
        ctx.shadowColor = '#ff8b28';
        ctx.shadowBlur = 9 * (1 - progress);
        ctx.fillRect(-fragment.size, -fragment.size * 0.45, fragment.size * 2.3, fragment.size * 0.9);
        ctx.restore();
      });

      if (progress > 0.18) {
        const smokeOpacity = Math.min(0.62, (progress - 0.18) * 0.85);
        for (let cloud = 0; cloud < 6; cloud += 1) {
          const offsetX = Math.sin(cloud * 2.1) * (16 + cloud * 8);
          const offsetY = -progress * (50 + cloud * 8) + Math.cos(cloud * 1.7) * 9;
          ctx.fillStyle = `rgba(22, 28, 36, ${smokeOpacity * (1 - cloud * 0.08)})`;
          ctx.beginPath();
          ctx.arc(crash.x + offsetX, crash.y + offsetY, 12 + cloud * 4 + progress * 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 244, 214, ${flash * 0.26})`;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = `rgba(255, 61, 71, ${Math.max(0, 0.28 - progress * 0.24)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }, [dimensions, stageEnvironment]);

  // Main Animation Tick
  useEffect(() => {
    let isRunning = true;

    const tick = (now: number) => {
      if (!isRunning) return;
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
      lastFrameTimeRef.current = now;

      const crashEffect = crashEffectRef.current;
      if (crashEffect) {
        crashEffect.elapsed += dt;
        if (crashEffect.elapsed >= crashEffect.duration && !crashReportedRef.current) {
          crashReportedRef.current = true;
          onGameOver('Mid-air Collision!', scoreRef.current, landingsCountRef.current);
        }
      } else if (!isPaused && !isGameOverRef.current && !sectorCompleteRef.current) {
        cloudDriftRef.current = (cloudDriftRef.current + dt * 0.035) % 1.35;
        missionElapsedRef.current += dt;
        // Spawn schedule
        const pressure = getTrafficPressure(landingsCountRef.current, currentLevel.targetLandings);
        const spawnInterval = getDynamicSpawnInterval(currentLevel.spawnIntervalMs, pressure);
        if (shouldSpawnAircraft(now, lastSpawnTimeRef.current, spawnInterval)) {
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

  // Touch route editing is transactional: selection never destroys the existing course.
  // Only a deliberate, captured drag can replace it; cancellation restores the exact snapshot.
  const cancelRouteEdit = useCallback(() => {
    const selectedId = selectedPlaneIdRef.current;
    const selected = planesRef.current.find((plane) => plane.id === selectedId);
    const snapshot = routeSnapshotRef.current;
    if (selected && snapshot && isEditingRouteRef.current) {
      const restored = restoreRouteSnapshot(snapshot);
      selected.path = restored.path;
      selected.landingCleared = restored.landingCleared;
    }
    activeDrawPathRef.current = [];
    routeStartPointRef.current = null;
    gestureStartPointRef.current = null;
    activePointerIdRef.current = null;
    routeSnapshotRef.current = null;
    isEditingRouteRef.current = false;
    draftLandingClearedRef.current = false;
    draftHazardViolationRef.current = false;
  }, []);

  const handlePointerDown = (clientX: number, clientY: number, pointerId: number) => {
    if (isPaused || isGameOverRef.current) return;
    if (activePointerIdRef.current !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Find closest aircraft within touch radius, or select its existing route line.
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

    if (!closestPlane) {
      let nearestRouteDistance = 28;
      for (const plane of planesRef.current) {
        if (plane.isLanding || plane.landed || plane.path.length === 0) continue;
        const pathPoints = [{ x: plane.x, y: plane.y }, ...plane.path];
        for (let pathIndex = 0; pathIndex < pathPoints.length - 1; pathIndex += 1) {
          const lineDistance = distanceToLineSegment(
            { x, y },
            pathPoints[pathIndex],
            pathPoints[pathIndex + 1],
          );
          if (lineDistance < nearestRouteDistance) {
            nearestRouteDistance = lineDistance;
            closestPlane = plane;
          }
        }
      }
    }

    if (closestPlane) {
      selectedPlaneIdRef.current = closestPlane.id;
      // Keep the complete existing route intact until an intentional drag has ended.
      routeStartPointRef.current = { x: closestPlane.x, y: closestPlane.y };
      gestureStartPointRef.current = { x, y };
      activePointerIdRef.current = pointerId;
      routeSnapshotRef.current = cloneRouteSnapshot(closestPlane.path, closestPlane.landingCleared);
      activeDrawPathRef.current = [];
      isEditingRouteRef.current = false;
      draftLandingClearedRef.current = false;
      draftHazardViolationRef.current = false;
      sounds.playSelect();
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      selectedPlaneIdRef.current = null;
      activeDrawPathRef.current = [];
      routeStartPointRef.current = null;
      gestureStartPointRef.current = null;
      activePointerIdRef.current = null;
      routeSnapshotRef.current = null;
      draftHazardViolationRef.current = false;
    }
  };

  const handlePointerMove = (clientX: number, clientY: number, pointerId: number) => {
    if (!selectedPlaneIdRef.current || activePointerIdRef.current !== pointerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const currentPoint = { x, y };
    const gestureStart = gestureStartPointRef.current;
    if (!isEditingRouteRef.current) {
      if (!gestureStart || !hasRouteEditIntent(gestureStart, currentPoint)) return;
      isEditingRouteRef.current = true;
      activeDrawPathRef.current = [currentPoint];
    } else {
      const path = activeDrawPathRef.current;
      const last = path[path.length - 1];
      const dist = Math.sqrt((last.x - x) * (last.x - x) + (last.y - y) * (last.y - y));
      if (dist > 8) {
        path.push(currentPoint);
      }
    }

    const plane = planesRef.current.find((item) => item.id === selectedPlaneIdRef.current);
    const routeStart = routeStartPointRef.current;
    const matchingRunway = plane && getAssignedRunway(plane.type, runwaysRef.current);
    if (plane && routeStart && matchingRunway) {
      const candidateRoute = preservePlayerDrawnRoute(routeStart, activeDrawPathRef.current);
      const hazard = routeIntersectsMissionHazard(
        routeStart,
        candidateRoute,
        getMissionHazards(currentLevel.mission, dimensions.width, dimensions.height, missionElapsedRef.current),
      );
      draftHazardViolationRef.current = Boolean(hazard);
      draftLandingClearedRef.current = !hazard
        && validateLandingRoute(routeStart, candidateRoute, matchingRunway).isLocked;
    }
  };

  const handlePointerUp = (pointerId: number, clientX?: number, clientY?: number) => {
    if (activePointerIdRef.current !== pointerId) return;
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      handlePointerMove(clientX, clientY, pointerId);
    }
    if (selectedPlaneIdRef.current) {
      const plane = planesRef.current.find(p => p.id === selectedPlaneIdRef.current);
      if (plane && isEditingRouteRef.current) {
        const routeStart = routeStartPointRef.current ?? { x: plane.x, y: plane.y };
        const playerRoute = preservePlayerDrawnRoute(routeStart, activeDrawPathRef.current);
        if (playerRoute.length > 0) {
          const matchingRunway = getAssignedRunway(plane.type, runwaysRef.current);
          const hazard = routeIntersectsMissionHazard(
            routeStart,
            playerRoute,
            getMissionHazards(currentLevel.mission, dimensions.width, dimensions.height, missionElapsedRef.current),
          );
          const landingValidation = matchingRunway
            ? validateLandingRoute(routeStart, playerRoute, matchingRunway)
            : undefined;
          // A crossing of the correct coloured corridor is the player's intentional handoff.
          // Keep the player line up to that exact crossing, rather than forcing them to lift
          // their finger on a tiny anchor point or replacing the path with an automatic curve.
          plane.path = landingValidation?.isLocked
            ? routeThroughLandingCapture(playerRoute, landingValidation)
            : playerRoute;
          plane.landingCleared = Boolean(!hazard && landingValidation?.isLocked);
          sounds.playSelect();
        } else if (routeSnapshotRef.current) {
          const restored = restoreRouteSnapshot(routeSnapshotRef.current);
          plane.path = restored.path;
          plane.landingCleared = restored.landingCleared;
        }
      }
    }
    activeDrawPathRef.current = [];
    routeStartPointRef.current = null;
    gestureStartPointRef.current = null;
    activePointerIdRef.current = null;
    routeSnapshotRef.current = null;
    isEditingRouteRef.current = false;
    draftLandingClearedRef.current = false;
    draftHazardViolationRef.current = false;
  };

  // Installed PWA sessions can be interrupted by a call, lock screen, or app switch.
  // Pause before the browser throttles RAF and restore any unfinished route edit exactly.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const pauseForInterruption = () => {
      cancelRouteEdit();
      onAutoPause();
    };
    const onVisibilityChange = () => {
      if (document.hidden) pauseForInterruption();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', pauseForInterruption);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', pauseForInterruption);
    };
  }, [cancelRouteEdit, onAutoPause]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 50 && height > 50) {
      setDimensions((previous) => {
        if (previous.width === width && previous.height === height) return previous;
        const scaleX = width / previous.width;
        const scaleY = height / previous.height;
        const scalePoint = (point: Point): Point => ({ x: point.x * scaleX, y: point.y * scaleY });
        planesRef.current.forEach((plane) => {
          const position = scalePoint(plane);
          plane.x = position.x;
          plane.y = position.y;
          plane.path = plane.path.map(scalePoint);
          if (plane.landingEntry) plane.landingEntry = scalePoint(plane.landingEntry);
        });
        activeDrawPathRef.current = activeDrawPathRef.current.map(scalePoint);
        if (routeStartPointRef.current) routeStartPointRef.current = scalePoint(routeStartPointRef.current);
        if (gestureStartPointRef.current) gestureStartPointRef.current = scalePoint(gestureStartPointRef.current);
        return { width, height };
      });
      updateRunwayCoordinates(width, height);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        (window as typeof window & { __skylineInteractive?: boolean }).__skylineInteractive = true;
        window.dispatchEvent(new Event('skyline-interactive'));
      }
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
    crashEffectRef.current = null;
    crashReportedRef.current = false;
    activeConflictsRef.current = [];
    sectorCompleteRef.current = false;
    missionElapsedRef.current = 0;
    missionWarningCooldownRef.current = 0;
    missionFailureReportedRef.current = false;
    draftHazardViolationRef.current = false;
    cancelRouteEdit();
    lastSpawnTimeRef.current = performance.now();
    const firstFlight = setTimeout(() => {
      spawnAircraftRef.current();
    }, 180);
    return () => clearTimeout(firstFlight);
  }, [levelIndex, cancelRouteEdit]);

  return (
    <View ref={containerRef} style={styles.container} onLayout={onLayout}>
      {Platform.OS === 'web' ? (
        <canvas
          ref={canvasRef}
          width={Math.ceil(dimensions.width * getCanvasPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio : 1))}
          height={Math.ceil(dimensions.height * getCanvasPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio : 1))}
          style={{
            width: dimensions.width,
            height: dimensions.height,
            display: 'block',
            touchAction: 'none',
          }}
          onPointerDown={(event: any) => {
            if (event.isPrimary === false) return;
            handlePointerDown(event.clientX, event.clientY, event.pointerId);
            if (activePointerIdRef.current === event.pointerId) {
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }
          }}
          onPointerMove={(event: any) => {
            if (event.isPrimary === false) return;
            handlePointerMove(event.clientX, event.clientY, event.pointerId);
          }}
          onPointerUp={(event: any) => {
            if (event.isPrimary === false) return;
            handlePointerUp(event.pointerId, event.clientX, event.clientY);
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }
          }}
          onPointerCancel={cancelRouteEdit}
          onLostPointerCapture={cancelRouteEdit}
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
