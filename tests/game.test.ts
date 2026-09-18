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
import { AIRCRAFT_PERFORMANCE, getAircraftSafetyRadius, getPerformanceOrdering } from '../lib/aircraft-performance';
import { getLandingDuration, getLandingSequence, getLandingStageAtElapsed } from '../lib/landing-sequence';
import { canCommitLanding, getPhysicalTouchdownRadius, isInsidePhysicalTouchdown } from '../lib/landing-authorization';
import { classifyTrafficConflict, getConflictColor } from '../lib/traffic-conflicts';
import { blendLandingHeading, isForwardAlongRunway } from '../lib/landing-motion';
import {
  cloneRouteSnapshot,
  hasRouteEditIntent,
  restoreRouteSnapshot,
} from '../lib/route-editing';
import { canSpawnInSector, getActiveAircraftBudget } from '../lib/traffic-director';
import { clampRadarLabel, shouldShowFlightTag } from '../lib/radar-ui';
import { RELEASE_LABEL, RELEASE_VERSION } from '../constants/release';
import {
  getCrosswindVector,
  getFuelBand,
  getMissionHazards,
  getMissionPresentation,
  isInsideMissionHazard,
  routeIntersectsMissionHazard,
} from '../lib/mission-system';
import { getCanvasPixelRatio, getVisualQuality } from '../lib/render-quality';
import { CAREER_ACHIEVEMENTS, getCampaignAchievementIds } from '../lib/campaign';

