import type { Point } from '@/constants/game-types';

/**
 * Keeps every player-drawn steering point exactly as supplied. The first point
 * represents the aircraft's live position, so it is omitted from its future route.
 * No automatic approach points, smoothing, or destination correction is added.
 */
export function preservePlayerDrawnRoute(points: readonly Point[]): Point[] {
  if (points.length < 2) return [];
  return points.slice(1).map((point) => ({ x: point.x, y: point.y }));
}
