import type { AircraftType } from '@/constants/game-types';

export type LandingStage = 'finalApproach' | 'flare' | 'touchdown' | 'braking' | 'taxiOut' | 'hoverApproach' | 'hoverDescent' | 'helipadSettle';

export interface LandingSequence {
  stage: LandingStage;
  /** Blend from the live capture point to the runway threshold / helipad center. */
  approachBlend: number;
  /** Progress along a runway or water lane after the touchdown threshold. */
  runwayProgress: number;
  /** Maintains believable deceleration without stopping the animation abruptly. */
  speedFactor: number;
  /** Screen-space altitude cue used to separate aircraft from its ground shadow. */
  altitude: number;
  gearDown: boolean;
  tyreSmoke: boolean;
  brakeGlow: boolean;
  label: string;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/**
 * Landing duration is intentionally long enough to show an actual touchdown and rollout.
 * Heavier or faster aircraft need visibly more runway time; a helicopter uses hover descent.
 */
export function getLandingDuration(type: AircraftType): number {
  switch (type) {
    case 'helicopter': return 3.8;
    case 'propeller': return 4.8;
    case 'seaplane': return 5.2;
    case 'jet': return 5.8;
    case 'supersonic': return 6.4;
  }
}

/** Maps a normalized landing timer to readable, physically-inspired touchdown stages. */
export function getLandingSequence(type: AircraftType, progress: number): LandingSequence {
  const t = clamp01(progress);

  if (type === 'helicopter') {
    if (t < 0.48) {
      const phase = smoothstep(t / 0.48);
      return {
        stage: 'hoverApproach', approachBlend: phase, runwayProgress: 0,
        speedFactor: 1 - phase * 0.48, altitude: 12 * (1 - phase),
        gearDown: true, tyreSmoke: false, brakeGlow: false, label: 'HOVER APPROACH',
      };
    }
    if (t < 0.8) {
      const phase = smoothstep((t - 0.48) / 0.32);
      return {
        stage: 'hoverDescent', approachBlend: 1, runwayProgress: 0,
        speedFactor: 0.32 * (1 - phase), altitude: 4 * (1 - phase),
        gearDown: true, tyreSmoke: false, brakeGlow: false, label: 'H1 DESCENT',
      };
    }
    return {
      stage: 'helipadSettle', approachBlend: 1, runwayProgress: 0,
      speedFactor: 0, altitude: 0, gearDown: true, tyreSmoke: false,
      brakeGlow: false, label: 'H1 SECURED',
    };
  }

  if (t < 0.24) {
    const phase = smoothstep(t / 0.24);
    return {
      stage: 'finalApproach', approachBlend: phase, runwayProgress: 0,
      speedFactor: 0.72 - phase * 0.16, altitude: 12 * (1 - phase),
      gearDown: true, tyreSmoke: false, brakeGlow: false, label: 'FINAL APPROACH',
    };
  }
  if (t < 0.37) {
    const phase = smoothstep((t - 0.24) / 0.13);
    return {
      stage: 'flare', approachBlend: 1, runwayProgress: phase * 0.035,
      speedFactor: 0.56 - phase * 0.14, altitude: 3.5 * (1 - phase),
      gearDown: true, tyreSmoke: false, brakeGlow: false, label: 'FLARE',
    };
  }
  if (t < 0.53) {
    const phase = smoothstep((t - 0.37) / 0.16);
    return {
      stage: 'touchdown', approachBlend: 1, runwayProgress: 0.035 + phase * 0.13,
      speedFactor: 0.42 - phase * 0.12, altitude: 0,
      gearDown: true, tyreSmoke: phase < 0.7, brakeGlow: false, label: 'TOUCHDOWN',
    };
  }
  if (t < 0.86) {
    const phase = easeOutCubic((t - 0.53) / 0.33);
    return {
      stage: 'braking', approachBlend: 1, runwayProgress: 0.165 + phase * 0.66,
      speedFactor: 0.3 - phase * 0.19, altitude: 0,
      gearDown: true, tyreSmoke: false, brakeGlow: true, label: 'BRAKING',
    };
  }

  const phase = smoothstep((t - 0.86) / 0.14);
  return {
    stage: 'taxiOut', approachBlend: 1, runwayProgress: 0.825 + phase * 0.175,
    speedFactor: 0.11 - phase * 0.05, altitude: 0,
    gearDown: true, tyreSmoke: false, brakeGlow: false, label: 'TAXI OUT',
  };
}

/** Evaluates a displayed landing without using frame time, keeping it deterministic in tests. */
export function getLandingStageAtElapsed(type: AircraftType, elapsedSeconds: number): LandingSequence {
  return getLandingSequence(type, elapsedSeconds / getLandingDuration(type));
}
