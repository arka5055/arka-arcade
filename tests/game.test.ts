import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DEFS, LEVELS, AircraftType } from '../constants/game-types';
import { shouldSpawnAircraft } from '../lib/game-timing';
import {
  distanceToLineSegment,
  getApproachEntry,
  isInsideAutoLandingCapture,
} from '../lib/approach-routing';
import { preservePlayerDrawnRoute } from '../lib/player-routing';
import { getDriftingCloudShadows } from '../lib/scenery-effects';

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

  it('keeps every player-drawn steering point without adding automatic approach points', () => {
    const drawing = [{ x: 50, y: 50 }, { x: 100, y: 150 }, { x: 160, y: 125 }, { x: 200, y: 200 }];
    const route = preservePlayerDrawnRoute(drawing);
    expect(route).toEqual(drawing.slice(1));
    expect(route).not.toContainEqual({ x: 200, y: 80 });
    expect(preservePlayerDrawnRoute([{ x: 50, y: 50 }])).toEqual([]);
  });

  it('does not mutate the stored player drawing while creating a flight route', () => {
    const drawing = [{ x: 10, y: 10 }, { x: 40, y: 80 }, { x: 120, y: 140 }];
    const original = JSON.parse(JSON.stringify(drawing));
    const route = preservePlayerDrawnRoute(drawing);
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
