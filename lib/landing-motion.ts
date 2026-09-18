import type { Point, RunwayZone } from '@/constants/game-types';

/** Returns the shortest signed rotation from one heading to another. */
function signedAngleDifference(from: number, to: number): number {
  let difference = to - from;
  while (difference < -Math.PI) difference += Math.PI * 2;
  while (difference > Math.PI) difference -= Math.PI * 2;
  return difference;
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

/**
 * A cleared course ends at a broad gate. Aim just beyond the threshold instead of directly at
 * its centre, so heading converges to the runway direction and no final-frame U-turn is needed.
 */
export function getFinalGlideAimPoint(runway: RunwayZone): Point {
  if (runway.type === 'helipad' || runway.type === 'mooring') {
    return { x: runway.startX, y: runway.startY };
  }
  const aimDistance = Math.min(26, Math.max(14, runway.touchdownRadius * 0.6));
  return {
    x: runway.startX + Math.cos(runway.heading) * aimDistance,
    y: runway.startY + Math.sin(runway.heading) * aimDistance,
  };
}

/** A fixed animation may begin only before (or exactly at) the physical threshold. */
export function canBeginForwardRunwayLanding(point: Point, runway: RunwayZone): boolean {
  return getRunwayProgress(point, runway) <= 0.5;
}
