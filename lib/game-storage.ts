import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GameStats {
  highScore: number;
  topScores: number[];
  lastScore: number;
  totalLandings: number;
  bestCombo: number;
  gamesPlayed: number;
  unlockedLevels: number;
  highestSectorCompleted: number;
  achievements: string[];
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
};

export async function loadGameStats(): Promise<GameStats> {
  try {
    const data = await AsyncStorage.getItem(STATS_KEY);
    if (data) {
      return { ...DEFAULT_STATS, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load stats', e);
  }
  return DEFAULT_STATS;
}

export async function saveGameStats(stats: GameStats): Promise<void> {
  try {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to save stats', e);
  }
}
