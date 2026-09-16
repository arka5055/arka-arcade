import type { Point, RunwayZone } from '@/constants/game-types';

/**
 * Returns the point a flight should aim for before joining the final runway line.
 * It sits behind the threshold, in the direction opposite the runway heading.
 */
export function getApproachEntry(runway: RunwayZone, distance = 125): Point {
  return {
    x: runway.startX - Math.cos(runway.heading) * distance,
    y: runway.startY - Math.sin(runway.heading) * distance,
  };
}

/** A generous capture zone turns the final approach into a reliable, assisted landing. */
export function isInsideAutoLandingCapture(point: Point, runway: RunwayZone): boolean {
  return Math.hypot(point.x - runway.startX, point.y - runway.startY)
    <= runway.touchdownRadius + 42;
}
