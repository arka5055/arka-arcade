import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DEFS, LEVELS, AircraftType } from '../constants/game-types';
import { shouldSpawnAircraft } from '../lib/game-timing';

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
