import type { AircraftType } from '@/constants/game-types';

/**
 * Touch-screen performance profiles. Published source material establishes category
 * variety rather than numeric speeds, so these values intentionally remain Skyline
 * balancing choices and make every class feel distinct.
 */
export interface AircraftPerformanceProfile {
  category: 'helicopter' | 'commuter' | 'utility' | 'tiltrotor' | 'airliner' | 'fighter' | 'cargo' | 'supersonic' | 'zeppelin';
  normalizedSpeed: number;
  normalizedFootprint: number;
  maneuverability: number;
}

export const AIRCRAFT_PERFORMANCE: Record<AircraftType, AircraftPerformanceProfile> = {
  helicopter: { category: 'helicopter', normalizedSpeed: 15, normalizedFootprint: 14, maneuverability: 3.8 },
  zeppelin: { category: 'zeppelin', normalizedSpeed: 19, normalizedFootprint: 66, maneuverability: 1.2 },
  propeller: { category: 'commuter', normalizedSpeed: 23, normalizedFootprint: 17, maneuverability: 3.0 },
  seaplane: { category: 'utility', normalizedSpeed: 28, normalizedFootprint: 28, maneuverability: 2.65 },
  tiltrotor: { category: 'tiltrotor', normalizedSpeed: 31, normalizedFootprint: 29, maneuverability: 2.9 },
  cargo: { category: 'cargo', normalizedSpeed: 33, normalizedFootprint: 56, maneuverability: 1.65 },
  jet: { category: 'airliner', normalizedSpeed: 38, normalizedFootprint: 44, maneuverability: 2.25 },
  fighter: { category: 'fighter', normalizedSpeed: 43, normalizedFootprint: 34, maneuverability: 2.85 },
  supersonic: { category: 'supersonic', normalizedSpeed: 48, normalizedFootprint: 52, maneuverability: 1.75 },
};

/** Larger aircraft need more separation before an alert or a collision. */
export function getAircraftSafetyRadius(type: AircraftType): number {
  const footprint = AIRCRAFT_PERFORMANCE[type].normalizedFootprint;
  return Math.max(7, footprint * 0.54);
}

/** Ordered by cruise speed; width is intentionally not monotonic across all roles. */
export function getPerformanceOrdering(): AircraftType[] {
  return ['helicopter', 'zeppelin', 'propeller', 'seaplane', 'tiltrotor', 'cargo', 'jet', 'fighter', 'supersonic'];
}
