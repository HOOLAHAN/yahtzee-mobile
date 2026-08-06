import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { categories, Category, ScoreEntry, totalScore, upperCategories, upperSectionBonus } from '../lib/game';
import { colors, playerProfiles } from '../theme';

const namesKey = 'yahtzee.real-dice.names.v1';
const gameKey = 'yahtzee.real-dice.game.v1';
const maximumScore: Record<Category, number> = {
  Ones: 5, Twos: 10, Threes: 15, Fours: 20, Fives: 25, Sixes: 30,
  'Three of a Kind': 30, 'Four of a Kind': 30, 'Full House': 25,
  'Small Straight': 30, 'Large Straight': 40, Yahtzee: 50, Chance: 30,
};
const shortLabels: Record<Category, string> = {
  Ones: 'Ones', Twos: 'Twos', Threes: 'Threes', Fours: 'Fours', Fives: 'Fives', Sixes: 'Sixes',
  'Three of a Kind': '3 of a Kind', 'Four of a Kind': '4 of a Kind', 'Full House': 'Full House',
  'Small Straight': 'Sm. Straight', 'Large Straight': 'Lg. Straight', Yahtzee: 'Yahtzee', Chance: 'Chance',
};

interface RealPlayer { id: string; name: string; scores: ScoreEntry[] }
interface SavedRealGame { players: RealPlayer[]; currentPlayer: number }

function validScore(category: Category, score: number) {
  if (!Number.isInteger(score) || score < 0 || score > maximumScore[category]) return false;
  if (upperCategories.includes(category)) return score % (categories.indexOf(category) + 1) === 0;
  if (category === 'Full House') return score === 0 || score === 25;
  if (category === 'Small Straight') return score === 0 || score === 30;
  if (category === 'Large Straight') return score === 0 || score === 40;
  if (category === 'Yahtzee') return score === 0 || score === 50;
  return true;
}

