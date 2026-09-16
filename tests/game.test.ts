import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DEFS, LEVELS, AircraftType } from '../constants/game-types';

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
