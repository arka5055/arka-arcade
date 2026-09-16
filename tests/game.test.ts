import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DEFS, LEVELS, AircraftType, RunwayZone } from '../constants/game-types';
import { shouldSpawnAircraft } from '../lib/game-timing';
import {
  distanceToLineSegment,
  getApproachEntry,
  isInsideAutoLandingCapture,
} from '../lib/approach-routing';
import { preservePlayerDrawnRoute } from '../lib/player-routing';
import { getDriftingCloudShadows } from '../lib/scenery-effects';
import { validateLandingRoute } from '../lib/landing-route-validation';
import {
  getDynamicSpawnInterval,
  getStageEnvironment,
  getTrafficPressure,
  STAGE_ENVIRONMENTS,
} from '../lib/stage-environments';
import { createCrashEffect, getCrashProgress } from '../lib/crash-effects';
import { getAssignedRunway, isAssignedRunway } from '../lib/runway-assignment';

describe('Aircraft Definitions', () => {
  it('defines valid specifications for each aircraft class', () => {
    const types: AircraftType[] = ['jet', 'propeller', 'supersonic', 'seaplane'];
    types.forEach((t) => {
      const def = AIRCRAFT_DEFS[t];
      expect(def).toBeDefined();
      expect(def.speed).toBeGreaterThan(20);
      expect(def.turnSpeed).toBeGreaterThan(1);
      expect(def.scoreValue).toBeGreaterThan(50);
      expect(def.color).toMatch(/^#/);
    });
  });

  it('verifies supersonic is faster than propeller', () => {
    expect(AIRCRAFT_DEFS.supersonic.speed).toBeGreaterThan(AIRCRAFT_DEFS.propeller.speed);
  });

  it('keeps every aircraft at a touch-friendly speed', () => {
    Object.values(AIRCRAFT_DEFS).forEach((aircraft) => {
      expect(aircraft.speed).toBeLessThanOrEqual(50);
    });
  });

  it('matches every aircraft livery to its one assigned runway color', () => {
    const runwayColors: Record<string, string> = {
      'runway-main': '#00E5FF',
      'runway-diagonal': '#FFB300',
      'water-bay': '#00E676',
    };
    Object.values(AIRCRAFT_DEFS).forEach((aircraft) => {
      expect(aircraft.color).toBe(runwayColors[aircraft.landingZoneId]);
    });
  });

  it('keeps the aircraft classes visibly distinct in size and speed', () => {
    expect(AIRCRAFT_DEFS.supersonic.speed).toBeGreaterThan(AIRCRAFT_DEFS.jet.speed);
    expect(AIRCRAFT_DEFS.jet.length).toBeGreaterThan(AIRCRAFT_DEFS.propeller.length);
    expect(AIRCRAFT_DEFS.seaplane.wingspan).toBeGreaterThan(AIRCRAFT_DEFS.propeller.wingspan);
  });

  it('allows a flight to use exactly its assigned runway and rejects every other runway', () => {
    const runways: RunwayZone[] = [
      { id: 'runway-main', name: 'R34', startX: 0, startY: 0, endX: 0, endY: 100, allowedTypes: ['jet', 'supersonic'], heading: 0, headingTolerance: 1, touchdownRadius: 20, color: '#00E5FF', type: 'runway' },
      { id: 'runway-diagonal', name: 'R28', startX: 0, startY: 0, endX: 100, endY: 100, allowedTypes: ['propeller'], heading: 0, headingTolerance: 1, touchdownRadius: 20, color: '#FFB300', type: 'runway' },
      { id: 'water-bay', name: 'Bay', startX: 0, startY: 0, endX: 100, endY: 0, allowedTypes: ['seaplane'], heading: 0, headingTolerance: 1, touchdownRadius: 20, color: '#00E676', type: 'water' },
    ];
    expect(getAssignedRunway('supersonic', runways)?.id).toBe('runway-main');
    expect(isAssignedRunway('supersonic', runways[1])).toBe(false);
    expect(isAssignedRunway('seaplane', runways[2])).toBe(true);
  });
});

describe('Game Levels Configuration', () => {
  it('contains increasing challenge across levels', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].targetLandings).toBeGreaterThan(LEVELS[i - 1].targetLandings);
      expect(LEVELS[i].spawnIntervalMs).toBeLessThanOrEqual(LEVELS[i - 1].spawnIntervalMs);
      expect(LEVELS[i].speedMultiplier).toBeGreaterThanOrEqual(LEVELS[i - 1].speedMultiplier);
    }
  });

  it('allows seaplanes only in later levels', () => {
    expect(LEVELS[0].allowedTypes).not.toContain('seaplane');
    expect(LEVELS[1].allowedTypes).toContain('seaplane');
  });

  it('gives the training level enough time between aircraft', () => {
    expect(LEVELS[0].spawnIntervalMs).toBeGreaterThanOrEqual(8000);
  });
});

describe('Spawn scheduler', () => {
  it('spawns a new aircraft when the animation clock reaches the interval', () => {
    expect(shouldSpawnAircraft(9_000, 0, 9_000)).toBe(true);
    expect(shouldSpawnAircraft(8_999, 0, 9_000)).toBe(false);
  });

  it('works with animation-clock values rather than wall-clock epoch values', () => {
    expect(shouldSpawnAircraft(18_100, 9_000, 9_000)).toBe(true);
  });
});

