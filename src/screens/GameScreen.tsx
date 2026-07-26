import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { categories, Category, DieFace, maximumAvailableScore, rollDie, scoreCategory, ScoreEntry } from '../lib/game';
import { submitScore } from '../services/scores';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

const initialDice: DieFace[] = [1, 1, 1, 1, 1];
const pips: Record<DieFace, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
type Player = 1 | 2;
type Histories = Record<Player, ScoreEntry[]>;

function AnimatedDie({ value, index, held, rollToken, canHold, onPress }: {
  value: DieFace; index: number; held: boolean; rollToken: number; canHold: boolean; onPress: () => void;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (rollToken === 0 || held) return;
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
  }, [held, index, lift, rollToken, scale, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', index % 2 === 0 ? '720deg' : '-720deg'] });
  return <Animated.View style={[styles.dieSlot, { transform: [{ translateY: lift }, { rotate }, { scale }] }, held && styles.heldDieSlot]}>
    <Pressable disabled={!canHold} onPress={onPress} style={({ pressed }) => [styles.die, held && styles.heldDie, pressed && styles.diePressed]}>
      <Text style={styles.dieText}>{pips[value]}</Text>
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
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showScorecard, setShowScorecard] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rollToken, setRollToken] = useState(0);

  const scores = histories[currentPlayer];
  const used = useMemo(() => new Set<Category>(scores.map((entry) => entry.category)), [scores]);
  const totals = {
    1: histories[1].reduce((sum, entry) => sum + entry.score, 0),
    2: histories[2].reduce((sum, entry) => sum + entry.score, 0),
  };
  const complete = histories[1].length === categories.length && (!twoPlayer || histories[2].length === categories.length);
  const currentScore = hasRolled ? maximumAvailableScore(dice, used) : 0;

  const nextRound = () => {
    setDice(initialDice); setHeld(new Set()); setRollsLeft(3); setHasRolled(false);
    if (twoPlayer) {
      const next = currentPlayer === 1 ? 2 : 1;
      setCurrentPlayer(next); setViewingPlayer(next);
    }
  };

  const roll = () => {
    if (rollsLeft === 0 || complete) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRollToken((token) => token + 1);
    setDice((current) => current.map((die, index) => held.has(index) ? die : rollDie()));
    setRollsLeft((count) => count - 1); setHasRolled(true);
  };

  const toggleHeld = (index: number) => {
    if (!hasRolled) return;
    void Haptics.selectionAsync();
    setHeld((current) => {
      const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next;
    });
  };

  const lockScore = (category: Category) => {
    if (!hasRolled || used.has(category)) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry = { category, score: scoreCategory(category, dice), dice: [...dice] };
    setHistories((current) => ({ ...current, [currentPlayer]: [...current[currentPlayer], entry] }));
    nextRound();
  };

  const reset = () => {
    Alert.alert('Reset game?', 'All scores from this game will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => {
        setHistories({ 1: [], 2: [] }); setCurrentPlayer(1); setViewingPlayer(1);
        setDice(initialDice); setHeld(new Set()); setRollsLeft(3); setHasRolled(false);
      } },
    ]);
  };

  const changeMode = (enabled: boolean) => {
    if (enabled === twoPlayer) return;
    setTwoPlayer(enabled); setHistories({ 1: [], 2: [] }); setCurrentPlayer(1); setViewingPlayer(1);
    setDice(initialDice); setHeld(new Set()); setRollsLeft(3); setHasRolled(false);
  };

  const shareScorecard = async () => {
    const lines = ([1, ...(twoPlayer ? [2] : [])] as Player[]).map((player) =>
      `Player ${player}: ${totals[player]}\n${histories[player].map((entry, index) => `${index + 1}. ${entry.category}: ${entry.score}`).join('\n')}`
    );
    await Share.share({ message: `Yahtzee! Scorecard\n\n${lines.join('\n\n')}` });
  };

  const sendScore = async () => {
    if (!user) return Alert.alert('Sign in required', 'Open Account and sign in before submitting.');
    setSubmitting(true);
    try {
      await submitScore({ userId: user.userId, username: user.username, score: totals[1], timestamp: new Date().toISOString() });
      Alert.alert('Score submitted', `${totals[1]} points were added to the leaderboard.`);
    } catch (error) { Alert.alert('Submission failed', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.modePicker}>
        <Pressable onPress={() => changeMode(false)} style={[styles.mode, !twoPlayer && styles.modeActive]}><Text style={[styles.modeText, !twoPlayer && styles.modeTextActive]}>Single Player</Text></Pressable>
        <Pressable onPress={() => changeMode(true)} style={[styles.mode, twoPlayer && styles.modeActive]}><Text style={[styles.modeText, twoPlayer && styles.modeTextActive]}>Two Player</Text></Pressable>
      </View>
      <Text style={[styles.title, currentPlayer === 2 && styles.playerTwo]}>{twoPlayer ? `Player ${currentPlayer}'s Turn` : 'Single Player'}</Text>
      <Text style={styles.help}>{hasRolled ? 'Tap dice to hold them' : 'Roll dice to begin'}</Text>
      <View style={styles.diceRow}>{dice.map((die, index) => <AnimatedDie key={index} value={die} index={index} held={held.has(index)} rollToken={rollToken} canHold={hasRolled} onPress={() => toggleHeld(index)} />)}</View>
      <Pressable disabled={rollsLeft === 0 || complete} onPress={roll} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryText}>🎲 Roll Dice ({rollsLeft} left)</Text></Pressable>
      <View style={styles.scoreSummary}>
        <View><Text style={styles.summaryLabel}>Current Score</Text><Text style={styles.summaryValue}>{currentScore}</Text></View>
        <View><Text style={styles.summaryLabel}>Total Score</Text><Text style={styles.summaryValue}>{totals[currentPlayer]}</Text></View>
      </View>
      {twoPlayer && <View style={styles.playerTotals}><Text style={styles.playerOneText}>Player 1: {totals[1]}</Text><Text style={styles.playerTwoText}>Player 2: {totals[2]}</Text></View>}
      {hasRolled && <Text style={styles.sectionTitle}>Lock In Score</Text>}
      <View style={styles.categoryGrid}>{categories.map((category) => {
        const entry = scores.find((item) => item.category === category); const preview = hasRolled ? scoreCategory(category, dice) : 0;
        return <Pressable key={category} disabled={!hasRolled || Boolean(entry)} onPress={() => lockScore(category)} style={[styles.category, entry ? styles.usedCategory : preview > 0 ? styles.scoringCategory : styles.zeroCategory]}><Text style={[styles.categoryName, entry && styles.usedText]}>{category} ({entry ? entry.score : preview})</Text></Pressable>;
      })}</View>
      {hasRolled && <View style={styles.panel}>
        <Pressable onPress={() => setShowBreakdown((value) => !value)}><Text style={styles.panelTitle}>Dice Scores {showBreakdown ? '−' : '+'}</Text></Pressable>
        {showBreakdown && <View style={styles.breakdown}>{categories.map((category) => <View key={category} style={styles.breakdownRow}><Text style={styles.breakdownLabel}>{category}</Text><Text style={[styles.breakdownScore, scoreCategory(category, dice) === 0 && styles.zeroText]}>{scoreCategory(category, dice)}</Text></View>)}</View>}
      </View>}
      {(histories[1].length > 0 || histories[2].length > 0) && <View style={styles.panel}>
        <Pressable onPress={() => setShowScorecard((value) => !value)}><Text style={styles.panelTitle}>Score Card {showScorecard ? '−' : '+'}</Text></Pressable>
        {showScorecard && <>
          {twoPlayer && <View style={styles.scorecardTabs}><Pressable onPress={() => setViewingPlayer(1)}><Text style={viewingPlayer === 1 ? styles.playerOneText : styles.muted}>Player 1</Text></Pressable><Pressable onPress={() => setViewingPlayer(2)}><Text style={viewingPlayer === 2 ? styles.playerTwoText : styles.muted}>Player 2</Text></Pressable></View>}
          {histories[viewingPlayer].map((entry, index) => <View key={`${entry.category}-${index}`} style={styles.historyRow}><Text style={styles.round}>{index + 1}</Text><View style={styles.historyMain}><Text style={styles.historyCategory}>{entry.category}</Text><Text style={styles.historyDice}>{entry.dice.map((die) => pips[die]).join(' ')}</Text></View><Text style={styles.historyScore}>{entry.score}</Text></View>)}
          <Text style={styles.scorecardTotal}>Total: {totals[viewingPlayer]}</Text>
        </>}
      </View>}
      {complete && !twoPlayer && <Pressable disabled={submitting} onPress={sendScore} style={styles.primaryButton}><Text style={styles.primaryText}>{submitting ? 'Submitting…' : 'Submit Score'}</Text></Pressable>}
      <View style={styles.actions}><Pressable onPress={reset} style={styles.resetButton}><Text style={styles.resetText}>Reset</Text></Pressable><Pressable onPress={() => void shareScorecard()} style={styles.shareButton}><Text style={styles.shareText}>Share</Text></Pressable></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 48 }, modePicker: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4 },
  mode: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 9 }, modeActive: { backgroundColor: colors.cyan }, modeText: { color: colors.muted, fontWeight: '800' }, modeTextActive: { color: colors.background },
  title: { color: colors.yellow, fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 20 }, playerTwo: { color: colors.pink }, help: { color: colors.pink, textTransform: 'uppercase', fontWeight: '800', textAlign: 'center', marginVertical: 15 },
  diceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 7, marginBottom: 16, paddingTop: 12 },
  dieSlot: { flex: 1, aspectRatio: 0.92 }, heldDieSlot: { transform: [{ translateY: -7 }] },
  die: { flex: 1, backgroundColor: colors.cyan, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  heldDie: { backgroundColor: colors.yellow, borderColor: colors.pink, shadowColor: colors.yellow, shadowOpacity: 0.9, shadowRadius: 13 }, diePressed: { opacity: 0.78, transform: [{ scale: 0.94 }] },
  dieText: { color: colors.background, fontSize: 41 }, holdBadge: { position: 'absolute', bottom: -9, backgroundColor: colors.pink, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }, holdBadgeText: { color: colors.white, fontSize: 8, fontWeight: '900' },
  primaryButton: { backgroundColor: colors.cyan, padding: 15, borderRadius: 14, alignItems: 'center', marginVertical: 8 }, primaryText: { color: colors.background, fontWeight: '900', fontSize: 17 }, pressed: { opacity: 0.75 },
  scoreSummary: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginVertical: 10 }, summaryLabel: { color: colors.cyan, fontWeight: '700' }, summaryValue: { color: colors.yellow, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  playerTotals: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 6 }, playerOneText: { color: colors.cyan, fontWeight: '900' }, playerTwoText: { color: colors.pink, fontWeight: '900' }, muted: { color: colors.muted, fontWeight: '800' },
  sectionTitle: { color: colors.yellow, fontSize: 22, fontWeight: '900', textAlign: 'center', marginVertical: 13 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9 }, category: { minWidth: '30%', maxWidth: '48%', paddingHorizontal: 11, paddingVertical: 12, borderRadius: 10, alignItems: 'center' }, scoringCategory: { backgroundColor: colors.yellow }, zeroCategory: { backgroundColor: colors.pink }, usedCategory: { backgroundColor: '#273034' }, categoryName: { color: colors.background, fontWeight: '900', textAlign: 'center' }, usedText: { color: colors.muted },
  panel: { borderColor: colors.cyan, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surface, padding: 15, marginTop: 18 }, panelTitle: { color: colors.cyan, fontSize: 21, fontWeight: '900', textAlign: 'center' }, breakdown: { marginTop: 12 }, breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }, breakdownLabel: { color: colors.mint }, breakdownScore: { color: colors.yellow, fontWeight: '800' }, zeroText: { color: colors.pink },
  scorecardTabs: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 15 }, historyRow: { flexDirection: 'row', alignItems: 'center', borderTopColor: '#344044', borderTopWidth: 1, paddingVertical: 10 }, round: { color: colors.cyan, width: 28 }, historyMain: { flex: 1 }, historyCategory: { color: colors.mint, fontWeight: '700' }, historyDice: { color: colors.yellow, fontSize: 18, marginTop: 2 }, historyScore: { color: colors.yellow, fontSize: 18, fontWeight: '900' }, scorecardTotal: { color: colors.cyan, fontWeight: '900', fontSize: 18, textAlign: 'right', marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 }, resetButton: { flex: 1, borderWidth: 1, borderColor: colors.danger, padding: 14, borderRadius: 12, alignItems: 'center' }, resetText: { color: colors.danger, fontWeight: '900' }, shareButton: { flex: 1, backgroundColor: colors.yellow, padding: 14, borderRadius: 12, alignItems: 'center' }, shareText: { color: colors.background, fontWeight: '900' },
});
