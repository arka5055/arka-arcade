export type AircraftType =
  | 'jet'
  | 'propeller'
  | 'supersonic'
  | 'seaplane'
  | 'helicopter'
  | 'fighter'
  | 'cargo'
  | 'tiltrotor'
  | 'zeppelin';

export type MissionModifier =
  | 'training'
  | 'crosswind'
  | 'fuelPriority'
  | 'mountainPass'
  | 'stormCell'
  | 'lowVisibility'
  | 'movingObstacle'
  | 'nightOps'
  | 'wildfire'
  | 'mixedTraffic';

export type MapLayout = 'coastal' | 'delta' | 'ridge';

export interface AircraftConfig {
  type: AircraftType;
  name: string;
  role: string;
  speed: number;
  turnSpeed: number;
  scoreValue: number;
  color: string;
  wingspan: number;
  length: number;
  landingZoneId: string;
  /** Used only in fuel-priority sectors; absent means that the class has no fuel timer. */
  fuelSeconds?: number;
}

/**
 * Original Skyline aircraft roles. Categories mirror the genre's tactical variety,
 * but names, silhouettes, values and destinations are Skyline's own design.
 */
export const AIRCRAFT_DEFS: Record<AircraftType, AircraftConfig> = {
  helicopter: {
    type: 'helicopter', name: 'Rescue Helicopter', role: 'Vertical rescue',
    speed: 15, turnSpeed: 3.8, scoreValue: 200, color: '#C86BFF',
    wingspan: 22, length: 14, landingZoneId: 'helipad-h1', fuelSeconds: 52,
  },
  propeller: {
    type: 'propeller', name: 'Harbor Commuter', role: 'Light commuter',
    speed: 23, turnSpeed: 3.0, scoreValue: 150, color: '#FFB300',
    wingspan: 20, length: 17, landingZoneId: 'runway-diagonal', fuelSeconds: 58,
  },
  seaplane: {
    type: 'seaplane', name: 'Lagoon Seaplane', role: 'Water utility',
    speed: 28, turnSpeed: 2.65, scoreValue: 180, color: '#00E676',
    wingspan: 30, length: 28, landingZoneId: 'water-bay', fuelSeconds: 56,
  },
  tiltrotor: {
    type: 'tiltrotor', name: 'Harbor Tiltrotor', role: 'Vertical shuttle',
    speed: 31, turnSpeed: 2.9, scoreValue: 220, color: '#C86BFF',
    wingspan: 34, length: 29, landingZoneId: 'helipad-h1', fuelSeconds: 50,
  },
  jet: {
    type: 'jet', name: 'Commercial Jet', role: 'Airliner',
    speed: 38, turnSpeed: 2.25, scoreValue: 100, color: '#00E5FF',
    wingspan: 40, length: 44, landingZoneId: 'runway-main', fuelSeconds: 64,
  },
  fighter: {
    type: 'fighter', name: 'Interceptor', role: 'Fast maneuvering',
    speed: 43, turnSpeed: 2.85, scoreValue: 240, color: '#00E5FF',
    wingspan: 32, length: 34, landingZoneId: 'runway-main', fuelSeconds: 46,
  },
  cargo: {
    type: 'cargo', name: 'Heavy Cargo', role: 'Wide heavy transport',
    speed: 33, turnSpeed: 1.65, scoreValue: 280, color: '#FFB300',
    wingspan: 52, length: 56, landingZoneId: 'runway-diagonal', fuelSeconds: 72,
  },
  supersonic: {
    type: 'supersonic', name: 'Skyline Arrow', role: 'Supersonic corridor',
    speed: 48, turnSpeed: 1.75, scoreValue: 250, color: '#00E5FF',
    wingspan: 36, length: 52, landingZoneId: 'runway-main', fuelSeconds: 48,
  },
  zeppelin: {
    type: 'zeppelin', name: 'Drift Airship', role: 'Airship mooring',
    speed: 19, turnSpeed: 1.2, scoreValue: 300, color: '#FF5CD6',
    wingspan: 42, length: 66, landingZoneId: 'mooring-m1', fuelSeconds: 78,
  },
};

export interface Point {
  x: number;
  y: number;
}

