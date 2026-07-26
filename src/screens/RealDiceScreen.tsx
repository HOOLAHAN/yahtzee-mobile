import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { categories, Category, ScoreEntry, totalScore, upperCategories, upperSectionBonus, upperSectionSubtotal, upperBonusPoints, upperBonusThreshold } from '../lib/game';
import { colors } from '../theme';

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

export function RealDiceScreen() {
  const [setupNames, setSetupNames] = useState(['', '']);
  const [players, setPlayers] = useState<RealPlayer[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [scoreText, setScoreText] = useState('');
  const [showScorecard, setShowScorecard] = useState(false);
  const [viewingPlayer, setViewingPlayer] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(namesKey), AsyncStorage.getItem(gameKey)]).then(([savedNames, savedGame]) => {
      if (savedNames) {
        const names = JSON.parse(savedNames) as string[];
        if (names.length) setSetupNames(names.slice(0, 6));
      }
      if (savedGame) {
        const game = JSON.parse(savedGame) as SavedRealGame;
        if (game.players?.length) { setPlayers(game.players); setCurrentPlayer(Math.min(game.currentPlayer, game.players.length - 1)); }
      }
    }).catch(() => undefined).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated || !players.length) return;
    void AsyncStorage.setItem(gameKey, JSON.stringify({ players, currentPlayer } satisfies SavedRealGame));
  }, [currentPlayer, hydrated, players]);

  const complete = players.length > 0 && players.every((player) => player.scores.length === categories.length);
  const active = players[currentPlayer];
  const used = useMemo(() => new Set(active?.scores.map((entry) => entry.category) ?? []), [active]);
  const leaders = complete ? [...players].sort((a, b) => totalScore(b.scores) - totalScore(a.scores)) : [];

  const changePlayerCount = (delta: number) => setSetupNames((current) => {
    const length = Math.max(1, Math.min(6, current.length + delta));
    return length > current.length ? [...current, `Player ${length}`] : current.slice(0, length);
  });

  const startGame = () => {
    const names = setupNames.map((name, index) => name.trim() || `Player ${index + 1}`);
    const nextPlayers = names.map((name, index) => ({ id: `${Date.now()}-${index}`, name, scores: [] }));
    setPlayers(nextPlayers); setCurrentPlayer(0); setViewingPlayer(0); setSelectedCategory(null); setScoreText('');
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

  if (!players.length) return <ScrollView contentContainerStyle={styles.setup}>
    <View style={styles.setupIcon}><Ionicons name="people-outline" size={30} color={colors.cyan} /></View>
    <Text style={styles.title}>Real Dice</Text><Text style={styles.subtitle}>Roll physical dice. This app keeps everyone’s scorecard.</Text>
    <View style={styles.countRow}><Pressable accessibilityLabel="Remove player" disabled={setupNames.length === 1} onPress={() => changePlayerCount(-1)} style={styles.countButton}><Ionicons name="remove" size={22} color={colors.cyan} /></Pressable><View><Text style={styles.count}>{setupNames.length}</Text><Text style={styles.countLabel}>{setupNames.length === 1 ? 'player' : 'players'}</Text></View><Pressable accessibilityLabel="Add player" disabled={setupNames.length === 6} onPress={() => changePlayerCount(1)} style={styles.countButton}><Ionicons name="add" size={22} color={colors.cyan} /></Pressable></View>
    <View style={styles.nameList}>{setupNames.map((name, index) => <View key={index} style={styles.nameRow}><View style={styles.playerNumber}><Text style={styles.playerNumberText}>{index + 1}</Text></View><TextInput accessibilityLabel={`Player ${index + 1} name`} value={name} onChangeText={(value) => setSetupNames((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} placeholder={`Player ${index + 1}`} placeholderTextColor={colors.muted} maxLength={18} style={styles.nameInput} /></View>)}</View>
    <Pressable onPress={startGame} style={styles.startButton}><Ionicons name="play" size={18} color={colors.background} /><Text style={styles.startText}>Start Scorecard</Text></Pressable>
    <Text style={styles.remembered}><Ionicons name="bookmark-outline" size={13} color={colors.muted} /> Names are remembered for your next game.</Text>
  </ScrollView>;

  return <View style={styles.container}>
    <View style={styles.gameHeader}><View><Text style={styles.eyebrow}>{complete ? 'Final standings' : `Turn ${active.scores.length + 1} of ${categories.length}`}</Text><Text style={styles.activeName}>{complete ? `${leaders[0].name} wins` : `${active.name}'s turn`}</Text></View><View style={styles.totalPill}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{totalScore(active.scores)}</Text></View></View>
    {selectedCategory && !complete && <View style={styles.scoreBar}><View style={styles.scoreBarCopy}><Text numberOfLines={1} style={styles.scoreCategory}>{selectedCategory}</Text><Text style={styles.scoreHint}>Enter 0–{maximumScore[selectedCategory]}</Text></View><TextInput autoFocus keyboardType="number-pad" value={scoreText} onChangeText={setScoreText} placeholder="0" placeholderTextColor={colors.muted} maxLength={2} selectTextOnFocus style={styles.scoreInput} /><Pressable disabled={scoreText === ''} onPress={recordScore} style={[styles.lockButton, scoreText === '' && styles.disabled]}><Ionicons name="checkmark" size={18} color={colors.background} /><Text style={styles.lockText}>Save</Text></Pressable></View>}
    {complete ? <ScrollView contentContainerStyle={styles.results}>{leaders.map((player, index) => <View key={player.id} style={[styles.resultRow, index === 0 && styles.winnerRow]}><Text style={styles.position}>{index + 1}</Text><Text style={styles.resultName}>{player.name}</Text><Text style={styles.resultScore}>{totalScore(player.scores)}</Text></View>)}<Pressable onPress={() => setShowScorecard(true)} style={styles.outlineButton}><Ionicons name="list-outline" size={17} color={colors.cyan} /><Text style={styles.outlineText}>View Scorecards</Text></Pressable><Pressable onPress={resetGame} style={styles.startButton}><Text style={styles.startText}>New Game</Text></Pressable></ScrollView> : <ScrollView contentContainerStyle={styles.gameContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.instruction}>Choose a category, then enter the score.</Text>
      <View style={styles.categoryGrid}>{categories.map((category) => { const entry = active.scores.find((item) => item.category === category); const selected = selectedCategory === category; return <Pressable key={category} disabled={Boolean(entry)} onPress={() => { setSelectedCategory(category); setScoreText(''); }} style={[styles.category, category === 'Chance' && styles.chanceCategory, entry && styles.usedCategory, selected && styles.selectedCategory]}><Text numberOfLines={2} style={[styles.categoryName, entry && styles.usedText]}>{shortLabels[category]}</Text><Text style={[styles.categoryScore, entry && styles.usedText]}>{entry?.score ?? '—'}</Text></Pressable>; })}</View>
      <View style={styles.actions}><Pressable onPress={() => setShowScorecard(true)} style={styles.outlineButton}><Ionicons name="list-outline" size={17} color={colors.cyan} /><Text style={styles.outlineText}>All Scores</Text></Pressable><Pressable onPress={resetGame} hitSlop={10} style={styles.resetButton}><Ionicons name="close-circle-outline" size={14} color={colors.muted} /><Text style={styles.resetText}>End game</Text></Pressable></View>
    </ScrollView>}

    <Modal transparent animationType="slide" visible={showScorecard} onRequestClose={() => setShowScorecard(false)}><View style={styles.modalBackdrop}><Pressable style={styles.dismissArea} onPress={() => setShowScorecard(false)} /><SafeAreaView style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Scorecards</Text><Text style={styles.sheetSubtitle}>{players.length} players</Text></View><Pressable onPress={() => setShowScorecard(false)} style={styles.closeButton}><Ionicons name="close" size={21} color={colors.white} /></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playerTabs}>{players.map((player, index) => <Pressable key={player.id} onPress={() => setViewingPlayer(index)} style={[styles.playerTab, viewingPlayer === index && styles.playerTabActive]}><Text style={[styles.playerTabText, viewingPlayer === index && styles.playerTabTextActive]}>{player.name}</Text></Pressable>)}</ScrollView><ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>{categories.map((category) => { const entry = players[viewingPlayer].scores.find((item) => item.category === category); return <View key={category} style={styles.sheetRow}><Text style={styles.sheetCategory}>{category}</Text><Text style={styles.sheetScore}>{entry?.score ?? '—'}</Text></View>; })}<View style={styles.bonusRow}><Text style={styles.bonusText}>Upper bonus</Text><Text style={styles.bonusScore}>{upperSectionBonus(players[viewingPlayer].scores) || '—'}</Text></View><View style={styles.sheetTotal}><Text style={styles.sheetTotalLabel}>Total</Text><Text style={styles.sheetTotalValue}>{totalScore(players[viewingPlayer].scores)}</Text></View></ScrollView></SafeAreaView></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, setup: { padding: 20, paddingBottom: 40, alignItems: 'center' }, setupIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#173033', alignItems: 'center', justifyContent: 'center', marginTop: 10 }, title: { color: colors.yellow, fontSize: 27, fontWeight: '900', marginTop: 10 }, subtitle: { color: colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 5, maxWidth: 320 }, countRow: { width: 210, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }, countButton: { width: 43, height: 43, borderRadius: 22, borderColor: '#315a5e', borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, count: { color: colors.yellow, textAlign: 'center', fontSize: 25, fontWeight: '900' }, countLabel: { color: colors.muted, fontSize: 10, textAlign: 'center' }, nameList: { width: '100%', gap: 8, marginTop: 18 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, playerNumber: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#34202f', alignItems: 'center', justifyContent: 'center' }, playerNumberText: { color: colors.pink, fontWeight: '900' }, nameInput: { flex: 1, backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.white, fontWeight: '800' }, startButton: { minWidth: 190, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cyan, borderRadius: 12, padding: 13, marginTop: 18 }, startText: { color: colors.background, fontWeight: '900' }, remembered: { color: colors.muted, fontSize: 10, marginTop: 11 }, gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderBottomColor: '#253438', borderBottomWidth: 1 }, eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, activeName: { color: colors.yellow, fontSize: 22, fontWeight: '900', marginTop: 2 }, totalPill: { backgroundColor: '#173033', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 7, alignItems: 'center' }, totalLabel: { color: colors.muted, fontSize: 9, textTransform: 'uppercase' }, totalValue: { color: colors.cyan, fontSize: 18, fontWeight: '900' }, gameContent: { padding: 16, paddingBottom: 24 }, instruction: { color: colors.muted, fontSize: 12, marginBottom: 9 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7 }, category: { width: '32%', minHeight: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 9, paddingHorizontal: 8 }, chanceCategory: { marginLeft: '34%' }, selectedCategory: { borderColor: colors.pink, borderWidth: 2, backgroundColor: '#34202f' }, usedCategory: { opacity: 0.45 }, categoryName: { color: colors.mint, flex: 1, fontSize: 10.5, fontWeight: '800' }, categoryScore: { color: colors.yellow, fontWeight: '900' }, usedText: { color: colors.muted }, actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }, outlineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderColor: '#315a5e', borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 }, outlineText: { color: colors.cyan, fontSize: 11, fontWeight: '800' }, resetButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 5 }, resetText: { color: colors.muted, fontSize: 11 }, scoreBar: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 12, marginTop: 8, backgroundColor: '#162326', borderColor: colors.pink, borderWidth: 1, borderRadius: 14, padding: 10 }, scoreBarCopy: { flex: 1, minWidth: 0 }, scoreCategory: { color: colors.white, fontWeight: '900', fontSize: 12 }, scoreHint: { color: colors.muted, fontSize: 9, marginTop: 2 }, scoreInput: { width: 58, backgroundColor: colors.background, borderColor: '#405055', borderWidth: 1, borderRadius: 9, padding: 8, color: colors.yellow, textAlign: 'center', fontSize: 18, fontWeight: '900' }, lockButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cyan, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10 }, lockText: { color: colors.background, fontWeight: '900' }, disabled: { opacity: 0.4 }, results: { padding: 16, alignItems: 'center' }, resultRow: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: '#2d3c40', borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 8 }, winnerRow: { borderColor: colors.yellow }, position: { color: colors.pink, fontWeight: '900', width: 35 }, resultName: { color: colors.mint, fontWeight: '800', flex: 1 }, resultScore: { color: colors.yellow, fontSize: 19, fontWeight: '900' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end', padding: 8, paddingBottom: 10 }, dismissArea: { flex: 1 }, sheet: { maxHeight: '86%', backgroundColor: colors.surface, borderRadius: 22, borderColor: '#315a5e', borderWidth: 1, overflow: 'hidden', paddingTop: 7 }, handle: { width: 38, height: 4, backgroundColor: '#45565a', borderRadius: 2, alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }, sheetTitle: { color: colors.yellow, fontSize: 22, fontWeight: '900' }, sheetSubtitle: { color: colors.muted, fontSize: 10 }, closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#263337', alignItems: 'center', justifyContent: 'center' }, playerTabs: { paddingHorizontal: 14, gap: 5, paddingBottom: 7 }, playerTab: { borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: colors.background }, playerTabActive: { backgroundColor: '#20383b', borderColor: colors.cyan, borderWidth: 1 }, playerTabText: { color: colors.muted, fontSize: 11, fontWeight: '800' }, playerTabTextActive: { color: colors.cyan }, sheetScroll: { flexShrink: 1 }, sheetContent: { paddingHorizontal: 16, paddingBottom: 16 }, sheetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomColor: '#2a3639', borderBottomWidth: 1 }, sheetCategory: { color: colors.mint, fontSize: 12 }, sheetScore: { color: colors.yellow, fontSize: 12, fontWeight: '900' }, bonusRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }, bonusText: { color: colors.muted }, bonusScore: { color: colors.cyan, fontWeight: '900' }, sheetTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopColor: colors.cyan, borderTopWidth: 1, marginTop: 8, paddingTop: 8 }, sheetTotalLabel: { color: colors.cyan, fontWeight: '900' }, sheetTotalValue: { color: colors.yellow, fontSize: 20, fontWeight: '900' },
});
