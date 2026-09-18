import { isVerticalDestination, type Point, type RunwayZone } from '../constants/game-types';

export interface LandingRouteValidation {
  isLocked: boolean;
  endpointDistance: number;
  headingDifference: number;
  captureRadius: number;
  headingTolerance: number;
  isInsideCapture: boolean;
  isHeadingAligned: boolean;
  isOnApproachSide: boolean;
  /** The player line crosses the finite final-approach gate of its assigned destination. */
  isInsideApproachGate: boolean;
  approachGateLength: number;
  approachGateHalfWidth: number;
  /** Exact intersection of the player line and the real approach gate. */
  capturePoint?: Point;
  /** Segment in [aircraft position, ...route] that contains capturePoint. */
  captureRouteSegmentIndex?: number;
  /** Signed endpoint distance along runway travel direction; values above zero cross threshold. */
  thresholdProjection: number;
}

export interface LandingGateGeometry {
  captureRadius: number;
  /** Distance before the threshold where the visible gate sits. */
  approachGateLength: number;
  /** Half of the finite gate bar's width. */
  approachGateHalfWidth: number;
  /** Permits only a tiny touch overshoot; deeper endpoints would make rollout look backward. */
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

/** A visible, finite gate is intentionally easier than a pixel-sized anchor but never a broad area. */
export function getLandingGateGeometry(runway: RunwayZone): LandingGateGeometry {
  if (isVerticalDestination(runway)) {
    return {
      captureRadius: runway.touchdownRadius + 52,
      approachGateLength: runway.touchdownRadius + 52,
      approachGateHalfWidth: runway.touchdownRadius + 52,
      maxThresholdOvershoot: runway.touchdownRadius + 14,
    };
  }

  return {
    captureRadius: Math.max(92, runway.touchdownRadius + 56),
    approachGateLength: Math.max(78, runway.touchdownRadius + 48),
    approachGateHalfWidth: Math.max(46, runway.touchdownRadius + 12),
    maxThresholdOvershoot: 14,
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

function intersectSegments(firstStart: Point, firstEnd: Point, secondStart: Point, secondEnd: Point): Point | undefined {
  const firstX = firstEnd.x - firstStart.x;
  const firstY = firstEnd.y - firstStart.y;
  const secondX = secondEnd.x - secondStart.x;
  const secondY = secondEnd.y - secondStart.y;
  const determinant = firstX * secondY - firstY * secondX;
  if (Math.abs(determinant) < 0.00001) return undefined;

  const deltaX = secondStart.x - firstStart.x;
  const deltaY = secondStart.y - firstStart.y;
  const firstT = (deltaX * secondY - deltaY * secondX) / determinant;
  const secondT = (deltaX * firstY - deltaY * firstX) / determinant;
  if (firstT < 0 || firstT > 1 || secondT < 0 || secondT > 1) return undefined;
  return { x: firstStart.x + firstX * firstT, y: firstStart.y + firstY * firstT };
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

/**
 * Finds a crossing of the *finite* destination gate. A route that passes nearby, is parallel to
 * it, or is aimed at another runway cannot lock. This preserves an anchor-free gesture without
 * allowing the broad, accidental capture region that caused false positive landings.
 */
function findRouteGateCapture(
  aircraftPosition: Point,
  route: readonly Point[],
  runway: RunwayZone,
  geometry: LandingGateGeometry,
  headingTolerance: number,
): RouteGateCapture | undefined {
  const points = [aircraftPosition, ...route];
  const gate = getLandingGateEndpoints(runway, geometry);
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.hypot(dx, dy) < 1) continue;
    const headingDifference = shortestAngleDifference(Math.atan2(dy, dx), runway.heading);
    if (!isVerticalDestination(runway) && headingDifference > headingTolerance) continue;

    const point = isVerticalDestination(runway)
      ? intersectSegmentCircle(start, end, gate.center, geometry.captureRadius)
      : intersectSegments(start, end, gate.first, gate.second);
    if (!point) continue;
    return {
      point,
      segmentIndex,
      headingDifference,
      thresholdProjection: getRunwayCoordinates(point, runway).along,
    };
  }
  return undefined;
}

/**
 * Returns only the player-authored portion of the route up to its exact gate crossing. This is
 * not an automatic curve; it merely removes the unnecessary tail after a valid handoff.
 */
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
 * Validates a route by detecting an intersection with the matching finite approach gate. The
 * player can swipe straight through the bar; releasing at any later point still counts. A line
 * must physically cross the gate, so an off-runway point can never create a green landing plan.
 */
export function validateLandingRoute(
  aircraftPosition: Point,
  route: readonly Point[],
  runway: RunwayZone,
): LandingRouteValidation {
  const verticalDestination = isVerticalDestination(runway);
  const geometry = getLandingGateGeometry(runway);
  const headingTolerance = verticalDestination ? Math.PI : Math.min(Math.PI, runway.headingTolerance + 0.55);

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
  const capture = findRouteGateCapture(aircraftPosition, route, runway, geometry, headingTolerance);
  const isInsideCapture = endpointDistance <= geometry.captureRadius;
  const isInsideApproachGate = Boolean(capture);
  const isOnApproachSide = verticalDestination || Boolean(capture && capture.thresholdProjection <= 0);
  const headingDifference = capture?.headingDifference ?? Infinity;
  const isHeadingAligned = verticalDestination || Boolean(capture && capture.headingDifference <= headingTolerance);
  const isLocked = isInsideApproachGate && isOnApproachSide && isHeadingAligned;

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
