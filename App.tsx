import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import './src/services/amplify';
import { AccountScreen } from './src/screens/AccountScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { AuthProvider } from './src/state/AuthContext';
import { colors } from './src/theme';

type Tab = 'game' | 'leaderboard' | 'account' | 'about';

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'game', label: 'Play', icon: '🎲' },
  { key: 'leaderboard', label: 'Scores', icon: '🏆' },
  { key: 'account', label: 'Account', icon: '👤' },
  { key: 'about', label: 'About', icon: 'ℹ️' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('game');

  return (
    <AuthProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}><Image source={require('./assets/yahtzee-dice-logo.png')} style={styles.logoImage} /><Text style={styles.logo}>Yahtzee!</Text><View style={styles.logoSpacer} /></View>
        <View style={styles.screen}>
          {tab === 'game' && <GameScreen />}
          {tab === 'leaderboard' && <LeaderboardScreen />}
          {tab === 'account' && <AccountScreen />}
          {tab === 'about' && <AboutScreen />}
        </View>
        <View style={styles.tabBar}>
          {tabs.map((item) => (
            <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.tab}>
              <Text style={styles.tabIcon}>{item.icon}</Text>
              <Text style={[styles.tabLabel, tab === item.key && styles.activeTab]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { height: 66, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, borderBottomColor: colors.cyan, borderBottomWidth: 2 },
  logoImage: { width: 43, height: 43, resizeMode: 'contain' }, logoSpacer: { width: 43 },
  logo: { color: colors.yellow, fontSize: 28, fontWeight: '900' },
  screen: { flex: 1 },
  tabBar: { flexDirection: 'row', minHeight: 70, borderTopColor: '#253237', borderTopWidth: 1, backgroundColor: colors.surface },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabIcon: { fontSize: 20 },
  tabLabel: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  activeTab: { color: colors.cyan },
});
