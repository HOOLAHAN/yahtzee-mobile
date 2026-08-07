import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentDailyStreak } from '../lib/engagement';
import { localDateKey } from '../lib/dailyChallenge';
import { fetchMyGameResults, GameResult } from '../services/gameResults';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import { sharedAppAchievementKey } from '../lib/achievements';

interface Achievement { id: string; name: string; description: string; icon: keyof typeof Ionicons.glyphMap; unlocked: (results: GameResult[], streak: number, sharedApp: boolean) => boolean }
const achievements: Achievement[] = [
  { id: 'first_game', name: 'First Roll', description: 'Complete a solo game', icon: 'dice', unlocked: (r) => r.some((x) => x.mode === 'SOLO') },
  { id: 'solo_5', name: 'Getting Started', description: 'Complete 5 solo games', icon: 'flag', unlocked: (r) => r.filter((x) => x.mode === 'SOLO').length >= 5 },
  { id: 'solo_25', name: 'Regular Roller', description: 'Complete 25 solo games', icon: 'calendar', unlocked: (r) => r.filter((x) => x.mode === 'SOLO').length >= 25 },
  { id: 'solo_100', name: 'Century Club', description: 'Complete 100 solo games', icon: 'ribbon', unlocked: (r) => r.filter((x) => x.mode === 'SOLO').length >= 100 },
  { id: 'first_yahtzee', name: 'Yahtzee!', description: 'Score your first Yahtzee', icon: 'sparkles', unlocked: (r) => r.some((x) => x.yahtzeeCount >= 1) },
  { id: 'double_yahtzee', name: 'Seeing Double', description: 'Score 2 Yahtzees in one game', icon: 'copy', unlocked: (r) => r.some((x) => x.yahtzeeCount >= 2) },
  { id: 'score_200', name: 'Two Hundred Club', description: 'Score at least 200', icon: 'trending-up', unlocked: (r) => r.some((x) => x.score >= 200) },
  { id: 'score_250', name: 'High Roller', description: 'Score at least 250', icon: 'rocket', unlocked: (r) => r.some((x) => x.score >= 250) },
  { id: 'score_300', name: 'Elite Roller', description: 'Score at least 300', icon: 'diamond', unlocked: (r) => r.some((x) => x.score >= 300) },
  { id: 'upper_bonus', name: 'Bonus Hunter', description: 'Earn the upper bonus', icon: 'star', unlocked: (r) => r.some((x) => x.earnedUpperBonus) },
  { id: 'both_straights', name: 'Straight Shooter', description: 'Score both straights in one game', icon: 'git-compare', unlocked: (r) => r.some((x) => x.completedSmallStraight && x.completedLargeStraight) },
  { id: 'clean_card', name: 'Clean Card', description: 'Finish without a zero', icon: 'checkmark-done-circle', unlocked: (r) => r.some((x) => x.noZeroScores) },
  { id: 'daily_first', name: 'Daily Debut', description: 'Complete a Daily Challenge', icon: 'sunny', unlocked: (r) => r.some((x) => x.mode === 'DAILY') },
  { id: 'share_app', name: 'Spread the Word', description: 'Share Yahtzee Hub with someone', icon: 'share-social', unlocked: (_, __, shared) => shared },
  { id: 'streak_3', name: 'On a Roll', description: 'Reach a 3-day streak', icon: 'flame', unlocked: (_, s) => s >= 3 },
  { id: 'streak_7', name: 'Full Week', description: 'Reach a 7-day streak', icon: 'bonfire', unlocked: (_, s) => s >= 7 },
  { id: 'streak_30', name: 'Daily Devotion', description: 'Reach a 30-day streak', icon: 'trophy', unlocked: (_, s) => s >= 30 },
];

