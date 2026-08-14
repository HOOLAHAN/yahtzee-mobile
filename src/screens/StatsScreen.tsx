import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme';
import { LeaderboardScreen } from './LeaderboardScreen';
import { ProgressScreen } from './ProgressScreen';

type StatsView = 'leaderboards' | 'progress';

export function StatsScreen({ onOpenAccount, dailyLeaderboardRequest = 0 }: { onOpenAccount?: () => void; dailyLeaderboardRequest?: number }) {
  const [view, setView] = useState<StatsView>('leaderboards');
  useEffect(() => { if (dailyLeaderboardRequest > 0) setView('leaderboards'); }, [dailyLeaderboardRequest]);

  const selectView = (next: StatsView) => {
    if (next === view) return;
    void Haptics.selectionAsync();
    setView(next);
  };

  return <View style={styles.container}>
    <View style={styles.switcher} accessibilityRole="tablist">
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: view === 'leaderboards' }}
        onPress={() => selectView('leaderboards')}
        style={[styles.option, view === 'leaderboards' && styles.optionActive]}
      >
        <Ionicons name={view === 'leaderboards' ? 'trophy' : 'trophy-outline'} size={17} color={view === 'leaderboards' ? colors.cyan : colors.muted} />
        <Text style={[styles.optionText, view === 'leaderboards' && styles.optionTextActive]}>Leaderboards</Text>
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: view === 'progress' }}
        onPress={() => selectView('progress')}
        style={[styles.option, view === 'progress' && styles.optionActive]}
      >
        <Ionicons name={view === 'progress' ? 'ribbon' : 'ribbon-outline'} size={17} color={view === 'progress' ? colors.cyan : colors.muted} />
        <Text style={[styles.optionText, view === 'progress' && styles.optionTextActive]}>My Progress</Text>
      </Pressable>
    </View>
    <View style={styles.content}>
      {view === 'leaderboards'
        ? <LeaderboardScreen onOpenAccount={onOpenAccount} dailyLeaderboardRequest={dailyLeaderboardRequest} />
        : <ProgressScreen onCreateAccount={onOpenAccount} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  switcher: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2d3c40',
    backgroundColor: '#11191b',
  },
  option: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
  },
  optionActive: {
    borderWidth: 1,
    borderColor: '#315a5e',
    backgroundColor: '#20383b',
  },
  optionText: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  optionTextActive: { color: colors.cyan },
  content: { flex: 1 },
});
