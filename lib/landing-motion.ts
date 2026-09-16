/** Returns the shortest signed rotation from one heading to another. */
function signedAngleDifference(from: number, to: number): number {
  let difference = to - from;
  while (difference < -Math.PI) difference += Math.PI * 2;
  while (difference > Math.PI) difference -= Math.PI * 2;
  return difference;
}

/**
 * Keeps an aircraft's nose moving continuously through final approach instead of
 * instantly snapping to runway heading, which can make the sprite appear to reverse.
 */
export function blendLandingHeading(entryHeading: number, runwayHeading: number, approachBlend: number): number {
  const blend = Math.max(0, Math.min(1, approachBlend));
  return entryHeading + signedAngleDifference(entryHeading, runwayHeading) * blend;
}

/** Ensures the landing path always advances in its intended travel direction. */
export function isForwardAlongRunway(
  previousX: number,
  previousY: number,
  nextX: number,
  nextY: number,
  runwayHeading: number,
): boolean {
  const travelX = Math.cos(runwayHeading);
  const travelY = Math.sin(runwayHeading);
  return (nextX - previousX) * travelX + (nextY - previousY) * travelY >= -0.001;
}
