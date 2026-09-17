import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GameStats {
  highScore: number;
  topScores: number[];
  lastScore: number;
  totalLandings: number;
  bestCombo: number;
  gamesPlayed: number;
  /** One-based number of sectors currently selectable in the campaign map. */
  unlockedLevels: number;
  highestSectorCompleted: number;
  achievements: string[];
  /** One-based identifiers of every sector cleared at least once. */
  completedSectors: number[];
  /** Best session score for each one-based sector identifier. */
  sectorBestScores: Record<string, number>;
  completedMissions: string[];
}

const STATS_KEY = '@skyline_signal_stats_v1';

export const DEFAULT_STATS: GameStats = {
  highScore: 0,
  topScores: [],
  lastScore: 0,
  totalLandings: 0,
  bestCombo: 0,
  gamesPlayed: 0,
  unlockedLevels: 1,
  highestSectorCompleted: 0,
  achievements: [],
  completedSectors: [],
  sectorBestScores: {},
  completedMissions: [],
};

/** Maintains backward compatibility with career records stored before campaign v1.2.0. */
function normalizeStats(raw: Partial<GameStats>): GameStats {
  return {
    ...DEFAULT_STATS,
    ...raw,
    topScores: Array.isArray(raw.topScores) ? raw.topScores.filter(Number.isFinite).slice(0, 3) : [],
    achievements: Array.isArray(raw.achievements) ? raw.achievements.filter((value): value is string => typeof value === 'string') : [],
    completedSectors: Array.isArray(raw.completedSectors)
      ? raw.completedSectors.filter((value): value is number => Number.isInteger(value) && value > 0)
      : [],
    completedMissions: Array.isArray(raw.completedMissions)
      ? raw.completedMissions.filter((value): value is string => typeof value === 'string')
      : [],
    sectorBestScores: raw.sectorBestScores && typeof raw.sectorBestScores === 'object'
      ? Object.fromEntries(Object.entries(raw.sectorBestScores).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)))
      : {},
  };
}

export async function loadGameStats(): Promise<GameStats> {
  try {
    const data = await AsyncStorage.getItem(STATS_KEY);
    if (data) return normalizeStats(JSON.parse(data) as Partial<GameStats>);
  } catch (error) {
    console.error('Failed to load stats', error);
  }
  return DEFAULT_STATS;
}

export async function saveGameStats(stats: GameStats): Promise<void> {
  try {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(normalizeStats(stats)));
  } catch (error) {
    console.error('Failed to save stats', error);
  }
}
