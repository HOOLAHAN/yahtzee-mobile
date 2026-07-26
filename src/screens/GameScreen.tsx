import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useAuth } from '../state/AuthContext';
import { colors, computerProfile, playerProfiles } from '../theme';
import { RealDiceScreen } from './RealDiceScreen';

const initialDice: DieFace[] = [1, 1, 1, 1, 1];
const storageKey = 'yahtzee.active-game.v1';
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
type GameMode = 'solo' | 'computer' | 'pass' | 'real';

interface PersistedGame {
  twoPlayer: boolean;
  computerOpponent?: boolean;
  scorekeeperMode?: boolean;
  currentPlayer: Player;
  dice: DieFace[];
  held: number[];
  rollsLeft: number;
  hasRolled: boolean;
  histories: Histories;
  submitted: boolean;
  gameId: string;
}

function PipFace({ value, small = false }: { value: DieFace; small?: boolean }) {
  return <View style={small ? styles.smallPipGrid : styles.pipGrid}>{Array.from({ length: 9 }, (_, cell) => <View key={cell} style={small ? styles.smallPipCell : styles.pipCell}>{pipCells[value].includes(cell) && <View style={small ? styles.smallPip : styles.pip} />}</View>)}</View>;
}

function GameModePicker({ active, onChange }: { active: GameMode; onChange: (mode: GameMode) => void }) {
  const options: { mode: GameMode; label: string }[] = [
    { mode: 'solo', label: 'Solo' }, { mode: 'computer', label: 'Computer' },
    { mode: 'pass', label: 'Pass & Play' }, { mode: 'real', label: 'Real Dice' },
  ];
  return <View style={styles.modePicker}>{options.map((option) => <Pressable key={option.mode} accessibilityRole="button" accessibilityState={{ selected: active === option.mode }} onPress={() => onChange(option.mode)} style={[styles.mode, active === option.mode && styles.modeActive]}><Text style={[styles.modeText, active === option.mode && styles.modeTextActive]}>{option.label}</Text></Pressable>)}</View>;
}

