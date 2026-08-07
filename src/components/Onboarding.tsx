import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme';

const pages = [
  { icon: 'dice-outline' as const, eyebrow: 'WELCOME', title: 'Yahtzee, your way', copy: 'Play digitally, challenge the computer, share one phone, or keep score while using real dice.' },
  { icon: 'sunny-outline' as const, eyebrow: 'EVERY DAY', title: 'One shared challenge', copy: 'Everyone receives the same candidate dice. Your holds and category choices decide your place on today’s leaderboard.' },
  { icon: 'trophy-outline' as const, eyebrow: 'YOUR PROGRESS', title: 'Scores worth returning for', copy: 'Create an optional account to save results, build streaks, earn achievements and compete across web and mobile.' },
];

export function Onboarding({ visible, onFinish, onStartDaily }: { visible: boolean; onFinish: () => void; onStartDaily: () => void }) {
  const [page, setPage] = useState(0);
  const item = pages[page];
  return <Modal visible={visible} animationType="fade"><View style={styles.container}><View style={styles.dots}>{pages.map((_, index) => <View key={index} style={[styles.dot, index === page && styles.dotActive]} />)}</View><View style={styles.icon}><Ionicons name={item.icon} size={42} color={colors.yellow} /></View><Text style={styles.eyebrow}>{item.eyebrow}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.copy}>{item.copy}</Text><View style={styles.actions}>{page < pages.length - 1 ? <><Pressable onPress={onFinish} style={styles.quietButton}><Text style={styles.quietText}>Skip</Text></Pressable><Pressable onPress={() => setPage((value) => value + 1)} style={styles.primaryButton}><Text style={styles.primaryText}>Next</Text><Ionicons name="arrow-forward" size={18} color={colors.background} /></Pressable></> : <><Pressable onPress={onFinish} style={styles.quietButton}><Text style={styles.quietText}>Explore games</Text></Pressable><Pressable onPress={onStartDaily} style={styles.primaryButton}><Ionicons name="sunny" size={18} color={colors.background} /><Text style={styles.primaryText}>Play Daily</Text></Pressable></>}</View></View></Modal>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.background }, dots: { position: 'absolute', top: 65, flexDirection: 'row', gap: 7 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#344247' }, dotActive: { width: 24, backgroundColor: colors.cyan }, icon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderColor: '#555b1b', borderWidth: 1, backgroundColor: '#272b13' }, eyebrow: { color: colors.pink, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 24 }, title: { color: colors.yellow, fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 6 }, copy: { maxWidth: 360, color: colors.mint, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 12 }, actions: { position: 'absolute', left: 24, right: 24, bottom: 54, flexDirection: 'row', gap: 10 }, quietButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderColor: '#405055', borderWidth: 1, borderRadius: 14 }, quietText: { color: colors.mint, fontWeight: '900' }, primaryButton: { flex: 1.25, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: colors.cyan }, primaryText: { color: colors.background, fontWeight: '900' },
});
