import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { DieFace, rollDie } from '../lib/game';
import { colors } from '../theme';
import { defaultDiceAnimation, DiceAnimation } from '../lib/diceAnimation';

const pipCells: Record<DieFace, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function VirtualDie({ value, index, rollToken, reduceMotion, animation }: { value: DieFace; index: number; rollToken: number; reduceMotion: boolean; animation: DiceAnimation }) {
  const spin = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const sway = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!rollToken || reduceMotion) return;
    spin.setValue(0); lift.setValue(0); scale.setValue(animation === 'classic' ? 1 : animation === 'quickFlip' ? .82 : 1); sway.setValue(0);
    const classic = Animated.parallel([
      Animated.timing(spin, { toValue: 1, duration: 560 + index * 35, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([Animated.timing(lift, { toValue: -18 - (index % 3) * 4, duration: 190, useNativeDriver: true }), Animated.spring(lift, { toValue: 0, speed: 17, bounciness: 10, useNativeDriver: true })]),
    ]);
    const bounceSpin = Animated.parallel([Animated.timing(spin, { toValue: 1, duration: 820 + index * 35, easing: Easing.out(Easing.cubic), useNativeDriver: true }), Animated.sequence([Animated.timing(lift, { toValue: -46, duration: 250, useNativeDriver: true }), Animated.spring(lift, { toValue: 0, speed: 13, bounciness: 18, useNativeDriver: true })]), Animated.sequence([Animated.timing(scale, { toValue: 1.12, duration: 250, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 16, useNativeDriver: true })])]);
    const shake = Animated.sequence([-1, 1, -.85, .85, -.55, .55, 0].map((position) => Animated.timing(sway, { toValue: position, duration: 55, useNativeDriver: true })));
    const quickFlip = Animated.parallel([Animated.timing(spin, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }), Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true })]);
    (animation === 'bounceSpin' ? bounceSpin : animation === 'shake' ? shake : animation === 'quickFlip' ? quickFlip : classic).start();
  }, [animation, index, lift, reduceMotion, rollToken, scale, spin, sway]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', index % 2 ? '-720deg' : '720deg'] });
  const translateX = sway.interpolate({ inputRange: [-1, 1], outputRange: [-12, 12] });
  return <Animated.View accessibilityLabel={`Die ${index + 1}, ${value}`} style={[styles.die, { transform: [{ translateX }, { translateY: lift }, { rotate }, { scale }] }]}><View style={styles.pipGrid}>{Array.from({ length: 9 }, (_, cell) => <View key={cell} style={styles.pipCell}>{pipCells[value].includes(cell) && <View style={styles.pip} />}</View>)}</View></Animated.View>;
}

export function VirtualDiceScreen({ onOpenSettings, diceAnimation = defaultDiceAnimation }: { onOpenSettings?: () => void; diceAnimation?: DiceAnimation }) {
  const [dice, setDice] = useState<DieFace[]>([1]);
  const [rollToken, setRollToken] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  const changeCount = (delta: number) => setDice((current) => {
    const count = Math.max(1, Math.min(2, current.length + delta));
    return Array.from({ length: count }, (_, index) => current[index] ?? 1);
  });
  const roll = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDice((current) => current.map(() => rollDie())); setRollToken((token) => token + 1);
  };
  return <ScrollView contentContainerStyle={styles.container}>
    <View style={styles.icon}><Ionicons name="dice-outline" size={32} color={colors.cyan} /></View><Text style={styles.title}>Virtual Dice</Text><Text style={styles.subtitle}>Choose how many dice you need, then roll them for any tabletop game.</Text>
    <View style={styles.counter} accessibilityLabel={`${dice.length} ${dice.length === 1 ? 'die' : 'dice'}`}><Pressable accessibilityRole="button" accessibilityLabel="Remove a die" disabled={dice.length === 1} onPress={() => changeCount(-1)} style={[styles.countButton, dice.length === 1 && styles.disabled]}><Ionicons name="remove" size={25} color={colors.cyan} /></Pressable><View><Text style={styles.count}>{dice.length}</Text><Text style={styles.countLabel}>{dice.length === 1 ? 'die' : 'dice'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Add a die" disabled={dice.length === 2} onPress={() => changeCount(1)} style={[styles.countButton, dice.length === 2 && styles.disabled]}><Ionicons name="add" size={25} color={colors.cyan} /></Pressable></View>
    <View style={styles.tray}>{dice.map((value, index) => <VirtualDie key={index} value={value} index={index} rollToken={rollToken} reduceMotion={reduceMotion} animation={diceAnimation} />)}</View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Roll ${dice.length === 1 ? 'die' : `${dice.length} dice`}`} onPress={roll} style={({ pressed }) => [styles.rollButton, pressed && styles.pressed]}><Ionicons name="dice" size={23} color={colors.background} /><Text style={styles.rollText}>Roll {dice.length === 1 ? 'Die' : `${dice.length} Dice`}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose another game" onPress={onOpenSettings} style={styles.settingsButton}><Ionicons name="grid-outline" size={18} color={colors.cyan} /><Text style={styles.settingsText}>Choose Game</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingBottom: 48, alignItems: 'center' }, icon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', marginTop: 14, backgroundColor: '#173033' }, title: { color: colors.yellow, fontSize: 28, fontWeight: '900', marginTop: 11 }, subtitle: { maxWidth: 330, color: colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 6 },
  counter: { width: 220, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25 }, countButton: { width: 48, height: 48, borderRadius: 24, borderColor: colors.cyan, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10191b' }, disabled: { opacity: 0.35 }, count: { color: colors.yellow, textAlign: 'center', fontSize: 30, lineHeight: 32, fontWeight: '900' }, countLabel: { color: colors.muted, textAlign: 'center', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  tray: { width: '100%', minHeight: 190, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', gap: 13, padding: 18, marginTop: 22, borderColor: '#315057', borderWidth: 1, borderRadius: 18, backgroundColor: colors.surface }, die: { width: 62, height: 62, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 }, pipGrid: { width: 42, height: 42, flexDirection: 'row', flexWrap: 'wrap' }, pipCell: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }, pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background },
  rollButton: { width: '100%', minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, borderRadius: 14, backgroundColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 }, rollText: { color: colors.background, fontSize: 17, fontWeight: '900' }, settingsButton: { width: '100%', minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, borderRadius: 12, borderColor: '#315a5e', borderWidth: 1, backgroundColor: colors.surface }, settingsText: { color: colors.cyan, fontWeight: '900' }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
