import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchLeaderboard, fetchUserScores, LeaderboardScore } from '../services/scores';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import { fetchAllDailyResults, fetchDailyResults, fetchSoloResults, fetchWeeklyResults, GameResult } from '../services/gameResults';
import { localDateKey } from '../lib/dailyChallenge';

type Period = 'today' | 'week' | 'all';
type Competition = 'solo' | 'daily';
type LeaderboardEntry = LeaderboardScore & Partial<GameResult> & { aggregate?: boolean };
const scoreLabels: Record<string, string> = { Ones: 'Ones', Twos: 'Twos', Threes: 'Threes', Fours: 'Fours', Fives: 'Fives', Sixes: 'Sixes', 'Three of a Kind': '3 of a Kind', 'Four of a Kind': '4 of a Kind', 'Full House': 'Full House', 'Small Straight': 'Small Straight', 'Large Straight': 'Large Straight', Yahtzee: 'Yahtzee', Chance: 'Chance' };
const readScorecard = (value?: string) => { if (!value) return null; try { return JSON.parse(value) as Record<string, number>; } catch { return null; } };
function ScorecardBreakdown({ value }: { value?: string }) {
  const card = readScorecard(value); if (!card) return null;
  const upper = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'].reduce((sum, key) => sum + (card[key] ?? 0), 0); const bonus = upper >= 63 ? 35 : 0;
  return <View style={styles.scorecard}><View style={styles.scorecardHeading}><Text style={styles.scorecardTitle}>Full scorecard</Text><Text style={styles.scorecardTotal}>Upper {upper} · Bonus {bonus}</Text></View><ScrollView style={styles.scorecardScroll} nestedScrollEnabled>{Object.entries(card).map(([category, score]) => <View key={category} style={styles.scorecardRow}><Text style={styles.scorecardLabel}>{scoreLabels[category] ?? category}</Text><Text style={[styles.scorecardValue, score === 0 && styles.zeroScore]}>{score}</Text></View>)}</ScrollView></View>;
}

