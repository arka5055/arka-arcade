import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {
  AircraftInstance,
  AircraftType,
  AIRCRAFT_DEFS,
  GameLevel,
  LEVELS,
  Point,
  RunwayZone,
} from '@/constants/game-types';
import {
  distanceToLineSegment,
} from '@/lib/approach-routing';
import { getAssignedRunway } from '@/lib/runway-assignment';
import { getAircraftSafetyRadius } from '@/lib/aircraft-performance';
import { getLandingDuration, getLandingSequence } from '@/lib/landing-sequence';
import { validateLandingRoute } from '@/lib/landing-route-validation';
import { canCommitLanding, isInsidePhysicalTouchdown } from '@/lib/landing-authorization';

interface AirTrafficCanvasProps {
  levelIndex: number;
  isPaused: boolean;
  soundEnabled: boolean;
  onPlaneLanded: (type: AircraftType, scoreGain: number, totalLandings: number) => void;
  onGameOver: (reason: string, finalScore: number, finalLandings: number) => void;
  onLevelComplete: (level: number) => void;
}

const routeName = (type: AircraftType) => {
  if (type === 'jet') return 'JET → R34';
  if (type === 'supersonic') return 'SST → R34';
  if (type === 'propeller') return 'PROP → R28';
  if (type === 'helicopter') return 'HELI → H1';
  return 'SEA → BAY';
};

