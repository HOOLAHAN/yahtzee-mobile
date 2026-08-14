import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, AppState, Easing, Modal, PanResponder, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { AppText as Text, useArcadeMode } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  categories,
  categoryRecommendationValue,
  Category,
  DieFace,
  maximumAvailableScore,
  rollDie,
  scoreCategory,
  ScoreEntry,
  totalScore,
  upperBonusPoints,
  upperBonusThreshold,
  upperCategories,
  upperSectionBonus,
  upperSectionSubtotal,
} from '../lib/game';
import { submitScore } from '../services/scores';
import { isRetryableScoreError, isScorePending, queueScore, subscribeToPendingScores } from '../services/pendingScores';
import { useAuth } from '../state/AuthContext';
import { colors, computerProfile, dailyProfile, playerProfiles } from '../theme';
import { RealDiceScreen } from './RealDiceScreen';
import { VirtualDiceScreen } from './VirtualDiceScreen';
import { dailyDiceForThrow, localDateKey } from '../lib/dailyChallenge';
import { resultMetrics } from '../lib/engagement';
import { createGameResult, DailyRoundStanding, fetchDailyResults, GameResult, submitDailyRoundProgress } from '../services/gameResults';
import { defaultDiceAnimation, DiceAnimation } from '../lib/diceAnimation';

const initialDice: DieFace[] = [1, 1, 1, 1, 1];
const storageKey = 'yahtzee.active-game.v1';
const dailyAttemptKey = (date: string, userId?: string) => `yahtzee.daily.attempt.${date}.${userId ?? 'guest'}.v1`;
const pipCells: Record<DieFace, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
const categoryLabels: Record<Category, string> = {
  Ones: 'Ones', Twos: 'Twos', Threes: 'Threes', Fours: 'Fours', Fives: 'Fives', Sixes: 'Sixes',
  'Three of a Kind': '3 of a Kind', 'Four of a Kind': '4 of a Kind', 'Full House': 'Full House',
  'Small Straight': 'Sm. Straight', 'Large Straight': 'Lg. Straight', Yahtzee: 'Yahtzee', Chance: 'Chance',
};
type Player = 1 | 2;
type Histories = Record<Player, ScoreEntry[]>;
type GameMode = 'solo' | 'daily' | 'computer' | 'pass' | 'virtual' | 'real';

interface PersistedGame {
  twoPlayer: boolean;
  computerOpponent?: boolean;
  scorekeeperMode?: boolean;
  virtualDiceMode?: boolean;
  dailyMode?: boolean;
  dailyDate?: string;
  dailyThrowIndex?: number;
  progressRecorded?: boolean;
  yahtzeeOnFinalRoll?: boolean;
  currentPlayer: Player;
  dice: DieFace[];
  held: number[];
  rollsLeft: number;
  hasRolled: boolean;
  histories: Histories;
  submitted: boolean;
  queued?: boolean;
  gameId: string;
}

function PipFace({ value, small = false, preview = false }: { value: DieFace; small?: boolean; preview?: boolean }) {
  const gridStyle = small ? styles.smallPipGrid : preview ? styles.previewPipGrid : styles.pipGrid;
  const cellStyle = small ? styles.smallPipCell : preview ? styles.previewPipCell : styles.pipCell;
  const pipStyle = small ? styles.smallPip : preview ? styles.previewPip : styles.pip;
  return <View style={gridStyle}>{Array.from({ length: 9 }, (_, cell) => <View key={cell} style={cellStyle}>{pipCells[value].includes(cell) && <View style={pipStyle} />}</View>)}</View>;
}

export function AnimationPreview({ animation, active, token }: { animation: DiceAnimation; active: boolean; token: number }) {
  return <View style={styles.animationPreview}><AnimatedDie value={5} index={0} held={false} rollToken={active ? token : 0} canHold={false} reduceMotion={false} animation={animation} compact accentColor={colors.cyan} heldColor={colors.yellow} softColor={colors.background} onPress={() => undefined} /></View>;
}

function GameModeChooser({ onChange }: { onChange: (mode: GameMode) => void }) {
  const gameOptions: { mode: GameMode; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { mode: 'solo', label: 'Solo', description: 'Play a classic game at your own pace and submit your final score.', icon: 'person-outline' },
    { mode: 'daily', label: 'Daily Challenge', description: 'Play today’s fixed roll sequence. Everyone gets the same candidate dice each roll; your holds and scoring choices decide the result.', icon: 'sunny-outline' },
    { mode: 'computer', label: 'Vs Computer', description: 'Test your choices against a strategic computer opponent.', icon: 'hardware-chip-outline' },
    { mode: 'pass', label: 'Pass & Play', description: 'Share this device and take turns in a two-player game.', icon: 'people-outline' },
  ];
  const tools: { mode: GameMode; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { mode: 'virtual', label: 'Dice Roller', description: 'Roll one or two dice for any tabletop game.', icon: 'dice-outline' },
    { mode: 'real', label: 'Scorecard', description: 'Use physical dice while the app manages every player.', icon: 'calculator-outline' },
  ];
  const choice = (option: typeof gameOptions[number], tool = false) => <Pressable key={option.mode} accessibilityRole="button" onPress={() => onChange(option.mode)} style={({ pressed }) => [styles.gameChoice, tool && styles.toolChoice, pressed && styles.choicePressed]}><View style={[styles.choiceIcon, tool && styles.toolIcon]}><Ionicons name={option.icon} size={23} color={tool ? colors.yellow : colors.cyan} /></View><View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{option.label}</Text><Text style={styles.choiceDescription}>{option.description}</Text></View><View style={[styles.choiceArrow, tool && styles.toolArrow]}><Ionicons name="arrow-forward" size={18} color={tool ? colors.background : colors.cyan} /></View></Pressable>;
  return <ScrollView contentContainerStyle={styles.chooserContent} showsVerticalScrollIndicator={false}><Text style={styles.chooserEyebrow}>Game selection</Text><Text style={styles.chooserTitle}>Choose how to play</Text><Text style={styles.chooserIntro}>Start a Yahtzee game or open a tool for your physical dice.</Text><Text style={styles.chooserSection}>Play Yahtzee</Text><View style={styles.choiceList}>{gameOptions.map((option) => choice(option))}</View><Text style={styles.chooserSection}>Dice tools</Text><View style={styles.choiceList}>{tools.map((option) => choice(option, true))}</View></ScrollView>;
}

