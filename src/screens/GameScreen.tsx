import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
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
import { colors } from '../theme';

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

interface PersistedGame {
  twoPlayer: boolean;
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

function AnimatedDie({ value, index, held, rollToken, canHold, reduceMotion, onPress }: {
  value: DieFace; index: number; held: boolean; rollToken: number; canHold: boolean; reduceMotion: boolean; onPress: () => void;
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
      style={({ pressed }) => [styles.die, held && styles.heldDie, pressed && styles.diePressed]}
    >
      <PipFace value={value} />
      {held && <View style={styles.holdBadge}><Text style={styles.holdBadgeText}>HELD</Text></View>}
    </Pressable>
  </Animated.View>;
}

export function GameScreen() {
  const { user } = useAuth();
  const [twoPlayer, setTwoPlayer] = useState(false);
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
      setTwoPlayer(Boolean(saved.twoPlayer)); setCurrentPlayer(saved.currentPlayer === 2 ? 2 : 1); setViewingPlayer(saved.currentPlayer === 2 ? 2 : 1);
      setDice(saved.dice); setHeld(new Set(saved.held ?? [])); setRollsLeft(saved.rollsLeft); setHasRolled(Boolean(saved.hasRolled)); setHistories(saved.histories); setSubmitted(Boolean(saved.submitted));
      if (saved.gameId) setGameId(saved.gameId);
    }).catch(() => undefined).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedGame = { twoPlayer, currentPlayer, dice, held: [...held], rollsLeft, hasRolled, histories, submitted, gameId };
    void AsyncStorage.setItem(storageKey, JSON.stringify(state));
  }, [currentPlayer, dice, gameId, hasRolled, held, histories, hydrated, rollsLeft, submitted, twoPlayer]);

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
    if (!hasRolled) return;
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

  const applyMode = (enabled: boolean) => { setTwoPlayer(enabled); clearGame(); };
  const changeMode = (enabled: boolean) => {
    if (enabled === twoPlayer) return;
    if (histories[1].length || histories[2].length) Alert.alert('Start a new game?', 'Changing mode resets the current scorecard.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Change Mode', style: 'destructive', onPress: () => applyMode(enabled) },
    ]); else applyMode(enabled);
  };

  const shareScorecard = async () => {
    if (!complete) return;
    const resultFor = (player: Player) => {
      const scoreFor = (category: Category) => histories[player].find((entry) => entry.category === category)?.score ?? 0;
      const upper = upperCategories.map((category) => `${categoryLabels[category].padEnd(13)} ${scoreFor(category)}`).join('\n');
      const lower = categories.slice(6).map((category) => `${categoryLabels[category].padEnd(13)} ${scoreFor(category)}`).join('\n');
      return [
        twoPlayer ? `PLAYER ${player}` : 'FINAL SCORE',
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

  const winner = twoPlayer && complete ? totals[1] === totals[2] ? 'Draw game' : `Player ${totals[1] > totals[2] ? 1 : 2} wins` : 'Game complete';

  const scorecardContent = (player: Player) => <>
    <View style={styles.sectionSummary}><Text style={styles.sectionSummaryLabel}>Upper section</Text><Text style={styles.sectionSummaryValue}>{upperSubtotals[player]} / {upperBonusThreshold}</Text></View>
    <View style={styles.bonusRow}><Text style={styles.bonusLabel}>Upper bonus</Text><Text style={[styles.bonusValue, bonuses[player] > 0 && styles.bonusEarned]}>{bonuses[player] > 0 ? `+${bonuses[player]}` : 'Not earned'}</Text></View>
    <Text style={styles.scoreGroupTitle}>Upper section</Text>
    {upperCategories.map((category) => { const entry = histories[player].find((item) => item.category === category); return <View key={category} style={styles.sheetScoreRow}><Text style={styles.sheetCategory}>{category}</Text><Text style={styles.sheetScore}>{entry?.score ?? '—'}</Text></View>; })}
    <Text style={styles.scoreGroupTitle}>Lower section</Text>
    {categories.slice(6).map((category) => { const entry = histories[player].find((item) => item.category === category); return <View key={category} style={styles.sheetScoreRow}><Text style={styles.sheetCategory}>{category}</Text><Text style={styles.sheetScore}>{entry?.score ?? '—'}</Text></View>; })}
    <View style={styles.sheetTotalRow}><Text style={styles.sheetTotalLabel}>Total score</Text><Text style={styles.sheetTotal}>{totals[player]}</Text></View>
  </>;

  return <View style={styles.gameContainer}>
    <Animated.View accessibilityLiveRegion="polite" pointerEvents="none" style={[styles.toast, { opacity: toastOpacity, transform: [{ translateY: toastY }] }]}><Ionicons name="checkmark-circle" size={22} color={colors.background} /><Text style={styles.toastText}>{toastMessage}</Text></Animated.View>

    <View style={styles.turnControls}>
      <View style={styles.modePicker}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !twoPlayer }} onPress={() => changeMode(false)} style={[styles.mode, !twoPlayer && styles.modeActive]}><Text style={[styles.modeText, !twoPlayer && styles.modeTextActive]}>Single Player</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: twoPlayer }} onPress={() => changeMode(true)} style={[styles.mode, twoPlayer && styles.modeActive]}><Text style={[styles.modeText, twoPlayer && styles.modeTextActive]}>Pass & Play</Text></Pressable>
      </View>
      <View style={styles.turnHeadingRow}>
        <View><Text style={[styles.title, currentPlayer === 2 && styles.playerTwo]}>{twoPlayer ? `Player ${currentPlayer}'s turn` : 'Single Player'}</Text><Text style={styles.progress}>Round {currentRound} of {categories.length}</Text></View>
        <Pressable accessibilityLabel="Open scorecard" onPress={() => setShowScorecard(true)} style={styles.scorecardButton}><Ionicons name="list-outline" size={23} color={colors.cyan} /><Text style={styles.scorecardButtonText}>Scorecard</Text></Pressable>
      </View>
      <View style={styles.diceRow}>{dice.map((die, index) => <AnimatedDie key={index} value={die} index={index} held={held.has(index)} rollToken={rollToken} canHold={hasRolled && !complete} reduceMotion={reduceMotion} onPress={() => toggleHeld(index)} />)}</View>
      <View style={styles.rollMeta}><Text style={styles.help}>{hasRolled ? 'Tap dice to hold' : 'Roll to begin'}</Text><View accessibilityLabel={`${rollsLeft} rolls remaining`} style={styles.rollDots}>{[0, 1, 2].map((dot) => <View key={dot} style={[styles.rollDot, dot < rollsLeft && styles.rollDotAvailable]} />)}</View></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Roll dice, ${rollsLeft} rolls remaining`} disabled={rollsLeft === 0 || complete} onPress={roll} style={({ pressed }) => [styles.primaryButton, (rollsLeft === 0 || complete) && styles.disabled, pressed && styles.pressed]}><View style={styles.buttonContent}><Ionicons name="dice" size={22} color={colors.background} /><Text style={styles.primaryText}>{hasRolled ? 'Roll Again' : 'Roll Dice'}</Text></View></Pressable>
      <View style={styles.compactSummary}><Text style={styles.compactLabel}>Best now <Text style={styles.compactValue}>{currentScore}</Text></Text><Text style={styles.compactLabel}>Total <Text style={styles.compactValue}>{totals[currentPlayer]}</Text></Text>{twoPlayer && <Text style={styles.compactLabel}>P{currentPlayer === 1 ? 2 : 1} <Text style={styles.compactValue}>{totals[currentPlayer === 1 ? 2 : 1]}</Text></Text>}</View>
    </View>

    <ScrollView contentContainerStyle={[styles.content, selectedCategory && styles.contentWithLock]}>
      {complete ? <View style={styles.completeCard}>
        <View style={styles.completeIcon}><Ionicons name="trophy-outline" size={34} color={colors.yellow} /></View><Text style={styles.completeTitle}>{winner}</Text>
        {twoPlayer ? <View style={styles.finalTotals}><Text style={styles.playerOneText}>Player 1 · {totals[1]}</Text><Text style={styles.playerTwoText}>Player 2 · {totals[2]}</Text></View> : <Text style={styles.finalScore}>{totals[1]}</Text>}
        <Text style={styles.completeCopy}>{bonuses[1] ? `Includes the ${upperBonusPoints}-point upper-section bonus.` : 'Final scorecard complete.'}</Text>
        {!twoPlayer && <Pressable disabled={submitting || submitted} onPress={() => void sendScore()} style={[styles.primaryButton, submitted && styles.disabled]}><Text style={styles.primaryText}>{submitted ? 'Submitted' : submitting ? 'Submitting…' : 'Submit to Leaderboard'}</Text></Pressable>}
        <View style={styles.completeActions}><Pressable onPress={() => void shareScorecard()} style={styles.secondaryButton}><Ionicons name="share-outline" size={19} color={colors.cyan} /><Text style={styles.secondaryText}>Share</Text></Pressable><Pressable onPress={clearGame} style={styles.newGameButton}><Ionicons name="refresh" size={19} color={colors.background} /><Text style={styles.newGameText}>New Game</Text></Pressable></View>
      </View> : <>
        <View style={styles.sectionHeadingRow}><View><Text style={styles.sectionTitle}>Choose a category</Text><Text style={styles.sectionSubtitle}>{hasRolled ? 'Tap once to preview, then lock it in.' : 'Categories unlock after your first roll.'}</Text></View>{recommendedCategory && <View style={styles.recommendedLegend}><Ionicons name="sparkles" size={14} color={colors.yellow} /><Text style={styles.recommendedLegendText}>Best</Text></View>}</View>
        <View style={styles.categoryGrid}>{categories.map((category) => {
          const entry = scores.find((item) => item.category === category); const preview = hasRolled ? scoreCategory(category, dice) : 0;
          const selected = selectedCategory === category; const recommended = recommendedCategory === category && !entry;
          return <Pressable accessibilityRole="button" accessibilityLabel={`${category}, ${entry ? `${entry.score} points, used` : `${preview} points`}${recommended ? ', best available score' : ''}`} accessibilityState={{ disabled: !hasRolled || Boolean(entry), selected }} key={category} disabled={!hasRolled || Boolean(entry)} onPress={() => setSelectedCategory(category)} style={[styles.category, entry && styles.usedCategory, recommended && styles.recommendedCategory, selected && styles.selectedCategory]}>
            <Text numberOfLines={2} style={[styles.categoryName, entry && styles.usedText]}>{categoryLabels[category]}</Text><View style={[styles.scoreBadge, entry && styles.usedBadge, preview === 0 && !entry && styles.zeroBadge]}><Text style={[styles.scoreBadgeText, entry && styles.usedText]}>{entry?.score ?? preview}</Text></View>{recommended && <Ionicons name="sparkles" size={12} color={colors.yellow} style={styles.recommendedIcon} />}
          </Pressable>;
        })}</View>
        <View style={styles.actions}><Pressable onPress={reset} style={styles.resetButton}><Ionicons name="refresh-outline" size={18} color={colors.danger} /><Text style={styles.resetText}>Reset Game</Text></Pressable></View>
      </>}
    </ScrollView>

    {selectedCategory && !complete && <View style={styles.lockBar}><View><Text style={styles.lockLabel}>{selectedCategory}</Text><Text style={styles.lockScore}>{scoreCategory(selectedCategory, dice)} points</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Lock in ${selectedCategory} for ${scoreCategory(selectedCategory, dice)} points`} onPress={lockScore} style={styles.lockButton}><Ionicons name="lock-closed" size={18} color={colors.background} /><Text style={styles.lockButtonText}>Lock In</Text></Pressable></View>}

    <Modal transparent animationType="slide" visible={showScorecard} onRequestClose={() => setShowScorecard(false)}>
      <View style={styles.sheetBackdrop}><Pressable accessibilityLabel="Close scorecard" style={styles.sheetDismissArea} onPress={() => setShowScorecard(false)} /><View style={styles.sheet}>
        <View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Scorecard</Text><Pressable accessibilityLabel="Close scorecard" onPress={() => setShowScorecard(false)} style={styles.sheetClose}><Ionicons name="close" size={23} color={colors.white} /></Pressable></View>
        {twoPlayer && <View style={styles.scorecardTabs}><Pressable onPress={() => setViewingPlayer(1)} style={[styles.scorecardTab, viewingPlayer === 1 && styles.scorecardTabActive]}><Text style={viewingPlayer === 1 ? styles.playerOneText : styles.muted}>Player 1</Text></Pressable><Pressable onPress={() => setViewingPlayer(2)} style={[styles.scorecardTab, viewingPlayer === 2 && styles.scorecardTabActive]}><Text style={viewingPlayer === 2 ? styles.playerTwoText : styles.muted}>Player 2</Text></Pressable></View>}
        <ScrollView contentContainerStyle={styles.sheetContent}>{scorecardContent(viewingPlayer)}</ScrollView>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  gameContainer: { flex: 1 }, content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 48 }, contentWithLock: { paddingBottom: 105 },
  toast: { position: 'absolute', zIndex: 20, top: 10, left: 24, right: 24, minHeight: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.yellow, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: colors.yellow, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 12 }, toastText: { color: colors.background, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  turnControls: { paddingHorizontal: 14, paddingTop: 7, paddingBottom: 7, backgroundColor: colors.background, borderBottomColor: '#253438', borderBottomWidth: 1 },
  modePicker: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3 }, mode: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 7 }, modeActive: { backgroundColor: colors.cyan }, modeText: { color: colors.muted, fontWeight: '800', fontSize: 12 }, modeTextActive: { color: colors.background },
  turnHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }, title: { color: colors.yellow, fontSize: 19, fontWeight: '900' }, playerTwo: { color: colors.pink }, progress: { color: colors.muted, fontSize: 11, marginTop: 1 }, scorecardButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: '#315a5e', borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 }, scorecardButtonText: { color: colors.cyan, fontWeight: '800', fontSize: 11 },
  diceRow: { flexDirection: 'row', justifyContent: 'center', gap: 9, paddingTop: 7, paddingBottom: 3 }, dieSlot: { width: 46, height: 46 }, heldDieSlot: { transform: [{ translateY: -4 }] }, die: { flex: 1, backgroundColor: colors.cyan, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.35, shadowRadius: 6 }, heldDie: { backgroundColor: colors.yellow, borderColor: colors.pink, shadowColor: colors.yellow, shadowOpacity: 0.85, shadowRadius: 10 }, diePressed: { opacity: 0.78, transform: [{ scale: 0.94 }] },
  pipGrid: { width: 30, height: 30, flexDirection: 'row', flexWrap: 'wrap' }, pipCell: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }, pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.background }, smallPipGrid: { width: 18, height: 18, flexDirection: 'row', flexWrap: 'wrap' }, smallPipCell: { width: 6, height: 6, alignItems: 'center', justifyContent: 'center' }, smallPip: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: colors.background }, holdBadge: { position: 'absolute', bottom: -6, backgroundColor: colors.pink, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 }, holdBadgeText: { color: colors.white, fontSize: 7, fontWeight: '900' },
  rollMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }, help: { color: colors.pink, textTransform: 'uppercase', fontWeight: '800', fontSize: 11 }, rollDots: { flexDirection: 'row', gap: 5 }, rollDot: { width: 8, height: 8, borderRadius: 4, borderColor: colors.muted, borderWidth: 1 }, rollDotAvailable: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  primaryButton: { backgroundColor: colors.cyan, padding: 9, borderRadius: 11, alignItems: 'center', marginTop: 6 }, buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryText: { color: colors.background, fontWeight: '900', fontSize: 15 }, pressed: { opacity: 0.75 }, disabled: { opacity: 0.45 }, compactSummary: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 5 }, compactLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' }, compactValue: { color: colors.yellow, fontSize: 14, fontWeight: '900' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }, sectionTitle: { color: colors.yellow, fontSize: 19, fontWeight: '900' }, sectionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 2 }, recommendedLegend: { flexDirection: 'row', alignItems: 'center', gap: 3 }, recommendedLegendText: { color: colors.yellow, fontSize: 10, fontWeight: '800' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 }, category: { width: '32%', minHeight: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 7, borderRadius: 9 }, recommendedCategory: { borderColor: colors.yellow, shadowColor: colors.yellow, shadowOpacity: 0.35, shadowRadius: 5 }, selectedCategory: { borderColor: colors.cyan, borderWidth: 2, backgroundColor: '#173033' }, usedCategory: { opacity: 0.52, backgroundColor: '#151c1e' }, categoryName: { color: colors.mint, fontWeight: '800', fontSize: 10.5, lineHeight: 13, flex: 1, paddingRight: 3 }, usedText: { color: colors.muted }, scoreBadge: { minWidth: 23, height: 23, borderRadius: 12, backgroundColor: '#20383b', alignItems: 'center', justifyContent: 'center' }, scoreBadgeText: { color: colors.cyan, fontWeight: '900', fontSize: 11 }, zeroBadge: { backgroundColor: '#34202f' }, usedBadge: { backgroundColor: '#273034' }, recommendedIcon: { position: 'absolute', top: 2, right: 2 },
  lockBar: { position: 'absolute', zIndex: 15, left: 14, right: 14, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#162326', borderColor: colors.cyan, borderWidth: 1, borderRadius: 14, padding: 13, shadowColor: colors.cyan, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 10 }, lockLabel: { color: colors.white, fontWeight: '900' }, lockScore: { color: colors.yellow, fontWeight: '800', marginTop: 2 }, lockButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.cyan, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 11 }, lockButtonText: { color: colors.background, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 15 }, resetButton: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', borderWidth: 1, borderColor: colors.danger, padding: 12, borderRadius: 11, alignItems: 'center' }, resetText: { color: colors.danger, fontWeight: '900' },
  completeCard: { backgroundColor: colors.surface, borderColor: colors.yellow, borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center' }, completeIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#2a2d14', alignItems: 'center', justifyContent: 'center' }, completeTitle: { color: colors.yellow, fontSize: 25, fontWeight: '900', marginTop: 12 }, finalScore: { color: colors.cyan, fontSize: 48, fontWeight: '900', marginTop: 4 }, finalTotals: { flexDirection: 'row', gap: 22, marginTop: 14 }, completeCopy: { color: colors.mint, textAlign: 'center', marginTop: 7, marginBottom: 8 }, completeActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 10 }, secondaryButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderColor: colors.cyan, borderWidth: 1, borderRadius: 11, padding: 12 }, secondaryText: { color: colors.cyan, fontWeight: '900' }, newGameButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: colors.yellow, borderRadius: 11, padding: 12 }, newGameText: { color: colors.background, fontWeight: '900' }, playerOneText: { color: colors.cyan, fontWeight: '900' }, playerTwoText: { color: colors.pink, fontWeight: '900' }, muted: { color: colors.muted, fontWeight: '800' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' }, sheetDismissArea: { flex: 1 }, sheet: { height: '82%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderColor: '#315a5e', borderWidth: 1, paddingTop: 8 }, sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#45565a', alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }, sheetTitle: { color: colors.yellow, fontSize: 24, fontWeight: '900' }, sheetClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#263337', alignItems: 'center', justifyContent: 'center' }, sheetContent: { paddingHorizontal: 20, paddingBottom: 34 }, scorecardTabs: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.background, borderRadius: 10, padding: 3 }, scorecardTab: { flex: 1, alignItems: 'center', padding: 9, borderRadius: 8 }, scorecardTabActive: { backgroundColor: '#20383b' }, sectionSummary: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: 10, padding: 12 }, sectionSummaryLabel: { color: colors.mint, fontWeight: '800' }, sectionSummaryValue: { color: colors.yellow, fontWeight: '900' }, bonusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 4 }, bonusLabel: { color: colors.muted }, bonusValue: { color: colors.muted, fontWeight: '800' }, bonusEarned: { color: colors.cyan }, scoreGroupTitle: { color: colors.pink, fontWeight: '900', fontSize: 17, marginTop: 12, marginBottom: 5 }, sheetScoreRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomColor: '#2a3639', borderBottomWidth: 1, paddingVertical: 9 }, sheetCategory: { color: colors.mint }, sheetScore: { color: colors.yellow, fontWeight: '900' }, sheetTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopColor: colors.cyan, borderTopWidth: 1, marginTop: 16, paddingTop: 14 }, sheetTotalLabel: { color: colors.cyan, fontSize: 18, fontWeight: '900' }, sheetTotal: { color: colors.yellow, fontSize: 24, fontWeight: '900' },
});
