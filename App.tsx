import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Onboarding } from './src/components/Onboarding';
import { dailyChallengeCompleted, disableDailyReminders, enableDailyReminders, refreshDailyReminders, updateReminderHour } from './src/services/dailyReminders';
import { defaultDiceAnimation, DiceAnimation, diceAnimationStorageKey } from './src/lib/diceAnimation';

type Tab = 'game' | 'leaderboard' | 'progress' | 'account' | 'about';
const scoreSuggestionsKey = 'yahtzee.score-suggestions.v1';
const onboardingKey = 'yahtzee.onboarding.completed.v1';

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
  const [diceAnimation, setDiceAnimation] = useState<DiceAnimation>(defaultDiceAnimation);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dailyLaunchRequest, setDailyLaunchRequest] = useState(0);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(19);
  const [accountRegistrationRequest, setAccountRegistrationRequest] = useState(0);
  const [resumeGameRequest, setResumeGameRequest] = useState(0);
  const [canContinueGame, setCanContinueGame] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(true);
  const headerTitle = tab === 'game' ? gameHeaderTitle : tab === 'leaderboard' ? 'High Scores' : tab === 'progress' ? 'Progress' : tab === 'account' ? 'Account' : 'About';

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(scoreSuggestionsKey), AsyncStorage.getItem(onboardingKey), AsyncStorage.getItem(diceAnimationStorageKey), refreshDailyReminders()]).then(([suggestions, onboarding, savedAnimation, reminders]) => {
      if (suggestions !== null) setScoreSuggestionsEnabled(suggestions !== 'false');
      if (savedAnimation) setDiceAnimation(savedAnimation as DiceAnimation);
      setShowOnboarding(onboarding !== 'true');
      setRemindersEnabled(reminders.enabled); setReminderHour(reminders.hour);
    });
  }, []);
  useEffect(() => {
    const openDaily = () => { setTab('game'); setDailyLaunchRequest((value) => value + 1); };
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response?.notification.request.content.data?.destination === 'daily') { openDaily(); void Notifications.clearLastNotificationResponseAsync(); } });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => { if (response.notification.request.content.data?.destination === 'daily') openDaily(); });
    return () => subscription.remove();
  }, []);
  const changeScoreSuggestions = (enabled: boolean) => { setScoreSuggestionsEnabled(enabled); void AsyncStorage.setItem(scoreSuggestionsKey, String(enabled)); };
  const changeDiceAnimation = (animation: DiceAnimation) => { setDiceAnimation(animation); void AsyncStorage.setItem(diceAnimationStorageKey, animation); };
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
    <SafeAreaProvider>
    <AuthProvider>
      <PendingScoreSync />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}><Image source={require('./assets/yahtzee-dice-logo.png')} style={styles.logoImage} /><Text numberOfLines={1} style={styles.logo}>{headerTitle}</Text><View style={styles.logoSpacer} /></View>
        <View style={styles.screen}>
          <View style={[styles.tabScreen, tab !== 'game' && styles.hiddenTab]}><GameScreen resumeRequest={resumeGameRequest} onPlayNavigationChange={handlePlayNavigationChange} onHeaderTitleChange={setGameHeaderTitle} scoreSuggestionsEnabled={scoreSuggestionsEnabled} diceAnimation={diceAnimation} onDiceAnimationChange={changeDiceAnimation} dailyLaunchRequest={dailyLaunchRequest} remindersEnabled={remindersEnabled} onRequestReminders={() => void changeReminders(true)} onDailyCompleted={handleDailyCompleted} onOpenAccount={openAccount} /></View>
          {tab === 'leaderboard' && <LeaderboardScreen onOpenAccount={() => openAccount(true)} />}
          {tab === 'progress' && <ProgressScreen onCreateAccount={() => openAccount(true)} />}
          {tab === 'account' && <AccountScreen registrationRequest={accountRegistrationRequest} scoreSuggestionsEnabled={scoreSuggestionsEnabled} onScoreSuggestionsChange={changeScoreSuggestions} remindersEnabled={remindersEnabled} reminderHour={reminderHour} onRemindersChange={(enabled) => void changeReminders(enabled)} onRequestReminders={() => changeReminders(true)} onReminderHourChange={(hour) => void changeReminderHour(hour)} />}
          {tab === 'about' && <AboutScreen />}
        </View>
        <View style={styles.tabBar}>
          {tabs.map((item) => (
            <Pressable key={item.key} onPress={() => { void Haptics.selectionAsync(); if (item.key === 'game' && tab === 'game' && gameSettingsOpen && canContinueGame) setResumeGameRequest((value) => value + 1); setTab(item.key); }} style={[styles.tab, tab === item.key && styles.activeTabPill]}>
              <Ionicons name={tab === item.key ? item.activeIcon : item.icon} size={23} color={tab === item.key ? colors.cyan : colors.muted} />
              <Text style={[styles.tabLabel, tab === item.key && styles.activeTab]}>{item.key === 'game' && canContinueGame ? 'Continue' : item.label}</Text>
            </Pressable>
          ))}
        </View>
        <Onboarding visible={showOnboarding} onFinish={finishOnboarding} onEnableReminders={() => changeReminders(true)} />
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
