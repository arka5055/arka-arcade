/**
 * Caps retina backing-store density at 2×. Tactical labels remain sharp without turning
 * a busy iPhone PWA canvas into a battery-heavy 3× render target.
 */
export function getCanvasPixelRatio(devicePixelRatio: number | undefined): number {
  if (!Number.isFinite(devicePixelRatio) || !devicePixelRatio || devicePixelRatio < 1) return 1;
  return Math.min(2, Math.max(1, devicePixelRatio));
}

/** Reduces cosmetic work before an overloaded sector compromises touch responsiveness. */
export function getVisualQuality(activeAircraft: number): 'high' | 'balanced' | 'focused' {
  if (activeAircraft >= 8) return 'focused';
  if (activeAircraft >= 5) return 'balanced';
  return 'high';
}
