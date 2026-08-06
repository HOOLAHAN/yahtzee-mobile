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

type Tab = 'game' | 'leaderboard' | 'progress' | 'account' | 'about';

const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'game', label: 'Play', icon: 'dice-outline', activeIcon: 'dice' },
  { key: 'leaderboard', label: 'Scores', icon: 'trophy-outline', activeIcon: 'trophy' },
  { key: 'progress', label: 'Progress', icon: 'ribbon-outline', activeIcon: 'ribbon' },
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
  const [gameChooserRequest, setGameChooserRequest] = useState(0);

  const selectTab = (nextTab: Tab) => {
    if (nextTab === 'game') setGameChooserRequest((request) => request + 1);
    setTab(nextTab);
  };

  return (
    <SafeAreaProvider>
    <AuthProvider>
      <PendingScoreSync />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}><Image source={require('./assets/yahtzee-dice-logo.png')} style={styles.logoImage} /><Text style={styles.logo}>Yahtzee!</Text><View style={styles.logoSpacer} /></View>
        <View style={styles.screen}>
          {tab === 'game' && <GameScreen chooserRequest={gameChooserRequest} />}
          {tab === 'leaderboard' && <LeaderboardScreen />}
          {tab === 'progress' && <ProgressScreen />}
          {tab === 'account' && <AccountScreen />}
          {tab === 'about' && <AboutScreen />}
        </View>
        <View style={styles.tabBar}>
          {tabs.map((item) => (
            <Pressable key={item.key} onPress={() => selectTab(item.key)} style={[styles.tab, tab === item.key && styles.activeTabPill]}>
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
  logo: { color: colors.yellow, fontSize: 28, fontWeight: '900' },
  screen: { flex: 1 },
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
