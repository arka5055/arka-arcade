export interface StageEnvironment {
  id: string;
  label: string;
  sceneUrl: string;
  tint: string;
  terrainTint: string;
}

export const STAGE_ENVIRONMENTS: readonly StageEnvironment[] = [
  {
    id: 'coastal-training',
    label: 'COASTAL TRAINING FIELD',
    sceneUrl: '/scenery/airport.jpg',
    tint: 'rgba(210, 232, 236, 0.08)',
    terrainTint: '#3d8a6c',
  },
  {
    id: 'crosswind-coast',
    label: 'CROSSWIND COAST',
    sceneUrl: '/scenery/crosswind-coast.jpg',
    tint: 'rgba(186, 224, 230, 0.10)',
    terrainTint: '#3b7f72',
  },
  {
    id: 'alpine-peak',
    label: 'ALPINE PEAK SECTOR',
    sceneUrl: '/scenery/peak-rush-hour.jpg',
    tint: 'rgba(198, 214, 226, 0.12)',
    terrainTint: '#5a7a62',
  },
  {
    id: 'night-superstorm',
    label: 'SUPERSTORM RADAR',
    sceneUrl: '/scenery/superstorm-radar.jpg',
    tint: 'rgba(8, 16, 38, 0.28)',
    terrainTint: '#24344c',
  },
];

export function getStageEnvironment(levelIndex: number): StageEnvironment {
  return STAGE_ENVIRONMENTS[Math.min(Math.max(levelIndex, 0), STAGE_ENVIRONMENTS.length - 1)];
}

/** Escalates a stage as landings accumulate. After the star, pressure keeps rising. */
export function getTrafficPressure(landings: number, targetLandings: number): number {
  if (targetLandings <= 0) return 1;
  const progress = Math.max(landings / targetLandings, 0);
  return 1 + Math.min(progress, 2.6) * 0.22;
}

export function getDynamicSpawnInterval(baseIntervalMs: number, pressure: number): number {
  return Math.round(baseIntervalMs / Math.max(pressure, 1));
}
