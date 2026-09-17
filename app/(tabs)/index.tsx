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
import { CAREER_ACHIEVEMENTS, getCampaignAchievementIds } from '@/lib/campaign';
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
  const [showSectorMap, setShowSectorMap] = useState(false);
  const [resumeAfterModal, setResumeAfterModal] = useState(false);
  const [pwaUpdateReady, setPwaUpdateReady] = useState(false);

  const comboTimerRef = useRef<any>(null);
  const authoritativeScoreRef = useRef(0);

  const currentLevel: GameLevel = LEVELS[levelIndex] || LEVELS[0];
  const trafficLoad = currentLevel.difficultyLabel;
  const legendItems: Array<{ types: AircraftType[]; color: string; label: string }> = [
    { types: ['jet', 'fighter', 'supersonic'] as AircraftType[], color: '#00E5FF', label: 'JET / FTR / SST → R34' },
    { types: ['propeller', 'cargo'] as AircraftType[], color: '#FFB300', label: 'PROP / CARGO → R28' },
    { types: ['seaplane'] as AircraftType[], color: '#00E676', label: 'SEAPLANE → BAY' },
    { types: ['helicopter', 'tiltrotor'] as AircraftType[], color: '#C86BFF', label: 'HELI / VTOL → H1' },
    { types: ['zeppelin'] as AircraftType[], color: '#FF5CD6', label: 'AIRSHIP → M1' },
  ].filter((item) => item.types.some((type) => currentLevel.allowedTypes.includes(type)));

  useEffect(() => {
    loadGameStats().then(setStats);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onUpdateReady = () => setPwaUpdateReady(true);
    window.addEventListener('skyline-pwa-update-ready', onUpdateReady);
    return () => window.removeEventListener('skyline-pwa-update-ready', onUpdateReady);
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
      const completedSector = nextLevel;
      const achievementIds = getCampaignAchievementIds(completedSector - 1);
      const unlocked = Math.min(LEVELS.length, Math.max(prev.unlockedLevels, nextLevel + 1));
      const updated = {
        ...prev,
        unlockedLevels: unlocked,
        highestSectorCompleted: Math.max(prev.highestSectorCompleted, completedSector),
        completedSectors: [...new Set([...prev.completedSectors, completedSector])].sort((left, right) => left - right),
        completedMissions: [...new Set([...prev.completedMissions, currentLevel.mission])],
        sectorBestScores: {
          ...prev.sectorBestScores,
          [String(completedSector)]: Math.max(prev.sectorBestScores[String(completedSector)] ?? 0, authoritativeScoreRef.current),
        },
        achievements: [...new Set([...prev.achievements, ...achievementIds])],
      };
      saveGameStats(updated);
      return updated;
    });
  }, [currentLevel.mission]);

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

  const selectSector = (index: number) => {
    if (index + 1 > stats.unlockedLevels) return;
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    setShowSectorMap(false);
    setShowGameOver(false);
    setShowLevelComplete(false);
    setLevelIndex(index);
    setScore(0);
    authoritativeScoreRef.current = 0;
    setLandings(0);
    setCombo(0);
    setIsPaused(false);
    setRunId((previousRunId) => previousRunId + 1);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

  const openOverlay = (setVisible: (visible: boolean) => void) => {
    setResumeAfterModal(!isPaused);
    setIsPaused(true);
    setVisible(true);
  };

  const closeOverlay = (setVisible: (visible: boolean) => void) => {
    setVisible(false);
    if (resumeAfterModal) setIsPaused(false);
  };

  const handleMissionBannerPress = () => {
    if (pwaUpdateReady && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('skyline-apply-pwa-update'));
      return;
    }
    openOverlay(setShowInfoModal);
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
          <TouchableOpacity
            style={styles.levelBadge}
            onPress={() => openOverlay(setShowSectorMap)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Open campaign sector map"
          >
            <Text style={styles.levelText}>SECTOR {levelIndex + 1}/{LEVELS.length} · {trafficLoad} · {currentLevel.missionLabel}</Text>
          </TouchableOpacity>
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
            onPress={() => openOverlay(setShowAchievementsModal)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open career record"
          >
            <Text style={styles.iconButtonText}>🏆</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => openOverlay(setShowInfoModal)}
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

      <TouchableOpacity
        style={styles.missionBanner}
        onPress={handleMissionBannerPress}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={pwaUpdateReady ? 'A game update is ready. Activate update.' : `Current sector mission: ${currentLevel.missionLabel}. Open briefing.`}
      >
        <View style={styles.missionAccent} />
        <View style={styles.missionCopy}>
          <Text style={styles.missionTitle}>{pwaUpdateReady ? 'UPDATE READY' : currentLevel.missionLabel}</Text>
          <Text style={styles.missionDescription} numberOfLines={1}>{pwaUpdateReady ? 'Tap to refresh safely before your next approach.' : currentLevel.missionBrief}</Text>
        </View>
        <Text style={styles.missionChevron}>{pwaUpdateReady ? '↻' : '›'}</Text>
      </TouchableOpacity>

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
          <View style={styles.legendItem} key={item.types.join('-')}>
            <View style={[styles.legendIndicator, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Campaign Map */}
      <Modal visible={showSectorMap} transparent animationType="slide" onRequestClose={() => closeOverlay(setShowSectorMap)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.dialogCard, styles.campaignCard]}>
            <Text style={styles.dialogTitle}>SKYLINE CAMPAIGN</Text>
            <Text style={styles.campaignSummary}>
              {stats.completedSectors.length}/{LEVELS.length} sectors cleared · {stats.unlockedLevels}/{LEVELS.length} unlocked
            </Text>
            <ScrollView style={styles.sectorScroll} contentContainerStyle={styles.sectorGrid} showsVerticalScrollIndicator={false}>
              {LEVELS.map((sector, index) => {
                const unlocked = index + 1 <= stats.unlockedLevels;
                const cleared = stats.completedSectors.includes(index + 1);
                const isActive = index === levelIndex;
                const best = stats.sectorBestScores[String(index + 1)] ?? 0;
                return (
                  <TouchableOpacity
                    key={sector.id}
                    style={[
                      styles.sectorCard,
                      !unlocked && styles.sectorCardLocked,
                      isActive && styles.sectorCardActive,
                      cleared && styles.sectorCardCleared,
                    ]}
                    onPress={() => selectSector(index)}
                    disabled={!unlocked}
                    activeOpacity={0.74}
                    accessibilityRole="button"
                    accessibilityLabel={unlocked ? `Play sector ${sector.id}: ${sector.title}` : `Sector ${sector.id} locked`}
                  >
                    <View style={styles.sectorCardTopline}>
                      <Text style={styles.sectorNumber}>{unlocked ? `S${String(sector.id).padStart(2, '0')}` : '🔒'}</Text>
                      <Text style={styles.sectorStatus}>{cleared ? 'CLEARED' : isActive ? 'ACTIVE' : unlocked ? 'READY' : 'LOCKED'}</Text>
                    </View>
                    <Text style={styles.sectorTitle} numberOfLines={1}>{unlocked ? sector.title : 'Locked Sector'}</Text>
                    <Text style={styles.sectorMission} numberOfLines={1}>{unlocked ? sector.missionLabel : `Unlock at ${sector.unlockScore}`}</Text>
                    <Text style={styles.sectorBest}>BEST {best || '—'} · {sector.difficultyLabel}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.secondaryModalButton} onPress={() => closeOverlay(setShowSectorMap)} activeOpacity={0.8}>
              <Text style={styles.secondaryModalButtonText}>BACK TO RADAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                {'\n'}• <Text style={{ color: '#00E5FF' }}>Cyan Fighters</Text> → Runway 34 (Center)
                {'\n'}• <Text style={{ color: '#FFB300' }}>Amber Propellers & Cargo</Text> → Runway 28 (Diagonal)
                {'\n'}• <Text style={{ color: '#00E676' }}>Green Seaplanes</Text> → Blue Lagoon Bay
                {'\n'}• <Text style={{ color: '#C86BFF' }}>Violet Helicopters & Tiltrotors</Text> → Helipad H1 (Square pad)
                {'\n'}• <Text style={{ color: '#FF5CD6' }}>Pink Airships</Text> → Mooring M1 (oval beacon)
              </Text>
              <Text style={styles.infoParagraph}>
                🎯 <Text style={styles.bold}>One Aircraft, One Runway:</Text> Every aircraft has one fixed, color-matched destination. A plane cannot lock or land on any other course.
              </Text>
              <Text style={styles.infoParagraph}>
                🚁 <Text style={styles.bold}>Vertical Clearance:</Text> Helicopters and tiltrotors can approach H1 from any direction. Airships can approach M1 from any direction. The landing lock turns green as soon as the line reaches the matching violet or pink destination.
              </Text>
              <Text style={styles.infoParagraph}>
                ✅ <Text style={styles.bold}>Live Landing Lock:</Text> While your finger is still down, the final part of your drawn line turns green and shows “CLEARED TO LAND” only when it reaches the correct landing threshold in the correct direction. The game never changes your line.
              </Text>
              <Text style={styles.infoParagraph}>
                🌍 <Text style={styles.bold}>Campaign Sectors:</Text> Tap the sector badge above to open the 18-sector campaign map. Every sector combines a new terrain layout, fleet mix, traffic pressure, and an active mission such as crosswind, fuel priority, weather, low visibility, or restricted airspace.
              </Text>
              <Text style={styles.infoParagraph}>
                ⚠️ <Text style={styles.bold}>Proximity Alarms:</Text> Keep aircraft separated! Yellow halos mean caution; flashing red halos signal imminent mid-air collision.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.secondaryModalButton}
              onPress={() => closeOverlay(setShowInfoModal)}
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
              {CAREER_ACHIEVEMENTS.map((achievement) => {
                const achieved = stats.achievements.includes(achievement.id);
                return (
                  <View style={styles.achievementRow} key={achievement.id}>
                    <Text style={styles.achievementIcon}>{achieved ? achievement.icon : '🔒'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.achievementTitle}>{achievement.title}</Text>
                      <Text style={styles.achievementDesc}>{achievement.description}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.secondaryModalButton}
              onPress={() => closeOverlay(setShowAchievementsModal)}
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
  missionBanner: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(115, 214, 255, 0.24)',
    backgroundColor: 'rgba(7, 30, 45, 0.86)',
  },
  missionAccent: {
    height: 24,
    width: 3,
    borderRadius: 3,
    backgroundColor: '#00E5FF',
    marginRight: 9,
  },
  missionCopy: {
    flex: 1,
    minWidth: 0,
  },
  missionTitle: {
    color: '#B7F5FF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  missionDescription: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    marginTop: 2,
  },
  missionChevron: {
    color: '#70DFFF',
    fontSize: 23,
    lineHeight: 24,
    marginLeft: 8,
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
  campaignCard: {
    maxWidth: 402,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  campaignSummary: {
    color: 'rgba(205, 241, 249, 0.74)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 12,
  },
  sectorScroll: {
    width: '100%',
    maxHeight: 430,
  },
  sectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  sectorCard: {
    width: '48.5%',
    minHeight: 92,
    padding: 9,
    backgroundColor: 'rgba(5, 24, 38, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(91, 203, 233, 0.28)',
    borderRadius: 10,
  },
  sectorCardLocked: {
    opacity: 0.48,
    backgroundColor: 'rgba(18, 25, 34, 0.92)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sectorCardActive: {
    borderWidth: 2,
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(0, 82, 104, 0.46)',
  },
  sectorCardCleared: {
    borderColor: 'rgba(0, 230, 118, 0.58)',
  },
  sectorCardTopline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectorNumber: {
    color: '#B7F5FF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  sectorStatus: {
    color: '#82dff1',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  sectorTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  sectorMission: {
    color: '#FFCF6D',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.35,
    marginTop: 4,
  },
  sectorBest: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 8,
    marginTop: 5,
    fontWeight: '700',
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
