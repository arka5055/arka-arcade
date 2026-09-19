import type { Point } from '@/constants/game-types';

export interface RouteSnapshot {
  path: Point[];
  landingCleared: boolean;
}

export interface ActiveStroke {
  pointerId: number;
  planeId: string;
  drawPath: Point[];
  routeStart: Point;
  gestureStart: Point;
  snapshot: RouteSnapshot;
  isEditing: boolean;
  draftLandingCleared: boolean;
  draftHazardViolation: boolean;
}

/** Minimum finger travel that distinguishes a deliberate route edit from a selection tap. */
export const ROUTE_EDIT_INTENT_DISTANCE = 12;

export function cloneRouteSnapshot(path: readonly Point[], landingCleared: boolean): RouteSnapshot {
  return {
    path: path.map((point) => ({ ...point })),
    landingCleared,
  };
}

export function hasRouteEditIntent(start: Point, current: Point): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= ROUTE_EDIT_INTENT_DISTANCE;
}

/** Restores only cloned values, so cancellation can never mutate the previously safe route. */
export function restoreRouteSnapshot(snapshot: RouteSnapshot): RouteSnapshot {
  return cloneRouteSnapshot(snapshot.path, snapshot.landingCleared);
}
