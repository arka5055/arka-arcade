export interface CloudShadow {
  x: number;
  y: number;
  radiusScale: number;
  opacity: number;
}

const CLOUDS: ReadonlyArray<Omit<CloudShadow, 'x'> & { start: number; speed: number; wrap: number; shift: number }> = [
  { start: 0.18, speed: 0.16, wrap: 1.18, shift: 0.09, y: 0.25, radiusScale: 0.29, opacity: 0.09 },
  { start: 0.82, speed: 0.11, wrap: 1.24, shift: 0.12, y: 0.54, radiusScale: 0.24, opacity: 0.075 },
  { start: 0.41, speed: 0.08, wrap: 1.15, shift: 0.07, y: 0.84, radiusScale: 0.20, opacity: 0.06 },
];

/** Returns only subtle, normalized terrain shadows; runway UI is rendered above them. */
export function getDriftingCloudShadows(phase: number): CloudShadow[] {
  const safePhase = Number.isFinite(phase) ? Math.max(0, phase) : 0;
  return CLOUDS.map((cloud) => ({
    x: (cloud.start + safePhase * cloud.speed) % cloud.wrap - cloud.shift,
    y: cloud.y,
    radiusScale: cloud.radiusScale,
    opacity: cloud.opacity,
  }));
}
