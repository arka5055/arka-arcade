import { isVerticalDestination, type Point, type RunwayZone } from '../constants/game-types';
import { distanceToLineSegment } from './approach-routing';

export interface LandingAuthorizationInput {
  /** True only after the player finishes a route that reached a matching-colour destination. */
  landingCleared: boolean;
  /** The last player waypoint has been flown, so the aircraft is not abandoning a live route. */
  routeComplete: boolean;
  /** Aircraft is on the matching coloured surface. */
  insideCapture: boolean;
  /** Informational; paved landings accept either direction of the strip. */
  headingDifference: number;
  headingTolerance: number;
  isHelipad: boolean;
}

/**
 * A landing is a player-authorized state transition, never a proximity shortcut.
 * Once the green path has reached the matching strip, physical arrival is enough.
 */
export function canCommitLanding(input: LandingAuthorizationInput): boolean {
  return input.landingCleared && input.routeComplete && input.insideCapture;
}

export function getPhysicalTouchdownRadius(runway: RunwayZone): number {
  return isVerticalDestination(runway)
    ? runway.touchdownRadius + 10
    : Math.max(28, runway.touchdownRadius * 0.82);
}

/** True when the aircraft is on the coloured pavement, water lane, pad, or mooring. */
export function isInsidePhysicalTouchdown(point: Point, runway: RunwayZone): boolean {
  if (isVerticalDestination(runway)) {
    return Math.hypot(point.x - runway.startX, point.y - runway.startY)
      <= getPhysicalTouchdownRadius(runway);
  }
  return distanceToLineSegment(
    point,
    { x: runway.startX, y: runway.startY },
    { x: runway.endX, y: runway.endY },
  ) <= getPhysicalTouchdownRadius(runway);
}
