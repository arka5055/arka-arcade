import { isVerticalDestination, type Point, type RunwayZone } from '../constants/game-types';
import { distanceToLineSegment } from './approach-routing';

export interface LandingRouteValidation {
  isLocked: boolean;
  endpointDistance: number;
  headingDifference: number;
  captureRadius: number;
  headingTolerance: number;
  isInsideCapture: boolean;
  isHeadingAligned: boolean;
  isOnApproachSide: boolean;
  /** The player line reached the matching coloured surface. */
  isInsideApproachGate: boolean;
  approachGateLength: number;
  approachGateHalfWidth: number;
  /** First point where the player line meets the destination surface. */
  capturePoint?: Point;
  captureRouteSegmentIndex?: number;
  thresholdProjection: number;
}

export interface LandingGateGeometry {
  captureRadius: number;
  approachGateLength: number;
  approachGateHalfWidth: number;
  maxThresholdOvershoot: number;
}

interface RouteGateCapture {
  point: Point;
  segmentIndex: number;
  headingDifference: number;
  thresholdProjection: number;
}

function shortestAngleDifference(first: number, second: number): number {
  let difference = Math.abs(first - second);
  while (difference > Math.PI) difference = Math.abs(difference - Math.PI * 2);
  return difference;
}

function getRunwayCoordinates(point: Point, runway: RunwayZone) {
  const dx = point.x - runway.startX;
  const dy = point.y - runway.startY;
  return {
    along: dx * Math.cos(runway.heading) + dy * Math.sin(runway.heading),
    lateral: dx * -Math.sin(runway.heading) + dy * Math.cos(runway.heading),
  };
}

function lerp(start: Point, end: Point, t: number): Point {
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

/** Finger-friendly width of the coloured landing surface. */
export function getDestinationSurfaceRadius(runway: RunwayZone): number {
  if (isVerticalDestination(runway)) return runway.touchdownRadius + 14;
  return Math.max(30, runway.touchdownRadius * 0.88);
}

export function isOnDestinationSurface(point: Point, runway: RunwayZone, padding = 0): boolean {
  const radius = getDestinationSurfaceRadius(runway) + padding;
  if (isVerticalDestination(runway)) {
    return Math.hypot(point.x - runway.startX, point.y - runway.startY) <= radius;
  }
  return distanceToLineSegment(
    point,
    { x: runway.startX, y: runway.startY },
    { x: runway.endX, y: runway.endY },
  ) <= radius;
}

/** A visible, finite gate is a hint in front of the strip, not the lock itself. */
export function getLandingGateGeometry(runway: RunwayZone): LandingGateGeometry {
  if (isVerticalDestination(runway)) {
    return {
      captureRadius: runway.touchdownRadius + 14,
      approachGateLength: runway.touchdownRadius + 8,
      approachGateHalfWidth: runway.touchdownRadius + 8,
      maxThresholdOvershoot: runway.touchdownRadius + 14,
    };
  }

  return {
    captureRadius: Math.max(48, runway.touchdownRadius + 18),
    approachGateLength: Math.max(78, runway.touchdownRadius + 48),
    approachGateHalfWidth: Math.max(46, runway.touchdownRadius + 12),
    maxThresholdOvershoot: 24,
  };
}

/** Returns the two visible ends of the finite coloured gate bar. */
export function getLandingGateEndpoints(runway: RunwayZone, geometry = getLandingGateGeometry(runway)) {
  if (isVerticalDestination(runway)) {
    const center = { x: runway.startX, y: runway.startY };
    return { center, first: { ...center }, second: { ...center } };
  }
  const center = {
    x: runway.startX - Math.cos(runway.heading) * geometry.approachGateLength,
    y: runway.startY - Math.sin(runway.heading) * geometry.approachGateLength,
  };
  const lateralX = -Math.sin(runway.heading);
  const lateralY = Math.cos(runway.heading);
  return {
    center,
    first: {
      x: center.x - lateralX * geometry.approachGateHalfWidth,
      y: center.y - lateralY * geometry.approachGateHalfWidth,
    },
    second: {
      x: center.x + lateralX * geometry.approachGateHalfWidth,
      y: center.y + lateralY * geometry.approachGateHalfWidth,
    },
  };
}

function headingAlongSegment(start: Point, end: Point, runway: RunwayZone): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < 1) return Infinity;
  const forward = shortestAngleDifference(Math.atan2(dy, dx), runway.heading);
  const reverse = shortestAngleDifference(Math.atan2(dy, dx), runway.heading + Math.PI);
  return Math.min(forward, reverse);
}

function intersectSegmentCircle(start: Point, end: Point, center: Point, radius: number): Point | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const startX = start.x - center.x;
  const startY = start.y - center.y;
  const a = dx * dx + dy * dy;
  if (a < 0.00001) return Math.hypot(startX, startY) <= radius ? { ...start } : undefined;
  const b = 2 * (startX * dx + startY * dy);
  const c = startX * startX + startY * startY - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;
  const root = Math.sqrt(discriminant);
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((t) => t >= 0 && t <= 1)
    .sort((left, right) => left - right);
  const t = candidates[0];
  return t === undefined ? undefined : { x: start.x + dx * t, y: start.y + dy * t };
}

