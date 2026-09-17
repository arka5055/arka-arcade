import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { AirTrafficCanvas } from '@/components/AirTrafficCanvas';
import {
  AircraftType,
  AIRCRAFT_DEFS,
  LEVELS,
  GameLevel,
} from '@/constants/game-types';
import { sounds } from '@/lib/sound-controller';
import { loadGameStats, saveGameStats, GameStats, DEFAULT_STATS } from '@/lib/game-storage';
import * as Haptics from 'expo-haptics';
import { RELEASE_VERSION } from '@/constants/release';

export default function GameScreen() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [landings, setLandings] = useState(0);
  const [combo, setCombo] = useState(0);
  const [runId, setRunId] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [stats, setStats] = useState<GameStats>(DEFAULT_STATS);

  // Modals
  const [showGameOver, setShowGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState('');
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);

  const comboTimerRef = useRef<any>(null);
  const authoritativeScoreRef = useRef(0);

  const currentLevel: GameLevel = LEVELS[levelIndex] || LEVELS[0];
  const trafficLoad = ['LOW', 'MODERATE', 'HIGH', 'EXTREME'][levelIndex] || 'EXTREME';
  const legendItems: Array<{ type: AircraftType; color: string; label: string }> = [
    { type: 'jet' as AircraftType, color: '#00E5FF', label: 'JET / SST → R34' },
    { type: 'propeller' as AircraftType, color: '#FFB300', label: 'PROP → R28' },
    { type: 'seaplane' as AircraftType, color: '#00E676', label: 'SEA → BAY' },
    { type: 'helicopter' as AircraftType, color: '#C86BFF', label: 'HELI → H1' },
  ].filter((item) => currentLevel.allowedTypes.includes(item.type));

  useEffect(() => {
    loadGameStats().then(setStats);
  }, []);

  const handlePlaneLanded = useCallback(
    (type: AircraftType, scoreGain: number, totalLandings: number) => {
      setCombo((prevCombo) => {
        const nextCombo = prevCombo + 1;
        const comboMultiplier = 1 + Math.min(nextCombo * 0.1, 1.5);
        const finalGain = Math.round(scoreGain * comboMultiplier);
        const nextScore = authoritativeScoreRef.current + finalGain;
        authoritativeScoreRef.current = nextScore;

        setScore(nextScore);
        setLandings(totalLandings);

        setStats((prevStats) => {
          const newHigh = Math.max(prevStats.highScore, nextScore);
          const newCombo = Math.max(prevStats.bestCombo, nextCombo);
          const newLandings = prevStats.totalLandings + 1;

          // Achievements check
          const updatedAchievements = [...prevStats.achievements];
          if (newLandings >= 10 && !updatedAchievements.includes('land_10')) {
            updatedAchievements.push('land_10');
          }
          if (newLandings >= 50 && !updatedAchievements.includes('land_50')) {
            updatedAchievements.push('land_50');
          }
          if (newCombo >= 5 && !updatedAchievements.includes('combo_5')) {
            updatedAchievements.push('combo_5');
          }
          if (newHigh >= 1000 && !updatedAchievements.includes('score_1000')) {
            updatedAchievements.push('score_1000');
          }

          const updated = {
            ...prevStats,
            highScore: newHigh,
            totalLandings: newLandings,
            bestCombo: newCombo,
            achievements: updatedAchievements,
          };
          saveGameStats(updated);
          return updated;
        });

        // Reset combo after 6 seconds of silence
        if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
        comboTimerRef.current = setTimeout(() => {
          setCombo(0);
        }, 6000);

        return nextCombo;
      });
    },
    []
  );

  const handleGameOver = useCallback((reason: string, _finalScore: number, _finalLandings: number) => {
    const finalScore = authoritativeScoreRef.current;
    setGameOverReason(reason);
    setShowGameOver(true);
    setStats((prev) => {
      const topScores = [...prev.topScores, finalScore]
        .filter((scoreValue) => scoreValue > 0)
        .sort((left, right) => right - left)
        .slice(0, 3);
      const updated = {
        ...prev,
        gamesPlayed: prev.gamesPlayed + 1,
        highScore: Math.max(prev.highScore, finalScore),
        lastScore: finalScore,
        topScores,
      };
      saveGameStats(updated);
      return updated;
    });
  }, []);

  const handleLevelComplete = useCallback((nextLevel: number) => {
    setShowLevelComplete(true);
    setStats((prev) => {
      const unlocked = Math.max(prev.unlockedLevels, nextLevel + 1);
      const updated = {
        ...prev,
        unlockedLevels: unlocked,
        highestSectorCompleted: Math.max(prev.highestSectorCompleted, nextLevel),
      };
      saveGameStats(updated);
      return updated;
    });
  }, []);

  const handleAutoPause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const restartCurrentGame = () => {
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    setShowGameOver(false);
    setShowLevelComplete(false);
    setScore(0);
    authoritativeScoreRef.current = 0;
    setLandings(0);
    setCombo(0);
    setIsPaused(false);
    setRunId((previousRunId) => previousRunId + 1);
  };

  const nextLevelProceed = () => {
    setShowLevelComplete(false);
    setScore(0);
    authoritativeScoreRef.current = 0;
    setLandings(0);
    setCombo(0);
    setIsPaused(false);
    if (levelIndex < LEVELS.length - 1) {
      setLevelIndex((prev) => prev + 1);
    } else {
      setLevelIndex(0);
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sounds.enabled = next;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <ScreenContainer edges={['top', 'left', 'right']} style={styles.screen}>
      {/* Top Header Flight Deck HUD */}
      <View style={styles.topBar}>
        <View style={styles.titleGroup}>
          <View style={styles.brandLine}>
            <Text style={styles.appName}>SKYLINE SIGNAL</Text>
            <View style={styles.versionBadge} accessibilityLabel={`Game version ${RELEASE_VERSION}`}>
              <Text style={styles.versionText}>{RELEASE_VERSION}</Text>
            </View>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>SECTOR {levelIndex + 1}/{LEVELS.length} · {trafficLoad} TRAFFIC</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={toggleSound}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={soundEnabled ? 'Mute game sounds' : 'Enable game sounds'}
          >
            <Text style={styles.iconButtonText}>{soundEnabled ? '🔊' : '🔇'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowAchievementsModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open career record"
          >
            <Text style={styles.iconButtonText}>🏆</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowInfoModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open controller briefing"
          >
            <Text style={styles.iconButtonText}>ℹ️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, isPaused && styles.activePause]}
            onPress={() => setIsPaused(!isPaused)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isPaused ? 'Resume radar control' : 'Pause radar control'}
          >
            <Text style={styles.iconButtonText}>{isPaused ? '▶️' : '⏸️'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Flight Radar Metrics Bar */}
      <View style={styles.metricsBar}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>SCORE</Text>
          <Text style={styles.metricValue}>{score}</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>LANDINGS</Text>
          <Text style={styles.metricValueHighlight}>
            {landings} / {currentLevel.targetLandings}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>BEST</Text>
          <Text style={styles.metricValue}>{stats.highScore}</Text>
        </View>

        {combo > 1 && (
          <View style={styles.comboBadge}>
            <Text style={styles.comboText}>{combo}x COMBO!</Text>
          </View>
        )}
      </View>

      {/* Main Touch Radar Field */}
      <View style={styles.canvasContainer}>
        <AirTrafficCanvas
          key={`canvas-${levelIndex}-${runId}`}
          levelIndex={levelIndex}
          isPaused={isPaused}
          soundEnabled={soundEnabled}
          onPlaneLanded={handlePlaneLanded}
          onGameOver={handleGameOver}
          onLevelComplete={handleLevelComplete}
          onAutoPause={handleAutoPause}
        />

        {isPaused && (
          <View style={styles.pauseOverlay}>
            <Text style={styles.pauseTitle}>RADAR STANDBY</Text>
            <Text style={styles.pauseSubtitle}>Operations temporarily held</Text>
            <TouchableOpacity
              style={styles.resumeButton}
              onPress={() => setIsPaused(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.resumeButtonText}>RESUME CONTROL</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Runway Legend Bottom Dock */}
      <View style={styles.bottomDock}>
        {legendItems.map((item) => (
          <View style={styles.legendItem} key={item.type}>
            <View style={[styles.legendIndicator, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Game Over Modal */}
      <Modal visible={showGameOver} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogAlertIcon}>
              <Text style={{ fontSize: 36 }}>🚨</Text>
            </View>
            <Text style={styles.dialogTitle}>RADAR CRITICAL</Text>
            <Text style={styles.dialogDescription}>{gameOverReason}</Text>

            <View style={styles.statSummaryBox}>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Final Score:</Text>
                <Text style={styles.statRowValue}>{score}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Safe Landings:</Text>
                <Text style={styles.statRowValue}>{landings}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>All-time High Score:</Text>
                <Text style={styles.statRowValue}>{stats.highScore}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryModalButton}
              onPress={restartCurrentGame}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryModalButtonText}>RETRY APPROACH</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Level Complete Modal */}
      <Modal visible={showLevelComplete} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogSuccessIcon}>
              <Text style={{ fontSize: 36 }}>✈️</Text>
            </View>
            <Text style={styles.dialogTitle}>APPROACH CLEARED!</Text>
            <Text style={styles.dialogDescription}>
              Sector {levelIndex + 1} operations completed safely with {landings} landings.
            </Text>

            <View style={styles.statSummaryBox}>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Mission Score:</Text>
                <Text style={styles.statRowValue}>{score}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Best Combo Streak:</Text>
                <Text style={styles.statRowValue}>{stats.bestCombo}x</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryModalButton}
              onPress={nextLevelProceed}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryModalButtonText}>
                {levelIndex < LEVELS.length - 1 ? 'NEXT FLIGHT SECTOR' : 'REPLAY FLEET'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Instructions / How to play Modal */}
      <Modal visible={showInfoModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>CONTROLLER BRIEFING</Text>
            <ScrollView style={{ maxHeight: 260, marginVertical: 12 }}>
              <Text style={styles.infoParagraph}>
                👉 <Text style={styles.bold}>Draw the Exact Flight Path:</Text> Touch any aircraft—or its dashed route line—and draw the route you want. Every point you draw is kept. Guide it through the matching landing corridor to land.
              </Text>
              <Text style={styles.infoParagraph}>
                🛬 <Text style={styles.bold}>Match Corridors:</Text>
                {'\n'}• <Text style={{ color: '#00E5FF' }}>Cyan Jets</Text> & <Text style={{ color: '#00E5FF' }}>Cyan Supersonic</Text> → Runway 34 (Center)
                {'\n'}• <Text style={{ color: '#FFB300' }}>Amber Propellers</Text> → Runway 28 (Diagonal)
                {'\n'}• <Text style={{ color: '#00E676' }}>Green Seaplanes</Text> → Blue Lagoon Bay
                {'\n'}• <Text style={{ color: '#C86BFF' }}>Violet Helicopters</Text> → Helipad H1 (Square pad)
              </Text>
              <Text style={styles.infoParagraph}>
                🎯 <Text style={styles.bold}>One Aircraft, One Runway:</Text> Every aircraft has one fixed, color-matched destination. A plane cannot lock or land on any other course.
              </Text>
              <Text style={styles.infoParagraph}>
                🚁 <Text style={styles.bold}>Helipad Clearance:</Text> Helicopters can approach H1 from any direction. Draw their route to the violet square pad; the landing lock turns green as soon as the line reaches the pad.
              </Text>
              <Text style={styles.infoParagraph}>
                ✅ <Text style={styles.bold}>Live Landing Lock:</Text> While your finger is still down, the final part of your drawn line turns green and shows “CLEARED TO LAND” only when it reaches the correct landing threshold in the correct direction. The game never changes your line.
              </Text>
              <Text style={styles.infoParagraph}>
                🌍 <Text style={styles.bold}>Changing Sectors:</Text> Every completed sector moves to a new environment—coastal crosswind, alpine peak, then night superstorm. Traffic becomes denser within a sector and increases again at every new stage.
              </Text>
              <Text style={styles.infoParagraph}>
                ⚠️ <Text style={styles.bold}>Proximity Alarms:</Text> Keep aircraft separated! Yellow halos mean caution; flashing red halos signal imminent mid-air collision.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.secondaryModalButton}
              onPress={() => setShowInfoModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryModalButtonText}>BACK TO RADAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Achievements Modal */}
      <Modal visible={showAchievementsModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>ATC CAREER RECORD</Text>
            <View style={styles.careerScorePanel}>
              <View style={styles.careerMetric}>
                <Text style={styles.careerMetricLabel}>HIGH SCORE</Text>
                <Text style={styles.careerMetricValue}>{stats.highScore}</Text>
              </View>
              <View style={styles.careerMetric}>
                <Text style={styles.careerMetricLabel}>TOTAL LANDINGS</Text>
                <Text style={styles.careerMetricValue}>{stats.totalLandings}</Text>
              </View>
              <View style={styles.careerMetric}>
                <Text style={styles.careerMetricLabel}>BEST SECTOR</Text>
                <Text style={styles.careerMetricValue}>{stats.highestSectorCompleted || '—'}</Text>
              </View>
            </View>
            <View style={styles.scoreboard}>
              <Text style={styles.scoreboardTitle}>TOP 3 SESSIONS</Text>
              {[0, 1, 2].map((rank) => (
                <View style={styles.scoreboardRow} key={rank}>
                  <Text style={styles.scoreboardRank}>#{rank + 1}</Text>
                  <Text style={styles.scoreboardScore}>{stats.topScores[rank] ?? '—'}</Text>
                </View>
              ))}
            </View>
            <View style={styles.achievementsList}>
              <View style={styles.achievementRow}>
                <Text style={styles.achievementIcon}>
                  {stats.achievements.includes('land_10') ? '🎖️' : '🔒'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.achievementTitle}>Solo Clearance</Text>
                  <Text style={styles.achievementDesc}>Land 10 aircraft safely</Text>
                </View>
              </View>

              <View style={styles.achievementRow}>
                <Text style={styles.achievementIcon}>
                  {stats.achievements.includes('land_50') ? '🏆' : '🔒'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.achievementTitle}>Master Controller</Text>
                  <Text style={styles.achievementDesc}>Land 50 total aircraft</Text>
                </View>
              </View>

              <View style={styles.achievementRow}>
                <Text style={styles.achievementIcon}>
                  {stats.achievements.includes('combo_5') ? '⚡' : '🔒'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.achievementTitle}>Rapid Sequence</Text>
                  <Text style={styles.achievementDesc}>Achieve a 5x landing combo</Text>
                </View>
              </View>

              <View style={styles.achievementRow}>
                <Text style={styles.achievementIcon}>
                  {stats.achievements.includes('score_1000') ? '🌟' : '🔒'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.achievementTitle}>High Altitude Ace</Text>
                  <Text style={styles.achievementDesc}>Score 1,000+ points in a session</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.secondaryModalButton}
              onPress={() => setShowAchievementsModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryModalButtonText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#030c14',
    paddingHorizontal: 10,
    paddingBottom: 6,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.15)',
  },
  titleGroup: {
    flexDirection: 'column',
    flexShrink: 1,
    minWidth: 0,
  },
  brandLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appName: {
    color: '#00E5FF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'HelveticaNeue-CondensedBold' : 'sans-serif-medium',
  },
  versionBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.32)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  versionText: {
    color: '#8DECF5',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  levelBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  levelText: {
    color: '#80deea',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  iconButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    minWidth: 42,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  activePause: {
    backgroundColor: 'rgba(255, 179, 0, 0.3)',
    borderColor: '#FFB300',
  },
  iconButtonText: {
    fontSize: 14,
  },
  metricsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#081726',
    marginVertical: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  metricValueHighlight: {
    color: '#00E5FF',
    fontSize: 15,
    fontWeight: '800',
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  comboBadge: {
    backgroundColor: '#FF3D71',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  comboText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  canvasContainer: {
    flex: 1,
    width: '100%',
    position: 'relative',
    marginVertical: 4,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 12, 20, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
    zIndex: 10,
  },
  pauseTitle: {
    color: '#00E5FF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  pauseSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    marginTop: 6,
    marginBottom: 20,
  },
  resumeButton: {
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 30,
  },
  resumeButtonText: {
    color: '#030c14',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bottomDock: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 10,
    backgroundColor: '#061a29',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0a1d2e',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  dialogAlertIcon: {
    marginBottom: 8,
  },
  dialogSuccessIcon: {
    marginBottom: 8,
  },
  dialogTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  dialogDescription: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 10,
    lineHeight: 18,
  },
  statSummaryBox: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statRowLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
  statRowValue: {
    color: '#00E5FF',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryModalButton: {
    width: '100%',
    backgroundColor: '#00E5FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryModalButtonText: {
    color: '#030c14',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  secondaryModalButton: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryModalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  infoParagraph: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '800',
    color: '#ffffff',
  },
  careerScorePanel: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.24)',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  careerMetric: {
    flex: 1,
    alignItems: 'center',
  },
  careerMetricLabel: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  careerMetricValue: {
    color: '#00E5FF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 3,
  },
  scoreboard: {
    width: '100%',
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  scoreboardTitle: {
    color: '#FFB300',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  scoreboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  scoreboardRank: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontWeight: '700',
  },
  scoreboardScore: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  achievementsList: {
    width: '100%',
    gap: 12,
    marginVertical: 14,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 10,
    borderRadius: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  achievementIcon: {
    fontSize: 24,
  },
  achievementTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  achievementDesc: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    marginTop: 2,
  },
});
