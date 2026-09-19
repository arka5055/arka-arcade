import { AIRCRAFT_DEFS, type AircraftType, type Point, type RunwayZone } from '../constants/game-types';
import { validateLandingRoute, type LandingRouteValidation } from './landing-route-validation';

export function destinationKindForAircraft(type: AircraftType): RunwayZone['type'] {
  if (type === 'seaplane') return 'water';
  if (type === 'helicopter' || type === 'tiltrotor') return 'helipad';
  if (type === 'zeppelin') return 'mooring';
  return 'runway';
}

/**
 * Colour is the published original rule: a cyan jet may use any cyan paved runway.
 * Surface kind still keeps seaplanes on water, helicopters on pads, and airships on moorings.
 */
export function isAssignedRunway(type: AircraftType, runway: RunwayZone): boolean {
  const aircraft = AIRCRAFT_DEFS[type];
  return aircraft.color === runway.color && runway.type === destinationKindForAircraft(type);
}

export function getEligibleRunways(type: AircraftType, runways: readonly RunwayZone[]): RunwayZone[] {
  return runways.filter((runway) => isAssignedRunway(type, runway));
}

export function getRunwayById(runways: readonly RunwayZone[], id: string | undefined): RunwayZone | undefined {
  if (!id) return undefined;
  return runways.find((runway) => runway.id === id);
}

/** Preferred strip among every colour-matched destination. */
export function getAssignedRunway(type: AircraftType, runways: readonly RunwayZone[]): RunwayZone | undefined {
  const eligible = getEligibleRunways(type, runways);
  const preferredId = AIRCRAFT_DEFS[type].landingZoneId;
  return eligible.find((runway) => runway.id === preferredId) ?? eligible[0];
}

export function resolveAircraftRunway(
  type: AircraftType,
  runways: readonly RunwayZone[],
  committedRunwayId?: string,
): RunwayZone | undefined {
  const committed = getRunwayById(runways, committedRunwayId);
  if (committed && isAssignedRunway(type, committed)) return committed;
  return getAssignedRunway(type, runways);
}

export interface RouteDestination {
  runway: RunwayZone;
  validation: LandingRouteValidation;
}

/** Picks the colour-matched destination the player line actually reached. */
export function resolveRouteDestination(
  type: AircraftType,
  origin: Point,
  route: readonly Point[],
  runways: readonly RunwayZone[],
): RouteDestination | undefined {
  let best: RouteDestination | undefined;
  for (const runway of getEligibleRunways(type, runways)) {
    const validation = validateLandingRoute(origin, route, runway);
    if (!validation.isLocked) continue;
    if (!best || validation.endpointDistance < best.validation.endpointDistance) {
      best = { runway, validation };
    }
  }
  return best;
}