function firstSurfaceHitOnSegment(
  start: Point,
  end: Point,
  runway: RunwayZone,
): Point | undefined {
  if (isVerticalDestination(runway)) {
    const radius = getDestinationSurfaceRadius(runway);
    const center = { x: runway.startX, y: runway.startY };
    if (Math.hypot(start.x - center.x, start.y - center.y) <= radius) return { ...start };
    return intersectSegmentCircle(start, end, center, radius);
  }
  if (isOnDestinationSurface(start, runway)) return { ...start };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 0.5) return isOnDestinationSurface(end, runway) ? { ...end } : undefined;
  const steps = Math.max(1, Math.ceil(length / 4));
  for (let step = 1; step <= steps; step += 1) {
    const point = lerp(start, end, step / steps);
    if (isOnDestinationSurface(point, runway)) return point;
  }
  return undefined;
}

/**
 * Locks when the player line reaches the matching coloured destination — the original
 * Flight Control / Planes Control rule. Heading is recorded, not required.
 */
function findRouteSurfaceCapture(
  aircraftPosition: Point,
  route: readonly Point[],
  runway: RunwayZone,
): RouteGateCapture | undefined {
  const points = [aircraftPosition, ...route];
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const point = firstSurfaceHitOnSegment(start, end, runway);
    if (!point) continue;
    return {
      point,
      segmentIndex,
      headingDifference: headingAlongSegment(start, end, runway),
      thresholdProjection: getRunwayCoordinates(point, runway).along,
    };
  }

  const endpoint = points[points.length - 1];
  if (endpoint && isOnDestinationSurface(endpoint, runway)) {
    const previous = points[points.length - 2] ?? aircraftPosition;
    return {
      point: { ...endpoint },
      segmentIndex: Math.max(0, points.length - 2),
      headingDifference: headingAlongSegment(previous, endpoint, runway),
      thresholdProjection: getRunwayCoordinates(endpoint, runway).along,
    };
  }
  return undefined;
}

/** Returns only the player-authored portion of the route up to its exact surface crossing. */
export function routeThroughLandingCapture(
  route: readonly Point[],
  validation: LandingRouteValidation,
): Point[] {
  if (!validation.capturePoint || validation.captureRouteSegmentIndex === undefined) {
    return route.map((point) => ({ ...point }));
  }
  return [
    ...route.slice(0, validation.captureRouteSegmentIndex).map((point) => ({ ...point })),
    { ...validation.capturePoint },
  ];
}

/**
 * A route locks when it meets the matching coloured strip, bay, pad, or mooring.
 * The visible approach gate remains a hint; it is not a hidden extra exam.
 */
export function validateLandingRoute(
  aircraftPosition: Point,
  route: readonly Point[],
  runway: RunwayZone,
): LandingRouteValidation {
  const verticalDestination = isVerticalDestination(runway);
  const geometry = getLandingGateGeometry(runway);
  const headingTolerance = Math.PI / 2;

  if (route.length === 0) {
    return {
      isLocked: false,
      endpointDistance: Infinity,
      headingDifference: Infinity,
      captureRadius: geometry.captureRadius,
      headingTolerance,
      isInsideCapture: false,
      isHeadingAligned: false,
      isOnApproachSide: false,
      isInsideApproachGate: false,
      approachGateLength: geometry.approachGateLength,
      approachGateHalfWidth: geometry.approachGateHalfWidth,
      thresholdProjection: Infinity,
    };
  }

  const endpoint = route[route.length - 1];
  const endpointDistance = Math.hypot(endpoint.x - runway.startX, endpoint.y - runway.startY);
  const thresholdProjection = getRunwayCoordinates(endpoint, runway).along;
  const capture = findRouteSurfaceCapture(aircraftPosition, route, runway);
  const isInsideCapture = isOnDestinationSurface(endpoint, runway);
  const isInsideApproachGate = Boolean(capture);
  const headingDifference = capture?.headingDifference ?? Infinity;
  const isHeadingAligned = verticalDestination || headingDifference <= headingTolerance;
  const isOnApproachSide = Boolean(capture);
  const isLocked = Boolean(capture);

  return {
    isLocked,
    endpointDistance,
    headingDifference,
    captureRadius: geometry.captureRadius,
    headingTolerance,
    isInsideCapture,
    isHeadingAligned,
    isOnApproachSide,
    isInsideApproachGate,
    approachGateLength: geometry.approachGateLength,
    approachGateHalfWidth: geometry.approachGateHalfWidth,
    capturePoint: capture?.point,
    captureRouteSegmentIndex: capture?.segmentIndex,
    thresholdProjection,
  };
}