function AnimatedDie({ value, index, held, rollToken, canHold, reduceMotion, resetPosition = false, animation = defaultDiceAnimation, compact = false, accentColor, heldColor, softColor, onPress }: {
  value: DieFace; index: number; held: boolean; rollToken: number; canHold: boolean; reduceMotion: boolean; resetPosition?: boolean; animation?: DiceAnimation; compact?: boolean; accentColor: string; heldColor: string; softColor: string; onPress: () => void;
}) {
  const arcadeMode = useArcadeMode();
  const spin = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const lastRollToken = useRef(0);

  useEffect(() => {
    if (!resetPosition) return;
    spin.stopAnimation(); lift.stopAnimation(); scale.stopAnimation(); sway.stopAnimation();
    spin.setValue(0); lift.setValue(0); scale.setValue(1); sway.setValue(0);
  }, [lift, resetPosition, scale, spin, sway]);

  useEffect(() => {
    if (!held) return;
    spin.stopAnimation(); lift.stopAnimation(); scale.stopAnimation(); sway.stopAnimation();
    spin.setValue(0); lift.setValue(0); scale.setValue(1); sway.setValue(0);
  }, [held, lift, scale, spin, sway]);

  useEffect(() => {
    if (rollToken === 0 || lastRollToken.current === rollToken) return;
    lastRollToken.current = rollToken;
    if (held || reduceMotion) return;
    spin.setValue(0); lift.setValue(0); scale.setValue(animation === 'classic' ? 0.78 : 1); sway.setValue(0);
    const classic = Animated.parallel([
      Animated.timing(spin, { toValue: 1, duration: 620 + index * 45, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(lift, { toValue: -22 - (index % 2) * 8, duration: 210, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(lift, { toValue: 0, speed: 16, bounciness: 11, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.16, duration: 230, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 12, useNativeDriver: true }),
      ]),
    ]);
    const bounceSpin = Animated.parallel([Animated.timing(spin, { toValue: 1, duration: 820 + index * 35, easing: Easing.out(Easing.cubic), useNativeDriver: true }), Animated.sequence([Animated.timing(lift, { toValue: -42 - index * 3, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.spring(lift, { toValue: 0, speed: 13, bounciness: 18, useNativeDriver: true })]), Animated.sequence([Animated.timing(scale, { toValue: 1.12, duration: 250, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 16, useNativeDriver: true })])]);
    const shake = Animated.sequence([-1, 1, -.85, .85, -.55, .55, 0].map((position) => Animated.timing(sway, { toValue: position, duration: 55, easing: Easing.linear, useNativeDriver: true })));
    const quickFlip = Animated.parallel([Animated.timing(spin, { toValue: 1, duration: 320 + index * 20, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }), Animated.sequence([Animated.timing(scale, { toValue: .82, duration: 110, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true })])]);
    (animation === 'bounceSpin' ? bounceSpin : animation === 'shake' ? shake : animation === 'quickFlip' ? quickFlip : classic).start(({ finished }) => {
      if (!finished) return;
      spin.setValue(0); lift.setValue(0); scale.setValue(1); sway.setValue(0);
    });
  }, [animation, held, index, lift, reduceMotion, rollToken, scale, spin, sway]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', index % 2 === 0 ? '720deg' : '-720deg'] });
  const translateX = sway.interpolate({ inputRange: [-1, 1], outputRange: [-11, 11] });
  return <Animated.View style={[styles.dieSlot, compact && styles.previewDieSlot, { transform: [{ translateX: resetPosition ? 0 : translateX }, { translateY: resetPosition ? 0 : lift }, { rotate: resetPosition ? '0deg' : rotate }, { scale: resetPosition ? 1 : scale }] }, held && styles.heldDieSlot]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Die ${index + 1}, ${value}${held ? ', held' : ''}`}
      accessibilityHint={canHold ? `Double tap to ${held ? 'release' : 'hold'} this die` : 'Roll before holding dice'}
      accessibilityState={{ disabled: !canHold, selected: held }}
      disabled={!canHold}
      onPress={onPress}
      style={({ pressed }) => [styles.die, compact && styles.previewDie, { backgroundColor: accentColor, borderColor: accentColor, shadowColor: accentColor }, arcadeMode && styles.arcadeDie, held && styles.heldDie, held && { backgroundColor: heldColor, borderColor: accentColor, shadowColor: heldColor }, pressed && styles.diePressed]}
    >
      <PipFace value={value} preview={compact} />
      {held && <View style={[styles.holdBadge, { backgroundColor: accentColor, borderColor: heldColor }]}><Text style={[styles.holdBadgeText, { color: softColor }]}>HELD</Text></View>}
    </Pressable>
  </Animated.View>;
}

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function computerHeldDice(dice: DieFace[], used: Set<Category>) {
  const counts = new Map<DieFace, number>();
  dice.forEach((die) => counts.set(die, (counts.get(die) ?? 0) + 1));
  const grouped = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [bestFace, bestCount] = grouped[0];
  const matchingUpper = categories[bestFace - 1];
  const straightOpen = !used.has('Small Straight') || !used.has('Large Straight');
  const runs: DieFace[][] = [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]];
  const target = runs.reduce((best, run) => run.filter((face) => dice.includes(face)).length > best.filter((face) => dice.includes(face)).length ? run : best);
  const straightMatches = target.filter((face) => dice.includes(face)).length;
  const groupOpen = !used.has(matchingUpper) || ['Three of a Kind', 'Four of a Kind', 'Yahtzee'].some((category) => !used.has(category as Category));
  const fullHouseOpen = !used.has('Full House');
  const holdFace = (face: DieFace) => new Set(dice.map((die, index) => die === face ? index : -1).filter((index) => index >= 0));
  const holdStraight = () => {
    const seen = new Set<DieFace>();
    return new Set(dice.map((die, index) => target.includes(die) && !seen.has(die) ? (seen.add(die), index) : -1).filter((index) => index >= 0));
  };

  // Four matching dice are too valuable to abandon. A four-die straight is
  // similarly one roll from the hardest straight result.
  if (bestCount >= 4 && groupOpen) return holdFace(bestFace);
  if (straightOpen && straightMatches >= 4) return holdStraight();

  // Preserve a made full house, or both pairs when one die can complete it.
  if (fullHouseOpen && grouped[0][1] >= 2 && grouped[1]?.[1] >= 2) {
    const usefulFaces = new Set(grouped.filter(([, count]) => count >= 2).map(([face]) => face));
    return new Set(dice.map((die, index) => usefulFaces.has(die) ? index : -1).filter((index) => index >= 0));
  }

  if (bestCount >= 3 && groupOpen) return holdFace(bestFace);
  if (straightOpen && straightMatches >= 3) return holdStraight();
  if (bestCount >= 2 && (groupOpen || fullHouseOpen)) return holdFace(bestFace);
  if (straightOpen && straightMatches >= 2) return holdStraight();

  // With no live combination, retain high dice for Chance and the upper card.
  return new Set(dice.map((die, index) => die >= 5 ? index : -1).filter((index) => index >= 0));
}

const sacrificeCost: Record<Category, number> = {
  Ones: 4, Twos: 8, Threes: 12, Fours: 16, Fives: 20, Sixes: 24,
  'Three of a Kind': 28, 'Four of a Kind': 24, 'Full House': 22,
  'Small Straight': 26, 'Large Straight': 32, Yahtzee: 18, Chance: 34,
};

function computerCategoryValue(category: Category, dice: DieFace[], entries: ScoreEntry[]) {
  const score = scoreCategory(category, dice);
  if (score === 0) return -sacrificeCost[category];

  // Completed rare combinations should always beat their overlapping result:
  // a large straight beats a small one, and Yahtzee beats its upper category.
  if (category === 'Yahtzee') return 1200;
  if (category === 'Large Straight') return 1000;
  if (category === 'Full House') return 800;
  if (category === 'Small Straight') return 700;
  if (category === 'Four of a Kind') return 420 + score;
  if (category === 'Three of a Kind') return 300 + score;
  if (category === 'Chance') return 120 + score * 4;

  const upperSubtotal = upperSectionSubtotal(entries);
  const bonusStillPossible = upperSubtotal < upperBonusThreshold;
  const matchingDice = score / (categories.indexOf(category) + 1);
  return 180 + score * 5 + matchingDice * 12 + (bonusStillPossible && matchingDice >= 3 ? 35 : 0);
}

function computerCategory(dice: DieFace[], used: Set<Category>, entries: ScoreEntry[]) {
  const available = categories.filter((category) => !used.has(category));
  return available.reduce((best, category) => computerCategoryValue(category, dice, entries) > computerCategoryValue(best, dice, entries) ? category : best);
}

interface GameScreenProps { chooserRequest?: number; resumeRequest?: number; dailyLaunchRequest?: number; onHeaderTitleChange?: (title: string) => void; onPlayNavigationChange?: (canContinue: boolean, chooserOpen: boolean) => void; scoreSuggestionsEnabled?: boolean; diceAnimation?: DiceAnimation; remindersEnabled?: boolean; onRequestReminders?: () => void; onDailyCompleted?: () => void; onOpenDailyLeaderboard?: () => void; onOpenAccount?: (createAccount?: boolean) => void }

export function GameScreen({ chooserRequest = 0, resumeRequest = 0, dailyLaunchRequest = 0, onHeaderTitleChange, onPlayNavigationChange, scoreSuggestionsEnabled = true, diceAnimation = defaultDiceAnimation, remindersEnabled = false, onRequestReminders, onDailyCompleted, onOpenDailyLeaderboard, onOpenAccount }: GameScreenProps) {
  const arcadeMode = useArcadeMode();
  const { user } = useAuth();
  const [twoPlayer, setTwoPlayer] = useState(false);
  const [computerOpponent, setComputerOpponent] = useState(false);
  const [scorekeeperMode, setScorekeeperMode] = useState(false);
  const [virtualDiceMode, setVirtualDiceMode] = useState(false);
  const [dailyMode, setDailyMode] = useState(false);
  const [dailyDate, setDailyDate] = useState(localDateKey);
  const [dailyThrowIndex, setDailyThrowIndex] = useState(0);
  const [progressRecorded, setProgressRecorded] = useState(false);
  const [yahtzeeOnFinalRoll, setYahtzeeOnFinalRoll] = useState(false);
  const [dailyStanding, setDailyStanding] = useState('');
  const [dailyAlreadyCompleted, setDailyAlreadyCompleted] = useState(false);
  const [checkingDailyCompletion, setCheckingDailyCompletion] = useState(false);
  const [dailyCompletedResult, setDailyCompletedResult] = useState<GameResult | null>(null);
  const [dailyCompletedRank, setDailyCompletedRank] = useState(0);
  const [dailyRoundStanding, setDailyRoundStanding] = useState<DailyRoundStanding | null>(null);
  const [dailyStandingLoading, setDailyStandingLoading] = useState(false);
  const [showModeChooser, setShowModeChooser] = useState(true);
  const [hasActiveMode, setHasActiveMode] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<Player>(1);
  const [viewingPlayer, setViewingPlayer] = useState<Player>(1);
  const [dice, setDice] = useState<DieFace[]>(initialDice);
  const [held, setHeld] = useState(new Set<number>());
  const [rollsLeft, setRollsLeft] = useState(3);
  const [hasRolled, setHasRolled] = useState(false);
  const [histories, setHistories] = useState<Histories>({ 1: [], 2: [] });
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [queued, setQueued] = useState(false);
  const [gameId, setGameId] = useState(() => `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const [hydrated, setHydrated] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [rollToken, setRollToken] = useState(0);
  const [toastMessage, setToastMessage] = useState('');
  const [holdTipSeen, setHoldTipSeen] = useState(true);
  const computerTurnRunning = useRef(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(16)).current;

  useEffect(() => { setShowModeChooser(true); }, [chooserRequest]);
  useEffect(() => { if (resumeRequest && hasActiveMode) setShowModeChooser(false); }, [hasActiveMode, resumeRequest]);
  useEffect(() => { void AsyncStorage.getItem('yahtzee.tip.hold-dice.v1').then((value) => setHoldTipSeen(value === 'true')); }, []);
  useEffect(() => {
    const title = showModeChooser ? 'Yahtzee!' : scorekeeperMode ? 'Scorecard' : virtualDiceMode ? 'Dice Roller' : dailyMode ? 'Daily Challenge' : computerOpponent ? 'Vs Computer' : twoPlayer ? 'Pass & Play' : 'Single Player';
    onHeaderTitleChange?.(title);
  }, [computerOpponent, dailyMode, onHeaderTitleChange, scorekeeperMode, showModeChooser, twoPlayer, virtualDiceMode]);
  const toastAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const scorecardY = useRef(new Animated.Value(0)).current;

  const scores = histories[currentPlayer];
  const used = useMemo(() => new Set<Category>(scores.map((entry) => entry.category)), [scores]);
  const totals: Record<Player, number> = { 1: totalScore(histories[1]), 2: totalScore(histories[2]) };
  const upperSubtotals: Record<Player, number> = { 1: upperSectionSubtotal(histories[1]), 2: upperSectionSubtotal(histories[2]) };
  const bonuses: Record<Player, number> = { 1: upperSectionBonus(histories[1]), 2: upperSectionBonus(histories[2]) };
  const complete = histories[1].length === categories.length && (!twoPlayer || histories[2].length === categories.length);
  useEffect(() => { onPlayNavigationChange?.(hasActiveMode && !complete, showModeChooser); }, [complete, hasActiveMode, onPlayNavigationChange, showModeChooser]);
  const currentScore = hasRolled ? maximumAvailableScore(dice, used) : 0;
  const currentRound = Math.min(scores.length + 1, categories.length);
  const isComputerTurn = computerOpponent && currentPlayer === 2;
  const secondPlayerProfile = computerOpponent ? computerProfile : playerProfiles[1];
  const currentProfile = dailyMode ? dailyProfile : currentPlayer === 1 ? playerProfiles[0] : secondPlayerProfile;
  const recommendedCategory = useMemo(() => {
    if (!hasRolled || !scoreSuggestionsEnabled) return null;
    return categories
      .filter((category) => !used.has(category))
      .reduce<Category | null>((best, category) => !best || categoryRecommendationValue(category, dice) > categoryRecommendationValue(best, dice) ? category : best, null);
  }, [dice, hasRolled, scoreSuggestionsEnabled, used]);

  useEffect(() => {
    if (!dailyMode) { setDailyAlreadyCompleted(false); return; }
    let cancelled = false;
    const completionKey = `yahtzee.daily.completed.${dailyDate}.${user?.userId ?? 'guest'}`;
    const checkCompletion = async () => {
      const completedOnDevice = await AsyncStorage.getItem(completionKey);
      if (!cancelled && completedOnDevice === 'true') setDailyAlreadyCompleted(true);
      if (!user) return;
      setCheckingDailyCompletion(true);
      try {
        const results = await fetchDailyResults(dailyDate);
        const resultIndex = results.findIndex((result) => result.userId === user.userId);
        if (!cancelled && resultIndex >= 0) {
          await AsyncStorage.setItem(completionKey, 'true');
          setDailyCompletedResult(results[resultIndex]);
          setDailyCompletedRank(resultIndex + 1);
          setDailyAlreadyCompleted(true);
        }
      } catch (error) { console.error('[dailyChallenge.check]', error); }
      finally { if (!cancelled) setCheckingDailyCompletion(false); }
    };
    void checkCompletion();
    return () => { cancelled = true; };
  }, [dailyDate, dailyMode, user]);

  useEffect(() => {
    if (!dailyMode || !complete) return;
    // Lock the challenge in memory immediately. Persisting the completion and
    // saving the result are asynchronous, so the UI must not expose a reset
    // path while either operation is still in flight.
    setDailyAlreadyCompleted(true);
    void AsyncStorage.setItem(`yahtzee.daily.completed.${dailyDate}.${user?.userId ?? 'guest'}`, 'true').then(() => onDailyCompleted?.());
  }, [complete, dailyDate, dailyMode, onDailyCompleted, user?.userId]);

  useEffect(() => {
    const round = histories[1].length;
    if (!dailyMode || !user || round < 1 || round > categories.length) {
      if (!dailyMode || round === 0) setDailyRoundStanding(null);
      return;
    }
    let cancelled = false;
    setDailyStandingLoading(true);
    void submitDailyRoundProgress(dailyDate, round, totalScore(histories[1]))
      .then((standing) => { if (!cancelled) setDailyRoundStanding(standing); })
      .catch((error) => console.error('[dailyChallenge.roundProgress]', error))
      .finally(() => { if (!cancelled) setDailyStandingLoading(false); });
    return () => { cancelled = true; };
  }, [dailyDate, dailyMode, histories, user]);

  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((value) => {
      if (!value) return;
      const saved = JSON.parse(value) as PersistedGame;
      if (!Array.isArray(saved.dice) || saved.dice.length !== 5 || !saved.histories) return;
      const today = localDateKey();
      if (saved.dailyMode && saved.dailyDate !== today) { setDailyMode(true); setDailyDate(today); return; }
      setTwoPlayer(Boolean(saved.twoPlayer)); setComputerOpponent(Boolean(saved.computerOpponent)); setScorekeeperMode(Boolean(saved.scorekeeperMode)); setVirtualDiceMode(Boolean(saved.virtualDiceMode)); setDailyMode(Boolean(saved.dailyMode)); setHasActiveMode(true); setDailyDate(saved.dailyDate || today); setDailyThrowIndex(saved.dailyThrowIndex ?? 0); setProgressRecorded(Boolean(saved.progressRecorded)); setYahtzeeOnFinalRoll(Boolean(saved.yahtzeeOnFinalRoll)); setCurrentPlayer(saved.currentPlayer === 2 ? 2 : 1); setViewingPlayer(saved.currentPlayer === 2 ? 2 : 1);
      setDice(saved.dice); setHeld(new Set(saved.held ?? [])); setRollsLeft(saved.rollsLeft); setHasRolled(Boolean(saved.hasRolled)); setHistories(saved.histories); setSubmitted(Boolean(saved.submitted)); setQueued(Boolean(saved.queued));
      if (saved.gameId) setGameId(saved.gameId);
    }).catch(() => undefined).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedGame = { twoPlayer, computerOpponent, scorekeeperMode, virtualDiceMode, dailyMode, dailyDate, dailyThrowIndex, progressRecorded, yahtzeeOnFinalRoll, currentPlayer, dice, held: [...held], rollsLeft, hasRolled, histories, submitted, queued, gameId };
    void AsyncStorage.setItem(storageKey, JSON.stringify(state));
    if (dailyMode) void AsyncStorage.setItem(dailyAttemptKey(dailyDate, user?.userId), JSON.stringify(state));
  }, [computerOpponent, currentPlayer, dailyDate, dailyMode, dailyThrowIndex, dice, gameId, hasRolled, held, histories, hydrated, progressRecorded, queued, rollsLeft, scorekeeperMode, submitted, twoPlayer, user?.userId, virtualDiceMode, yahtzeeOnFinalRoll]);

  useEffect(() => {
    if (!hydrated) return;
    let wasPending = queued;
    const syncQueueState = async () => {
      const pending = await isScorePending(gameId);
      if (wasPending && !pending) setSubmitted(true);
      wasPending = pending;
      setQueued(pending);
    };
    void syncQueueState();
    return subscribeToPendingScores(() => void syncQueueState());
  }, [gameId, hydrated, queued]);

  useEffect(() => {
    if (!hydrated || !complete || progressRecorded || !user) return;
    const metrics = resultMetrics(histories[1]);
    const mode = dailyMode ? 'DAILY' : computerOpponent ? 'COMPUTER' : twoPlayer ? 'PASS' : 'SOLO';
    const session = twoPlayer && !computerOpponent ? JSON.stringify({ players: [
      { name: 'Player 1', score: totalScore(histories[1]), scorecard: JSON.parse(resultMetrics(histories[1]).scorecard ?? '{}') },
      { name: 'Player 2', score: totalScore(histories[2]), scorecard: JSON.parse(resultMetrics(histories[2]).scorecard ?? '{}') },
    ] }) : undefined;
    const completedAt = new Date().toISOString();
    void createGameResult({
      id: dailyMode ? `daily:${dailyDate}:${user.userId}` : gameId,
      mode,
      modeDate: dailyMode ? `DAILY#${dailyDate}` : `${mode}#ALL`,
      challengeDate: dailyMode ? dailyDate : undefined,
      completedAt,
      ...metrics,
      session,
      yahtzeeOnFinalRoll,
    }).then(async (savedResult) => {
      setProgressRecorded(true);
      showToast(dailyMode ? 'Daily result saved' : 'Achievement progress saved');
      if (dailyMode) {
        const board = await fetchDailyResults(dailyDate);
        const rank = board.findIndex((result) => result.userId === savedResult.userId) + 1;
        if (rank > 0) setDailyStanding(`#${rank} today · Top ${Math.max(1, Math.ceil((rank / board.length) * 100))}%`);
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Progress could not be saved.';
      if (dailyMode && /ConditionalCheckFailed|conditional request|already exists/i.test(message)) setProgressRecorded(true);
      else console.error('[gameResults.create]', error);
    });
  }, [complete, computerOpponent, dailyDate, dailyMode, gameId, histories, hydrated, progressRecorded, twoPlayer, user, yahtzeeOnFinalRoll]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message); toastAnimation.current?.stop(); toastOpacity.setValue(0); toastY.setValue(16);
    if (reduceMotion) {
      toastOpacity.setValue(1);
      toastAnimation.current = Animated.sequence([Animated.delay(1300), Animated.timing(toastOpacity, { toValue: 0, duration: 1, useNativeDriver: true })]);
    } else {
      toastAnimation.current = Animated.sequence([
        Animated.parallel([Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }), Animated.spring(toastY, { toValue: 0, speed: 18, bounciness: 7, useNativeDriver: true })]),
        Animated.delay(1450),
        Animated.parallel([Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }), Animated.timing(toastY, { toValue: 12, duration: 220, useNativeDriver: true })]),
      ]);
    }
    toastAnimation.current.start();
  };

  const closeScorecard = () => {
    setShowScorecard(false);
  };

  const scorecardPanResponder = useMemo(() => PanResponder.create({
    // The dedicated grabber owns the touch immediately, so the nested
    // ScrollView cannot take the gesture before the sheet starts moving.
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: () => scorecardY.stopAnimation(),
    onPanResponderMove: (_, gesture) => scorecardY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 85 || gesture.vy > 0.85) {
        Animated.timing(scorecardY, {
          toValue: 650,
          duration: reduceMotion ? 1 : 190,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(closeScorecard);
      } else {
        Animated.spring(scorecardY, {
          toValue: 0,
          speed: 20,
          bounciness: 5,
          useNativeDriver: true,
        }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(scorecardY, {
      toValue: 0,
      speed: 20,
      bounciness: 5,
      useNativeDriver: true,
    }).start(),
    onPanResponderTerminationRequest: () => false,
  }), [reduceMotion, scorecardY]);

  useEffect(() => {
    if (!hydrated || !isComputerTurn || complete || computerTurnRunning.current) return;
    let cancelled = false;
    computerTurnRunning.current = true;

    const playComputerTurn = async () => {
      const computerUsed = new Set<Category>(histories[2].map((entry) => entry.category));
      let computerDice = [...initialDice];
      let computerHeld = new Set<number>();
      let remaining = 3;

      setDice(initialDice); setHeld(new Set()); setRollsLeft(3); setHasRolled(false); setSelectedCategory(null);
      for (let turnRoll = 0; turnRoll < 3 && !cancelled; turnRoll += 1) {
        await pause(reduceMotion ? 180 : 650);
        if (cancelled) return;
        computerDice = computerDice.map((die, index) => computerHeld.has(index) ? die : rollDie());
        remaining -= 1;
        setDice([...computerDice]); setRollsLeft(remaining); setHasRolled(true); setRollToken((token) => token + 1);
        await pause(reduceMotion ? 180 : 650);

        const strongCategory = computerCategory(computerDice, computerUsed, histories[2]);
        if (['Large Straight', 'Full House', 'Yahtzee'].includes(strongCategory) && scoreCategory(strongCategory, computerDice) > 0) break;
        if (turnRoll < 2) {
          computerHeld = computerHeldDice(computerDice, computerUsed);
          setHeld(new Set(computerHeld));
          await pause(reduceMotion ? 140 : 480);
        }
      }

      if (cancelled) return;
      const category = computerCategory(computerDice, computerUsed, histories[2]);
      const entry: ScoreEntry = { category, score: scoreCategory(category, computerDice), dice: [...computerDice] };
      setSelectedCategory(category);
      await pause(reduceMotion ? 220 : 800);
      if (cancelled) return;
      setHistories((current) => ({ ...current, 2: [...current[2], entry] }));
      showToast(`Computer chose ${category} for ${entry.score} ${entry.score === 1 ? 'point' : 'points'}`);
      setDice(initialDice); setHeld(new Set()); setRollsLeft(3); setHasRolled(false); setSelectedCategory(null); setCurrentPlayer(1); setViewingPlayer(1);
    };

    void playComputerTurn().finally(() => { computerTurnRunning.current = false; });
    return () => { cancelled = true; computerTurnRunning.current = false; };
  }, [complete, histories, hydrated, isComputerTurn, reduceMotion]);

  const nextRound = () => {
    setDice(initialDice); setHeld(new Set()); setRollsLeft(3); setHasRolled(false); setSelectedCategory(null);
    if (twoPlayer) { const next = currentPlayer === 1 ? 2 : 1; setCurrentPlayer(next); setViewingPlayer(next); }
  };

  const roll = () => {
    if (rollsLeft === 0 || complete) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectedCategory(null); setRollToken((token) => token + 1);
    const dailyRoll = dailyMode ? dailyDiceForThrow(dailyDate, dailyThrowIndex) : null;
    setDice((current) => current.map((die, index) => held.has(index) ? die : dailyRoll?.[index] ?? rollDie()));
    if (dailyMode) setDailyThrowIndex((index) => index + 1);
    setRollsLeft((count) => count - 1); setHasRolled(true);
  };

  const toggleHeld = (index: number) => {
    if (!hasRolled || isComputerTurn) return;
    void Haptics.selectionAsync();
    setHeld((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; });
  };

  const lockScore = () => {
    if (!selectedCategory || !hasRolled || used.has(selectedCategory)) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry = { category: selectedCategory, score: scoreCategory(selectedCategory, dice), dice: [...dice] };
    if (selectedCategory === 'Yahtzee' && entry.score === 50 && rollsLeft === 0) setYahtzeeOnFinalRoll(true);
    showToast(`${selectedCategory} locked in for ${entry.score} ${entry.score === 1 ? 'point' : 'points'}`);
    setHistories((current) => ({ ...current, [currentPlayer]: [...current[currentPlayer], entry] })); nextRound();
  };

  const clearGame = () => {
    const startingPlayer: Player = computerOpponent ? 2 : 1;
    setHistories({ 1: [], 2: [] }); setCurrentPlayer(startingPlayer); setViewingPlayer(startingPlayer); setDice(initialDice); setHeld(new Set());
    setRollsLeft(3); setHasRolled(false); setSelectedCategory(null); setSubmitted(false); setQueued(false); setShowScorecard(false); setDailyThrowIndex(0); setDailyDate(localDateKey()); setProgressRecorded(false); setYahtzeeOnFinalRoll(false); setDailyStanding(''); setDailyRoundStanding(null); setDailyStandingLoading(false);
    setGameId(`mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  };

  const reset = () => Alert.alert('Reset game?', 'All scores from this game will be lost.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: clearGame },
  ]);

  const dailyResetInfo = () => Alert.alert('Daily Challenge protected', 'Today’s challenge can only be attempted once. Choose another game if you want a break; your exact progress will be waiting when you return.');
  const applyMode = async (mode: GameMode) => {
    if (dailyMode && !complete) {
      const current: PersistedGame = { twoPlayer, computerOpponent, scorekeeperMode, virtualDiceMode, dailyMode, dailyDate, dailyThrowIndex, progressRecorded, yahtzeeOnFinalRoll, currentPlayer, dice, held: [...held], rollsLeft, hasRolled, histories, submitted, queued, gameId };
      await AsyncStorage.setItem(dailyAttemptKey(dailyDate, user?.userId), JSON.stringify(current));
    }
    const today = localDateKey();
    const savedValue = mode === 'daily' ? await AsyncStorage.getItem(dailyAttemptKey(today, user?.userId)) : null;
    let saved: PersistedGame | null = null;
    if (savedValue) {
      try {
        const parsed = JSON.parse(savedValue) as PersistedGame;
        if (parsed.dailyMode && parsed.dailyDate === today && Array.isArray(parsed.dice) && parsed.dice.length === 5 && parsed.histories) saved = parsed;
      } catch { saved = null; }
    }
    setTwoPlayer(mode === 'pass' || mode === 'computer'); setComputerOpponent(mode === 'computer'); setScorekeeperMode(mode === 'real'); setVirtualDiceMode(mode === 'virtual'); setDailyMode(mode === 'daily'); setHasActiveMode(true); setShowModeChooser(false); clearGame();
    const startingPlayer: Player = mode === 'computer' ? 2 : 1;
    setCurrentPlayer(startingPlayer); setViewingPlayer(startingPlayer);
    if (saved) {
      setDailyDate(today); setDailyThrowIndex(saved.dailyThrowIndex ?? 0); setProgressRecorded(Boolean(saved.progressRecorded)); setYahtzeeOnFinalRoll(Boolean(saved.yahtzeeOnFinalRoll));
      setCurrentPlayer(1); setViewingPlayer(1); setDice(saved.dice); setHeld(new Set(saved.held ?? [])); setRollsLeft(saved.rollsLeft); setHasRolled(Boolean(saved.hasRolled)); setHistories({ 1: saved.histories[1] ?? [], 2: [] }); setSubmitted(Boolean(saved.submitted)); setQueued(Boolean(saved.queued));
      if (saved.gameId) setGameId(saved.gameId);
    }
  };
  const changeMode = (mode: GameMode) => {
    const activeMode = scorekeeperMode ? 'real' : virtualDiceMode ? 'virtual' : dailyMode ? 'daily' : computerOpponent ? 'computer' : twoPlayer ? 'pass' : 'solo';
    if (mode === activeMode) {
      if (mode === 'daily' && dailyDate !== localDateKey()) clearGame();
      return setShowModeChooser(false);
    }
    if (histories[1].length || histories[2].length) Alert.alert(dailyMode ? 'Switch games?' : 'Start a new game?', dailyMode ? 'Your Daily Challenge progress will be protected and restored when you return.' : 'Changing mode resets the current scorecard.', [
      { text: 'Cancel', style: 'cancel' }, { text: dailyMode ? 'Switch Game' : 'Change Mode', style: dailyMode ? 'default' : 'destructive', onPress: () => void applyMode(mode) },
    ]); else void applyMode(mode);
  };
  useEffect(() => { if (dailyLaunchRequest > 0) changeMode('daily'); }, [dailyLaunchRequest]);
  useEffect(() => {
    if (!dailyMode) return;
    const advanceDailyChallenge = () => { if (dailyDate !== localDateKey()) clearGame(); };
    const timer = setInterval(advanceDailyChallenge, 30_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') advanceDailyChallenge(); });
    return () => { clearInterval(timer); subscription.remove(); };
    // clearGame intentionally resets the mounted challenge when its local day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyDate, dailyMode]);

  const shareScorecard = async () => {
    if (!complete) return;
    const resultFor = (player: Player) => {
      const scoreFor = (category: Category) => histories[player].find((entry) => entry.category === category)?.score ?? 0;
      const upper = upperCategories.map((category) => `${categoryLabels[category].padEnd(13)} ${scoreFor(category)}`).join('\n');
      const lower = categories.slice(6).map((category) => `${categoryLabels[category].padEnd(13)} ${scoreFor(category)}`).join('\n');
      return [
        twoPlayer ? computerOpponent ? player === 1 ? 'YOU' : 'COMPUTER' : `PLAYER ${player}` : 'FINAL SCORE',
        '────────────────────',
        `${totals[player]} POINTS`,
        '',
        'UPPER SECTION',
        upper,
        `Subtotal      ${upperSubtotals[player]}`,
        `Bonus         ${bonuses[player] ? `+${upperBonusPoints}` : '—'}`,
        '',
        'LOWER SECTION',
        lower,
      ].join('\n');
    };
    const players = ([1, ...(twoPlayer ? [2] : [])] as Player[]).map(resultFor).join('\n\n════════════════════\n\n');
    const headline = dailyMode ? `DAILY CHALLENGE · ${dailyDate}` : twoPlayer ? winner.toUpperCase() : 'GAME COMPLETE';
    await Share.share({
      title: 'Yahtzee result',
      message: `YAHTZEE HUB!\n${headline}\n════════════════════\n\n${players}${dailyStanding ? `\n\n${dailyStanding}` : ''}\n\n════════════════════\nCan you beat this score?`,
    });
  };

  const sendScore = async () => {
    if (!user) return Alert.alert('Sign in required', 'Open Account and sign in before submitting.');
    setSubmitting(true);
    try {
      const network = await NetInfo.fetch();
      if (!network.isConnected || network.isInternetReachable === false) {
        await queueScore({ id: gameId, score: totals[1], userId: user.userId });
        setQueued(true);
        showToast(`${totals[1]} points queued — you can start a new game`);
        return;
      }
      await submitScore(gameId, totals[1], user.userId);
      setSubmitted(true);
      showToast(`${totals[1]} points submitted to the leaderboard`);
    } catch (error) {
      if (isRetryableScoreError(error)) {
        await queueScore({ id: gameId, score: totals[1], userId: user.userId });
        setQueued(true);
        showToast(`${totals[1]} points queued — it will submit automatically`);
      } else {
        Alert.alert('Submission failed', error instanceof Error ? error.message : 'Please try again.');
      }
    }
    finally { setSubmitting(false); }
  };

  useEffect(() => {
    const leaderboardEligible = !dailyMode && !twoPlayer;
    if (!hydrated || !complete || !leaderboardEligible || !user || submitting || submitted || queued) return;
    void sendScore();
    // sendScore intentionally runs once for this persisted game ID. Its status
    // flags prevent re-renders from creating another submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, computerOpponent, dailyMode, gameId, hydrated, queued, submitted, submitting, twoPlayer, user]);

  const winner = twoPlayer && complete ? totals[1] === totals[2] ? 'Draw game' : totals[1] > totals[2] ? 'Player 1 wins' : computerOpponent ? 'Computer wins' : 'Player 2 wins' : 'Game complete';

  if (!showModeChooser && dailyMode && (checkingDailyCompletion || dailyAlreadyCompleted) && !complete) return <View style={styles.gameContainer}><View style={styles.dailyCompleteCard}><View style={styles.dailyCompleteIcon}><Ionicons name={checkingDailyCompletion ? 'sync-outline' : 'lock-closed'} size={28} color={colors.yellow} /></View><Text style={styles.dailyCompleteEyebrow}>DAILY CHALLENGE · {dailyDate}</Text><Text style={styles.dailyCompleteTitle}>{checkingDailyCompletion ? 'Checking today’s result…' : 'Challenge completed'}</Text>{dailyCompletedResult && <View style={styles.dailyResultPanel}><View style={styles.dailyResultPrimary}><Text style={styles.dailyResultLabel}>YOUR SCORE</Text><Text style={styles.dailyResultScore}>{dailyCompletedResult.score}</Text></View><View style={styles.dailyResultDivider} /><View style={styles.dailyResultItem}><Text style={styles.dailyResultLabel}>TODAY</Text><Text style={styles.dailyResultValue}>#{dailyCompletedRank}</Text></View><View style={styles.dailyResultDivider} /><View style={styles.dailyResultItem}><Text style={styles.dailyResultLabel}>YAHTZEES</Text><Text style={styles.dailyResultValue}>{dailyCompletedResult.yahtzeeCount ?? 0}</Text></View></View>}<Text style={styles.dailyCompleteCopy}>{checkingDailyCompletion ? 'Making sure this account has not already played today.' : dailyCompletedResult?.earnedUpperBonus ? 'You earned the upper-section bonus. Come back tomorrow for a new sequence.' : 'Come back tomorrow for a new fixed-roll sequence.'}</Text>{!checkingDailyCompletion && <><Pressable onPress={onOpenDailyLeaderboard} style={styles.dailyLeaderboardButton}><Ionicons name="trophy-outline" size={18} color={colors.yellow} /><Text style={styles.dailyLeaderboardButtonText}>View today’s leaderboard</Text><Ionicons name="chevron-forward" size={17} color={colors.yellow} /></Pressable><Pressable onPress={() => setShowModeChooser(true)} style={styles.dailyCompleteButton}><Ionicons name="grid-outline" size={18} color={colors.cyan} /><Text style={styles.dailyCompleteButtonText}>Choose another game</Text></Pressable></>}</View></View>;

  const scorecardContent = (player: Player) => {
    const profile = player === 1 ? playerProfiles[0] : secondPlayerProfile;
    return <>
    <View style={styles.scorecardOverview}>
      <View style={styles.overviewItem}><Text style={styles.overviewLabel}>Total</Text><Text style={[styles.overviewTotal, { color: profile.score }]}>{totals[player]}</Text></View>
      <View style={styles.overviewDivider} />
      <View style={styles.overviewItem}><Text style={styles.overviewLabel}>Filled</Text><Text style={styles.overviewValue}>{histories[player].length} / {categories.length}</Text></View>
      <View style={styles.overviewDivider} />
      <View style={styles.overviewItem}><Text style={styles.overviewLabel}>Upper</Text><Text style={styles.overviewValue}>{upperSubtotals[player]} / {upperBonusThreshold}</Text></View>
    </View>
    <View style={[styles.bonusRow, bonuses[player] > 0 && styles.bonusRowEarned]}><View style={styles.bonusCopy}><Ionicons name={bonuses[player] > 0 ? 'checkmark-circle' : 'star-outline'} size={17} color={bonuses[player] > 0 ? colors.cyan : colors.muted} /><Text style={styles.bonusLabel}>Upper-section bonus</Text></View><Text style={[styles.bonusValue, bonuses[player] > 0 && styles.bonusEarned]}>{bonuses[player] > 0 ? `+${bonuses[player]}` : `${Math.max(0, upperBonusThreshold - upperSubtotals[player])} needed`}</Text></View>
    <View style={styles.sheetScoreColumns}><View style={styles.sheetScoreColumn}><Text style={styles.scoreGroupTitle}>Upper section</Text>
    {upperCategories.map((category) => { const entry = histories[player].find((item) => item.category === category); return <View key={category} style={styles.sheetScoreRow}><Text numberOfLines={1} style={styles.sheetCategory}>{category}</Text><Text style={[styles.sheetScore, { color: profile.score }]}>{entry?.score ?? '—'}</Text></View>; })}</View>
    <View style={styles.sheetScoreColumn}><Text style={styles.scoreGroupTitle}>Lower section</Text>
    {categories.slice(6).map((category) => { const entry = histories[player].find((item) => item.category === category); return <View key={category} style={styles.sheetScoreRow}><Text numberOfLines={1} style={styles.sheetCategory}>{categoryLabels[category]}</Text><Text style={[styles.sheetScore, { color: profile.score }]}>{entry?.score ?? '—'}</Text></View>; })}</View></View>
    <View style={[styles.sheetTotalRow, { borderTopColor: profile.accent }]}><Text style={[styles.sheetTotalLabel, { color: profile.accent }]}>Total score</Text><Text style={[styles.sheetTotal, { color: profile.score }]}>{totals[player]}</Text></View>
  </>;
  };

  if (showModeChooser) return <GameModeChooser onChange={changeMode} />;
  if (scorekeeperMode) return <View style={styles.gameContainer}><RealDiceScreen onOpenSettings={() => setShowModeChooser(true)} /></View>;
  if (virtualDiceMode) return <View style={styles.gameContainer}><VirtualDiceScreen diceAnimation={diceAnimation} onOpenSettings={() => setShowModeChooser(true)} /></View>;

  return <View style={styles.gameContainer}>
    <Animated.View accessibilityLiveRegion="polite" pointerEvents="none" style={[styles.toast, { opacity: toastOpacity, transform: [{ translateY: toastY }] }]}><Ionicons name="checkmark-circle" size={22} color={colors.background} /><Text style={styles.toastText}>{toastMessage}</Text></Animated.View>

    <View style={[styles.turnControls, dailyMode && styles.dailyTurnControls]}>
      <View style={styles.turnHeadingRow}><View><Text style={[styles.title, { color: currentProfile.score }]}>{isComputerTurn ? "Computer's turn" : computerOpponent || dailyMode || !twoPlayer ? 'Your turn' : `Player ${currentPlayer}'s turn`}</Text><Text style={styles.progress}>{dailyMode ? `${dailyDate} · ` : ''}Round {currentRound} of {categories.length}</Text></View>{isComputerTurn && <View style={[styles.computerBadge, { backgroundColor: computerProfile.soft }]}><Ionicons name="hardware-chip-outline" size={13} color={computerProfile.accent} /><Text style={[styles.computerBadgeText, { color: computerProfile.accent }]}>Thinking</Text></View>}</View>
      <View style={styles.diceRow}>{dice.map((die, index) => <AnimatedDie key={index} value={die} index={index} held={held.has(index)} rollToken={rollToken} canHold={hasRolled && !complete && !isComputerTurn} reduceMotion={reduceMotion} resetPosition={!hasRolled} animation={diceAnimation} accentColor={currentProfile.accent} heldColor={dailyMode ? colors.pink : colors.yellow} softColor={colors.background} onPress={() => toggleHeld(index)} />)}</View>
      <View style={styles.rollMeta}><Text style={[styles.help, { color: currentProfile.accent }]}>{isComputerTurn ? hasRolled ? 'Computer is choosing dice' : 'Computer is preparing' : hasRolled ? 'Tap dice to hold' : 'Roll to begin'}</Text><View accessibilityLabel={`${rollsLeft} rolls remaining`} style={styles.rollDots}>{[0, 1, 2].map((dot) => <View key={dot} style={[styles.rollDot, dot < rollsLeft && { backgroundColor: currentProfile.accent, borderColor: currentProfile.accent }]} />)}</View></View>
      {hasRolled && !holdTipSeen && !isComputerTurn && <View style={styles.coachmark}><Ionicons name="hand-left-outline" size={18} color={colors.yellow} /><Text style={styles.coachmarkText}>Tap any dice you want to hold, then roll again. Held dice turn yellow.</Text><Pressable onPress={() => { setHoldTipSeen(true); void AsyncStorage.setItem('yahtzee.tip.hold-dice.v1', 'true'); }}><Text style={styles.coachmarkAction}>Got it</Text></Pressable></View>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Roll dice, ${rollsLeft} rolls remaining`} disabled={rollsLeft === 0 || complete || isComputerTurn} onPress={roll} style={({ pressed }) => [styles.primaryButton, { backgroundColor: currentProfile.accent, shadowColor: currentProfile.accent }, arcadeMode && styles.arcadePrimaryButton, arcadeMode && { borderColor: currentProfile.score }, (rollsLeft === 0 || complete || isComputerTurn) && styles.disabled, pressed && styles.pressed]}><View style={styles.buttonContent}>{arcadeMode && <Text style={[styles.arcadePrompt, { color: currentProfile.score }]}>&gt;</Text>}<Ionicons name={isComputerTurn ? 'hardware-chip-outline' : 'dice'} size={22} color={colors.background} /><Text style={[styles.primaryText, arcadeMode && styles.arcadePrimaryText]}>{isComputerTurn ? 'Computer Playing' : hasRolled ? 'Roll Again' : 'Roll Dice'}</Text>{arcadeMode && <Text style={[styles.arcadeCursor, { color: colors.background }]}>_</Text>}</View></Pressable>
      <View style={styles.compactSummary}>
        {scoreSuggestionsEnabled && <Text style={styles.compactLabel}>Best now <Text style={[styles.compactValue, { color: currentProfile.score }]}>{currentScore}</Text></Text>}
        <Text style={styles.compactLabel}>{isComputerTurn ? 'Computer' : 'Total'} <Text style={[styles.compactValue, { color: currentProfile.score }]}>{totals[currentPlayer]}</Text></Text>
        {twoPlayer && <Text style={styles.compactLabel}>{computerOpponent ? currentPlayer === 1 ? 'Computer' : 'You' : `P${currentPlayer === 1 ? 2 : 1}`} <Text style={[styles.compactValue, { color: currentPlayer === 1 ? secondPlayerProfile.score : playerProfiles[0].score }]}>{totals[currentPlayer === 1 ? 2 : 1]}</Text></Text>}
        {dailyMode && scores.length > 0 && !complete && <Pressable accessibilityRole="button" accessibilityLabel={user ? 'View today’s round ranking' : 'Sign in to view today’s round ranking'} onPress={user ? () => {
          if (!dailyRoundStanding) {
            Alert.alert('Daily position', dailyStandingLoading ? 'Your latest position is being calculated.' : 'Your position is unavailable right now. Please try again after the next round.');
            return;
          }
          const heading = dailyRoundStanding.playerCount >= 5 ? `Top ${dailyRoundStanding.percentile}% after Round ${dailyRoundStanding.round}` : `#${dailyRoundStanding.rank} after Round ${dailyRoundStanding.round}`;
          const detail = `You are #${dailyRoundStanding.rank} of ${dailyRoundStanding.playerCount} ${dailyRoundStanding.playerCount === 1 ? 'player' : 'players'} at the same stage today.${dailyRoundStanding.playerCount < 5 ? ' Percentiles appear once five players reach this round.' : ''}`;
          Alert.alert(heading, detail);
        } : () => onOpenAccount?.(true)} style={({ pressed }) => [styles.compactPosition, pressed && styles.pressed]}>
          <Ionicons name={user ? 'stats-chart' : 'person-outline'} size={12} color={colors.pink} />
          <Text style={styles.compactLabel}>Position <Text style={styles.compactPositionValue}>{user ? dailyStandingLoading && !dailyRoundStanding ? '…' : dailyRoundStanding ? dailyRoundStanding.playerCount >= 5 ? `Top ${dailyRoundStanding.percentile}%` : `#${dailyRoundStanding.rank}` : '—' : 'Sign in'}</Text></Text>
        </Pressable>}
      </View>
    </View>

    <ScrollView contentContainerStyle={[styles.content, selectedCategory && styles.contentWithLock]}>
      {complete ? <View style={styles.completeCard}>
        <View style={styles.completeIcon}><Ionicons name="trophy-outline" size={34} color={colors.yellow} /></View><Text style={styles.completeTitle}>{winner}</Text>
        {twoPlayer ? <View style={styles.finalTotals}><Text style={[styles.playerOneText, { color: playerProfiles[0].accent }]}>{computerOpponent ? 'You' : 'Player 1'} · {totals[1]}</Text><Text style={[styles.playerTwoText, { color: secondPlayerProfile.accent }]}>{computerOpponent ? 'Computer' : 'Player 2'} · {totals[2]}</Text></View> : <Text style={styles.finalScore}>{totals[1]}</Text>}
        <Text style={styles.completeCopy}>{dailyStanding || (bonuses[1] ? `Includes the ${upperBonusPoints}-point upper-section bonus.` : 'Final scorecard complete.')}</Text>
        {dailyMode && <Pressable onPress={onOpenDailyLeaderboard} style={[styles.dailyLeaderboardButton, arcadeMode && styles.arcadeSecondaryButton]}><Ionicons name="trophy-outline" size={18} color={colors.yellow} /><Text style={styles.dailyLeaderboardButtonText}>View today’s leaderboard</Text><Ionicons name="chevron-forward" size={17} color={colors.yellow} /></Pressable>}
        {!user && !twoPlayer && <View style={styles.postGamePrompt}><Ionicons name="cloud-upload-outline" size={22} color={colors.cyan} /><View style={styles.postGameCopy}><Text style={styles.postGameTitle}>Save this score</Text><Text style={styles.postGameText}>Create your player profile now. This completed game will be saved automatically after sign-up.</Text></View><Pressable onPress={() => onOpenAccount?.(true)} style={styles.postGameButton}><Text style={styles.postGameButtonText}>Create profile</Text></Pressable></View>}
        {dailyMode && !remindersEnabled && <View style={styles.postGamePrompt}><Ionicons name="notifications-outline" size={22} color={colors.yellow} /><View style={styles.postGameCopy}><Text style={styles.postGameTitle}>Come back tomorrow</Text><Text style={styles.postGameText}>Get a reminder when the next Daily Challenge is waiting.</Text></View><Pressable onPress={onRequestReminders} style={styles.postGameButton}><Text style={styles.postGameButtonText}>Remind me</Text></Pressable></View>}
        {user && !dailyMode && (!twoPlayer || computerOpponent) && <View style={styles.autoSaveStatus}><Ionicons name={submitted ? 'checkmark-circle' : queued ? 'cloud-done-outline' : submitting ? 'cloud-upload-outline' : 'alert-circle-outline'} size={18} color={submitted ? colors.cyan : queued ? colors.yellow : colors.muted} /><Text style={styles.autoSaveText}>{submitted ? 'Score saved automatically' : queued ? 'Score safely queued for upload' : submitting ? 'Saving score automatically…' : 'Preparing to save score…'}</Text></View>}
        {queued && <Text style={styles.queueHint}>Safe on this device. It will upload when this account is online.</Text>}
        <View style={styles.completeActions}><Pressable onPress={() => void shareScorecard()} style={[styles.secondaryButton, arcadeMode && styles.arcadeSecondaryButton]}><Ionicons name="share-outline" size={19} color={colors.cyan} /><Text style={styles.secondaryText}>Share</Text></Pressable><Pressable disabled={!dailyMode && Boolean(user) && (!twoPlayer || computerOpponent) && submitting} onPress={dailyMode ? () => setShowModeChooser(true) : clearGame} style={[styles.newGameButton, arcadeMode && styles.arcadeFilledButton, !dailyMode && Boolean(user) && (!twoPlayer || computerOpponent) && submitting && styles.disabled]}><Ionicons name={dailyMode ? 'grid-outline' : 'refresh'} size={19} color={colors.background} /><Text style={styles.newGameText}>{dailyMode ? 'Other Games' : 'New Game'}</Text></Pressable></View>
      </View> : <>
        <View style={styles.sectionHeadingRow}><View><Text style={[styles.sectionTitle, { color: currentProfile.accent }]}>{isComputerTurn ? 'Computer strategy' : 'Choose a category'}</Text><Text style={styles.sectionSubtitle}>{isComputerTurn ? 'Watch the computer roll, hold and choose.' : hasRolled ? 'Tap once to preview, then lock it in.' : 'Categories unlock after your first roll.'}</Text></View>{recommendedCategory && !isComputerTurn && <View style={styles.recommendedLegend}><Ionicons name="sparkles" size={14} color={dailyMode ? colors.pink : colors.yellow} /><Text style={[styles.recommendedLegendText, dailyMode && { color: colors.pink }]}>Best</Text></View>}</View>
        <View style={styles.categoryGrid}>{categories.map((category) => {
          const entry = scores.find((item) => item.category === category); const preview = hasRolled ? scoreCategory(category, dice) : 0;
          const selected = selectedCategory === category; const recommended = recommendedCategory === category && !entry;
          return <Pressable accessibilityRole="button" accessibilityLabel={`${category}, ${entry ? `${entry.score} points, used` : `${preview} points`}${recommended ? ', best available score' : ''}`} accessibilityState={{ disabled: !hasRolled || Boolean(entry) || isComputerTurn, selected }} key={category} disabled={!hasRolled || Boolean(entry) || isComputerTurn} onPress={() => setSelectedCategory(category)} style={[styles.category, arcadeMode && styles.arcadeCategory, category === 'Chance' && styles.chanceCategory, entry && styles.usedCategory, recommended && !isComputerTurn && styles.recommendedCategory, recommended && dailyMode && { borderColor: colors.pink, shadowColor: colors.pink }, selected && styles.selectedCategory, selected && { borderColor: currentProfile.accent, backgroundColor: currentProfile.soft, shadowColor: currentProfile.accent }]}>
            <Text numberOfLines={2} style={[styles.categoryName, entry && styles.usedText]}>{categoryLabels[category]}</Text><View style={[styles.scoreBadge, { backgroundColor: currentProfile.soft }, entry && styles.usedBadge, preview === 0 && !entry && styles.zeroBadge]}><Text style={[styles.scoreBadgeText, { color: currentProfile.accent }, entry && styles.usedText]}>{entry?.score ?? preview}</Text></View>{recommended && <Ionicons name="sparkles" size={12} color={dailyMode ? colors.pink : colors.yellow} style={styles.recommendedIcon} />}
          </Pressable>;
        })}</View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open scorecard" onPress={() => setShowScorecard(true)} style={[styles.gameActionButton, arcadeMode && styles.arcadeActionButton, { borderColor: currentProfile.accent }]}><Ionicons name="list-outline" size={18} color={currentProfile.accent} /><Text style={[styles.gameActionText, { color: currentProfile.accent }]}>Scorecard</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose another game" onPress={() => setShowModeChooser(true)} style={[styles.gameActionButton, arcadeMode && styles.arcadeActionButton]}><Ionicons name="grid-outline" size={18} color={colors.mint} /><Text style={styles.gameActionText}>Choose game</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={dailyMode ? 'Daily Challenge restart protection' : 'Reset game'} onPress={dailyMode ? dailyResetInfo : reset} style={[styles.gameActionButton, arcadeMode && styles.arcadeActionButton, dailyMode && styles.protectedAction]}><Ionicons name={dailyMode ? 'shield-checkmark-outline' : 'refresh-outline'} size={18} color={dailyMode ? colors.yellow : colors.muted} /><Text style={[styles.gameActionText, dailyMode ? styles.protectedActionText : styles.resetText]}>{dailyMode ? 'Protected' : 'Reset'}</Text></Pressable>
        </View>
      </>}
    </ScrollView>

    {selectedCategory && !complete && !isComputerTurn && <View style={[styles.lockBar, arcadeMode && styles.arcadeLockBar, { borderColor: currentProfile.accent, shadowColor: currentProfile.accent }]}><View><Text style={styles.lockLabel}>{selectedCategory}</Text><Text style={[styles.lockScore, { color: currentProfile.score }]}>{scoreCategory(selectedCategory, dice)} points</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Lock in ${selectedCategory} for ${scoreCategory(selectedCategory, dice)} points`} onPress={lockScore} style={[styles.lockButton, arcadeMode && styles.arcadeLockButton, { backgroundColor: currentProfile.accent, borderColor: currentProfile.score }]}><Ionicons name="lock-closed" size={18} color={colors.background} /><Text style={styles.lockButtonText}>{arcadeMode ? '> LOCK IN_' : 'Lock In'}</Text></Pressable></View>}

    <Modal transparent animationType="none" visible={showScorecard} onShow={() => scorecardY.setValue(0)} onDismiss={() => scorecardY.setValue(0)} onRequestClose={closeScorecard}>
      <View style={styles.sheetBackdrop}><Pressable accessibilityLabel="Close scorecard" style={styles.sheetDismissArea} onPress={closeScorecard} /><Animated.View style={[styles.sheet, { transform: [{ translateY: scorecardY }] }]}>
        <SafeAreaView style={styles.sheetSafeArea}>
        <View collapsable={false} {...scorecardPanResponder.panHandlers} style={styles.sheetGrabber} accessibilityRole="adjustable" accessibilityLabel="Drag down to close scorecard"><View style={styles.sheetHandle} /></View>
        <View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Scorecard</Text><Text style={styles.sheetSubtitle}>{twoPlayer ? computerOpponent ? viewingPlayer === 1 ? 'You' : 'Computer' : `Player ${viewingPlayer}` : 'Single Player'} · Round {Math.min(histories[viewingPlayer].length + 1, categories.length)} of {categories.length}</Text></View></View>
        {twoPlayer && <View style={styles.scorecardTabs}><Pressable onPress={() => setViewingPlayer(1)} style={[styles.scorecardTab, viewingPlayer === 1 && styles.scorecardTabActive, viewingPlayer === 1 && { borderColor: playerProfiles[0].accent }]}><Text style={[styles.muted, viewingPlayer === 1 && { color: playerProfiles[0].accent }]}>{computerOpponent ? 'You' : 'Player 1'}</Text></Pressable><Pressable onPress={() => setViewingPlayer(2)} style={[styles.scorecardTab, viewingPlayer === 2 && styles.scorecardTabActive, viewingPlayer === 2 && { borderColor: secondPlayerProfile.accent }]}><Text style={[styles.muted, viewingPlayer === 2 && { color: secondPlayerProfile.accent }]}>{computerOpponent ? 'Computer' : 'Player 2'}</Text></Pressable></View>}
        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.sheetContent}>{scorecardContent(viewingPlayer)}</ScrollView>
        </SafeAreaView>
      </Animated.View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  gameContainer: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 }, contentWithLock: { paddingBottom: 105 },
  dailyCompleteCard: { flex: 1, margin: 18, padding: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderColor: '#315a5e', borderWidth: 1, backgroundColor: colors.surface }, dailyCompleteIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#313514' }, dailyCompleteEyebrow: { color: colors.pink, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginTop: 18 }, dailyCompleteTitle: { color: colors.yellow, fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 5 }, dailyResultPanel: { width: '100%', maxWidth: 350, minHeight: 80, flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingVertical: 10, borderRadius: 14, borderColor: '#26383c', borderWidth: 1, backgroundColor: colors.background }, dailyResultPrimary: { flex: 1.25, alignItems: 'center' }, dailyResultItem: { flex: 1, alignItems: 'center' }, dailyResultDivider: { width: 1, height: 42, backgroundColor: '#2d3c40' }, dailyResultLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: .8 }, dailyResultScore: { color: colors.yellow, fontSize: 27, fontWeight: '900', marginTop: 2 }, dailyResultValue: { color: colors.cyan, fontSize: 19, fontWeight: '900', marginTop: 4 }, dailyCompleteCopy: { maxWidth: 330, color: colors.mint, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 12 }, dailyCompleteButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderColor: colors.cyan, borderWidth: 1, borderRadius: 11, paddingHorizontal: 15, paddingVertical: 12, marginTop: 20 }, dailyCompleteButtonText: { color: colors.cyan, fontWeight: '900' },
  toast: { position: 'absolute', zIndex: 20, bottom: 10, left: 14, right: 14, minHeight: 72, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.yellow, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: colors.yellow, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 12 }, toastText: { color: colors.background, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  turnControls: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, backgroundColor: colors.background, borderBottomColor: '#253438', borderBottomWidth: 1 },
  dailyTurnControls: { backgroundColor: '#121306', borderBottomColor: '#656a13' },
  chooserContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 38 }, chooserEyebrow: { color: colors.pink, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' }, chooserTitle: { color: colors.yellow, fontSize: 27, fontWeight: '900', marginTop: 4 }, chooserIntro: { color: colors.mint, fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 430 }, chooserSection: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 }, choiceList: { gap: 9 }, gameChoice: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 15, borderColor: '#2d3c40', borderWidth: 1, backgroundColor: colors.surface }, toolChoice: { minHeight: 86, backgroundColor: '#101516' }, choicePressed: { opacity: 0.78, transform: [{ scale: 0.985 }] }, choiceIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#20383b' }, toolIcon: { backgroundColor: '#2a2d14' }, choiceCopy: { flex: 1 }, choiceTitle: { color: colors.white, fontSize: 16, fontWeight: '900' }, choiceDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }, choiceArrow: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderColor: colors.cyan, borderWidth: 1 }, toolArrow: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  animationIntro: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: -3, marginBottom: 9 }, animationGrid: { gap: 8, paddingBottom: 10 }, animationChoice: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: '#2d3c40', backgroundColor: colors.surface }, animationChoiceSelected: { borderColor: colors.cyan, backgroundColor: '#172528' }, animationPreview: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }, animationCopy: { flex: 1 }, animationTitle: { color: colors.white, fontSize: 14, fontWeight: '900' }, animationTitleSelected: { color: colors.cyan }, animationDescription: { color: colors.muted, fontSize: 11, marginTop: 3 }, previewDieSlot: { width: 40, height: 40 }, previewDie: { borderRadius: 8, borderWidth: 1.5 },
  turnHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }, title: { color: colors.yellow, fontSize: 21, fontWeight: '900' }, playerTwo: { color: colors.pink }, progress: { color: colors.muted, fontSize: 12, marginTop: 1 }, computerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#34202f', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 }, computerBadgeText: { color: colors.pink, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  diceRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingTop: 10, paddingBottom: 4 }, dieSlot: { width: 50, height: 50 }, heldDieSlot: { transform: [{ translateY: -4 }] }, die: { flex: 1, backgroundColor: colors.cyan, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.35, shadowRadius: 6 }, heldDie: { backgroundColor: colors.yellow, borderColor: colors.pink, shadowColor: colors.yellow, shadowOpacity: 0.85, shadowRadius: 10 }, diePressed: { opacity: 0.78, transform: [{ scale: 0.94 }] },
  arcadeDie: { borderRadius: 1, borderWidth: 3, shadowOpacity: .62, shadowRadius: 0, shadowOffset: { width: 4, height: 4 }, elevation: 7 },
  pipGrid: { width: 33, height: 33, flexDirection: 'row', flexWrap: 'wrap' }, pipCell: { width: 11, height: 11, alignItems: 'center', justifyContent: 'center' }, pip: { width: 6.5, height: 6.5, borderRadius: 3.25, backgroundColor: colors.background }, previewPipGrid: { width: 26, height: 26, flexDirection: 'row', flexWrap: 'wrap' }, previewPipCell: { width: 26 / 3, height: 26 / 3, alignItems: 'center', justifyContent: 'center' }, previewPip: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.background }, smallPipGrid: { width: 18, height: 18, flexDirection: 'row', flexWrap: 'wrap' }, smallPipCell: { width: 6, height: 6, alignItems: 'center', justifyContent: 'center' }, smallPip: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: colors.background }, holdBadge: { position: 'absolute', bottom: -6, backgroundColor: colors.pink, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 }, holdBadgeText: { color: colors.white, fontSize: 7, fontWeight: '900' },
  rollMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }, help: { color: colors.pink, textTransform: 'uppercase', fontWeight: '800', fontSize: 11 }, rollDots: { flexDirection: 'row', gap: 5 }, rollDot: { width: 8, height: 8, borderRadius: 4, borderColor: colors.muted, borderWidth: 1 }, rollDotAvailable: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  coachmark: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 10, borderRadius: 10, borderColor: '#555b1b', borderWidth: 1, backgroundColor: '#272b13' }, coachmarkText: { flex: 1, color: colors.mint, fontSize: 10, lineHeight: 15 }, coachmarkAction: { color: colors.yellow, fontSize: 10, fontWeight: '900' },
  primaryButton: { backgroundColor: colors.cyan, padding: 11, borderRadius: 12, alignItems: 'center', marginTop: 7 }, buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryText: { color: colors.background, fontWeight: '900', fontSize: 16 }, pressed: { opacity: 0.75 }, disabled: { opacity: 0.45 }, compactSummary: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 6 }, compactLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' }, compactValue: { color: colors.yellow, fontSize: 14, fontWeight: '900' }, compactPosition: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 2 }, compactPositionValue: { color: colors.pink, fontSize: 13, fontWeight: '900' },
  arcadePrimaryButton: { borderRadius: 2, borderWidth: 3, paddingVertical: 10, shadowOpacity: .7, shadowRadius: 0, shadowOffset: { width: 4, height: 4 }, elevation: 8 },
  arcadePrimaryText: { letterSpacing: 1.1, textTransform: 'uppercase' },
  arcadePrompt: { color: colors.yellow, fontSize: 18, fontWeight: '900' },
  arcadeCursor: { color: colors.background, fontSize: 17, fontWeight: '900', marginLeft: -3 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }, sectionTitle: { color: colors.yellow, fontSize: 19, fontWeight: '900' }, sectionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 2 }, recommendedLegend: { flexDirection: 'row', alignItems: 'center', gap: 3 }, recommendedLegendText: { color: colors.yellow, fontSize: 10, fontWeight: '800' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 }, category: { width: '32%', minHeight: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 7, borderRadius: 9 }, chanceCategory: { marginLeft: '34%' }, recommendedCategory: { borderColor: colors.yellow, shadowColor: colors.yellow, shadowOpacity: 0.35, shadowRadius: 5 }, selectedCategory: { borderColor: colors.pink, borderWidth: 2, backgroundColor: '#34202f', shadowColor: colors.pink, shadowOpacity: 0.4, shadowRadius: 6 }, usedCategory: { opacity: 0.52, backgroundColor: '#151c1e' }, categoryName: { color: colors.mint, fontWeight: '800', fontSize: 10.5, lineHeight: 13, flex: 1, paddingRight: 3 }, usedText: { color: colors.muted }, scoreBadge: { minWidth: 23, height: 23, borderRadius: 12, backgroundColor: '#20383b', alignItems: 'center', justifyContent: 'center' }, scoreBadgeText: { color: colors.cyan, fontWeight: '900', fontSize: 11 }, zeroBadge: { backgroundColor: '#34202f' }, usedBadge: { backgroundColor: '#273034' }, recommendedIcon: { position: 'absolute', top: 2, right: 2 },
  lockBar: { position: 'absolute', zIndex: 15, left: 14, right: 14, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#162326', borderColor: colors.cyan, borderWidth: 1, borderRadius: 14, padding: 13, shadowColor: colors.cyan, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 10 }, lockLabel: { color: colors.white, fontWeight: '900' }, lockScore: { color: colors.yellow, fontWeight: '800', marginTop: 2 }, lockButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.cyan, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 11 }, lockButtonText: { color: colors.background, fontWeight: '900' },
  arcadeLockBar: { borderRadius: 2, borderWidth: 2, shadowRadius: 0, shadowOpacity: .55, shadowOffset: { width: 4, height: 4 } }, arcadeLockButton: { borderRadius: 1, borderWidth: 2, shadowColor: colors.background, shadowOpacity: .5, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 16 }, gameActionButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderColor: '#315a5e', borderWidth: 1, borderRadius: 11, backgroundColor: colors.surface }, gameActionText: { color: colors.mint, fontSize: 11, fontWeight: '800' }, resetText: { color: colors.muted }, protectedAction: { borderColor: '#656a13', backgroundColor: '#25270d' }, protectedActionText: { color: colors.yellow },
  arcadeActionButton: { borderRadius: 1, borderWidth: 2, shadowColor: colors.cyan, shadowOpacity: .2, shadowRadius: 0, shadowOffset: { width: 2, height: 2 } }, arcadeCategory: { borderRadius: 1, borderWidth: 2 },
  completeCard: { backgroundColor: colors.surface, borderColor: colors.yellow, borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center' }, completeIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#2a2d14', alignItems: 'center', justifyContent: 'center' }, completeTitle: { color: colors.yellow, fontSize: 25, fontWeight: '900', marginTop: 12 }, finalScore: { color: colors.cyan, fontSize: 48, fontWeight: '900', marginTop: 4 }, finalTotals: { flexDirection: 'row', gap: 22, marginTop: 14 }, completeCopy: { color: colors.mint, textAlign: 'center', marginTop: 7, marginBottom: 8 }, autoSaveStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 34, paddingHorizontal: 12 }, autoSaveText: { color: colors.mint, fontSize: 12, fontWeight: '800', textAlign: 'center' }, queueHint: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 2 }, completeActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 10 }, secondaryButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderColor: colors.cyan, borderWidth: 1, borderRadius: 11, padding: 12 }, secondaryText: { color: colors.cyan, fontWeight: '900' }, newGameButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: colors.yellow, borderRadius: 11, padding: 12 }, newGameText: { color: colors.background, fontWeight: '900' }, playerOneText: { color: colors.cyan, fontWeight: '900' }, playerTwoText: { color: colors.pink, fontWeight: '900' }, muted: { color: colors.muted, fontWeight: '800' },
  dailyLeaderboardButton: { width: '100%', minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderColor: '#737a13', borderWidth: 1, borderRadius: 11, backgroundColor: '#24270f', marginTop: 5, paddingHorizontal: 12 }, dailyLeaderboardButtonText: { flex: 1, color: colors.yellow, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  postGamePrompt: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9, padding: 11, borderRadius: 11, borderColor: '#315a5e', borderWidth: 1, backgroundColor: colors.background }, postGameCopy: { flex: 1 }, postGameTitle: { color: colors.white, fontSize: 11, fontWeight: '900' }, postGameText: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 2 }, postGameButton: { borderRadius: 8, backgroundColor: '#20383b', paddingHorizontal: 9, paddingVertical: 8 }, postGameButtonText: { color: colors.cyan, fontSize: 9, fontWeight: '900' },
  arcadeSecondaryButton: { borderRadius: 1, borderWidth: 2, shadowColor: colors.cyan, shadowOpacity: .35, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } }, arcadeFilledButton: { borderRadius: 1, borderWidth: 2, borderColor: colors.cyan, shadowColor: colors.yellow, shadowOpacity: .45, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 10 }, sheetDismissArea: { flex: 1 }, sheet: { maxHeight: '86%', backgroundColor: colors.surface, borderRadius: 24, borderColor: '#315a5e', borderWidth: 1, overflow: 'hidden', shadowColor: colors.cyan, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 5 }, elevation: 16 }, sheetSafeArea: { flexShrink: 1 }, sheetGrabber: { height: 26, alignItems: 'center', justifyContent: 'center' }, sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#5b7075' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 5 }, sheetTitle: { color: colors.yellow, fontSize: 22, fontWeight: '900' }, sheetSubtitle: { color: colors.muted, fontSize: 10, marginTop: 1 }, sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#263337', alignItems: 'center', justifyContent: 'center' }, sheetScroll: { flexShrink: 1 }, sheetContent: { paddingHorizontal: 16, paddingBottom: 14 }, scorecardTabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 5, backgroundColor: colors.background, borderRadius: 9, padding: 2 }, scorecardTab: { flex: 1, alignItems: 'center', padding: 6, borderRadius: 7 }, scorecardTabActive: { backgroundColor: '#20383b' }, scorecardOverview: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 11, borderColor: '#26383c', borderWidth: 1, paddingVertical: 7 }, overviewItem: { flex: 1, alignItems: 'center' }, overviewDivider: { width: 1, backgroundColor: '#2d3c40' }, overviewLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' }, overviewValue: { color: colors.mint, fontSize: 13, fontWeight: '900', marginTop: 1 }, overviewTotal: { color: colors.yellow, fontSize: 16, fontWeight: '900' }, bonusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: colors.background }, bonusRowEarned: { backgroundColor: '#163033' }, bonusCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 }, bonusLabel: { color: colors.muted, fontSize: 10 }, bonusValue: { color: colors.muted, fontSize: 10, fontWeight: '800' }, bonusEarned: { color: colors.cyan }, sheetScoreColumns: { flexDirection: 'row', gap: 16 }, sheetScoreColumn: { flex: 1 }, scoreGroupTitle: { color: colors.pink, fontWeight: '900', fontSize: 11, marginTop: 7, marginBottom: 1 }, sheetScoreRow: { minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderBottomColor: '#2a3639', borderBottomWidth: 1 }, sheetCategory: { flex: 1, color: colors.mint, fontSize: 9.5 }, sheetScore: { color: colors.yellow, fontSize: 10, fontWeight: '900' }, sheetTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopColor: colors.cyan, borderTopWidth: 1, marginTop: 7, paddingTop: 7, paddingBottom: 2 }, sheetTotalLabel: { color: colors.cyan, fontSize: 15, fontWeight: '900' }, sheetTotal: { color: colors.yellow, fontSize: 19, fontWeight: '900' },
});
