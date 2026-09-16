import type { Point, RunwayZone } from '@/constants/game-types';

export interface LandingRouteValidation {
  isLocked: boolean;
  endpointDistance: number;
  headingDifference: number;
  captureRadius: number;
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
  const captureRadius = runway.touchdownRadius + 42;
  if (route.length === 0) {
    return { isLocked: false, endpointDistance: Infinity, headingDifference: Infinity, captureRadius };
  }

  const endpoint = route[route.length - 1];
  const previousPoint = route.length > 1 ? route[route.length - 2] : aircraftPosition;
  const endpointDistance = Math.hypot(endpoint.x - runway.startX, endpoint.y - runway.startY);
  const finalHeading = Math.atan2(endpoint.y - previousPoint.y, endpoint.x - previousPoint.x);
  const headingDifference = shortestAngleDifference(finalHeading, runway.heading);

  return {
    isLocked: endpointDistance <= captureRadius && headingDifference <= runway.headingTolerance,
    endpointDistance,
    headingDifference,
    captureRadius,
  };
}
