import type { Point } from '@/constants/game-types';

/**
 * Converts a finger stroke into aircraft waypoints without treating the initial
 * touch near a moving aircraft as a steering instruction. The route contains only
 * the points drawn after the finger has clearly departed the aircraft's pickup area.
 * No waypoints are generated, smoothed, or repositioned by the game.
 */
export function preservePlayerDrawnRoute(
  aircraftPosition: Point,
  drawnPoints: readonly Point[],
  pickupRadius = 44,
): Point[] {
  const firstCommandPoint = drawnPoints.findIndex((point) => (
    Math.hypot(point.x - aircraftPosition.x, point.y - aircraftPosition.y) > pickupRadius
  ));

  if (firstCommandPoint === -1) return [];
  return drawnPoints.slice(firstCommandPoint).map((point) => ({ x: point.x, y: point.y }));
}
