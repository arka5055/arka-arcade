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
  /** Wide, visible final-approach gate for forgiving touch input. */
  isInsideApproachGate: boolean;
  approachGateLength: number;
  approachGateHalfWidth: number;
  /** Signed distance along runway travel direction; values above zero have crossed the threshold. */
  thresholdProjection: number;
}

export interface LandingGateGeometry {
  captureRadius: number;
  approachGateLength: number;
  approachGateHalfWidth: number;
  /** Permits only a tiny touch overshoot; deeper endpoints would make rollout look backward. */
  maxThresholdOvershoot: number;
}

function shortestAngleDifference(first: number, second: number): number {
  let difference = Math.abs(first - second);
  while (difference > Math.PI) difference = Math.abs(difference - Math.PI * 2);
  return difference;
}

/**
 * The visible landing gate is deliberately larger than the actual tyre-contact area.
 * It gives a finger-drawn path a reliable place to finish while the later landing animation
 * handles the final glide to the threshold. No player point is changed or inserted.
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

/**
 * Validates exactly the line the player has drawn. A non-vertical destination locks when the
 * endpoint reaches its broad, colour-matched approach gate before the threshold. The final
 * segment does not need pixel-perfect runway alignment—touch gestures are inherently noisy.
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
  // Use the last meaningful segment so a tiny final finger wobble cannot lose a valid approach.
  const previousPoint = [...route.slice(0, -1)].reverse().find((point) => (
    Math.hypot(endpoint.x - point.x, endpoint.y - point.y) >= 18
  )) ?? aircraftPosition;
  const endpointDistance = Math.hypot(endpoint.x - runway.startX, endpoint.y - runway.startY);
  const finalHeading = Math.atan2(endpoint.y - previousPoint.y, endpoint.x - previousPoint.x);
  const headingDifference = shortestAngleDifference(finalHeading, runway.heading);
  const thresholdProjection = (endpoint.x - runway.startX) * Math.cos(runway.heading)
    + (endpoint.y - runway.startY) * Math.sin(runway.heading);
  const lateralOffset = Math.abs(
    (endpoint.x - runway.startX) * -Math.sin(runway.heading)
      + (endpoint.y - runway.startY) * Math.cos(runway.heading),
  );

  const isInsideCapture = endpointDistance <= geometry.captureRadius;
  const isOnApproachSide = verticalDestination || thresholdProjection <= geometry.maxThresholdOvershoot;
  const isInsideApproachGate = verticalDestination
    ? isInsideCapture
    : thresholdProjection >= -geometry.approachGateLength
      && thresholdProjection <= geometry.maxThresholdOvershoot
      && lateralOffset <= geometry.approachGateHalfWidth;

  // Entering the matching wide gate is sufficient. The route must still finish before the
  // threshold, which prevents the runway rollout from visually reversing.
  const isHeadingAligned = verticalDestination || headingDifference <= headingTolerance;
  const isLocked = isOnApproachSide && (isInsideCapture || isInsideApproachGate) && isHeadingAligned;

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
    thresholdProjection,
  };
}
