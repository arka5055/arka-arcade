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
  /** Signed distance along runway travel direction; values above zero have crossed the threshold. */
  thresholdProjection: number;
}

function shortestAngleDifference(first: number, second: number): number {
  let difference = Math.abs(first - second);
  while (difference > Math.PI) difference = Math.abs(difference - Math.PI * 2);
  return difference;
}

/**
 * Validates only the line the player has drawn. A route is cleared when its final
 * point reaches the matching threshold and its final segment is aligned with the
 * runway direction. The function never alters or inserts route points.
 */
export function validateLandingRoute(
  aircraftPosition: Point,
  route: readonly Point[],
  runway: RunwayZone,
): LandingRouteValidation {
  // A touch-controlled game needs a generous entry window. The physical touchdown test
  // remains strict later; this only validates that the player's intended approach is sound.
  const verticalDestination = isVerticalDestination(runway);
  const captureRadius = runway.touchdownRadius + (verticalDestination ? 48 : 64);
  const headingTolerance = verticalDestination
    ? Math.PI
    : Math.min(Math.PI, runway.headingTolerance + 0.22);
  if (route.length === 0) {
    return {
      isLocked: false,
      endpointDistance: Infinity,
      headingDifference: Infinity,
      captureRadius,
      headingTolerance,
      isInsideCapture: false,
      isHeadingAligned: false,
      isOnApproachSide: false,
      thresholdProjection: Infinity,
    };
  }

  const endpoint = route[route.length - 1];
  // Finger sampling often adds a tiny final wiggle. Use the last meaningful segment rather
  // than that wiggle, so a straight drawing is recognized as a straight approach.
  const previousPoint = [...route.slice(0, -1)].reverse().find((point) => (
    Math.hypot(endpoint.x - point.x, endpoint.y - point.y) >= 26
  )) ?? aircraftPosition;
  const endpointDistance = Math.hypot(endpoint.x - runway.startX, endpoint.y - runway.startY);
  const finalHeading = Math.atan2(endpoint.y - previousPoint.y, endpoint.x - previousPoint.x);
  const headingDifference = shortestAngleDifference(finalHeading, runway.heading);
  const isHelipad = verticalDestination;
  const thresholdProjection = (endpoint.x - runway.startX) * Math.cos(runway.heading)
    + (endpoint.y - runway.startY) * Math.sin(runway.heading);
  // A path may finish just past the threshold for touch tolerance,
  // but must not continue down the runway: that would make the landing blend move backward.
  const endsOnApproachSide = isHelipad || thresholdProjection <= 14;
  const isInsideCapture = endpointDistance <= captureRadius;
  const isHeadingAligned = isHelipad || headingDifference <= headingTolerance;

  return {
    isLocked: isInsideCapture && endsOnApproachSide && isHeadingAligned,
    endpointDistance,
    headingDifference,
    captureRadius,
    headingTolerance,
    isInsideCapture,
    isHeadingAligned,
    isOnApproachSide: endsOnApproachSide,
    thresholdProjection,
  };
}
