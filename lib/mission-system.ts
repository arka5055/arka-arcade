import type { GameLevel, MissionModifier, Point } from '@/constants/game-types';

export type HazardKind = 'storm' | 'terrain' | 'object' | 'fire';

export interface MissionHazard {
  id: string;
  kind: HazardKind;
  label: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  color: string;
}

export interface MissionPresentation {
  title: string;
  brief: string;
  hasFuelTimer: boolean;
  visibilityScale: number;
  windDrift: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

/** Returns the live tutorial/message model for a sector's active mechanic. */
export function getMissionPresentation(level: GameLevel): MissionPresentation {
  const modifier = level.mission;
  const hasFuelTimer = modifier === 'fuelPriority';
  const visibilityScale = modifier === 'lowVisibility' ? 0.48 : 1;
  const windDrift = modifier === 'crosswind' ? level.windSpeed * 0.9 : 0;
  return {
    title: level.missionLabel,
    brief: level.missionBrief,
    hasFuelTimer,
    visibilityScale,
    windDrift,
  };
}

/**
 * Creates only hazards that have a gameplay consequence. Coordinates are deterministic
 * and normalized against the current playable canvas; moving objects change position as
 * elapsed game time advances without changing a player-drawn route.
 */
export function getMissionHazards(
  modifier: MissionModifier,
  width: number,
  height: number,
  elapsedSeconds: number,
): MissionHazard[] {
  const time = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const boundsWidth = Math.max(1, width);
  const boundsHeight = Math.max(1, height);

  switch (modifier) {
    case 'mountainPass':
      return [{
        id: 'terrain-ridge', kind: 'terrain', label: 'RIDGE NO-FLY',
        x: boundsWidth * 0.38, y: boundsHeight * 0.39,
        radiusX: boundsWidth * 0.13, radiusY: boundsHeight * 0.09,
        rotation: -0.48, color: '#FFB300',
      }];
    case 'stormCell':
      return [{
        id: 'weather-cell', kind: 'storm', label: 'TORNADO',
        // Drifts across the main approach so the funnel can sit on the strip and block landings.
        x: boundsWidth * (0.58 + Math.sin(time * 0.22) * 0.10),
        y: boundsHeight * (0.22 + (Math.sin(time * 0.15) * 0.5 + 0.5) * 0.24),
        radiusX: Math.min(boundsWidth, boundsHeight) * 0.078,
        radiusY: Math.min(boundsWidth, boundsHeight) * 0.078,
        rotation: time * 0.8, color: '#8EC8FF',
      }];
    case 'movingObstacle':
      return [{
        id: 'drifting-object', kind: 'object', label: 'MOVING OBJECT',
        x: boundsWidth * (0.50 + Math.sin(time * 0.26) * 0.22),
        y: boundsHeight * (0.45 + Math.cos(time * 0.22) * 0.16),
        radiusX: boundsWidth * 0.072, radiusY: boundsHeight * 0.042,
        rotation: Math.sin(time * 0.25) * 0.18, color: '#FF5CD6',
      }];
    case 'wildfire':
      return [{
        id: 'fireline', kind: 'fire', label: 'FIRELINE',
        x: boundsWidth * 0.72, y: boundsHeight * 0.47,
        radiusX: boundsWidth * 0.105, radiusY: boundsHeight * 0.065,
        rotation: -0.28, color: '#FF6B35',
      }];
    default:
      return [];
  }
}

/** Tests a point against a rotated elliptical no-fly zone with a small safety buffer. */
export function isInsideMissionHazard(point: Point, hazard: MissionHazard, safetyPadding = 8): boolean {
  const cos = Math.cos(-hazard.rotation);
  const sin = Math.sin(-hazard.rotation);
  const dx = point.x - hazard.x;
  const dy = point.y - hazard.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const radiusX = Math.max(1, hazard.radiusX + safetyPadding);
  const radiusY = Math.max(1, hazard.radiusY + safetyPadding);
  return (localX * localX) / (radiusX * radiusX) + (localY * localY) / (radiusY * radiusY) <= 1;
}

/** Converts fuel to an accessible, stable band used by HUD and canvas labels. */
export function getFuelBand(seconds: number | undefined): 'normal' | 'caution' | 'critical' {
  if (seconds === undefined || !Number.isFinite(seconds)) return 'normal';
  if (seconds <= 14) return 'critical';
  if (seconds <= 28) return 'caution';
  return 'normal';
}

/** Wind is kept bounded to ensure an early sector never becomes uncontrollable. */
export function getCrosswindVector(level: GameLevel, deltaSeconds: number): Point {
  if (level.mission !== 'crosswind' || level.windSpeed <= 0) return { x: 0, y: 0 };
  const distance = clamp(level.windSpeed * 0.9 * Math.max(0, deltaSeconds), 0, 2.2);
  return {
    x: Math.cos(level.windDirection) * distance,
    y: Math.sin(level.windDirection) * distance,
  };
}

/** Samples a player-authored route without changing it, flagging no-fly crossings before release. */
export function routeIntersectsMissionHazard(
  origin: Point,
  route: readonly Point[],
  hazards: readonly MissionHazard[],
): MissionHazard | undefined {
  const points = [origin, ...route];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const samples = Math.max(1, Math.ceil(length / 9));
    for (let step = 0; step <= samples; step += 1) {
      const progress = step / samples;
      const point = {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
      const hazard = hazards.find((candidate) => candidate.kind !== 'storm' && isInsideMissionHazard(point, candidate));
      if (hazard) return hazard;
    }
  }
  return undefined;
}