export function RealDiceScreen({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [setupNames, setSetupNames] = useState(['', '']);
  const [players, setPlayers] = useState<RealPlayer[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [scoreText, setScoreText] = useState('');
  const [showScorecard, setShowScorecard] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const setupScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(namesKey), AsyncStorage.getItem(gameKey)]).then(([savedNames, savedGame]) => {
      if (savedNames) {
        const names = JSON.parse(savedNames) as string[];
        if (names.length) setSetupNames(names.slice(0, 10));
      }
      if (savedGame) {
        const game = JSON.parse(savedGame) as SavedRealGame;
        if (game.players?.length) { const restoredPlayers = game.players.slice(0, 10); setPlayers(restoredPlayers); setCurrentPlayer(Math.min(game.currentPlayer, restoredPlayers.length - 1)); }
      }
    }).catch(() => undefined).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated || !players.length) return;
    void AsyncStorage.setItem(gameKey, JSON.stringify({ players, currentPlayer } satisfies SavedRealGame));
  }, [currentPlayer, hydrated, players]);

  const complete = players.length > 0 && players.every((player) => player.scores.length === categories.length);
  const active = players[currentPlayer];
  const activeProfile = playerProfiles[currentPlayer % playerProfiles.length];
  const scoreColumnWidth = players.length <= 2 ? 112 : players.length === 3 ? 82 : 72;
  const used = useMemo(() => new Set(active?.scores.map((entry) => entry.category) ?? []), [active]);
  const leaders = complete ? [...players].sort((a, b) => totalScore(b.scores) - totalScore(a.scores)) : [];

  const changePlayerCount = (delta: number) => setSetupNames((current) => {
    const length = Math.max(1, Math.min(10, current.length + delta));
    return length > current.length ? [...current, `Player ${length}`] : current.slice(0, length);
  });

  const startGame = () => {
    const names = setupNames.map((name, index) => name.trim() || `Player ${index + 1}`);
    const nextPlayers = names.map((name, index) => ({ id: `${Date.now()}-${index}`, name, scores: [] }));
    setPlayers(nextPlayers); setCurrentPlayer(0); setSelectedCategory(null); setScoreText('');
    void AsyncStorage.setItem(namesKey, JSON.stringify(names));
    void AsyncStorage.setItem(gameKey, JSON.stringify({ players: nextPlayers, currentPlayer: 0 } satisfies SavedRealGame));
  };

  const recordScore = () => {
    if (!selectedCategory || !active) return;
    const score = Number(scoreText);
    if (!validScore(selectedCategory, score)) {
      return Alert.alert('Check that score', `${selectedCategory} accepts 0–${maximumScore[selectedCategory]}${['Full House', 'Small Straight', 'Large Straight', 'Yahtzee'].includes(selectedCategory) ? ' using its standard fixed score' : ''}.`);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPlayers((current) => current.map((player, index) => index === currentPlayer ? { ...player, scores: [...player.scores, { category: selectedCategory, score, dice: [] }] } : player));
    setSelectedCategory(null); setScoreText(''); setCurrentPlayer((index) => (index + 1) % players.length);
  };

  const resetGame = () => Alert.alert('End scorekeeping?', 'The current scorecard will be cleared, but player names will be remembered.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'End Game', style: 'destructive', onPress: () => { setPlayers([]); setSelectedCategory(null); setScoreText(''); void AsyncStorage.removeItem(gameKey); } },
  ]);

  if (!players.length) return <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={76}><ScrollView ref={setupScrollRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.setup}>
    <View style={styles.setupIcon}><Ionicons name="people-outline" size={30} color={colors.cyan} /></View>
    <Text style={styles.title}>Real Dice</Text><Text style={styles.subtitle}>Roll physical dice. This app keeps everyone’s scorecard.</Text>
    <View style={styles.countRow}><Pressable accessibilityLabel="Remove player" disabled={setupNames.length === 1} onPress={() => changePlayerCount(-1)} style={[styles.countButton, setupNames.length === 1 && styles.disabled]}><Ionicons name="remove" size={22} color={colors.cyan} /></Pressable><View><Text style={styles.count}>{setupNames.length}</Text><Text style={styles.countLabel}>{setupNames.length === 1 ? 'player' : 'players'}</Text></View><Pressable accessibilityLabel="Add player" disabled={setupNames.length === 10} onPress={() => changePlayerCount(1)} style={[styles.countButton, setupNames.length === 10 && styles.disabled]}><Ionicons name="add" size={22} color={colors.cyan} /></Pressable></View>
    <View style={styles.nameList}>{setupNames.map((name, index) => { const profile = playerProfiles[index]; return <View key={index} style={styles.nameRow}><View style={[styles.playerNumber, { backgroundColor: profile.soft, borderColor: profile.accent }]}><Text style={[styles.playerNumberText, { color: profile.accent }]}>{index + 1}</Text></View><TextInput accessibilityLabel={`Player ${index + 1} name`} value={name} onFocus={() => setTimeout(() => setupScrollRef.current?.scrollTo({ y: 135 + index * 55, animated: true }), 120)} onChangeText={(value) => setSetupNames((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} placeholder={`Player ${index + 1}`} placeholderTextColor={colors.muted} maxLength={18} returnKeyType={index === setupNames.length - 1 ? 'done' : 'next'} style={[styles.nameInput, { borderColor: profile.accent }]} /></View>; })}</View>
    <Pressable onPress={startGame} style={styles.startButton}><Ionicons name="play" size={18} color={colors.background} /><Text style={styles.startText}>Start Scorecard</Text></Pressable>
    <Text style={styles.remembered}><Ionicons name="bookmark-outline" size={13} color={colors.muted} /> Names are remembered for your next game.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Open game settings" onPress={onOpenSettings} style={styles.setupSettingsButton}><Ionicons name="settings-outline" size={18} color={colors.cyan} /><Text style={styles.outlineText}>Game Settings</Text></Pressable>
  </ScrollView></KeyboardAvoidingView>;

  return <View style={styles.container}>
    <View style={styles.gameHeader}><View><Text style={styles.eyebrow}>{complete ? 'Final standings' : `Turn ${active.scores.length + 1} of ${categories.length}`}</Text><Text style={[styles.activeName, { color: activeProfile.accent }]}>{complete ? `${leaders[0].name} wins` : `${active.name}'s turn`}</Text></View><View style={[styles.totalPill, { backgroundColor: activeProfile.soft }]}><Text style={styles.totalLabel}>Total</Text><Text style={[styles.totalValue, { color: activeProfile.score }]}>{totalScore(active.scores)}</Text></View></View>
    {selectedCategory && !complete && <View style={[styles.scoreBar, { borderColor: activeProfile.accent }]}><View style={styles.scoreBarCopy}><Text numberOfLines={1} style={styles.scoreCategory}>{selectedCategory}</Text><Text style={styles.scoreHint}>Enter 0–{maximumScore[selectedCategory]}</Text></View><TextInput autoFocus keyboardType="number-pad" value={scoreText} onChangeText={setScoreText} placeholder="0" placeholderTextColor={colors.muted} maxLength={2} selectTextOnFocus style={[styles.scoreInput, { color: activeProfile.score, borderColor: activeProfile.accent }]} /><Pressable disabled={scoreText === ''} onPress={recordScore} style={[styles.lockButton, { backgroundColor: activeProfile.accent }, scoreText === '' && styles.disabled]}><Ionicons name="checkmark" size={18} color={colors.background} /><Text style={styles.lockText}>Save</Text></Pressable></View>}
    {complete ? <ScrollView contentContainerStyle={styles.results}>{leaders.map((player, index) => { const originalIndex = players.findIndex((item) => item.id === player.id); const profile = playerProfiles[originalIndex]; return <View key={player.id} style={[styles.resultRow, { borderColor: profile.accent }, index === 0 && styles.winnerRow]}><Text style={[styles.position, { color: profile.accent }]}>{index + 1}</Text><Text style={styles.resultName}>{player.name}</Text><Text style={[styles.resultScore, { color: profile.score }]}>{totalScore(player.scores)}</Text></View>; })}<Pressable onPress={() => setShowScorecard(true)} style={styles.outlineButton}><Ionicons name="list-outline" size={17} color={colors.cyan} /><Text style={styles.outlineText}>View Scorecards</Text></Pressable><Pressable onPress={resetGame} style={styles.startButton}><Text style={styles.startText}>New Game</Text></Pressable><Pressable onPress={onOpenSettings} style={styles.setupSettingsButton}><Ionicons name="settings-outline" size={18} color={colors.cyan} /><Text style={styles.outlineText}>Game Settings</Text></Pressable></ScrollView> : <ScrollView contentContainerStyle={styles.gameContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.instruction}>Choose a category, then enter the score.</Text>
      <View style={styles.categoryGrid}>{categories.map((category) => { const entry = active.scores.find((item) => item.category === category); const selected = selectedCategory === category; return <Pressable key={category} disabled={Boolean(entry)} onPress={() => { setSelectedCategory(category); setScoreText(''); }} style={[styles.category, category === 'Chance' && styles.chanceCategory, entry && styles.usedCategory, selected && { borderColor: activeProfile.accent, borderWidth: 2, backgroundColor: activeProfile.soft }]}><Text numberOfLines={2} style={[styles.categoryName, entry && styles.usedText]}>{shortLabels[category]}</Text><Text style={[styles.categoryScore, { color: activeProfile.score }, entry && styles.usedText]}>{entry?.score ?? '—'}</Text></Pressable>; })}</View>
      <View style={styles.actions}><Pressable onPress={() => setShowScorecard(true)} style={styles.actionButton}><Ionicons name="list-outline" size={17} color={colors.cyan} /><Text style={styles.outlineText}>Scores</Text></Pressable><Pressable onPress={onOpenSettings} style={styles.actionButton}><Ionicons name="settings-outline" size={17} color={colors.mint} /><Text style={styles.actionText}>Settings</Text></Pressable><Pressable onPress={resetGame} style={styles.actionButton}><Ionicons name="close-circle-outline" size={17} color={colors.muted} /><Text style={styles.resetText}>End</Text></Pressable></View>
    </ScrollView>}

    <Modal transparent animationType="slide" visible={showScorecard} onRequestClose={() => setShowScorecard(false)}><View style={styles.modalBackdrop}><Pressable style={styles.dismissArea} onPress={() => setShowScorecard(false)} /><SafeAreaView style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Scorecards</Text><Text style={styles.sheetSubtitle}>Swipe sideways to compare all {players.length} players</Text></View><Pressable onPress={() => setShowScorecard(false)} style={styles.closeButton}><Ionicons name="close" size={21} color={colors.white} /></Pressable></View><ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableScroll}><View><View style={styles.tableHeaderRow}><View style={[styles.categoryColumn, styles.tableHeaderCell]}><Text style={styles.tableHeaderLabel}>Category</Text></View>{players.map((player, index) => <View key={player.id} style={[styles.playerColumn, styles.tableHeaderCell, { width: scoreColumnWidth, borderTopColor: playerProfiles[index].accent }]}><View style={[styles.profileDot, { backgroundColor: playerProfiles[index].accent }]} /><Text numberOfLines={1} style={[styles.tablePlayerName, { color: playerProfiles[index].accent }]}>{player.name}</Text></View>)}</View>{categories.map((category) => <View key={category} style={styles.tableRow}><View style={styles.categoryColumn}><Text numberOfLines={1} style={styles.tableCategory}>{shortLabels[category]}</Text></View>{players.map((player, index) => { const score = player.scores.find((entry) => entry.category === category)?.score; return <View key={player.id} style={[styles.playerColumn, { width: scoreColumnWidth, backgroundColor: index % 2 ? '#0d1315' : colors.surface }]}><Text style={[styles.tableScore, { color: score === undefined ? colors.muted : playerProfiles[index].score }]}>{score ?? '—'}</Text></View>; })}</View>)}<View style={styles.tableRow}><View style={styles.categoryColumn}><Text style={styles.tableBonusLabel}>Upper bonus</Text></View>{players.map((player, index) => <View key={player.id} style={[styles.playerColumn, { width: scoreColumnWidth }]}><Text style={[styles.tableScore, { color: playerProfiles[index].accent }]}>{upperSectionBonus(player.scores) || '—'}</Text></View>)}</View><View style={[styles.tableRow, styles.tableTotalRow]}><View style={styles.categoryColumn}><Text style={styles.tableTotalLabel}>Total</Text></View>{players.map((player, index) => <View key={player.id} style={[styles.playerColumn, { width: scoreColumnWidth }]}><Text style={[styles.tableTotalScore, { color: playerProfiles[index].score }]}>{totalScore(player.scores)}</Text></View>)}</View></View></ScrollView></ScrollView></SafeAreaView></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  keyboardArea: { flex: 1 }, container: { flex: 1 }, setup: { padding: 20, paddingBottom: 180, alignItems: 'center' }, setupIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#173033', alignItems: 'center', justifyContent: 'center', marginTop: 10 }, title: { color: colors.yellow, fontSize: 27, fontWeight: '900', marginTop: 10 }, subtitle: { color: colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 5, maxWidth: 320 }, countRow: { width: 210, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }, countButton: { width: 43, height: 43, borderRadius: 22, borderColor: '#315a5e', borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, count: { color: colors.yellow, textAlign: 'center', fontSize: 25, fontWeight: '900' }, countLabel: { color: colors.muted, fontSize: 10, textAlign: 'center' }, nameList: { width: '100%', gap: 8, marginTop: 18 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, playerNumber: { width: 29, height: 29, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, playerNumberText: { fontWeight: '900' }, nameInput: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.white, fontWeight: '800' }, startButton: { minWidth: 190, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cyan, borderRadius: 12, padding: 13, marginTop: 18 }, startText: { color: colors.background, fontWeight: '900' }, remembered: { color: colors.muted, fontSize: 10, marginTop: 11 }, setupSettingsButton: { minWidth: 190, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: '#315a5e', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 12 }, gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderBottomColor: '#253438', borderBottomWidth: 1 }, eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, activeName: { fontSize: 22, fontWeight: '900', marginTop: 2 }, totalPill: { borderRadius: 12, paddingHorizontal: 15, paddingVertical: 7, alignItems: 'center' }, totalLabel: { color: colors.muted, fontSize: 9, textTransform: 'uppercase' }, totalValue: { fontSize: 18, fontWeight: '900' }, gameContent: { padding: 16, paddingBottom: 24 }, instruction: { color: colors.muted, fontSize: 12, marginBottom: 9 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7 }, category: { width: '32%', minHeight: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 9, paddingHorizontal: 8 }, chanceCategory: { marginLeft: '34%' }, selectedCategory: { borderColor: colors.pink, borderWidth: 2, backgroundColor: '#34202f' }, usedCategory: { opacity: 0.45 }, categoryName: { color: colors.mint, flex: 1, fontSize: 10.5, fontWeight: '800' }, categoryScore: { fontWeight: '900' }, usedText: { color: colors.muted }, actions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }, actionButton: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderColor: '#315a5e', borderWidth: 1, borderRadius: 9, backgroundColor: colors.surface }, actionText: { color: colors.mint, fontSize: 11, fontWeight: '800' }, outlineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderColor: '#315a5e', borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 }, outlineText: { color: colors.cyan, fontSize: 11, fontWeight: '800' }, resetText: { color: colors.muted, fontSize: 11 }, scoreBar: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 12, marginTop: 8, backgroundColor: '#162326', borderWidth: 1, borderRadius: 14, padding: 10 }, scoreBarCopy: { flex: 1, minWidth: 0 }, scoreCategory: { color: colors.white, fontWeight: '900', fontSize: 12 }, scoreHint: { color: colors.muted, fontSize: 9, marginTop: 2 }, scoreInput: { width: 58, backgroundColor: colors.background, borderWidth: 1, borderRadius: 9, padding: 8, textAlign: 'center', fontSize: 18, fontWeight: '900' }, lockButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10 }, lockText: { color: colors.background, fontWeight: '900' }, disabled: { opacity: 0.4 }, results: { padding: 16, alignItems: 'center' }, resultRow: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 8 }, winnerRow: { borderWidth: 2 }, position: { fontWeight: '900', width: 35 }, resultName: { color: colors.mint, fontWeight: '800', flex: 1 }, resultScore: { fontSize: 19, fontWeight: '900' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end', padding: 8, paddingBottom: 10 }, dismissArea: { flex: 1 }, sheet: { maxHeight: '86%', backgroundColor: colors.surface, borderRadius: 22, borderColor: '#315a5e', borderWidth: 1, overflow: 'hidden', paddingTop: 7 }, handle: { width: 38, height: 4, backgroundColor: '#45565a', borderRadius: 2, alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }, sheetTitle: { color: colors.yellow, fontSize: 22, fontWeight: '900' }, sheetSubtitle: { color: colors.muted, fontSize: 10 }, closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#263337', alignItems: 'center', justifyContent: 'center' }, sheetScroll: { flexShrink: 1 }, tableScroll: { paddingHorizontal: 12, paddingBottom: 14 }, tableHeaderRow: { flexDirection: 'row' }, tableRow: { flexDirection: 'row', borderBottomColor: '#2a3639', borderBottomWidth: 1 }, categoryColumn: { width: 112, minHeight: 34, justifyContent: 'center', paddingHorizontal: 7, backgroundColor: colors.surface }, playerColumn: { width: 72, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderLeftColor: '#263438', borderLeftWidth: 1 }, tableHeaderCell: { minHeight: 48, borderTopWidth: 3, borderTopColor: '#2d3c40' }, tableHeaderLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, profileDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 }, tablePlayerName: { fontSize: 10, fontWeight: '900', maxWidth: 64 }, tableCategory: { color: colors.mint, fontSize: 11, fontWeight: '700' }, tableScore: { fontSize: 12, fontWeight: '900' }, tableBonusLabel: { color: colors.muted, fontSize: 11 }, tableTotalRow: { borderTopColor: colors.cyan, borderTopWidth: 1, borderBottomWidth: 0 }, tableTotalLabel: { color: colors.cyan, fontSize: 14, fontWeight: '900' }, tableTotalScore: { fontSize: 16, fontWeight: '900' },
});
