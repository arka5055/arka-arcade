import { LEVELS } from '../constants/game-types';

export interface CareerAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export const CAREER_ACHIEVEMENTS: readonly CareerAchievement[] = [
  { id: 'land_10', title: 'First Watch', description: 'Land 10 aircraft safely', icon: '🎖️' },
  { id: 'land_50', title: 'Sector Veteran', description: 'Land 50 aircraft safely', icon: '🏆' },
  { id: 'combo_5', title: 'Rapid Sequence', description: 'Achieve a 5x landing combo', icon: '⚡' },
  { id: 'score_1000', title: 'High Altitude Ace', description: 'Score 1,000+ points in a session', icon: '🌟' },
  { id: 'fuel_guardian', title: 'Fuel Guardian', description: 'Clear a fuel-priority sector', icon: '⛽' },
  { id: 'weather_reader', title: 'Weather Reader', description: 'Clear a weather-cell sector', icon: '⛈️' },
  { id: 'night_controller', title: 'Night Controller', description: 'Clear a night-operations sector', icon: '🌙' },
  { id: 'campaign_complete', title: 'Skyline Commander', description: 'Clear all 18 sectors', icon: '🛫' },
];

export function getSectorAchievement(levelIndex: number): CareerAchievement {
  const level = LEVELS[levelIndex];
  return {
    id: level.achievementId,
    title: `Sector ${level.id} Cleared`,
    description: `${level.title} completed`,
    icon: '✅',
  };
}

export function getCampaignAchievementIds(levelIndex: number): string[] {
  const level = LEVELS[levelIndex];
  const ids = [level.achievementId];
  if (level.mission === 'fuelPriority') ids.push('fuel_guardian');
  if (level.mission === 'stormCell') ids.push('weather_reader');
  if (level.mission === 'nightOps') ids.push('night_controller');
  if (levelIndex === LEVELS.length - 1) ids.push('campaign_complete');
  return ids;
}
