import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchLeaderboard, fetchUserScores, LeaderboardScore } from '../services/scores';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import { fetchAllDailyResults, fetchDailyResults, fetchMyGameResults, fetchSoloResults, filterResultsByPeriod, GameResult, ResultMode, ResultPeriod } from '../services/gameResults';
import { localDateKey } from '../lib/dailyChallenge';

type Period = ResultPeriod;
type Competition = 'solo' | 'daily';
type LeaderboardEntry = LeaderboardScore & Partial<GameResult> & { aggregate?: boolean };
const scoreLabels: Record<string, string> = { Ones: 'Ones', Twos: 'Twos', Threes: 'Threes', Fours: 'Fours', Fives: 'Fives', Sixes: 'Sixes', 'Three of a Kind': '3 of a Kind', 'Four of a Kind': '4 of a Kind', 'Full House': 'Full House', 'Small Straight': 'Small Straight', 'Large Straight': 'Large Straight', Yahtzee: 'Yahtzee', Chance: 'Chance' };
const upperCategories = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'];
const lowerCategories = ['Three of a Kind', 'Four of a Kind', 'Full House', 'Small Straight', 'Large Straight', 'Yahtzee', 'Chance'];
const readScorecard = (value?: string) => { if (!value) return null; try { return JSON.parse(value) as Record<string, number>; } catch { return null; } };
const highestScorePerUser = (entries: LeaderboardEntry[]) => {
  const best = new Map<string, LeaderboardEntry>();
  entries.forEach((entry) => {
    const current = best.get(entry.userId);
    const entryTime = new Date(entry.completedAt ?? entry.timestamp).getTime();
    const currentTime = current ? new Date(current.completedAt ?? current.timestamp).getTime() : 0;
    if (!current || entry.score > current.score || (entry.score === current.score && entryTime > currentTime)) best.set(entry.userId, entry);
  });
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 100);
};
function ScorecardBreakdown({ value }: { value?: string }) {
  const card = readScorecard(value); if (!card) return null;
  const upper = upperCategories.reduce((sum, key) => sum + (card[key] ?? 0), 0); const bonus = upper >= 63 ? 35 : 0;
  const column = (title: string, categories: string[]) => <View style={styles.scorecardColumn}><Text style={styles.scorecardSection}>{title}</Text>{categories.map((category) => { const score = card[category] ?? 0; return <View key={category} style={styles.scorecardRow}><Text numberOfLines={1} style={styles.scorecardLabel}>{scoreLabels[category] ?? category}</Text><Text style={[styles.scorecardValue, score === 0 && styles.zeroScore]}>{score}</Text></View>; })}</View>;
  return <View style={styles.scorecard}><View style={styles.scorecardHeading}><Text style={styles.scorecardTitle}>Scorecard</Text><Text style={styles.scorecardTotal}>Upper {upper} · Bonus {bonus}</Text></View><View style={styles.scorecardColumns}>{column('UPPER', upperCategories)}{column('LOWER', lowerCategories)}</View></View>;
}

