import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { AppText as Text } from './AppText';
import { categories, Category, ScoreEntry, totalScore, upperCategories } from '../lib/game';
import { colors } from '../theme';

const names: Record<Category, string> = { Ones: 'Ones', Twos: 'Twos', Threes: 'Threes', Fours: 'Fours', Fives: 'Fives', Sixes: 'Sixes', 'Three of a Kind': '3 of a Kind', 'Four of a Kind': '4 of a Kind', 'Full House': 'Full House', 'Small Straight': 'Sm. Straight', 'Large Straight': 'Lg. Straight', Yahtzee: 'Yahtzee', Chance: 'Chance' };
const section = (scores: ScoreEntry[], upper: boolean) => scores.filter((entry) => upperCategories.includes(entry.category) === upper).reduce((sum, entry) => sum + entry.score, 0);
const bonus = (scores: ScoreEntry[]) => scores.reduce((sum, entry) => sum + (entry.yahtzeeBonus ?? 0), 0);

export function RemoteResultDetails({ mine, theirs, opponent }: { mine: ScoreEntry[]; theirs: ScoreEntry[]; opponent: string }) {
  const [width, setWidth] = useState(300);
  const max = Math.max(1, totalScore(mine), totalScore(theirs));
  const points = (scores: ScoreEntry[]) => Array.from({ length: 14 }, (_, round) => `${12 + round * (width - 24) / 13},${136 - totalScore(scores.slice(0, round)) * 120 / max}`).join(' ');
  const score = (scores: ScoreEntry[], category: Category) => scores.find((entry) => entry.category === category)?.score ?? 0;
  const row = (label: string, you: number, them: number, emphasis = false) => <View key={label} style={styles.row}><Text style={[styles.label, emphasis && styles.emphasis]}>{label}</Text><Text style={[styles.you, emphasis && styles.emphasis]}>{you}</Text><Text style={[styles.them, emphasis && styles.emphasis]}>{them}</Text></View>;
  return <View style={styles.container}>
    <Text style={styles.heading}>How the lead changed</Text>
    <Text style={styles.caption}>Cumulative scores after each completed round</Text>
    <View style={styles.legend}><Text style={styles.you}>● You</Text><Text style={styles.them}>● {opponent}</Text></View>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.chart}><Svg width={width} height={144}><Line x1="12" y1="136" x2={width - 12} y2="136" stroke="#466065" strokeWidth="1" /><Polyline points={points(mine)} fill="none" stroke={colors.cyan} strokeWidth="3" strokeLinejoin="round" /><Polyline points={points(theirs)} fill="none" stroke="#9dffb7" strokeWidth="3" strokeLinejoin="round" /></Svg></View>
    <View style={styles.axis}><Text style={styles.caption}>Start</Text><Text style={styles.caption}>Round 7</Text><Text style={styles.caption}>Round 13</Text></View>
    <View style={styles.card}><View style={styles.row}><Text style={styles.label}>Final scorecard</Text><Text style={styles.you}>You</Text><Text numberOfLines={1} style={styles.them}>{opponent}</Text></View>
      <Text style={styles.upperTitle}>UPPER SECTION</Text>{upperCategories.map((category) => row(names[category], score(mine, category), score(theirs, category)))}
      {row('Upper subtotal', section(mine, true), section(theirs, true), true)}
      {row('Upper bonus', section(mine, true) >= 63 ? 35 : 0, section(theirs, true) >= 63 ? 35 : 0, true)}
      <Text style={styles.lowerTitle}>LOWER SECTION</Text>{categories.slice(6).map((category) => row(names[category], score(mine, category), score(theirs, category)))}
      {row('Lower subtotal', section(mine, false), section(theirs, false), true)}
      {row('Extra Yahtzee bonuses', bonus(mine), bonus(theirs), true)}
      {row('TOTAL', totalScore(mine), totalScore(theirs), true)}
    </View>
  </View>;
}

const styles = StyleSheet.create({ container: { width: '100%', marginTop: 12 }, heading: { color: colors.yellow, fontWeight: '900', fontSize: 16 }, caption: { color: colors.muted, fontSize: 10, marginTop: 3 }, legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 }, chart: { width: '100%', marginTop: 5, backgroundColor: colors.background, borderRadius: 8 }, axis: { flexDirection: 'row', justifyContent: 'space-between' }, card: { marginTop: 15, padding: 10, backgroundColor: colors.background, borderColor: '#315a5e', borderWidth: 1, borderRadius: 11 }, row: { minHeight: 25, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#243236' }, label: { flex: 1.5, color: colors.mint, fontSize: 10 }, you: { flex: 1, color: colors.cyan, textAlign: 'center', fontWeight: '900', fontSize: 10 }, them: { flex: 1, color: '#9dffb7', textAlign: 'center', fontWeight: '900', fontSize: 10 }, emphasis: { color: colors.yellow, fontWeight: '900' }, upperTitle: { color: colors.cyan, fontWeight: '900', fontSize: 11, marginTop: 10, marginBottom: 4 }, lowerTitle: { color: colors.pink, fontWeight: '900', fontSize: 11, marginTop: 12, marginBottom: 4 } });