export function ProgressScreen() {
  const { user } = useAuth();
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sharedApp, setSharedApp] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try { setResults(await fetchMyGameResults(user.userId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load progress.'); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void load(); void AsyncStorage.getItem(sharedAppAchievementKey).then((value) => setSharedApp(value === 'true')); }, [load]);
  const dailyDates = useMemo(() => results.filter((result) => result.mode === 'DAILY' && result.challengeDate).map((result) => result.challengeDate!), [results]);
  const streak = currentDailyStreak(dailyDates, localDateKey());
  const unlocked = achievements.filter((achievement) => achievement.unlocked(results, streak, sharedApp)).length;
  const best = results.reduce((value, result) => Math.max(value, result.score), 0);
  const average = results.length ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : 0;

  if (!user) return <ScrollView contentContainerStyle={styles.content}><View style={styles.signInCard}><Ionicons name="ribbon-outline" size={42} color={colors.cyan} /><Text style={styles.signInTitle}>Keep your progress</Text><Text style={styles.copy}>Sign in from Account to sync streaks, statistics and achievements across devices.</Text></View></ScrollView>;
  return <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.cyan} />}>
    <View style={styles.hero}><View><Text style={styles.eyebrow}>Current Daily streak</Text><Text style={styles.streak}>{streak} <Text style={styles.streakUnit}>{streak === 1 ? 'day' : 'days'}</Text></Text></View><View style={styles.flame}><Ionicons name="flame" size={30} color={colors.yellow} /></View></View>
    <View style={styles.stats}><View style={styles.stat}><Text style={styles.statValue}>{results.length}</Text><Text style={styles.statLabel}>Games</Text></View><View style={styles.stat}><Text style={styles.statValue}>{best}</Text><Text style={styles.statLabel}>Best</Text></View><View style={styles.stat}><Text style={styles.statValue}>{average}</Text><Text style={styles.statLabel}>Average</Text></View></View>
    <View style={styles.heading}><Text style={styles.headingText}>Achievements</Text><Text style={styles.count}>{unlocked}/{achievements.length}</Text></View>
    {error ? <View style={styles.errorCard}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
    {loading && !results.length ? <ActivityIndicator size="large" color={colors.cyan} /> : achievements.map((achievement) => { const earned = achievement.unlocked(results, streak, sharedApp); return <View key={achievement.id} style={[styles.badge, earned && styles.badgeEarned]}><View style={[styles.badgeIcon, earned && styles.badgeIconEarned]}><Ionicons name={achievement.icon} size={22} color={earned ? colors.background : colors.muted} /></View><View style={styles.badgeCopy}><Text style={[styles.badgeName, !earned && styles.locked]}>{achievement.name}</Text><Text style={styles.badgeDescription}>{achievement.description}</Text></View>{earned ? <Ionicons name="checkmark-circle" size={21} color={colors.cyan} /> : <Ionicons name="lock-closed" size={17} color={colors.muted} />}</View>; })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 }, signInCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: '#315057', borderWidth: 1, borderRadius: 18, padding: 28 }, signInTitle: { color: colors.yellow, fontSize: 20, fontWeight: '900', marginTop: 10 }, copy: { color: colors.muted, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#272b13', borderColor: colors.yellow, borderWidth: 1, borderRadius: 18, padding: 18 }, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, streak: { color: colors.yellow, fontSize: 34, fontWeight: '900', marginTop: 2 }, streakUnit: { fontSize: 15 }, flame: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3a3510' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10 }, stat: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, statValue: { color: colors.cyan, fontSize: 21, fontWeight: '900' }, statLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 9 }, headingText: { color: colors.yellow, fontSize: 20, fontWeight: '900' }, count: { color: colors.cyan, fontWeight: '900' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 67, backgroundColor: colors.surface, borderColor: '#29373a', borderWidth: 1, borderRadius: 13, padding: 10, marginBottom: 8, opacity: 0.62 }, badgeEarned: { borderColor: colors.cyan, opacity: 1 }, badgeIcon: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#263135' }, badgeIconEarned: { backgroundColor: colors.cyan }, badgeCopy: { flex: 1 }, badgeName: { color: colors.mint, fontWeight: '900' }, locked: { color: colors.muted }, badgeDescription: { color: colors.muted, fontSize: 10, marginTop: 2 }, errorCard: { alignItems: 'center', padding: 16 }, error: { color: colors.danger, textAlign: 'center' }, retry: { color: colors.cyan, fontWeight: '900', marginTop: 8 },
});