export interface AircraftInstance {
  id: string;
  type: AircraftType;
  x: number;
  y: number;
  heading: number;
  targetHeading: number;
  speed: number;
  path: Point[];
  landingCleared: boolean;
  isLanding: boolean;
  landingProgress: number;
  landingEntry?: Point;
  landingEntrySpeed?: number;
  landingEntryHeading?: number;
  /** Remaining seconds in a fuel-priority mission; undefined means no fuel timer. */
  fuelRemaining?: number;
  warningLevel: 'safe' | 'caution' | 'critical';
  landed: boolean;
  createdAt: number;
}

export interface RunwayZone {
  id: string;
  name: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  allowedTypes: AircraftType[];
  heading: number;
  headingTolerance: number;
  touchdownRadius: number;
  color: string;
  type: 'runway' | 'water' | 'helipad' | 'mooring';
}

export interface GameLevel {
  id: number;
  title: string;
  subtitle: string;
  targetLandings: number;
  spawnIntervalMs: number;
  speedMultiplier: number;
  allowedTypes: AircraftType[];
  windDirection: number;
  windSpeed: number;
  mission: MissionModifier;
  missionLabel: string;
  missionBrief: string;
  mapLayout: MapLayout;
  environmentIndex: number;
  unlockScore: number;
  achievementId: string;
  difficultyLabel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
}

const sector = (
  id: number,
  title: string,
  subtitle: string,
  targetLandings: number,
  spawnIntervalMs: number,
  speedMultiplier: number,
  allowedTypes: AircraftType[],
  mission: MissionModifier,
  missionLabel: string,
  missionBrief: string,
  mapLayout: MapLayout,
  environmentIndex: number,
  unlockScore: number,
  difficultyLabel: GameLevel['difficultyLabel'],
  windDirection = 0,
  windSpeed = 0,
): GameLevel => ({
  id, title, subtitle, targetLandings, spawnIntervalMs, speedMultiplier, allowedTypes,
  windDirection, windSpeed, mission, missionLabel, missionBrief, mapLayout,
  environmentIndex, unlockScore, achievementId: `sector_${id}`, difficultyLabel,
});

/**
 * An original 18-sector campaign. Every sector changes a live rule, a map layout,
 * or a traffic composition; it is not merely a recolored copy of another sector.
 */
