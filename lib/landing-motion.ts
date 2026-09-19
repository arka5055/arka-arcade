import { isVerticalDestination, type Point, type RunwayZone } from '../constants/game-types';

/** Returns the shortest signed rotation from one heading to another. */
function signedAngleDifference(from: number, to: number): number {
  let difference = to - from;
  while (difference < -Math.PI) difference += Math.PI * 2;
  while (difference > Math.PI) difference -= Math.PI * 2;
  return difference;
}

function shortestAngleDifference(first: number, second: number): number {
  return Math.abs(signedAngleDifference(first, second));
}

/**
 * Keeps an aircraft's nose moving continuously through final approach instead of
 * instantly snapping to runway heading, which can make the sprite appear to reverse.
 */
export function blendLandingHeading(entryHeading: number, runwayHeading: number, approachBlend: number): number {
  const blend = Math.max(0, Math.min(1, approachBlend));
  return entryHeading + signedAngleDifference(entryHeading, runwayHeading) * blend;
}

/** Ensures the landing path always advances in its intended travel direction. */
export function isForwardAlongRunway(
  previousX: number,
  previousY: number,
  nextX: number,
  nextY: number,
  runwayHeading: number,
): boolean {
  const travelX = Math.cos(runwayHeading);
  const travelY = Math.sin(runwayHeading);
  return (nextX - previousX) * travelX + (nextY - previousY) * travelY >= -0.001;
}

/** Signed distance from the runway threshold along the runway's travel axis. */
export function getRunwayProgress(point: Point, runway: RunwayZone): number {
  return (point.x - runway.startX) * Math.cos(runway.heading)
    + (point.y - runway.startY) * Math.sin(runway.heading);
}

export function getRunwayLength(runway: RunwayZone): number {
  return Math.hypot(runway.endX - runway.startX, runway.endY - runway.startY);
}

/** Uses the strip direction that matches the aircraft's nose, so either end is legal. */
export function alignRunwayToHeading(runway: RunwayZone, heading: number): RunwayZone {
  if (isVerticalDestination(runway)) return runway;
  const reverseHeading = runway.heading + Math.PI;
  if (shortestAngleDifference(heading, reverseHeading) < shortestAngleDifference(heading, runway.heading)) {
    return {
      ...runway,
      startX: runway.endX,
      startY: runway.endY,
      endX: runway.startX,
      endY: runway.startY,
      heading: reverseHeading,
    };
  }
  return runway;
}

/**
 * Aim just beyond the threshold so heading converges to the strip without a U-turn.
 */
export function getFinalGlideAimPoint(runway: RunwayZone): Point {
  if (isVerticalDestination(runway)) {
    return { x: runway.startX, y: runway.startY };
  }
  const aimDistance = Math.min(26, Math.max(14, runway.touchdownRadius * 0.6));
  return {
    x: runway.startX + Math.cos(runway.heading) * aimDistance,
    y: runway.startY + Math.sin(runway.heading) * aimDistance,
  };
}

/** Landing may begin anywhere on the matching strip, including either threshold. */
export function canBeginForwardRunwayLanding(point: Point, runway: RunwayZone): boolean {
  if (isVerticalDestination(runway)) return true;
  const progress = getRunwayProgress(point, runway);
  const length = getRunwayLength(runway);
  return progress >= -56 && progress <= length + 12;
}
