import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import Ionicons from '@expo/vector-icons/Ionicons';
import './src/services/amplify';
import { AccountScreen } from './src/screens/AccountScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { AdminScreen } from './src/screens/AdminScreen';
import { GameScreen } from './src/screens/GameScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { flushPendingScores } from './src/services/pendingScores';
import { colors } from './src/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Onboarding } from './src/components/Onboarding';
import { dailyChallengeCompleted, disableDailyReminders, enableDailyReminders, refreshDailyReminders, updateReminderHour } from './src/services/dailyReminders';
import { defaultDiceAnimation, DiceAnimation, diceAnimationStorageKey } from './src/lib/diceAnimation';
import { AppText as Text, ArcadeModeProvider } from './src/components/AppText';

type Tab = 'game' | 'stats' | 'account' | 'about' | 'admin';
const scoreSuggestionsKey = 'yahtzee.score-suggestions.v1';
const onboardingKey = 'yahtzee.onboarding.completed.v1';
// Keep the original key so testers who already enabled the font-only preview retain their choice.
const arcadeModeKey = 'yahtzee.arcade-font.v1';
const scanlines = Array.from({ length: 28 }, (_, index) => index);

const tabs: { key: Exclude<Tab, 'admin'>; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'game', label: 'Play', icon: 'dice-outline', activeIcon: 'dice' },
  { key: 'stats', label: 'Stats', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
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
  const [diceAnimation, setDiceAnimation] = useState<DiceAnimation>(defaultDiceAnimation);
  const [arcadeModeEnabled, setArcadeModeEnabled] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dailyLaunchRequest, setDailyLaunchRequest] = useState(0);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(19);
  const [accountRegistrationRequest, setAccountRegistrationRequest] = useState(0);
  const [resumeGameRequest, setResumeGameRequest] = useState(0);
  const [canContinueGame, setCanContinueGame] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(true);
  const [dailyLeaderboardRequest, setDailyLeaderboardRequest] = useState(0);
  const headerTitle = tab === 'game' ? gameHeaderTitle : tab === 'stats' ? 'Stats' : tab === 'account' ? 'Account' : tab === 'admin' ? 'Admin' : 'About';

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(scoreSuggestionsKey), AsyncStorage.getItem(onboardingKey), AsyncStorage.getItem(diceAnimationStorageKey), AsyncStorage.getItem(arcadeModeKey), refreshDailyReminders()]).then(([suggestions, onboarding, savedAnimation, savedArcadeMode, reminders]) => {
      if (suggestions !== null) setScoreSuggestionsEnabled(suggestions !== 'false');
      if (savedAnimation) setDiceAnimation(savedAnimation as DiceAnimation);
      setArcadeModeEnabled(savedArcadeMode === 'true');
      setShowOnboarding(onboarding !== 'true');
      setRemindersEnabled(reminders.enabled); setReminderHour(reminders.hour);
    });
  }, []);
  useEffect(() => {
    const openNotification = (destination: unknown) => { if (destination === 'daily') { setTab('game'); setDailyLaunchRequest((value) => value + 1); } else if (destination === 'stats') setTab('stats'); };
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response) { openNotification(response.notification.request.content.data?.destination); void Notifications.clearLastNotificationResponseAsync(); } });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => openNotification(response.notification.request.content.data?.destination));
    return () => subscription.remove();
  }, []);
  const changeScoreSuggestions = (enabled: boolean) => { setScoreSuggestionsEnabled(enabled); void AsyncStorage.setItem(scoreSuggestionsKey, String(enabled)); };
  const changeDiceAnimation = (animation: DiceAnimation) => { setDiceAnimation(animation); void AsyncStorage.setItem(diceAnimationStorageKey, animation); };
  const changeArcadeMode = (enabled: boolean) => { setArcadeModeEnabled(enabled); void AsyncStorage.setItem(arcadeModeKey, String(enabled)); };
  const finishOnboarding = () => { setShowOnboarding(false); void AsyncStorage.setItem(onboardingKey, 'true'); };
  const changeReminders = async (enabled: boolean) => {
    if (!enabled) { await disableDailyReminders(); setRemindersEnabled(false); return false; }
    const granted = await enableDailyReminders(reminderHour);
    setRemindersEnabled(granted);
    if (!granted) Alert.alert('Notifications are off', 'Enable notifications for Yahtzee Hub in your device settings to receive Daily Challenge reminders.');
    return granted;
  };
  const changeReminderHour = async (hour: number) => { setReminderHour(hour); await updateReminderHour(hour); };
  const handleDailyCompleted = useCallback(() => { void dailyChallengeCompleted(); }, []);
  const handlePlayNavigationChange = useCallback((canContinue: boolean, settingsOpen: boolean) => { setCanContinueGame(canContinue); setGameSettingsOpen(settingsOpen); }, []);
  const openAccount = (createAccount = false) => { if (createAccount) setAccountRegistrationRequest((value) => value + 1); setTab('account'); };

  return (
    <ArcadeModeProvider enabled={arcadeModeEnabled}><SafeAreaProvider>
    <AuthProvider>
      <PendingScoreSync />
      <SafeAreaView style={[styles.safeArea, arcadeModeEnabled && styles.arcadeSafeArea]}>
        <StatusBar style="light" />
        <View style={[styles.header, arcadeModeEnabled && styles.arcadeHeader]}><Image source={require('./assets/yahtzee-dice-logo.png')} style={styles.logoImage} /><Text numberOfLines={1} style={[styles.logo, arcadeModeEnabled && styles.arcadeLogo]}>{headerTitle}</Text><View style={styles.logoSpacer} /></View>
        <View style={[styles.screen, arcadeModeEnabled && styles.arcadeScreen]}>
          <View style={[styles.tabScreen, tab !== 'game' && styles.hiddenTab]}><GameScreen resumeRequest={resumeGameRequest} onPlayNavigationChange={handlePlayNavigationChange} onHeaderTitleChange={setGameHeaderTitle} scoreSuggestionsEnabled={scoreSuggestionsEnabled} diceAnimation={diceAnimation} dailyLaunchRequest={dailyLaunchRequest} remindersEnabled={remindersEnabled} onRequestReminders={() => void changeReminders(true)} onDailyCompleted={handleDailyCompleted} onOpenDailyLeaderboard={() => { setDailyLeaderboardRequest((value) => value + 1); setTab('stats'); }} onOpenAccount={openAccount} /></View>
          {tab === 'stats' && <StatsScreen onOpenAccount={() => openAccount(true)} dailyLeaderboardRequest={dailyLeaderboardRequest} />}
          {tab === 'account' && <AccountScreen onOpenAdmin={() => setTab('admin')} registrationRequest={accountRegistrationRequest} scoreSuggestionsEnabled={scoreSuggestionsEnabled} onScoreSuggestionsChange={changeScoreSuggestions} diceAnimation={diceAnimation} onDiceAnimationChange={changeDiceAnimation} arcadeModeEnabled={arcadeModeEnabled} onArcadeModeChange={changeArcadeMode} remindersEnabled={remindersEnabled} reminderHour={reminderHour} onRemindersChange={(enabled) => void changeReminders(enabled)} onRequestReminders={() => changeReminders(true)} onReminderHourChange={(hour) => void changeReminderHour(hour)} />}
          {tab === 'admin' && <AdminScreen onClose={() => setTab('account')} />}
          {tab === 'about' && <AboutScreen />}
        </View>
        <View style={[styles.tabBar, arcadeModeEnabled && styles.arcadeTabBar]}>
          {tabs.map((item) => { const active = tab === item.key || (tab === 'admin' && item.key === 'account'); return (
            <Pressable key={item.key} onPress={() => { void Haptics.selectionAsync(); if (item.key === 'game' && canContinueGame && (tab !== 'game' || gameSettingsOpen)) setResumeGameRequest((value) => value + 1); setTab(item.key); }} style={[styles.tab, arcadeModeEnabled && styles.arcadeTab, active && styles.activeTabPill, arcadeModeEnabled && active && styles.arcadeActiveTabPill]}>
              <Ionicons name={active ? item.activeIcon : item.icon} size={23} color={active ? colors.cyan : colors.muted} />
              <Text style={[styles.tabLabel, active && styles.activeTab]}>{item.key === 'game' && canContinueGame && (tab !== 'game' || gameSettingsOpen) ? 'Resume' : item.label}</Text>
            </Pressable>
          ); })}
        </View>
        <Onboarding visible={showOnboarding} onFinish={finishOnboarding} onEnableReminders={() => changeReminders(true)} />
        {arcadeModeEnabled && <View pointerEvents="none" style={styles.arcadeOverlay}>{scanlines.map((line) => <View key={line} style={styles.arcadeScanline} />)}</View>}
      </SafeAreaView>
    </AuthProvider>
    </SafeAreaProvider></ArcadeModeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  arcadeSafeArea: { backgroundColor: '#030809' },
  header: { height: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, borderBottomColor: colors.cyan, borderBottomWidth: 2 },
  logoImage: { width: 40, height: 40, resizeMode: 'contain' }, logoSpacer: { width: 40 },
  logo: { flex: 1, color: colors.yellow, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  screen: { flex: 1 },
  arcadeHeader: { height: 62, backgroundColor: '#070d0f', borderBottomWidth: 3, shadowColor: colors.cyan, shadowOpacity: 0.45, shadowRadius: 0, shadowOffset: { width: 0, height: 3 }, elevation: 7 },
  arcadeLogo: { letterSpacing: 1.4, textShadowColor: 'rgba(8, 217, 223, 0.55)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  arcadeScreen: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#17383b' },
  tabScreen: { flex: 1 }, hiddenTab: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    height: 68,
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 2,
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
  arcadeTabBar: { borderRadius: 5, borderWidth: 2, borderColor: '#315a5e', backgroundColor: '#080f11', shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 8 },
  arcadeTab: { borderRadius: 2 },
  arcadeActiveTabPill: { borderRadius: 2, borderWidth: 2, borderColor: colors.cyan, backgroundColor: '#102b2e' },
  tabLabel: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  activeTab: { color: colors.cyan },
  arcadeOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, justifyContent: 'space-around' },
  arcadeScanline: { height: 1, width: '100%', backgroundColor: 'rgba(8, 217, 223, 0.022)' },
});