function AnimatedDie({ value, index, held, rollToken, canHold, reduceMotion, accentColor, heldColor, softColor, onPress }: {
  value: DieFace; index: number; held: boolean; rollToken: number; canHold: boolean; reduceMotion: boolean; accentColor: string; heldColor: string; softColor: string; onPress: () => void;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastRollToken = useRef(0);

  useEffect(() => {
    if (rollToken === 0 || lastRollToken.current === rollToken) return;
    lastRollToken.current = rollToken;
    if (held || reduceMotion) return;
    spin.setValue(0); lift.setValue(0); scale.setValue(0.78);
    Animated.parallel([
      Animated.timing(spin, { toValue: 1, duration: 620 + index * 45, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(lift, { toValue: -22 - (index % 2) * 8, duration: 210, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(lift, { toValue: 0, speed: 16, bounciness: 11, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.16, duration: 230, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 12, useNativeDriver: true }),
      ]),
    ]).start();
  }, [held, index, lift, reduceMotion, rollToken, scale, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', index % 2 === 0 ? '720deg' : '-720deg'] });
  return <Animated.View style={[styles.dieSlot, { transform: [{ translateY: lift }, { rotate }, { scale }] }, held && styles.heldDieSlot]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Die ${index + 1}, ${value}${held ? ', held' : ''}`}
      accessibilityHint={canHold ? `Double tap to ${held ? 'release' : 'hold'} this die` : 'Roll before holding dice'}
      accessibilityState={{ disabled: !canHold, selected: held }}
      disabled={!canHold}
      onPress={onPress}
      style={({ pressed }) => [styles.die, { backgroundColor: accentColor, borderColor: accentColor, shadowColor: accentColor }, held && styles.heldDie, held && { backgroundColor: heldColor, borderColor: accentColor, shadowColor: heldColor }, pressed && styles.diePressed]}
    >
      <PipFace value={value} />
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

export function GameScreen() {
  const { user } = useAuth();
  const [twoPlayer, setTwoPlayer] = useState(false);
  const [computerOpponent, setComputerOpponent] = useState(false);
  const [scorekeeperMode, setScorekeeperMode] = useState(false);
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
  const [gameId, setGameId] = useState(() => `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const [hydrated, setHydrated] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [rollToken, setRollToken] = useState(0);
  const [toastMessage, setToastMessage] = useState('');
  const computerTurnRunning = useRef(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(-16)).current;
  const toastAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const scores = histories[currentPlayer];
  const used = useMemo(() => new Set<Category>(scores.map((entry) => entry.category)), [scores]);
  const totals: Record<Player, number> = { 1: totalScore(histories[1]), 2: totalScore(histories[2]) };
  const upperSubtotals: Record<Player, number> = { 1: upperSectionSubtotal(histories[1]), 2: upperSectionSubtotal(histories[2]) };
  const bonuses: Record<Player, number> = { 1: upperSectionBonus(histories[1]), 2: upperSectionBonus(histories[2]) };
  const complete = histories[1].length === categories.length && (!twoPlayer || histories[2].length === categories.length);
  const currentScore = hasRolled ? maximumAvailableScore(dice, used) : 0;
  const currentRound = Math.min(scores.length + 1, categories.length);
  const isComputerTurn = computerOpponent && currentPlayer === 2;
  const secondPlayerProfile = computerOpponent ? computerProfile : playerProfiles[1];
  const currentProfile = currentPlayer === 1 ? playerProfiles[0] : secondPlayerProfile;
  const recommendedCategory = useMemo(() => {
    if (!hasRolled) return null;
    return categories
      .filter((category) => !used.has(category))
      .reduce<Category | null>((best, category) => !best || categoryRecommendationValue(category, dice) > categoryRecommendationValue(best, dice) ? category : best, null);
  }, [dice, hasRolled, used]);

  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((value) => {
      if (!value) return;
      const saved = JSON.parse(value) as PersistedGame;
      if (!Array.isArray(saved.dice) || saved.dice.length !== 5 || !saved.histories) return;
      setTwoPlayer(Boolean(saved.twoPlayer)); setComputerOpponent(Boolean(saved.computerOpponent)); setScorekeeperMode(Boolean(saved.scorekeeperMode)); setCurrentPlayer(saved.currentPlayer === 2 ? 2 : 1); setViewingPlayer(saved.currentPlayer === 2 ? 2 : 1);
      setDice(saved.dice); setHeld(new Set(saved.held ?? [])); setRollsLeft(saved.rollsLeft); setHasRolled(Boolean(saved.hasRolled)); setHistories(saved.histories); setSubmitted(Boolean(saved.submitted));
      if (saved.gameId) setGameId(saved.gameId);
    }).catch(() => undefined).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedGame = { twoPlayer, computerOpponent, scorekeeperMode, currentPlayer, dice, held: [...held], rollsLeft, hasRolled, histories, submitted, gameId };
    void AsyncStorage.setItem(storageKey, JSON.stringify(state));
  }, [computerOpponent, currentPlayer, dice, gameId, hasRolled, held, histories, hydrated, rollsLeft, scorekeeperMode, submitted, twoPlayer]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message); toastAnimation.current?.stop(); toastOpacity.setValue(0); toastY.setValue(-16);
    if (reduceMotion) {
      toastOpacity.setValue(1);
      toastAnimation.current = Animated.sequence([Animated.delay(1300), Animated.timing(toastOpacity, { toValue: 0, duration: 1, useNativeDriver: true })]);
    } else {
      toastAnimation.current = Animated.sequence([
        Animated.parallel([Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }), Animated.spring(toastY, { toValue: 0, speed: 18, bounciness: 7, useNativeDriver: true })]),
        Animated.delay(1450),
        Animated.parallel([Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }), Animated.timing(toastY, { toValue: -12, duration: 220, useNativeDriver: true })]),
      ]);
    }
    toastAnimation.current.start();
  };

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
    setDice((current) => current.map((die, index) => held.has(index) ? die : rollDie())); setRollsLeft((count) => count - 1); setHasRolled(true);
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
    showToast(`${selectedCategory} locked in for ${entry.score} ${entry.score === 1 ? 'point' : 'points'}`);
    setHistories((current) => ({ ...current, [currentPlayer]: [...current[currentPlayer], entry] })); nextRound();
  };

  const clearGame = () => {
    setHistories({ 1: [], 2: [] }); setCurrentPlayer(1); setViewingPlayer(1); setDice(initialDice); setHeld(new Set());
    setRollsLeft(3); setHasRolled(false); setSelectedCategory(null); setSubmitted(false); setShowScorecard(false);
    setGameId(`mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  };

  const reset = () => Alert.alert('Reset game?', 'All scores from this game will be lost.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: clearGame },
  ]);

  const applyMode = (mode: GameMode) => { setTwoPlayer(mode === 'pass' || mode === 'computer'); setComputerOpponent(mode === 'computer'); setScorekeeperMode(mode === 'real'); clearGame(); };
  const changeMode = (mode: GameMode) => {
    const activeMode = scorekeeperMode ? 'real' : computerOpponent ? 'computer' : twoPlayer ? 'pass' : 'solo';
    if (mode === activeMode) return;
    if (histories[1].length || histories[2].length) Alert.alert('Start a new game?', 'Changing mode resets the current scorecard.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Change Mode', style: 'destructive', onPress: () => applyMode(mode) },
    ]); else applyMode(mode);
  };

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
    const headline = twoPlayer ? winner.toUpperCase() : 'GAME COMPLETE';
    await Share.share({
      title: 'Yahtzee result',
      message: `YAHTZEE!\n${headline}\n════════════════════\n\n${players}\n\n════════════════════\nCan you beat this score?`,
    });
  };

  const sendScore = async () => {
    if (!user) return Alert.alert('Sign in required', 'Open Account and sign in before submitting.');
    setSubmitting(true);
    try { await submitScore(gameId, totals[1], user.userId); setSubmitted(true); showToast(`${totals[1]} points submitted to the leaderboard`); }
    catch (error) { Alert.alert('Submission failed', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  };

  const winner = twoPlayer && complete ? totals[1] === totals[2] ? 'Draw game' : totals[1] > totals[2] ? 'Player 1 wins' : computerOpponent ? 'Computer wins' : 'Player 2 wins' : 'Game complete';

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
    <Text style={styles.scoreGroupTitle}>Upper section</Text>
    {upperCategories.map((category) => { const entry = histories[player].find((item) => item.category === category); return <View key={category} style={styles.sheetScoreRow}><Text style={styles.sheetCategory}>{category}</Text><Text style={[styles.sheetScore, { color: profile.score }]}>{entry?.score ?? '—'}</Text></View>; })}
    <Text style={styles.scoreGroupTitle}>Lower section</Text>
    {categories.slice(6).map((category) => { const entry = histories[player].find((item) => item.category === category); return <View key={category} style={styles.sheetScoreRow}><Text style={styles.sheetCategory}>{category}</Text><Text style={[styles.sheetScore, { color: profile.score }]}>{entry?.score ?? '—'}</Text></View>; })}
    <View style={[styles.sheetTotalRow, { borderTopColor: profile.accent }]}><Text style={[styles.sheetTotalLabel, { color: profile.accent }]}>Total score</Text><Text style={[styles.sheetTotal, { color: profile.score }]}>{totals[player]}</Text></View>
  </>;
  };

  const activeMode: GameMode = scorekeeperMode ? 'real' : computerOpponent ? 'computer' : twoPlayer ? 'pass' : 'solo';
  if (scorekeeperMode) return <View style={styles.gameContainer}><View style={styles.scorekeeperModeBar}><GameModePicker active={activeMode} onChange={changeMode} /></View><RealDiceScreen /></View>;

  return <View style={styles.gameContainer}>
    <Animated.View accessibilityLiveRegion="polite" pointerEvents="none" style={[styles.toast, { opacity: toastOpacity, transform: [{ translateY: toastY }] }]}><Ionicons name="checkmark-circle" size={22} color={colors.background} /><Text style={styles.toastText}>{toastMessage}</Text></Animated.View>

    <View style={styles.turnControls}>
      <GameModePicker active={activeMode} onChange={changeMode} />
      <View style={styles.turnHeadingRow}><View><Text style={[styles.title, { color: currentProfile.score }]}>{isComputerTurn ? "Computer's turn" : computerOpponent ? 'Your turn' : twoPlayer ? `Player ${currentPlayer}'s turn` : 'Single Player'}</Text><Text style={styles.progress}>Round {currentRound} of {categories.length}</Text></View>{isComputerTurn && <View style={[styles.computerBadge, { backgroundColor: computerProfile.soft }]}><Ionicons name="hardware-chip-outline" size={13} color={computerProfile.accent} /><Text style={[styles.computerBadgeText, { color: computerProfile.accent }]}>Thinking</Text></View>}</View>
      <View style={styles.diceRow}>{dice.map((die, index) => <AnimatedDie key={index} value={die} index={index} held={held.has(index)} rollToken={rollToken} canHold={hasRolled && !complete && !isComputerTurn} reduceMotion={reduceMotion} accentColor={currentProfile.accent} heldColor={currentProfile.score} softColor={colors.background} onPress={() => toggleHeld(index)} />)}</View>
      <View style={styles.rollMeta}><Text style={[styles.help, { color: currentProfile.accent }]}>{isComputerTurn ? hasRolled ? 'Computer is choosing dice' : 'Computer is preparing' : hasRolled ? 'Tap dice to hold' : 'Roll to begin'}</Text><View accessibilityLabel={`${rollsLeft} rolls remaining`} style={styles.rollDots}>{[0, 1, 2].map((dot) => <View key={dot} style={[styles.rollDot, dot < rollsLeft && { backgroundColor: currentProfile.accent, borderColor: currentProfile.accent }]} />)}</View></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Roll dice, ${rollsLeft} rolls remaining`} disabled={rollsLeft === 0 || complete || isComputerTurn} onPress={roll} style={({ pressed }) => [styles.primaryButton, { backgroundColor: currentProfile.accent, shadowColor: currentProfile.accent }, (rollsLeft === 0 || complete || isComputerTurn) && styles.disabled, pressed && styles.pressed]}><View style={styles.buttonContent}><Ionicons name={isComputerTurn ? 'hardware-chip-outline' : 'dice'} size={22} color={colors.background} /><Text style={styles.primaryText}>{isComputerTurn ? 'Computer Playing' : hasRolled ? 'Roll Again' : 'Roll Dice'}</Text></View></Pressable>
      <View style={styles.compactSummary}><Text style={styles.compactLabel}>Best now <Text style={[styles.compactValue, { color: currentProfile.score }]}>{currentScore}</Text></Text><Text style={styles.compactLabel}>{isComputerTurn ? 'Computer' : 'Total'} <Text style={[styles.compactValue, { color: currentProfile.score }]}>{totals[currentPlayer]}</Text></Text>{twoPlayer && <Text style={styles.compactLabel}>{computerOpponent ? 'You' : `P${currentPlayer === 1 ? 2 : 1}`} <Text style={[styles.compactValue, { color: currentPlayer === 1 ? secondPlayerProfile.score : playerProfiles[0].score }]}>{totals[currentPlayer === 1 ? 2 : 1]}</Text></Text>}</View>
    </View>

    <ScrollView contentContainerStyle={[styles.content, selectedCategory && styles.contentWithLock]}>
      {complete ? <View style={styles.completeCard}>
        <View style={styles.completeIcon}><Ionicons name="trophy-outline" size={34} color={colors.yellow} /></View><Text style={styles.completeTitle}>{winner}</Text>
        {twoPlayer ? <View style={styles.finalTotals}><Text style={[styles.playerOneText, { color: playerProfiles[0].accent }]}>{computerOpponent ? 'You' : 'Player 1'} · {totals[1]}</Text><Text style={[styles.playerTwoText, { color: secondPlayerProfile.accent }]}>{computerOpponent ? 'Computer' : 'Player 2'} · {totals[2]}</Text></View> : <Text style={styles.finalScore}>{totals[1]}</Text>}
        <Text style={styles.completeCopy}>{bonuses[1] ? `Includes the ${upperBonusPoints}-point upper-section bonus.` : 'Final scorecard complete.'}</Text>
        {(!twoPlayer || computerOpponent) && <Pressable disabled={submitting || submitted} onPress={() => void sendScore()} style={[styles.primaryButton, submitted && styles.disabled]}><Text style={styles.primaryText}>{submitted ? 'Submitted' : submitting ? 'Submitting…' : 'Submit Your Score'}</Text></Pressable>}
        <View style={styles.completeActions}><Pressable onPress={() => void shareScorecard()} style={styles.secondaryButton}><Ionicons name="share-outline" size={19} color={colors.cyan} /><Text style={styles.secondaryText}>Share</Text></Pressable><Pressable onPress={clearGame} style={styles.newGameButton}><Ionicons name="refresh" size={19} color={colors.background} /><Text style={styles.newGameText}>New Game</Text></Pressable></View>
      </View> : <>
        <View style={styles.sectionHeadingRow}><View><Text style={styles.sectionTitle}>{isComputerTurn ? 'Computer strategy' : 'Choose a category'}</Text><Text style={styles.sectionSubtitle}>{isComputerTurn ? 'Watch the computer roll, hold and choose.' : hasRolled ? 'Tap once to preview, then lock it in.' : 'Categories unlock after your first roll.'}</Text></View>{recommendedCategory && !isComputerTurn && <View style={styles.recommendedLegend}><Ionicons name="sparkles" size={14} color={colors.yellow} /><Text style={styles.recommendedLegendText}>Best</Text></View>}</View>
        <View style={styles.categoryGrid}>{categories.map((category) => {
          const entry = scores.find((item) => item.category === category); const preview = hasRolled ? scoreCategory(category, dice) : 0;
          const selected = selectedCategory === category; const recommended = recommendedCategory === category && !entry;
          return <Pressable accessibilityRole="button" accessibilityLabel={`${category}, ${entry ? `${entry.score} points, used` : `${preview} points`}${recommended ? ', best available score' : ''}`} accessibilityState={{ disabled: !hasRolled || Boolean(entry) || isComputerTurn, selected }} key={category} disabled={!hasRolled || Boolean(entry) || isComputerTurn} onPress={() => setSelectedCategory(category)} style={[styles.category, category === 'Chance' && styles.chanceCategory, entry && styles.usedCategory, recommended && !isComputerTurn && styles.recommendedCategory, selected && styles.selectedCategory]}>
            <Text numberOfLines={2} style={[styles.categoryName, entry && styles.usedText]}>{categoryLabels[category]}</Text><View style={[styles.scoreBadge, { backgroundColor: currentProfile.soft }, entry && styles.usedBadge, preview === 0 && !entry && styles.zeroBadge]}><Text style={[styles.scoreBadgeText, { color: currentProfile.accent }, entry && styles.usedText]}>{entry?.score ?? preview}</Text></View>{recommended && <Ionicons name="sparkles" size={12} color={colors.yellow} style={styles.recommendedIcon} />}
          </Pressable>;
        })}</View>
        <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Open scorecard" onPress={() => setShowScorecard(true)} style={styles.bottomScorecardButton}><Ionicons name="list-outline" size={17} color={colors.cyan} /><Text style={styles.bottomScorecardText}>Scorecard</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Reset game" onPress={reset} hitSlop={10} style={styles.resetButton}><Ionicons name="refresh-outline" size={14} color={colors.muted} /><Text style={styles.resetText}>Reset</Text></Pressable></View>
      </>}
    </ScrollView>

    {selectedCategory && !complete && !isComputerTurn && <View style={styles.lockBar}><View><Text style={styles.lockLabel}>{selectedCategory}</Text><Text style={styles.lockScore}>{scoreCategory(selectedCategory, dice)} points</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Lock in ${selectedCategory} for ${scoreCategory(selectedCategory, dice)} points`} onPress={lockScore} style={styles.lockButton}><Ionicons name="lock-closed" size={18} color={colors.background} /><Text style={styles.lockButtonText}>Lock In</Text></Pressable></View>}

    <Modal transparent animationType="slide" visible={showScorecard} onRequestClose={() => setShowScorecard(false)}>
      <View style={styles.sheetBackdrop}><Pressable accessibilityLabel="Close scorecard" style={styles.sheetDismissArea} onPress={() => setShowScorecard(false)} /><SafeAreaView style={styles.sheet}>
        <View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Scorecard</Text><Text style={styles.sheetSubtitle}>{twoPlayer ? computerOpponent ? viewingPlayer === 1 ? 'You' : 'Computer' : `Player ${viewingPlayer}` : 'Single Player'} · Round {Math.min(histories[viewingPlayer].length + 1, categories.length)} of {categories.length}</Text></View><Pressable accessibilityLabel="Close scorecard" onPress={() => setShowScorecard(false)} style={styles.sheetClose}><Ionicons name="close" size={23} color={colors.white} /></Pressable></View>
        {twoPlayer && <View style={styles.scorecardTabs}><Pressable onPress={() => setViewingPlayer(1)} style={[styles.scorecardTab, viewingPlayer === 1 && styles.scorecardTabActive, viewingPlayer === 1 && { borderColor: playerProfiles[0].accent }]}><Text style={[styles.muted, viewingPlayer === 1 && { color: playerProfiles[0].accent }]}>{computerOpponent ? 'You' : 'Player 1'}</Text></Pressable><Pressable onPress={() => setViewingPlayer(2)} style={[styles.scorecardTab, viewingPlayer === 2 && styles.scorecardTabActive, viewingPlayer === 2 && { borderColor: secondPlayerProfile.accent }]}><Text style={[styles.muted, viewingPlayer === 2 && { color: secondPlayerProfile.accent }]}>{computerOpponent ? 'Computer' : 'Player 2'}</Text></Pressable></View>}
        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.sheetContent}>{scorecardContent(viewingPlayer)}</ScrollView>
      </SafeAreaView></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  gameContainer: { flex: 1 }, content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 48 }, contentWithLock: { paddingBottom: 105 },
  toast: { position: 'absolute', zIndex: 20, top: 10, left: 24, right: 24, minHeight: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.yellow, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: colors.yellow, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 12 }, toastText: { color: colors.background, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  turnControls: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, backgroundColor: colors.background, borderBottomColor: '#253438', borderBottomWidth: 1 },
  scorekeeperModeBar: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 6, borderBottomColor: '#253438', borderBottomWidth: 1 }, modePicker: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3, gap: 2 }, mode: { flex: 1, minHeight: 31, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 7 }, modeActive: { backgroundColor: colors.cyan }, modeText: { color: colors.muted, fontWeight: '800', fontSize: 9.5, textAlign: 'center' }, modeTextActive: { color: colors.background },
  turnHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }, title: { color: colors.yellow, fontSize: 21, fontWeight: '900' }, playerTwo: { color: colors.pink }, progress: { color: colors.muted, fontSize: 12, marginTop: 1 }, computerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#34202f', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 }, computerBadgeText: { color: colors.pink, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  diceRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingTop: 10, paddingBottom: 4 }, dieSlot: { width: 50, height: 50 }, heldDieSlot: { transform: [{ translateY: -4 }] }, die: { flex: 1, backgroundColor: colors.cyan, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.35, shadowRadius: 6 }, heldDie: { backgroundColor: colors.yellow, borderColor: colors.pink, shadowColor: colors.yellow, shadowOpacity: 0.85, shadowRadius: 10 }, diePressed: { opacity: 0.78, transform: [{ scale: 0.94 }] },
  pipGrid: { width: 33, height: 33, flexDirection: 'row', flexWrap: 'wrap' }, pipCell: { width: 11, height: 11, alignItems: 'center', justifyContent: 'center' }, pip: { width: 6.5, height: 6.5, borderRadius: 3.25, backgroundColor: colors.background }, smallPipGrid: { width: 18, height: 18, flexDirection: 'row', flexWrap: 'wrap' }, smallPipCell: { width: 6, height: 6, alignItems: 'center', justifyContent: 'center' }, smallPip: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: colors.background }, holdBadge: { position: 'absolute', bottom: -6, backgroundColor: colors.pink, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 }, holdBadgeText: { color: colors.white, fontSize: 7, fontWeight: '900' },
  rollMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }, help: { color: colors.pink, textTransform: 'uppercase', fontWeight: '800', fontSize: 11 }, rollDots: { flexDirection: 'row', gap: 5 }, rollDot: { width: 8, height: 8, borderRadius: 4, borderColor: colors.muted, borderWidth: 1 }, rollDotAvailable: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  primaryButton: { backgroundColor: colors.cyan, padding: 11, borderRadius: 12, alignItems: 'center', marginTop: 7 }, buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryText: { color: colors.background, fontWeight: '900', fontSize: 16 }, pressed: { opacity: 0.75 }, disabled: { opacity: 0.45 }, compactSummary: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 }, compactLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' }, compactValue: { color: colors.yellow, fontSize: 14, fontWeight: '900' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }, sectionTitle: { color: colors.yellow, fontSize: 19, fontWeight: '900' }, sectionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 2 }, recommendedLegend: { flexDirection: 'row', alignItems: 'center', gap: 3 }, recommendedLegendText: { color: colors.yellow, fontSize: 10, fontWeight: '800' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 }, category: { width: '32%', minHeight: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 7, borderRadius: 9 }, chanceCategory: { marginLeft: '34%' }, recommendedCategory: { borderColor: colors.yellow, shadowColor: colors.yellow, shadowOpacity: 0.35, shadowRadius: 5 }, selectedCategory: { borderColor: colors.pink, borderWidth: 2, backgroundColor: '#34202f', shadowColor: colors.pink, shadowOpacity: 0.4, shadowRadius: 6 }, usedCategory: { opacity: 0.52, backgroundColor: '#151c1e' }, categoryName: { color: colors.mint, fontWeight: '800', fontSize: 10.5, lineHeight: 13, flex: 1, paddingRight: 3 }, usedText: { color: colors.muted }, scoreBadge: { minWidth: 23, height: 23, borderRadius: 12, backgroundColor: '#20383b', alignItems: 'center', justifyContent: 'center' }, scoreBadgeText: { color: colors.cyan, fontWeight: '900', fontSize: 11 }, zeroBadge: { backgroundColor: '#34202f' }, usedBadge: { backgroundColor: '#273034' }, recommendedIcon: { position: 'absolute', top: 2, right: 2 },
  lockBar: { position: 'absolute', zIndex: 15, left: 14, right: 14, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#162326', borderColor: colors.cyan, borderWidth: 1, borderRadius: 14, padding: 13, shadowColor: colors.cyan, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 10 }, lockLabel: { color: colors.white, fontWeight: '900' }, lockScore: { color: colors.yellow, fontWeight: '800', marginTop: 2 }, lockButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.cyan, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 11 }, lockButtonText: { color: colors.background, fontWeight: '900' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }, bottomScorecardButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderColor: '#315a5e', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 }, bottomScorecardText: { color: colors.cyan, fontSize: 11, fontWeight: '800' }, resetButton: { flexDirection: 'row', gap: 4, paddingHorizontal: 4, paddingVertical: 3, alignItems: 'center' }, resetText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  completeCard: { backgroundColor: colors.surface, borderColor: colors.yellow, borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center' }, completeIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#2a2d14', alignItems: 'center', justifyContent: 'center' }, completeTitle: { color: colors.yellow, fontSize: 25, fontWeight: '900', marginTop: 12 }, finalScore: { color: colors.cyan, fontSize: 48, fontWeight: '900', marginTop: 4 }, finalTotals: { flexDirection: 'row', gap: 22, marginTop: 14 }, completeCopy: { color: colors.mint, textAlign: 'center', marginTop: 7, marginBottom: 8 }, completeActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 10 }, secondaryButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderColor: colors.cyan, borderWidth: 1, borderRadius: 11, padding: 12 }, secondaryText: { color: colors.cyan, fontWeight: '900' }, newGameButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: colors.yellow, borderRadius: 11, padding: 12 }, newGameText: { color: colors.background, fontWeight: '900' }, playerOneText: { color: colors.cyan, fontWeight: '900' }, playerTwoText: { color: colors.pink, fontWeight: '900' }, muted: { color: colors.muted, fontWeight: '800' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 10 }, sheetDismissArea: { flex: 1 }, sheet: { maxHeight: '86%', backgroundColor: colors.surface, borderRadius: 24, borderColor: '#315a5e', borderWidth: 1, paddingTop: 7, overflow: 'hidden', shadowColor: colors.cyan, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 5 }, elevation: 16 }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#45565a', alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 7, paddingBottom: 6 }, sheetTitle: { color: colors.yellow, fontSize: 22, fontWeight: '900' }, sheetSubtitle: { color: colors.muted, fontSize: 10, marginTop: 1 }, sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#263337', alignItems: 'center', justifyContent: 'center' }, sheetScroll: { flexShrink: 1 }, sheetContent: { paddingHorizontal: 16, paddingBottom: 16 }, scorecardTabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 6, backgroundColor: colors.background, borderRadius: 9, padding: 2 }, scorecardTab: { flex: 1, alignItems: 'center', padding: 6, borderRadius: 7 }, scorecardTabActive: { backgroundColor: '#20383b' }, scorecardOverview: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 11, borderColor: '#26383c', borderWidth: 1, paddingVertical: 8 }, overviewItem: { flex: 1, alignItems: 'center' }, overviewDivider: { width: 1, backgroundColor: '#2d3c40' }, overviewLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }, overviewValue: { color: colors.mint, fontSize: 14, fontWeight: '900', marginTop: 1 }, overviewTotal: { color: colors.yellow, fontSize: 17, fontWeight: '900' }, bonusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, backgroundColor: colors.background }, bonusRowEarned: { backgroundColor: '#163033' }, bonusCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 }, bonusLabel: { color: colors.muted, fontSize: 11 }, bonusValue: { color: colors.muted, fontSize: 11, fontWeight: '800' }, bonusEarned: { color: colors.cyan }, scoreGroupTitle: { color: colors.pink, fontWeight: '900', fontSize: 14, marginTop: 7, marginBottom: 1 }, sheetScoreRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomColor: '#2a3639', borderBottomWidth: 1, paddingVertical: 5 }, sheetCategory: { color: colors.mint, fontSize: 12 }, sheetScore: { color: colors.yellow, fontSize: 12, fontWeight: '900' }, sheetTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopColor: colors.cyan, borderTopWidth: 1, marginTop: 8, paddingTop: 8, paddingBottom: 2 }, sheetTotalLabel: { color: colors.cyan, fontSize: 16, fontWeight: '900' }, sheetTotal: { color: colors.yellow, fontSize: 20, fontWeight: '900' },
});