export function LeaderboardScreen({ onOpenAccount, dailyLeaderboardRequest = 0 }: { onOpenAccount?: () => void; dailyLeaderboardRequest?: number }) {
  const { user } = useAuth();
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [historyScores, setHistoryScores] = useState<LeaderboardEntry[]>([]);
  const [mine, setMine] = useState(false);
  const [period, setPeriod] = useState<Period>('all');
  const [competition, setCompetition] = useState<Competition>('solo');
  const [historyMode, setHistoryMode] = useState<'ALL' | ResultMode>('ALL');
  const [historyDate, setHistoryDate] = useState<'all' | 'week' | 'month'>('all');
  const [filterMenu, setFilterMenu] = useState<'type' | 'period' | null>(null);
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const detailY = useRef(new Animated.Value(0)).current;

  const closeDetails = useCallback(() => setSelected(null), []);
  const detailPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: () => detailY.stopAnimation(),
    onPanResponderMove: (_, gesture) => detailY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 85 || gesture.vy > 0.85) {
        Animated.timing(detailY, {
          toValue: 650,
          duration: 190,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(closeDetails);
      } else {
        Animated.spring(detailY, { toValue: 0, speed: 20, bounciness: 5, useNativeDriver: true }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(detailY, { toValue: 0, speed: 20, bounciness: 5, useNativeDriver: true }).start(),
    onPanResponderTerminationRequest: () => false,
  }), [closeDetails, detailY]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (mine && user) {
        const [details, legacy] = await Promise.all([fetchMyGameResults(user.userId), fetchUserScores(user.userId)]);
        const indexedIds = new Set(details.map((result) => result.id));
        const history = [...details.map((result) => ({ ...result, timestamp: result.completedAt } as LeaderboardEntry)), ...legacy.filter((score) => !indexedIds.has(score.id)).map((score) => ({ ...score, mode: 'SOLO' as const } as LeaderboardEntry))];
        const datedHistory = filterResultsByPeriod(history, historyDate);
        setHistoryScores(datedHistory);
        setScores(datedHistory.filter((result) => historyMode === 'ALL' || result.mode === historyMode).sort((a, b) => new Date(b.completedAt ?? b.timestamp).getTime() - new Date(a.completedAt ?? a.timestamp).getTime()).slice(0, 100));
      } else if (competition === 'solo') {
        const [legacy, details] = await Promise.all([
          mine && user ? fetchUserScores(user.userId) : fetchLeaderboard(),
          mine && user ? fetchMyGameResults(user.userId) : fetchSoloResults(100),
        ]);
        const indexed = details.filter((result) => result.mode === 'SOLO').map((result) => ({ ...result, timestamp: result.completedAt } as LeaderboardEntry));
        const indexedIds = new Set(indexed.map((result) => result.id));
        setScores(highestScorePerUser(filterResultsByPeriod([...indexed, ...legacy.filter((score) => !indexedIds.has(score.id))], period)));
      } else {
        const daily = period === 'today' ? await fetchDailyResults(localDateKey()) : filterResultsByPeriod(await fetchAllDailyResults(1000), period);
        setScores(highestScorePerUser(daily as LeaderboardEntry[]));
      }
      setLastUpdated(new Date());
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load scores.'); }
    finally { setLoading(false); }
  }, [competition, historyDate, historyMode, mine, period, user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (dailyLeaderboardRequest > 0) { setMine(false); setCompetition('daily'); setPeriod('today'); } }, [dailyLeaderboardRequest]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void load(); });
    return () => subscription.remove();
  }, [load]);

  const gameTypeLabel = mine
    ? ({ ALL: 'All games', SOLO: 'Solo', DAILY: 'Daily Challenge', COMPUTER: 'Vs Computer', PASS: 'Pass & Play', REAL: 'Real Dice' } as const)[historyMode]
    : competition === 'daily' ? 'Daily Challenge' : 'Solo';
  const timePeriodLabel = mine
    ? historyDate === 'all' ? 'Any date' : historyDate === 'week' ? 'This week' : 'This month'
    : period === 'today' ? 'Today' : period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'All time';
  const typeOptions = mine
    ? [{ value: 'ALL', label: 'All games' }, { value: 'SOLO', label: 'Solo' }, { value: 'DAILY', label: 'Daily Challenge' }, { value: 'COMPUTER', label: 'Vs Computer' }, { value: 'PASS', label: 'Pass & Play' }, { value: 'REAL', label: 'Real Dice' }]
    : [{ value: 'solo', label: 'Solo' }, { value: 'daily', label: 'Daily Challenge' }];
  const periodOptions = mine
    ? [{ value: 'all', label: 'Any date' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]
    : (competition === 'daily'
      ? [{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }]
      : [{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }]);
  const chooseFilter = (value: string) => {
    if (filterMenu === 'type') {
      if (mine) setHistoryMode(value as 'ALL' | ResultMode);
      else {
        const next = value as Competition;
        setCompetition(next);
        setPeriod(next === 'daily' ? 'today' : period === 'today' ? 'week' : period);
      }
    } else if (mine) setHistoryDate(value as 'all' | 'week' | 'month');
    else setPeriod(value as Period);
    setLoading(true);
    setFilterMenu(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void load(); }} tintColor={colors.cyan} />}>
      <Text style={styles.intro}>{mine ? 'Every recorded game, with filters and per-mode performance.' : 'Competitive Solo and Daily Challenge rankings.'}</Text>
      <View style={styles.controlPanel}>
        <View style={styles.selectRow}>
          {mine
            ? <Pressable onPress={() => setFilterMenu('type')} style={styles.selectControl}><Text style={styles.selectLabel}>GAME TYPE</Text><View style={styles.selectValueRow}><Text numberOfLines={1} style={styles.selectValue}>{gameTypeLabel}</Text><Ionicons name="chevron-down" size={15} color={colors.cyan} /></View></Pressable>
            : <View style={styles.toggleControl}><Text style={styles.selectLabel}>GAME TYPE</Text><View style={styles.filterRow}>{(['solo', 'daily'] as Competition[]).map((type) => { const active = competition === type; return <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { setCompetition(type); setPeriod(type === 'daily' ? 'today' : period === 'today' ? 'week' : period); setLoading(true); }} style={[styles.filter, styles.compactFilter, active && styles.filterActive]}><Ionicons name={type === 'solo' ? 'person-outline' : 'sunny-outline'} size={12} color={active ? colors.cyan : colors.muted} /><Text style={[styles.filterText, active && styles.filterTextActive]}>{type === 'solo' ? 'Solo' : 'Daily'}</Text></Pressable>; })}</View></View>}
          <View style={styles.toggleControl}><Text style={styles.selectLabel}>SHOWING</Text><View style={styles.filterRow}>
            <Pressable onPress={() => setMine(false)} style={[styles.filter, styles.compactFilter, !mine && styles.filterActive]}><Ionicons name="earth-outline" size={13} color={!mine ? colors.cyan : colors.muted} /><Text style={[styles.filterText, !mine && styles.filterTextActive]}>Global</Text></Pressable>
            <Pressable onPress={user ? () => setMine(true) : onOpenAccount} style={[styles.filter, styles.compactFilter, mine && styles.filterActive]}><Ionicons name="person-circle-outline" size={14} color={mine ? colors.cyan : colors.muted} /><Text style={[styles.filterText, mine && styles.filterTextActive]}>{user ? 'Mine' : 'Join'}</Text></Pressable>
          </View></View>
        </View>
        <Pressable onPress={() => setFilterMenu('period')} style={styles.periodSelectControl}><Text style={styles.selectLabel}>TIME PERIOD</Text><View style={styles.selectValueRow}><Text numberOfLines={1} style={styles.selectValue}>{timePeriodLabel}</Text><Ionicons name="chevron-down" size={15} color={colors.cyan} /></View></Pressable>
      </View>
      {mine && historyScores.length > 0 && <View style={styles.modeStats}>{(['SOLO', 'DAILY', 'COMPUTER', 'PASS', 'REAL'] as ResultMode[]).map((mode) => { const games = historyScores.filter((score) => score.mode === mode); const owned = mode !== 'PASS' && mode !== 'REAL'; const average = games.length ? Math.round(games.reduce((sum, game) => sum + game.score, 0) / games.length) : 0; return <View key={mode} style={styles.modeStat}><Text style={styles.modeStatLabel}>{mode === 'COMPUTER' ? 'VS CPU' : mode === 'PASS' ? 'PASS & PLAY' : mode === 'REAL' ? 'REAL DICE' : mode}</Text><Text style={styles.modeStatValue}>{games.length} {games.length === 1 ? 'game' : 'games'}</Text><Text style={styles.modeStatMeta}>{owned && games.length ? `Best ${Math.max(...games.map((game) => game.score))} · Avg ${average}` : games.length ? 'Shared session' : 'No records'}</Text></View>; })}</View>}
      <View style={styles.freshness}><Text style={styles.freshnessText}>{loading ? 'Updating…' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Pull down to refresh'}</Text><Pressable disabled={loading} onPress={() => void load()} style={styles.refreshButton}><Ionicons name="refresh" size={13} color={colors.cyan} /><Text style={styles.refreshText}>Refresh</Text></Pressable></View>
      {loading && scores.length === 0 && <ActivityIndicator color={colors.cyan} size="large" />}
      {error ? <View style={styles.message}><Text style={styles.error}>{error}</Text><Pressable onPress={() => { setLoading(true); void load(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
      {scores.map((item, index) => (
        <Pressable accessibilityRole="button" accessibilityHint="Shows score details" onPress={() => setSelected(item)} key={item.id} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          <Text style={styles.rank}>{mine ? '•' : index + 1}</Text>
          <View style={styles.player}><Text numberOfLines={1} style={styles.name}>{item.username}</Text><Text style={styles.rowMeta}>{item.mode === 'DAILY' ? 'Daily Challenge' : item.mode === 'COMPUTER' ? 'Vs Computer' : item.mode === 'PASS' ? 'Pass & Play' : item.mode === 'REAL' ? 'Real Dice' : 'Solo'}{(item.completedAt ?? item.timestamp) ? ` · ${new Date(item.completedAt ?? item.timestamp).toLocaleDateString()}` : ''}</Text></View>
          <Text style={styles.score}>{item.score}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ))}
      {!loading && !error && scores.length === 0 && <Text style={styles.empty}>No scores yet. Be the first!</Text>}
      <Modal visible={Boolean(filterMenu)} transparent animationType="fade" onRequestClose={() => setFilterMenu(null)}><Pressable style={styles.filterMenuBackdrop} onPress={() => setFilterMenu(null)}><View style={styles.filterMenuCard} onStartShouldSetResponder={() => true}><Text style={styles.filterMenuTitle}>{filterMenu === 'type' ? 'Game type' : 'Time period'}</Text>{(filterMenu === 'type' ? typeOptions : periodOptions).map((option) => { const active = filterMenu === 'type' ? (mine ? historyMode === option.value : competition === option.value) : (mine ? historyDate === option.value : period === option.value); return <Pressable key={option.value} onPress={() => chooseFilter(option.value)} style={[styles.filterOption, active && styles.filterOptionActive]}><Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>{option.label}</Text>{active && <Ionicons name="checkmark" size={18} color={colors.cyan} />}</Pressable>; })}</View></Pressable></Modal>
      <Modal visible={Boolean(selected)} transparent animationType="none" onShow={() => detailY.setValue(0)} onDismiss={() => detailY.setValue(0)} onRequestClose={closeDetails}><View style={styles.modalBackdrop}><Pressable accessibilityLabel="Close score details" style={styles.modalDismiss} onPress={closeDetails} /><Animated.View style={[styles.detailSheet, { transform: [{ translateY: detailY }] }]}><View collapsable={false} {...detailPanResponder.panHandlers} style={styles.detailGrabber} accessibilityRole="adjustable" accessibilityLabel="Drag down to close score details"><View style={styles.detailHandle} /></View><View style={styles.detailHeader}><View><Text style={styles.detailEyebrow}>{selected?.aggregate ? 'Weekly Daily Challenge' : selected?.mode === 'DAILY' ? 'Daily Challenge' : 'Solo game'}</Text><Text style={styles.detailTitle}>{selected?.username}</Text></View></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}><View style={styles.scoreHero}><Text style={styles.detailScore}>{selected?.score}</Text>{selected?.completedAt && <Text style={styles.detailDate}>{new Date(selected.completedAt).toLocaleString()}</Text>}</View>{selected?.aggregate ? <Text style={styles.detailCopy}>Weekly score: the total of this player’s best five Daily Challenge results.</Text> : selected?.completedAt ? <><View style={styles.metrics}><View style={styles.metric}><Text style={styles.metricValue}>{selected.yahtzeeCount ?? 0}</Text><Text style={styles.metricLabel}>Yahtzees</Text></View><View style={styles.metric}><Ionicons name={selected.earnedUpperBonus ? 'checkmark-circle' : 'close-circle-outline'} size={19} color={selected.earnedUpperBonus ? colors.cyan : colors.muted} /><Text style={styles.metricLabel}>Upper bonus</Text></View><View style={styles.metric}><Ionicons name={selected.noZeroScores ? 'checkmark-circle' : 'close-circle-outline'} size={19} color={selected.noZeroScores ? colors.cyan : colors.muted} /><Text style={styles.metricLabel}>No zeroes</Text></View><View style={styles.metric}><Ionicons name={selected.completedLargeStraight ? 'checkmark-circle' : 'close-circle-outline'} size={19} color={selected.completedLargeStraight ? colors.cyan : colors.muted} /><Text style={styles.metricLabel}>Lg. straight</Text></View></View><ScorecardBreakdown value={selected.scorecard} /></> : <View style={styles.legacyNotice}><Ionicons name="archive-outline" size={20} color={colors.muted} /><Text style={styles.detailCopy}>This Solo score predates detailed scorecards. New Solo games include every category and can be opened here in full.</Text></View>}</ScrollView></Animated.View></View></Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 }, controlPanel: { backgroundColor: colors.surface, borderColor: '#26383c', borderWidth: 1, borderRadius: 16, padding: 7, marginBottom: 18 }, competitionRow: { flexDirection: 'row', gap: 5 }, competition: { flex: 1, minHeight: 57, flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' }, competitionActive: { backgroundColor: '#192528', borderColor: '#3a555a' }, competitionIcon: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#182023' }, competitionIconActive: { backgroundColor: '#313514' }, competitionText: { color: colors.muted, fontWeight: '900', fontSize: 12 }, competitionTextActive: { color: colors.white }, competitionCaption: { color: colors.muted, fontSize: 8.5, marginTop: 1 }, controlDivider: { height: 1, backgroundColor: '#263438', marginHorizontal: 5, marginVertical: 7 },
  periodRow: { flexDirection: 'row', gap: 5, marginHorizontal: 4, marginBottom: 8 }, period: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderColor: '#315057', borderWidth: 1 }, periodActive: { backgroundColor: '#20383b', borderColor: colors.cyan }, periodText: { color: colors.muted, fontSize: 10, fontWeight: '800' }, periodTextActive: { color: colors.cyan },
  selectRow: { flexDirection: 'row', gap: 7, marginBottom: 7 }, selectControl: { flex: 1, minHeight: 54, justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#315057', paddingHorizontal: 11, backgroundColor: colors.background }, selectLabel: { color: colors.muted, fontSize: 7.5, fontWeight: '900', letterSpacing: 1 }, selectValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 4 }, selectValue: { flex: 1, color: colors.mint, fontSize: 11, fontWeight: '900' },
  toggleControl: { flex: 1, minHeight: 54, justifyContent: 'center', paddingHorizontal: 2 }, periodSelectControl: { minHeight: 54, justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#315057', paddingHorizontal: 11, backgroundColor: colors.background },
  historyFilters: { gap: 6, paddingHorizontal: 4, paddingBottom: 8 }, historyChip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, borderColor: '#315057', borderWidth: 1 },
  modeStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }, modeStat: { width: '48%', backgroundColor: colors.surface, borderRadius: 11, padding: 10 }, modeStatLabel: { color: colors.muted, fontSize: 8, fontWeight: '900' }, modeStatValue: { color: colors.cyan, fontSize: 13, fontWeight: '900', marginTop: 3 }, modeStatMeta: { color: colors.mint, fontSize: 8.5, marginTop: 2 },
  viewRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 8 }, viewLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, filterRow: { flexDirection: 'row', gap: 3, backgroundColor: colors.background, padding: 3, borderRadius: 18 },
  filter: { minWidth: 82, minHeight: 30, paddingHorizontal: 10, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, compactFilter: { flex: 1, minWidth: 0, paddingHorizontal: 4 }, filterActive: { backgroundColor: '#20383b' }, filterDisabled: { opacity: 0.4 },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: '800' }, filterTextActive: { color: colors.cyan },
  freshness: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: -8, marginBottom: 12 }, freshnessText: { color: colors.muted, fontSize: 9 }, refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }, refreshText: { color: colors.cyan, fontSize: 9, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.cyan, borderWidth: 1, padding: 14, borderRadius: 12, marginBottom: 10 }, rowPressed: { opacity: .75 },
  rank: { color: colors.pink, fontSize: 20, fontWeight: '900', width: 38 },
  player: { flex: 1 }, name: { color: colors.mint, fontSize: 16, fontWeight: '700' }, rowMeta: { color: colors.muted, fontSize: 9, fontWeight: '800', marginTop: 2 },
  score: { color: colors.yellow, fontSize: 21, fontWeight: '900', marginRight: 8 },
  message: { alignItems: 'center', gap: 14, padding: 24 },
  error: { color: colors.danger, textAlign: 'center' },
  retry: { color: colors.cyan, fontWeight: '800' },
  scorecard: { marginTop: 10, backgroundColor: colors.background, borderRadius: 12, padding: 11 }, scorecardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }, scorecardTitle: { color: colors.yellow, fontWeight: '900' }, scorecardTotal: { color: colors.muted, fontSize: 9 }, scorecardColumns: { flexDirection: 'row', gap: 14 }, scorecardColumn: { flex: 1 }, scorecardSection: { color: colors.pink, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 2 }, scorecardRow: { minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderBottomColor: '#273438', borderBottomWidth: 1 }, scorecardLabel: { flex: 1, color: colors.mint, fontSize: 9.5 }, scorecardValue: { color: colors.cyan, fontSize: 10, fontWeight: '900' }, zeroScore: { color: colors.pink },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30 },
  filterMenuBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,.76)' }, filterMenuCard: { backgroundColor: colors.surface, borderColor: '#315a5e', borderWidth: 1, borderRadius: 18, padding: 12 }, filterMenuTitle: { color: colors.yellow, fontSize: 19, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 8 }, filterOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 11, paddingHorizontal: 12 }, filterOptionActive: { backgroundColor: '#20383b' }, filterOptionText: { color: colors.mint, fontSize: 13, fontWeight: '800' }, filterOptionTextActive: { color: colors.cyan },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 10 }, modalDismiss: { flex: 1 }, detailSheet: { maxHeight: '88%', backgroundColor: colors.surface, borderColor: '#315a5e', borderWidth: 1, borderRadius: 24, overflow: 'hidden', paddingHorizontal: 16, paddingBottom: 16, shadowColor: colors.cyan, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 5 }, elevation: 16 }, detailGrabber: { height: 26, marginHorizontal: -16, alignItems: 'center', justifyContent: 'center' }, detailHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#5b7075' }, detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, detailContent: { paddingBottom: 16 }, detailEyebrow: { color: colors.pink, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' }, detailTitle: { color: colors.white, fontSize: 19, fontWeight: '900', marginTop: 1 }, scoreHero: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 5 }, detailScore: { color: colors.yellow, fontSize: 43, lineHeight: 50, fontWeight: '900' }, detailDate: { color: colors.muted, fontSize: 9 }, detailCopy: { flex: 1, color: colors.mint, fontSize: 11, lineHeight: 17, marginTop: 0 }, metrics: { flexDirection: 'row', gap: 5, marginTop: 7 }, metric: { flex: 1, minHeight: 57, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderRadius: 9 }, metricValue: { color: colors.cyan, fontSize: 18, fontWeight: '900' }, metricLabel: { color: colors.muted, fontSize: 7.5, fontWeight: '800', marginTop: 2, textAlign: 'center' }, legacyNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: colors.background },
});