describe('Aircraft Definitions', () => {
  it('exposes the current release identifier inside the game', () => {
    expect(RELEASE_VERSION).toBe('v1.2.1');
    expect(RELEASE_LABEL).toBe('BUILD v1.2.1');
  });

  it('defines valid specifications for each aircraft class', () => {
    const types: AircraftType[] = ['jet', 'propeller', 'supersonic', 'seaplane', 'helicopter', 'fighter', 'cargo', 'tiltrotor', 'zeppelin'];
    types.forEach((t) => {
      const def = AIRCRAFT_DEFS[t];
      expect(def).toBeDefined();
      expect(def.speed).toBeGreaterThan(12);
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
      'helipad-h1': '#C86BFF',
      'mooring-m1': '#FF5CD6',
    };
    Object.values(AIRCRAFT_DEFS).forEach((aircraft) => {
      expect(aircraft.color).toBe(runwayColors[aircraft.landingZoneId]);
    });
  });

  it('keeps the aircraft classes visibly distinct in size and speed', () => {
    expect(AIRCRAFT_DEFS.helicopter.speed).toBeLessThan(AIRCRAFT_DEFS.propeller.speed);
    expect(AIRCRAFT_DEFS.propeller.speed).toBeLessThan(AIRCRAFT_DEFS.seaplane.speed);
    expect(AIRCRAFT_DEFS.seaplane.speed).toBeLessThan(AIRCRAFT_DEFS.jet.speed);
    expect(AIRCRAFT_DEFS.jet.speed).toBeLessThan(AIRCRAFT_DEFS.supersonic.speed);
    expect(AIRCRAFT_DEFS.helicopter.length).toBeLessThan(AIRCRAFT_DEFS.propeller.length);
    expect(AIRCRAFT_DEFS.propeller.length).toBeLessThan(AIRCRAFT_DEFS.seaplane.length);
    expect(AIRCRAFT_DEFS.seaplane.length).toBeLessThan(AIRCRAFT_DEFS.jet.length);
    expect(AIRCRAFT_DEFS.jet.length).toBeLessThan(AIRCRAFT_DEFS.supersonic.length);
    expect(AIRCRAFT_DEFS.seaplane.wingspan).toBeGreaterThan(AIRCRAFT_DEFS.propeller.wingspan);
    expect(AIRCRAFT_DEFS.helicopter.wingspan).toBeLessThan(AIRCRAFT_DEFS.seaplane.wingspan);
  });

  it('keeps original-inspired mixed-fleet performance classes strictly ordered', () => {
    const ordering = getPerformanceOrdering();
    expect(ordering).toEqual(['helicopter', 'zeppelin', 'propeller', 'seaplane', 'tiltrotor', 'cargo', 'jet', 'fighter', 'supersonic']);
    for (let index = 1; index < ordering.length; index += 1) {
      const slower = AIRCRAFT_PERFORMANCE[ordering[index - 1]];
      const faster = AIRCRAFT_PERFORMANCE[ordering[index]];
      expect(slower.normalizedSpeed).toBeLessThan(faster.normalizedSpeed);
    }
  });

  it('scales collision space with the aircraft footprint', () => {
    expect(getAircraftSafetyRadius('helicopter')).toBeLessThan(getAircraftSafetyRadius('propeller'));
    expect(getAircraftSafetyRadius('propeller')).toBeLessThan(getAircraftSafetyRadius('jet'));
    expect(getAircraftSafetyRadius('jet')).toBeLessThan(getAircraftSafetyRadius('supersonic'));
  });

  it('allows a flight to use exactly its assigned runway and rejects every other runway', () => {
    const runways: RunwayZone[] = [
      { id: 'runway-main', name: 'R34', startX: 0, startY: 0, endX: 0, endY: 100, allowedTypes: ['jet', 'supersonic', 'fighter'], heading: 0, headingTolerance: 1, touchdownRadius: 20, color: '#00E5FF', type: 'runway' },
      { id: 'runway-diagonal', name: 'R28', startX: 0, startY: 0, endX: 100, endY: 100, allowedTypes: ['propeller', 'cargo'], heading: 0, headingTolerance: 1, touchdownRadius: 20, color: '#FFB300', type: 'runway' },
      { id: 'water-bay', name: 'Bay', startX: 0, startY: 0, endX: 100, endY: 0, allowedTypes: ['seaplane'], heading: 0, headingTolerance: 1, touchdownRadius: 20, color: '#00E676', type: 'water' },
      { id: 'helipad-h1', name: 'H1', startX: 50, startY: 50, endX: 50, endY: 50, allowedTypes: ['helicopter', 'tiltrotor'], heading: 0, headingTolerance: Math.PI, touchdownRadius: 34, color: '#C86BFF', type: 'helipad' },
      { id: 'mooring-m1', name: 'M1', startX: 80, startY: 50, endX: 80, endY: 50, allowedTypes: ['zeppelin'], heading: 0, headingTolerance: Math.PI, touchdownRadius: 42, color: '#FF5CD6', type: 'mooring' },
    ];
    expect(getAssignedRunway('supersonic', runways)?.id).toBe('runway-main');
    expect(isAssignedRunway('supersonic', runways[1])).toBe(false);
    expect(isAssignedRunway('seaplane', runways[2])).toBe(true);
    expect(getAssignedRunway('helicopter', runways)?.id).toBe('helipad-h1');
    expect(isAssignedRunway('helicopter', runways[0])).toBe(false);
    expect(getAssignedRunway('cargo', runways)?.id).toBe('runway-diagonal');
    expect(getAssignedRunway('tiltrotor', runways)?.id).toBe('helipad-h1');
    expect(getAssignedRunway('zeppelin', runways)?.id).toBe('mooring-m1');
  });
});

describe('Radar label placement', () => {
  it('keeps labels fully inside the iPhone radar field when a target is near every edge', () => {
    const width = 420;
    const height = 760;
    const labelWidth = 92;
    const labelHeight = 17;
    const positions = [
      clampRadarLabel(-30, -20, labelWidth, width, height, labelHeight),
      clampRadarLabel(width + 30, -20, labelWidth, width, height, labelHeight),
      clampRadarLabel(-30, height + 20, labelWidth, width, height, labelHeight),
      clampRadarLabel(width + 30, height + 20, labelWidth, width, height, labelHeight),
    ];
    positions.forEach((position) => {
      expect(position.x - labelWidth / 2).toBeGreaterThanOrEqual(5);
      expect(position.x + labelWidth / 2).toBeLessThanOrEqual(width - 5);
      expect(position.y).toBeGreaterThanOrEqual(5);
      expect(position.y + labelHeight).toBeLessThanOrEqual(height - 5);
    });
  });

  it('keeps flight tags out of the central control area unless the aircraft needs attention', () => {
    expect(shouldShowFlightTag({ isSelected: false, isNearEdge: false, isLanding: false })).toBe(false);
    expect(shouldShowFlightTag({ isSelected: true, isNearEdge: false, isLanding: false })).toBe(true);
    expect(shouldShowFlightTag({ isSelected: false, isNearEdge: true, isLanding: false })).toBe(true);
    expect(shouldShowFlightTag({ isSelected: false, isNearEdge: false, isLanding: true })).toBe(true);
  });
});

describe('Game Levels Configuration', () => {
  it('contains increasing challenge across levels', () => {
    expect(LEVELS.length).toBe(18);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].targetLandings).toBeGreaterThanOrEqual(LEVELS[i - 1].targetLandings);
      expect(LEVELS[i].spawnIntervalMs).toBeLessThanOrEqual(LEVELS[i - 1].spawnIntervalMs);
      expect(LEVELS[i].speedMultiplier).toBeGreaterThanOrEqual(LEVELS[i - 1].speedMultiplier);
    }
  });

  it('gives every sector an active mission and an unlock target', () => {
    LEVELS.forEach((level, index) => {
      expect(level.missionLabel.length).toBeGreaterThan(2);
      expect(level.missionBrief.length).toBeGreaterThan(10);
      expect(level.unlockScore).toBeGreaterThan(0);
      expect(level.achievementId).toBe(`sector_${index + 1}`);
    });
    expect(new Set(LEVELS.map((level) => level.mission)).size).toBeGreaterThanOrEqual(8);
  });

  it('allows seaplanes only in later levels', () => {
    expect(LEVELS[0].allowedTypes).not.toContain('seaplane');
    expect(LEVELS[1].allowedTypes).toContain('seaplane');
  });

  it('introduces helicopters immediately with a dedicated H1 assignment', () => {
    expect(LEVELS[0].allowedTypes).toContain('helicopter');
    expect(AIRCRAFT_DEFS.helicopter.landingZoneId).toBe('helipad-h1');
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

  it('defers incoming traffic once a small-screen sector reaches its safe aircraft budget', () => {
    const active = Array.from({ length: getActiveAircraftBudget(0) }, (_, index) => ({
      id: `active-${index}`,
      type: 'jet' as const,
      x: 20,
      y: 20,
      heading: 0,
      targetHeading: 0,
      speed: 20,
      path: [],
      landingCleared: false,
      isLanding: false,
      landingProgress: 0,
      warningLevel: 'safe' as const,
      landed: false,
      createdAt: 0,
    }));
    expect(canSpawnInSector(active, 0)).toBe(false);
    expect(canSpawnInSector(active.slice(0, -1), 0)).toBe(true);
    expect(getActiveAircraftBudget(3)).toBeGreaterThan(getActiveAircraftBudget(0));
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

describe('Predictive traffic conflict warnings', () => {
  const jet = { id: 'jet-1', x: 100, y: 100, heading: 0, speed: 38, safetyRadius: 24 };

  it('identifies a close pair as a critical red turn-now conflict', () => {
    const conflict = classifyTrafficConflict(jet, { ...jet, id: 'jet-2', x: 150, heading: Math.PI });
    expect(conflict?.severity).toBe('critical');
    expect(getConflictColor(conflict!.severity)).toBe('#FF3D71');
  });

  it('raises an amber warning for converging aircraft before they are visually close', () => {
    const conflict = classifyTrafficConflict(jet, { ...jet, id: 'jet-2', x: 200, heading: Math.PI });
    expect(conflict?.severity).toBe('caution');
    expect(getConflictColor(conflict!.severity)).toBe('#FFB300');
  });

  it('does not distract the player with an alert for separating traffic', () => {
    const conflict = classifyTrafficConflict(jet, { ...jet, id: 'jet-2', x: 300, heading: 0 });
    expect(conflict).toBeNull();
  });
});

describe('Staged landing sequence', () => {
  it('shows final approach, flare, touchdown, braking and taxi rather than a short disappearance', () => {
    expect(getLandingSequence('jet', 0.08).stage).toBe('finalApproach');
    expect(getLandingSequence('jet', 0.30).stage).toBe('flare');
    expect(getLandingSequence('jet', 0.44).stage).toBe('touchdown');
    expect(getLandingSequence('jet', 0.66).stage).toBe('braking');
    expect(getLandingSequence('jet', 0.94).stage).toBe('taxiOut');
  });

  it('gives fast, large aircraft visibly more runway time than smaller aircraft', () => {
    expect(getLandingDuration('supersonic')).toBeGreaterThan(getLandingDuration('jet'));
    expect(getLandingDuration('jet')).toBeGreaterThan(getLandingDuration('propeller'));
    expect(getLandingDuration('propeller')).toBeGreaterThan(getLandingDuration('helicopter'));
  });

  it('only emits tyre smoke during the moment of touchdown', () => {
    expect(getLandingSequence('jet', 0.42).tyreSmoke).toBe(true);
    expect(getLandingSequence('jet', 0.16).tyreSmoke).toBe(false);
    expect(getLandingSequence('jet', 0.70).tyreSmoke).toBe(false);
  });

  it('uses hover approach and descent phases for helicopter H1 landings', () => {
    expect(getLandingStageAtElapsed('helicopter', 0.4).stage).toBe('hoverApproach');
    expect(getLandingStageAtElapsed('helicopter', 2.4).stage).toBe('hoverDescent');
    expect(getLandingStageAtElapsed('helicopter', 3.5).stage).toBe('helipadSettle');
  });

  it('never starts a landing just because an aircraft flies near its runway', () => {
    expect(canCommitLanding({
      landingCleared: false,
      routeComplete: true,
      insideCapture: true,
      headingDifference: 0,
      headingTolerance: 0.8,
      isHelipad: false,
    })).toBe(false);
  });

  it('requires a completed green-cleared player route before touchdown', () => {
    expect(canCommitLanding({
      landingCleared: true,
      routeComplete: true,
      insideCapture: true,
      headingDifference: 0.2,
      headingTolerance: 0.8,
      isHelipad: false,
    })).toBe(true);
    expect(canCommitLanding({
      landingCleared: true,
      routeComplete: false,
      insideCapture: true,
      headingDifference: 0.2,
      headingTolerance: 0.8,
      isHelipad: false,
    })).toBe(false);
  });

  it('uses a close physical threshold after the player has received route clearance', () => {
    const testRunway: RunwayZone = {
      id: 'threshold-test', name: 'T1', startX: 200, startY: 200, endX: 200, endY: 500,
      allowedTypes: ['jet'], heading: Math.PI / 2, headingTolerance: 0.8,
      touchdownRadius: 36, color: '#00E5FF', type: 'runway',
    };
    const physicalRadius = getPhysicalTouchdownRadius(testRunway);
    expect(physicalRadius).toBeLessThan(validateLandingRoute({ x: 200, y: 20 }, [{ x: 200, y: 196 }], testRunway).captureRadius);
    expect(isInsidePhysicalTouchdown({ x: 200, y: 200 + physicalRadius - 1 }, testRunway)).toBe(true);
    expect(isInsidePhysicalTouchdown({ x: 200, y: 200 + physicalRadius + 1 }, testRunway)).toBe(false);
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

  it('keeps a finger-drawn approach locked despite a small final touch wiggle', () => {
    const valid = validateLandingRoute(
      { x: 200, y: 40 },
      [{ x: 200, y: 110 }, { x: 200, y: 180 }, { x: 205, y: 183 }],
      runway,
    );
    expect(valid.isInsideCapture).toBe(true);
    expect(valid.isHeadingAligned).toBe(true);
    expect(valid.isOnApproachSide).toBe(true);
    expect(valid.isLocked).toBe(true);
  });

  it('locks a broad colour-matched approach gate without demanding a pixel-perfect endpoint', () => {
    const valid = validateLandingRoute(
      { x: 110, y: 20 },
      [{ x: 120, y: 35 }, { x: 145, y: 70 }],
      runway,
    );
    expect(valid.isInsideCapture).toBe(false);
    expect(valid.isInsideApproachGate).toBe(true);
    expect(valid.isHeadingAligned).toBe(true);
    expect(valid.isLocked).toBe(true);
  });

  it('exposes a large visible gate while keeping only a tiny post-threshold overshoot', () => {
    const valid = validateLandingRoute({ x: 200, y: 20 }, [{ x: 200, y: 120 }], runway);
    expect(valid.approachGateLength).toBeGreaterThan(140);
    expect(valid.approachGateHalfWidth).toBeGreaterThan(60);
    const overshot = validateLandingRoute({ x: 200, y: 20 }, [{ x: 200, y: 218 }], runway);
    expect(overshot.isOnApproachSide).toBe(false);
    expect(overshot.isLocked).toBe(false);
  });

  it('allows a forgiving endpoint just beyond the threshold without accepting a runway overshoot', () => {
    const forgiving = validateLandingRoute(
      { x: 200, y: 40 },
      [{ x: 200, y: 120 }, { x: 200, y: 212 }],
      runway,
    );
    expect(forgiving.thresholdProjection).toBe(12);
    expect(forgiving.isLocked).toBe(true);
  });

  it('does not lock a route that reaches the runway with the wrong final direction', () => {
    const invalid = validateLandingRoute(
      { x: 120, y: 200 },
      [{ x: 280, y: 200 }, { x: 204, y: 200 }],
      runway,
    );
    expect(invalid.isLocked).toBe(false);
  });

  it('does not clear a path whose end has already crossed the runway threshold', () => {
    const overshot = validateLandingRoute(
      { x: 200, y: 40 },
      [{ x: 200, y: 120 }, { x: 200, y: 222 }],
      runway,
    );
    expect(overshot.headingDifference).toBeCloseTo(0, 6);
    expect(overshot.thresholdProjection).toBeGreaterThan(4);
    expect(overshot.isLocked).toBe(false);
  });

  it('blends into the runway direction and never reverses along the landing track', () => {
    const entryHeading = 0.45;
    const runwayHeading = Math.PI / 2;
    expect(blendLandingHeading(entryHeading, runwayHeading, 0)).toBeCloseTo(entryHeading, 6);
    expect(blendLandingHeading(entryHeading, runwayHeading, 1)).toBeCloseTo(runwayHeading, 6);
    expect(isForwardAlongRunway(200, 160, 200, 198, runwayHeading)).toBe(true);
    expect(isForwardAlongRunway(200, 202, 200, 198, runwayHeading)).toBe(false);
  });

  it('locks a helicopter route when it reaches the H1 pad from any direction', () => {
    const helipad: RunwayZone = {
      id: 'helipad-h1', name: 'H1', startX: 200, startY: 200, endX: 200, endY: 200,
      allowedTypes: ['helicopter'], heading: 0, headingTolerance: Math.PI,
      touchdownRadius: 34, color: '#C86BFF', type: 'helipad',
    };
    const route = validateLandingRoute(
      { x: 320, y: 200 },
      [{ x: 260, y: 200 }, { x: 202, y: 200 }],
      helipad,
    );
    expect(route.isLocked).toBe(true);
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

  it('treats a tap as selection and restores an aborted route edit exactly', () => {
    const existingPath = [{ x: 120, y: 50 }, { x: 200, y: 100 }];
    const snapshot = cloneRouteSnapshot(existingPath, true);
    expect(hasRouteEditIntent({ x: 50, y: 50 }, { x: 58, y: 50 })).toBe(false);
    expect(hasRouteEditIntent({ x: 50, y: 50 }, { x: 65, y: 50 })).toBe(true);
    existingPath[0].x = 999;
    expect(restoreRouteSnapshot(snapshot)).toEqual({
      path: [{ x: 120, y: 50 }, { x: 200, y: 100 }],
      landingCleared: true,
    });
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


describe('Active mission system', () => {
  it('creates readable, deterministic live hazards only for relevant sectors', () => {
    const stormLevel = LEVELS.find((level) => level.mission === 'stormCell')!;
    const stormNow = getMissionHazards(stormLevel.mission, 420, 680, 0);
    const stormLater = getMissionHazards(stormLevel.mission, 420, 680, 10);
    expect(stormNow).toHaveLength(1);
    expect(stormNow[0].kind).toBe('storm');
    expect(stormLater[0].x).not.toBe(stormNow[0].x);
    expect(getMissionHazards('training', 420, 680, 0)).toEqual([]);
  });

  it('flags a player route crossing restricted terrain without modifying route points', () => {
    const hazard = getMissionHazards('mountainPass', 420, 680, 0)[0];
    const route = [{ x: 160, y: 265 }, { x: 220, y: 265 }];
    const original = JSON.parse(JSON.stringify(route));
    expect(routeIntersectsMissionHazard({ x: 90, y: 265 }, route, [hazard])?.id).toBe(hazard.id);
    expect(route).toEqual(original);
    expect(isInsideMissionHazard({ x: hazard.x, y: hazard.y }, hazard)).toBe(true);
  });

  it('limits wind effects to crosswind sectors and communicates fuel urgency predictably', () => {
    const crosswind = LEVELS.find((level) => level.mission === 'crosswind')!;
    const calm = LEVELS.find((level) => level.mission === 'training')!;
    expect(Math.hypot(getCrosswindVector(crosswind, 1).x, getCrosswindVector(crosswind, 1).y)).toBeGreaterThan(0);
    expect(getCrosswindVector(calm, 1)).toEqual({ x: 0, y: 0 });
    expect(getFuelBand(40)).toBe('normal');
    expect(getFuelBand(20)).toBe('caution');
    expect(getFuelBand(10)).toBe('critical');
    expect(getMissionPresentation(crosswind).windDrift).toBeGreaterThan(0);
  });
});

describe('Campaign rewards and canvas quality', () => {
  it('awards sector and mission achievements without requiring external accounts', () => {
    const priorityIndex = LEVELS.findIndex((level) => level.mission === 'fuelPriority');
    const achievementIds = getCampaignAchievementIds(priorityIndex);
    expect(achievementIds).toContain(`sector_${priorityIndex + 1}`);
    expect(achievementIds).toContain('fuel_guardian');
    expect(CAREER_ACHIEVEMENTS.some((achievement) => achievement.id === 'campaign_complete')).toBe(true);
  });

  it('caps retina render density and trims cosmetic work before control responsiveness', () => {
    expect(getCanvasPixelRatio(3)).toBe(2);
    expect(getCanvasPixelRatio(1.5)).toBe(1.5);
    expect(getCanvasPixelRatio(undefined)).toBe(1);
    expect(getVisualQuality(3)).toBe('high');
    expect(getVisualQuality(6)).toBe('balanced');
    expect(getVisualQuality(8)).toBe('focused');
  });
});