describe('Stage environments and progressive pressure', () => {
  it('assigns a different cached landscape to every gameplay stage', () => {
    expect(STAGE_ENVIRONMENTS).toHaveLength(4);
    expect(new Set(STAGE_ENVIRONMENTS.map((environment) => environment.sceneUrl)).size).toBe(4);
    expect(getStageEnvironment(3).label).toContain('SUPERSTORM');
  });

  it('gently increases traffic pressure and reduces the spawn interval as a sector progresses', () => {
    const initial = getTrafficPressure(0, 12);
    const lateSector = getTrafficPressure(12, 12);
    expect(initial).toBe(1);
    expect(lateSector).toBeGreaterThan(initial);
    expect(getDynamicSpawnInterval(7600, lateSector)).toBeLessThan(7600);
  });
});

describe('Collision feedback', () => {
  it('creates a cinematic but bounded visual collision sequence', () => {
    const crash = createCrashEffect(150, 220);
    expect(crash.fragments).toHaveLength(18);
    expect(crash.duration).toBeGreaterThan(1);
    expect(getCrashProgress(crash)).toBe(0);
    crash.elapsed = crash.duration * 2;
    expect(getCrashProgress(crash)).toBe(1);
  });
});

describe('Assisted runway approach', () => {
  const runway = {
    id: 'test-runway',
    name: 'Test',
    startX: 200,
    startY: 200,
    endX: 200,
    endY: 500,
    allowedTypes: ['jet'] as AircraftType[],
    heading: Math.PI / 2,
    headingTolerance: 0.8,
    touchdownRadius: 36,
    color: '#00E5FF',
    type: 'runway' as const,
  };

  it('places the approach entry behind the threshold on the runway centreline', () => {
    const entry = getApproachEntry(runway, 120);
    expect(entry.x).toBeCloseTo(200, 5);
    expect(entry.y).toBeCloseTo(80, 5);
  });

  it('uses a generous landing capture zone to avoid precision circling', () => {
    expect(isInsideAutoLandingCapture({ x: 200, y: 270 }, runway)).toBe(true);
    expect(isInsideAutoLandingCapture({ x: 200, y: 300 }, runway)).toBe(false);
  });

  it('locks a player-drawn route only when its final segment reaches the threshold in runway direction', () => {
    const valid = validateLandingRoute(
      { x: 200, y: 40 },
      [{ x: 200, y: 120 }, { x: 200, y: 196 }],
      runway,
    );
    expect(valid.isLocked).toBe(true);
    expect(valid.endpointDistance).toBeLessThanOrEqual(valid.captureRadius);
  });

  it('does not lock a route that reaches the runway with the wrong final direction', () => {
    const invalid = validateLandingRoute(
      { x: 120, y: 200 },
      [{ x: 280, y: 200 }, { x: 204, y: 200 }],
      runway,
    );
    expect(invalid.isLocked).toBe(false);
  });

  it('excludes the near-aircraft pickup points from a straight player route', () => {
    const aircraft = { x: 50, y: 50 };
    const drawing = [{ x: 51, y: 50 }, { x: 76, y: 50 }, { x: 100, y: 50 }, { x: 150, y: 50 }];
    const route = preservePlayerDrawnRoute(aircraft, drawing);
    expect(route).toEqual(drawing.slice(2));
    expect(route[0].y).toBe(50);
    expect(route).not.toContainEqual({ x: 200, y: 80 });
    expect(preservePlayerDrawnRoute(aircraft, [{ x: 52, y: 50 }])).toEqual([]);
  });

  it('does not mutate the stored player drawing while creating a flight route', () => {
    const aircraft = { x: 10, y: 10 };
    const drawing = [{ x: 16, y: 10 }, { x: 60, y: 80 }, { x: 120, y: 140 }];
    const original = JSON.parse(JSON.stringify(drawing));
    const route = preservePlayerDrawnRoute(aircraft, drawing);
    route[0].x = 999;
    expect(drawing).toEqual(original);
  });

  it('recognizes a touch near an active route line for redrawing', () => {
    expect(distanceToLineSegment({ x: 50, y: 8 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(8);
    expect(distanceToLineSegment({ x: 50, y: 40 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeGreaterThan(26);
  });
});

describe('Scenery cloud shadows', () => {
  it('keeps cloud shadows subtle and normalized for every mobile board size', () => {
    const shadows = getDriftingCloudShadows(0.5);
    expect(shadows).toHaveLength(3);
    shadows.forEach((shadow) => {
      expect(shadow.opacity).toBeLessThanOrEqual(0.1);
      expect(shadow.radiusScale).toBeLessThan(0.3);
      expect(shadow.y).toBeGreaterThan(0);
      expect(shadow.y).toBeLessThan(1);
    });
  });

  it('moves clouds over time while retaining a finite safe layout', () => {
    const initial = getDriftingCloudShadows(0);
    const later = getDriftingCloudShadows(1);
    expect(later[0].x).not.toBe(initial[0].x);
    expect(getDriftingCloudShadows(Number.NaN).every((shadow) => Number.isFinite(shadow.x))).toBe(true);
  });
});
