import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme';
import { ScreenHeader } from '../components/ScreenHeader';

const rules = [
  'Roll all five dice at the start of your turn.',
  'Tap dice to hold them before the next roll.',
  'Re-roll unheld dice up to two more times.',
  'Choose one unused scoring category after rolling.',
];

const scoring = [
  ['Ones–Sixes', 'Add dice showing that number.'], ['Three/Four of a Kind', 'Score all dice with enough matching values.'],
  ['Full House', 'Three of one value and two of another scores 25.'], ['Small/Large Straight', 'Four or five consecutive values score 30 or 40.'],
  ['Yahtzee', 'Five matching dice score 50.'], ['Chance', 'Add all five dice.'],
];

export function AboutScreen() {
  return <ScrollView contentContainerStyle={styles.content}>
    <ScreenHeader title="About Yahtzee" />
    <View style={styles.introRow}><Ionicons name="dice-outline" size={25} color={colors.cyan} /><Text style={styles.intro}>Roll the best combinations, choose categories wisely, and chase the highest score.</Text></View>
    <Text style={styles.heading}>How to Play</Text>
    {rules.map((rule, index) => <Text key={rule} style={styles.rule}>{index + 1}. {rule}</Text>)}
    <Text style={styles.heading}>Scoring Categories</Text>
    {scoring.map(([name, description]) => <View key={name} style={styles.card}><Text style={styles.name}>{name}</Text><Text style={styles.description}>{description}</Text></View>)}
    <View style={styles.tip}><Ionicons name="bulb-outline" size={22} color={colors.pink} /><Text style={styles.tipText}>Strategy tip: a zero can be useful when it protects a stronger category for a later round.</Text></View>
    <View style={styles.footerRow}><Ionicons name="sparkles" size={20} color={colors.pink} /><Text style={styles.footer}>Good luck and happy rolling!</Text></View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 }, introRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, intro: { color: colors.mint, lineHeight: 23, flex: 1 }, heading: { color: colors.pink, fontSize: 22, fontWeight: '900', marginTop: 25, marginBottom: 12 }, rule: { color: colors.mint, lineHeight: 25, marginBottom: 5 }, card: { backgroundColor: colors.surface, borderLeftColor: colors.cyan, borderLeftWidth: 3, padding: 13, marginBottom: 8, borderRadius: 8 }, name: { color: colors.yellow, fontWeight: '900' }, description: { color: colors.mint, marginTop: 4 }, tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderColor: colors.pink, borderWidth: 1, borderRadius: 12, padding: 15, marginTop: 16 }, tipText: { color: colors.mint, lineHeight: 22, flex: 1 }, footerRow: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', marginTop: 24 }, footer: { color: colors.pink, fontWeight: '900' },
});
