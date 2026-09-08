import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText as Text } from '../components/AppText';
import { categories, Category, isCategoryEligibleForRoll, repeatYahtzeeBonus, scoreCategoryForTurn, totalScore } from '../lib/game';
import { resultMetrics } from '../lib/engagement';
import { createGameResult } from '../services/gameResults';
import { createLiveGame, fetchLiveGame, fetchMyLiveGames, joinLiveGame, LiveGame, LiveGameAction, subscribeToLiveGame, updateLiveGame } from '../services/liveGames';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

const activeGameKey = 'yahtzee.live-game.active.v1';
const recordedPrefix = 'yahtzee.live-game.recorded.';
const labels: Record<Category, string> = { Ones: 'Ones', Twos: 'Twos', Threes: 'Threes', Fours: 'Fours', Fives: 'Fives', Sixes: 'Sixes', 'Three of a Kind': '3 of a Kind', 'Four of a Kind': '4 of a Kind', 'Full House': 'Full House', 'Small Straight': 'Sm. Straight', 'Large Straight': 'Lg. Straight', Yahtzee: 'Yahtzee', Chance: 'Chance' };
const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, held, disabled, onPress }: { value: number; held: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.die, held && styles.heldDie]}>{Array.from({ length: 9 }, (_, index) => <View key={index} style={styles.pipCell}>{pips[value]?.includes(index) && <View style={styles.pip} />}</View>)}</Pressable>;
}

