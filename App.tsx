import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import Ionicons from '@expo/vector-icons/Ionicons';
import './src/services/amplify';
import { AccountScreen } from './src/screens/AccountScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { flushPendingScores } from './src/services/pendingScores';
import { colors } from './src/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Tab = 'game' | 'leaderboard' | 'progress' | 'account' | 'about';
const scoreSuggestionsKey = 'yahtzee.score-suggestions.v1';

const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'leaderboard', label: 'Scores', icon: 'trophy-outline', activeIcon: 'trophy' },
  { key: 'progress', label: 'Progress', icon: 'ribbon-outline', activeIcon: 'ribbon' },
  { key: 'game', label: 'Play', icon: 'dice-outline', activeIcon: 'dice' },
  { key: 'account', label: 'Account', icon: 'person-outline', activeIcon: 'person' },
  { key: 'about', label: 'About', icon: 'information-circle-outline', activeIcon: 'information-circle' },
];

function PendingScoreSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const submitPending = () => void flushPendingScores(user.userId);
    submitPending();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) submitPending();
    });
    return unsubscribe;
  }, [user]);

  return null;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('game');
  const [gameHeaderTitle, setGameHeaderTitle] = useState('Yahtzee!');
  const [scoreSuggestionsEnabled, setScoreSuggestionsEnabled] = useState(true);
  const headerTitle = tab === 'game' ? gameHeaderTitle : tab === 'leaderboard' ? 'High Scores' : tab === 'progress' ? 'Progress' : tab === 'account' ? 'Account' : 'About';

  useEffect(() => { void AsyncStorage.getItem(scoreSuggestionsKey).then((value) => { if (value !== null) setScoreSuggestionsEnabled(value !== 'false'); }); }, []);
  const changeScoreSuggestions = (enabled: boolean) => { setScoreSuggestionsEnabled(enabled); void AsyncStorage.setItem(scoreSuggestionsKey, String(enabled)); };

  return (
    <SafeAreaProvider>
    <AuthProvider>
      <PendingScoreSync />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}><Image source={require('./assets/yahtzee-dice-logo.png')} style={styles.logoImage} /><Text numberOfLines={1} style={styles.logo}>{headerTitle}</Text><View style={styles.logoSpacer} /></View>
        <View style={styles.screen}>
          <View style={[styles.tabScreen, tab !== 'game' && styles.hiddenTab]}><GameScreen onHeaderTitleChange={setGameHeaderTitle} scoreSuggestionsEnabled={scoreSuggestionsEnabled} /></View>
          {tab === 'leaderboard' && <LeaderboardScreen />}
          {tab === 'progress' && <ProgressScreen />}
          {tab === 'account' && <AccountScreen scoreSuggestionsEnabled={scoreSuggestionsEnabled} onScoreSuggestionsChange={changeScoreSuggestions} />}
          {tab === 'about' && <AboutScreen />}
        </View>
        <View style={styles.tabBar}>
          {tabs.map((item) => (
            <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.activeTabPill]}>
              <Ionicons name={tab === item.key ? item.activeIcon : item.icon} size={23} color={tab === item.key ? colors.cyan : colors.muted} />
              <Text style={[styles.tabLabel, tab === item.key && styles.activeTab]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { height: 66, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, borderBottomColor: colors.cyan, borderBottomWidth: 2 },
  logoImage: { width: 43, height: 43, resizeMode: 'contain' }, logoSpacer: { width: 43 },
  logo: { flex: 1, color: colors.yellow, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  screen: { flex: 1 },
  tabScreen: { flex: 1 }, hiddenTab: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    height: 68,
    marginHorizontal: 14,
    marginTop: 5,
    marginBottom: 8,
    padding: 5,
    borderRadius: 34,
    borderColor: '#2d3c40',
    borderWidth: 1,
    backgroundColor: '#121a1d',
    shadowColor: colors.cyan,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 27 },
  activeTabPill: { backgroundColor: '#20383b', borderColor: '#315a5e', borderWidth: 1 },
  tabLabel: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  activeTab: { color: colors.cyan },
});
