import type { AircraftInstance } from '@/constants/game-types';

/** Small-screen traffic budgets keep every conflict solvable by finger input. */
const ACTIVE_AIRCRAFT_BUDGETS = [3, 4, 5, 6] as const;

export function getActiveAircraftBudget(levelIndex: number): number {
  return ACTIVE_AIRCRAFT_BUDGETS[Math.max(0, Math.min(ACTIVE_AIRCRAFT_BUDGETS.length - 1, levelIndex))];
}

export function getActiveAircraftCount(planes: readonly AircraftInstance[]): number {
  return planes.filter((plane) => !plane.landed).length;
}

/** The director defers a spawn rather than forcing additional, unmanageable air traffic. */
export function canSpawnInSector(planes: readonly AircraftInstance[], levelIndex: number): boolean {
  return getActiveAircraftCount(planes) < getActiveAircraftBudget(levelIndex);
}
