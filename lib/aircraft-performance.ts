import type { AircraftType } from '@/constants/game-types';

/**
 * Gameplay profiles inspired by the original Planes Control roster categories.
 * Rarepixels publishes the categories, not internal numeric speeds, so these
 * normalized values preserve the intended relative behavior on a touch screen.
 */
export interface AircraftPerformanceProfile {
  category: 'helicopter' | 'commuter' | 'utility' | 'airliner' | 'supersonic';
  normalizedSpeed: number;
  normalizedFootprint: number;
  maneuverability: number;
}

export const AIRCRAFT_PERFORMANCE: Record<AircraftType, AircraftPerformanceProfile> = {
  helicopter: {
    category: 'helicopter',
    normalizedSpeed: 15,
    normalizedFootprint: 14,
    maneuverability: 3.8,
  },
  propeller: {
    category: 'commuter',
    normalizedSpeed: 23,
    normalizedFootprint: 17,
    maneuverability: 3.0,
  },
  seaplane: {
    category: 'utility',
    normalizedSpeed: 28,
    normalizedFootprint: 28,
    maneuverability: 2.65,
  },
  jet: {
    category: 'airliner',
    normalizedSpeed: 38,
    normalizedFootprint: 44,
    maneuverability: 2.25,
  },
  supersonic: {
    category: 'supersonic',
    normalizedSpeed: 48,
    normalizedFootprint: 52,
    maneuverability: 1.75,
  },
};

/** Larger aircraft need more separation before an alert or a collision. */
export function getAircraftSafetyRadius(type: AircraftType): number {
  const footprint = AIRCRAFT_PERFORMANCE[type].normalizedFootprint;
  return Math.max(7, footprint * 0.54);
}

/** A compact model is convenient for testing strict in-game ordering. */
export function getPerformanceOrdering(): AircraftType[] {
  return ['helicopter', 'propeller', 'seaplane', 'jet', 'supersonic'];
}