export const LEVELS: GameLevel[] = [
  sector(1, 'Training Approach', 'Coastal practice field', 5, 9500, 0.82, ['jet', 'propeller', 'helicopter'], 'training', 'PRACTICE', 'Learn a safe route to the matching approach.', 'coastal', 0, 450, 'LOW'),
  sector(2, 'Crosswind Coast', 'Wind over the harbor', 6, 8800, 0.88, ['jet', 'propeller', 'helicopter', 'seaplane'], 'crosswind', 'CROSSWIND', 'Wind drifts flights downwind—start your turns early.', 'delta', 1, 650, 'LOW', Math.PI / 4, 2),
  sector(3, 'Priority Window', 'Fuel-sensitive arrivals', 7, 8200, 0.94, ['jet', 'propeller', 'seaplane', 'helicopter'], 'fuelPriority', 'FUEL PRIORITY', 'Flights carry fuel timers. Land the lowest fuel first.', 'coastal', 0, 850, 'MODERATE'),
  sector(4, 'Ridge Gateway', 'High-terrain approach', 8, 7600, 1.00, ['jet', 'propeller', 'fighter', 'helicopter'], 'mountainPass', 'RIDGE NO-FLY', 'Keep every route outside the marked terrain zone.', 'ridge', 2, 1050, 'MODERATE', Math.PI / 2, 2),
  sector(5, 'Weather Break', 'Passing weather cell', 8, 7100, 1.03, ['jet', 'propeller', 'seaplane', 'tiltrotor', 'helicopter'], 'stormCell', 'WEATHER CELL', 'Route around the moving storm cell.', 'delta', 3, 1250, 'MODERATE', -Math.PI / 3, 3),
  sector(6, 'Haze Corridor', 'Reduced radar visibility', 9, 6800, 1.06, ['jet', 'propeller', 'seaplane', 'fighter', 'helicopter'], 'lowVisibility', 'LOW VISIBILITY', 'Approach dots appear late; keep separation generous.', 'coastal', 1, 1450, 'HIGH'),
  sector(7, 'Airship Crossing', 'Mobile airspace obstruction', 9, 6400, 1.09, ['jet', 'propeller', 'tiltrotor', 'fighter', 'helicopter'], 'movingObstacle', 'MOVING OBJECT', 'Avoid the marked drifting object.', 'ridge', 2, 1650, 'HIGH', Math.PI / 6, 3),
  sector(8, 'Night Signal', 'Runway-light operations', 10, 6100, 1.12, ['jet', 'propeller', 'seaplane', 'tiltrotor', 'helicopter'], 'nightOps', 'NIGHT OPS', 'Use illuminated thresholds and keep routes deliberate.', 'delta', 3, 1850, 'HIGH', -Math.PI / 4, 3),
  sector(9, 'Fireline Response', 'Restricted coastal airspace', 10, 5900, 1.15, ['jet', 'propeller', 'seaplane', 'helicopter', 'tiltrotor'], 'wildfire', 'FIRELINE', 'The active fire zone is prohibited airspace.', 'coastal', 0, 2050, 'HIGH'),
  sector(10, 'Gale Transit', 'Stronger harbor winds', 11, 5700, 1.18, ['jet', 'propeller', 'fighter', 'cargo', 'helicopter'], 'crosswind', 'STRONG CROSSWIND', 'Heavier aircraft turn slowly in persistent wind.', 'ridge', 1, 2300, 'HIGH', Math.PI / 3, 5),
  sector(11, 'Express Relay', 'Fast and slow traffic mix', 11, 5500, 1.21, ['jet', 'propeller', 'fighter', 'supersonic', 'helicopter'], 'mixedTraffic', 'MIXED SPEEDS', 'Fast traffic can catch slow traffic—predict the crossing.', 'delta', 2, 2550, 'HIGH'),
  sector(12, 'Storm Dispatch', 'Priority arrivals through weather', 12, 5300, 1.24, ['jet', 'cargo', 'seaplane', 'tiltrotor', 'helicopter'], 'fuelPriority', 'FUEL DISPATCH', 'Fuel priority applies while traffic intensity rises.', 'coastal', 3, 2800, 'EXTREME', -Math.PI / 2, 4),
  sector(13, 'Cloudbreak', 'Rotating storm cell', 12, 5100, 1.27, ['jet', 'propeller', 'fighter', 'supersonic', 'helicopter'], 'stormCell', 'ROTATING CELL', 'The weather cell shifts across the radar—plan ahead.', 'ridge', 3, 3050, 'EXTREME', Math.PI / 5, 4),
  sector(14, 'Freight Spine', 'Wide-body transport lanes', 13, 4950, 1.30, ['jet', 'cargo', 'zeppelin', 'tiltrotor', 'helicopter'], 'movingObstacle', 'AIRSPACE OBJECT', 'Large vehicles need wide separation and clear lanes.', 'delta', 1, 3350, 'EXTREME'),
  sector(15, 'Blackout Harbor', 'Low-light emergency routing', 13, 4800, 1.33, ['jet', 'propeller', 'seaplane', 'fighter', 'helicopter', 'tiltrotor'], 'nightOps', 'BLACKOUT OPS', 'Only active runway lights define the safe approach.', 'coastal', 3, 3650, 'EXTREME', -Math.PI / 5, 4),
  sector(16, 'Ashline', 'Volcanic fire perimeter', 14, 4650, 1.36, ['jet', 'cargo', 'supersonic', 'seaplane', 'helicopter'], 'wildfire', 'ASHLINE', 'Respect the expanding prohibited perimeter.', 'ridge', 2, 4000, 'EXTREME'),
  sector(17, 'Whiteout Drift', 'Dense visibility and winds', 14, 4500, 1.39, ['jet', 'propeller', 'cargo', 'tiltrotor', 'zeppelin', 'helicopter'], 'lowVisibility', 'WHITEOUT', 'Signals surface late—use type, direction and route shape.', 'delta', 2, 4350, 'EXTREME', Math.PI / 2, 5),
  sector(18, 'Skyline Convergence', 'Final multi-role control test', 15, 4350, 1.42, ['jet', 'propeller', 'supersonic', 'seaplane', 'helicopter', 'fighter', 'cargo', 'tiltrotor', 'zeppelin'], 'mixedTraffic', 'FINAL CONVERGENCE', 'Every role is active. Keep the whole sector in view.', 'ridge', 3, 4750, 'EXTREME', -Math.PI / 3, 5),
];

export const isVerticalDestination = (runway: Pick<RunwayZone, 'type'>): boolean => (
  runway.type === 'helipad' || runway.type === 'mooring'
);

export const isVerticalAircraft = (type: AircraftType): boolean => (
  type === 'helicopter' || type === 'tiltrotor' || type === 'zeppelin'
);
