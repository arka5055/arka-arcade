import { isVerticalDestination, type RunwayZone } from '../constants/game-types';

/**
 * Keeps a visible H1/M1 guide halo at least slightly wider than the real capture radius.
 * The pulse may enlarge the cue but must never make a valid captured point appear outside it.
 */
export function getVisibleLandingGuideRadius(
  runway: RunwayZone,
  captureRadius: number,
  pulse: number,
): number {
  const animatedRadius = (runway.touchdownRadius + 10) * pulse;
  return isVerticalDestination(runway)
    ? Math.max(captureRadius + 2, animatedRadius)
    : animatedRadius;
}
