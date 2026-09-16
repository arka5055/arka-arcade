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

/** Supports selecting an active drawn path, not only the small moving plane itself. */
export function distanceToLineSegment(point: Point, start: Point, end: Point): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared));
  return Math.hypot(point.x - (start.x + segmentX * t), point.y - (start.y + segmentY * t));
}
