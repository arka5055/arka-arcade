export type AircraftType = 'jet' | 'propeller' | 'supersonic' | 'seaplane' | 'helicopter';

export interface AircraftConfig {
  type: AircraftType;
  name: string;
  speed: number;
  turnSpeed: number;
  scoreValue: number;
  color: string;
  wingspan: number;
  length: number;
  landingZoneId: string; // 'runway-north' | 'runway-diagonal' | 'water'
  fuelSeconds?: number;
}

export const AIRCRAFT_DEFS: Record<AircraftType, AircraftConfig> = {
  jet: {
    type: 'jet',
    name: 'Commercial Jet',
    speed: 38,
    turnSpeed: 2.25,
    scoreValue: 100,
    color: '#00E5FF', // Cyan / Light Blue
    wingspan: 40,
    length: 44,
    landingZoneId: 'runway-main',
  },
  propeller: {
    type: 'propeller',
    name: 'Cessna Commuter',
    speed: 23,
    turnSpeed: 3.0,
    scoreValue: 150,
    color: '#FFB300', // Amber
    wingspan: 20,
    length: 17,
    landingZoneId: 'runway-diagonal',
  },
  supersonic: {
    type: 'supersonic',
    name: 'Concorde Express',
    speed: 48,
    turnSpeed: 1.75,
    scoreValue: 250,
    color: '#00E5FF', // Same cyan as Runway 34
    wingspan: 36,
    length: 52,
    landingZoneId: 'runway-main',
  },
  seaplane: {
    type: 'seaplane',
    name: 'Lagoon Seaplane',
    speed: 28,
    turnSpeed: 2.65,
    scoreValue: 180,
    color: '#00E676', // Emerald Green
    wingspan: 30,
    length: 28,
    landingZoneId: 'water-bay',
  },
  helicopter: {
    type: 'helicopter',
    name: 'Rescue Helicopter',
    speed: 15,
    turnSpeed: 3.8,
    scoreValue: 200,
    color: '#C86BFF', // Violet, matches Helipad H1
    wingspan: 22, // Rotor diameter
    length: 14,
    landingZoneId: 'helipad-h1',
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
  heading: number; // in radians
  targetHeading: number;
  speed: number;
  path: Point[];
  landingCleared: boolean;
  isLanding: boolean;
  landingProgress: number; // 0 to 1
  /** Captures the moment final landing control begins so approach blends continuously into the threshold. */
  landingEntry?: Point;
  landingEntrySpeed?: number;
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
  heading: number; // optimal landing heading in radians
  headingTolerance: number; // e.g. 0.7 rad (~40 deg)
  touchdownRadius: number; // entry gate radius
  color: string;
  type: 'runway' | 'water' | 'helipad';
}

export interface GameLevel {
  id: number;
  title: string;
  targetLandings: number;
  spawnIntervalMs: number;
  speedMultiplier: number;
  allowedTypes: AircraftType[];
  windDirection: number; // radians
  windSpeed: number; // 0 to 10
}

export const LEVELS: GameLevel[] = [
  {
    id: 1,
    title: 'Training Approach',
    targetLandings: 6,
    spawnIntervalMs: 9000,
    speedMultiplier: 0.85,
    allowedTypes: ['jet', 'propeller', 'helicopter'],
    windDirection: 0,
    windSpeed: 0,
  },
  {
    id: 2,
    title: 'Coastal Crosswind',
    targetLandings: 12,
    spawnIntervalMs: 7600,
    speedMultiplier: 1.0,
    allowedTypes: ['jet', 'propeller', 'seaplane', 'helicopter'],
    windDirection: Math.PI / 4,
    windSpeed: 2,
  },
  {
    id: 3,
    title: 'Peak Rush Hour',
    targetLandings: 20,
    spawnIntervalMs: 6200,
    speedMultiplier: 1.15,
    allowedTypes: ['jet', 'propeller', 'supersonic', 'seaplane', 'helicopter'],
    windDirection: Math.PI / 2,
    windSpeed: 4,
  },
  {
    id: 4,
    title: 'Superstorm Radar',
    targetLandings: 30,
    spawnIntervalMs: 5000,
    speedMultiplier: 1.3,
    allowedTypes: ['jet', 'propeller', 'supersonic', 'seaplane', 'helicopter'],
    windDirection: -Math.PI / 3,
    windSpeed: 6,
  },
];
