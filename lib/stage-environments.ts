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
    tint: 'rgba(3, 15, 24, 0.38)',
    terrainTint: '#102d28',
  },
  {
    id: 'crosswind-coast',
    label: 'CROSSWIND COAST',
    sceneUrl: '/scenery/crosswind-coast.jpg',
    tint: 'rgba(4, 19, 28, 0.44)',
    terrainTint: '#163c37',
  },
  {
    id: 'alpine-peak',
    label: 'ALPINE PEAK SECTOR',
    sceneUrl: '/scenery/peak-rush-hour.jpg',
    tint: 'rgba(12, 22, 38, 0.44)',
    terrainTint: '#293a35',
  },
  {
    id: 'night-superstorm',
    label: 'SUPERSTORM RADAR',
    sceneUrl: '/scenery/superstorm-radar.jpg',
    tint: 'rgba(5, 7, 22, 0.50)',
    terrainTint: '#1a253d',
  },
];

export function getStageEnvironment(levelIndex: number): StageEnvironment {
  return STAGE_ENVIRONMENTS[Math.min(Math.max(levelIndex, 0), STAGE_ENVIRONMENTS.length - 1)];
}

/** Escalates a stage gently as successful landings accumulate, avoiding sudden difficulty spikes. */
export function getTrafficPressure(landings: number, targetLandings: number): number {
  if (targetLandings <= 0) return 1;
  const progress = Math.min(Math.max(landings / targetLandings, 0), 1);
  return 1 + progress * 0.16;
}

export function getDynamicSpawnInterval(baseIntervalMs: number, pressure: number): number {
  return Math.round(baseIntervalMs / Math.max(pressure, 1));
}
