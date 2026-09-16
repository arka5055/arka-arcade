export interface FixedStepResult {
  steps: number;
  remainder: number;
}

/** Caps render density to keep iPhone Safari within a stable GPU fill-rate budget. */
export function getRenderPixelRatio(devicePixelRatio: number): number {
  return Math.max(1, Math.min(2, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
}

/**
 * Advances deterministic gameplay at 60 Hz while allowing display rendering to run
 * at Safari's available refresh rate. The small step cap avoids a catch-up spiral.
 */
export function consumeFixedSteps(
  accumulatedSeconds: number,
  elapsedSeconds: number,
  stepSeconds = 1 / 60,
  maximumSteps = 6,
): FixedStepResult {
  let remainder = accumulatedSeconds + Math.max(0, Math.min(elapsedSeconds, 0.1));
  let steps = 0;
  while (remainder >= stepSeconds && steps < maximumSteps) {
    remainder -= stepSeconds;
    steps += 1;
  }
  if (steps === maximumSteps) remainder = Math.min(remainder, stepSeconds);
  return { steps, remainder };
}
