import { isVerticalDestination, type Point, type RunwayZone } from '../constants/game-types';

export interface LandingAuthorizationInput {
  /** True only after the player finishes a route that passed the green clearance validator. */
  landingCleared: boolean;
  /** The last player waypoint has been flown, so the aircraft is not abandoning a live route. */
  routeComplete: boolean;
  /** Aircraft is inside its own destination's touchdown capture zone. */
  insideCapture: boolean;
  /** The player-drawn final direction must agree with the destination heading. */
  headingDifference: number;
  headingTolerance: number;
  /** Helicopters are the sole exception: H1 accepts an all-direction vertical descent. */
  isHelipad: boolean;
}

/**
 * A landing is a player-authorized state transition, never a proximity shortcut.
 * The green route clearance is deliberately required in addition to physical arrival.
 */
export function canCommitLanding(input: LandingAuthorizationInput): boolean {
  if (!input.landingCleared || !input.routeComplete || !input.insideCapture) return false;
  return input.isHelipad || input.headingDifference <= input.headingTolerance;
}

/**
 * Route clearance can be forgiving for touch play, but a visible landing animation starts
 * only near the actual threshold. This prevents an aircraft from being pulled sideways into a runway.
 */
export function getPhysicalTouchdownRadius(runway: RunwayZone): number {
  return isVerticalDestination(runway)
    ? runway.touchdownRadius + 6
    : Math.min(48, runway.touchdownRadius + 12);
}

export function isInsidePhysicalTouchdown(point: Point, runway: RunwayZone): boolean {
  return Math.hypot(point.x - runway.startX, point.y - runway.startY)
    <= getPhysicalTouchdownRadius(runway);
}
