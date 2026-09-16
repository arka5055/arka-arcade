export function shouldSpawnAircraft(
  animationNowMs: number,
  lastSpawnAnimationMs: number,
  spawnIntervalMs: number,
): boolean {
  return animationNowMs - lastSpawnAnimationMs >= spawnIntervalMs;
}