export function AirTrafficCanvas({
  levelIndex,
  isPaused,
  onPlaneLanded,
  onGameOver,
  onLevelComplete,
}: AirTrafficCanvasProps) {
  const [bounds, setBounds] = useState({ width: 360, height: 560 });
  const [planes, setPlanes] = useState<AircraftInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPoint, setDraftPoint] = useState<Point | null>(null);
  const planesRef = useRef<AircraftInstance[]>([]);
  const selectedRef = useRef<string | null>(null);
  const landingsRef = useRef(0);
  const scoreRef = useRef(0);
  const gameOverRef = useRef(false);
  const lastSpawnRef = useRef(0);
  const currentLevel: GameLevel = LEVELS[levelIndex] ?? LEVELS[0];

  const runways = useMemo<RunwayZone[]>(() => {
    const { width: w, height: h } = bounds;
    return [
      {
        id: 'runway-main', name: 'JET + SST · R34', startX: w * 0.66, startY: h * 0.18,
        endX: w * 0.66, endY: h * 0.78, allowedTypes: ['jet', 'supersonic'],
        heading: Math.PI / 2, headingTolerance: 1.1, touchdownRadius: 34, color: '#00E5FF', type: 'runway',
      },
      {
        id: 'runway-diagonal', name: 'PROP · R28', startX: w * 0.23, startY: h * 0.29,
        endX: w * 0.85, endY: h * 0.64, allowedTypes: ['propeller'],
        heading: Math.atan2(h * 0.35, w * 0.62), headingTolerance: 1.1, touchdownRadius: 32, color: '#FFB300', type: 'runway',
      },
      {
        id: 'water-bay', name: 'SEAPLANE · BAY', startX: w * 0.20, startY: h * 0.72,
        endX: w * 0.43, endY: h * 0.88, allowedTypes: ['seaplane'],
        heading: Math.atan2(h * 0.16, w * 0.23), headingTolerance: 1.2, touchdownRadius: 38, color: '#00E676', type: 'water',
      },
      {
        id: 'helipad-h1', name: 'HELI · H1', startX: w * 0.25, startY: h * 0.53,
        endX: w * 0.25, endY: h * 0.53, allowedTypes: ['helicopter'],
        heading: 0, headingTolerance: Math.PI, touchdownRadius: 34, color: '#C86BFF', type: 'helipad',
      },
    ];
  }, [bounds]);

  const spawnPlane = useCallback(() => {
    const { width: w, height: h } = bounds;
    if (w < 80 || h < 80 || gameOverRef.current) return;
    const type = currentLevel.allowedTypes[Math.floor(Math.random() * currentLevel.allowedTypes.length)];
    const edge = Math.floor(Math.random() * 4);
    const margin = 22;
    let x = margin;
    let y = margin;
    let heading = 0;

    if (edge === 0) { x = margin + Math.random() * (w - margin * 2); y = -6; heading = Math.PI / 2; }
    if (edge === 1) { x = w + 6; y = margin + Math.random() * (h - margin * 2); heading = Math.PI; }
    if (edge === 2) { x = margin + Math.random() * (w - margin * 2); y = h + 6; heading = -Math.PI / 2; }
    if (edge === 3) { x = -6; y = margin + Math.random() * (h - margin * 2); heading = 0; }

    const plane: AircraftInstance = {
      id: `native-plane-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      type, x, y, heading, targetHeading: heading, speed: AIRCRAFT_DEFS[type].speed * currentLevel.speedMultiplier,
      path: [], landingCleared: false, isLanding: false, landingProgress: 0, warningLevel: 'safe', landed: false, createdAt: Date.now(),
    };
    setPlanes((previous) => [...previous, plane]);
  }, [bounds, currentLevel]);

  useEffect(() => {
    planesRef.current = planes;
  }, [planes]);

  useEffect(() => {
    gameOverRef.current = false;
    landingsRef.current = 0;
    scoreRef.current = 0;
    setPlanes([]);
    const firstFlight = setTimeout(spawnPlane, 650);
    return () => clearTimeout(firstFlight);
  }, [levelIndex, spawnPlane]);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      if (gameOverRef.current) return;
      const now = Date.now();
      if (now - lastSpawnRef.current > currentLevel.spawnIntervalMs) {
        spawnPlane();
        lastSpawnRef.current = now;
      }

      setPlanes((previous) => {
        const next = previous.flatMap((plane) => {
          const assignedRunway = getAssignedRunway(plane.type, runways);
          if (plane.isLanding && assignedRunway) {
            const landingProgress = Math.min(1, plane.landingProgress + 0.06 / getLandingDuration(plane.type));
            const landing = getLandingSequence(plane.type, landingProgress);
            const entry = plane.landingEntry ?? { x: plane.x, y: plane.y };
            if (landingProgress >= 1) {
              landingsRef.current += 1;
              scoreRef.current += AIRCRAFT_DEFS[plane.type].scoreValue;
              setTimeout(() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onPlaneLanded(plane.type, AIRCRAFT_DEFS[plane.type].scoreValue, landingsRef.current);
                if (landingsRef.current >= currentLevel.targetLandings) onLevelComplete(levelIndex + 1);
              }, 0);
              return [];
            }
            return [{
              ...plane,
              heading: assignedRunway.heading,
              landingProgress,
              landingEntry: entry,
              landingEntrySpeed: plane.landingEntrySpeed ?? plane.speed,
              x: assignedRunway.type === 'helipad' || landing.approachBlend < 0.999
                ? entry.x + (assignedRunway.startX - entry.x) * landing.approachBlend
                : assignedRunway.startX + (assignedRunway.endX - assignedRunway.startX) * landing.runwayProgress,
              y: assignedRunway.type === 'helipad' || landing.approachBlend < 0.999
                ? entry.y + (assignedRunway.startY - entry.y) * landing.approachBlend
                : assignedRunway.startY + (assignedRunway.endY - assignedRunway.startY) * landing.runwayProgress,
            }];
          }

          const target = plane.path[0];
          let targetHeading = plane.targetHeading;
          if (target) targetHeading = Math.atan2(target.y - plane.y, target.x - plane.x);
          else if (plane.x < -25 || plane.x > bounds.width + 25 || plane.y < -25 || plane.y > bounds.height + 25) {
            targetHeading = Math.atan2(bounds.height / 2 - plane.y, bounds.width / 2 - plane.x);
          }

          let diff = targetHeading - plane.heading;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          const turnStep = AIRCRAFT_DEFS[plane.type].turnSpeed * 0.06;
          const heading = Math.abs(diff) < turnStep ? targetHeading : plane.heading + Math.sign(diff) * turnStep;
          const speed = plane.speed * 0.72;
          const moved: AircraftInstance = {
            ...plane,
            heading,
            targetHeading,
            x: plane.x + Math.cos(heading) * speed * 0.06,
            y: plane.y + Math.sin(heading) * speed * 0.06,
            path: target && Math.hypot(target.x - plane.x, target.y - plane.y) < 24 ? plane.path.slice(1) : plane.path,
          };

          const runway = getAssignedRunway(moved.type, runways);
          let headingDifference = Math.abs(heading - (runway?.heading ?? 0));
          while (headingDifference > Math.PI) headingDifference = Math.abs(headingDifference - Math.PI * 2);
          const authorized = Boolean(runway && canCommitLanding({
            landingCleared: moved.landingCleared,
            routeComplete: moved.path.length === 0,
            insideCapture: isInsidePhysicalTouchdown(moved, runway),
            headingDifference,
            headingTolerance: runway.headingTolerance,
            isHelipad: runway.type === 'helipad',
          }));
          if (runway && authorized) {
            return [{
              ...moved,
              isLanding: true,
              landingProgress: 0,
              path: [],
              heading: runway.heading,
              landingEntry: { x: moved.x, y: moved.y },
              landingEntrySpeed: moved.speed,
            }];
          }
          return [moved];
        });

        for (let i = 0; i < next.length; i += 1) {
          for (let j = i + 1; j < next.length; j += 1) {
            if (Math.hypot(next[i].x - next[j].x, next[i].y - next[j].y)
              < getAircraftSafetyRadius(next[i].type) + getAircraftSafetyRadius(next[j].type)) {
              gameOverRef.current = true;
              setTimeout(() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                onGameOver('Mid-air Collision!', scoreRef.current, landingsRef.current);
              }, 0);
            }
          }
        }
        return next;
      });
    }, 60);
    return () => clearInterval(timer);
  }, [bounds, currentLevel, isPaused, levelIndex, onGameOver, onLevelComplete, onPlaneLanded, runways, spawnPlane]);

  const pointFromEvent = (event: any): Point => ({
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  });

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => selectedRef.current !== null,
    onPanResponderGrant: (event) => {
      if (isPaused || gameOverRef.current) return;
      const point = pointFromEvent(event);
      let found = planesRef.current.find((plane) => Math.hypot(plane.x - point.x, plane.y - point.y) < 42);
      if (!found) {
        found = planesRef.current.find((plane) => {
          const points = [{ x: plane.x, y: plane.y }, ...plane.path];
          return points.some((pathPoint, index) => index < points.length - 1
            && distanceToLineSegment(point, pathPoint, points[index + 1]) < 28);
        });
      }
      if (found) {
        selectedRef.current = found.id;
        setSelectedId(found.id);
        setDraftPoint(point);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    onPanResponderMove: (event) => {
      if (selectedRef.current) setDraftPoint(pointFromEvent(event));
    },
    onPanResponderRelease: (event) => {
      const id = selectedRef.current;
      if (id) {
        const drawnPoint = pointFromEvent(event);
        setPlanes((previous) => previous.map((plane) => {
          if (plane.id !== id) return plane;
          const runway = getAssignedRunway(plane.type, runways);
          const route = [drawnPoint];
          return {
            ...plane,
            path: route,
            landingCleared: Boolean(runway && validateLandingRoute(plane, route, runway).isLocked),
          };
        }));
      }
      selectedRef.current = null;
      setSelectedId(null);
      setDraftPoint(null);
    },
    onPanResponderTerminate: () => {
      selectedRef.current = null;
      setSelectedId(null);
      setDraftPoint(null);
    },
  }), [isPaused, runways]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 100 && height > 100) setBounds({ width, height });
  };

  return (
    <View style={styles.container} onLayout={onLayout} {...panResponder.panHandlers}>
      <Image
        source={require('../assets/images/coastal-airport-scene.jpg')}
        resizeMode="cover"
        style={styles.scenery}
      />
      <Svg width={bounds.width} height={bounds.height}>
        <Defs>
          <LinearGradient id="ocean" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#04121f" />
            <Stop offset="0.52" stopColor="#0b2f45" />
            <Stop offset="1" stopColor="#061a2a" />
          </LinearGradient>
          <LinearGradient id="land" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#285541" />
            <Stop offset="1" stopColor="#102d28" />
          </LinearGradient>
        </Defs>
        <Rect width={bounds.width} height={bounds.height} fill="url(#ocean)" fillOpacity={0.62} />
        <Path
          d={`M ${bounds.width * 0.1} ${bounds.height * 0.08} C ${bounds.width * 0.65} ${bounds.height * 0.02}, ${bounds.width * 0.95} ${bounds.height * 0.2}, ${bounds.width * 0.92} ${bounds.height * 0.5} C ${bounds.width * 0.9} ${bounds.height * 0.85}, ${bounds.width * 0.55} ${bounds.height * 0.94}, ${bounds.width * 0.25} ${bounds.height * 0.86} C ${bounds.width * 0.05} ${bounds.height * 0.7}, ${bounds.width * 0.02} ${bounds.height * 0.3}, ${bounds.width * 0.1} ${bounds.height * 0.08}`}
          fill="url(#land)" stroke="#56d49d" strokeOpacity={0.6} strokeWidth={3}
        />
        {[60, 120, 180, 240].map((radius) => <Circle key={radius} cx={bounds.width * 0.5} cy={bounds.height * 0.5} r={radius} fill="none" stroke="#00e5ff" strokeOpacity={0.12} />)}
        <Rect x={bounds.width * 0.17} y={bounds.height * 0.4} width={bounds.width * 0.27} height={bounds.height * 0.26} fill="#202d37" stroke="#ffbe46" strokeOpacity={0.4} />
        <SvgText x={bounds.width * 0.19} y={bounds.height * 0.43} fill="#e1eef5" fontSize={9} fontWeight="700">SKYLINE TERMINAL</SvgText>

        {runways.map((runway) => (
          <G key={runway.id}>
            <Line x1={runway.startX} y1={runway.startY} x2={runway.endX} y2={runway.endY} stroke={runway.type === 'water' ? '#006455' : '#121923'} strokeWidth={28} strokeLinecap="round" />
            <Line x1={runway.startX} y1={runway.startY} x2={runway.endX} y2={runway.endY} stroke={runway.color} strokeWidth={3} strokeDasharray="8 7" strokeLinecap="round" />
            {runway.type === 'runway' && <Line x1={runway.startX} y1={runway.startY} x2={runway.endX} y2={runway.endY} stroke="#ffffff" strokeOpacity={0.9} strokeWidth={2} strokeDasharray="6 6" />}
            <G transform={`translate(${runway.startX} ${runway.startY}) rotate(${runway.heading * 180 / Math.PI})`}>
              <Rect x={-10} y={-18} width={20} height={9} fill="#f8fbff" />
              <Rect x={-10} y={9} width={20} height={9} fill="#f8fbff" />
              <Polygon points="28,0 10,-10 10,10" fill={runway.color} />
              <Line x1={-runway.touchdownRadius} y1={0} x2={42} y2={0} stroke={runway.color} strokeWidth={2} strokeDasharray="5 5" />
            </G>
            <Rect x={runway.startX - 48} y={runway.startY - 42} width={96} height={17} fill="#030c14" stroke={runway.color} rx={2} />
            <SvgText x={runway.startX} y={runway.startY - 30} fill="#ffffff" fontSize={9} fontWeight="800" textAnchor="middle">{runway.name}</SvgText>
          </G>
        ))}
        {(() => {
          const helipad = runways.find((runway) => runway.type === 'helipad');
          return helipad ? <G>
            <Rect x={helipad.startX - 29} y={helipad.startY - 29} width={58} height={58} fill="#16152a" stroke="#C86BFF" strokeWidth={3} />
            <Circle cx={helipad.startX} cy={helipad.startY} r={18} fill="none" stroke="#ffffff" strokeWidth={2} />
            <SvgText x={helipad.startX} y={helipad.startY + 9} fill="#ffffff" fontSize={27} fontWeight="900" textAnchor="middle">H</SvgText>
          </G> : null;
        })()}

        {planes.map((plane) => {
          const def = AIRCRAFT_DEFS[plane.type];
          const target = plane.path[0];
          const tag = routeName(plane.type);
          return (
            <G key={plane.id}>
              {!plane.isLanding && <Line
                x1={plane.x - Math.cos(plane.heading) * 4}
                y1={plane.y - Math.sin(plane.heading) * 4}
                x2={plane.x - Math.cos(plane.heading) * (plane.type === 'supersonic' ? 34 : 22)}
                y2={plane.y - Math.sin(plane.heading) * (plane.type === 'supersonic' ? 34 : 22)}
                stroke={def.color}
                strokeOpacity={0.42}
                strokeWidth={plane.type === 'supersonic' ? 3 : 2}
                strokeLinecap="round"
              />}
              {target && <Line x1={plane.x} y1={plane.y} x2={target.x} y2={target.y} stroke={def.color} strokeWidth={2.5} strokeDasharray="5 5" />}
              {selectedId === plane.id && <Circle cx={plane.x} cy={plane.y} r={28} fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="4 3" />}
              <G transform={`translate(${plane.x} ${plane.y}) rotate(${plane.heading * 180 / Math.PI})`}>
                {plane.isLanding && <G opacity={Math.max(0, 0.55 - plane.landingProgress)}>
                  <Circle cx={-14} cy={-7} r={5} fill="#d2e0e8" fillOpacity={0.32} />
                  <Circle cx={-22} cy={7} r={7} fill="#d2e0e8" fillOpacity={0.22} />
                </G>}
                <Polygon points="19,0 -12,-13 -5,0 -12,13" fill={def.color} stroke={def.color} strokeWidth={1.8} />
                <Polygon points="16,0 -5,-9 -3,0 -5,9" fill="#eaf5f9" fillOpacity={0.72} />
                <Circle cx={0} cy={-8} r={3.5} fill="#263a48" stroke="#dcecf2" strokeWidth={0.8} />
                <Circle cx={0} cy={8} r={3.5} fill="#263a48" stroke="#dcecf2" strokeWidth={0.8} />
                <Circle cx={7} cy={0} r={3} fill="#17385a" />
                <Circle cx={-3} cy={-12} r={2} fill="#ff3d71" />
                <Circle cx={-3} cy={12} r={2} fill="#00e676" />
                {plane.type === 'helicopter' && <G>
                  <Circle cx={0} cy={0} r={def.wingspan * 0.5} fill="#c86bff" fillOpacity={0.10} />
                  <Circle cx={0} cy={0} r={def.wingspan * 0.5} fill="none" stroke="#f8f2ff" strokeOpacity={0.30} strokeWidth={0.8} />
                  <Line x1={0} y1={-def.wingspan * 0.5} x2={0} y2={def.wingspan * 0.5} stroke="#f8f2ff" strokeOpacity={0.7} strokeWidth={1.1} />
                  <Line x1={-def.wingspan * 0.5} y1={0} x2={def.wingspan * 0.5} y2={0} stroke="#f8f2ff" strokeOpacity={0.7} strokeWidth={1.1} />
                  <Line x1={-def.length * 0.55} y1={0} x2={-def.length * 0.95} y2={0} stroke={def.color} strokeWidth={3.2} />
                </G>}
                {plane.isLanding && <G>
                  <Line x1={-6} y1={-2} x2={-8} y2={8} stroke="#1d2830" strokeWidth={2} />
                  <Line x1={6} y1={-2} x2={4} y2={8} stroke="#1d2830" strokeWidth={2} />
                  <Circle cx={-8} cy={9} r={2.2} fill="#05070a" />
                  <Circle cx={4} cy={9} r={2.2} fill="#05070a" />
                </G>}
              </G>
              <Rect x={plane.x - 33} y={plane.y - 35} width={66} height={16} fill="#030c14" fillOpacity={0.92} stroke={def.color} rx={2} />
              <SvgText x={plane.x} y={plane.y - 24} fill="#ffffff" fontSize={9} fontWeight="800" textAnchor="middle">{tag}</SvgText>
            </G>
          );
        })}
        {selectedId && draftPoint && (() => {
          const plane = planes.find((item) => item.id === selectedId);
          return plane ? <Line x1={plane.x} y1={plane.y} x2={draftPoint.x} y2={draftPoint.y} stroke="#ffffff" strokeWidth={3} strokeDasharray="6 5" /> : null;
        })()}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#061a29',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.30)',
  },
  scenery: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.42,
  },
});