export function LeaderboardScreen() {
  const { user } = useAuth();
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [mine, setMine] = useState(false);
  const [period, setPeriod] = useState<Period>('all');
  const [competition, setCompetition] = useState<Competition>('solo');
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      if (competition === 'solo') {
        const [legacy, details] = await Promise.all([mine && user ? fetchUserScores(user.userId) : fetchLeaderboard(), fetchSoloResults()]);
        const detailById = new Map(details.map((result) => [result.id, result]));
        setScores(legacy.map((score) => ({ ...score, ...detailById.get(score.id) })) as LeaderboardEntry[]);
      } else {
        const daily = period === 'today' ? await fetchDailyResults(localDateKey()) : period === 'week' ? (await fetchWeeklyResults()).map((entry) => ({ ...entry, aggregate: true })) : await fetchAllDailyResults();
        const visible = mine && user ? daily.filter((score) => score.userId === user.userId) : daily;
        setScores(visible.slice(0, 100) as LeaderboardEntry[]);
      }
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load scores.'); }
    finally { setLoading(false); }
  }, [competition, mine, period, user]);

  useEffect(() => { void load(); }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void load(); }} tintColor={colors.cyan} />}>
      <Text style={styles.intro}>Solo scores and Daily Challenge results are ranked separately.</Text>
      <View style={styles.controlPanel}>
        <View style={styles.competitionRow}><Pressable onPress={() => { setLoading(true); setCompetition('solo'); setPeriod('all'); }} style={[styles.competition, competition === 'solo' && styles.competitionActive]}><View style={[styles.competitionIcon, competition === 'solo' && styles.competitionIconActive]}><Ionicons name="person-outline" size={17} color={competition === 'solo' ? colors.yellow : colors.muted} /></View><View><Text style={[styles.competitionText, competition === 'solo' && styles.competitionTextActive]}>Solo</Text><Text style={styles.competitionCaption}>Classic games</Text></View></Pressable><Pressable onPress={() => { setLoading(true); setCompetition('daily'); }} style={[styles.competition, competition === 'daily' && styles.competitionActive]}><View style={[styles.competitionIcon, competition === 'daily' && styles.competitionIconActive]}><Ionicons name="sunny-outline" size={17} color={competition === 'daily' ? colors.yellow : colors.muted} /></View><View><Text style={[styles.competitionText, competition === 'daily' && styles.competitionTextActive]}>Daily</Text><Text style={styles.competitionCaption}>Same rolls</Text></View></Pressable></View>
        <View style={styles.controlDivider} />
        {competition === 'daily' && <View style={styles.periodRow}>{(['today', 'week', 'all'] as Period[]).map((item) => <Pressable key={item} onPress={() => { setLoading(true); setPeriod(item); }} style={[styles.period, period === item && styles.periodActive]}><Text style={[styles.periodText, period === item && styles.periodTextActive]}>{item === 'today' ? 'Today' : item === 'week' ? 'Week' : 'All time'}</Text></Pressable>)}</View>}
        <View style={styles.viewRow}><Text style={styles.viewLabel}>SHOWING</Text><View style={styles.filterRow}>
          <Pressable onPress={() => setMine(false)} style={[styles.filter, !mine && styles.filterActive]}><Ionicons name="earth-outline" size={13} color={!mine ? colors.cyan : colors.muted} /><Text style={[styles.filterText, !mine && styles.filterTextActive]}>Global</Text></Pressable>
          <Pressable disabled={!user} onPress={() => setMine(true)} style={[styles.filter, mine && styles.filterActive, !user && styles.filterDisabled]}><Ionicons name="person-circle-outline" size={14} color={mine ? colors.cyan : colors.muted} /><Text style={[styles.filterText, mine && styles.filterTextActive]}>Mine</Text></Pressable>
        </View></View>
      </View>
      {loading && scores.length === 0 && <ActivityIndicator color={colors.cyan} size="large" />}
      {error ? <View style={styles.message}><Text style={styles.error}>{error}</Text><Pressable onPress={() => { setLoading(true); void load(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
      {scores.map((item, index) => (
        <Pressable accessibilityRole="button" accessibilityHint="Shows score details" onPress={() => setSelected(item)} key={item.id} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          <Text style={styles.rank}>{mine ? '•' : index + 1}</Text>
          <View style={styles.player}><Text numberOfLines={1} style={styles.name}>{item.username}</Text><Text style={styles.rowMeta}>{competition === 'daily' ? item.aggregate ? 'Weekly total' : 'Daily Challenge' : 'Solo'}{item.completedAt ? ` · ${new Date(item.completedAt).toLocaleDateString()}` : ''}</Text></View>
          <Text style={styles.score}>{item.score}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ))}
      {!loading && !error && scores.length === 0 && <Text style={styles.empty}>No scores yet. Be the first!</Text>}
      <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}><View style={styles.modalBackdrop}><Pressable style={styles.modalDismiss} onPress={() => setSelected(null)} /><View style={styles.detailSheet}><View style={styles.detailHeader}><View><Text style={styles.detailEyebrow}>{selected?.aggregate ? 'Weekly Daily Challenge' : selected?.mode === 'DAILY' ? 'Daily Challenge' : 'Solo game'}</Text><Text style={styles.detailTitle}>{selected?.username}</Text></View><Pressable accessibilityLabel="Close score details" onPress={() => setSelected(null)} style={styles.close}><Ionicons name="close" size={22} color={colors.white} /></Pressable></View><Text style={styles.detailScore}>{selected?.score}</Text>{selected?.aggregate ? <Text style={styles.detailCopy}>Weekly score: the total of this player’s best five Daily Challenge results.</Text> : selected?.completedAt ? <><Text style={styles.detailDate}>{new Date(selected.completedAt).toLocaleString()}</Text><View style={styles.metrics}><View style={styles.metric}><Text style={styles.metricValue}>{selected.yahtzeeCount ?? 0}</Text><Text style={styles.metricLabel}>Yahtzees</Text></View><View style={styles.metric}><Ionicons name={selected.earnedUpperBonus ? 'checkmark-circle' : 'close-circle-outline'} size={22} color={selected.earnedUpperBonus ? colors.cyan : colors.muted} /><Text style={styles.metricLabel}>Upper bonus</Text></View><View style={styles.metric}><Ionicons name={selected.noZeroScores ? 'checkmark-circle' : 'close-circle-outline'} size={22} color={selected.noZeroScores ? colors.cyan : colors.muted} /><Text style={styles.metricLabel}>No zeroes</Text></View></View><View style={styles.detailRows}><Text style={styles.detailRow}>Small straight <Text>{selected.completedSmallStraight ? '✓' : '—'}</Text></Text><Text style={styles.detailRow}>Large straight <Text>{selected.completedLargeStraight ? '✓' : '—'}</Text></Text><Text style={styles.detailRow}>Both straights <Text>{selected.completedSmallStraight && selected.completedLargeStraight ? '✓' : '—'}</Text></Text></View><ScorecardBreakdown value={selected.scorecard} /></> : <Text style={styles.detailCopy}>This is a historical leaderboard score. Detailed game statistics were not recorded for older entries.</Text>}</View></View></Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 }, controlPanel: { backgroundColor: colors.surface, borderColor: '#26383c', borderWidth: 1, borderRadius: 16, padding: 7, marginBottom: 18 }, competitionRow: { flexDirection: 'row', gap: 5 }, competition: { flex: 1, minHeight: 57, flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' }, competitionActive: { backgroundColor: '#192528', borderColor: '#3a555a' }, competitionIcon: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#182023' }, competitionIconActive: { backgroundColor: '#313514' }, competitionText: { color: colors.muted, fontWeight: '900', fontSize: 12 }, competitionTextActive: { color: colors.white }, competitionCaption: { color: colors.muted, fontSize: 8.5, marginTop: 1 }, controlDivider: { height: 1, backgroundColor: '#263438', marginHorizontal: 5, marginVertical: 7 },
  periodRow: { flexDirection: 'row', gap: 5, marginHorizontal: 4, marginBottom: 8 }, period: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderColor: '#315057', borderWidth: 1 }, periodActive: { backgroundColor: '#20383b', borderColor: colors.cyan }, periodText: { color: colors.muted, fontSize: 10, fontWeight: '800' }, periodTextActive: { color: colors.cyan },
  viewRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 8 }, viewLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, filterRow: { flexDirection: 'row', gap: 3, backgroundColor: colors.background, padding: 3, borderRadius: 18 },
  filter: { minWidth: 82, minHeight: 30, paddingHorizontal: 10, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, filterActive: { backgroundColor: '#20383b' }, filterDisabled: { opacity: 0.4 },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: '800' }, filterTextActive: { color: colors.cyan },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.cyan, borderWidth: 1, padding: 14, borderRadius: 12, marginBottom: 10 }, rowPressed: { opacity: .75 },
  rank: { color: colors.pink, fontSize: 20, fontWeight: '900', width: 38 },
  player: { flex: 1 }, name: { color: colors.mint, fontSize: 16, fontWeight: '700' }, rowMeta: { color: colors.muted, fontSize: 9, fontWeight: '800', marginTop: 2 },
  score: { color: colors.yellow, fontSize: 21, fontWeight: '900', marginRight: 8 },
  message: { alignItems: 'center', gap: 14, padding: 24 },
  error: { color: colors.danger, textAlign: 'center' },
  retry: { color: colors.cyan, fontWeight: '800' },
  scorecard: { marginTop: 12, backgroundColor: colors.background, borderRadius: 12, padding: 12 }, scorecardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }, scorecardTitle: { color: colors.yellow, fontWeight: '900' }, scorecardTotal: { color: colors.muted, fontSize: 10 }, scorecardScroll: { maxHeight: 245 }, scorecardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomColor: '#273438', borderBottomWidth: 1 }, scorecardLabel: { color: colors.mint, fontSize: 12 }, scorecardValue: { color: colors.cyan, fontWeight: '900' }, zeroScore: { color: colors.pink },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'flex-end' }, modalDismiss: { flex: 1 }, detailSheet: { backgroundColor: colors.surface, borderTopColor: colors.cyan, borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 38 }, detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, detailEyebrow: { color: colors.pink, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' }, detailTitle: { color: colors.white, fontSize: 21, fontWeight: '900', marginTop: 2 }, close: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#263337', alignItems: 'center', justifyContent: 'center' }, detailScore: { color: colors.yellow, fontSize: 52, fontWeight: '900', marginTop: 12 }, detailDate: { color: colors.muted, fontSize: 11, marginTop: -4 }, detailCopy: { color: colors.mint, fontSize: 12, lineHeight: 19, marginTop: 10 }, metrics: { flexDirection: 'row', gap: 7, marginTop: 18 }, metric: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderRadius: 11 }, metricValue: { color: colors.cyan, fontSize: 22, fontWeight: '900' }, metricLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', marginTop: 3 }, detailRows: { marginTop: 10, backgroundColor: colors.background, borderRadius: 11, paddingHorizontal: 12 }, detailRow: { color: colors.mint, paddingVertical: 10, borderBottomColor: '#273438', borderBottomWidth: 1, fontSize: 12 },
});
