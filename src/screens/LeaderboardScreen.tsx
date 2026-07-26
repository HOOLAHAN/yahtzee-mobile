import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchLeaderboard, fetchUserScores, LeaderboardScore } from '../services/scores';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

export function LeaderboardScreen() {
  const { user } = useAuth();
  const [scores, setScores] = useState<LeaderboardScore[]>([]);
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setScores(mine && user ? await fetchUserScores(user.userId) : await fetchLeaderboard()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load scores.'); }
    finally { setLoading(false); }
  }, [mine, user]);

  useEffect(() => { void load(); }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void load(); }} tintColor={colors.cyan} />}>
      <Text style={styles.title}>High Scores</Text>
      <View style={styles.filterRow}>
        <Pressable onPress={() => setMine(false)} style={[styles.filter, !mine && styles.filterActive]}><Text style={[styles.filterText, !mine && styles.filterTextActive]}>Global</Text></Pressable>
        <Pressable disabled={!user} onPress={() => setMine(true)} style={[styles.filter, mine && styles.filterActive, !user && styles.filterDisabled]}><Text style={[styles.filterText, mine && styles.filterTextActive]}>My Scores</Text></Pressable>
      </View>
      {loading && scores.length === 0 && <ActivityIndicator color={colors.cyan} size="large" />}
      {error ? <View style={styles.message}><Text style={styles.error}>{error}</Text><Pressable onPress={() => { setLoading(true); void load(); }}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
      {scores.map((item, index) => (
        <View key={item.id} style={styles.row}>
          <Text style={styles.rank}>{index + 1}</Text>
          <Text numberOfLines={1} style={styles.name}>{item.username}</Text>
          <Text style={styles.score}>{item.score}</Text>
        </View>
      ))}
      {!loading && !error && scores.length === 0 && <Text style={styles.empty}>No scores yet. Be the first!</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 },
  title: { color: colors.yellow, fontSize: 30, fontWeight: '900', textAlign: 'center', marginVertical: 18 },
  filterRow: { flexDirection: 'row', backgroundColor: colors.surface, padding: 4, borderRadius: 12, marginBottom: 18 },
  filter: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 9 }, filterActive: { backgroundColor: colors.cyan }, filterDisabled: { opacity: 0.4 },
  filterText: { color: colors.muted, fontWeight: '800' }, filterTextActive: { color: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.cyan, borderWidth: 1, padding: 16, borderRadius: 12, marginBottom: 10 },
  rank: { color: colors.pink, fontSize: 20, fontWeight: '900', width: 38 },
  name: { color: colors.mint, fontSize: 16, fontWeight: '700', flex: 1 },
  score: { color: colors.yellow, fontSize: 21, fontWeight: '900' },
  message: { alignItems: 'center', gap: 14, padding: 24 },
  error: { color: colors.danger, textAlign: 'center' },
  retry: { color: colors.cyan, fontWeight: '800' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30 },
});
