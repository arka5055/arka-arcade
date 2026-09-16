import { AIRCRAFT_DEFS, type AircraftType, type RunwayZone } from '../constants/game-types';

/**
 * A flight has exactly one eligible landing destination. This is deliberately
 * stricter than matching a visible color: it prevents a plane from locking onto
 * any runway other than the runway assigned to its aircraft type.
 */
export function isAssignedRunway(type: AircraftType, runway: RunwayZone): boolean {
  const aircraft = AIRCRAFT_DEFS[type];
  return aircraft.landingZoneId === runway.id && runway.allowedTypes.includes(type);
}

export function getAssignedRunway(type: AircraftType, runways: readonly RunwayZone[]): RunwayZone | undefined {
  return runways.find((runway) => isAssignedRunway(type, runway));
}