export function LiveGameScreen({ requestedGameId, onClose, onOpenAccount }: { requestedGameId?: string | null; onClose: () => void; onOpenAccount: () => void }) {
  const { user } = useAuth();
  const [game, setGame] = useState<LiveGame | null>(null);
  const [resumeGames, setResumeGames] = useState<LiveGame[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');

  const loadLobby = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const storedId = requestedGameId || await AsyncStorage.getItem(activeGameKey);
      if (storedId) {
        try { const active = await fetchLiveGame(storedId); setGame(active); return; } catch { await AsyncStorage.removeItem(activeGameKey); }
      }
      setResumeGames(await fetchMyLiveGames());
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load remote games.'); }
    finally { setLoading(false); }
  }, [requestedGameId, user]);

  useEffect(() => { void loadLobby(); }, [loadLobby]);
  useEffect(() => {
    if (!game || !['WAITING', 'ACTIVE'].includes(game.status)) return;
    let cancelled = false;
    let liveSubscription: { unsubscribe: () => void } | undefined;
    const accept = (latest: LiveGame) => { if (!cancelled) { setGame((current) => !current || latest.updatedAt >= current.updatedAt ? latest : current); setError(''); } };
    const refresh = async () => { try { const latest = await fetchLiveGame(game.id); if (!cancelled) { setGame((current) => !current || latest.updatedAt >= current.updatedAt ? latest : current); setError(''); } } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Connection interrupted. Retrying…'); } };
    void subscribeToLiveGame(game.id, accept, (caught) => { if (!cancelled) { setError(caught.message); void refresh(); } }).then((value) => { if (cancelled) value.unsubscribe(); else liveSubscription = value; }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Live updates were interrupted. Retrying…'); });
    const timer = setInterval(() => void refresh(), 5000);
    const appStateSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { cancelled = true; clearInterval(timer); appStateSubscription.remove(); liveSubscription?.unsubscribe(); };
  }, [game?.id, game?.status]);

  useEffect(() => {
    if (!game || game.status !== 'COMPLETED' || !user) return;
    const record = async () => {
      const key = `${recordedPrefix}${game.id}.${user.userId}`;
      if (await AsyncStorage.getItem(key)) return;
      const mine = user.userId === game.hostUserId ? game.hostScores : game.guestScores;
      const metrics = resultMetrics(mine);
      await createGameResult({ id: `remote-${game.id}-${user.userId}`, mode: 'REMOTE', modeDate: 'REMOTE#ALL', completedAt: game.updatedAt, challengeDate: undefined, yahtzeeOnFinalRoll: false, session: JSON.stringify({ liveGameId: game.id, opponent: user.userId === game.hostUserId ? game.guestUsername : game.hostUsername }), ...metrics });
      await AsyncStorage.setItem(key, 'true');
    };
    void record().catch(() => undefined);
  }, [game, user]);

  const openGame = async (next: LiveGame) => { setGame(next); setResumeGames([]); setError(''); await AsyncStorage.setItem(activeGameKey, next.id); };
  const create = async () => { setBusy(true); setError(''); try { await openGame(await createLiveGame()); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create a game.'); } finally { setBusy(false); } };
  const join = async () => { setBusy(true); setError(''); try { await openGame(await joinLiveGame(code)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to join that game.'); } finally { setBusy(false); } };
  const action = async (value: LiveGameAction) => { if (!game || busy) return; setBusy(true); setError(''); try { setGame(await updateLiveGame(game.id, value)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update the game.'); } finally { setBusy(false); } };
  const leave = () => Alert.alert('Leave remote game?', 'This ends the game for both players.', [{ text: 'Keep Playing', style: 'cancel' }, { text: 'Leave Game', style: 'destructive', onPress: () => void action({ type: 'LEAVE' }) }]);
  const closeGame = async () => { await AsyncStorage.removeItem(activeGameKey); setGame(null); setResumeGames([]); void loadLobby(); };

  if (!user) return <View style={styles.center}><Ionicons name="people-outline" size={50} color={colors.cyan} /><Text style={styles.emptyTitle}>Sign in to play remotely</Text><Text style={styles.emptyCopy}>Remote games connect two accounts and can notify you when your turn begins.</Text><Pressable onPress={onOpenAccount} style={styles.primary}><Text style={styles.primaryText}>Open Account</Text></Pressable><Pressable onPress={onClose}><Text style={styles.link}>Back to Games</Text></Pressable></View>;
  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /><Text style={styles.emptyCopy}>Loading remote games…</Text></View>;

  if (!game) return <ScrollView contentContainerStyle={styles.content}>
    <View style={styles.topRow}><Pressable onPress={onClose} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.cyan} /></Pressable><View><Text style={styles.eyebrow}>TWO DEVICES</Text><Text style={styles.title}>Remote game</Text></View></View>
    <View style={styles.hero}><Ionicons name="phone-portrait-outline" size={28} color={colors.cyan} /><View style={styles.heroCopy}><Text style={styles.heroTitle}>Take turns from anywhere</Text><Text style={styles.copy}>Create a game to share its code, or enter a friend’s six-digit code.</Text></View></View>
    {resumeGames.map((item) => <Pressable key={item.id} onPress={() => void openGame(item)} style={styles.resumeCard}><View><Text style={styles.cardTitle}>{item.status === 'WAITING' ? 'Waiting for opponent' : `Game with ${item.hostUserId === user.userId ? item.guestUsername : item.hostUsername}`}</Text><Text style={styles.cardMeta}>Code {item.code} · {item.currentUserId === user.userId ? 'Your turn' : 'Their turn'}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.cyan} /></Pressable>)}
    <Pressable disabled={busy} onPress={() => void create()} style={[styles.createCard, busy && styles.disabled]}><View style={styles.createIcon}><Ionicons name="add" size={25} color={colors.background} /></View><View style={styles.heroCopy}><Text style={styles.createTitle}>Start a game</Text><Text style={styles.copy}>Get a code and invite another player.</Text></View></Pressable>
    <View style={styles.joinCard}><Text style={styles.cardTitle}>Join with a code</Text><TextInput accessibilityLabel="Six-digit game code" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={colors.muted} style={styles.codeInput} /><Pressable disabled={busy || code.length !== 6} onPress={() => void join()} style={[styles.primary, (busy || code.length !== 6) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Joining…' : 'Join Game'}</Text></Pressable></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView>;

  const mine = user.userId === game.hostUserId ? game.hostScores : game.guestScores;
  const theirs = user.userId === game.hostUserId ? game.guestScores : game.hostScores;
  const opponent = user.userId === game.hostUserId ? game.guestUsername : game.hostUsername;
  const myTurn = game.status === 'ACTIVE' && game.currentUserId === user.userId;
  const actingScores = game.currentUserId === game.hostUserId ? game.hostScores : game.guestScores;
  const eligible = (category: Category) => game.hasRolled && isCategoryEligibleForRoll(category, game.dice, mine);
  const myTotal = totalScore(mine); const theirTotal = totalScore(theirs);
  const turnBonus = repeatYahtzeeBonus(mine, game.dice);
  const outcome = game.status === 'COMPLETED' ? game.winnerUserId === null ? 'Draw game' : game.winnerUserId === user.userId ? 'You won!' : `${opponent} won` : game.status === 'ABANDONED' ? game.endedByUserId === user.userId ? 'You left the game' : `${opponent ?? 'Your opponent'} left` : '';

  if (game.status === 'WAITING') return <View style={styles.center}><View style={styles.waitIcon}><Ionicons name="hourglass-outline" size={34} color={colors.yellow} /></View><Text style={styles.emptyTitle}>Waiting for another player</Text><Text style={styles.emptyCopy}>Share this code with a signed-in friend:</Text><Text accessibilityLabel={`Game code ${game.code.split('').join(' ')}`} style={styles.bigCode}>{game.code}</Text><Pressable onPress={() => void Share.share({ title: 'Join my Yahtzee game', message: `Join my Yahtzee Hub remote game with code ${game.code}.` })} style={styles.primary}><Ionicons name="share-outline" size={18} color={colors.background} /><Text style={styles.primaryText}>Share Code</Text></Pressable><Pressable onPress={leave} style={styles.dangerButton}><Text style={styles.dangerText}>Cancel Game</Text></Pressable>{error ? <Text style={styles.error}>{error}</Text> : null}</View>;

  if (game.status === 'COMPLETED' || game.status === 'ABANDONED') return <ScrollView contentContainerStyle={styles.content}><View style={styles.resultCard}><Ionicons name={game.status === 'COMPLETED' ? 'trophy-outline' : 'exit-outline'} size={42} color={game.status === 'COMPLETED' ? colors.yellow : colors.pink} /><Text style={styles.emptyTitle}>{outcome}</Text>{game.status === 'COMPLETED' && <Text style={styles.resultScore}>{myTotal} – {theirTotal}</Text>}<Text style={styles.emptyCopy}>{game.hostUsername} vs {game.guestUsername}</Text><Pressable onPress={() => void closeGame()} style={styles.primary}><Text style={styles.primaryText}>Back to Remote Games</Text></Pressable></View></ScrollView>;

  return <View style={styles.game}><View style={styles.gameHeader}><View><Text style={styles.eyebrow}>REMOTE · ROUND {game.round}</Text><Text style={styles.turnTitle}>{myTurn ? 'Your turn' : `${opponent}’s turn`}</Text></View><Pressable accessibilityLabel="Leave remote game" onPress={leave} style={styles.leave}><Ionicons name="exit-outline" size={20} color={colors.pink} /></Pressable></View>
    <View style={styles.scoreStrip}><View><Text style={styles.scoreName}>YOU</Text><Text style={styles.scoreValue}>{myTotal}</Text></View><Text style={styles.versus}>VS</Text><View style={styles.rightScore}><Text numberOfLines={1} style={styles.scoreName}>{opponent?.toUpperCase()}</Text><Text style={styles.scoreValue}>{theirTotal}</Text></View></View>
    <View style={[styles.liveNotice, !myTurn && styles.watchNotice]}><View style={styles.liveDot} /><Text style={styles.liveText}>{myTurn ? 'Your opponent can watch this turn live' : `${opponent} is ${game.hasRolled ? game.selectedCategory ? `previewing ${labels[game.selectedCategory]}` : 'choosing dice' : 'getting ready'}`}</Text></View>
    <View style={styles.diceRow}>{game.dice.map((die, index) => <Die key={index} value={die} held={game.held.includes(index)} disabled={!myTurn || !game.hasRolled || busy} onPress={() => void action({ type: 'TOGGLE_HOLD', index })} />)}</View>
    <View style={styles.rollMeta}><Text style={styles.copy}>{game.rollsLeft} rolls remaining</Text>{busy && <ActivityIndicator size="small" color={colors.cyan} />}</View>
    {myTurn && <Pressable disabled={busy || game.rollsLeft === 0} onPress={() => void action({ type: 'ROLL' })} style={[styles.rollButton, (busy || game.rollsLeft === 0) && styles.disabled]}><Ionicons name="dice" size={21} color={colors.background} /><Text style={styles.rollText}>{game.hasRolled ? 'Roll Again' : 'Roll Dice'}</Text></Pressable>}
    <ScrollView contentContainerStyle={styles.categories}><Text style={styles.categoryHeading}>{myTurn ? 'Choose a category' : 'Opponent’s scorecard'}</Text><View style={styles.categoryGrid}>{categories.map((category) => { const entry = (myTurn ? mine : actingScores).find((item) => item.category === category); const available = myTurn && eligible(category); const preview = available ? scoreCategoryForTurn(category, game.dice, mine) : 0; const selected = game.selectedCategory === category; return <Pressable key={category} disabled={!available || busy} onPress={() => void action({ type: 'SELECT_CATEGORY', category })} style={[styles.category, entry && styles.usedCategory, selected && styles.selectedCategory]}><Text numberOfLines={1} style={styles.categoryName}>{labels[category]}</Text><Text style={styles.categoryScore}>{entry?.score ?? (available ? preview : '—')}</Text></Pressable>; })}</View></ScrollView>
    {myTurn && game.selectedCategory && <View style={styles.lockBar}><View><Text style={styles.cardTitle}>{labels[game.selectedCategory]}</Text><Text style={styles.cardMeta}>{scoreCategoryForTurn(game.selectedCategory, game.dice, mine)} category{turnBonus ? ` + ${turnBonus} bonus = ${scoreCategoryForTurn(game.selectedCategory, game.dice, mine) + turnBonus} total` : ' points'}</Text></View><Pressable disabled={busy} onPress={() => void action({ type: 'LOCK_CATEGORY', category: game.selectedCategory! })} style={styles.lockButton}><Ionicons name="lock-closed" size={16} color={colors.background} /><Text style={styles.lockText}>Lock In</Text></Pressable></View>}
    {error ? <Text style={styles.floatingError}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }, topRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 }, back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#315a5e' }, eyebrow: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, title: { color: colors.yellow, fontSize: 24, fontWeight: '900' }, hero: { flexDirection: 'row', gap: 12, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#315a5e', backgroundColor: colors.surface }, heroCopy: { flex: 1 }, heroTitle: { color: colors.yellow, fontSize: 15, fontWeight: '900' }, copy: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3 }, createCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 13, padding: 15, borderRadius: 14, backgroundColor: '#24270f', borderWidth: 1, borderColor: colors.yellow }, createIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.yellow }, createTitle: { color: colors.yellow, fontSize: 16, fontWeight: '900' }, joinCard: { marginTop: 13, padding: 15, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#315a5e' }, cardTitle: { color: colors.white, fontSize: 13, fontWeight: '900' }, cardMeta: { color: colors.muted, fontSize: 10, marginTop: 2 }, codeInput: { height: 54, marginTop: 10, borderRadius: 11, borderWidth: 1, borderColor: '#315a5e', backgroundColor: colors.background, color: colors.yellow, fontSize: 25, fontWeight: '900', letterSpacing: 8, textAlign: 'center' }, primary: { minHeight: 46, marginTop: 12, paddingHorizontal: 18, borderRadius: 11, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cyan }, primaryText: { color: colors.background, fontWeight: '900' }, disabled: { opacity: .42 }, error: { color: colors.danger, textAlign: 'center', marginTop: 12 }, link: { color: colors.cyan, fontWeight: '800', marginTop: 18 }, emptyTitle: { color: colors.yellow, fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: 12 }, emptyCopy: { color: colors.mint, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 }, waitIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#292c13', alignItems: 'center', justifyContent: 'center' }, bigCode: { color: colors.yellow, fontSize: 38, fontWeight: '900', letterSpacing: 9, marginTop: 13 }, dangerButton: { padding: 12, marginTop: 8 }, dangerText: { color: colors.pink, fontWeight: '900' }, resumeCard: { minHeight: 66, marginTop: 10, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, backgroundColor: colors.surface, borderColor: '#315a5e', borderWidth: 1 }, resultCard: { alignItems: 'center', marginTop: 40, padding: 22, borderRadius: 18, borderWidth: 1, borderColor: colors.yellow, backgroundColor: colors.surface }, resultScore: { color: colors.cyan, fontSize: 38, fontWeight: '900', marginTop: 8 }, game: { flex: 1 }, gameHeader: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, turnTitle: { color: colors.yellow, fontSize: 20, fontWeight: '900' }, leave: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, scoreStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surface }, rightScore: { alignItems: 'flex-end', maxWidth: '40%' }, scoreName: { color: colors.muted, fontSize: 8, fontWeight: '900' }, scoreValue: { color: colors.cyan, fontSize: 19, fontWeight: '900' }, versus: { color: colors.pink, fontSize: 11, fontWeight: '900' }, liveNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginHorizontal: 14, marginTop: 8, padding: 7, borderRadius: 9, backgroundColor: '#142528' }, watchNotice: { backgroundColor: '#28162a' }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.cyan }, liveText: { color: colors.mint, fontSize: 10, fontWeight: '800' }, diceRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 }, die: { width: 50, height: 50, flexDirection: 'row', flexWrap: 'wrap', borderRadius: 9, borderWidth: 2, borderColor: colors.cyan, backgroundColor: colors.cyan, padding: 6 }, heldDie: { borderColor: colors.pink, backgroundColor: colors.yellow, transform: [{ translateY: -4 }] }, pipCell: { width: 11.3, height: 11.3, alignItems: 'center', justifyContent: 'center' }, pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.background }, rollMeta: { minHeight: 25, marginHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, rollButton: { minHeight: 45, marginHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 11, backgroundColor: colors.cyan }, rollText: { color: colors.background, fontSize: 15, fontWeight: '900' }, categories: { padding: 14, paddingBottom: 84 }, categoryHeading: { color: colors.cyan, fontSize: 17, fontWeight: '900', marginBottom: 8 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 }, category: { width: '32%', minHeight: 44, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#2d3c40', backgroundColor: colors.surface }, usedCategory: { opacity: .45 }, selectedCategory: { borderColor: colors.pink, borderWidth: 2, backgroundColor: '#34202f' }, categoryName: { flex: 1, color: colors.mint, fontSize: 9, fontWeight: '800' }, categoryScore: { color: colors.yellow, fontSize: 11, fontWeight: '900' }, lockBar: { position: 'absolute', left: 14, right: 14, bottom: 10, minHeight: 64, padding: 10, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, borderColor: colors.cyan, backgroundColor: '#162326' }, lockButton: { minHeight: 43, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, backgroundColor: colors.cyan }, lockText: { color: colors.background, fontWeight: '900' }, floatingError: { position: 'absolute', left: 16, right: 16, bottom: 80, padding: 8, color: colors.white, textAlign: 'center', borderRadius: 8, backgroundColor: colors.danger },
});
