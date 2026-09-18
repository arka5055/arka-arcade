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
  /** The player line crosses the broad final-approach corridor, even if it ends beyond it. */
  isInsideApproachGate: boolean;
  approachGateLength: number;
  approachGateHalfWidth: number;
  /** Exact point on the player-drawn line where the aircraft will begin final glide. */
  capturePoint?: Point;
  /** Segment in [aircraft position, ...route] that contains capturePoint. */
  captureRouteSegmentIndex?: number;
  /** Signed endpoint distance along runway travel direction; values above zero cross threshold. */
  thresholdProjection: number;
}

export interface LandingGateGeometry {
  captureRadius: number;
  approachGateLength: number;
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

/**
 * The visible landing gate is deliberately larger than the actual tyre-contact area.
 * It gives a finger-drawn path a reliable place to cross while the later landing animation
 * handles the final glide. No player point is smoothed or re-positioned.
 */
export function getLandingGateGeometry(runway: RunwayZone): LandingGateGeometry {
  if (isVerticalDestination(runway)) {
    return {
      captureRadius: runway.touchdownRadius + 58,
      approachGateLength: runway.touchdownRadius + 58,
      approachGateHalfWidth: runway.touchdownRadius + 58,
      maxThresholdOvershoot: runway.touchdownRadius + 14,
    };
  }

  return {
    captureRadius: Math.max(118, runway.touchdownRadius + 82),
    approachGateLength: Math.max(154, runway.touchdownRadius + 118),
    approachGateHalfWidth: Math.max(64, runway.touchdownRadius + 30),
    maxThresholdOvershoot: 14,
  };
}

function isInsideLandingGate(point: Point, runway: RunwayZone, geometry: LandingGateGeometry): boolean {
  if (isVerticalDestination(runway)) {
    return Math.hypot(point.x - runway.startX, point.y - runway.startY) <= geometry.captureRadius;
  }
  const { along, lateral } = getRunwayCoordinates(point, runway);
  return along >= -geometry.approachGateLength
    && along <= geometry.maxThresholdOvershoot
    && Math.abs(lateral) <= geometry.approachGateHalfWidth;
}

/**
 * Finds the first place that a player-authored route passes through the coloured arrival
 * corridor. Sampling a short segment is intentional: browser pointer events can skip directly
 * over a narrow target between frames, especially on a rapid iPhone swipe.
 */
function findRouteGateCapture(
  aircraftPosition: Point,
  route: readonly Point[],
  runway: RunwayZone,
  geometry: LandingGateGeometry,
  headingTolerance: number,
): RouteGateCapture | undefined {
  const points = [aircraftPosition, ...route];
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < 1) continue;
    const segmentHeading = Math.atan2(dy, dx);
    const headingDifference = shortestAngleDifference(segmentHeading, runway.heading);
    if (!isVerticalDestination(runway) && headingDifference > headingTolerance) continue;

    // 6px steps make a crossing impossible to miss on the iPhone canvas while preserving
    // the exact player-authored course rather than replacing it with an assisted curve.
    const steps = Math.max(1, Math.ceil(segmentLength / 6));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const point = { x: start.x + dx * t, y: start.y + dy * t };
      if (!isInsideLandingGate(point, runway, geometry)) continue;
      return {
        point,
        segmentIndex,
        headingDifference,
        thresholdProjection: getRunwayCoordinates(point, runway).along,
      };
    }
  }
  return undefined;
}

/**
 * Returns the exact portion of a drawn route up to its gate crossing. This is not an automatic
 * route: it is the player's own line, ending precisely at the point where it entered the gate.
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
 * Validates a route by detecting an intersection with the matching broad arrival corridor.
 * The player does not need to hunt for an anchor point or end a swipe at a particular pixel:
 * crossing the correct coloured gate is enough to arm the final glide.
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
  const isOnApproachSide = verticalDestination || Boolean(capture && capture.thresholdProjection <= geometry.maxThresholdOvershoot);
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
