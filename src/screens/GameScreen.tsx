import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { categories, Category, DieFace, rollDie, scoreCategory, ScoreEntry } from '../lib/game';
import { submitScore } from '../services/scores';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

const initialDice: DieFace[] = [1, 1, 1, 1, 1];
const pips: Record<DieFace, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };

export function GameScreen() {
  const { user } = useAuth();
  const [dice, setDice] = useState<DieFace[]>(initialDice);
  const [held, setHeld] = useState(new Set<number>());
  const [rollsLeft, setRollsLeft] = useState(3);
  const [hasRolled, setHasRolled] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const total = scores.reduce((sum, entry) => sum + entry.score, 0);
  const used = useMemo(() => new Set(scores.map((entry) => entry.category)), [scores]);
  const complete = scores.length === categories.length;

  const roll = () => {
    if (rollsLeft === 0 || complete) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDice((current) => current.map((die, index) => held.has(index) ? die : rollDie()));
    setRollsLeft((count) => count - 1);
    setHasRolled(true);
  };

  const toggleHeld = (index: number) => {
    if (!hasRolled) return;
    setHeld((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const lockScore = (category: Category) => {
    if (!hasRolled || used.has(category)) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setScores((current) => [...current, { category, score: scoreCategory(category, dice) }]);
    setDice(initialDice);
    setHeld(new Set());
    setRollsLeft(3);
    setHasRolled(false);
  };

  const reset = () => {
    setDice(initialDice);
    setHeld(new Set());
    setRollsLeft(3);
    setHasRolled(false);
    setScores([]);
  };

  const sendScore = async () => {
    if (!user) return Alert.alert('Sign in required', 'Open Account and sign in before submitting.');
    setSubmitting(true);
    try {
      await submitScore({ userId: user.userId, username: user.username, score: total, timestamp: new Date().toISOString() });
      Alert.alert('Score submitted', `${total} points were added to the shared leaderboard.`);
    } catch (error) {
      Alert.alert('Submission failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Single Player</Text>
      <Text style={styles.help}>{hasRolled ? 'Tap dice to hold them' : 'Roll the dice to begin'}</Text>
      <View style={styles.diceRow}>
        {dice.map((die, index) => (
          <Pressable key={index} onPress={() => toggleHeld(index)} style={[styles.die, held.has(index) && styles.heldDie]}>
            <Text style={styles.dieText}>{pips[die]}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable disabled={rollsLeft === 0 || complete} onPress={roll} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>🎲 Roll Dice ({rollsLeft} left)</Text>
      </Pressable>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total score</Text><Text style={styles.total}>{total}</Text>
      </View>
      <Text style={styles.sectionTitle}>{complete ? 'Game complete!' : 'Lock in score'}</Text>
      <View style={styles.categoryGrid}>
        {categories.map((category) => {
          const entry = scores.find((item) => item.category === category);
          const disabled = !hasRolled || Boolean(entry);
          return (
            <Pressable key={category} disabled={disabled} onPress={() => lockScore(category)} style={[styles.category, disabled && styles.disabledCategory, entry && styles.usedCategory]}>
              <Text style={styles.categoryName}>{category}</Text>
              <Text style={styles.categoryScore}>{entry ? entry.score : hasRolled ? scoreCategory(category, dice) : '—'}</Text>
            </Pressable>
          );
        })}
      </View>
      {complete && <Pressable disabled={submitting} onPress={sendScore} style={styles.primaryButton}><Text style={styles.primaryText}>{submitting ? 'Submitting…' : 'Submit Score'}</Text></Pressable>}
      <Pressable onPress={reset} style={styles.secondaryButton}><Text style={styles.secondaryText}>New Game</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 },
  title: { color: colors.yellow, fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  help: { color: colors.pink, textTransform: 'uppercase', fontWeight: '700', textAlign: 'center', marginVertical: 16 },
  diceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 18 },
  die: { flex: 1, aspectRatio: 0.86, backgroundColor: colors.cyan, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.cyan },
  heldDie: { backgroundColor: colors.yellow, borderColor: colors.pink, transform: [{ translateY: -7 }] },
  dieText: { color: colors.background, fontSize: 42 },
  primaryButton: { backgroundColor: colors.cyan, padding: 15, borderRadius: 14, alignItems: 'center', marginVertical: 8 },
  primaryText: { color: colors.background, fontWeight: '900', fontSize: 17 },
  pressed: { opacity: 0.75 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginVertical: 12 },
  totalLabel: { color: colors.mint, fontSize: 18, fontWeight: '700' },
  total: { color: colors.yellow, fontSize: 28, fontWeight: '900' },
  sectionTitle: { color: colors.yellow, fontSize: 21, fontWeight: '800', marginVertical: 10 },
  categoryGrid: { gap: 8 },
  category: { flexDirection: 'row', justifyContent: 'space-between', padding: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.pink, backgroundColor: colors.surface },
  disabledCategory: { borderColor: '#354044' },
  usedCategory: { opacity: 0.55 },
  categoryName: { color: colors.mint, fontWeight: '700' },
  categoryScore: { color: colors.yellow, fontWeight: '900' },
  secondaryButton: { borderWidth: 1, borderColor: colors.pink, padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  secondaryText: { color: colors.pink, fontWeight: '800' },
});
